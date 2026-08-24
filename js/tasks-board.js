/* Campaign OS — Tablero de pendientes (estilo Monday)
   Reemplaza el listado plano de la página Pendientes por un tablero con
   columnas (involucrados, estado, prioridad, fecha), agrupación configurable,
   filtros combinables y vista kanban con arrastre.

   Compatibilidad: las tareas viejas solo tienen `done`. El estado se deriva de
   ahí cuando no existe `status`, y `done` sigue siendo la fuente de verdad para
   "listo" (lo escriben el dashboard, la campaña y las tareas recurrentes). */

// ============================================================
// MODELO
// ============================================================
const TASK_STATUSES = [
  { id:'sin_empezar', label:'Sin empezar',        color:'#c4c4c4' },
  { id:'trabajando',  label:'Trabajando en ello', color:'#fdab3d' },
  { id:'revision',    label:'En revisión',        color:'#a25ddc' },
  { id:'atascado',    label:'Atascado',           color:'#e2445c' },
  { id:'listo',       label:'Listo',              color:'#00c875' },
];
const TASK_STATUS_BY_ID = Object.fromEntries(TASK_STATUSES.map(s => [s.id, s]));

/* Tinta legible sobre el color de la píldora.
   Los colores de estado y prioridad vienen de la paleta tipo Monday, y varios
   son claros: blanco sobre el gris de "Sin empezar" da 1.7:1 y sobre el ámbar
   de "Trabajando en ello" 1.9:1 — por debajo del 4.5:1 que pide WCAG para
   texto pequeño. Se elige tinta oscura o clara según la luminancia del fondo,
   así la píldora conserva su color y el texto se lee en las dos. */
function _tbInk(bg) {
  const h = String(bg||'').trim().replace('#','');
  const hex = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  if(!/^[0-9a-fA-F]{6}$/.test(hex)) return '#fff';
  const lin = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const L = 0.2126*lin(parseInt(hex.slice(0,2),16)) + 0.7152*lin(parseInt(hex.slice(2,4),16)) + 0.0722*lin(parseInt(hex.slice(4,6),16));
  // El umbral sale de comparar el contraste real contra blanco y contra la
  // tinta oscura: por encima de ~0.23 de luminancia gana el texto oscuro.
  return L > 0.23 ? '#12121c' : '#fff';
}

const TASK_PRIOS = [
  { id:'high',   label:'Alta',  color:'#e2445c' },
  { id:'medium', label:'Media', color:'#fdab3d' },
  { id:'low',    label:'Baja',  color:'#579bfc' },
];
const TASK_PRIO_BY_ID = Object.fromEntries(TASK_PRIOS.map(p => [p.id, p]));

// `done` manda: si está tachada es "listo" pase lo que pase con `status`.
// Las recurrentes no guardan status propio (su done es virtual por semana).
function taskStatus(t) {
  if(t.recurring) return t.done ? 'listo' : 'sin_empezar';
  if(t.done) return 'listo';
  return TASK_STATUS_BY_ID[t.status] ? t.status : 'sin_empezar';
}
function taskPrio(t) { return TASK_PRIO_BY_ID[t.priority] ? t.priority : 'medium'; }

// Roles de una tarea:
//   responsable   -> assigneeUid (uno solo, quien la saca)
//   supervisores  -> supervisors[] (jefe directo o quien necesita seguimiento)
//   colaboradores -> watchers[] (participan sin cargar con la entrega)
// El creador va aparte (se marca en el tooltip) para que se lea quién pidió la
// tarea sin ensuciar el conteo.
// El borrado desde el tablero pregunta con el TÍTULO de la tarea: "¿Eliminar
// esta tarea?" obliga a confiar en que el clic fue en la fila correcta.
async function _tbConfirmarBorrado(tid, cid) {
  const t = _tbCollectTasks().find(x => x.id === tid);
  const titulo = t && t.title ? `"${t.title}"` : 'esta tarea';
  if(!await confirmar({
    title: `¿Eliminar ${titulo}?`,
    body: 'Se va para todo el equipo y no hay forma de recuperarla.',
    confirmLabel: 'Eliminar tarea',
    cancelLabel: 'Conservar',
    danger: true,
  })) return;
  deleteTask(tid, cid);
}

function taskSupervisors(t) { return (t.supervisors || []).filter(Boolean); }
function taskWatchers(t)    { return (t.watchers    || []).filter(Boolean); }
function taskPeople(t) {
  const uids = [];
  const add = u => { if(u && !uids.includes(u)) uids.push(u); };
  add(t.assigneeUid);
  taskSupervisors(t).forEach(add);
  taskWatchers(t).forEach(add);
  return uids;
}
function taskInvolved(t) {
  const uids = taskPeople(t);
  if(t.createdBy && !uids.includes(t.createdBy)) uids.push(t.createdBy);
  return uids;
}
// Etiqueta legible del papel de alguien dentro de una tarea.
function taskRoleOf(t, uid) {
  if(uid && uid === t.assigneeUid) return 'Responsable';
  if(taskSupervisors(t).includes(uid)) return 'Supervisor';
  if(taskWatchers(t).includes(uid)) return 'Colaborador';
  if(uid === t.createdBy) return 'Creó la tarea';
  return 'Involucrado';
}

// ── Deadlines ──
// Dos fechas por tarea: la interna (lo que el equipo se compromete a tener) y
// la de cliente (lo que el cliente recibe o revisa). `dueDate` sigue siendo la
// interna para no romper dashboard, badge ni recurrentes; `clientDueDate` es
// la nueva. El interno debería caer antes que el de cliente: cuando no pasa,
// la fila lo marca en vez de callarlo.
const TASK_DUE_FIELDS = {
  interno: { key:'dueDate',       label:'Interno', short:'Int.' },
  cliente: { key:'clientDueDate', label:'Cliente', short:'Cli.' },
};
function taskDue(t, field) {
  return t[(TASK_DUE_FIELDS[field] || TASK_DUE_FIELDS.interno).key] || '';
}
// Fecha con la que se ordena y se avisa: la más próxima de las dos.
function taskNextDue(t) {
  const a = t.dueDate || '', b = t.clientDueDate || '';
  if(a && b) return a < b ? a : b;
  return a || b;
}
function taskDatesConflict(t) {
  return !!(t.dueDate && t.clientDueDate && t.dueDate > t.clientDueDate);
}

