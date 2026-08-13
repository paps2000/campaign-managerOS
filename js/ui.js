/* Campaign OS — Generador de texto, modales, equipo, ajustes, utils, listeners, auth, init
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ============================================================
// TEXT GENERATOR
// ============================================================
function populateCampaignSelects() {
  const campaigns = visibleCampaigns();
  const opts = campaigns.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  ['dashGenCampaign','fullGenCampaign','fTaskCampaign'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML = `<option value="">— Sin campaña —</option>` + opts;
  });
}

async function generateText(scope) {
  const s = getSettings();
  const provider = s.aiProvider || 'anthropic';
  const apiKey = provider === 'openai' ? s.openaiApiKey : s.claudeApiKey;
  if(!apiKey) {
    showToast(`Agrega tu ${provider==='openai'?'OpenAI':'Claude'} API Key en Ajustes`, 'error'); return;
  }

  const typeEl = document.getElementById(scope==='dash'?'dashGenType':'fullGenType');
  const campEl = document.getElementById(scope==='dash'?'dashGenCampaign':'fullGenCampaign');
  const ctxEl  = document.getElementById('fullGenContext');
  const outEl  = document.getElementById(scope==='dash'?'dashGenOutput':'fullGenOutput');
  const actEl  = document.getElementById(scope==='dash'?'dashGenActions':'fullGenActions');
  const btnEl  = document.getElementById(scope==='dash'?'dashGenBtn':'fullGenBtn');

  const type = typeEl.value;
  const campId = campEl.value;
  const ctx = ctxEl?.value||'';

  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===campId);
  const campInfo = c ? `Campaña: ${_esc(c.name)}, Cliente: ${c.client}, Objetivo: ${c.objective||'—'}, Core message: ${c.coreMessage||'—'}` : 'Sin campaña específica';

  const prompts = {
    'Follow up cliente':   `Escribe un email corto y profesional de follow up para el cliente de esta campaña de influencer marketing. Tono: amable, ejecutivo, en español. ${campInfo}. Contexto adicional: ${ctx||'ninguno'}. Firma con el nombre del responsable.`,
    'Follow up influencer':`Escribe un mensaje corto de follow up para un influencer de esta campaña. Tono: cercano, profesional, en español. ${campInfo}. Contexto: ${ctx||'seguimiento general de entregables'}.`,
    'Brief':               `Escribe un brief creativo conciso para esta campaña de influencer marketing. Incluye: objetivo, mensaje clave, tono, formato sugerido, referencias de estilo. ${campInfo}. Contexto: ${ctx||'ninguno'}.`,
    'Minuta de reunión':   `Escribe una plantilla de minuta de reunión para esta campaña. Incluye: asistentes (dejar en blanco), puntos discutidos, acuerdos, próximos pasos con fechas. ${campInfo}. Contexto: ${ctx||'reunión de seguimiento'}.`,
    'Email de propuesta':  `Escribe un email de propuesta para presentar esta campaña al cliente. Tono ejecutivo, persuasivo, en español. Incluye saludo, contexto de la campaña, propuesta de valor, próximos pasos. ${campInfo}.`,
  };

  const prompt = prompts[type] || prompts['Follow up cliente'];

  btnEl.innerHTML = '<span class="loader"></span> Generando...';
  btnEl.disabled = true;
  outEl.style.display='block';
  outEl.textContent='Generando...';

  try {
    let resultText = '';
    if(provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
        body: JSON.stringify({model:'gpt-4o-mini',max_tokens:600,messages:[{role:'user',content:prompt}]})
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      resultText = data.choices[0].message.content;
    } else {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': apiKey,
          'anthropic-version':'2023-06-01',
          'anthropic-dangerous-direct-browser-access':'true'
        },
        body: JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:600,messages:[{role:'user',content:prompt}]})
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      resultText = data.content[0].text;
    }
    outEl.textContent = resultText;
    actEl.style.display='flex';
  } catch(e) {
    outEl.textContent = 'Error: '+e.message;
    showToast('Error generando texto: '+e.message,'error');
  }
  btnEl.innerHTML = '<span class="icn-inline"></span> Generar texto';
  btnEl.disabled = false;
}

function copyGenText(scope) {
  const outEl = document.getElementById(scope==='dash'?'dashGenOutput':'fullGenOutput');
  navigator.clipboard.writeText(outEl.textContent).then(()=>showToast('Texto copiado','success'));
}

// ============================================================
// MODALS
// ============================================================
// Stacking: cada modal que se abre se pone por encima del anterior, así los
// modales anidados (p.ej. "creadores anteriores" sobre el editor de escenario)
// no quedan tapados por el de atrás.
let _modalZ = 1000;
function openModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  _modalZ += 2;
  el.style.zIndex = _modalZ;
  el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const finish = () => {
    el.classList.remove('open', 'is-closing');
    el.style.zIndex = '';
    // Cada credencial tiene su propio rAF y sus listeners globales: dejarlas
    // montadas tras cerrar el modal deja loops corriendo sobre DOM invisible.
    if(typeof unmountHolo === 'function') {
      if(id === 'profileModal')     unmountHolo('profileHoloHost');
      if(id === 'editProfileModal') unmountHolo('holoPreviewHost');
    }
    // Si ya no queda ningún modal abierto, reinicia el contador.
    if(!document.querySelector('.modal-overlay.open')) _modalZ = 1000;
  };
  const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(rm || !el.classList.contains('open')) { finish(); return; }
  el.classList.add('is-closing');
  // Se lee la duración real del CSS en vez de escuchar animationend: con
  // varias animaciones compitiendo en el mismo elemento (fadeIn de .open y
  // modalOut de .is-closing) el evento no dispara de forma fiable.
  let ms = 150;
  try {
    const d = getComputedStyle(el).animationDuration.split(',')[0].trim();
    ms = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
    if(!isFinite(ms) || ms <= 0) ms = 150;
  } catch(e){}
  setTimeout(finish, ms);
}

function applyBudgetVisibility() {
  const grp = document.getElementById('fCampBudgetGroup');
  if(grp) grp.style.display = canSeeCosts() ? '' : 'none';
}

function calcBudgetOps() {
  const client = parseFloat(document.getElementById('fCampBudgetClient').value) || 0;
  const margin = parseFloat(document.getElementById('fCampMargin').value) || 0;
  const el = document.getElementById('fCampBudgetOpsResult');
  if(!el) return;
  if(client <= 0) { el.textContent = '—'; return; }
  const ganancia = client * (margin / 100);
  const ops = client - ganancia;
  el.textContent = margin > 0
    ? `$${ops.toLocaleString('es-MX',{maximumFractionDigits:0})} MXN  (Cliente $${client.toLocaleString('es-MX',{maximumFractionDigits:0})} − ${margin}% = $${ganancia.toLocaleString('es-MX',{maximumFractionDigits:0})} ganancia)`
    : `$${ops.toLocaleString('es-MX',{maximumFractionDigits:0})} MXN`;
}

const AREAS = ['Operaciones','Cuentas','Creativo','Data'];
const AREA_IDS = {Operaciones:'fAreaOps', Cuentas:'fAreaCuentas', Creativo:'fAreaCreativo', Data:'fAreaData'};
const AREA_KEYS = {Operaciones:'operaciones', Cuentas:'cuentas', Creativo:'creativo', Data:'data'};

// In-memory state for multi-picker during modal editing
let _areaSelections = {operaciones:[], cuentas:[], creativo:[], data:[]};

function getAreaUids(responsables, key) {
  const v = (responsables||{})[key];
  if(!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
}

function populateCampResponsibles(responsables) {
  responsables = responsables || {};
  AREAS.forEach(area => {
    const key = AREA_KEYS[area];
    _areaSelections[key] = getAreaUids(responsables, key);
    renderAreaPicker(key);
  });
}

function renderAreaPicker(areaKey) {
  const areaLabel = {operaciones:'Operaciones', cuentas:'Cuentas', creativo:'Creativo', data:'Data'};
  const divId = {operaciones:'fAreaOps', cuentas:'fAreaCuentas', creativo:'fAreaCreativo', data:'fAreaData'}[areaKey];
  const el = document.getElementById(divId);
  if(!el) return;
  const selected = _areaSelections[areaKey] || [];
  const chips = selected.map(uid => {
    const u = allUsers.find(x => x.uid === uid);
    const name = u ? (u.name || u.email.split('@')[0]) : uid;
    return `<span class="area-chip"><span>${name}</span><button class="chip-x" onclick="removeFromArea('${areaKey}','${uid}');event.stopPropagation();" type="button">×</button></span>`;
  }).join('');
  const addBtn = `<button class="area-add-btn" type="button" onclick="toggleAreaDropdown('${areaKey}');event.stopPropagation();">+</button>`;
  // Build dropdown of unselected users
  const selectedSet = new Set(selected);
  const available = allUsers.filter(u => !selectedSet.has(u.uid));
  const dropdownItems = available.length === 0
    ? `<div class="area-dropdown-empty">Todos los usuarios asignados.</div>`
    : available.map(u => {
        const name = u.name || u.email.split('@')[0];
        const initial = name[0]?.toUpperCase() || '?';
        return `<div class="area-dropdown-item" onclick="addToArea('${areaKey}','${u.uid}');event.stopPropagation();">
          ${memberAvatarHtml(u, 26)}
          <span style="flex:1">${_esc(name)}</span>
          ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:9px;">${_esc(u.area)}</span>` : ''}
        </div>`;
      }).join('');
  el.innerHTML = chips + addBtn + `<div class="area-dropdown" id="areaDD_${areaKey}" style="display:none;">${dropdownItems}</div>`;
}

function addToArea(areaKey, uid) {
  if(!_areaSelections[areaKey]) _areaSelections[areaKey] = [];
  if(!_areaSelections[areaKey].includes(uid)) _areaSelections[areaKey].push(uid);
  renderAreaPicker(areaKey);
}

function removeFromArea(areaKey, uid) {
  _areaSelections[areaKey] = (_areaSelections[areaKey]||[]).filter(x => x !== uid);
  renderAreaPicker(areaKey);
}

function toggleAreaDropdown(areaKey) {
  const dd = document.getElementById('areaDD_' + areaKey);
  if(!dd) return;
  const isOpen = dd.style.display !== 'none';
  // Close all dropdowns first
  ['operaciones','cuentas','creativo','data'].forEach(k => {
    const d = document.getElementById('areaDD_' + k);
    if(d) d.style.display = 'none';
  });
  if(!isOpen) dd.style.display = '';
}

function areaBadge(area) {
  if(!area) return '';
  return `<span class="badge badge-area-${area}" style="font-size:10px;">${area}</span>`;
}

function userChip(uid, fallbackName) {
  const u = allUsers.find(x => x.uid === uid);
  if(!u && !fallbackName) return '';
  const name = u ? (u.name || u.email.split('@')[0]) : fallbackName;
  const initial = name[0]?.toUpperCase() || '?';
  const area = u?.area || '';
  const clickAttr = u ? `class="user-name-link" onclick="event.stopPropagation();openProfileModal('${u.uid}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--white);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 4px;"` : `style="display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--white);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 4px;"`;
  return `<span ${clickAttr}>
    <span style="width:20px;height:20px;border-radius:50%;background:var(--pink-deep);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${initial}</span>
    ${_esc(name)}${area?` <span class="badge badge-area-${area}" style="font-size:9px;padding:1px 5px;">${area}</span>`:''}
  </span>`;
}

function toggleNanoSection() {
  const checked = document.getElementById('fCampHasNano')?.checked;
  const section = document.getElementById('fCampNanoSection');
  if(section) section.style.display = checked ? '' : 'none';
}

function openNewCampaignModal() {
  editingCampaignId = null;
  document.getElementById('campaignModalTitle').textContent='Nueva campaña';
  ['fCampName','fCampClient','fCampSeason','fCampObjective','fCampCore','fCampBudgetClient','fCampMargin','fCampStartDate','fCampEndDate','fCampGoalContenidos','fCampGoalViews','fCampGoalEngagement','fCampGoalReach','fCampEscenarioUrl'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('fCampBudgetOpsResult').textContent='—';
  document.getElementById('fCampStatus').value='En proceso';
  const nanoChk = document.getElementById('fCampHasNano');
  if(nanoChk) { nanoChk.checked = false; toggleNanoSection(); }
  const aonInp = document.getElementById('fCampAonTab');
  const nanoInp2 = document.getElementById('fCampNanoTab');
  if(aonInp) aonInp.value='';
  if(nanoInp2) nanoInp2.value='';
  populateCampResponsibles({});
  applyBudgetVisibility();
  openModal('campaignModal');
}

function openEditCampaignModal() {
  if(!currentCampaignId) return;
  const c = getData('campaigns').find(x=>x.id===currentCampaignId);
  if(!c) return;
  // Permission: only admin or creator can edit
  if(!isAdmin() && c.createdBy !== currentUser.uid) {
    showToast('No tienes permisos para editar esta campaña','error'); return;
  }
  editingCampaignId = c.id;
  document.getElementById('campaignModalTitle').textContent='Editar campaña';
  document.getElementById('fCampName').value=c.name||'';
  document.getElementById('fCampClient').value=c.client||'';
  document.getElementById('fCampSeason').value=c.season||'';
  document.getElementById('fCampStatus').value=c.status||'En proceso';
  document.getElementById('fCampObjective').value=c.objective||'';
  document.getElementById('fCampCore').value=c.coreMessage||'';
  document.getElementById('fCampBudgetClient').value=c.budgetClient||'';
  document.getElementById('fCampMargin').value=c.budgetMargin||'';
  const goal = c.goal || {};
  const gC = document.getElementById('fCampGoalContenidos'); if(gC) gC.value = goal.contenidos||'';
  const gV = document.getElementById('fCampGoalViews');      if(gV) gV.value = goal.views||'';
  const gE = document.getElementById('fCampGoalEngagement'); if(gE) gE.value = goal.engagement||'';
  const gR = document.getElementById('fCampGoalReach');      if(gR) gR.value = goal.reach||'';
  calcBudgetOps();
  populateCampResponsibles(c.responsables||{});
  document.getElementById('fCampStartDate').value=c.startDate||'';
  document.getElementById('fCampEndDate').value=c.endDate||'';
  const escUrlInp = document.getElementById('fCampEscenarioUrl');
  if(escUrlInp) escUrlInp.value = c.escenarioSheetUrl || '';
  const nanoChk = document.getElementById('fCampHasNano');
  if(nanoChk) { nanoChk.checked = !!c.hasNano; toggleNanoSection(); }
  if(c.hasNano) {
    const aonInp = document.getElementById('fCampAonTab');
    const nanoInp = document.getElementById('fCampNanoTab');
    if(aonInp) aonInp.value = c.trackerAonTab||'';
    if(nanoInp) nanoInp.value = c.trackerNanoTab||'';
  }
  applyBudgetVisibility();
  openModal('campaignModal');
}

// === ASSIGNEES ===
function openAssignModal() {
  if(!currentCampaignId) return;
  const c = _cache.campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!isAdmin() && c.createdBy !== currentUser.uid) {
    showToast('Solo el creador o admin puede asignar','error'); return;
  }
  _renderAssignModal(c);
  openModal('assignModal');
}

function _renderAssignModal(c) {
  const assigned = new Set(Array.isArray(c.assignedTo) ? c.assignedTo : []);
  const current = allUsers.filter(u => assigned.has(u.uid));
  const available = allUsers.filter(u => !assigned.has(u.uid));
  const avatar = (u) => `<div style="width:30px;height:30px;border-radius:50%;background:var(--lavender);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${(u.name||u.email)[0].toUpperCase()}</div>`;
  const currentHtml = current.length === 0
    ? '<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">Sin participantes asignados.</p>'
    : current.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--lavender-pale);">
        ${avatar(u)}
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${_esc(u.name||'—')} ${u.uid===c.createdBy?'<span style="font-size:10px;color:var(--text-muted);">(creador)</span>':''}</div>
          <div style="font-size:11px;color:var(--text-muted);">${_esc(u.email)}</div>
        </div>
        <span class="badge ${u.role==='admin'?'badge-pink':'badge-gray'}">${u.role==='admin'?'Admin':'Miembro'}</span>
        ${u.uid !== c.createdBy ? `<button onclick="removeAssignee('${c.id}','${u.uid}');_renderAssignModal(_cache.campaigns.find(x=>x.id==='${c.id}'))" style="background:var(--red);border:none;cursor:pointer;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0;">Eliminar</button>` : ''}
      </div>`).join('');
  const availableHtml = available.length === 0
    ? '<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">Todos los usuarios ya están asignados.</p>'
    : available.map(u => `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;">
        <input type="checkbox" data-uid="${u.uid}" style="width:16px;height:16px;cursor:pointer;">
        ${avatar(u)}
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${_esc(u.name||'—')}</div>
          <div style="font-size:11px;color:var(--text-muted);">${_esc(u.email)}</div>
        </div>
        <span class="badge ${u.role==='admin'?'badge-pink':'badge-gray'}">${u.role==='admin'?'Admin':'Miembro'}</span>
      </label>`).join('');
  document.getElementById('assignList').innerHTML = `
    <p style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Participantes actuales</p>
    ${currentHtml}
    <p style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 8px;">Agregar participantes</p>
    ${availableHtml}`;
}

function saveAssignees() {
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x=>x.id===currentCampaignId);
  if(idx===-1) return;
  const c = campaigns[idx];
  // Start with currently assigned (already persisted by removeAssignee calls)
  const current = new Set(Array.isArray(c.assignedTo) ? c.assignedTo : []);
  // Add newly checked users from the "agregar" section
  document.querySelectorAll('#assignList input[type="checkbox"]:checked').forEach(cb => current.add(cb.dataset.uid));
  // Always keep creator
  if(c.createdBy) current.add(c.createdBy);
  campaigns[idx] = {...c, assignedTo: [...current]};
  setData('campaigns', campaigns);
  closeModal('assignModal');
  showToast('Participantes actualizados','success');
  openCampaignDetail(currentCampaignId);
}

function removeAssignee(cid, uid) {
  const campaigns = getData('campaigns');
  const idx = campaigns.findIndex(x=>x.id===cid);
  if(idx===-1) return;
  const c = campaigns[idx];
  if(!isAdmin() && c.createdBy !== currentUser.uid) {
    showToast('Sin permisos','error'); return;
  }
  if(c.createdBy === uid) {
    showToast('No puedes quitar al creador','error'); return;
  }
  campaigns[idx] = {...c, assignedTo: (c.assignedTo||[]).filter(x=>x!==uid)};
  setData('campaigns', campaigns);
  openCampaignDetail(cid);
}

// === TEAM MGMT ===
// ============================================================
// EQUIPO PAGE (visible to all users)
// ============================================================
let _equipoAreaFilter = 'todos';

function renderEquipo() {
  const filterBar = document.getElementById('equipoFilterBar');
  const grid = document.getElementById('equipoGrid');
  if(!filterBar || !grid) return;

  const areas = ['Todos', ...AREAS];
  filterBar.innerHTML = areas.map(a =>
    `<button class="filter-tab ${_equipoAreaFilter===(a==='Todos'?'todos':a)?'active':''}"
       onclick="_setEquipoFilter('${a==='Todos'?'todos':a}')">${a}</button>`
  ).join('');

  const members = _equipoAreaFilter === 'todos'
    ? allUsers
    : allUsers.filter(u => u.area === _equipoAreaFilter);

  const sorted = [...members].sort((a,b) => {
    if(a.uid === currentUser?.uid) return -1;
    if(b.uid === currentUser?.uid) return 1;
    if(a.role==='admin' && b.role!=='admin') return -1;
    if(b.role==='admin' && a.role!=='admin') return 1;
    return (a.name||'').localeCompare(b.name||'');
  });

  if(!sorted.length) {
    grid.innerHTML = '<div class="empty-state"><p>Sin miembros en esta área.</p></div>';
    return;
  }

  grid.innerHTML = `<div class="team-grid t-avatar-group" id="equipoAvatarGroup">${sorted.map(u => {
    const activeTasks = [
      ..._cache.campaigns.flatMap(c=>(c.tasks||[]).filter(t=>!t.done&&t.assigneeUid===u.uid)),
      ..._cache.globalTasks.filter(t=>!t.done&&t.assigneeUid===u.uid)
    ];
    const isMe = u.uid === currentUser?.uid;
    const hasStatus = !!u.statusText;
    return `
    <div class="team-card t-avatar" onclick="openProfileModal('${u.uid}')">
      ${isMe ? '<div class="team-card-you">Tú</div>' : ''}
      <div class="team-card-avatar">${memberAvatarHtml(u, 56, '16px')}</div>
      <div class="team-card-name">${_esc(u.name||'—')}</div>
      ${(u.puesto||u.role) ? `<div class="team-card-role">${_esc(u.puesto)||(u.role==='admin'?'Admin':'Miembro')}</div>` : ''}
      <div class="team-card-badges">
        ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:10px;">${_esc(u.area)}</span>` : ''}
        ${u.role==='admin' ? `<span class="badge" style="background:var(--pink-pale);color:var(--pink-deep);font-size:10px;">Admin</span>` : ''}
      </div>
      ${hasStatus ? `<div class="team-card-status">${u.statusEmoji||''} ${_esc(u.statusText)}</div>` : ''}
      ${activeTasks.length > 0 ? `<div class="team-card-tasks">${activeTasks.length} tarea${activeTasks.length!==1?'s':''}</div>` : ''}
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;">🏆 Kudos</button>` : ''}
    </div>`;
  }).join('')}</div>`;
  try { _wireAvatarGroup(document.getElementById('equipoAvatarGroup')); } catch(e){}
}

// Hook .t-avatar items inside a .t-avatar-group: hovering one lifts
// neighbours with an exponential falloff and pops the active one.
function _wireAvatarGroup(root) {
  if(!root || root._wired) return;
  root._wired = true;
  const items = Array.from(root.querySelectorAll('.t-avatar'));
  if(!items.length) return;
  const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-lift')) || -4;
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-scale')) || 1.05;
  const falloff = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--avatar-falloff')) || 0.45;
  const easeIn  = getComputedStyle(document.documentElement).getPropertyValue('--avatar-ease-in')  || '';
  const easeOut = getComputedStyle(document.documentElement).getPropertyValue('--avatar-ease-out') || '';
  items.forEach((el, idx) => {
    el.addEventListener('mouseenter', () => {
      items.forEach((other, j) => {
        other.style.transitionTimingFunction = easeIn;
        const dist = Math.abs(j - idx);
        other.style.setProperty('--shift',  (lift * Math.pow(falloff, dist)).toFixed(3) + 'px');
        other.style.setProperty('--scale-active', j === idx ? scale : 1);
      });
    });
  });
  root.addEventListener('mouseleave', () => {
    items.forEach(other => {
      other.style.transitionTimingFunction = easeOut;
      other.style.setProperty('--shift', '0px');
      other.style.setProperty('--scale-active', 1);
    });
  });
}

function _setEquipoFilter(area) {
  _equipoAreaFilter = area;
  renderEquipo();
}

function renderTeam() {
  // Sección de portada del login: solo admins
  const seasonSec = document.getElementById('seasonAdminSection');
  if(seasonSec) seasonSec.style.display = (typeof isAdmin==='function' && isAdmin()) ? '' : 'none';
  const list = document.getElementById('teamList');
  if(!list) return;

  if(allUsers.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Sin miembros aún.</p></div>';
    return;
  }

  const sorted = [...allUsers].sort((a,b) => {
    if(a.uid === currentUser?.uid) return -1;
    if(b.uid === currentUser?.uid) return 1;
    if(a.role === 'admin' && b.role !== 'admin') return -1;
    if(b.role === 'admin' && a.role !== 'admin') return 1;
    return (a.name||'').localeCompare(b.name||'');
  });

  list.innerHTML = `<div class="team-grid">${sorted.map(u => {
    const activeTasks = [
      ..._cache.campaigns.flatMap(c=>(c.tasks||[]).filter(t=>!t.done&&t.assigneeUid===u.uid)),
      ..._cache.globalTasks.filter(t=>!t.done&&t.assigneeUid===u.uid)
    ];
    const isMe = u.uid === currentUser?.uid;
    const hasStatus = !!u.statusText;
    const avatarHtml = memberAvatarHtml(u, 56, '16px');

    const adminSelects = isAdmin() && !isMe ? `
      <div style="display:flex;flex-direction:column;gap:5px;width:100%;margin-top:4px;" onclick="event.stopPropagation()">
        <select onchange="changeArea('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="">Sin área</option>
          ${AREAS.map(a=>`<option value="${a}" ${u.area===a?'selected':''}>${a}</option>`).join('')}
        </select>
        <select onchange="changePuesto('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="">Sin puesto</option>
          ${PUESTOS.map(p=>`<option value="${p}" ${u.puesto===p?'selected':''}>${p}</option>`).join('')}
        </select>
        <select onchange="changeRole('${u.uid}',this.value)" style="width:100%;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:11px;font-family:inherit;background:var(--white);color:var(--text);cursor:pointer;">
          <option value="member" ${u.role==='member'?'selected':''}>Miembro</option>
          <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
        </select>
        <button onclick="event.stopPropagation();openDeleteUserModal('${u.uid}')" style="width:100%;padding:5px 8px;border:1.5px solid var(--red);border-radius:8px;font-size:11px;font-weight:700;background:var(--white);color:var(--red);cursor:pointer;margin-top:2px;">Eliminar perfil</button>
      </div>` : '';

    return `
    <div class="team-card" onclick="openProfileModal('${u.uid}')">
      ${isMe ? '<div class="team-card-you">Tú</div>' : ''}
      <div class="team-card-avatar">${avatarHtml}</div>
      <div class="team-card-name">${_esc(u.name||'—')}</div>
      ${(u.puesto||u.role) ? `<div class="team-card-role">${_esc(u.puesto) || (u.role==='admin'?'Admin':'Miembro')}</div>` : ''}
      <div class="team-card-badges">
        ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:10px;">${_esc(u.area)}</span>` : ''}
        ${u.role==='admin' ? `<span class="badge" style="background:var(--pink-pale);color:var(--pink-deep);font-size:10px;">Admin</span>` : ''}
      </div>
      ${hasStatus ? `<div class="team-card-status">${u.statusEmoji||''} ${_esc(u.statusText)}</div>` : ''}
      ${activeTasks.length > 0 ? `<div class="team-card-tasks">${activeTasks.length} tarea${activeTasks.length!==1?'s':''}</div>` : ''}
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;">🏆 Kudos</button>` : ''}
      ${adminSelects}
    </div>`;
  }).join('')}</div>`;
}

async function changeArea(uid, newArea) {
  if(!isAdmin()) { showToast('Solo admin puede cambiar área','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({area: newArea}),
      ws.collection('members').doc(uid).set({area: newArea}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid);
    if(u) u.area = newArea;
    showToast('Área actualizada','success');
    renderTeam();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function changeRole(uid, newRole) {
  if(!isAdmin()) { showToast('Solo admin puede cambiar roles','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({role: newRole}),
      ws.collection('members').doc(uid).set({role: newRole}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.role = newRole;
    showToast('Rol actualizado','success');
    renderTeam();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ---- Eliminar perfil (admin) ----
function _countUserRefs(uid) {
  let campCreated=0, campAssigned=0, campSubs=0, campResp=0, tasksCamp=0, tasksGlobal=0;
  (_cache.campaigns||[]).forEach(c => {
    if(c.createdBy === uid) campCreated++;
    if(Array.isArray(c.assignedTo) && c.assignedTo.includes(uid)) campAssigned++;
    if(Array.isArray(c.subscribers) && c.subscribers.includes(uid)) campSubs++;
    if(c.responsables) {
      ['operaciones','cuentas','creativo','data'].forEach(k => {
        const v = c.responsables[k];
        if(Array.isArray(v) ? v.includes(uid) : v === uid) campResp++;
      });
    }
    (c.tasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksCamp++; });
  });
  (_cache.globalTasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksGlobal++; });
  return { campCreated, campAssigned, campSubs, campResp, tasksCamp, tasksGlobal };
}

function openDeleteUserModal(uid) {
  if(!isAdmin()) { showToast('Solo admin','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil','error'); return; }
  const target = allUsers.find(u=>u.uid===uid);
  if(!target) { showToast('Usuario no encontrado','error'); return; }
  const refs = _countUserRefs(uid);
  const totalRefs = refs.campCreated+refs.campAssigned+refs.campSubs+refs.campResp+refs.tasksCamp+refs.tasksGlobal;
  const others = allUsers.filter(u=>u.uid!==uid).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const body = document.getElementById('deleteUserBody');
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      ${memberAvatarHtml(target, 44, '14px')}
      <div>
        <div style="font-weight:700;font-size:15px;">${_esc(target.name||target.email||'—')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${_esc(target.email||'')}</div>
      </div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;line-height:1.6;">
      <div style="font-weight:700;margin-bottom:4px;">Referencias actuales:</div>
      <div>• Campañas creadas: <b>${refs.campCreated}</b></div>
      <div>• Asignada a campañas: <b>${refs.campAssigned}</b></div>
      <div>• Suscripciones: <b>${refs.campSubs}</b></div>
      <div>• Responsable de área: <b>${refs.campResp}</b></div>
      <div>• Tareas de campaña: <b>${refs.tasksCamp}</b></div>
      <div>• Tareas globales: <b>${refs.tasksGlobal}</b></div>
    </div>
    ${totalRefs > 0 ? `
      <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;">Reasignar tareas y proyectos a:</label>
      <select id="deleteUserReassignSelect" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--white);color:var(--text);">
        <option value="">— Dejar sin asignar —</option>
        ${others.map(o=>`<option value="${o.uid}">${_esc(o.name||o.email||'—')}${o.puesto?' · '+_esc(o.puesto):''}</option>`).join('')}
      </select>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Todo lo etiquetado a esta persona pasará al usuario elegido. Si dejas sin asignar, se removerá la referencia.</div>
    ` : '<div style="font-size:12px;color:var(--text-muted);">Sin referencias — eliminación directa.</div>'}
    <div style="margin-top:12px;padding:8px 10px;background:#fff4f4;border:1px solid #f5c2c2;border-radius:8px;font-size:11px;color:#a13a3a;">
      <b>Atención:</b> esta acción borra el perfil del usuario y su membresía del workspace. Las credenciales de Firebase Auth deben revocarse por separado.
    </div>
  `;
  const btn = document.getElementById('deleteUserConfirmBtn');
  btn.onclick = () => {
    const sel = document.getElementById('deleteUserReassignSelect');
    const newUid = sel ? (sel.value||null) : null;
    confirmDeleteUser(uid, newUid);
  };
  openModal('deleteUserModal');
}

async function confirmDeleteUser(uid, newUid) {
  if(!isAdmin()) { showToast('Solo admin','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil','error'); return; }
  const btn = document.getElementById('deleteUserConfirmBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
  try {
    // 1) Reassign campaign-level fields
    const campaigns = getData('campaigns');
    campaigns.forEach(c => {
      if(c.createdBy === uid) c.createdBy = newUid || null;
      if(Array.isArray(c.assignedTo)) {
        const set = new Set(c.assignedTo.filter(x=>x!==uid));
        if(newUid) set.add(newUid);
        c.assignedTo = [...set];
      }
      if(Array.isArray(c.subscribers)) {
        const set = new Set(c.subscribers.filter(x=>x!==uid));
        if(newUid) set.add(newUid);
        c.subscribers = [...set];
      }
      if(c.responsables) {
        ['operaciones','cuentas','creativo','data'].forEach(k => {
          const v = c.responsables[k];
          if(Array.isArray(v)) {
            const set = new Set(v.filter(x=>x!==uid));
            if(newUid) set.add(newUid);
            c.responsables[k] = [...set];
          } else if(v === uid) {
            c.responsables[k] = newUid || '';
          }
        });
      }
      (c.tasks||[]).forEach(t => {
        if(t.assigneeUid === uid) t.assigneeUid = newUid || '';
        if(t.reactions) {
          Object.keys(t.reactions).forEach(emo => {
            t.reactions[emo] = (t.reactions[emo]||[]).filter(x=>x!==uid);
          });
        }
      });
    });
    setData('campaigns', campaigns);

    // 2) Global tasks
    const gtasks = getData('globalTasks');
    gtasks.forEach(t => {
      if(t.assigneeUid === uid) t.assigneeUid = newUid || '';
      if(t.reactions) {
        Object.keys(t.reactions).forEach(emo => {
          t.reactions[emo] = (t.reactions[emo]||[]).filter(x=>x!==uid);
        });
      }
    });
    setData('globalTasks', gtasks);

    // 3) Delete workspace member + user doc
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      ws.collection('members').doc(uid).delete().catch(()=>{}),
      db.collection('users').doc(uid).delete().catch(()=>{}),
    ]);

    allUsers = allUsers.filter(u=>u.uid!==uid);
    closeModal('deleteUserModal');
    showToast('Perfil eliminado'+(newUid?' y reasignado':''),'success');
    if(typeof renderTeam==='function') renderTeam();
    if(typeof renderCampaigns==='function') renderCampaigns();
    if(typeof renderDashboard==='function') renderDashboard();
  } catch(e) {
    console.error('confirmDeleteUser', e);
    showToast('Error: '+e.message,'error');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Eliminar perfil'; }
  }
}

async function changePuesto(uid, newPuesto) {
  if(!isAdmin()) { showToast('Solo admin puede cambiar puestos','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({puesto: newPuesto}),
      ws.collection('members').doc(uid).set({puesto: newPuesto}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.puesto = newPuesto;
    showToast('Puesto actualizado','success');
    renderTeam();
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function saveCampaign() {
  const name = document.getElementById('fCampName').value.trim();
  if(!name) { showToast('El nombre es requerido','error'); return; }
  const campaigns = getData('campaigns');
  const _escUrl = (document.getElementById('fCampEscenarioUrl')?.value||'').trim();
  const _goal = {
    contenidos: parseFloat(document.getElementById('fCampGoalContenidos')?.value)||0,
    views:      parseFloat(document.getElementById('fCampGoalViews')?.value)||0,
    engagement: parseFloat(document.getElementById('fCampGoalEngagement')?.value)||0,
    reach:      parseFloat(document.getElementById('fCampGoalReach')?.value)||0,
  };
  if(editingCampaignId) {
    const idx = campaigns.findIndex(x=>x.id===editingCampaignId);
    if(idx!==-1) {
      const _bc = parseFloat(document.getElementById('fCampBudgetClient').value)||0;
      const _bm = parseFloat(document.getElementById('fCampMargin').value)||0;
      campaigns[idx] = {...campaigns[idx],
        name, client:document.getElementById('fCampClient').value,
        season:document.getElementById('fCampSeason').value,
        status:document.getElementById('fCampStatus').value,
        objective:document.getElementById('fCampObjective').value,
        coreMessage:document.getElementById('fCampCore').value,
        budgetClient:_bc, budgetMargin:_bm,
        budgetOps: _bc > 0 ? _bc - (_bc * _bm / 100) : 0,
        responsables:{
          operaciones: _areaSelections.operaciones,
          cuentas: _areaSelections.cuentas,
          creativo: _areaSelections.creativo,
          data: _areaSelections.data,
        },
        startDate:document.getElementById('fCampStartDate').value,
        endDate:document.getElementById('fCampEndDate').value,
        hasNano: !!document.getElementById('fCampHasNano')?.checked,
        trackerAonTab: document.getElementById('fCampAonTab')?.value?.trim()||'',
        trackerNanoTab: document.getElementById('fCampNanoTab')?.value?.trim()||'',
        goal: _goal,
        ...(_escUrl ? { escenarioSheetUrl: _escUrl } : {}),
      };
    }
  } else {
    const _bc2 = parseFloat(document.getElementById('fCampBudgetClient').value)||0;
    const _bm2 = parseFloat(document.getElementById('fCampMargin').value)||0;
    var _newCampId = id();
    campaigns.push({
      id:_newCampId, name, client:document.getElementById('fCampClient').value,
      season:document.getElementById('fCampSeason').value,
      status:document.getElementById('fCampStatus').value,
      objective:document.getElementById('fCampObjective').value,
      coreMessage:document.getElementById('fCampCore').value,
      budgetClient:_bc2, budgetMargin:_bm2,
      budgetOps: _bc2 > 0 ? _bc2 - (_bc2 * _bm2 / 100) : 0,
      responsables:{
        operaciones: _areaSelections.operaciones,
        cuentas: _areaSelections.cuentas,
        creativo: _areaSelections.creativo,
        data: _areaSelections.data,
      },
      startDate:document.getElementById('fCampStartDate').value,
      endDate:document.getElementById('fCampEndDate').value,
      hasNano: !!document.getElementById('fCampHasNano')?.checked,
      trackerAonTab: document.getElementById('fCampAonTab')?.value?.trim()||'',
      trackerNanoTab: document.getElementById('fCampNanoTab')?.value?.trim()||'',
      goal: _goal,
      escenarioSheetUrl: _escUrl,
      createdBy: currentUser.uid,
      assignedTo: [currentUser.uid],
      flowSteps:FLOW_STEPS.map(s=>({step:s,status:'Pendiente'})),
      influencers:[], documents:[], tasks:[]
    });
  }
  setData('campaigns',campaigns);
  closeModal('campaignModal');
  showToast(editingCampaignId?'Campaña actualizada':'Campaña creada','success'); try { showSuccessCheck(); } catch(e){}
  // Si la campaña se creó durante el onboarding, volver a ese flujo con la nueva ya seleccionada
  if(!editingCampaignId && window._obAwaitingNewCampaign) {
    populateCampaignSelects();
    _obOnCampaignCreated(_newCampId);
    return;
  }
  if(editingCampaignId) openCampaignDetail(editingCampaignId);
  else renderCampaignGrid();
  populateCampaignSelects();
  // Campaña nueva sin link de escenario: ofrecer armarlo de una vez.
  if(!editingCampaignId && !_escUrl) {
    setTimeout(() => {
      if(confirm('La campaña no tiene link de escenario en Google Sheets.\n\n¿Quieres armar el escenario en la plataforma ahora?')) {
        openScenarioEditorForCampaign(_newCampId);
      }
    }, 250);
  }
}

// Abre el editor de escenario directamente para una campaña (sin pasar por el
// modal de selección). Usado al crear una campaña sin link de Google Sheets.
function openScenarioEditorForCampaign(cid, source) {
  const c = _cache.campaigns.find(x=>x.id===cid);
  if(!c) { showToast('Campaña no encontrada','error'); return; }
  const src = source || 'ops';
  if(c.scenario && c.scenario.creators && c.scenario.creators.length) {
    _scenarioState = JSON.parse(JSON.stringify(c.scenario));
    _scenarioState.campaignId = cid;
    _scenarioState.budgetSource = src;
  } else {
    _scenarioState = { campaignId: cid, budgetSource: src, creators: [] };
  }
  openModal('scenarioModal');
  if(!_scenarioState.creators.length) scenarioAddCreator();
  else _renderScenario();
}

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

// Involucrados extra: toggles con avatar, se guardan en task.watchers.
function populateTaskWatchers(watchers) {
  const box = document.getElementById('fTaskWatchers');
  if(!box) return;
  const sel = new Set(watchers || []);
  box.innerHTML = allUsers.map(u => {
    const name = u.name || u.email.split('@')[0];
    return `<button type="button" class="tb-watcher${sel.has(u.uid) ? ' on' : ''}" data-uid="${_esc(u.uid)}"
      onclick="this.classList.toggle('on')">${memberAvatarHtml(u,18).replace(/onclick="[^"]*"/,'')} ${_esc(name)}</button>`;
  }).join('') || '<span style="font-size:12px;color:var(--text-muted);">Sin equipo cargado</span>';
}
function readTaskWatchers() {
  return [...document.querySelectorAll('#fTaskWatchers .tb-watcher.on')].map(b => b.dataset.uid);
}

function openAddTaskModal() {
  editingTaskId = null; editingTaskCampaignId = null;
  currentTaskContext = currentCampaignId || 'global';
  populateCampaignSelects();
  populateTaskAssigneeSelect(currentUser.uid);
  populateTaskStatusSelect('sin_empezar');
  populateTaskWatchers([]);
  document.getElementById('fTaskTitle').value='';
  document.getElementById('fTaskDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('fTaskPriority').value='medium';
  document.getElementById('fTaskDocLink').value='';
  document.getElementById('fTaskNotes').value='';
  document.getElementById('fTaskRecurring').checked = false;
  document.getElementById('fTaskRecurringDayGroup').style.display = 'none';
  document.getElementById('fTaskRecurringDay').value = new Date().getDay().toString();
  if(currentCampaignId) document.getElementById('fTaskCampaign').value=currentCampaignId;
  document.querySelector('#taskModal .modal-title').textContent='Nueva tarea';
  openModal('taskModal');
}

function openAddGlobalTaskModal() {
  editingTaskId = null; editingTaskCampaignId = null;
  currentTaskContext='global';
  populateCampaignSelects();
  populateTaskAssigneeSelect(currentUser.uid);
  populateTaskStatusSelect('sin_empezar');
  populateTaskWatchers([]);
  document.getElementById('fTaskTitle').value='';
  document.getElementById('fTaskDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('fTaskPriority').value='medium';
  document.getElementById('fTaskDocLink').value='';
  document.getElementById('fTaskNotes').value='';
  document.getElementById('fTaskRecurring').checked = false;
  document.getElementById('fTaskRecurringDayGroup').style.display = 'none';
  document.getElementById('fTaskRecurringDay').value = new Date().getDay().toString();
  document.querySelector('#taskModal .modal-title').textContent='Nueva tarea';
  openModal('taskModal');
}

function openTaskDetail(tid, cid) {
  let task = null;
  if(cid) { const c = _cache.campaigns.find(x=>x.id===cid); if(c) task = c.tasks.find(x=>x.id===tid); }
  else { task = (_cache.globalTasks||[]).find(x=>x.id===tid); }
  if(!task) { showToast('Tarea no encontrada','error'); return; }

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
        <span style="font-size:12px;padding:3px 10px;border-radius:10px;background:${TASK_STATUS_BY_ID[taskStatus(task)].color};color:#fff;font-weight:600;">${TASK_STATUS_BY_ID[taskStatus(task)].label}</span>
        ${task.recurring ? `<span style="font-size:12px;padding:3px 10px;border-radius:10px;background:#ede9fe;color:#6d28d9;font-weight:600;">🔄 ${dayNames[task.recurringDay]||''}</span>` : ''}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Involucrados</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${taskInvolved(task).map(uid => {
            const p = allUsers.find(x=>x.uid===uid);
            const role = uid===task.assigneeUid ? 'Responsable' : (uid===task.createdBy ? 'Creó la tarea' : 'Sigue la tarea');
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
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Fecha límite</div>
          <div style="font-size:14px;">${task.dueDate ? formatDate(task.dueDate) : '—'}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Campaña</div>
          <div style="font-size:14px;">${task.campaignName||'General'}</div>
        </div>
      </div>
      ${task.docLink ? `<div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Documento</div>
        <a href="${task.docLink}" target="_blank" rel="noopener noreferrer" style="font-size:14px;color:var(--blue);word-break:break-all;">${task.docLink}</a>
      </div>` : ''}
      ${task.notes ? `<div>
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Notas</div>
        <div style="font-size:14px;line-height:1.5;white-space:pre-wrap;">${task.notes}</div>
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
  populateTaskWatchers(task.watchers || []);
  document.getElementById('fTaskTitle').value = task.title || '';
  document.getElementById('fTaskDate').value = task.dueDate || '';
  document.getElementById('fTaskPriority').value = task.priority || 'medium';
  document.getElementById('fTaskDocLink').value = task.docLink || '';
  document.getElementById('fTaskNotes').value = task.notes || '';
  document.getElementById('fTaskRecurring').checked = !!task.recurring;
  document.getElementById('fTaskRecurringDayGroup').style.display = task.recurring ? '' : 'none';
  document.getElementById('fTaskRecurringDay').value = task.recurringDay !== undefined ? task.recurringDay.toString() : '1';
  if(cid) document.getElementById('fTaskCampaign').value = cid;
  if(task.assigneeUid) document.getElementById('fTaskAssignee').value = task.assigneeUid;
  document.querySelector('#taskModal .modal-title').textContent='Editar tarea';
  openModal('taskModal');
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
  const priority = document.getElementById('fTaskPriority').value;
  const docLink = document.getElementById('fTaskDocLink').value.trim();
  const notes = document.getElementById('fTaskNotes').value.trim();
  const recurring = document.getElementById('fTaskRecurring').checked;
  const recurringDay = recurring ? parseInt(document.getElementById('fTaskRecurringDay').value) : undefined;
  const status = document.getElementById('fTaskStatus').value || 'sin_empezar';
  // El responsable nunca duplica en involucrados (ya sale como responsable).
  const watchers = readTaskWatchers().filter(uid => uid !== assigneeUid);
  const done = !recurring && status === 'listo';

  let prevAssigneeUid = '';
  if(editingTaskId) {
    const cid = editingTaskCampaignId;
    if(cid) {
      const campaigns = getData('campaigns');
      const c = campaigns.find(x=>x.id===cid);
      if(c) {
        const t = c.tasks.find(x=>x.id===editingTaskId);
        if(t) {
        prevAssigneeUid = t.assigneeUid||''; t.title=title; t.dueDate=dueDate; t.priority=priority;
        t.assigneeUid=assigneeUid; t.assignee=assigneeName; t.docLink=docLink; t.notes=notes;
        t.recurring=recurring; t.recurringDay=recurringDay;
        t.status=status; t.watchers=watchers;
        if(!recurring) { t.done=done; t.doneAt = done ? (t.doneAt||Date.now()) : null; }
      }
        setData('campaigns', campaigns);
      }
    } else {
      const tasks = getData('globalTasks');
      const t = tasks.find(x=>x.id===editingTaskId);
      if(t) {
        prevAssigneeUid = t.assigneeUid||''; t.title=title; t.dueDate=dueDate; t.priority=priority;
        t.assigneeUid=assigneeUid; t.assignee=assigneeName; t.docLink=docLink; t.notes=notes;
        t.recurring=recurring; t.recurringDay=recurringDay;
        t.status=status; t.watchers=watchers;
        if(!recurring) { t.done=done; t.doneAt = done ? (t.doneAt||Date.now()) : null; }
      }
      setData('globalTasks', tasks);
    }
    // Notify newly-assigned user if changed
    if(assigneeUid && assigneeUid !== prevAssigneeUid && assigneeUid !== currentUser?.uid) {
      _notifyTaskAssigned(assigneeUid, title, campId);
    }
    closeModal('taskModal');
    showToast('Tarea actualizada','success');
  } else {
    const task = {
      id:id(), title, dueDate, priority, assigneeUid,
      assignee: assigneeName, docLink, notes,
      createdBy: currentUser.uid,
      status, watchers,
      done, doneAt: done ? Date.now() : null,
      ...(recurring ? { recurring:true, recurringDay } : {})
    };
    if(campId) {
      const campaigns=getData('campaigns');
      const c=campaigns.find(x=>x.id===campId);
      if(c) { c.tasks.push(task); setData('campaigns',campaigns); }
    } else {
      const tasks=getData('globalTasks');
      tasks.push({...task,campaignName:'General',campaignId:''});
      setData('globalTasks',tasks);
    }
    if(assigneeUid && assigneeUid !== currentUser?.uid) {
      _notifyTaskAssigned(assigneeUid, title, campId);
    }
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
}

function openAddInfluencerModal() {
  document.getElementById('fInfDate').value=new Date().toISOString().split('T')[0];
  ['fInfName','fInfHandle'].forEach(id=>document.getElementById(id).value='');
  openModal('influencerModal');
}

function saveInfluencer() {
  const name=document.getElementById('fInfName').value.trim();
  if(!name) { showToast('El nombre es requerido','error'); return; }
  if(!currentCampaignId) return;
  const campaigns=getData('campaigns');
  const c=campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.influencers.push({
    id:id(),
    name, handle:document.getElementById('fInfHandle').value,
    platform:document.getElementById('fInfPlatform').value,
    format:document.getElementById('fInfFormat').value,
    publishDate:document.getElementById('fInfDate').value,
    status:document.getElementById('fInfStatus').value,
    contenidos: parseInt(document.getElementById('fInfContenidos').value)||0,
    boosted: parseInt(document.getElementById('fInfBoosted').value)||0,
    reach:0,impressions:0,interactions:0,er:'—'
  });
  setData('campaigns',campaigns);
  renderCampaignInfluencers(c);
  closeModal('influencerModal');
  showToast('Influencer agregado','success');
}

// --- Import masivo de influencers (pegar CSV/TSV) ---
function openBulkImportModal() {
  if(!currentCampaignId) { showToast('Abre una campaña primero','error'); return; }
  const ov = document.createElement('div');
  ov.className = 'modal-overlay open';
  ov.id = 'bulkImportModal';
  ov.innerHTML = `<div class="modal" style="max-width:560px;">
    <div class="modal-header"><div class="modal-title">Importar influencers</div><button class="modal-close" onclick="document.getElementById('bulkImportModal').remove()"><span class="icn-close"></span></button></div>
    <div class="modal-body" style="padding:18px;">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Pega una fila por influencer. Columnas separadas por coma o tabulador (puedes copiar directo de Excel/Sheets):</p>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-family:monospace;background:var(--bg);padding:8px 10px;border-radius:8px;">Nombre, @handle, Plataforma, Formato</p>
      <textarea id="bulkImportText" class="form-input" rows="9" style="font-size:13px;font-family:monospace;" placeholder="Crilon, @elcrilon, TikTok, Reel&#10;Ana López, @analopez, Instagram, Story"></textarea>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:10px;cursor:pointer;"><input type="checkbox" id="bulkSkipHeader"> La primera fila es encabezado (ignorar)</label>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="document.getElementById('bulkImportModal').remove()">Cancelar</button><button class="btn btn-primary" onclick="runBulkImport()">Importar</button></div>
  </div>`;
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.remove(); });
  document.body.appendChild(ov);
  setTimeout(()=>document.getElementById('bulkImportText')?.focus(),50);
}
function runBulkImport() {
  const raw = (document.getElementById('bulkImportText')?.value||'').trim();
  if(!raw) { showToast('Pega al menos una fila','error'); return; }
  const skipHeader = document.getElementById('bulkSkipHeader')?.checked;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!Array.isArray(c.influencers)) c.influencers = [];
  let lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(skipHeader) lines = lines.slice(1);
  const today = new Date().toISOString().split('T')[0];
  let added = 0;
  lines.forEach(line => {
    const parts = line.split(/\t|,/).map(p=>p.trim());
    const name = parts[0];
    if(!name) return;
    c.influencers.push({
      id:id(),
      name,
      handle: (parts[1]||'').replace(/^@/,''),
      platform: parts[2]||'',
      format: parts[3]||'',
      publishDate: today,
      status: 'Pendiente',
      contenidos:0, boosted:0, reach:0, impressions:0, interactions:0, er:'—'
    });
    added++;
  });
  if(!added) { showToast('No se detectaron filas válidas','error'); return; }
  setData('campaigns', campaigns);
  renderCampaignInfluencers(c);
  document.getElementById('bulkImportModal')?.remove();
  showToast(`${added} influencer${added!==1?'s':''} importado${added!==1?'s':''}`,'success');
}

function saveCampaignSheetsUrl() {
  if(!currentCampaignId) return;
  const url = document.getElementById('campaignSheetsUrl').value.trim();
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  c.sheetsUrl = url;
  setData('campaigns', campaigns);
}

async function syncInfluencersFromSheets() {
  if(!currentCampaignId) return;
  const url = document.getElementById('campaignSheetsUrl').value.trim();
  if(!url) { showToast('Pega primero la URL del Google Sheet','error'); return; }
  // Extract spreadsheet ID
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!match) { showToast('URL de Google Sheets inválida','error'); return; }
  const sheetId = match[1];
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  showToast('Sincronizando desde Sheets...');
  try {
    const res = await fetch(gvizUrl);
    const raw = await res.text();
    const json = JSON.parse(raw.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
    const cols = json.table.cols.map(c => (c.label || '').toLowerCase().trim());
    const rows = json.table.rows || [];
    const idx = (names) => { for(const n of names) { const i=cols.indexOf(n); if(i>=0) return i; } return -1; };
    const iName = idx(['nombre','name','creador','creator','influencer']);
    const iHandle = idx(['handle','@handle','usuario','user']);
    const iPlatform = idx(['plataforma','platform','red social']);
    const iFormat = idx(['formato','format','tipo','type']);
    const iDate = idx(['fecha','date','fecha publicación','publish date']);
    const iStatus = idx(['status','estado','estatus']);
    const iReach = idx(['alcance','reach']);
    const iImpr = idx(['impresiones','impressions']);
    const iInter = idx(['interacciones','interactions','engagement']);
    const iEr = idx(['er','engagement rate','tasa']);
    if(iName < 0) { showToast('No se encontró columna "Nombre" en el Sheet','error'); return; }
    const campaigns = getData('campaigns');
    const c = campaigns.find(x=>x.id===currentCampaignId);
    if(!c) return;
    const cell = (row, i) => i>=0 && row.c[i] ? (row.c[i].v != null ? String(row.c[i].v) : row.c[i].f || '') : '';
    let added = 0, updated = 0;
    rows.forEach(row => {
      if(!row.c) return;
      const name = cell(row, iName).trim();
      if(!name) return;
      const existing = c.influencers.find(inf => inf.name.toLowerCase() === name.toLowerCase());
      if(existing) {
        if(iHandle>=0) existing.handle = cell(row,iHandle) || existing.handle;
        if(iPlatform>=0) existing.platform = cell(row,iPlatform) || existing.platform;
        if(iFormat>=0) existing.format = cell(row,iFormat) || existing.format;
        if(iDate>=0) existing.publishDate = cell(row,iDate) || existing.publishDate;
        if(iStatus>=0) existing.status = cell(row,iStatus) || existing.status;
        if(iReach>=0) existing.reach = parseInt(cell(row,iReach))||existing.reach;
        if(iImpr>=0) existing.impressions = parseInt(cell(row,iImpr))||existing.impressions;
        if(iInter>=0) existing.interactions = parseInt(cell(row,iInter))||existing.interactions;
        if(iEr>=0) existing.er = cell(row,iEr) || existing.er;
        updated++;
      } else {
        c.influencers.push({
          id: id(), name,
          handle: cell(row,iHandle) || '',
          platform: cell(row,iPlatform) || 'Instagram',
          format: cell(row,iFormat) || 'Post',
          publishDate: cell(row,iDate) || '',
          status: cell(row,iStatus) || 'Pendiente',
          reach: parseInt(cell(row,iReach))||0,
          impressions: parseInt(cell(row,iImpr))||0,
          interactions: parseInt(cell(row,iInter))||0,
          er: cell(row,iEr) || '—'
        });
        added++;
      }
    });
    c.sheetsUrl = url;
    setData('campaigns', campaigns);
    renderCampaignInfluencers(c);
    showToast(`Sincronizado: ${added} nuevos, ${updated} actualizados`, 'success');
  } catch(err) {
    console.error('syncSheets error', err);
    showToast('Error al leer el Sheet. Verifica que sea público (compartido → "Cualquier persona con el enlace").', 'error');
  }
}

// === DOC URL HELPERS ===
function detectDocTypeFromUrl(url) {
  if(!url) return 'Otro';
  const u = url.toLowerCase();
  if(u.includes('docs.google.com/spreadsheets')) return 'Sheets';
  if(u.includes('docs.google.com/document')) return 'Doc';
  if(u.includes('docs.google.com/presentation')) return 'Presentación';
  if(u.includes('drive.google.com')) return 'Drive';
  if(u.endsWith('.pdf') || u.includes('.pdf?')) return 'PDF';
  if(u.endsWith('.xlsx') || u.endsWith('.csv')) return 'Sheets';
  if(u.endsWith('.docx')) return 'Doc';
  if(u.endsWith('.pptx')) return 'Presentación';
  return 'Otro';
}

function suggestTitleFromUrl(url) {
  if(!url) return '';
  try {
    const u = new URL(url);
    // Try filename in path
    const segs = u.pathname.split('/').filter(Boolean);
    let cand = segs[segs.length-1] || '';
    cand = decodeURIComponent(cand).replace(/[-_]/g,' ').replace(/\.[a-z0-9]+$/i,'');
    // Drive style /file/d/ID/view → use type label
    if(cand === 'view' || cand === 'edit' || /^[A-Za-z0-9_-]{20,}$/.test(cand) || cand === '') {
      const type = detectDocTypeFromUrl(url);
      return `Nuevo documento ${type}`;
    }
    return cand.charAt(0).toUpperCase() + cand.slice(1);
  } catch {
    return '';
  }
}

function onDocUrlInput() {
  const url = document.getElementById('fDocUrl').value.trim();
  const nameEl = document.getElementById('fDocName');
  const typeEl = document.getElementById('fDocType');
  // Auto-detect type
  typeEl.value = detectDocTypeFromUrl(url);
  // Only auto-fill title if empty (don't clobber edits)
  if(!nameEl.dataset.userEdited) nameEl.value = suggestTitleFromUrl(url);
}

function openAddDocModal() {
  document.getElementById('fDocDate').value=new Date().toISOString().split('T')[0];
  ['fDocName','fDocUrl'].forEach(id=>{
    const el=document.getElementById(id);
    el.value='';
    delete el.dataset.userEdited;
  });
  document.getElementById('fDocCampaignGroup').style.display = 'none';
  const cv = document.getElementById('fDocClientVisible'); if(cv) cv.checked = false;
  // mark name field as user-edited once they type
  document.getElementById('fDocName').oninput = (e) => { e.target.dataset.userEdited = '1'; };
  openModal('docModal');
}

function openAddDocModalGlobal() {
  document.getElementById('fDocDate').value=new Date().toISOString().split('T')[0];
  ['fDocName','fDocUrl'].forEach(id=>{
    const el=document.getElementById(id);
    el.value='';
    delete el.dataset.userEdited;
  });
  // Show campaign selector
  const grp = document.getElementById('fDocCampaignGroup');
  const sel = document.getElementById('fDocCampaign');
  const camps = visibleCampaigns();
  if(camps.length === 0) { showToast('Crea una campaña primero','error'); return; }
  sel.innerHTML = camps.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  // Pre-select selected page campaign if any
  const pageSel = document.getElementById('docPageCampaign');
  if(pageSel && pageSel.value) sel.value = pageSel.value;
  grp.style.display = 'block';
  const cv = document.getElementById('fDocClientVisible'); if(cv) cv.checked = false;
  document.getElementById('fDocName').oninput = (e) => { e.target.dataset.userEdited = '1'; };
  openModal('docModal');
}

function saveDoc() {
  const name=document.getElementById('fDocName').value.trim();
  const url=document.getElementById('fDocUrl').value.trim();
  if(!url) { showToast('El URL es requerido','error'); return; }
  if(!name) { showToast('El título es requerido','error'); return; }

  // Determine target campaign: explicit selector if shown, else currentCampaignId
  const grp = document.getElementById('fDocCampaignGroup');
  const targetCid = (grp && grp.style.display !== 'none')
    ? document.getElementById('fDocCampaign').value
    : currentCampaignId;
  if(!targetCid) { showToast('Selecciona una campaña','error'); return; }

  const campaigns=getData('campaigns');
  const c=campaigns.find(x=>x.id===targetCid);
  if(!c) return;
  if(!c.documents) c.documents = [];
  c.documents.push({
    id:id(), name,
    type:document.getElementById('fDocType').value,
    date:document.getElementById('fDocDate').value,
    url,
    clientVisible: !!document.getElementById('fDocClientVisible')?.checked,
    addedAt: Date.now(),
    addedBy: currentUser.uid
  });
  setData('campaigns',campaigns);
  if(currentCampaignId === targetCid) renderCampaignDocs(c);
  if(currentPage === 'documentos') renderDocumentosPage();
  closeModal('docModal');
  showToast('Documento agregado','success');
}

// === DOCUMENTOS PAGE ===
function renderDocumentosPage() {
  const camps = visibleCampaigns();
  const sel = document.getElementById('docPageCampaign');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Selecciona una campaña —</option>' +
    camps.map(c=>`<option value="${c.id}">${_esc(c.name)} (${_esc(c.client)})</option>`).join('');
  if(prev && camps.find(c=>c.id===prev)) sel.value = prev;

  const list = document.getElementById('docPageList');
  const cid = sel.value;
  if(!cid) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>Selecciona una campaña para ver sus documentos.</p></div>';
    return;
  }
  const c = camps.find(x=>x.id===cid);
  if(!c) return;
  let docs = (c.documents||[]).slice();
  const search = document.getElementById('docPageSearch').value.toLowerCase().trim();
  if(search) docs = docs.filter(d => (d.name||'').toLowerCase().includes(search));

  const sort = document.getElementById('docPageSort').value;
  docs.sort((a,b)=>{
    if(sort==='alpha-asc') return (a.name||'').localeCompare(b.name||'');
    if(sort==='alpha-desc') return (b.name||'').localeCompare(a.name||'');
    if(sort==='added-asc') return (a.addedAt||0) - (b.addedAt||0);
    return (b.addedAt||0) - (a.addedAt||0);
  });

  if(docs.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>Sin documentos en esta campaña.</p></div>';
    return;
  }
  const docIcons={PDF:'📄',Sheets:'📊',Doc:'📝',Presentación:'📋',Drive:'📦',Otro:'📎'};
  list.innerHTML = docs.map(d=>`
    <div class="doc-item" style="padding:12px 0;${d.url?'cursor:pointer;':''}" ${d.url?`onclick="if(event.target.closest('button,a'))return;window.open('${_esc(_safeUrl(d.url))}','_blank','noopener')"`:''}>
      <div class="doc-icon ${d.type==='PDF'?'doc-pdf':'doc-sheets'}">${docIcons[d.type]||'📎'}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name}${(typeof _docVisToggleHtml==='function')?_docVisToggleHtml(c.id,d):''}</div>
        <div class="doc-campaign">${d.type} · ${formatDateShort(d.date)||''}</div>
      </div>
      ${d.url?`<a href="${_esc(_safeUrl(d.url))}" target="_blank" rel="noopener" class="card-link" style="margin-right:8px;">Abrir →</a>`:''}
      <button onclick="event.stopPropagation();deleteDocFromPage('${c.id}','${d.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:4px;">✕</button>
    </div>`).join('');
}

function deleteDocFromPage(cid, docId) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===cid);
  if(!c) return;
  if(!isAdmin() && c.createdBy !== currentUser.uid && !(c.assignedTo||[]).includes(currentUser.uid)) {
    showToast('Sin permisos','error'); return;
  }
  c.documents = (c.documents||[]).filter(d=>d.id!==docId);
  setData('campaigns', campaigns);
  renderDocumentosPage();
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettingsUI() {
  const s=getSettings();
  document.getElementById('settingsApiKey').value=s.claudeApiKey||'';
  document.getElementById('settingsOpenAiKey').value=s.openaiApiKey||'';
  const provider = s.aiProvider||'anthropic';
  const radio = document.getElementById(provider==='openai'?'aiProviderOpenAI':'aiProviderAnthropic');
  if(radio) radio.checked=true;
  // Sync Apariencia controls
  const currentTheme = currentUserProfile?.theme || 'default';
  THEMES.forEach(t => {
    const sw = document.getElementById('stTheme-'+t);
    if(sw) sw.classList.toggle('selected', t === currentTheme);
  });
  const currentMode = (typeof getThemePref==='function') ? getThemePref() : 'auto';
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+currentMode);
  });
  const compact = localStorage.getItem('sidebarCompact') === '1';
  const cb = document.getElementById('settingsSidebarCompact');
  if(cb) cb.checked = compact;
  renderTeam();
}

function setModeBtn(mode) {
  applyThemePref(mode);
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+mode);
  });
}

function toggleCompactSidebar(on) {
  document.getElementById('mainSidebar').classList.toggle('compact', !!on);
  localStorage.setItem('sidebarCompact', on ? '1' : '0');
  // Keep the Ajustes checkbox in sync if the toggle was triggered elsewhere
  const cb = document.getElementById('settingsSidebarCompact');
  if(cb && cb.checked !== !!on) cb.checked = !!on;
}

function saveApiKeys() {
  const provider = document.querySelector('input[name="aiProvider"]:checked')?.value||'anthropic';
  saveSettingsData({
    claudeApiKey: document.getElementById('settingsApiKey').value,
    openaiApiKey: document.getElementById('settingsOpenAiKey').value,
    aiProvider: provider,
  });
  showToast('Configuración guardada','success');
}
function saveApiKey() { saveApiKeys(); }

function resetAllData() {
  if(!confirm('¿Seguro? Se borrarán TODOS los datos. Esta acción no se puede deshacer.')) return;
  localStorage.clear();
  location.reload();
}

async function deleteCampaign() {
  if(!currentCampaignId) return;
  const campaigns = getData('campaigns');
  const c = campaigns.find(x=>x.id===currentCampaignId);
  if(!c) return;
  if(!isAdmin() && c.createdBy !== currentUser.uid) {
    showToast('Solo admin o creador puede eliminar','error'); return;
  }
  if(!confirm(`¿Eliminar la campaña "${c.name}"? Esta acción no se puede deshacer.`)) return;
  const filtered = campaigns.filter(x=>x.id!==currentCampaignId);
  setData('campaigns', filtered);
  showCampaignList();
  showToast('Campaña eliminada','success');
}

async function nukeAllCampaigns() {
  if(!isAdmin()) { showToast('Solo admin','error'); return; }
  if(!confirm('⚠️ Esto BORRARÁ TODAS las campañas y tareas globales del workspace para todos los usuarios. ¿Continuar?')) return;
  if(!confirm('Última confirmación. ¿Seguro?')) return;
  setData('campaigns', []);
  setData('globalTasks', []);
  showToast('Todas las campañas eliminadas','success');
  if(currentPage === 'campannas') { showCampaignList(); renderCampaignGrid(); }
  if(currentPage === 'dashboard') renderDashboard();
}

// ============================================================
// UTILS
// ============================================================
function formatDate(str) {
  if(!str) return null;
  try {
    const d=new Date(str+'T12:00:00');
    return d.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});
  } catch { return str; }
}
function formatDateShort(str) {
  if(!str) return null;
  try {
    const d=new Date(str+'T12:00:00');
    return d.toLocaleDateString('es-MX',{day:'numeric',month:'short'});
  } catch { return str; }
}
// Locale-aware number parser. Handles:
//  - "1,180,000"  (en/US thousands)            -> 1180000
//  - "1.180.000"  (es-MX/EU thousands as dots) -> 1180000
//  - "1,234.56"   (en decimal w/ thousands)    -> 1234.56
//  - "1.234,56"   (es decimal w/ thousands)    -> 1234.56
//  - "1.18E6"     (scientific)                 -> 1180000
//  - "$ 1,234"    ($, %, spaces stripped)
//  - empty / NaN / formula errors              -> 0
function parseLocaleNumber(v) {
  if(v == null) return 0;
  let s = String(v).trim();
  if(!s) return 0;
  // Strip currency / unit chars but keep digits, dots, commas, minus, e/E
  s = s.replace(/[$%\s ]/g, '');
  if(!s || /^(#REF!|#N\/A|#DIV\/0!|#VALUE!|—|-)$/i.test(s)) return 0;
  // Pure scientific notation
  if(/^-?\d+(\.\d+)?e-?\d+$/i.test(s)) { const n=parseFloat(s); return isFinite(n)?n:0; }
  // "0.YYY" or "0,YYY" → always a decimal between 0 and 1
  if(/^-?0[.,]\d+$/.test(s)) { const n=parseFloat(s.replace(',','.')); return isFinite(n)?n:0; }
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);
  if(lastSep === -1) { const n = parseFloat(s); return isFinite(n)?n:0; }
  const tail = s.slice(lastSep+1);
  // If tail is 1-2 digits → decimal separator. If exactly 3 digits AND there
  // are other separators of the same kind → still thousands (e.g. "1.234.567").
  const decSep = s[lastSep];
  const isThousandsBlock = /^\d{3}$/.test(tail) && (s.split(decSep).length-1 > 1 || (decSep === '.' && lastComma === -1) || (decSep === ',' && lastDot === -1));
  let normalized;
  if(/^\d{1,2}$/.test(tail) || (/^\d{3}$/.test(tail) && !isThousandsBlock && lastDot !== -1 && lastComma !== -1)) {
    // Decimal present
    const thouSep = decSep === '.' ? ',' : '.';
    normalized = s.split(thouSep).join('').replace(decSep, '.');
  } else {
    // All separators are thousands
    normalized = s.replace(/[.,]/g, '');
  }
  const n = parseFloat(normalized);
  return isFinite(n)?n:0;
}

// Render the short form of a comma-separated pronouns value.
// Examples: "él/ellos"        -> "(él)"
//           "él/ellos, elle/elles" -> "(él, elle)"
// Returns "" if no value or no first-tokens parsed.
function _shortPronouns(raw) {
  if(!raw) return '';
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  const firsts = parts.map(p => p.split('/')[0].trim()).filter(Boolean);
  return firsts.length ? '(' + firsts.join(', ') + ')' : '';
}

// Pronoun chip toggle: multi-select, max 2.
function togglePronoun(btn) {
  if(!btn) return;
  const selected = document.querySelectorAll('#profilePronounsChips .pronoun-chip.selected');
  const isSel = btn.classList.contains('selected');
  if(!isSel && selected.length >= 2) return; // cap at 2
  btn.classList.toggle('selected');
  _refreshPronounChipState();
  // Update hidden input (comma-separated)
  const vals = Array.from(document.querySelectorAll('#profilePronounsChips .pronoun-chip.selected')).map(c => c.dataset.val);
  const inp = document.getElementById('profilePronounsInput');
  if(inp) inp.value = vals.join(', ');
  try { _syncProfilePreview(); } catch(e){}
}
function _refreshPronounChipState() {
  const selected = document.querySelectorAll('#profilePronounsChips .pronoun-chip.selected').length;
  document.querySelectorAll('#profilePronounsChips .pronoun-chip').forEach(c => {
    if(c.classList.contains('selected')) c.classList.remove('disabled');
    else c.classList.toggle('disabled', selected >= 2);
  });
}

// HTML-escape strings before injecting into innerHTML / attribute values.
// Use everywhere user-typed content (campaign / client / contact names,
// notes, sheet cells) flows into a template literal.
function _esc(s) {
  if(s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Solo permite URLs http(s); bloquea esquemas peligrosos (javascript:, data:, etc.)
// para enlaces de documentos que escribe el usuario. Devuelve '#' si no es válida.
function _safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s : '#';
}

function formatNum(n) {
  const num=parseInt(n)||0;
  if(num>=1000000) return (num/1000000).toFixed(1)+'M';
  if(num>=1000) return (num/1000).toFixed(0)+'K';
  return num.toLocaleString();
}

function statusBadgeClass(s) {
  const map = {'En proceso':'badge-blue','Ajustes':'badge-yellow','Pendiente cliente':'badge-orange','En reporte':'badge-red','En producción':'badge-purple','Completado':'badge-green'};
  return map[s] || 'badge-gray';
}

let _toastTimer = null;
function showToast(msg, type='', action) {
  const t=document.getElementById('toast');
  clearTimeout(_toastTimer);
  if(action && action.label && typeof action.fn === 'function') {
    window._toastAction = () => { try { action.fn(); } finally { t.classList.remove('show'); window._toastAction = null; } };
    t.innerHTML = `<span>${_esc(msg)}</span><button onclick="window._toastAction&&window._toastAction()" style="margin-left:12px;background:rgba(255,255,255,.18);border:none;color:#fff;font-weight:700;font-size:12px;padding:5px 12px;border-radius:10px;cursor:pointer;font-family:inherit;">${_esc(action.label)}</button>`;
  } else {
    window._toastAction = null;
    t.textContent = msg;
  }
  t.className='toast '+(type||'');
  setTimeout(()=>t.classList.add('show'),10);
  _toastTimer = setTimeout(()=>t.classList.remove('show'), action ? 5500 : 3000);
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>navigate(item.dataset.page));
});

document.querySelectorAll('.detail-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-'+tab.dataset.tab).classList.add('active');
    try { localStorage.setItem('cmos:lastCampaignTab', tab.dataset.tab); } catch(e){}
    // If we land on tracker or escenario and rows were already fetched while
    // the tab was hidden, force a render so the user sees them.
    if(currentCampaignId) {
      const c = (_cache.campaigns||[]).find(x => x.id === currentCampaignId);
      if(!c) return;
      if(tab.dataset.tab === 'tracker' && c.trackerRows && c.trackerRows.length) {
        try { renderCampaignTracker(c); } catch(e){}
      } else if(tab.dataset.tab === 'influencers') {
        try { renderEscenarioBlock(c); } catch(e){}
      }
    }
  });
});

// Close modals on overlay click (vía closeModal para limpiar z-index/contador)
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click',e=>{
    if(e.target===overlay) closeModal(overlay.id);
  });
});

// ============================================================
// AUTH
// ============================================================
async function loginGoogle() {
  const errEl = document.getElementById('loginError');
  try {
    // capture chosen area so onAuthStateChanged can seed it for new profiles
    // El login v3 ya no tiene selector de área (se captura en el onboarding).
    window._pendingArea = document.getElementById('loginAreaInput')?.value || '';
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({hd:'thinkydigital.com'});
    provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
    provider.addScope('https://www.googleapis.com/auth/gmail.modify');
    const result = await auth.signInWithPopup(provider);
    if(!isAllowedEmail(result.user.email)) {
      await auth.signOut();
      errEl.textContent='Solo se permiten correos @thinkydigital.com';
      return;
    }
    // Store token with expiry for persistence
    if(result.credential && result.credential.accessToken) {
      calendarAccessToken = result.credential.accessToken;
      const expiry = Date.now() + 55 * 60 * 1000;
      localStorage.setItem('gcalToken', calendarAccessToken);
      localStorage.setItem('gcalTokenExpiry', expiry.toString());
    }
    // user profile is created/merged in onAuthStateChanged
  } catch(e) {
    errEl.textContent = traduceFirebaseError(e.code) || e.message;
  }
}

function traduceFirebaseError(code) {
  const map = {
    'auth/invalid-email':'Email inválido',
    'auth/user-not-found':'Usuario no existe',
    'auth/wrong-password':'Contraseña incorrecta',
    'auth/invalid-credential':'Credenciales inválidas',
    'auth/email-already-in-use':'Este email ya tiene cuenta',
    'auth/weak-password':'Contraseña muy débil (mínimo 6 caracteres)',
    'auth/popup-closed-by-user':'Cancelaste el login',
  };
  return map[code];
}

async function logout() {
  unsubscribers.forEach(u=>u()); unsubscribers=[];
  await auth.signOut();
  location.reload();
}

// ============================================================
// INIT
// ============================================================
auth.onAuthStateChanged(async (user) => {
  // Modo cliente (?client=TOKEN): vista pública de solo lectura — nunca
  // mostramos login ni inicializamos el app shell interno.
  if(new URLSearchParams(location.search).get('client')) return;
  if(!user) {
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  // Domain enforcement
  if(!isAllowedEmail(user.email)) {
    await auth.signOut();
    document.getElementById('loginError').textContent = 'Solo se permiten correos @thinkydigital.com';
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }
  currentUser = user;
  // Smooth fade-out of login + fade-in of app shell
  try { _playLoginToAppTransition(); } catch(e){}
  document.getElementById('loginScreen').classList.add('hidden');
  // Stop login screen timers / listeners now that it's hidden
  try { _stopLoginInteractions(); } catch(e){}

  // Get/create user profile with role
  const ws = db.collection('workspaces').doc(WORKSPACE);
  const userDocRef = db.collection('users').doc(user.uid);
  const userSnap = await userDocRef.get();
  if(!userSnap.exists) {
    currentUserProfile = {
      uid: user.uid,
      name: user.displayName || user.email.split('@')[0],
      email: user.email,
      role: INITIAL_ADMINS.includes(user.email.toLowerCase()) ? 'admin' : 'member',
      area: window._pendingArea || '',
      photoURL: user.photoURL || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    window._pendingArea = null;
    await userDocRef.set(currentUserProfile);
  } else {
    currentUserProfile = {uid: user.uid, ...userSnap.data()};
    // First user ever becomes admin if no admins exist
    if(currentUserProfile.role !== 'admin' && INITIAL_ADMINS.includes(user.email.toLowerCase())) {
      await userDocRef.update({role:'admin'});
      currentUserProfile.role = 'admin';
    }
  }
  // Mirror display profile into workspace/members so all workspace users can read it
  const memberRef = ws.collection('members').doc(user.uid);
  const memberProfile = {
    uid: currentUserProfile.uid,
    name: currentUserProfile.name,
    email: currentUserProfile.email,
    role: currentUserProfile.role,
    area: currentUserProfile.area || '',
    photoURL: currentUserProfile.photoURL || null,
    // Only write emoji/gradient if they exist — never overwrite with empty string
    ...(currentUserProfile.profileEmoji    ? { profileEmoji:    currentUserProfile.profileEmoji    } : {}),
    ...(currentUserProfile.profileGradient ? { profileGradient: currentUserProfile.profileGradient } : {}),
  };
  await memberRef.set(memberProfile, {merge:true});

  // Initial fetch (members from workspace — readable by all workspace members)
  const [campaignsSnap, tasksSnap, settingsDoc, membersSnap] = await Promise.all([
    ws.collection('campaigns').get(),
    ws.collection('globalTasks').get(),
    ws.collection('config').doc('settings').get(),
    ws.collection('members').get()
  ]);
  _cache.campaigns = campaignsSnap.docs.map(d=>d.data());
  _cache.globalTasks = tasksSnap.docs.map(d=>d.data());
  _cache.settings = settingsDoc.exists ? settingsDoc.data() : {};
  allUsers = membersSnap.docs.map(d => ({uid:d.id, ...d.data()}));
  // Ensure current user is always in allUsers even if fetch missed them
  if(!allUsers.find(u=>u.uid===user.uid)) allUsers.push(memberProfile);

  // Render sidebar team strip early
  renderSidebarTeam();

  // Seed sample data ONLY if workspace empty AND first time globally
  const seeded = await ws.collection('config').doc('seeded').get();
  if(!seeded.exists && _cache.campaigns.length === 0) {
    await seedSampleData();
    await ws.collection('config').doc('seeded').set({at: firebase.firestore.FieldValue.serverTimestamp(), by: user.uid});
  }

  // Borra pendientes tachados con más de una semana antes de pintar
  try { _purgeOldDoneTasks(); } catch(e){ console.warn('purge done tasks failed', e); }

  // Realtime listeners
  attachListeners();

  // Update UI with user info
  const displayName = currentUserProfile.name || user.email.split('@')[0];
  const shortPron = (typeof _shortPronouns==='function') ? _shortPronouns(currentUserProfile.pronouns) : '';
  const sidebarNameEl = document.getElementById('userNameSidebar');
  sidebarNameEl.textContent = displayName + (shortPron ? ' ' + shortPron : '');
  updateSidebarAvatar();
  loadTheme(currentUserProfile);
  initNotifications();
  if(calendarAccessToken) { loadCalendarEvents(); loadGmailMessages(); }
  else { renderCalendarWidget(); renderGmailWidget(); }
  const roleBadge = document.getElementById('userRoleSidebar');
  if(roleBadge) roleBadge.textContent = currentUserProfile.puesto || (currentUserProfile.role === 'admin' ? 'Admin' : 'Miembro');

  // Date
  const now = new Date();
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  populateCampaignSelects();
  renderDashboard();
  // Load calendar and Gmail if token already stored (returning user)
  if(calendarAccessToken) { loadCalendarEvents(); loadGmailMessages(); }
  else { renderCalendarWidget(); renderGmailWidget(); }

  // Restore last page + campaign detail across reload
  try {
    const lastPage = localStorage.getItem('cmos:lastPage');
    const lastCid  = localStorage.getItem('cmos:lastCampaignId');
    const lastCtab = localStorage.getItem('cmos:lastCampaignTab');
    const validPages = new Set(['dashboard','campannas','metricas','influencers','documentos','calendario','generador','pendientes','equipo','ajustes']);
    const validTabs  = new Set(['resumen','influencers','tracker','pendientes','documentos','flujo']);
    if(lastPage && validPages.has(lastPage) && lastPage !== 'dashboard') {
      navigate(lastPage);
    }
    if(lastCid && (lastPage === 'campannas' || !lastPage)) {
      const c = (_cache.campaigns||[]).find(x => x.id === lastCid);
      if(c && (typeof canSeeCampaign !== 'function' || canSeeCampaign(c))) {
        navigate('campannas');
        openCampaignDetail(lastCid);
        if(lastCtab && validTabs.has(lastCtab)) setTimeout(() => { try { _switchCampaignTab(lastCtab); } catch(e){} }, 50);
      } else {
        // Stale id (deleted / lost access) — clear so we don't loop next reload
        try { localStorage.removeItem('cmos:lastCampaignId'); localStorage.removeItem('cmos:lastCampaignTab'); } catch(e){}
      }
    }
  } catch(e){ console.warn('restore last view failed', e); }

  // Onboarding en el primer login: completar perfil + elegir campañas a seguir
  if(!currentUserProfile.onboardingDone) {
    try { startOnboarding(); } catch(e){ console.warn('onboarding failed', e); }
  }
});

function isAdmin() { return currentUserProfile && currentUserProfile.role === 'admin'; }
function canSeeCosts() {
  if(isAdmin()) return true;
  return currentUserProfile && COST_ACCESS_PUESTOS.has(currentUserProfile.puesto);
}
// Operaciones gate — controls access to private creator info
// (phone / agency / contact email / ops notes).
function isOperaciones() {
  if(!currentUserProfile) return false;
  const a = String(currentUserProfile.area||'').toLowerCase();
  return a === 'operaciones' || a.includes('operaciones');
}
function canSeeCreatorPrivateInfo() {
  return isAdmin() || isOperaciones();
}
function isSubscribed(cid) {
  if(isAdmin()) return true;
  return (currentUserProfile.subscribedCampaigns || []).includes(cid);
}
function canSeeCampaign(c) {
  if(!c) return false;
  if(isAdmin()) return true;
  if(c.createdBy === currentUser.uid) return true;
  if(Array.isArray(c.assignedTo) && c.assignedTo.includes(currentUser.uid)) return true;
  if(isSubscribed(c.id)) return true;
  return false;
}
async function toggleSubscribeCampaign(cid, e) {
  e.stopPropagation();
  if(isAdmin()) return;
  const subs = currentUserProfile.subscribedCampaigns || [];
  const alreadySub = subs.includes(cid);
  const newSubs = alreadySub ? subs.filter(x=>x!==cid) : [...subs, cid];
  currentUserProfile.subscribedCampaigns = newSubs;
  try {
    await db.collection('users').doc(currentUser.uid).update({subscribedCampaigns: newSubs});
  } catch(e) { console.error('toggleSubscribe error', e); }
  renderCampaignGrid();
  if(currentPage==='dashboard') renderDashboard();
  showToast(alreadySub ? 'Campaña removida de tu dashboard' : 'Campaña añadida a tu dashboard', 'success');
}

