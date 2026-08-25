/* Campaign OS — Avisos: campanita, correo, kudos y reacciones
   =============================================
   Sin servidor no hay quien vigile los datos, así que aquí sólo se avisa de lo
   que hace una persona: te asignaron algo, te metieron a una campaña, cambió el
   tracker que sigues. Ver NOTIFICACIONES-EMAIL.md.

   Las reacciones con emoji viven aquí también: son la otra señal social que
   cuelga de una tarea y comparten el mismo camino de escritura.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// NOTIFICATIONS
// ============================================================
let _notifUnsub = null;
let _notifs = [];
// El primer snapshot trae el historial entero: no es "acaba de pasar" y no
// debe soltar veinte toasts al entrar.
let _notifPrimed = false;

/* Cuándo pasó. `createdAt` es un serverTimestamp y en el snapshot LOCAL —el que
   ve quien acaba de escribir la notificación— llega null hasta que el servidor
   confirma. Con el orden puesto solo en ese campo, tu propio aviso (etiquetarte
   a ti en una campaña) nacía con fecha 0, se iba al fondo de la lista y con más
   de 30 avisos ni siquiera entraba: parecía que nunca se creó. `createdAtMs` es
   la hora del cliente y sirve de respaldo mientras el servidor responde. */
function _notifMs(n) {
  if(!n) return 0;
  const srv = n.createdAt?.toMillis?.();
  if(srv) return srv;
  if(typeof n.createdAt === 'number') return n.createdAt;
  return n.createdAtMs || 0;
}

function initNotifications() {
  if(!currentUser || !db) return;
  _loadEmailConfig();
  if(_notifUnsub) _notifUnsub();
  // Sin orderBy a propósito: combinar where('toUid') con orderBy('createdAt')
  // en campos distintos pide un índice compuesto que este proyecto nunca
  // desplegó (no hay firestore.indexes.json). Sin ese índice el listener
  // tiraba error y el callback lo tragaba en silencio — la campanita nunca
  // mostraba nada, ni etiquetando a alguien, porque el ALTA sí funcionaba
  // (un simple add() no necesita índice) pero la LECTURA nunca llegaba.
  // Se ordena en el cliente en vez de pedirle el orden a Firestore.
  const q = db.collection('workspaces').doc(WORKSPACE)
    .collection('notifications')
    .where('toUid','==',currentUser.uid);
  _notifUnsub = q.onSnapshot(snap => {
    _notifs = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b) => _notifMs(b) - _notifMs(a))
      .slice(0, 30);
    // Aviso en vivo: el que llega mientras estás en la app se dice en pantalla.
    // Sin esto la única señal era el número de la campanita, que nadie mira si
    // no está esperando algo — por eso "me etiquetaron y no me enteré".
    if(_notifPrimed) {
      snap.docChanges()
        .filter(ch => ch.type === 'added' && !ch.doc.data().read)
        .forEach(ch => _avisarEnVivo({ id: ch.doc.id, ...ch.doc.data() }));
    }
    _notifPrimed = true;
    _renderNotifBell();
  }, err => console.warn('notifications listener failed:', err.message));
  // Refresh deadline notifications periodically + once now (Firestore snapshot
  // may not fire, so this guarantees time-based alerts appear).
  _renderNotifBell();
  if(_deadlineTimer) clearInterval(_deadlineTimer);
  _deadlineTimer = setInterval(_renderNotifBell, 30 * 60 * 1000);
}
let _deadlineTimer = null;

// --- Deadline (time-based) notifications, computed locally (no Firestore) ---
const DEADLINE_WARN_DAYS = 3; // avisar cuando falten ≤3 días
function _dlSeen() { try { return new Set(JSON.parse(localStorage.getItem('cmos:dlSeen')||'[]')); } catch(e){ return new Set(); } }
function _dlMarkSeen(id) {
  const s = _dlSeen(); s.add(id);
  try { localStorage.setItem('cmos:dlSeen', JSON.stringify([...s].slice(-200))); } catch(e){}
}
function _computeDeadlineNotifs() {
  if(!currentUser) return [];
  const seen = _dlSeen();
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  // Avisa a quien está etiquetado en la tarea, no solo al responsable: un
  // supervisor que se entera del retraso el día después no puede hacer nada.
  const mine = t => {
    const involved = typeof taskPeople === 'function' ? taskPeople(t) : [t.assigneeUid];
    return !t.assigneeUid || involved.includes(currentUser.uid);
  };
  const consider = (t, campaignName, campaignId) => {
    if(t.done || !mine(t)) return;
    const where = campaignName ? ` · ${campaignName}` : '';
    // Los dos deadlines avisan por separado: el interno es del equipo y el de
    // cliente es el que no se puede mover.
    [['dueDate','interno'], ['clientDueDate','cliente']].forEach(([field, label]) => {
      const raw = t[field];
      if(!raw) return;
      const due = new Date(raw+'T00:00:00'); if(isNaN(due)) return;
      const days = Math.round((due - today)/86400000);
      if(days > DEADLINE_WARN_DAYS) return;
      const id = 'dl_'+(t.id||t.title)+'_'+field+'_'+raw;
      // La urgencia primero y el nombre de la tarea después: leyendo tres
      // palabras ya se sabe si hay que actuar. El "de qué deadline y de qué
      // campaña" baja a la segunda línea, que es donde va el detalle.
      const cuando = days < 0 ? `Venció hace ${-days} día${-days !== 1 ? 's' : ''}`
        : days === 0 ? 'Vence hoy'
        : `Vence en ${days} día${days !== 1 ? 's' : ''}`;
      out.push({
        id, type:'deadline', read: seen.has(id), createdAt: due.getTime(), _sort: days,
        text: `${cuando}: ${t.title}`,
        meta: `Deadline ${label}${where}`,
        link: { k:'task', t: t.id || '', c: campaignId || '' },
      });
    });
  };
  (getData('globalTasks')||[]).forEach(t=>consider(t,'',''));
  (getData('campaigns')||[]).forEach(c => (c.tasks||[]).forEach(t=>consider(t,c.name,c.id)));
  return out.sort((a,b)=>a._sort-b._sort);
}

