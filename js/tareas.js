/* Campaign OS — Tareas: modales, selector de personas y links
   =============================================
   El alta, la edición y el detalle de una tarea, con su selector de gente
   (responsable, supervisores, mirones) y los links de entregable.

   El TABLERO de pendientes es otra cosa y vive en js/tasks-board.js.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

function populateTaskAssigneeSelect(defaultUid) {
  const sel = document.getElementById('fTaskAssignee');
  if(!sel) return;
  sel.innerHTML = `<option value="">Sin asignar</option>` +
    allUsers.map(u => `<option value="${u.uid}">${_esc(u.name || u.email.split('@')[0])}</option>`).join('');
  sel.value = defaultUid || currentUser.uid;
}

// Estado del tablero (Monday) dentro del modal de tarea.
function populateTaskStatusSelect(status) {
  const sel = document.getElementById('fTaskStatus');
  if(!sel) return;
  sel.innerHTML = TASK_STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  sel.value = TASK_STATUS_BY_ID[status] ? status : 'sin_empezar';
}

// ── Selector de personas (multi) ──
// Antes se pintaba el equipo entero como botones: con ocho personas el modal
// se volvía un muro de chips y no se distinguía lo elegido de lo disponible.
// Ahora: chips de lo elegido + un buscador que se despliega. Escala igual con
// 5 que con 40 personas, y deja claro a quién estás etiquetando.
const _ppState = {}; // elId -> {sel, q, open, exclude}

function initPeoplePicker(elId, selected, exclude) {
  _ppState[elId] = { sel:(selected || []).filter(Boolean), q:'', open:false, exclude:(exclude || []).filter(Boolean) };
  renderPeoplePicker(elId);
}
function readPeoplePicker(elId) { return (_ppState[elId] ? _ppState[elId].sel : []).slice(); }
// Nadie puede tener dos papeles en la misma tarea: al cambiar el responsable
// se saca de supervisores y colaboradores en vez de dejar el duplicado.
function setPeoplePickerExclude(elId, exclude) {
  const st = _ppState[elId];
  if(!st) return;
  st.exclude = (exclude || []).filter(Boolean);
  st.sel = st.sel.filter(uid => !st.exclude.includes(uid));
  renderPeoplePicker(elId);
}
function ppToggle(elId, uid) {
  const st = _ppState[elId];
  if(!st) return;
  const i = st.sel.indexOf(uid);
  if(i >= 0) st.sel.splice(i, 1); else st.sel.push(uid);
  renderPeoplePicker(elId);
  _ppSyncRoles(elId);
}
function ppSetOpen(elId, on) {
  const st = _ppState[elId];
  if(!st) return;
  st.open = on; if(!on) st.q = '';
  renderPeoplePicker(elId);
  if(on) { const i = document.getElementById(elId + '_q'); if(i) i.focus(); }
}
function ppQuery(elId, v) {
  const st = _ppState[elId];
  if(!st) return;
  st.q = v;
  renderPeoplePicker(elId);
  const i = document.getElementById(elId + '_q');
  if(i) { i.focus(); try { i.setSelectionRange(v.length, v.length); } catch {} }
}
// Un supervisor no vuelve a aparecer como colaborador y al revés.
function _ppSyncRoles(changedId) {
  const sup = _ppState.fTaskSupervisors, wat = _ppState.fTaskWatchers;
  if(!sup || !wat) return;
  const assignee = (document.getElementById('fTaskAssignee') || {}).value || '';
  if(changedId !== 'fTaskWatchers') setPeoplePickerExclude('fTaskWatchers', [assignee, ...sup.sel]);
  if(changedId !== 'fTaskSupervisors') setPeoplePickerExclude('fTaskSupervisors', [assignee, ...wat.sel]);
}

function renderPeoplePicker(elId) {
  const box = document.getElementById(elId);
  const st = _ppState[elId];
  if(!box || !st) return;
  const byUid = uid => allUsers.find(u => u.uid === uid);
  const nameOf = u => u ? (u.name || (u.email || '').split('@')[0] || 'Sin nombre') : 'Sin nombre';
  const q = st.q.trim().toLowerCase();
  const options = allUsers
    .filter(u => !st.exclude.includes(u.uid))
    .filter(u => !q || nameOf(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const chips = st.sel.map(uid => {
    const u = byUid(uid);
    return `<span class="pp-chip">${memberAvatarHtml(u, 18).replace(/onclick="[^"]*"/, '')}
      <span>${_esc(nameOf(u))}</span>
      <button type="button" class="pp-chip-x" onclick="ppToggle('${elId}','${_esc(uid)}')" aria-label="Quitar a ${_esc(nameOf(u))}">×</button></span>`;
  }).join('');

  box.className = 'people-picker' + (st.open ? ' open' : '');
  box.innerHTML = `
    <div class="pp-field">
      ${chips || '<span class="pp-empty">Nadie etiquetado todavía</span>'}
      <button type="button" class="pp-add" onclick="ppSetOpen('${elId}',${!st.open})">${st.open ? 'Listo' : '＋ Etiquetar'}</button>
    </div>
    ${st.open ? `<div class="pp-pop">
      <input type="search" class="pp-search" id="${elId}_q" placeholder="Buscar persona..." value="${_esc(st.q)}"
        oninput="ppQuery('${elId}',this.value)" autocomplete="off">
      <div class="pp-list">
        ${options.map(u => `<button type="button" class="pp-opt${st.sel.includes(u.uid) ? ' on' : ''}" onclick="ppToggle('${elId}','${_esc(u.uid)}')">
          <span class="pp-opt-check" aria-hidden="true"></span>
          ${memberAvatarHtml(u, 22).replace(/onclick="[^"]*"/, '')}
          <span class="pp-opt-name">${_esc(nameOf(u))}</span>
        </button>`).join('') || `<div class="pp-none">${q ? 'Nadie con ese nombre.' : 'Sin equipo cargado.'}</div>`}
      </div>
    </div>` : ''}`;
}

// ── Links de documentos (varios) ──
// Se re-dibuja solo al agregar o quitar un renglón, nunca al teclear: si no,
// el input pierde el foco a la segunda letra. Lo escrito se lee del DOM antes
// de cada re-dibujo.
let _dlRows = [];

function initDocLinks(links) {
  _dlRows = (links || []).map(l => ({ url:l.url || '', label:l.label || '' }));
  if(!_dlRows.length) _dlRows.push({ url:'', label:'' });
  renderDocLinks();
}
function _dlSyncFromDom() {
  const box = document.getElementById('fTaskDocLinks');
  if(!box) return;
  [...box.querySelectorAll('.dl-row')].forEach((row, i) => {
    if(!_dlRows[i]) return;
    _dlRows[i].url   = row.querySelector('.dl-url').value.trim();
    _dlRows[i].label = row.querySelector('.dl-label').value.trim();
  });
}
function dlAdd()      { _dlSyncFromDom(); _dlRows.push({ url:'', label:'' }); renderDocLinks(true); }
function dlRemove(i)  { _dlSyncFromDom(); _dlRows.splice(i, 1); if(!_dlRows.length) _dlRows.push({url:'',label:''}); renderDocLinks(); }
function readDocLinks() {
  _dlSyncFromDom();
  return _dlRows.filter(l => l.url).map(l => ({ url:l.url, label:l.label }));
}

function renderDocLinks(focusLast) {
  const box = document.getElementById('fTaskDocLinks');
  if(!box) return;
  box.className = 'doc-links';
  box.innerHTML = _dlRows.map((l, i) => `
    <div class="dl-row">
      <input type="url" class="form-input dl-url" value="${_esc(l.url)}" placeholder="https://docs.google.com/...">
      <input type="text" class="form-input dl-label" value="${_esc(l.label)}" placeholder="${_esc(l.url ? docLinkLabel({url:l.url, label:''}) : 'Nombre (opcional)')}">
      <button type="button" class="dl-x" onclick="dlRemove(${i})" aria-label="Quitar este link">×</button>
    </div>`).join('') +
    `<button type="button" class="dl-add" onclick="dlAdd()">＋ Agregar link</button>`;
  if(focusLast) {
    const inputs = box.querySelectorAll('.dl-url');
    if(inputs.length) inputs[inputs.length - 1].focus();
  }
}

// Avisa cuando el interno cae después del de cliente. No bloquea: hay casos
// (revisiones internas post-entrega) donde es a propósito.
function checkTaskDeadlines() {
  const warn = document.getElementById('fTaskDateWarn');
  if(!warn) return;
  const int = (document.getElementById('fTaskDate') || {}).value || '';
  const cli = (document.getElementById('fTaskClientDate') || {}).value || '';
  warn.hidden = !(int && cli && int > cli);
}

function onTaskAssigneeChange() { _ppSyncRoles(null); }

function openAddTaskModal() {
  editingTaskId = null; editingTaskCampaignId = null;
  currentTaskContext = currentCampaignId || 'global';
  populateCampaignSelects();
  populateTaskAssigneeSelect(currentUser.uid);
  populateTaskStatusSelect('sin_empezar');
  initPeoplePicker('fTaskSupervisors', [], [currentUser.uid]);
  initPeoplePicker('fTaskWatchers', [], [currentUser.uid]);
  document.getElementById('fTaskTitle').value='';
  document.getElementById('fTaskDate').value=hoyISO();
  document.getElementById('fTaskClientDate').value='';
  checkTaskDeadlines();
  document.getElementById('fTaskPriority').value='medium';
  initDocLinks([]);
  document.getElementById('fTaskNotes').value='';
  document.getElementById('fTaskRecurring').checked = false;
  document.getElementById('fTaskRecurringDayGroup').style.display = 'none';
  document.getElementById('fTaskRecurringDay').value = new Date().getDay().toString();
  // Siempre explícito: el <select> ya no se reconstruye en cada render (ver
  // populateCampaignSelects), así que si no se fija aquí se queda con lo que
  // eligió la vez pasada.
  document.getElementById('fTaskCampaign').value = currentCampaignId || '';
  document.querySelector('#taskModal .modal-title').textContent='Nueva tarea';
  openModal('taskModal');
}

function openAddGlobalTaskModal() {
  editingTaskId = null; editingTaskCampaignId = null;
  currentTaskContext='global';
  populateCampaignSelects();
  populateTaskAssigneeSelect(currentUser.uid);
  populateTaskStatusSelect('sin_empezar');
  initPeoplePicker('fTaskSupervisors', [], [currentUser.uid]);
  initPeoplePicker('fTaskWatchers', [], [currentUser.uid]);
  document.getElementById('fTaskTitle').value='';
  document.getElementById('fTaskDate').value=hoyISO();
  document.getElementById('fTaskClientDate').value='';
  checkTaskDeadlines();
  document.getElementById('fTaskPriority').value='medium';
  initDocLinks([]);
  document.getElementById('fTaskNotes').value='';
  document.getElementById('fTaskRecurring').checked = false;
  document.getElementById('fTaskRecurringDayGroup').style.display = 'none';
  document.getElementById('fTaskRecurringDay').value = new Date().getDay().toString();
  // Estando dentro de una campaña, el botón flotante crea la tarea AHÍ: es lo
  // que espera quien lo toca teniendo la campaña abierta. Fuera, sin campaña.
  document.getElementById('fTaskCampaign').value = currentCampaignId || '';
  document.querySelector('#taskModal .modal-title').textContent='Nueva tarea';
  openModal('taskModal');
}

function openTaskDetail(tid, cid) {
  let task = null;
  let campana = null;
  if(cid) { const c = _cache.campaigns.find(x=>x.id===cid); if(c) { campana = c; task = c.tasks.find(x=>x.id===tid); } }
  else { task = (_cache.globalTasks||[]).find(x=>x.id===tid); }
  if(!task) { showToast('Tarea no encontrada','error'); return; }
  /* El nombre de la campaña no vive en la tarea: sólo las tareas sueltas
     guardan `campaignName`. El detalle leía ese campo a secas, así que TODA
     tarea de campaña se presentaba como "General" — justo el dato que hay que
     ver cuando se llega aquí desde una notificación. */
  const nombreCampana = campana ? campana.name : (task.campaignName || 'General');

  const u = allUsers.find(x=>x.uid===task.assigneeUid);
  const assigneeName = u ? (u.name||u.email.split('@')[0]) : (task.assignee||'—');
  const prioMap = {high:['#fee2e2','#991b1b','Alta'], medium:['#fef9c3','#854d0e','Media'], low:['#dcfce7','#15803d','Baja']};
  const [pbg,pcol,plbl] = prioMap[task.priority]||prioMap.medium;
  const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  document.getElementById('tdTitle').textContent = task.title;
  document.getElementById('taskDetailBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;padding:4px 0;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:12px;padding:3px 10px;border-radius:10px;background:${pbg};color:${pcol};font-weight:600;">${plbl}</span>
        <span style="font-size:12px;padding:3px 10px;border-radius:10px;background:${TASK_STATUS_BY_ID[taskStatus(task)].color};color:${_tbInk(TASK_STATUS_BY_ID[taskStatus(task)].color)};font-weight:600;">${TASK_STATUS_BY_ID[taskStatus(task)].label}</span>
        ${task.recurring ? `<span style="font-size:12px;padding:3px 10px;border-radius:10px;background:#ede9fe;color:#6d28d9;font-weight:600;">🔄 ${dayNames[task.recurringDay]||''}</span>` : ''}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Involucrados</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${taskInvolved(task).map(uid => {
            const p = allUsers.find(x=>x.uid===uid);
            const role = taskRoleOf(task, uid);
            return `<span class="tb-person-chip" onclick="closeModal('taskDetailModal');openProfileModal('${uid}')">
              ${memberAvatarHtml(p,20).replace(/onclick="[^"]*"/,'')}
              <span><b>${_esc(p ? (p.name||p.email.split('@')[0]) : 'Sin nombre')}</b><i>${role}</i></span></span>`;
          }).join('') || '<span style="font-size:13px;color:var(--text-muted);">Nadie asignado todavía</span>'}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Asignado a</div>
          <div style="display:flex;align-items:center;gap:6px;">${u && u.uid ? `<span class="user-name-link" onclick="closeModal('taskDetailModal');openProfileModal('${u.uid}')" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">${memberAvatarHtml(u,20)} <span style="font-size:14px;">${_esc(assigneeName)}</span></span>` : `${memberAvatarHtml({name:assigneeName},20)} <span style="font-size:14px;">${_esc(assigneeName)}</span>`}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Deadline interno</div>
          <div style="font-size:14px;">${task.dueDate ? formatDate(task.dueDate) : '—'}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Deadline cliente</div>
          <div style="font-size:14px;">${task.clientDueDate ? formatDate(task.clientDueDate) : '—'}</div>
          ${taskDatesConflict(task) ? '<div style="font-size:11px;color:#e2445c;font-weight:600;margin-top:3px;">El interno cae después del de cliente.</div>' : ''}
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Campaña</div>
          <div style="font-size:14px;">${campana
            ? `<button type="button" class="td-camp-link" onclick="_verCampanaDeTarea('${_esc(campana.id)}')">${_esc(nombreCampana)} →</button>`
            : _esc(nombreCampana)}</div>
        </div>
      </div>
      ${(() => {
        const links = taskDocLinks(task);
        if(!links.length) return '';
        return `<div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Documento${links.length > 1 ? 's' : ''}</div>
          <div class="td-links">${links.map(l => `<a href="${_esc(_safeUrl(l.url))}" target="_blank" rel="noopener noreferrer" class="td-link">
            <span class="td-link-ico">🔗</span>
            <span class="td-link-name">${_esc(docLinkLabel(l))}</span>
          </a>`).join('')}</div>
        </div>`;
      })()}
      ${task.notes ? `<div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Notas</div>
        <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;">${_esc(task.notes)}</div>
      </div>` : ''}
    </div>`;

  document.getElementById('tdEditBtn').onclick = () => { closeModal('taskDetailModal'); openEditTaskModal(tid, cid); };
  openModal('taskDetailModal');
}

function openEditTaskModal(tid, cid) {
  let task = null;
  if(cid) { const c = _cache.campaigns.find(x=>x.id===cid); if(c) task = c.tasks.find(x=>x.id===tid); }
  else { task = (_cache.globalTasks||[]).find(x=>x.id===tid); }
  if(!task) { showToast('Tarea no encontrada','error'); return; }
  editingTaskId = tid; editingTaskCampaignId = cid || null;
  populateCampaignSelects(); populateTaskAssigneeSelect(task.assigneeUid || currentUser.uid);
  populateTaskStatusSelect(taskStatus(task));
  const _assignee = task.assigneeUid || currentUser.uid;
  initPeoplePicker('fTaskSupervisors', task.supervisors || [], [_assignee]);
  initPeoplePicker('fTaskWatchers', task.watchers || [], [_assignee, ...(task.supervisors || [])]);
  document.getElementById('fTaskTitle').value = task.title || '';
  document.getElementById('fTaskDate').value = task.dueDate || '';
  document.getElementById('fTaskClientDate').value = task.clientDueDate || '';
  checkTaskDeadlines();
  document.getElementById('fTaskPriority').value = task.priority || 'medium';
  initDocLinks(taskDocLinks(task));
  document.getElementById('fTaskNotes').value = task.notes || '';
  document.getElementById('fTaskRecurring').checked = !!task.recurring;
  document.getElementById('fTaskRecurringDayGroup').style.display = task.recurring ? '' : 'none';
  document.getElementById('fTaskRecurringDay').value = task.recurringDay !== undefined ? task.recurringDay.toString() : '1';
  document.getElementById('fTaskCampaign').value = cid || task.campaignId || '';
  if(task.assigneeUid) document.getElementById('fTaskAssignee').value = task.assigneeUid;
  document.querySelector('#taskModal .modal-title').textContent='Editar tarea';
  openModal('taskModal');
}

// Del detalle de la tarea a su campaña, sin pasar por el listado.
function _verCampanaDeTarea(cid) {
  closeModal('taskDetailModal');
  navigate('campannas');
  openCampaignDetail(cid);
}

function saveTask() {
  const title = document.getElementById('fTaskTitle').value.trim();
  if(!title) { showToast('La tarea es requerida','error'); return; }
  const campId = document.getElementById('fTaskCampaign').value;
  const sel = document.getElementById('fTaskAssignee');
  const assigneeUid = sel.value || '';
  const assigneeUser = allUsers.find(u => u.uid === assigneeUid);
  const assigneeName = assigneeUser ? (assigneeUser.name || assigneeUser.email.split('@')[0]) : '';
  const dueDate = document.getElementById('fTaskDate').value;
  const clientDueDate = document.getElementById('fTaskClientDate').value;
  const priority = document.getElementById('fTaskPriority').value;
  const docLinks = readDocLinks();
  // `docLink` se sigue escribiendo con el primero: el dashboard y la vista de
  // campaña todavía lo leen, y una tarea vieja sincronizada no debe perderlo.
  const docLink = docLinks.length ? docLinks[0].url : '';
  const notes = document.getElementById('fTaskNotes').value.trim();
  const recurring = document.getElementById('fTaskRecurring').checked;
  const recurringDay = recurring ? parseInt(document.getElementById('fTaskRecurringDay').value) : undefined;
  const status = document.getElementById('fTaskStatus').value || 'sin_empezar';
  // Un papel por persona: el responsable no se repite abajo, y quien supervisa
  // no aparece además como colaborador.
  const supervisors = readPeoplePicker('fTaskSupervisors').filter(uid => uid && uid !== assigneeUid);
  const watchers = readPeoplePicker('fTaskWatchers')
    .filter(uid => uid && uid !== assigneeUid && !supervisors.includes(uid));
  const done = !recurring && status === 'listo';

  // Foto de cómo estaba la tarea antes. Sirve para dos cosas: avisar sólo a
  // los que se SUMAN (no a los que ya estaban) y contarle a los que ya estaban
  // QUÉ cambió — mover un deadline sin decírselo a nadie era la forma más
  // rápida de que alguien trabajara contra una fecha que ya no existe.
  const prev = { assigneeUid:'', supervisors:[], watchers:[], title:'', dueDate:'', clientDueDate:'', priority:'', status:'' };
  const apply = t => {
    prev.assigneeUid = t.assigneeUid || '';
    prev.supervisors = (t.supervisors || []).slice();
    prev.watchers = (t.watchers || []).slice();
    prev.title = t.title || '';
    prev.dueDate = t.dueDate || '';
    prev.clientDueDate = t.clientDueDate || '';
    prev.priority = taskPrio(t);
    prev.status = taskStatus(t);
    t.title=title; t.dueDate=dueDate; t.clientDueDate=clientDueDate; t.priority=priority;
    t.assigneeUid=assigneeUid; t.assignee=assigneeName; t.docLink=docLink; t.docLinks=docLinks; t.notes=notes;
    t.recurring=recurring;
    // Nunca dejar `undefined` en el objeto: Firestore lo rechaza con un throw
    // síncrono y tumbaba el guardado completo de globalTasks.
    if(recurring) t.recurringDay = recurringDay; else delete t.recurringDay;
    t.status=status; t.supervisors=supervisors; t.watchers=watchers;
    if(!recurring) { t.done=done; t.doneAt = done ? (t.doneAt||Date.now()) : null; }
  };

  if(editingTaskId) {
    /* Dónde estaba y dónde tiene que quedar. El selector de campaña se leía
       sólo al CREAR: al editar se ignoraba, así que mover una tarea suelta a
       su campaña no hacía nada y seguía sin salir en la pestaña de Pendientes
       de esa campaña. `editada` es el objeto ya actualizado, que es lo que
       leen los avisos de "qué cambió" de más abajo. */
    const origen  = editingTaskCampaignId || '';
    const destino = campId || '';
    let editada = null;

    if(origen === destino) {
      // Se queda donde está: sólo se actualizan sus campos.
      if(origen) {
        const campaigns = getData('campaigns');
        const c = campaigns.find(x=>x.id===origen);
        if(c) {
          const t = c.tasks.find(x=>x.id===editingTaskId);
          if(t) { apply(t); editada = t; }
          guardarCampana(c);
        }
      } else {
        const tasks = getData('globalTasks');
        const t = tasks.find(x=>x.id===editingTaskId);
        if(t) { apply(t); editada = t; }
        setData('globalTasks', tasks);
      }
    } else {
      // Cambió de campaña (o dejó de tener): se saca del sitio viejo y se mete
      // en el nuevo, en una sola pasada por cada colección tocada.
      const campaigns = getData('campaigns');
      // Si el destino no existe, no se saca de donde está: mejor no guardar
      // que dejar la tarea sin dueño en ninguna de las dos listas.
      if(destino && !campaigns.find(x=>x.id===destino)) {
        showToast('Esa campaña ya no existe. Recarga y vuelve a intentar.','error');
        return;
      }
      let tarea = null;
      if(origen) {
        const c = campaigns.find(x=>x.id===origen);
        if(c) {
          const i = c.tasks.findIndex(x=>x.id===editingTaskId);
          if(i >= 0) tarea = c.tasks.splice(i,1)[0];
        }
      } else {
        const tasks = getData('globalTasks');
        const i = tasks.findIndex(x=>x.id===editingTaskId);
        if(i >= 0) tarea = tasks.splice(i,1)[0];
        setData('globalTasks', tasks);
      }
      if(tarea) {
        apply(tarea);
        editada = tarea;
        if(destino) {
          const c = campaigns.find(x=>x.id===destino);
          if(c) {
            delete tarea.campaignId; delete tarea.campaignName;
            c.tasks.push(tarea);
          }
        } else {
          const tasks = getData('globalTasks');
          tasks.push({...tarea, campaignName:'General', campaignId:''});
          setData('globalTasks', tasks);
        }
      }
      // Colección entera a propósito: mover una tarea de campaña toca DOS
      // documentos —el de origen, donde queda el hueco, y el de destino—, y
      // guardarCampana() sólo sabe escribir uno.
      setData('campaigns', campaigns);
      editingTaskCampaignId = destino || null;
    }
    // A dónde apuntan los avisos: al sitio donde la tarea vive AHORA.
    const cid = destino;
    const nuevos = {
      assignee: assigneeUid && assigneeUid !== prev.assigneeUid ? assigneeUid : '',
      supervisors: supervisors.filter(uid => !prev.supervisors.includes(uid)),
      watchers: watchers.filter(uid => !prev.watchers.includes(uid)),
    };
    _notifyTaskPeople({
      title, taskId: editingTaskId, campaignId: campId, dueDate, clientDueDate,
      added: nuevos,
    });
    // Y a los que YA estaban, qué cambió. Un campo por frase: la campanita las
    // agrupa y manda un solo aviso con todo lo que se movió.
    if(editada) {
      const frases = [];
      if(prev.title && prev.title !== title) frases.push(`nombre: "${title}"`);
      if(prev.status !== (recurring ? taskStatus(editada) : status)) frases.push(_fraseEstado(recurring ? taskStatus(editada) : status));
      if(prev.priority !== priority) frases.push(_frasePrioridad(priority));
      if(prev.dueDate !== (dueDate||'')) frases.push(_fraseFecha('dueDate', dueDate));
      if(prev.clientDueDate !== (clientDueDate||'')) frases.push(_fraseFecha('clientDueDate', clientDueDate));
      // Reasignar avisa dos veces a propósito: al que entra, "te asignaron";
      // a los demás, que el responsable ya es otro.
      if(prev.assigneeUid !== assigneeUid) frases.push(_fraseResponsable(assigneeUid));
      if(frases.length) {
        try {
          _notifyTaskChange({
            task: editada, campaignId: cid || '', frases,
            excluir: [nuevos.assignee, ...nuevos.supervisors, ...nuevos.watchers],
          });
        } catch(e){ console.warn('notify task change', e); }
      }
      // Quien deja de ser responsable también se entera: si no, sigue creyendo
      // que la tarea es suya.
      if(prev.assigneeUid && prev.assigneeUid !== assigneeUid && prev.assigneeUid !== currentUser.uid) {
        try {
          _notifyTaskChange({
            task: { ...editada, assigneeUid: prev.assigneeUid, supervisors: [], watchers: [], createdBy: '' },
            campaignId: cid || '',
            frases: [ assigneeUid ? _fraseResponsable(assigneeUid) : 'responsable: nadie' ],
          });
        } catch(e){ console.warn('notify task unassign', e); }
      }
    }
    closeModal('taskModal');
    showToast('Tarea actualizada','success');
  } else {
    const task = {
      id:id(), title, dueDate, clientDueDate, priority, assigneeUid,
      assignee: assigneeName, docLink, docLinks, notes,
      createdBy: currentUser.uid,
      status, supervisors, watchers,
      done, doneAt: done ? Date.now() : null,
      ...(recurring ? { recurring:true, recurringDay } : {})
    };
    if(campId) {
      const campaigns=getData('campaigns');
      const c=campaigns.find(x=>x.id===campId);
      if(c) { c.tasks.push(task); guardarCampana(c); }
    } else {
      const tasks=getData('globalTasks');
      tasks.push({...task,campaignName:'General',campaignId:''});
      setData('globalTasks',tasks);
    }
    _notifyTaskPeople({
      title, taskId: task.id, campaignId: campId, dueDate, clientDueDate,
      added: { assignee: assigneeUid, supervisors, watchers },
    });
    closeModal('taskModal');
    showToast('Tarea agregada','success');
  }
  editingTaskId = null; editingTaskCampaignId = null;
  if(currentPage==='pendientes') renderPendientes();
  if(currentPage==='dashboard') renderDashboard();
  if(currentPage==='campannas'&&currentCampaignId) {
    const campaigns=getData('campaigns');
    const c=campaigns.find(x=>x.id===currentCampaignId);
    if(c) renderCampaignTasks(c);
  }
  try { _refreshPendCount(); } catch(e){}
}