// ── Documentos ──
// Los links viven en `docLinks`: [{url, label}]. Las tareas viejas guardaban
// uno solo en `docLink`; se lee como si fuera el primero del arreglo, así que
// nada de lo ya capturado se pierde.
function taskDocLinks(t) {
  const out = (t.docLinks || []).filter(l => l && l.url);
  if(!out.length && t.docLink) out.push({ url:t.docLink, label:'' });
  return out;
}
// Etiqueta por defecto: el servicio, no una URL cruda de 180 caracteres que
// rompe el renglón y no dice nada.
function docLinkLabel(l) {
  if(l.label) return l.label;
  let u;
  try { u = new URL(l.url); } catch { return l.url; }
  const h = u.hostname.replace(/^www\./, '');
  if(h === 'docs.google.com') {
    if(u.pathname.startsWith('/spreadsheets')) return 'Google Sheets';
    if(u.pathname.startsWith('/presentation')) return 'Google Slides';
    if(u.pathname.startsWith('/forms'))        return 'Google Forms';
    return 'Google Docs';
  }
  return {
    'drive.google.com':'Google Drive', 'notion.so':'Notion', 'www.notion.so':'Notion',
    'figma.com':'Figma', 'dropbox.com':'Dropbox', 'canva.com':'Canva',
    'youtube.com':'YouTube', 'youtu.be':'YouTube', 'vimeo.com':'Vimeo',
    'instagram.com':'Instagram', 'tiktok.com':'TikTok',
  }[h] || h;
}
function _userByUid(uid) { return allUsers.find(u => u.uid === uid) || null; }
function _userName(u, fallback) {
  if(!u) return fallback || 'Sin asignar';
  return u.name || (u.email ? u.email.split('@')[0] : 'Sin nombre');
}

// ============================================================
// ESTADO DEL TABLERO (persistido en localStorage)
// ============================================================
/* v2: la clave cambió a propósito. La preferencia de agrupación se guardaba
   desde la primera versión, así que quien alguna vez la movió se quedaba con
   una lista plana por estado y ya no encontraba cómo volver. Al cambiar la
   clave, todo el mundo arranca otra vez en "por campaña" —que es como se piensa
   el trabajo aquí— sin perder nada más que unos filtros. */
const _TB_KEY = 'pendientesBoardPrefs.v2';
const _tb = {
  view: 'tabla',        // 'tabla' | 'kanban'
  groupBy: 'campaign',  // campaign | person | status | priority | date
  scope: 'mios',        // 'mios' | 'todos'
  search: '',
  people: [],           // uids involucrados; '__none__' = sin asignar
  statuses: [],
  prios: [],
  date: 'todos',        // todos | vencidas | hoy | semana | sin_fecha
  dateField: 'interno', // contra qué deadline miden los filtros de fecha
  showDone: false,
  collapsed: [],        // claves de grupo plegadas
};
function _tbLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(_TB_KEY) || '{}');
    Object.keys(saved).forEach(k => { if(k in _tb) _tb[k] = saved[k]; });
  } catch {}
}
function _tbSave() {
  try { localStorage.setItem(_TB_KEY, JSON.stringify(_tb)); } catch {}
}
_tbLoad();

// Atajo desde otras vistas (perfil, equipo): abre el tablero filtrado por alguien.
function setPendientesUser(uid) {
  _tb.people = uid ? [uid] : [];
  _tb.scope = uid ? 'todos' : _tb.scope;
  _tbSave();
  renderPendientes();
}

function _tbToggle(arrName, value) {
  const arr = _tb[arrName];
  const i = arr.indexOf(value);
  if(i >= 0) arr.splice(i, 1); else arr.push(value);
  _tbSave();
  renderPendientes();
}
function setTbView(v)    { _tb.view = v; _tbSave(); renderPendientes(); }
function setTbGroupBy(v) { _tb.groupBy = v; _tbSave(); renderPendientes(); }
function setTbScope(v)   { _tb.scope = v; _tbSave(); renderPendientes(); }
function setTbDate(v)    { _tb.date = v; _tbSave(); renderPendientes(); }
function setTbDateField(v){ _tb.dateField = v; _tbSave(); renderPendientes(); }
function setTbShowDone(v){ _tb.showDone = !!v; _tbSave(); renderPendientes(); }
function setTbSearch(v)  { _tb.search = v; renderPendientes(); }
function tbClearFilters() {
  _tb.search = ''; _tb.people = []; _tb.statuses = []; _tb.prios = [];
  _tb.date = 'todos'; _tb.dateField = 'interno'; _tb.showDone = false; _tb.scope = 'mios';
  _tbSave();
  renderPendientes();
}
function _tbHasFilters() {
  return !!(_tb.search || _tb.people.length || _tb.statuses.length || _tb.prios.length ||
            _tb.date !== 'todos' || _tb.showDone || _tb.scope !== 'mios');
}
// Cuántos filtros hay puestos. Va en el badge del botón "Filtros": sin eso,
// un filtro escondido en el panel se vuelve invisible y la lista miente.
function _tbFilterCount() {
  return (_tb.people.length ? 1 : 0) + (_tb.statuses.length ? 1 : 0) +
         (_tb.prios.length ? 1 : 0) + (_tb.date !== 'todos' ? 1 : 0) +
         (_tb.showDone ? 1 : 0);
}

// ============================================================
// FECHAS
// ============================================================
function _tbToday() { return new Date().toISOString().split('T')[0]; }
function _tbPlusDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
// Estado de UNA fecha suelta (sirve para interno y para cliente).
function _tbDayState(due, done) {
  if(done) return 'done';
  if(!due) return 'none';
  const today = _tbToday();
  if(due < today) return 'overdue';
  if(due === today) return 'today';
  if(due <= _tbPlusDays(7)) return 'soon';
  return 'later';
}
// Estado de la tarea contra el deadline elegido en los filtros (interno por
// defecto). El agrupado por fecha y el orden usan este.
function _tbDateState(t, field) {
  return _tbDayState(taskDue(t, field || _tb.dateField), taskStatus(t) === 'listo');
}
function _tbDayLabel(due) {
  if(!due) return 'Sin fecha';
  const st = _tbDayState(due, false);
  if(st === 'today') return 'Hoy';
  if(st === 'overdue') {
    const days = Math.round((new Date(_tbToday()) - new Date(due)) / 86400000);
    return `${formatDateShort(due)} · ${days}d tarde`;
  }
  return formatDateShort(due) || due;
}
function _tbDateLabel(t, field) { return _tbDayLabel(taskDue(t, field || _tb.dateField)); }

// ============================================================
// RECOLECCIÓN + FILTRADO
// ============================================================
function _tbCollectTasks() {
  const campaigns = visibleCampaigns();
  const globalTasks = getData('globalTasks') || [];
  const all = globalTasks.map(t => ({ ...t, campaignId:'', campaignName: t.campaignName || 'General' }));
  campaigns.forEach(c => (c.tasks || []).forEach(t =>
    all.push({ ...t, campaignId: c.id, campaignName: c.name })));

  // Recurrentes: instancia virtual de la semana en curso.
  const today = _tbToday();
  return all.map(t => {
    if(!t.recurring || t.recurringDay === undefined) return t;
    const diff = ((t.recurringDay - new Date(today + 'T12:00:00').getDay()) + 7) % 7;
    const occ = new Date(today + 'T12:00:00');
    occ.setDate(occ.getDate() + diff);
    const occStr = occ.toISOString().split('T')[0];
    return { ...t, dueDate: occStr, done: t.lastDoneDate === occStr, _isRecurring: true };
  });
}