/* --- ThinkyPesos: el aviso de que el mes volvió a empezar ---

   El abono mensual no lo escribe nadie: se DERIVA del calendario (ver la nota
   de arriba en js/thinky-peso.js — no hay cron, y por eso no hay servidor que
   pueda mandar el aviso). Así que el aviso también se deriva aquí, del mismo
   calendario, y es local a cada quien: en cuanto abre la app dentro de la
   ventana de reparto, la campanita se lo dice.

   Sin esto los ThinkyPesos se perdían por olvido: el saldo vuelve a 10, la
   ventana dura una semana, y lo que no se reparte no se acumula. La moneda
   sólo sirve si la gente se entera de que la tiene.

   Los ids llevan el prefijo `dl_` a propósito: markNotifRead() ya sabe que un
   id así no vive en Firestore y lo despacha por localStorage. Y llevan el
   periodo dentro, así que descartar el de septiembre no calla el de octubre. */
function _computeThinkyNotifs() {
  const tp = window.thinkyPeso;
  if(!currentUser || !tp) return [];
  let st, saldo, periodo;
  try { st = tp.windowState(); saldo = tp.myBalance(); periodo = tp.currentPeriod(); }
  catch(e) { return []; }
  if(!st || !st.open) return [];
  if(!(saldo > 0)) return [];   // ya los repartió: no hay nada que recordarle

  const seen = _dlSeen();
  const out = [];
  const cierra = st.end ? new Date(st.end) : null;
  const diasRestantes = cierra
    ? Math.ceil((cierra - new Date()) / 86400000)
    : null;
  const cierraTxt = cierra
    ? cierra.toLocaleDateString('es-MX', { day:'numeric', month:'long' })
    : 'a fin de mes';

  const idAbono = 'dl_tp_open_' + periodo;
  out.push({
    id: idAbono, type:'thinkypeso', read: seen.has(idAbono),
    createdAt: st.start ? new Date(st.start).getTime() : Date.now(), _sort: -50,
    text: `Tienes ${saldo} ThinkyPeso${saldo !== 1 ? 's' : ''} para repartir`,
    meta: `Se reiniciaron este mes · el reparto cierra el ${cierraTxt}. Lo que no repartas se pierde.`,
    link: { k:'page', p:'thinkypeso' },
  });

  // Último empujón: con la ventana a punto de cerrarse el aviso sube arriba.
  if(diasRestantes !== null && diasRestantes <= 2) {
    const idUltimo = 'dl_tp_last_' + periodo;
    out.push({
      id: idUltimo, type:'thinkypeso', read: seen.has(idUltimo),
      createdAt: Date.now(), _sort: -100,
      text: `Últimos días para repartir tus ${saldo} ThinkyPeso${saldo !== 1 ? 's' : ''}`,
      meta: `Cierra el ${cierraTxt} y no se acumulan.`,
      link: { k:'page', p:'thinkypeso' },
    });
  }
  return out;
}

/* El aviso en pantalla, una sola vez por periodo y por persona. La campanita
   ya lo lleva; esto es para quien no la mira. */
function _avisarThinkyReinicio() {
  const tp = window.thinkyPeso;
  if(!currentUser || !tp) return;
  let st, saldo, periodo;
  try { st = tp.windowState(); saldo = tp.myBalance(); periodo = tp.currentPeriod(); }
  catch(e) { return; }
  if(!st || !st.open || !(saldo > 0)) return;
  const clave = 'cmos:tpAvisoPeriodo';
  try {
    if(localStorage.getItem(clave) === periodo) return;
    localStorage.setItem(clave, periodo);
  } catch(e) { return; }   // sin localStorage no hay forma de no repetirlo
  try {
    showToast(`Se reiniciaron tus ThinkyPesos: tienes ${saldo} para repartir este mes 🪙`, 'success');
  } catch(e){}
}

// El texto trae el icono adelante ("✅ Fulano te asignó…"); el avatar del
// aviso lo repetía al lado. Se quita del texto al pintarlo para no verlo dos
// veces, sin tocar lo que ya está guardado en Firestore.
const _NOTIF_ICON = { kudos:'🏆', task_assigned:'✅', deadline:'⏰', campaign_role:'🧭', campaign_update:'📣', task_update:'🔁', tracker:'📡', thinkypeso:'🪙' };
function _notifIcon(n) { return _NOTIF_ICON[n.type] || '💬'; }
function _notifTexto(n) {
  const t = String(n.text || '');
  const limpio = t.replace(/^(?:\s|\p{Extended_Pictographic}|\uFE0F|\u200D)+/u, '').trim();
  return limpio || t;
}

// Índice por id: el clic del panel busca aquí en vez de pasar el aviso entero
// serializado dentro de un atributo.
let _notifIdx = new Map();

function _notifItemHtml(n) {
  const ago = n.type === 'deadline' ? '' : _timeAgo(new Date(_notifMs(n) || Date.now()));
  const abre = _notifDestino(n.link);
  return `<button type="button" class="notif-item${n.read?'':' unread'}${abre?' has-link':''}" data-nid="${_esc(n.id)}">
    <span class="notif-avatar" aria-hidden="true">${_notifIcon(n)}</span>
    <span class="notif-body">
      <span class="notif-text">${_esc(_notifTexto(n))}</span>
      ${n.meta?`<span class="notif-meta">${_esc(n.meta)}</span>`:''}
      <span class="notif-foot">
        ${ago?`<time>${ago}</time>`:''}
        ${abre?`<span class="notif-go">${_esc(abre)} →</span>`:''}
      </span>
    </span>
    ${n.read?'':'<span class="notif-dot" aria-label="Sin leer"></span>'}
  </button>`;
}

// Qué se va a abrir con el clic. Es la promesa que hace el aviso: si no se
// puede cumplir (la tarea ya no existe, la campaña ya no se puede ver) no se
// escribe nada y el aviso solo se marca como leído.
function _notifDestino(link) {
  if(!link) return '';
  if(link.k === 'task') return 'Ver la tarea';
  if(link.k === 'campaign') return link.p === 'tracker' ? 'Ver el tracker' : 'Ver la campaña';
  if(link.k === 'page') return { equipo:'Ver el equipo', pendientes:'Ver los pendientes', campannas:'Ver campañas', thinkypeso:'Repartir ahora' }[link.p] || 'Abrir';
  return '';
}

