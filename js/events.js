/* Campaign OS — Eventos
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick, que solo resuelven contra el scope global.

   QUÉ ES UN EVENTO Y POR QUÉ NO ES UNA TAREA
   ------------------------------------------
   Muchas campañas se atan a una fecha que no depende de nosotros: la activación,
   la premiere, el evento del cliente. Eso no es un pendiente —no se marca como
   hecho, no tiene responsable que lo "entregue"— pero es lo que ordena todos los
   pendientes de alrededor. Antes había que meterlo como tarea falsa con deadline,
   y entonces aparecía en la lista de alguien como algo que tenía que completar.

   Viven en `workspaces/<ws>/events`. Cada evento es un documento, y se escribe
   de uno en uno: no hay sincronización de colección entera como en globalTasks,
   así que crear uno no reescribe los demás.

   Las reglas de Firestore ya los cubren: el bloque
   `match /workspaces/{ws}/{coll}/{doc=**}` deja leer y escribir cualquier
   subcolección del workspace que no sea del ThinkyPeso ni clientNotes. */

// ============================================================
// DATOS
// ============================================================

function _evCol() {
  return db.collection('workspaces').doc(WORKSPACE).collection('events');
}

function _evAll() {
  return Array.isArray(_cache.events) ? _cache.events : [];
}

/* Los eventos que le tocan a esta persona: los de SUS campañas, más los que no
   cuelgan de ninguna (los de agencia). Mismo criterio que el resto del tablero
   — ver misCampanas() en core.js. */
function eventosVisibles() {
  const mias = new Set(((typeof misCampanas === 'function') ? misCampanas() : []).map(c => c.id));
  return _evAll().filter(e => !e.campaignId || mias.has(e.campaignId));
}

function eventosDeCampana(cid) {
  return _evAll().filter(e => e.campaignId === cid).sort(_evPorFecha);
}

function _evPorFecha(a, b) {
  const da = (a.date || '9999-12-31') + 'T' + (a.time || '00:00');
  const db_ = (b.date || '9999-12-31') + 'T' + (b.time || '00:00');
  return da.localeCompare(db_);
}

function _evHoy() { return hoyISO(); }

/* Cuándo termina: si no se puso fecha de cierre, el evento dura su día. */
function _evFin(e) { return e.endDate || e.date || ''; }
function _evPasado(e) { return _evFin(e) && _evFin(e) < _evHoy(); }

function _evCampana(e) {
  if(!e.campaignId) return null;
  return (_cache.campaigns || []).find(c => c.id === e.campaignId) || null;
}

// "en 3 días" / "hoy" / "mañana" / "hace 5 días" — la cuenta atrás es la razón
// de ser del evento, así que va antes que la fecha en la tarjeta.
function _evCuenta(e) {
  const d = e.date; if(!d) return '';
  const hoy = new Date(_evHoy() + 'T12:00:00');
  const dia = new Date(d + 'T12:00:00');
  if(isNaN(dia)) return '';
  const dias = Math.round((dia - hoy) / 86400000);
  if(dias === 0) return 'Hoy';
  if(dias === 1) return 'Mañana';
  if(dias === -1) return 'Ayer';
  if(dias > 1)  return 'En ' + dias + ' días';
  return 'Hace ' + Math.abs(dias) + ' días';
}

// ============================================================
// ESCRITURA
// ============================================================

async function _evGuardar(ev) {
  if(!currentUser) return false;
  try {
    await _evCol().doc(ev.id).set(_sanitizeForFirestore(ev), { merge: true });
    return true;
  } catch(e) {
    console.error('guardar evento', e);
    showToast(typeof errorHumano === 'function'
      ? errorHumano(e, 'guardar el evento')
      : 'No se pudo guardar el evento', 'error');
    return false;
  }
}

async function _evBorrar(eid) {
  if(!currentUser) return false;
  try { await _evCol().doc(eid).delete(); return true; }
  catch(e) {
    console.error('borrar evento', e);
    showToast(typeof errorHumano === 'function'
      ? errorHumano(e, 'borrar el evento')
      : 'No se pudo borrar el evento', 'error');
    return false;
  }
}

// ============================================================
// MODAL
// ============================================================

let _evEditando = null;   // id del evento que se está editando, o null