function _tbFilter(tasks) {
  const today = _tbToday();
  const weekEnd = _tbPlusDays(7);
  const q = _tb.search.trim().toLowerCase();

  return tasks.filter(t => {
    const st = taskStatus(t);

    if(!_tb.showDone && st === 'listo') return false;

    if(_tb.scope === 'mios' && currentUser) {
      const involved = taskInvolved(t);
      if(t.assigneeUid && !involved.includes(currentUser.uid)) return false;
    }

    if(_tb.people.length) {
      const involved = taskInvolved(t);
      const match = _tb.people.some(uid =>
        uid === '__none__' ? !t.assigneeUid : involved.includes(uid));
      if(!match) return false;
    }

    if(_tb.statuses.length && !_tb.statuses.includes(st)) return false;
    if(_tb.prios.length && !_tb.prios.includes(taskPrio(t))) return false;

    if(_tb.date !== 'todos') {
      const due = taskDue(t, _tb.dateField);
      if(_tb.date === 'sin_fecha' && due) return false;
      if(_tb.date === 'vencidas' && !(due && due < today && st !== 'listo')) return false;
      if(_tb.date === 'hoy' && due !== today) return false;
      if(_tb.date === 'semana' && !(due && due >= today && due <= weekEnd)) return false;
    }

    if(q) {
      const hay = [t.title, t.notes, t.campaignName, t.assignee]
        .concat(taskInvolved(t).map(uid => _userName(_userByUid(uid), '')))
        .join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

const _TB_PRIO_ORDER = { high:0, medium:1, low:2 };
function _tbSort(tasks) {
  return tasks.slice().sort((a, b) => {
    const da = taskStatus(a) === 'listo', db = taskStatus(b) === 'listo';
    if(da !== db) return da ? 1 : -1;
    const oa = _tbDateState(a) === 'overdue', ob = _tbDateState(b) === 'overdue';
    if(oa !== ob) return oa ? -1 : 1;
    const pa = _TB_PRIO_ORDER[taskPrio(a)], pb = _TB_PRIO_ORDER[taskPrio(b)];
    if(pa !== pb) return pa - pb;
    const na = taskNextDue(a), nb = taskNextDue(b);
    if(!!na !== !!nb) return na ? -1 : 1;
    if(na && nb && na !== nb) return na < nb ? -1 : 1;
    return 0;
  });
}

// ============================================================
// AGRUPACIÓN
// ============================================================
const _TB_GROUP_COLORS = ['#ff2d87','#2c6dff','#a25ddc','#00c875','#fdab3d','#e2445c','#0086c0','#7f5347'];
function _tbGroupColor(key) {
  let h = 0;
  for(let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return _TB_GROUP_COLORS[h % _TB_GROUP_COLORS.length];
}

function _tbGroup(tasks) {
  const groups = new Map(); // key -> {key,label,color,tasks}
  const push = (key, label, color, t) => {
    if(!groups.has(key)) groups.set(key, { key, label, color: color || _tbGroupColor(key), tasks: [] });
    groups.get(key).tasks.push(t);
  };

  tasks.forEach(t => {
    if(_tb.groupBy === 'campaign') {
      push('c:' + (t.campaignId || 'general'), t.campaignName || 'General', null, t);
    } else if(_tb.groupBy === 'person') {
      if(!t.assigneeUid) push('p:none', 'Sin asignar', '#c4c4c4', t);
      else push('p:' + t.assigneeUid, _userName(_userByUid(t.assigneeUid), t.assignee), null, t);
    } else if(_tb.groupBy === 'status') {
      const s = TASK_STATUS_BY_ID[taskStatus(t)];
      push('s:' + s.id, s.label, s.color, t);
    } else if(_tb.groupBy === 'priority') {
      const p = TASK_PRIO_BY_ID[taskPrio(t)];
      push('r:' + p.id, 'Prioridad ' + p.label.toLowerCase(), p.color, t);
    } else { // date
      const st = _tbDateState(t);
      const meta = {
        overdue: ['d:0', 'Vencidas',      '#e2445c'],
        today:   ['d:1', 'Hoy',           '#fdab3d'],
        soon:    ['d:2', 'Esta semana',   '#0086c0'],
        later:   ['d:3', 'Más adelante',  '#579bfc'],
        none:    ['d:4', 'Sin fecha',     '#c4c4c4'],
        done:    ['d:5', 'Listas',        '#00c875'],
      }[st];
      // El grupo dice contra qué deadline se agrupó: "Vencidas" a secas no
      // distingue si es el interno o el que ve el cliente.
      const suffix = st === 'done' ? '' : ` · deadline ${TASK_DUE_FIELDS[_tb.dateField].label.toLowerCase()}`;
      push(meta[0], meta[1] + suffix, meta[2], t);
    }
  });

  const list = [...groups.values()];
  if(_tb.groupBy === 'status') {
    const order = TASK_STATUSES.map(s => 's:' + s.id);
    list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else if(_tb.groupBy === 'priority') {
    const order = TASK_PRIOS.map(p => 'r:' + p.id);
    list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else if(_tb.groupBy === 'date') {
    list.sort((a, b) => a.key.localeCompare(b.key));
  } else if(_tb.groupBy === 'campaign') {
    // Una campaña con algo vencido va antes que una con más tareas pero al día:
    // el bloque de arriba tiene que ser el que hay que mirar hoy. "General"
    // (las tareas sueltas) cierra siempre: no es una campaña.
    const venc = g => g.tasks.filter(t => _tbDateState(t) === 'overdue').length;
    const pend = g => g.tasks.filter(t => taskStatus(t) !== 'listo').length;
    const suelto = g => (g.key === 'c:general' ? 1 : 0);
    list.sort((a, b) => suelto(a) - suelto(b) || venc(b) - venc(a) || pend(b) - pend(a) || a.label.localeCompare(b.label));
  } else {
    list.sort((a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label));
  }
  list.forEach(g => { g.tasks = _tbSort(g.tasks); });
  return list;
}

// ============================================================
// PIEZAS DE UI
// ============================================================
// `ring` marca el papel: rosa = responsable, azul = supervisor, sin anillo =
// colaborador. Es la única pista de rol que cabe en una pila de avatares.
const _TB_RING = { responsable:'var(--pink)', supervisor:'#0086c0' };
function _tbAvatar(u, size, ring) {
  const bg = (u && u.profileGradient) || 'var(--lavender)';
  const content = u ? (u.profileEmoji || (u.name || u.email || '?')[0].toUpperCase()) : '?';
  const fs = u && u.profileEmoji ? Math.round(size * 0.6) : Math.round(size * 0.48);
  const col = ring === true ? _TB_RING.responsable : _TB_RING[ring];
  const shadow = col
    ? `box-shadow:0 0 0 2px var(--white),0 0 0 3.5px ${col};`
    : 'box-shadow:0 0 0 2px var(--white);';
  return `<span class="tb-av" style="width:${size}px;height:${size}px;background:${bg};font-size:${fs}px;${shadow}">${content}</span>`;
}

// Pila de involucrados: responsable primero (con anillo), luego seguidores,
// luego el creador. Es la columna "People" de Monday.
function _tbPeopleStack(t, size = 26) {
  const people = taskPeople(t);
  const creator = t.createdBy && !people.includes(t.createdBy) ? t.createdBy : null;
  const chips = [];

  if(!people.length && !creator) {
    return `<span class="tb-av tb-av-empty" style="width:${size}px;height:${size}px;" title="Sin asignar">?</span>`;
  }
  people.slice(0, 3).forEach(uid => {
    const u = _userByUid(uid);
    const role = taskRoleOf(t, uid);
    const ring = role === 'Responsable' ? 'responsable' : role === 'Supervisor' ? 'supervisor' : '';
    chips.push(`<span class="tb-av-wrap" data-uid="${_esc(uid)}" title="${_esc(_userName(u, t.assignee))} — ${role}">${_tbAvatar(u, size, ring)}</span>`);
  });
  if(people.length > 3) {
    chips.push(`<span class="tb-av tb-av-more" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.4)}px;" title="${people.slice(3).map(uid=>_esc(_userName(_userByUid(uid),'')) + ' — ' + taskRoleOf(t, uid)).join(', ')}">+${people.length - 3}</span>`);
  }
  if(creator) {
    const cu = _userByUid(creator);
    chips.push(`<span class="tb-av-wrap tb-av-creator" data-uid="${_esc(creator)}" title="${_esc(_userName(cu, ''))} — creó la tarea">${_tbAvatar(cu, size - 4, false)}</span>`);
  }
  return `<span class="tb-stack">${chips.join('')}</span>`;
}

function _tbStatusCell(t) {
  const s = TASK_STATUS_BY_ID[taskStatus(t)];
  return `<button class="tb-pill tb-status" data-act="status" data-tid="${_esc(t.id)}" data-cid="${_esc(t.campaignId||'')}" style="background:${s.color};color:${_tbInk(s.color)};">${s.label}</button>`;
}
function _tbPrioCell(t) {
  const p = TASK_PRIO_BY_ID[taskPrio(t)];
  return `<button class="tb-pill tb-prio" data-act="prio" data-tid="${_esc(t.id)}" data-cid="${_esc(t.campaignId||'')}" style="background:${p.color};color:${_tbInk(p.color)};">${p.label}</button>`;
}
// La celda muestra los dos deadlines apilados: el interno manda (es el que el
// equipo trabaja) y el de cliente va debajo, más chico. Si solo hay uno, no se
// pinta una línea vacía. El orden se invierte si los filtros miran al cliente.
function _tbDateCell(t) {
  const done = taskStatus(t) === 'listo';
  const primary = _tb.dateField === 'cliente' ? 'cliente' : 'interno';
  const secondary = primary === 'cliente' ? 'interno' : 'cliente';
  const pDue = taskDue(t, primary), sDue = taskDue(t, secondary);
  const conflict = taskDatesConflict(t);
  const rows = [
    `<span class="tb-date tb-date-${_tbDayState(pDue, done)}">${_tbDayLabel(pDue)}</span>`
  ];
  if(sDue) {
    rows.push(`<span class="tb-date-sub tb-date-${_tbDayState(sDue, done)}" title="Deadline ${TASK_DUE_FIELDS[secondary].label.toLowerCase()}">${TASK_DUE_FIELDS[secondary].short} ${_tbDayLabel(sDue)}</span>`);
  }
  return `<span class="tb-dates${conflict ? ' tb-dates-conflict' : ''}"${conflict ? ' title="El deadline interno cae después del de cliente"' : ''}>${rows.join('')}</span>`;
}

const _TB_ICN_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>';
const _TB_ICN_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

/* Agrupaciones que además se pueden GESTIONAR: arrastrar una fila a otro bloque
   cambia el dato por el que está agrupada. Sirve para prioridad y estado, que
   son campos de la tarea; no para campaña (mover una tarea de campaña es otra
   cosa, con permisos de por medio) ni para deadline o responsable. */
const _TB_DRAG_GROUPS = { priority:'prio', status:'status' };
function _tbDragMode() { return _TB_DRAG_GROUPS[_tb.groupBy] || ''; }

function _tbRow(t) {
  const done = taskStatus(t) === 'listo';
  const cid = t.campaignId || '';
  const drag = _tbDragMode() ? ' draggable="true"' : '';
  return `
  <div class="tb-row${done ? ' tb-row-done' : ''}${_tbDragMode() ? ' tb-row-drag' : ''}"${drag} data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">
    <div class="tb-cell tb-cell-check">
      <span class="task-check ${done ? 'done' : ''}" data-act="toggle" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}" title="${done ? 'Reabrir' : 'Marcar listo'}"></span>
    </div>
    <div class="tb-cell tb-cell-title" data-act="open" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">
      <span class="tb-title">${_esc(t.title)}</span>
      <span class="tb-sub">
        ${_tb.groupBy !== 'campaign' && t.campaignName ? `<span class="tb-tag">${_esc(t.campaignName)}</span>` : ''}
        ${t._isRecurring ? '<span class="tb-tag tb-tag-rec">🔄 Semanal</span>' : ''}
        ${t.notes ? '<span class="tb-tag" title="Tiene notas">📝</span>' : ''}
        ${(() => {
          const links = taskDocLinks(t);
          if(!links.length) return '';
          const title = links.map(l => docLinkLabel(l)).join(', ');
          return `<span class="tb-tag" title="${_esc(title)}">🔗${links.length > 1 ? ' ' + links.length : ''}</span>`;
        })()}
      </span>
    </div>
    <div class="tb-meta">
      <div class="tb-cell tb-cell-people">${_tbPeopleStack(t)}</div>
      <div class="tb-cell tb-cell-status">${_tbStatusCell(t)}</div>
      <div class="tb-cell tb-cell-prio">${_tbPrioCell(t)}</div>
      <div class="tb-cell tb-cell-date">${_tbDateCell(t)}</div>
    </div>
    <div class="tb-cell tb-cell-actions">
      <button class="tb-icon-btn" data-act="edit" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}" title="Editar">${_TB_ICN_EDIT}</button>
      <button class="tb-icon-btn tb-icon-danger" data-act="del" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}" title="Eliminar">${_TB_ICN_TRASH}</button>
    </div>
  </div>`;
}

function _tbGroupHtml(g) {
  const collapsed = _tb.collapsed.includes(g.key);
  const pend = g.tasks.filter(t => taskStatus(t) !== 'listo').length;
  const overdue = g.tasks.filter(t => _tbDateState(t) === 'overdue').length;
  // Involucrados del grupo: quién carga con este bloque de trabajo.
  const uids = [...new Set(g.tasks.flatMap(t => taskPeople(t)))];
  const stack = uids.slice(0, 5).map(uid => `<span class="tb-av-wrap" data-uid="${_esc(uid)}" title="${_esc(_userName(_userByUid(uid), ''))}">${_tbAvatar(_userByUid(uid), 22, false)}</span>`).join('')
    + (uids.length > 5 ? `<span class="tb-av tb-av-more" style="width:22px;height:22px;font-size:9px;">+${uids.length - 5}</span>` : '');

  const arrastrable = !!_tbDragMode();
  return `
  <section class="tb-group${collapsed ? ' collapsed' : ''}" data-gkey="${_esc(g.key)}" style="--g-color:${g.color};">
    <header class="tb-group-head" data-act="collapse" data-key="${_esc(g.key)}">
      <span class="tb-chev">▾</span>
      <span class="tb-group-name">${_esc(g.label)}</span>
      <span class="tb-group-count">${pend} pendiente${pend !== 1 ? 's' : ''} · ${g.tasks.length} total</span>
      ${overdue ? `<span class="tb-group-overdue">${overdue} vencida${overdue !== 1 ? 's' : ''}</span>` : ''}
      <span class="tb-stack tb-group-stack">${stack}</span>
      ${arrastrable ? `<span class="tb-group-drop">Suelta aquí para marcar ${_esc(g.label.toLowerCase())}</span>` : ''}
    </header>
    <div class="tb-group-body">
      <div class="tb-group-inner">
        <div class="tb-row tb-head-row">
          <div class="tb-cell tb-cell-check"></div>
          <div class="tb-cell tb-cell-title">Tarea</div>
          <div class="tb-meta">
            <div class="tb-cell tb-cell-people">Involucrados</div>
            <div class="tb-cell tb-cell-status">Estado</div>
            <div class="tb-cell tb-cell-prio">Prioridad</div>
            <div class="tb-cell tb-cell-date">Deadlines</div>
          </div>
          <div class="tb-cell tb-cell-actions"></div>
        </div>
        ${g.tasks.map(_tbRow).join('')}
      </div>
    </div>
  </section>`;
}

// ---- Kanban ----
function _tbCard(t) {
  const cid = t.campaignId || '';
  const p = TASK_PRIO_BY_ID[taskPrio(t)];
  return `
  <article class="tb-card" draggable="true" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">
    <div class="tb-card-top">
      <span class="tb-card-prio" style="background:${p.color};color:${_tbInk(p.color)};">${p.label}</span>
      ${_tbDateCell(t)}
    </div>
    <div class="tb-card-title" data-act="open" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">${_esc(t.title)}</div>
    <div class="tb-card-foot">
      <span class="tb-tag">${_esc(t.campaignName || 'General')}</span>
      ${_tbPeopleStack(t, 24)}
    </div>
  </article>`;
}

function _tbKanbanHtml(tasks, fresh) {
  const byStatus = {};
  TASK_STATUSES.forEach(s => byStatus[s.id] = []);
  tasks.forEach(t => byStatus[taskStatus(t)].push(t));
  return `<div class="tb-kanban${fresh || ''}">${TASK_STATUSES.map(s => {
    const list = _tbSort(byStatus[s.id]);
    return `<div class="tb-col" data-status="${s.id}" style="--g-color:${s.color};">
      <div class="tb-col-head"><span class="tb-col-dot"></span>${s.label}<span class="tb-col-count">${list.length}</span></div>
      <div class="tb-col-body">${list.map(_tbCard).join('') || '<div class="tb-col-empty">Suelta una tarea aquí</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}

// ============================================================
// BARRA DE FILTROS
// ============================================================
// Antes eran cuatro filas apiladas y una de ellas listaba a TODO el equipo:
// con ocho personas la barra tapaba la primera tarea. Ahora hay una sola fila
// siempre visible (buscar, alcance, filtros, agrupar, vista) y el resto vive
// en un panel. Lo que sí queda a la vista son los filtros puestos, en chips
// que se quitan de uno en uno: esconder un filtro sin decirlo hace que la
// lista parezca incompleta y nadie sepa por qué.
let _tbPanelOpen = false;
let _tbPeopleQuery = '';
function setTbPeopleQuery(v) { _tbPeopleQuery = v; renderPendientes(); }
function toggleTbPanel(force) {
  _tbPanelOpen = force === undefined ? !_tbPanelOpen : !!force;
  if(!_tbPanelOpen) _tbPeopleQuery = '';
  renderPendientes();
}

const _TB_DATE_OPTS = [
  ['todos','Todas'], ['vencidas','Vencidas'], ['hoy','Hoy'],
  ['semana','Próx. 7 días'], ['sin_fecha','Sin fecha'],
];

/* Agrupar dejó de ser un <select> escondido entre los filtros: era la decisión
   más importante del tablero —"enséñame el trabajo por campaña" vs "por lo que
   urge"— y estaba a dos clics y sin señal de cuál estaba puesta. Ahora es una
   fila de botones con el actual marcado. El orden empieza por Campaña porque
   es el default y la forma en que el equipo habla del trabajo. */
const _TB_GROUPS = [
  ['campaign','Campaña'], ['priority','Prioridad'], ['person','Responsable'],
  ['status','Estado'], ['date','Deadline'],
];

const _TB_ICN_FILTER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M7 12h10M10 19h4"/></svg>';

// Chips de "esto está filtrado ahora". Cada uno se quita solo.
function _tbActiveChips(all) {
  const out = [];
  const chip = (label, act, val) =>
    `<button class="tb-active-chip" data-act="${act}"${val !== undefined ? ` data-val="${_esc(val)}"` : ''}>
      <span>${label}</span><i aria-hidden="true">×</i></button>`;

  if(_tb.scope !== 'mios') out.push(chip('Todo el equipo', 'scope', 'mios'));
  if(_tb.search) out.push(chip(`Busca «${_esc(_tb.search)}»`, 'clear-search'));
  _tb.people.forEach(uid => {
    const name = uid === '__none__' ? 'Sin responsable' : _esc(_userName(_userByUid(uid), 'Alguien'));
    out.push(chip(name, 'person', uid));
  });
  _tb.statuses.forEach(id => out.push(chip(_esc(TASK_STATUS_BY_ID[id].label), 'status-f', id)));
  _tb.prios.forEach(id => out.push(chip('Prioridad ' + _esc(TASK_PRIO_BY_ID[id].label.toLowerCase()), 'prio-f', id)));
  if(_tb.date !== 'todos') {
    const lbl = (_TB_DATE_OPTS.find(o => o[0] === _tb.date) || ['', _tb.date])[1];
    out.push(chip(`${_esc(lbl)} · deadline ${TASK_DUE_FIELDS[_tb.dateField].label.toLowerCase()}`, 'date', 'todos'));
  }
  if(_tb.showDone) out.push(chip('Incluye listas', 'showdone'));

  if(!out.length) return '';
  return `<div class="tb-active-row">
    <span class="tb-flabel">Filtrando por</span>
    ${out.join('')}
    <button class="tb-clear" data-act="clear">Limpiar todo</button>
  </div>`;
}

function _tbPanelHtml(all) {
  const chip = (on, extra, attrs, inner) =>
    `<button class="tb-chip${on ? ' on' : ''}${extra ? ' ' + extra : ''}" ${attrs}>${inner}</button>`;

  // Personas: solo quienes de verdad participan en alguna tarea visible.
  const involvedUids = [...new Set(all.flatMap(t => taskInvolved(t)))];
  const q = _tbPeopleQuery.trim().toLowerCase();
  const people = involvedUids.map(uid => _userByUid(uid)).filter(Boolean)
    .filter(u => !q || _userName(u, '').toLowerCase().includes(q))
    .sort((a, b) => _userName(a, '').localeCompare(_userName(b, '')));
  const unassigned = all.filter(t => !t.assigneeUid).length;
  const loadOf = uid => all.filter(t => taskInvolved(t).includes(uid) && taskStatus(t) !== 'listo').length;
  const doneCount = all.filter(t => taskStatus(t) === 'listo').length;
  const dateCount = v => {
    const today = _tbToday(), weekEnd = _tbPlusDays(7);
    return all.filter(t => {
      const due = taskDue(t, _tb.dateField);
      if(v === 'vencidas')  return due && due < today && taskStatus(t) !== 'listo';
      if(v === 'hoy')       return due === today;
      if(v === 'semana')    return due && due >= today && due <= weekEnd;
      if(v === 'sin_fecha') return !due;
      return 0;
    }).length;
  };

  const personRow = (uid, avatar, name, n) => {
    const on = _tb.people.includes(uid);
    return `<button class="tb-person-row${on ? ' on' : ''}" data-act="person" data-val="${_esc(uid)}">
      <span class="tb-person-check" aria-hidden="true"></span>
      ${avatar}
      <span class="tb-person-name">${name}</span>
      <span class="tb-chip-n">${n}</span>
    </button>`;
  };

  return `
  <div class="tb-panel" id="tbFilterPanel">
    <div class="tb-panel-head">
      <span>Filtros</span>
      <button class="tb-panel-x" data-act="filters-close" aria-label="Cerrar filtros">×</button>
    </div>

    <div class="tb-panel-sec">
      <div class="tb-panel-label">Personas</div>
      <div class="tb-search tb-search-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="tbPeopleSearch" placeholder="Buscar persona..." value="${_esc(_tbPeopleQuery)}" oninput="setTbPeopleQuery(this.value)">
      </div>
      <div class="tb-person-list">
        ${unassigned ? personRow('__none__', '<span class="tb-av tb-av-empty" style="width:22px;height:22px;">?</span>', 'Sin responsable', unassigned) : ''}
        ${people.map(u => personRow(u.uid, _tbAvatar(u, 22, false), _esc(_userName(u, '')), loadOf(u.uid))).join('')
          || (q ? '<div class="tb-panel-empty">Nadie con ese nombre tiene tareas aquí.</div>' : '')}
      </div>
    </div>

    <div class="tb-panel-sec">
      <div class="tb-panel-label">Estado</div>
      <div class="tb-panel-chips">
        ${TASK_STATUSES.map(s => chip(_tb.statuses.includes(s.id), 'tb-chip-dot', `data-act="status-f" data-val="${s.id}"`,
          `<i style="background:${s.color}"></i>${s.label}`)).join('')}
      </div>
    </div>

    <div class="tb-panel-sec">
      <div class="tb-panel-label">Prioridad</div>
      <div class="tb-panel-chips">
        ${TASK_PRIOS.map(p => chip(_tb.prios.includes(p.id), 'tb-chip-dot', `data-act="prio-f" data-val="${p.id}"`,
          `<i style="background:${p.color}"></i>${p.label}`)).join('')}
      </div>
    </div>

    <div class="tb-panel-sec">
      <div class="tb-panel-label">Deadline
        <div class="tb-seg tb-seg-sm">
          ${Object.entries(TASK_DUE_FIELDS).map(([k, f]) =>
            chip(_tb.dateField === k, 'tb-seg-btn', `data-act="datefield" data-val="${k}"`, f.label)).join('')}
        </div>
      </div>
      <div class="tb-panel-chips">
        ${_TB_DATE_OPTS.map(([v, l]) => {
          const n = v === 'todos' ? 0 : dateCount(v);
          return chip(_tb.date === v, '', `data-act="date" data-val="${v}"`,
            `${l}${n ? `<span class="tb-chip-n">${n}</span>` : ''}`);
        }).join('')}
      </div>
      <div class="tb-panel-hint">Las fechas de arriba miden contra el deadline ${TASK_DUE_FIELDS[_tb.dateField].label.toLowerCase()}.</div>
    </div>

    <div class="tb-panel-sec">
      <div class="tb-panel-chips">
        ${chip(_tb.showDone, '', 'data-act="showdone"', `Mostrar tareas listas${doneCount ? `<span class="tb-chip-n">${doneCount}</span>` : ''}`)}
      </div>
    </div>

    <div class="tb-panel-foot">
      <button class="tb-clear" data-act="clear">Limpiar todo</button>
      <button class="btn btn-primary btn-sm" data-act="filters-close">Ver resultados</button>
    </div>
  </div>`;
}

function _tbToolbarHtml(all, shown) {
  const chip = (on, extra, attrs, inner) =>
    `<button class="tb-chip${on ? ' on' : ''}${extra ? ' ' + extra : ''}" ${attrs}>${inner}</button>`;
  const nFilters = _tbFilterCount();

  return `
  <div class="tb-toolbar${_tbPanelOpen ? ' panel-open' : ''}">
    <div class="tb-bar">
      <div class="tb-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="tbSearchInput" placeholder="Buscar tarea, persona o campaña..." value="${_esc(_tb.search)}" oninput="setTbSearch(this.value)">
      </div>
      <div class="tb-seg">
        ${chip(_tb.scope === 'mios', 'tb-seg-btn', 'data-act="scope" data-val="mios"', 'Donde participo')}
        ${chip(_tb.scope === 'todos', 'tb-seg-btn', 'data-act="scope" data-val="todos"', 'Todo el equipo')}
      </div>
      <button class="tb-filter-btn${nFilters ? ' has' : ''}${_tbPanelOpen ? ' open' : ''}" data-act="filters-open"
        aria-expanded="${_tbPanelOpen}" aria-controls="tbFilterPanel">
        ${_TB_ICN_FILTER}Filtros${nFilters ? `<span class="tb-chip-n">${nFilters}</span>` : ''}
      </button>
      <div class="tb-seg tb-seg-group" role="group" aria-label="Agrupar tareas">
        <span class="tb-seg-label">Ver por</span>
        ${_TB_GROUPS.map(([v, l]) => chip(_tb.groupBy === v, 'tb-seg-btn', `data-act="group" data-val="${v}"`, l)).join('')}
      </div>
      <div class="tb-seg tb-seg-group" role="group" aria-label="Vista del tablero">
        <span class="tb-seg-label">Vista</span>
        ${chip(_tb.view === 'tabla',  'tb-seg-btn', 'data-act="view" data-val="tabla"', 'Tabla')}
        ${chip(_tb.view === 'kanban', 'tb-seg-btn', 'data-act="view" data-val="kanban"', 'Kanban')}
      </div>
      <span class="tb-result">${shown} de ${all.length} tareas</span>
    </div>
    ${_tbActiveChips(all)}
    ${_tbPanelOpen ? _tbPanelHtml(all) : ''}
  </div>`;
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function renderPendientes() {
  const el = document.getElementById('allTasksList');
  if(!el) return;

  const all = _tbCollectTasks();
  const filtered = _tbFilter(all);

  const toolbarEl = document.getElementById('pendientesToolbar');
  if(toolbarEl) {
    // La barra se repinta entera en cada tecla. Sin esto el cursor se pierde
    // al segundo carácter, tanto en el buscador de tareas como en el de gente.
    const ae = document.activeElement;
    const keepId = ae && toolbarEl.contains(ae) && ae.id ? ae.id : null;
    const caret = keepId ? ae.selectionStart : null;
    toolbarEl.innerHTML = _tbToolbarHtml(all, filtered.length);
    if(keepId) {
      const inp = document.getElementById(keepId);
      if(inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch {} }
    }
  }

  // Las entradas escalonadas solo corren al llegar a la página. Un re-render
  // por filtro o por cambio de estado no debe volver a animar toda la lista.
  const fresh = _tbFresh ? ' is-fresh' : '';
  _tbFresh = false;

  if(!filtered.length) {
    el.innerHTML = `<div class="empty-state"><p>${_tbHasFilters() ? 'Ninguna tarea coincide con estos filtros.' : 'No tienes pendientes por ahora 🎉'}</p>${_tbHasFilters() ? '<button class="btn btn-ghost btn-sm" data-act="clear" style="margin-top:10px;">Limpiar filtros</button>' : ''}</div>`;
  } else if(_tb.view === 'kanban') {
    el.innerHTML = _tbKanbanHtml(filtered, fresh);
  } else {
    // La alternativa sin arrastre se nombra en la misma frase: WCAG 2.2 pide
    // que arrastrar no sea el único camino, y de paso quien no descubre el
    // gesto no se queda sin la función.
    const campo = _tb.groupBy === 'priority' ? 'la prioridad' : 'el estado';
    const pildora = _tb.groupBy === 'priority' ? 'Prioridad' : 'Estado';
    const pista = _tbDragMode()
      ? `<p class="tb-hint">Arrastra una tarea a otro bloque para cambiarle ${campo} — o tócala en la columna ${pildora}.</p>`
      : '';
    el.innerHTML = `<div class="tb-board${fresh}">${pista}${_tbGroup(filtered).map(_tbGroupHtml).join('')}</div>`;
  }

  // El badge siempre cuenta MIS pendientes, no lo que muestre el filtro.
  if(typeof _refreshPendCount === 'function') _refreshPendCount();
}

// ============================================================
// MUTACIONES
// ============================================================
function _tbFindTask(tid, cid) {
  if(cid) {
    const campaigns = getData('campaigns');
    const c = campaigns.find(x => x.id === cid);
    const t = c && (c.tasks || []).find(x => x.id === tid);
    return t ? { t, commit: () => setData('campaigns', campaigns) } : null;
  }
  const tasks = getData('globalTasks');
  const t = tasks.find(x => x.id === tid);
  return t ? { t, commit: () => setData('globalTasks', tasks) } : null;
}

// Cambiar estado desde el tablero. 'listo' sincroniza `done`/`doneAt` para que
// el dashboard, la campaña y el badge sigan cuadrando.
function setTaskStatus(tid, cid, status) {
  const found = _tbFindTask(tid, cid);
  if(!found) { showToast('Tarea no encontrada', 'error'); return; }
  const { t, commit } = found;
  if(t.recurring) { toggleTask(tid, cid); return; }
  const wasDone = !!t.done;
  t.status = status;
  t.done = status === 'listo';
  t.doneAt = t.done ? (t.doneAt || Date.now()) : null;
  commit();
  if(t.done && !wasDone) { try { _onTaskDone(tid); } catch {} }
  rerenderCurrent();
}

function setTaskPriority(tid, cid, prio) {
  const found = _tbFindTask(tid, cid);
  if(!found) return;
  found.t.priority = prio;
  found.commit();
  rerenderCurrent();
}

// ============================================================
// MENÚ FLOTANTE (estado / prioridad en línea)
// ============================================================
let _tbMenuEl = null;
function _tbCloseMenu() { if(_tbMenuEl) { _tbMenuEl.remove(); _tbMenuEl = null; } }
document.addEventListener('click', e => {
  if(_tbMenuEl && !_tbMenuEl.contains(e.target) && !e.target.closest('.tb-pill')) _tbCloseMenu();
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape') return;
  _tbCloseMenu();
  if(_tbPanelOpen) toggleTbPanel(false);
});
// Clic fuera del panel de filtros lo cierra. El botón que lo abre se excluye
// para que no se cierre y se vuelva a abrir en el mismo clic.
document.addEventListener('click', e => {
  if(!_tbPanelOpen) return;
  if(e.target.closest('.tb-panel') || e.target.closest('.tb-filter-btn')) return;
  toggleTbPanel(false);
});

function _tbOpenMenu(anchor, items, onPick) {
  _tbCloseMenu();
  const menu = document.createElement('div');
  menu.className = 'tb-menu';
  menu.innerHTML = items.map(it =>
    `<button class="tb-menu-item" data-val="${_esc(it.id)}"><i style="background:${it.color}"></i>${_esc(it.label)}</button>`).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 12) + 'px';
  menu.style.top = (r.bottom + 6 + menu.offsetHeight > window.innerHeight ? r.top - menu.offsetHeight - 6 : r.bottom + 6) + 'px';
  menu.addEventListener('click', e => {
    const b = e.target.closest('.tb-menu-item');
    if(!b) return;
    _tbCloseMenu();
    onPick(b.dataset.val);
  });
  _tbMenuEl = menu;
}

// ============================================================
// DELEGACIÓN DE EVENTOS
// ============================================================
// Entrar a la página vuelve a habilitar la animación de entrada; los
// re-renders por filtro dentro de la página, no.
let _tbFresh = true;

function _tbBind() {
  const page = document.getElementById('page-pendientes');
  if(!page || page.dataset.tbBound) return;
  page.dataset.tbBound = '1';

  // Se arma al SALIR de la página, no al entrar: navigate() añade .active y
  // llama a renderPendientes en el mismo tick, antes de que el observer corra.
  new MutationObserver(() => {
    if(!page.classList.contains('active')) _tbFresh = true;
  }).observe(page, { attributes:true, attributeFilter:['class'] });

  page.addEventListener('click', e => {
    const av = e.target.closest('.tb-av-wrap');
    if(av && av.dataset.uid) { openProfileModal(av.dataset.uid); return; }

    const btn = e.target.closest('[data-act]');
    if(!btn) return;
    const { act, tid, cid, val, key } = btn.dataset;

    switch(act) {
      case 'toggle':   toggleTask(tid, cid || ''); break;
      case 'open':     openTaskDetail(tid, cid || ''); break;
      case 'edit':     openEditTaskModal(tid, cid || ''); break;
      case 'del':      _tbConfirmarBorrado(tid, cid || ''); break;
      case 'status':   _tbOpenMenu(btn, TASK_STATUSES, v => setTaskStatus(tid, cid || '', v)); break;
      case 'prio':     _tbOpenMenu(btn, TASK_PRIOS, v => setTaskPriority(tid, cid || '', v)); break;
      case 'group':    setTbGroupBy(val); break;
      case 'scope':    setTbScope(val); break;
      case 'view':     setTbView(val); break;
      case 'date':     setTbDate(val); break;
      case 'datefield':setTbDateField(val); break;
      case 'filters-open':  toggleTbPanel(); break;
      case 'filters-close': toggleTbPanel(false); break;
      case 'clear-search':  setTbSearch(''); break;
      case 'person':   _tbToggle('people', val); break;
      case 'status-f': _tbToggle('statuses', val); break;
      case 'prio-f':   _tbToggle('prios', val); break;
      case 'showdone': setTbShowDone(!_tb.showDone); break;
      case 'clear':    tbClearFilters(); break;
      // Sin re-render: la transición de colapso solo corre si el nodo sobrevive.
      case 'collapse': {
        const sec = btn.closest('.tb-group');
        const i = _tb.collapsed.indexOf(key);
        if(i >= 0) _tb.collapsed.splice(i, 1); else _tb.collapsed.push(key);
        _tbSave();
        if(sec) sec.classList.toggle('collapsed', i < 0); else renderPendientes();
        break;
      }
    }
  });

  // Arrastrar: en kanban la tarjeta cambia de estado; en tabla la fila cambia
  // el campo por el que está agrupada (prioridad o estado). Es el mismo gesto
  // en las dos vistas, así que comparten manejadores.
  let dragged = null;
  page.addEventListener('dragstart', e => {
    const pieza = e.target.closest('.tb-card, .tb-row[draggable="true"]');
    if(!pieza) return;
    dragged = { tid: pieza.dataset.tid, cid: pieza.dataset.cid };
    pieza.classList.add('dragging');
    if(pieza.classList.contains('tb-row')) page.querySelector('.tb-board')?.classList.add('dragging-rows');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', pieza.dataset.tid); } catch {}
  });
  page.addEventListener('dragend', e => {
    const pieza = e.target.closest('.tb-card, .tb-row');
    if(pieza) pieza.classList.remove('dragging');
    page.querySelector('.tb-board')?.classList.remove('dragging-rows');
    page.querySelectorAll('.tb-col.over, .tb-group.over').forEach(c => c.classList.remove('over'));
    dragged = null;
  });
  page.addEventListener('dragover', e => {
    if(!dragged) return;
    const zona = e.target.closest('.tb-col, .tb-group');
    if(!zona) return;
    if(zona.classList.contains('tb-group') && !_tbDragMode()) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    page.querySelectorAll('.tb-col.over, .tb-group.over').forEach(c => { if(c !== zona) c.classList.remove('over'); });
    zona.classList.add('over');
  });
  page.addEventListener('drop', e => {
    if(!dragged) return;
    const zona = e.target.closest('.tb-col, .tb-group');
    if(!zona) return;
    e.preventDefault();
    zona.classList.remove('over');
    if(zona.classList.contains('tb-col')) {
      setTaskStatus(dragged.tid, dragged.cid, zona.dataset.status);
    } else {
      // La clave del grupo lleva el valor: 'r:high' (prioridad), 's:listo'.
      const [, valor] = String(zona.dataset.gkey || '').split(':');
      if(valor) {
        if(_tbDragMode() === 'prio') setTaskPriority(dragged.tid, dragged.cid, valor);
        else setTaskStatus(dragged.tid, dragged.cid, valor);
      }
    }
    dragged = null;
  });
}

/* Llegar a una tarea desde una notificación. El tablero recuerda filtros, así
   que la tarea del aviso puede estar escondida detrás de ellos: en ese caso se
   quitan y se dice por qué, en vez de dejar al usuario mirando una lista donde
   "no está" lo que le acaban de avisar. Devuelve true si quedó a la vista. */
function _tbEnfocarTarea(tid, cid) {
  const t = _tbCollectTasks().find(x => x.id === tid && (x.campaignId || '') === (cid || ''));
  if(!t) return false;
  if(!_tbFilter([t]).length) {
    tbClearFilters();
    showToast('Quitamos los filtros del tablero para mostrarte esta tarea.');
  } else {
    renderPendientes();
  }
  // El grupo donde cae puede estar plegado.
  const fila = document.querySelector(`#page-pendientes [data-tid="${CSS.escape(tid)}"][data-cid="${CSS.escape(cid || '')}"]`);
  const grupo = fila && fila.closest('.tb-group.collapsed');
  if(grupo) {
    const i = _tb.collapsed.indexOf(grupo.dataset.gkey);
    if(i >= 0) { _tb.collapsed.splice(i, 1); _tbSave(); }
    grupo.classList.remove('collapsed');
  }
  const destino = document.querySelector(`#page-pendientes .tb-row[data-tid="${CSS.escape(tid)}"], #page-pendientes .tb-card[data-tid="${CSS.escape(tid)}"]`);
  if(!destino) return false;
  try { destino.scrollIntoView({ block:'center', behavior:'smooth' }); } catch { destino.scrollIntoView(); }
  destino.classList.add('tb-flash');
  setTimeout(() => destino.classList.remove('tb-flash'), 2400);
  return true;
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tbBind);
else _tbBind();