function _renderNotifBell() {
  const deadlines = _computeDeadlineNotifs();
  const thinky = _computeThinkyNotifs();
  const actividad = _notifs.slice().sort((a,b) => _notifMs(b) - _notifMs(a));
  const all = [...thinky, ...deadlines, ...actividad];
  _notifIdx = new Map(all.map(n => [String(n.id), n]));
  const unread = all.filter(n=>!n.read).length;
  _setTBadge('notifBadge', unread);
  // El número del badge lo lee un lector de pantalla como "7" a secas. El
  // estado se anuncia aparte, con sujeto, y sin mover el foco.
  const vivo = document.getElementById('notifLive');
  // "notificaciónes" no existe: el acento se cae en plural.
  const frase = unread ? `${unread} ${unread === 1 ? 'notificación' : 'notificaciones'} sin leer` : 'Sin avisos nuevos';
  if(vivo && vivo.textContent !== frase) vivo.textContent = frase;
  document.getElementById('notifBellBtn')?.setAttribute('aria-label', `Notificaciones · ${frase.toLowerCase()}`);
  const list = document.getElementById('notifList');
  if(!list) return;
  if(!all.length) {
    list.innerHTML = '<div class="notif-empty"><b>Todo al día</b><span>Aquí caen los avisos cuando alguien te etiqueta o se acerca un deadline.</span></div>';
    return;
  }
  // Dos secciones en vez de una sola lista: los deadlines se recalculan cada
  // media hora y siempre encabezaban, así que sepultaban lo que acababa de
  // pasar. Con títulos, cada cosa se busca donde está.
  const bloques = [];
  // Los ThinkyPesos van arriba del todo por una razón concreta: caducan. La
  // ventana dura una semana al mes y lo que no se reparte se pierde, así que
  // es el único aviso de la campanita que deja de poder atenderse solo.
  if(thinky.length) {
    bloques.push('<div class="notif-sec"><span>ThinkyPesos</span></div>'
      + thinky.map(_notifItemHtml).join(''));
  }
  // La actividad va PRIMERO. Los deadlines se recalculan solos y también se ven
  // en el tablero; que alguien te etiquete sólo se entera aquí, y con cinco
  // vencimientos arriba eso quedaba fuera de pantalla — que es exactamente cómo
  // se pierde un "te sumaron a esta campaña".
  if(actividad.length) {
    const nuevos = actividad.filter(n => !n.read).length;
    bloques.push(`<div class="notif-sec"><span>Actividad del equipo</span>${nuevos?`<em>${nuevos} sin leer</em>`:''}</div>`
      + actividad.map(_notifItemHtml).join(''));
  }
  if(deadlines.length) {
    const vencidas = deadlines.filter(n => n._sort < 0).length;
    // Sólo los tres más urgentes: la campanita avisa, el tablero es donde se
    // trabaja la lista completa.
    const top = deadlines.slice(0, 3);
    bloques.push(`<div class="notif-sec"><span>Deadlines cerca</span>${vencidas?`<em>${vencidas} vencido${vencidas!==1?'s':''}</em>`:''}</div>`
      + top.map(_notifItemHtml).join('')
      + (deadlines.length > top.length
          ? `<button type="button" class="notif-more" onclick="verTodosLosDeadlines()">Ver los ${deadlines.length - top.length} restantes en Pendientes →</button>`
          : ''));
  }
  list.innerHTML = bloques.join('');
}

// Un solo listener para todo el panel: los avisos se repintan en cada snapshot
// y un onclick por fila se vuelve a serializar cada vez.
document.addEventListener('click', e => {
  const item = e.target.closest?.('#notifList .notif-item');
  if(item) { e.preventDefault(); abrirNotif(item.dataset.nid); }
}, true);

/* Clic en un aviso: lo marca leído, cierra el panel y LLEVA a lo que avisa.
   Antes solo marcaba leído: enterarte de que te asignaron algo y tener que ir
   a buscarlo a mano es la mitad del trabajo del aviso. */
function abrirNotif(nid) {
  const n = _notifIdx.get(String(nid));
  const panel = document.getElementById('notifPanel');
  markNotifRead(nid);
  if(panel) _setNotifOpen(panel, false);
  if(n && n.link) _irANotif(n.link);
}

function _irANotif(link) {
  try {
    if(link.k === 'task') return _abrirTareaDeAviso(link.t, link.c);
    if(link.k === 'campaign') return _abrirCampanaDeAviso(link.c, link.p);
    if(link.k === 'page' && link.p) return navigate(link.p);
  } catch(e) { console.warn('ir a notificación', e); }
}

// Los deadlines completos viven en el tablero, filtrados por vencimiento.
function verTodosLosDeadlines() {
  const panel = document.getElementById('notifPanel');
  if(panel) _setNotifOpen(panel, false);
  navigate('pendientes');
  try {
    setTbGroupBy('date');
    setTbDate('vencidas');
  } catch(e) { console.warn(e); }
}

// `tab`: a qué pestaña de la campaña llega el clic. Un aviso de tracker que
// deja al usuario en Resumen le pide buscar a mano lo que el aviso ya sabía.
function _abrirCampanaDeAviso(cid, tab) {
  const c = (getData('campaigns')||[]).find(x => x.id === cid);
  if(!c) { showToast('Esa campaña ya no existe.','error'); return; }
  if(typeof canSeeCampaign === 'function' && !canSeeCampaign(c)) {
    showToast('Ya no estás en esa campaña. Pide que te vuelvan a agregar.','error');
    return;
  }
  navigate('campannas');
  openCampaignDetail(cid);
  if(tab) setTimeout(() => { try { _switchCampaignTab(tab); } catch(e){} }, 60);
}

function _abrirTareaDeAviso(tid, cid) {
  const buscar = () => {
    if(cid) {
      const c = (getData('campaigns')||[]).find(x => x.id === cid);
      return c ? (c.tasks||[]).find(t => t.id === tid) : null;
    }
    return (getData('globalTasks')||[]).find(t => t.id === tid);
  };
  if(!buscar()) {
    // La tarea se borró o se movió: al menos se deja al usuario en su campaña
    // en vez de en una pantalla que no explica nada.
    if(cid) { _abrirCampanaDeAviso(cid); return; }
    showToast('Esa tarea ya no existe.','error');
    return;
  }
  navigate('pendientes');
  // El tablero puede tener filtros que dejen la tarea fuera de la lista. El
  // detalle se abre igual —el aviso prometió esa tarea— y además se resalta la
  // fila si sí está a la vista.
  setTimeout(() => {
    try { if(typeof _tbEnfocarTarea === 'function') _tbEnfocarTarea(tid, cid || ''); } catch(e) { console.warn(e); }
    try { openTaskDetail(tid, cid || ''); } catch(e) { console.warn(e); }
  }, 60);
}

