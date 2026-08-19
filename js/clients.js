/* Campaign OS — Clientes
   ============================================================
   La gente del lado del cliente vivía SOLO dentro de la campaña, en
   `campaign.clientContacts`. Eso alcanzaba mientras la pregunta fuera "¿quién
   es el contacto de esta campaña?", pero no responde las que importan cuando
   hay movimiento:

     · ¿Quién es Roberto y en qué campañas estuvo?
     · Se fue de All Body Deo, ¿qué sabíamos de él?
     · ¿Con quién nos conviene hablar en esta cuenta?

   Al borrarlo de la campaña se borraba también todo lo que sabíamos de él. Aquí
   la persona pasa a ser un documento propio, con su historial de campañas, y
   salir de una campaña CIERRA un periodo en vez de borrar a nadie.

   Dos colecciones, y están separadas a propósito:

     workspaces/{ws}/clients      → el directorio. Lo lee todo el equipo.
     workspaces/{ws}/clientNotes  → las reseñas. Sólo Cuentas y admins.

   Las reseñas no son una subcolección de `clients` porque la regla amplia de
   Firestore (`/workspaces/{ws}/{coll}/{doc=**}`) deja leer todo lo que cuelgue
   de una colección, así que una subcolección quedaría abierta a todos igual.
   Como colección hermana sí se puede excluir por nombre. Ver firestore.rules.
   ============================================================ */

const CLIENT_POC = [
  { id: 'principal', label: 'POC principal' },
  { id: 'secundario', label: 'POC secundario' },
  { id: 'na',         label: 'Sin definir'   },
];

let _clientesQuery   = '';
let _clientesFiltro  = 'activos';   // activos | inactivos | todos
let _clienteAbierto  = null;

/* Quién ve y escribe reseñas. Mismo criterio que la info privada de creadores,
   que ya existía: el área dueña del dato, más los admins. Esto es la mitad de
   la cerradura — la otra mitad está en firestore.rules, porque una condición
   en el navegador no le impide nada a quien abra la consola. */
function puedeVerResenasCliente() {
  if (typeof isAdmin === 'function' && isAdmin()) return true;
  const a = String((currentUserProfile && currentUserProfile.area) || '').toLowerCase();
  return a === 'cuentas';
}

/* La llave de una persona. El correo es lo único que se mantiene igual cuando
   cambia de campaña, de puesto o de marca; sin correo se cae al nombre. Se
   normaliza para que "Roberto Díaz" y "roberto díaz " no sean dos personas. */
