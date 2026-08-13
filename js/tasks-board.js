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

// Involucrados = responsable + seguidores. El creador va aparte (se marca en
// el tooltip) para que se lea quién pidió la tarea sin ensuciar el conteo.
function taskPeople(t) {
  const uids = [];
  if(t.assigneeUid) uids.push(t.assigneeUid);
  (t.watchers || []).forEach(w => { if(w && !uids.includes(w)) uids.push(w); });
  return uids;
}
function taskInvolved(t) {
  const uids = taskPeople(t);
  if(t.createdBy && !uids.includes(t.createdBy)) uids.push(t.createdBy);
  return uids;
}
function _userByUid(uid) { return allUsers.find(u => u.uid === uid) || null; }
function _userName(u, fallback) {
  if(!u) return fallback || 'Sin asignar';
  return u.name || (u.email ? u.email.split('@')[0] : 'Sin nombre');
}

// ============================================================
// ESTADO DEL TABLERO (persistido en localStorage)
// ============================================================
const _TB_KEY = 'pendientesBoardPrefs';
const _tb = {
  view: 'tabla',        // 'tabla' | 'kanban'
  groupBy: 'campaign',  // campaign | person | status | priority | date
  scope: 'mios',        // 'mios' | 'todos'
  search: '',
  people: [],           // uids involucrados; '__none__' = sin asignar
  statuses: [],
  prios: [],
  date: 'todos',        // todos | vencidas | hoy | semana | sin_fecha
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
function setTbShowDone(v){ _tb.showDone = !!v; _tbSave(); renderPendientes(); }
function setTbSearch(v)  { _tb.search = v; renderPendientes(); }
function tbClearFilters() {
  _tb.search = ''; _tb.people = []; _tb.statuses = []; _tb.prios = [];
  _tb.date = 'todos'; _tb.showDone = false; _tb.scope = 'mios';
  _tbSave();
  renderPendientes();
}
function _tbHasFilters() {
  return !!(_tb.search || _tb.people.length || _tb.statuses.length || _tb.prios.length ||
            _tb.date !== 'todos' || _tb.showDone || _tb.scope !== 'mios');
}

// ============================================================
// FECHAS
// ============================================================
function _tbToday() { return new Date().toISOString().split('T')[0]; }
function _tbPlusDays(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function _tbDateState(t) {
  if(taskStatus(t) === 'listo') return 'done';
  if(!t.dueDate) return 'none';
  const today = _tbToday();
  if(t.dueDate < today) return 'overdue';
  if(t.dueDate === today) return 'today';
  if(t.dueDate <= _tbPlusDays(7)) return 'soon';
  return 'later';
}
function _tbDateLabel(t) {
  if(!t.dueDate) return 'Sin fecha';
  const st = _tbDateState(t);
  if(st === 'today') return 'Hoy';
  if(st === 'overdue') {
    const days = Math.round((new Date(_tbToday()) - new Date(t.dueDate)) / 86400000);
    return `${formatDateShort(t.dueDate)} · ${days}d tarde`;
  }
  return formatDateShort(t.dueDate) || t.dueDate;
}

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
      if(_tb.date === 'sin_fecha' && t.dueDate) return false;
      if(_tb.date === 'vencidas' && !(t.dueDate && t.dueDate < today && st !== 'listo')) return false;
      if(_tb.date === 'hoy' && t.dueDate !== today) return false;
      if(_tb.date === 'semana' && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
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
    if(!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    if(a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
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
      push(meta[0], meta[1], meta[2], t);
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
  } else {
    list.sort((a, b) => b.tasks.length - a.tasks.length || a.label.localeCompare(b.label));
  }
  list.forEach(g => { g.tasks = _tbSort(g.tasks); });
  return list;
}

// ============================================================
// PIEZAS DE UI
// ============================================================
function _tbAvatar(u, size, ring) {
  const bg = (u && u.profileGradient) || 'var(--lavender)';
  const content = u ? (u.profileEmoji || (u.name || u.email || '?')[0].toUpperCase()) : '?';
  const fs = u && u.profileEmoji ? Math.round(size * 0.6) : Math.round(size * 0.48);
  return `<span class="tb-av" style="width:${size}px;height:${size}px;background:${bg};font-size:${fs}px;${ring ? 'box-shadow:0 0 0 2px var(--white),0 0 0 3.5px var(--pink);' : 'box-shadow:0 0 0 2px var(--white);'}">${content}</span>`;
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
  people.slice(0, 3).forEach((uid, i) => {
    const u = _userByUid(uid);
    const role = i === 0 && t.assigneeUid === uid ? 'Responsable' : 'Involucrado';
    chips.push(`<span class="tb-av-wrap" data-uid="${_esc(uid)}" title="${_esc(_userName(u, t.assignee))} — ${role}">${_tbAvatar(u, size, i === 0 && t.assigneeUid === uid)}</span>`);
  });
  if(people.length > 3) {
    chips.push(`<span class="tb-av tb-av-more" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.4)}px;" title="${people.slice(3).map(uid=>_esc(_userName(_userByUid(uid),''))).join(', ')}">+${people.length - 3}</span>`);
  }
  if(creator) {
    const cu = _userByUid(creator);
    chips.push(`<span class="tb-av-wrap tb-av-creator" data-uid="${_esc(creator)}" title="${_esc(_userName(cu, ''))} — creó la tarea">${_tbAvatar(cu, size - 4, false)}</span>`);
  }
  return `<span class="tb-stack">${chips.join('')}</span>`;
}

function _tbStatusCell(t) {
  const s = TASK_STATUS_BY_ID[taskStatus(t)];
  return `<button class="tb-pill tb-status" data-act="status" data-tid="${_esc(t.id)}" data-cid="${_esc(t.campaignId||'')}" style="background:${s.color};">${s.label}</button>`;
}
function _tbPrioCell(t) {
  const p = TASK_PRIO_BY_ID[taskPrio(t)];
  return `<button class="tb-pill tb-prio" data-act="prio" data-tid="${_esc(t.id)}" data-cid="${_esc(t.campaignId||'')}" style="background:${p.color};">${p.label}</button>`;
}
function _tbDateCell(t) {
  const st = _tbDateState(t);
  return `<span class="tb-date tb-date-${st}">${_tbDateLabel(t)}</span>`;
}

const _TB_ICN_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>';
const _TB_ICN_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

function _tbRow(t) {
  const done = taskStatus(t) === 'listo';
  const cid = t.campaignId || '';
  return `
  <div class="tb-row${done ? ' tb-row-done' : ''}" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">
    <div class="tb-cell tb-cell-check">
      <span class="task-check ${done ? 'done' : ''}" data-act="toggle" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}" title="${done ? 'Reabrir' : 'Marcar listo'}"></span>
    </div>
    <div class="tb-cell tb-cell-title" data-act="open" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">
      <span class="tb-title">${_esc(t.title)}</span>
      <span class="tb-sub">
        ${_tb.groupBy !== 'campaign' && t.campaignName ? `<span class="tb-tag">${_esc(t.campaignName)}</span>` : ''}
        ${t._isRecurring ? '<span class="tb-tag tb-tag-rec">🔄 Semanal</span>' : ''}
        ${t.notes ? '<span class="tb-tag" title="Tiene notas">📝</span>' : ''}
        ${t.docLink ? '<span class="tb-tag" title="Tiene documento">🔗</span>' : ''}
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

  return `
  <section class="tb-group${collapsed ? ' collapsed' : ''}" style="--g-color:${g.color};">
    <header class="tb-group-head" data-act="collapse" data-key="${_esc(g.key)}">
      <span class="tb-chev">▾</span>
      <span class="tb-group-name">${_esc(g.label)}</span>
      <span class="tb-group-count">${pend} pendiente${pend !== 1 ? 's' : ''} · ${g.tasks.length} total</span>
      ${overdue ? `<span class="tb-group-overdue">${overdue} vencida${overdue !== 1 ? 's' : ''}</span>` : ''}
      <span class="tb-stack tb-group-stack">${stack}</span>
    </header>
    <div class="tb-group-body">
      <div class="tb-row tb-head-row">
        <div class="tb-cell tb-cell-check"></div>
        <div class="tb-cell tb-cell-title">Tarea</div>
        <div class="tb-meta">
          <div class="tb-cell tb-cell-people">Involucrados</div>
          <div class="tb-cell tb-cell-status">Estado</div>
          <div class="tb-cell tb-cell-prio">Prioridad</div>
          <div class="tb-cell tb-cell-date">Fecha</div>
        </div>
        <div class="tb-cell tb-cell-actions"></div>
      </div>
      ${g.tasks.map(_tbRow).join('')}
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
      <span class="tb-card-prio" style="background:${p.color};">${p.label}</span>
      ${_tbDateCell(t)}
    </div>
    <div class="tb-card-title" data-act="open" data-tid="${_esc(t.id)}" data-cid="${_esc(cid)}">${_esc(t.title)}</div>
    <div class="tb-card-foot">
      <span class="tb-tag">${_esc(t.campaignName || 'General')}</span>
      ${_tbPeopleStack(t, 24)}
    </div>
  </article>`;
}

function _tbKanbanHtml(tasks) {
  const byStatus = {};
  TASK_STATUSES.forEach(s => byStatus[s.id] = []);
  tasks.forEach(t => byStatus[taskStatus(t)].push(t));
  return `<div class="tb-kanban">${TASK_STATUSES.map(s => {
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
function _tbToolbarHtml(all, shown) {
  const counts = { overdue:0, today:0, done:0 };
  all.forEach(t => {
    const st = _tbDateState(t);
    if(st === 'overdue') counts.overdue++;
    if(st === 'today') counts.today++;
    if(taskStatus(t) === 'listo') counts.done++;
  });

  // Personas: solo quienes de verdad participan en alguna tarea visible.
  const involvedUids = [...new Set(all.flatMap(t => taskInvolved(t)))];
  const people = involvedUids.map(uid => _userByUid(uid)).filter(Boolean)
    .sort((a, b) => _userName(a, '').localeCompare(_userName(b, '')));
  const unassigned = all.filter(t => !t.assigneeUid).length;
  const loadOf = uid => all.filter(t => taskInvolved(t).includes(uid) && taskStatus(t) !== 'listo').length;

  const chip = (on, extra, attrs, inner) =>
    `<button class="tb-chip${on ? ' on' : ''}${extra ? ' ' + extra : ''}" ${attrs}>${inner}</button>`;

  return `
  <div class="tb-toolbar">
    <div class="tb-toolbar-row">
      <div class="tb-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="search" id="tbSearchInput" placeholder="Buscar tarea, persona o campaña..." value="${_esc(_tb.search)}" oninput="setTbSearch(this.value)">
      </div>
      <div class="tb-seg">
        ${chip(_tb.scope === 'mios', 'tb-seg-btn', 'data-act="scope" data-val="mios"', 'Donde participo')}
        ${chip(_tb.scope === 'todos', 'tb-seg-btn', 'data-act="scope" data-val="todos"', 'Todo el equipo')}
      </div>
      <label class="tb-select">Agrupar por
        <select onchange="setTbGroupBy(this.value)">
          <option value="campaign" ${_tb.groupBy==='campaign'?'selected':''}>Campaña</option>
          <option value="person"   ${_tb.groupBy==='person'  ?'selected':''}>Responsable</option>
          <option value="status"   ${_tb.groupBy==='status'  ?'selected':''}>Estado</option>
          <option value="priority" ${_tb.groupBy==='priority'?'selected':''}>Prioridad</option>
          <option value="date"     ${_tb.groupBy==='date'    ?'selected':''}>Fecha</option>
        </select>
      </label>
      <div class="tb-seg">
        ${chip(_tb.view === 'tabla',  'tb-seg-btn', 'data-act="view" data-val="tabla"', 'Tabla')}
        ${chip(_tb.view === 'kanban', 'tb-seg-btn', 'data-act="view" data-val="kanban"', 'Kanban')}
      </div>
    </div>

    <div class="tb-toolbar-row tb-filter-row">
      <span class="tb-flabel">Involucrados</span>
      ${unassigned ? chip(_tb.people.includes('__none__'), 'tb-chip-person', 'data-act="person" data-val="__none__"',
        `<span class="tb-av tb-av-empty" style="width:20px;height:20px;">?</span>Sin asignar<span class="tb-chip-n">${unassigned}</span>`) : ''}
      ${people.map(u => chip(_tb.people.includes(u.uid), 'tb-chip-person', `data-act="person" data-val="${_esc(u.uid)}"`,
        `${_tbAvatar(u, 20, false)}${_esc(_userName(u, ''))}<span class="tb-chip-n">${loadOf(u.uid)}</span>`)).join('')}
    </div>

    <div class="tb-toolbar-row tb-filter-row">
      <span class="tb-flabel">Estado</span>
      ${TASK_STATUSES.map(s => chip(_tb.statuses.includes(s.id), 'tb-chip-dot', `data-act="status-f" data-val="${s.id}"`,
        `<i style="background:${s.color}"></i>${s.label}`)).join('')}
      <span class="tb-sep"></span>
      <span class="tb-flabel">Prioridad</span>
      ${TASK_PRIOS.map(p => chip(_tb.prios.includes(p.id), 'tb-chip-dot', `data-act="prio-f" data-val="${p.id}"`,
        `<i style="background:${p.color}"></i>${p.label}`)).join('')}
    </div>

    <div class="tb-toolbar-row tb-filter-row">
      <span class="tb-flabel">Fecha</span>
      ${[['todos','Todas',''],['vencidas','Vencidas',counts.overdue],['hoy','Hoy',counts.today],['semana','Próx. 7 días',''],['sin_fecha','Sin fecha','']]
        .map(([v, l, n]) => chip(_tb.date === v, '', `data-act="date" data-val="${v}"`,
          `${l}${n ? `<span class="tb-chip-n">${n}</span>` : ''}`)).join('')}
      <span class="tb-sep"></span>
      ${chip(_tb.showDone, '', 'data-act="showdone"', `Ver listas${counts.done ? `<span class="tb-chip-n">${counts.done}</span>` : ''}`)}
      ${_tbHasFilters() ? '<button class="tb-clear" data-act="clear">Limpiar filtros</button>' : ''}
      <span class="tb-result">${shown} de ${all.length} tareas</span>
    </div>
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
    const focused = document.activeElement && document.activeElement.id === 'tbSearchInput';
    const caret = focused ? document.activeElement.selectionStart : null;
    toolbarEl.innerHTML = _tbToolbarHtml(all, filtered.length);
    if(focused) {
      const inp = document.getElementById('tbSearchInput');
      if(inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch {} }
    }
  }

  if(!filtered.length) {
    el.innerHTML = `<div class="empty-state"><p>${_tbHasFilters() ? 'Ninguna tarea coincide con estos filtros.' : 'No tienes pendientes por ahora 🎉'}</p>${_tbHasFilters() ? '<button class="btn btn-ghost btn-sm" data-act="clear" style="margin-top:10px;">Limpiar filtros</button>' : ''}</div>`;
  } else if(_tb.view === 'kanban') {
    el.innerHTML = _tbKanbanHtml(filtered);
  } else {
    el.innerHTML = `<div class="tb-board">${_tbGroup(filtered).map(_tbGroupHtml).join('')}</div>`;
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
document.addEventListener('keydown', e => { if(e.key === 'Escape') _tbCloseMenu(); });

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
function _tbBind() {
  const page = document.getElementById('page-pendientes');
  if(!page || page.dataset.tbBound) return;
  page.dataset.tbBound = '1';

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
      case 'del':      if(confirm('¿Eliminar esta tarea?')) deleteTask(tid, cid || ''); break;
      case 'status':   _tbOpenMenu(btn, TASK_STATUSES, v => setTaskStatus(tid, cid || '', v)); break;
      case 'prio':     _tbOpenMenu(btn, TASK_PRIOS, v => setTaskPriority(tid, cid || '', v)); break;
      case 'scope':    setTbScope(val); break;
      case 'view':     setTbView(val); break;
      case 'date':     setTbDate(val); break;
      case 'person':   _tbToggle('people', val); break;
      case 'status-f': _tbToggle('statuses', val); break;
      case 'prio-f':   _tbToggle('prios', val); break;
      case 'showdone': setTbShowDone(!_tb.showDone); break;
      case 'clear':    tbClearFilters(); break;
      case 'collapse': _tbToggle('collapsed', key); break;
    }
  });

  // Kanban: arrastrar tarjeta a otra columna cambia el estado.
  let dragged = null;
  page.addEventListener('dragstart', e => {
    const card = e.target.closest('.tb-card');
    if(!card) return;
    dragged = { tid: card.dataset.tid, cid: card.dataset.cid };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', card.dataset.tid); } catch {}
  });
  page.addEventListener('dragend', e => {
    const card = e.target.closest('.tb-card');
    if(card) card.classList.remove('dragging');
    page.querySelectorAll('.tb-col.over').forEach(c => c.classList.remove('over'));
    dragged = null;
  });
  page.addEventListener('dragover', e => {
    const col = e.target.closest('.tb-col');
    if(!col || !dragged) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    page.querySelectorAll('.tb-col.over').forEach(c => { if(c !== col) c.classList.remove('over'); });
    col.classList.add('over');
  });
  page.addEventListener('drop', e => {
    const col = e.target.closest('.tb-col');
    if(!col || !dragged) return;
    e.preventDefault();
    col.classList.remove('over');
    setTaskStatus(dragged.tid, dragged.cid, col.dataset.status);
    dragged = null;
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _tbBind);
else _tbBind();