// Aviso en vivo, con botón para ir directo a lo que avisa.
function _avisarEnVivo(n) {
  const texto = _notifIcon(n) + ' ' + _notifTexto(n);
  const destino = _notifDestino(n.link);
  if(destino) showToast(texto, '', { label: destino.replace(/^Ver la /,'Ver ').replace('Abrir','Abrir'), fn: () => { markNotifRead(n.id); _irANotif(n.link); } });
  else showToast(texto);
}

function _timeAgo(date) {
  if(!date) return '';
  const diff = Math.floor((Date.now() - date.getTime())/1000);
  if(diff < 60) return 'Ahora';
  if(diff < 3600) return `${Math.floor(diff/60)}m`;
  if(diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  if(!panel) return;
  // data-open en vez de display:none: el panel tiene que seguir pintado para
  // que .t-panel-slide pueda animarle también el cierre.
  _setNotifOpen(panel, panel.dataset.open !== 'true');
}

function _setNotifOpen(panel, open) {
  const yaEstaba = panel.dataset.open === 'true';
  panel.dataset.open = open ? 'true' : 'false';
  document.getElementById('notifBellBtn')?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if(open) {
    // El listener se pone en el siguiente tick para que el clic que ABRE el
    // panel no lo cierre de inmediato, y se queda puesto hasta que el panel se
    // cierre. Antes era {once:true}: el primer clic DENTRO del panel lo
    // consumía y a partir de ahí clicar fuera ya no cerraba nada.
    setTimeout(() => document.addEventListener('click', _closeNotifOnOutside), 0);
    document.addEventListener('keydown', _closeNotifOnEsc);
  } else {
    document.removeEventListener('click', _closeNotifOnOutside);
    document.removeEventListener('keydown', _closeNotifOnEsc);
    // Cerrar con Escape sin devolver el foco deja al teclado en el limbo.
    if(yaEstaba) document.getElementById('notifBellBtn')?.focus?.();
  }
}

function _closeNotifOnOutside(e) {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBellBtn');
  if(panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    _setNotifOpen(panel, false);
  }
}

function _closeNotifOnEsc(e) {
  if(e.key !== 'Escape') return;
  const panel = document.getElementById('notifPanel');
  if(panel) _setNotifOpen(panel, false);
}

async function markNotifRead(nid) {
  if(String(nid).startsWith('dl_')) { _dlMarkSeen(nid); _renderNotifBell(); return; }
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('notifications').doc(nid).update({read:true});
  } catch(e) {}
}

async function markAllNotifsRead() {
  _computeDeadlineNotifs().filter(n=>!n.read).forEach(n=>_dlMarkSeen(n.id));
  _computeThinkyNotifs().filter(n=>!n.read).forEach(n=>_dlMarkSeen(n.id));
  const unread = _notifs.filter(n=>!n.read);
  await Promise.all(unread.map(n=>markNotifRead(n.id)));
  _renderNotifBell();
}

// Etiquetar a alguien SIEMPRE deja aviso, y eso te incluye a ti: si te pones
// de responsable de Cuentas y no te llega nada, la campanita deja de ser el
// registro de en qué estás metido y hay que ir a buscarlo a mano.
async function _createNotification({toUid, type, text, meta, link, email}) {
  if(!toUid) return;
  try {
    const doc = {
      toUid, fromUid: currentUser.uid,
      fromName: currentUserProfile?.name || currentUser.email,
      type, text,
      // Segunda línea del aviso (quién y en qué campaña). Solo se escribe si
      // hay algo: Firestore rechaza undefined.
      ...(meta ? { meta } : {}),
      read: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      // Respaldo de fecha para el snapshot local, donde el serverTimestamp
      // todavía viene null. Ver _notifMs().
      createdAtMs: Date.now(),
    };
    // A dónde lleva el clic. Sin campos undefined: Firestore los rechaza.
    if(link && link.k) doc.link = { k: link.k, t: link.t || '', c: link.c || '', p: link.p || '' };
    await db.collection('workspaces').doc(WORKSPACE).collection('notifications').add(doc);
  } catch(e) { console.warn('notification create failed:', e.message); }
  // El correo a uno mismo sí sobra: acabas de hacerlo tú, ya lo sabes.
  if(email && toUid !== currentUser?.uid) _queueEmail(toUid, email.subject, email.html);
}

// ============================================================
// CORREO
// ============================================================
// El navegador no puede mandar correo: hace falta algo del lado del servidor.
// Lo que hay aquí es la mitad del cliente — deja el correo en la colección
// `mail`, que es el formato exacto que consume la extensión de Firebase
// "Trigger Email from Firestore". Mientras la extensión no esté instalada esto
// no manda nada (ver emailNotifsEnabled): no rompe, solo no sale correo.
// Instrucciones de instalación en NOTIFICACIONES-EMAIL.md.
let _emailCfg = { enabled:false, fromName:'Campaign OS' };

async function _loadEmailConfig() {
  if(!db) return;
  try {
    const snap = await db.collection('workspaces').doc(WORKSPACE)
      .collection('config').doc('notifications').get();
    if(snap.exists) _emailCfg = { ..._emailCfg, ...snap.data() };
  } catch(e) { /* sin config = correo apagado */ }
  _renderEmailSettings();
}
function emailNotifsEnabled() { return !!_emailCfg.enabled; }

// Preferencia por persona. Quien no quiere correo sigue viendo la campanita.
function myEmailPref() { return currentUserProfile?.emailNotifs !== false; }
async function setMyEmailPref(on) {
  if(!currentUser || !db) return;
  try {
    // La preferencia se guardaba en workspaces/<ws>/users, una colección que
    // nadie lee: _queueEmail busca al destinatario en `allUsers`, que sale de
    // workspaces/<ws>/members, y currentUserProfile sale de users/<uid>. Así
    // que apagar el correo no apagaba nada. Se escribe donde sí se lee.
    const _pref = { emailNotifs: !!on };
    await Promise.all([
      db.collection('workspaces').doc(WORKSPACE).collection('members')
        .doc(currentUser.uid).set(_pref, { merge:true }),
      db.collection('users').doc(currentUser.uid).set(_pref, { merge:true }),
    ]);
    if(currentUserProfile) currentUserProfile.emailNotifs = !!on;
    showToast(on ? 'Te llegarán correos de tus tareas' : 'Ya no te llegarán correos', 'success');
  } catch(e) { showToast('No se pudo guardar la preferencia', 'error'); }
  _renderEmailSettings();
}