function _evLlenarCampanas(sel, valor) {
  const el = document.getElementById(sel);
  if(!el) return;
  const camps = (typeof visibleCampaigns === 'function') ? visibleCampaigns() : (_cache.campaigns || []);
  el.innerHTML = `<option value="">— Sin campaña (evento de agencia) —</option>` +
    camps.map(c => `<option value="${c.id}">${_esc(c.name)}${c.client ? ' · ' + _esc(c.client) : ''}</option>`).join('');
  el.value = valor || '';
}

function openAddEventModal(cid) {
  _evEditando = null;
  _evLlenarCampanas('fEvCampaign', cid || currentCampaignId || '');
  document.getElementById('fEvTitle').value = '';
  document.getElementById('fEvDate').value = _evHoy();
  document.getElementById('fEvEndDate').value = '';
  document.getElementById('fEvTime').value = '';
  document.getElementById('fEvPlace').value = '';
  document.getElementById('fEvUrl').value = '';
  document.getElementById('fEvNotes').value = '';
  document.getElementById('eventModal__title').textContent = 'Nuevo evento';
  const del = document.getElementById('evDeleteBtn');
  if(del) del.style.display = 'none';
  openModal('eventModal');
}

function openEditEventModal(eid) {
  const e = _evAll().find(x => x.id === eid);
  if(!e) { showToast('Ese evento ya no existe', 'error'); return; }
  _evEditando = eid;
  _evLlenarCampanas('fEvCampaign', e.campaignId || '');
  document.getElementById('fEvTitle').value = e.title || '';
  document.getElementById('fEvDate').value = e.date || '';
  document.getElementById('fEvEndDate').value = e.endDate || '';
  document.getElementById('fEvTime').value = e.time || '';
  document.getElementById('fEvPlace').value = e.place || '';
  document.getElementById('fEvUrl').value = e.url || '';
  document.getElementById('fEvNotes').value = e.notes || '';
  document.getElementById('eventModal__title').textContent = 'Editar evento';
  const del = document.getElementById('evDeleteBtn');
  if(del) del.style.display = '';
  openModal('eventModal');
}