function _clientKey(name, email) {
  const e = String(email || '').trim().toLowerCase();
  if (e) return 'e_' + e.replace(/[^a-z0-9]+/g, '_');
  return 'n_' + String(name || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_');
}

function _hoyISO() { return new Date().toISOString().slice(0, 10); }
function _clientsCol() { return db.collection('workspaces').doc(WORKSPACE).collection('clients'); }
function _notesCol()   { return db.collection('workspaces').doc(WORKSPACE).collection('clientNotes'); }

function getClientes() { return Array.isArray(_cache.clients) ? _cache.clients : []; }

/* ── Sincronización desde la campaña ──
   Se llama al guardar un contacto. Hace upsert de la persona y deja ABIERTO su
   periodo en esta campaña. Es idempotente: guardar dos veces no duplica el
   historial ni reabre lo cerrado. */
async function clienteUpsertDesdeCampana(contacto, campana) {
  if (!contacto || !contacto.name || !campana) return;
  const id = _clientKey(contacto.name, contacto.email);
  const previo = getClientes().find(c => c.id === id) || {};
  const historial = Array.isArray(previo.historial) ? previo.historial.slice() : [];

  const abierto = historial.find(h => h.campaignId === campana.id && !h.hasta);
  if (abierto) {
    abierto.campaignName = campana.name;
    abierto.empresa = campana.client || '';
    abierto.pocTipo = contacto.pocTipo || abierto.pocTipo || 'na';
  } else {
    historial.push({
      campaignId: campana.id,
      campaignName: campana.name,
      empresa: campana.client || '',
      pocTipo: contacto.pocTipo || 'na',
      desde: _hoyISO(),
      hasta: null,
    });
  }

  const doc = {
    id,
    name: contacto.name,
    cargo: contacto.cargo || previo.cargo || '',
    email: contacto.email || previo.email || '',
    linkedin: contacto.linkedin || previo.linkedin || '',
    empresa: campana.client || previo.empresa || '',
    pocTipo: contacto.pocTipo || previo.pocTipo || 'na',
    activo: true,
    historial,
    createdAt: previo.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  try {
    await _clientsCol().doc(id).set(doc, { merge: true });
  } catch (e) {
    console.warn('guardar cliente', e);
  }
}

/* Salir de una campaña CIERRA el periodo, no borra a la persona: el caso que
   este módulo existe para resolver es justamente "ya no está, ¿qué sabíamos?".
   Si no le queda ninguna campaña abierta pasa a inactivo, pero sigue estando. */
async function clienteCerrarEnCampana(contacto, campana) {
  if (!contacto || !contacto.name || !campana) return;
  const id = _clientKey(contacto.name, contacto.email);
  const previo = getClientes().find(c => c.id === id);
  if (!previo) return;

  const historial = (previo.historial || []).map(h =>
    (h.campaignId === campana.id && !h.hasta) ? { ...h, hasta: _hoyISO() } : h);
  const sigueEnAlguna = historial.some(h => !h.hasta);

  try {
    await _clientsCol().doc(id).set({ historial, activo: sigueEnAlguna, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn('cerrar cliente', e);
  }
}

/* ── Reseñas ──
   Se guardan en su propia colección y no se editan ni se borran: una reseña es
   lo que alguien pensó en un momento, y reescribirla después borra el rastro
   de por qué se decidió lo que se decidió. */
async function guardarResenaCliente(clientId, texto, estrellas) {
  if (!puedeVerResenasCliente()) {
    showToast('Las reseñas de clientes son del área de Cuentas.', 'error');
    return false;
  }
  const t = String(texto || '').trim();
  // Medias estrellas: 0.5 a 5 en pasos de media. Se comprueba el paso y no sólo
  // el rango, porque un 3.7 escrito a mano rompería la comparación entre
  // reseñas — deja de haber una escala común.
  const e = Number(estrellas);
  const valida = e >= 0.5 && e <= 5 && (e * 2) === Math.round(e * 2);
  // Las dos partes son obligatorias. Una calificación sin explicación no le
  // sirve a quien la lea después —"3 estrellas" no dice qué hacer distinto— y
  // un texto sin calificación no se puede comparar entre personas.
  if (!valida) { showToast('Elige de 0.5 a 5 estrellas.', 'error'); return false; }
  if (t.length < 10) { showToast('Escribe al menos una frase.', 'error'); return false; }
  const nota = {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    clientId,
    estrellas: e,
    texto: t,
    autorUid: currentUser.uid,
    autorNombre: (currentUserProfile && currentUserProfile.name) || currentUser.email,
    fecha: new Date().toISOString(),
  };
  try {
    await _notesCol().doc(nota.id).set(nota);
    return true;
  } catch (e) {
    if (typeof avisarError === 'function') avisarError(e, 'guardar la reseña', 'guardarResenaCliente');
    else showToast('No se pudo guardar la reseña', 'error');
    return false;
  }
}

/* Las reseñas se piden al abrir la ficha, no se mantienen en caché: quien no
   sea de Cuentas recibe permission-denied de Firestore y no hay que dejar el
   dato dando vueltas en memoria por si acaso. */
async function cargarResenasCliente(clientId) {
  if (!puedeVerResenasCliente()) return [];
  try {
    const snap = await _notesCol().where('clientId', '==', clientId).get();
    return snap.docs.map(d => d.data()).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  } catch (e) {
    console.warn('cargar reseñas', e);
    return [];
  }
}

/* ── Relleno inicial ──
   Los contactos que ya estaban dentro de las campañas nunca pasaron por el
   guardado nuevo, así que sin esto la pestaña arrancaría vacía aunque el
   equipo lleve meses capturando gente.

   Se recorre una vez al entrar y sólo se escribe a QUIEN FALTA: quien ya tiene
   ficha no se toca, para no pisar un pocTipo que alguien cambió desde la
   pestaña ni reabrir el periodo de alguien que ya salió.

   El periodo se abre con la fecha de inicio de la campaña, no con la de hoy:
   decir que Roberto entró a All Body Deo el día que corrimos la migración
   sería inventar un dato. */
async function rellenarClientesDesdeCampanas() {
  if (!currentUser) return;
  const yaHay = new Set(getClientes().map(c => c.id));
  const campanas = getData('campaigns') || [];
  const pendientes = [];

  campanas.forEach(c => {
    (c.clientContacts || []).forEach(ct => {
      if (!ct || !ct.name) return;
      const id = _clientKey(ct.name, ct.email);
      if (yaHay.has(id)) return;
      yaHay.add(id);                       // no repetir dentro de la misma pasada
      pendientes.push({ id, ct, c });
    });
  });
  if (!pendientes.length) return;

  for (const { id, ct, c } of pendientes) {
    try {
      await _clientsCol().doc(id).set({
        id,
        name: ct.name,
        cargo: ct.cargo || '',
        email: ct.email || '',
        linkedin: ct.linkedin || '',
        empresa: c.client || '',
        pocTipo: ct.pocTipo || 'na',
        activo: true,
        historial: [{
          campaignId: c.id, campaignName: c.name, empresa: c.client || '',
          pocTipo: ct.pocTipo || 'na', desde: c.startDate || _hoyISO(), hasta: null,
        }],
        createdAt: Date.now(), updatedAt: Date.now(),
      }, { merge: true });
    } catch (e) { console.warn('rellenar cliente', id, e); }
  }
}

/* Estrellas para leer. El dibujo lo hace starsHtml() de creators.js, que pinta
   relleno fraccionario — así un 3.5 se ve como tres y media y un promedio de
   3.7 se ve como 3.7, en vez de redondearse.

   El `aria-label` va en el contenedor y los glifos quedan ocultos al lector: si
   no, anuncia cinco caracteres sueltos en vez de "3.5 de 5". */
function _estrellasHtml(n) {
  const v = Math.max(0, Math.min(5, Number(n) || 0));
  const texto = Number.isInteger(v) ? v : v.toFixed(1);
  return `<span class="cli-estrellas" role="img" aria-label="${texto} de 5 estrellas">${starsHtml(v, 'sm')}</span>`;
}

/* El selector es el mismo de la base de creadores, con medias estrellas.
   Vive en creators.js junto a starsHtml() para que calificar sea una sola cosa
   en toda la app y no dos que se parezcan. */
function _estrellasInputHtml() {
  return `<fieldset class="cli-est-pick">
    <legend>¿Cómo fue trabajar con esta persona?</legend>
    ${starsPickerHtml('cliEstrellas', 0)}
  </fieldset>`;
}

// ============================================================
// PÁGINA
// ============================================================

function setClientesFiltro(f) { _clientesFiltro = f; renderClientes(); }
function setClientesQuery(v)  { _clientesQuery = String(v || '').toLowerCase().trim(); renderClientes(); }

function _pocChip(c) {
  const actual = CLIENT_POC.find(p => p.id === (c.pocTipo || 'na')) || CLIENT_POC[2];
  const opciones = CLIENT_POC.map(p =>
    `<option value="${p.id}" ${p.id === actual.id ? 'selected' : ''}>${p.label}</option>`).join('');
  return `<label class="cli-poc cli-poc--${actual.id}">
    <span class="cli-poc-txt">${actual.label}</span>
    <select aria-label="Tipo de contacto de ${_esc(c.name)}" onchange="cambiarPocCliente('${c.id}', this.value)">${opciones}</select>
  </label>`;
}

async function cambiarPocCliente(id, valor) {
  try {
    await _clientsCol().doc(id).set({ pocTipo: valor, updatedAt: Date.now() }, { merge: true });
    showToast('Tipo de contacto actualizado', 'success');
  } catch (e) {
    if (typeof avisarError === 'function') avisarError(e, 'cambiar el tipo de contacto', 'cambiarPocCliente');
  }
}

function renderClientes() {
  const cont = document.getElementById('clientesList');
  if (!cont) return;

  const todos = getClientes();
  const lista = todos.filter(c => {
    if (_clientesFiltro === 'activos'   && !c.activo) return false;
    if (_clientesFiltro === 'inactivos' &&  c.activo) return false;
    if (_clientesQuery) {
      const heno = [c.name, c.cargo, c.empresa, c.email,
                    ...(c.historial || []).map(h => h.campaignName)].join(' ').toLowerCase();
      if (!heno.includes(_clientesQuery)) return false;
    }
    return true;
  }).sort((a, b) => Number(!!b.activo) - Number(!!a.activo) || String(a.name).localeCompare(String(b.name)));

  // Contadores de las pestañas: se cuentan sobre TODOS, no sobre lo filtrado,
  // si no el número cambiaría al escribir en el buscador.
  const nAct = todos.filter(c => c.activo).length;
  const nIna = todos.length - nAct;
  const pestanas = document.getElementById('clientesTabs');
  if (pestanas) {
    pestanas.innerHTML = [
      ['activos',   'Activos',   nAct],
      ['inactivos', 'Anteriores', nIna],
      ['todos',     'Todos',     todos.length],
    ].map(([id, label, n]) =>
      `<button class="metrics-tab-pill ${_clientesFiltro === id ? 'active' : ''}" onclick="setClientesFiltro('${id}')">${label} · ${n}</button>`).join('');
  }

  if (!todos.length) {
    cont.innerHTML = `<div class="card"><div class="empty-state">
      <div class="empty-icon">${ICN_users}</div>
      <p>Todavía no hay clientes. Se agregan solos cuando pones un contacto en una campaña,
      en <strong>Campañas → una campaña → Clientes · puntos de contacto</strong>.</p>
    </div></div>`;
    return;
  }
  if (!lista.length) {
    cont.innerHTML = `<div class="card"><div class="empty-state">
      <div class="empty-icon">${ICN_search}</div>
      <p>Ningún cliente coincide con lo que buscas.</p>
    </div></div>`;
    return;
  }

  cont.innerHTML = `<div class="cli-grid">${lista.map(c => {
    const abiertas = (c.historial || []).filter(h => !h.hasta);
    const cerradas = (c.historial || []).filter(h => h.hasta);
    const donde = abiertas.length
      ? abiertas.map(h => _esc(h.campaignName)).join(' · ')
      : (cerradas.length ? `Estuvo en ${_esc(cerradas[cerradas.length - 1].campaignName)}` : 'Sin campañas');
    return `<div class="cli-card ${c.activo ? '' : 'is-inactivo'}" role="button" tabindex="0" onclick="abrirFichaCliente('${c.id}')">
      <div class="cli-card-top">
        <div class="cli-avatar">${_esc((c.name || '?')[0].toUpperCase())}</div>
        <div class="cli-id">
          <div class="cli-nombre">${_esc(c.name)}</div>
          <div class="cli-cargo">${_esc(c.cargo || 'Sin cargo')}${c.empresa ? ' · ' + _esc(c.empresa) : ''}</div>
        </div>
        ${c.activo ? '' : '<span class="badge badge-gray cli-estado">Ya no está</span>'}
      </div>
      <div class="cli-campanas">${donde}</div>
      <div class="cli-card-pie">${_pocChip(c)}</div>
    </div>`;
  }).join('')}</div>`;
}

/* ── Ficha ──
   El historial y las reseñas viven aquí y no en la tarjeta a propósito: la
   lista sirve para encontrar a alguien, la ficha para saber de quién se trata.
   Meter las reseñas en la lista, además, las pondría a la vista de cualquiera
   que pase por la pestaña. */
async function abrirFichaCliente(id) {
  const c = getClientes().find(x => x.id === id);
  if (!c) return;
  _clienteAbierto = id;

  const cuerpo = document.getElementById('clienteFichaBody');
  const titulo = document.getElementById('clienteFichaTitulo');
  if (!cuerpo || !titulo) return;
  titulo.textContent = c.name;

  const hist = (c.historial || []).slice().sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
  const histHtml = hist.length ? hist.map(h => `
    <div class="cli-hist-row">
      <div class="cli-hist-punto ${h.hasta ? '' : 'on'}"></div>
      <div>
        <div class="cli-hist-camp">${_esc(h.campaignName)}${h.empresa ? ` <span class="cli-hist-emp">${_esc(h.empresa)}</span>` : ''}</div>
        <div class="cli-hist-fechas">
          ${h.desde ? _esc(h.desde) : '—'} → ${h.hasta ? _esc(h.hasta) : '<strong>ahora</strong>'}
          · ${_esc((CLIENT_POC.find(p => p.id === (h.pocTipo || 'na')) || CLIENT_POC[2]).label)}
        </div>
      </div>
    </div>`).join('') : '<p class="cli-vacio">Sin campañas registradas.</p>';

  cuerpo.innerHTML = `
    <div class="cli-ficha-datos">
      <div><span class="cli-dato-lbl">Cargo</span>${_esc(c.cargo || '—')}</div>
      <div><span class="cli-dato-lbl">Cuenta</span>${_esc(c.empresa || '—')}</div>
      <div><span class="cli-dato-lbl">Correo</span>${c.email ? `<a href="mailto:${_esc(c.email)}">${_esc(c.email)}</a>` : '—'}</div>
      <div><span class="cli-dato-lbl">LinkedIn</span>${c.linkedin ? `<a href="${_esc(_safeUrl ? _safeUrl(c.linkedin) : c.linkedin)}" target="_blank" rel="noopener">Ver perfil</a>` : '—'}</div>
      <div><span class="cli-dato-lbl">Tipo</span>${_pocChip(c)}</div>
      <div><span class="cli-dato-lbl">Estado</span>${c.activo ? 'Activo' : 'Ya no está en ninguna campaña'}</div>
    </div>

    <h4 class="cli-seccion">Historial</h4>
    <div class="cli-hist">${histHtml}</div>

    <h4 class="cli-seccion">Reseñas</h4>
    <div id="clienteResenas"><p class="cli-vacio">Cargando…</p></div>`;

  openModal('clienteFichaModal');
  _pintarResenas(id);
}

async function _pintarResenas(id) {
  const cont = document.getElementById('clienteResenas');
  if (!cont) return;

  if (!puedeVerResenasCliente()) {
    // A quien no le toca se le dice QUÉ hay y POR QUÉ no lo ve. Un hueco sin
    // explicación se lee como que la app se rompió, y manda a preguntar.
    cont.innerHTML = `<div class="cli-bloqueo">
      <span class="cli-bloqueo-icn">${ICN_eyeOff}</span>
      <div>
        <strong>Sólo el área de Cuentas</strong>
        <p>Aquí se guarda cómo es tratar con esta persona. Lo escribe y lo lee Cuentas,
        que es quien mantiene la relación. Si necesitas saber algo, pídeselos.</p>
      </div>
    </div>`;
    return;
  }

  const notas = await cargarResenasCliente(id);
  const lista = notas.length ? notas.map(n => `
    <div class="cli-resena">
      <div class="cli-resena-top">
        <strong>${_esc(n.autorNombre || 'Alguien')}</strong>
        <span>${_esc(String(n.fecha || '').slice(0, 10))}</span>
      </div>
      ${n.estrellas ? _estrellasHtml(n.estrellas) : ''}
      <p>${_esc(n.texto)}</p>
    </div>`).join('') : '<p class="cli-vacio">Nadie ha escrito nada todavía.</p>';

  // El promedio sale de las reseñas, así que vive DENTRO del bloque que sólo ve
  // Cuentas: enseñarlo afuera sería filtrar el dato en forma de número.
  const conNota = notas.filter(n => n.estrellas);
  const promedio = conNota.length
    ? (conNota.reduce((a, n) => a + n.estrellas, 0) / conNota.length)
    : null;
  const resumen = promedio === null ? '' : `
    <div class="cli-promedio">
      ${_estrellasHtml(promedio)}
      <span><strong>${promedio.toFixed(1)}</strong> de 5 · ${conNota.length} ${conNota.length === 1 ? 'reseña' : 'reseñas'}</span>
    </div>`;

  cont.innerHTML = `
    <div class="cli-confidencial">
      <span class="cli-confidencial-icn">${ICN_alert}</span>
      <div><strong>Confidencial.</strong> Esto es para trabajar mejor con la cuenta, no para
      compartirse fuera de Think Y. No lo copies en correos, mensajes ni documentos que salgan
      de aquí, y ten presente que la persona podría pedir ver lo que se escribió sobre ella.</div>
    </div>
    ${resumen}
    <div class="cli-resenas">${lista}</div>
    <div class="cli-nueva">
      <label class="form-label" for="clienteResenaTexto">Dejar una reseña</label>
      ${_estrellasInputHtml()}
      <textarea id="clienteResenaTexto" class="form-input" rows="3"
        placeholder="Cómo es trabajar con esta persona: qué le importa, cómo prefiere que le hablen, qué evitar."></textarea>
      <div class="cli-nueva-pie">
        <span class="cli-nueva-nota">Se publica con tu nombre y no se puede editar después.</span>
        <button class="btn btn-primary btn-sm" onclick="enviarResenaCliente('${id}')">Publicar</button>
      </div>
    </div>`;
}

async function enviarResenaCliente(id) {
  const ta = document.getElementById('clienteResenaTexto');
  if (!ta) return;
  const ok = await guardarResenaCliente(id, ta.value, starsPickerValor('cliEstrellas'));
  if (!ok) return;
  ta.value = '';
  showToast('Reseña publicada', 'success');
  _pintarResenas(id);
}

window.renderClientes            = renderClientes;
window.setClientesFiltro         = setClientesFiltro;
window.setClientesQuery          = setClientesQuery;
window.abrirFichaCliente         = abrirFichaCliente;
window.enviarResenaCliente       = enviarResenaCliente;
window.cambiarPocCliente         = cambiarPocCliente;
window.clienteUpsertDesdeCampana = clienteUpsertDesdeCampana;
window.clienteCerrarEnCampana    = clienteCerrarEnCampana;
window.puedeVerResenasCliente    = puedeVerResenasCliente;
window.rellenarClientesDesdeCampanas = rellenarClientesDesdeCampanas;