function _renderEmailSettings() {
  const box = document.getElementById('emailNotifsBox');
  if(!box) return;
  if(!emailNotifsEnabled()) {
    box.innerHTML = `<div class="settings-note">
      <b>El correo todavía no está conectado.</b>
      Las notificaciones viven solo dentro de la app. Para que además salgan por correo hay que instalar el envío en Firebase una vez — está documentado en <code>NOTIFICACIONES-EMAIL.md</code>.
    </div>`;
    return;
  }
  const on = myEmailPref();
  box.innerHTML = `<label class="settings-switch">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="setMyEmailPref(this.checked)">
      <span>Mandarme también un correo cuando me etiqueten en una tarea</span>
    </label>
    <div class="settings-note" style="margin-top:10px;">Se manda a <b>${_esc(currentUser?.email || '')}</b>. Los recordatorios de deadline no van por correo, solo el etiquetado.</div>`;
}

async function _queueEmail(toUid, subject, html) {
  if(!emailNotifsEnabled() || !db) return;
  const u = allUsers.find(x => x.uid === toUid);
  if(!u || !u.email) return;
  if(u.emailNotifs === false) return;
  try {
    await db.collection('mail').add({
      to: [u.email],
      message: { subject, html },
      _meta: { workspace: WORKSPACE, toUid, fromUid: currentUser?.uid || '', createdAt: Date.now() },
    });
  } catch(e) { console.warn('email queue failed:', e.message); }
}