async function saveEvent() {
  const title = document.getElementById('fEvTitle').value.trim();
  if(!title) { showToast('Ponle nombre al evento', 'error'); return; }
  const date = document.getElementById('fEvDate').value;
  if(!date) { showToast('El evento necesita fecha', 'error'); return; }
  const endDate = document.getElementById('fEvEndDate').value || '';
  // Un evento que termina antes de empezar es un dedo mal puesto, no un dato.
  if(endDate && endDate < date) { showToast('La fecha de cierre cae antes del inicio', 'error'); return; }

  const campaignId = document.getElementById('fEvCampaign').value || '';
  const camp = campaignId ? (_cache.campaigns || []).find(c => c.id === campaignId) : null;

  const base = _evEditando ? (_evAll().find(x => x.id === _evEditando) || {}) : {};
  const ev = {
    ...base,
    id: _evEditando || id(),
    title, date, endDate,
    time:  document.getElementById('fEvTime').value || '',
    place: document.getElementById('fEvPlace').value.trim(),
    url:   document.getElementById('fEvUrl').value.trim(),
    notes: document.getElementById('fEvNotes').value.trim(),
    campaignId,
    // Copia del nombre para que el evento siga legible si la campaña se borra.
    campaignName: camp ? camp.name : '',
    createdBy: base.createdBy || currentUser.uid,
    createdAt: base.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const ok = await _evGuardar(ev);
  if(!ok) return;
  closeModal('eventModal');
  showToast(_evEditando ? 'Evento actualizado' : 'Evento agregado', 'success');
  _evEditando = null;
}

async function deleteEventFromModal() {
  if(!_evEditando) return;
  const e = _evAll().find(x => x.id === _evEditando);
  const nombre = e ? e.title : 'este evento';
  const ok = await confirmar({
    title: `¿Borrar «${nombre}»?`,
    body: 'Se va para todo el equipo y no hay forma de recuperarlo.',
    confirmLabel: 'Borrar evento',
    cancelLabel: 'Conservar',
    danger: true,
  });
  if(!ok) return;
  if(await _evBorrar(_evEditando)) {
    closeModal('eventModal');
    showToast('Evento borrado', 'success');
    _evEditando = null;
  }
}

// ============================================================
// RENDER
// ============================================================

let _evMostrarPasados = false;
function toggleEventosPasados() {
  _evMostrarPasados = !_evMostrarPasados;
  renderEventos();
}

function _evTarjeta(e, conCampana) {
  const c = _evCampana(e);
  const pasado = _evPasado(e);
  const cuenta = _evCuenta(e);
  const rango = e.endDate && e.endDate !== e.date
    ? `${formatDateShort(e.date)} — ${formatDateShort(e.endDate)}`
    : formatDate(e.date);
  return `
  <div class="ev-card${pasado ? ' is-past' : ''}">
    <div class="ev-when">
      <span class="ev-count">${_esc(cuenta)}</span>
      <span class="ev-date">${_esc(rango)}${e.time ? ' · ' + _esc(e.time) : ''}</span>
    </div>
    <div class="ev-body">
      <div class="ev-title">${_esc(e.title)}</div>
      <div class="ev-meta">
        ${conCampana && c ? `<button type="button" class="ev-chip ev-chip-camp" onclick="_evIrACampana('${_esc(c.id)}')">${_esc(c.name)}</button>` : ''}
        ${conCampana && !c && e.campaignName ? `<span class="ev-chip">${_esc(e.campaignName)}</span>` : ''}
        ${!e.campaignId ? `<span class="ev-chip">Agencia</span>` : ''}
        ${e.place ? `<span class="ev-chip">${_esc(e.place)}</span>` : ''}
        ${e.url ? `<a class="ev-chip ev-chip-link" href="${_esc(_safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">Link</a>` : ''}
      </div>
      ${e.notes ? `<div class="ev-notes">${_esc(e.notes)}</div>` : ''}
    </div>
    <button class="ev-edit" onclick="openEditEventModal('${_esc(e.id)}')" title="Editar evento" aria-label="Editar evento ${_esc(e.title)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
    </button>
  </div>`;
}

function _evIrACampana(cid) {
  navigate('campannas');
  setTimeout(() => openCampaignDetail(cid), 60);
}

// Bloque de Eventos de la página Pendientes.
function renderEventos() {
  const el = document.getElementById('eventosList');
  if(!el) return;
  const todos = eventosVisibles().sort(_evPorFecha);
  const proximos = todos.filter(e => !_evPasado(e));
  const pasados  = todos.filter(_evPasado).reverse();   // el más reciente primero

  const cabecera = document.getElementById('eventosCount');
  if(cabecera) cabecera.textContent = proximos.length ? String(proximos.length) : '';

  const botonPasados = pasados.length
    ? `<button class="btn btn-ghost btn-sm" onclick="toggleEventosPasados()" style="margin-top:10px;">
         ${_evMostrarPasados ? 'Ocultar' : 'Ver'} ${pasados.length} evento${pasados.length !== 1 ? 's' : ''} que ya ${pasados.length !== 1 ? 'pasaron' : 'pasó'}
       </button>`
    : '';

  if(!proximos.length && !_evMostrarPasados) {
    el.innerHTML = `<div class="empty-state" style="padding:18px;">
        <p>Sin eventos por venir. Si una campaña se ata a una fecha —una activación, una premiere, el evento del cliente— ponla aquí y todo el equipo la ve.</p>
      </div>${botonPasados}`;
    return;
  }

  el.innerHTML =
    `<div class="ev-list">${proximos.map(e => _evTarjeta(e, true)).join('')}</div>` +
    botonPasados +
    (_evMostrarPasados && pasados.length
      ? `<div class="ev-list ev-list-past">${pasados.map(e => _evTarjeta(e, true)).join('')}</div>`
      : '');
}

// Bloque de Eventos dentro de la pestaña Pendientes de una campaña.
function renderCampaignEventos(c) {
  const el = document.getElementById('campaignEventsList');
  if(!el || !c) return;
  const todos = eventosDeCampana(c.id);
  const proximos = todos.filter(e => !_evPasado(e));
  const lista = proximos.length ? proximos : todos.slice(-3);
  if(!lista.length) {
    el.innerHTML = `<div class="empty-state" style="padding:14px;"><p style="font-size:12px;">Esta campaña no está atada a ningún evento todavía.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="ev-list">${lista.map(e => _evTarjeta(e, false)).join('')}</div>`;
}