// Plantilla mínima: asunto que se entiende sin abrir, y un cuerpo que dice qué
// tarea, quién la asignó, con qué papel y para cuándo.
function _taskEmailHtml({ role, who, title, campaignName, dueDate, clientDueDate, notes }) {
  const row = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;">${k}</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;">${v}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;">
    <p style="font-size:15px;color:#111827;margin:0 0 14px;"><b>${_esc(who)}</b> te etiquetó como <b>${_esc(role.toLowerCase())}</b> en una tarea.</p>
    <p style="font-size:17px;font-weight:700;color:#111827;margin:0 0 14px;">${_esc(title)}</p>
    <table style="border-collapse:collapse;margin-bottom:18px;">
      ${row('Campaña', _esc(campaignName || 'General'))}
      ${row('Deadline interno', dueDate ? _esc(formatDate(dueDate)) : '')}
      ${row('Deadline cliente', clientDueDate ? _esc(formatDate(clientDueDate)) : '')}
    </table>
    ${notes ? `<p style="font-size:13px;color:#374151;white-space:pre-wrap;margin:0 0 18px;">${_esc(notes)}</p>` : ''}
    <a href="${location.origin}/#/pendientes" style="display:inline-block;background:#ff2d87;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:10px;">Ver en Campaign OS</a>
    <p style="font-size:11px;color:#9ca3af;margin:22px 0 0;">Puedes apagar estos correos en Ajustes → Notificaciones.</p>
  </div>`;
}

// ============================================================
// KUDOS
// ============================================================
// Un aviso por papel. "Te asignaron una tarea" cuando en realidad te pusieron
// de supervisor hace que la gente abra cosas que no le tocaban, y al revés:
// los supervisores ignoran los avisos porque nunca son suyos.
const _TASK_ROLE_COPY = {
  assignee:   { icon:'✅', verb:'te asignó',                  self:'Te asignaste',             role:'Responsable'   },
  supervisor: { icon:'👁', verb:'te puso como supervisor de', self:'Te pusiste de supervisor de', role:'Supervisor' },
  watcher:    { icon:'👥', verb:'te sumó a',                  self:'Te sumaste a',             role:'Colaborador'   },
};

function _notifyTaskPeople({ title, taskId, campaignId, dueDate, clientDueDate, notes, added }) {
  if(!added) return;
  const c = campaignId ? (getData('campaigns')||[]).find(x => x.id === campaignId) : null;
  const campaignName = c ? c.name : 'General';
  const extra = c ? ` en ${c.name}` : '';
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';

  const send = (uid, kind) => {
    if(!uid) return;
    const cp = _TASK_ROLE_COPY[kind];
    const when = dueDate ? ` · vence ${formatDateShort(dueDate)}` : '';
    // "Paulo te asignó" leído por Paulo es absurdo. Mismo aviso, otra voz.
    const frase = uid === currentUser?.uid
      ? `${cp.icon} ${cp.self} una tarea${extra}: "${title}"${when}`
      : `${cp.icon} ${who} ${cp.verb} una tarea${extra}: "${title}"${when}`;
    _createNotification({
      toUid: uid,
      type: 'task_assigned',
      text: frase,
      // El aviso abre la tarea, no la lista de pendientes: quien lo recibe ya
      // sabe cuál es; buscarla otra vez entre filtros es trabajo de más.
      link: taskId ? { k:'task', t: taskId, c: campaignId || '' } : (campaignId ? { k:'campaign', c: campaignId } : null),
      email: {
        subject: `${cp.role} · ${title}`,
        html: _taskEmailHtml({ role:cp.role, who, title, campaignName, dueDate, clientDueDate, notes }),
      },
    });
  };

  send(added.assignee, 'assignee');
  (added.supervisors || []).forEach(uid => send(uid, 'supervisor'));
  (added.watchers    || []).forEach(uid => send(uid, 'watcher'));
}

// Compat: el resto de la app sigue llamando a la versión vieja de un solo uid.
function _notifyTaskAssigned(uid, title, campaignId, taskId) {
  _notifyTaskPeople({ title, taskId, campaignId, added:{ assignee: uid } });
}

// ============================================================
// CAMBIOS SOBRE UNA TAREA QUE YA EXISTE
// ============================================================
// El alta y el etiquetado ya avisaban. Lo que faltaba era el resto de la vida
// de la tarea —moverla de estado, terminarla, reabrirla, mover un deadline,
// cambiarle la prioridad o quitarle el responsable—: el tablero de pendientes
// no mandaba UNA sola notificación. Un supervisor solo se enteraba de que su
// tarea avanzó abriendo la app y buscándola.
//
// Va a todos los etiquetados (responsable, supervisores, colaboradores y quien
// la creó) menos a quien hizo el cambio: nadie necesita que le cuenten lo que
// acaba de hacer.
//
// Los cambios se AGRUPAN por tarea y destinatario. Arrastrar una tarjeta tres
// columnas en diez segundos son tres cambios y un solo aviso; sin esto el
// tablero convierte la campanita en ruido y se deja de mirar, que es
// exactamente el problema que se venía a resolver.
const _CAMBIO_ESPERA_MS = 20000;
const _cambiosPendientes = new Map(); // `${uid}|${taskId}` -> {frases, ctx, timer}

// `excluir`: gente que en este mismo guardado ya recibió el aviso de "te
// etiquetaron". Mandarles además el detalle de los campos que cambiaron es
// contarles la historia de una tarea que acaban de conocer.
function _notifyTaskChange({ task, campaignId, frases, excluir }) {
  const lista = (Array.isArray(frases) ? frases : [frases]).filter(Boolean);
  if(!task || !lista.length || !currentUser) return;
  const fuera = new Set((excluir || []).filter(Boolean));
  // taskInvolved vive en tasks-board.js, que carga después de este archivo.
  // En tiempo de ejecución siempre está; el guard es para no explotar si algo
  // llama a esto durante el arranque.
  const involucrados = (typeof taskInvolved === 'function')
    ? taskInvolved(task)
    : [task.assigneeUid, ...(task.supervisors||[]), ...(task.watchers||[]), task.createdBy];
  const destino = [...new Set(involucrados.filter(Boolean))]
    .filter(uid => uid !== currentUser.uid && !fuera.has(uid));
  if(!destino.length) return;

  const c = campaignId ? (getData('campaigns')||[]).find(x => x.id === campaignId) : null;
  const ctx = {
    title: task.title || 'una tarea',
    taskId: task.id || '',
    campaignId: campaignId || '',
    campaignName: c ? c.name : '',
  };
  destino.forEach(uid => _encolarCambioTarea(uid, ctx, lista));
}

function _encolarCambioTarea(uid, ctx, frases) {
  const key = uid + '|' + (ctx.taskId || ctx.title);
  const pend = _cambiosPendientes.get(key) || { frases: [], ctx, timer: null };
  pend.ctx = ctx; // el título puede haber cambiado en el mismo lote
  // Un mismo campo movido dos veces cuenta una vez, con el valor final: que el
  // aviso diga "estado: Trabajando · estado: Listo" no le sirve a nadie.
  frases.forEach(f => {
    const campo = String(f).split(':')[0];
    const i = pend.frases.findIndex(x => String(x).split(':')[0] === campo);
    if(i >= 0) pend.frases[i] = f; else pend.frases.push(f);
  });
  if(pend.timer) clearTimeout(pend.timer);
  pend.timer = setTimeout(() => _vaciarCambioTarea(uid, key), _CAMBIO_ESPERA_MS);
  _cambiosPendientes.set(key, pend);
}

function _vaciarCambioTarea(uid, key) {
  const pend = _cambiosPendientes.get(key);
  _cambiosPendientes.delete(key);
  if(!pend || !pend.frases.length) return;
  const { ctx, frases } = pend;
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';
  // El cambio es el titular y quién/dónde baja a la segunda línea. Es la misma
  // forma que ya tienen los avisos de deadline, para que el panel se lea igual
  // renglón por renglón.
  _createNotification({
    toUid: uid,
    type: 'task_update',
    text: `🔁 "${ctx.title}" — ${frases.join(' · ')}`,
    meta: who + (ctx.campaignName ? ' · ' + ctx.campaignName : ''),
    link: ctx.taskId ? { k:'task', t: ctx.taskId, c: ctx.campaignId } : null,
  });
}

// Al salir de la app se intenta mandar lo que quede en la cola: un cambio de
// hace cinco segundos moriría con el timer. Es el mejor esfuerzo posible —el
// alta en Firestore puede no alcanzar a salir—, y aun así gana contra perderlo
// siempre.
window.addEventListener('pagehide', () => {
  [..._cambiosPendientes.keys()].forEach(key => {
    const pend = _cambiosPendientes.get(key);
    if(pend && pend.timer) clearTimeout(pend.timer);
    _vaciarCambioTarea(key.split('|')[0], key);
  });
});

// Las frases que arma cada mutación. Se nombran por CAMPO ("estado: …") porque
// _encolarCambioTarea agrupa por esa primera palabra para quedarse con el
// último valor de cada campo.
function _fraseEstado(status)  { return 'estado: ' + (TASK_STATUS_BY_ID[status]?.label || status); }
function _frasePrioridad(prio) { return 'prioridad: ' + (TASK_PRIO_BY_ID[prio]?.label || prio); }
function _fraseFecha(campo, valor) {
  const etiqueta = campo === 'clientDueDate' ? 'deadline cliente' : 'deadline interno';
  return etiqueta + ': ' + (valor ? formatDateShort(valor) : 'sin fecha');
}
function _fraseResponsable(uid) {
  if(!uid) return 'responsable: nadie';
  const u = (allUsers || []).find(x => x.uid === uid);
  return 'responsable: ' + (u ? (u.name || u.email.split('@')[0]) : 'otra persona');
}

// Etiquetar a alguien en una CAMPAÑA avisa igual que etiquetarlo en una tarea.
// Antes solo avisaban las tareas: te ponían de responsable de Cuentas de una
// campaña y no te enterabas hasta que alguien te escribía por otro lado.
const _CAMP_AREA_LABEL = {
  operaciones:'Operaciones', cuentas:'Cuentas', creativo:'Creativo',
  data:'Data', administracion:'Administración',
};

function _notifyCampaignRoles(campaignName, campaignId, added) {
  if(!added) return;
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';

  const send = (uid, texto, texoPropio) => {
    if(!uid) return;
    _createNotification({
      toUid: uid,
      type: 'campaign_role',
      text: uid === currentUser?.uid ? texoPropio : texto,
      link: campaignId ? { k:'campaign', c: campaignId } : null,
    });
  };

  Object.keys(added.responsables || {}).forEach(area => {
    const label = _CAMP_AREA_LABEL[area] || area;
    (added.responsables[area] || []).forEach(uid => send(uid,
      `🧭 ${who} te puso como responsable de ${label} en "${campaignName}"`,
      `🧭 Te pusiste como responsable de ${label} en "${campaignName}"`));
  });
}

// Diferencia entre dos mapas de responsables: solo los que ENTRAN.
// Sin esto, cada guardado de la campaña volvería a avisar a todo el mundo.
function _diffResponsables(antes, despues) {
  const out = {};
  const norm = v => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
  Object.keys(_CAMP_AREA_LABEL).forEach(area => {
    const viejos = new Set(norm((antes || {})[area]));
    const nuevos = norm((despues || {})[area]).filter(uid => !viejos.has(uid));
    if(nuevos.length) out[area] = nuevos;
  });
  return out;
}

// ============================================================
// CAMBIOS DEL TRACKER → CAMPANITA
// ============================================================
// El tracker es la fuente que más vistas alimenta y la única que no avisaba
// nada. Que una fila entre en Revisión INT (hay que leer el guión) o EXT (hay
// que empujar al cliente) es trabajo asignado a alguien, y sólo salía como un
// renglón gris en las alertas del Resumen: sin dueño y sin poder hacer clic.
//
// Dos decisiones que evitan convertir esto en spam:
//
// 1. Sólo diffea la sincronización QUE PIDIÓ UNA PERSONA. Las syncs de fondo
//    (el Resumen y el Calendario bajan trackers solos) no avisan. Si no, cada
//    navegador abierto generaría su propio juego de notificaciones para el
//    mismo cambio del Sheet.
// 2. La foto anterior vive en el documento de la campaña, no en el navegador:
//    así el diff es contra el último estado que vio el equipo, y no contra lo
//    que este navegador recuerde.
const _TRACKER_SNAP_MAX = 500;

function _trackerFilaClave(row) {
  const nombre = (typeof _trackerGet === 'function')
    ? _trackerGet(row, TRACKER_NAME_KEYS.concat(['Influencer','Creator'])) : '';
  const fecha = (typeof _trackerGet === 'function')
    ? _trackerGet(row, ['FECHA DE POST','Fecha de Post','Fecha']) : '';
  const clave = String(nombre||'').trim().toLowerCase() + '|' + String(fecha||'').trim();
  return clave === '|' ? '' : clave.slice(0, 80);
}

// Qué estado ocupa hoy esa fila, en una palabra. Es lo único que se guarda:
// la foto no es el tracker, es "en qué iba cada fila la última vez".
function _trackerFase(row) {
  const blob = [
    (typeof _trackerStatusOf === 'function') ? _trackerStatusOf(row) : '',
    (typeof _trackerGet === 'function') ? _trackerGet(row, ['ESTATUS GUIÓN','ESTATUS GUION','Estatus Guión','Estatus Guion']) : '',
  ].filter(Boolean).join(' · ');
  if(!blob.trim()) return '';
  if(typeof _isPublishedStatus === 'function' && _isPublishedStatus((typeof _trackerStatusOf==='function') ? _trackerStatusOf(row) : '')) return 'pub';
  if(/revisi[oó]n\s*\(?\s*ext/i.test(blob)) return 'ext';
  if(/revisi[oó]n\s*\(?\s*int/i.test(blob)) return 'int';
  return 'otro';
}

function _trackerSnapshot(rows) {
  const snap = {};
  (rows || []).slice(0, _TRACKER_SNAP_MAX).forEach(row => {
    const k = _trackerFilaClave(row);
    const f = _trackerFase(row);
    if(k && f) snap[k] = f;
  });
  return snap;
}

const _TRACKER_FASE_COPY = {
  int: { icono:'🔍', uno:'entró a Revisión INT — hay que leer el guión',        varios:'entraron a Revisión INT' },
  ext: { icono:'👀', uno:'entró a Revisión EXT — hay que empujar al cliente',   varios:'entraron a Revisión EXT' },
  pub: { icono:'🚀', uno:'ya se publicó',                                       varios:'ya se publicaron' },
};

// A quién le importa el tracker de una campaña: los responsables de área y
// quien la sigue. No se usa _notifyCampaignSubscribers porque ese además
// arrastra a cualquiera con una tarea abierta ahí, y una tarea de facturación
// no vuelve a nadie interesado en el estatus de un guión.
function _publicoDelTracker(campaign) {
  const resp = campaign.responsables || {};
  const responsables = Object.keys(resp).flatMap(k => (typeof getAreaUids==='function' ? getAreaUids(resp, k) : []));
  const siguen = (allUsers || [])
    .filter(u => Array.isArray(u.subscribedCampaigns) && u.subscribedCampaigns.includes(campaign.id))
    .map(u => u.uid);
  const legado = Array.isArray(campaign.subscribers) ? campaign.subscribers : [];
  return [...new Set([...responsables, ...siguen, ...legado].filter(Boolean))]
    .filter(uid => uid !== currentUser?.uid);
}

function _notifyTrackerChanges(campaign, rowsNuevas) {
  if(!campaign || !currentUser) return;
  const nueva = _trackerSnapshot(rowsNuevas);
  const previa = campaign.trackerSnapshot;
  // Primera sync de esta campaña: no hay contra qué comparar y anunciar 300
  // filas "nuevas" sería el peor primer contacto posible con la campanita.
  if(!previa || !Object.keys(previa).length) { _guardarSnapshotTracker(campaign, nueva); return; }

  const cambios = { int:[], ext:[], pub:[] };
  Object.keys(nueva).forEach(k => {
    const antes = previa[k];
    const ahora = nueva[k];
    if(antes === ahora || !_TRACKER_FASE_COPY[ahora]) return;
    // El nombre del creador es la primera mitad de la clave.
    cambios[ahora].push(k.split('|')[0] || 'Una publicación');
  });

  const gente = _publicoDelTracker(campaign);
  if(gente.length) {
    Object.keys(cambios).forEach(fase => {
      const lista = cambios[fase];
      if(!lista.length) return;
      const cp = _TRACKER_FASE_COPY[fase];
      // Más de tres: un resumen. Bajar un tracker atrasado no puede costar
      // cuarenta avisos.
      const texto = lista.length > 3
        ? `${cp.icono} ${lista.length} publicaciones ${cp.varios}`
        : `${cp.icono} ${lista.map(n => n.replace(/^./, ch => ch.toUpperCase())).join(', ')} ${cp.uno}`;
      gente.forEach(uid => _createNotification({
        toUid: uid,
        type: 'tracker',
        text: texto,
        meta: campaign.name,
        link: { k:'campaign', c: campaign.id, p:'tracker' },
      }));
    });
  }
  _guardarSnapshotTracker(campaign, nueva);
}

function _guardarSnapshotTracker(campaign, snap) {
  campaign.trackerSnapshot = snap;
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x => x.id === campaign.id);
  if(idx === -1) return;   // se borró mientras bajábamos el sheet
  campaigns[idx].trackerSnapshot = snap;
  guardarCampana(campaigns[idx]);
}

function _notifyCampaignSubscribers(campaign, summary) {
  if(!campaign) return;
  // Quién sigue esta campaña ahora vive en el perfil de cada quien. Se lee de
  // allUsers (el espejo en `members`) y se suma lo que quede del sistema viejo
  // dentro de la campaña, para no dejar de avisarle a quien todavía no haya
  // pasado por la migración.
  const porPerfil = (allUsers || [])
    .filter(u => Array.isArray(u.subscribedCampaigns) && u.subscribedCampaigns.includes(campaign.id))
    .map(u => u.uid);
  const legado = Array.isArray(campaign.subscribers) ? campaign.subscribers : [];
  const subs = [...porPerfil, ...legado];
  // Auto-subscribers: anyone with an active task in this campaign
  const taskUids = (campaign.tasks||[]).map(t => t.assigneeUid).filter(Boolean);
  const all = Array.from(new Set([...subs, ...taskUids])).filter(uid => uid && uid !== currentUser?.uid);
  const who = currentUserProfile?.name || currentUser?.email || 'Alguien';
  all.forEach(uid => _createNotification({
    toUid: uid,
    type: 'campaign_update',
    text: `📣 ${who} actualizó ${campaign.name}: ${summary}`,
    link: { k:'campaign', c: campaign.id },
  }));
}

/* La campanita del detalle. Escribía su propia lista dentro de la campaña,
   en paralelo a la del listado: dos botones para lo mismo, cada uno con su
   memoria, y ninguno deshacía lo del otro. Ahora es la misma acción. Se
   conserva el nombre porque lo llama un onclick del HTML generado. */
function toggleCampaignSubscription(campaignId) {
  if(!currentUser) return;
  return toggleSubscribeCampaign(campaignId);
}

async function sendKudos(toUid, e) {
  if(e) e.stopPropagation();
  const toUser = allUsers.find(u=>u.uid===toUid);
  if(!toUser) return;
  const name = toUser.name || toUser.email.split('@')[0];
  const emojis = ['🏆','⭐','🔥','💪','🎉','❤️','✨'];
  const pick = emojis[Math.floor(Math.random()*emojis.length)];
  await _createNotification({
    toUid,
    type: 'kudos',
    text: `${pick} ${currentUserProfile?.name||'Alguien'} te envió kudos. ¡Buen trabajo!`,
    link: { k:'page', p:'equipo' },
  });
  showToast(`Kudos enviado a ${name} ${pick}`,'success');
}

// ============================================================
// EMOJI REACTIONS ON TASKS
// ============================================================
const REACTION_EMOJIS = ['👍','❤️','🔥','✅','😅'];

function _reactionHtml(t, cid) {
  const reactions = t.reactions || {};
  const hasAny = Object.values(reactions).some(u=>u.length>0);
  const buttons = REACTION_EMOJIS.map(e => {
    const users = reactions[e] || [];
    const reacted = users.includes(currentUser?.uid);
    return users.length > 0 || !hasAny
      ? `<button class="reaction-btn ${reacted?'reacted':''}" onclick="toggleReaction('${t.id}','${cid}','${e}',event)">${e}${users.length>0?' '+users.length:''}</button>`
      : '';
  }).join('');
  // Show add-reaction button only if clicking it
  return `<div class="task-reactions" style="${hasAny?'':'display:none'}" id="reactions-${t.id}">${buttons}</div>`;
}

function toggleReaction(tid, cid, emoji, e) {
  if(e) e.stopPropagation();
  if(!currentUser) return;
  const uid = currentUser.uid;
  // Find task in cache
  let task = null;
  if(cid) {
    const c = _cache.campaigns.find(x=>x.id===cid);
    if(c) task = c.tasks.find(x=>x.id===tid);
  } else {
    task = (_cache.globalTasks||[]).find(x=>x.id===tid);
  }
  if(!task) return;
  if(!task.reactions) task.reactions = {};
  if(!task.reactions[emoji]) task.reactions[emoji] = [];
  const idx = task.reactions[emoji].indexOf(uid);
  if(idx > -1) task.reactions[emoji].splice(idx,1);
  else task.reactions[emoji].push(uid);
  // Persist
  if(cid) {
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===cid);
    if(c) { const t2=c.tasks.find(x=>x.id===tid); if(t2) t2.reactions=task.reactions; guardarCampana(c); }
  } else {
    const tasks = getData('globalTasks');
    const t2 = tasks.find(x=>x.id===tid);
    if(t2) { t2.reactions=task.reactions; setData('globalTasks',tasks); }
  }
  // Re-render reactions inline
  const el = document.getElementById('reactions-'+tid);
  if(el) {
    const hasAny = Object.values(task.reactions).some(u=>u.length>0);
    el.style.display = hasAny ? '' : 'none';
    el.innerHTML = REACTION_EMOJIS.map(em=>{
      const users = task.reactions[em]||[];
      const reacted = users.includes(uid);
      return users.length>0
        ? `<button class="reaction-btn ${reacted?'reacted':''}" onclick="toggleReaction('${tid}','${cid}','${em}',event)">${em} ${users.length}</button>`
        : '';
    }).join('');
  }
}

function showReactions(tid, cid, e) {
  if(e) e.stopPropagation();
  const el = document.getElementById('reactions-'+tid);
  if(el) {
    el.style.display = '';
    el.innerHTML = REACTION_EMOJIS.map(em=>`<button class="reaction-btn" onclick="toggleReaction('${tid}','${cid}','${em}',event)">${em}</button>`).join('');
  }
}
