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
// ============================================================
// CONFIRMAR
// ============================================================
// Sustituye a confirm(). El nativo rotula sus botones Aceptar/Cancelar, así que
// en una acción destructiva se confirma sin leer qué se acepta; aquí el botón
// dice la acción ("Borrar las 14 campañas") y el cuerpo dice qué se pierde.
// Devuelve una promesa: `if(!await confirmar({...})) return;`
function confirmar({ title, body, bodyHtml, confirmLabel, cancelLabel, danger, foco } = {}) {
  return new Promise(resolve => {
    const modal  = document.getElementById('confirmModal');
    const okBtn  = document.getElementById('confirmOkBtn');
    const noBtn  = document.getElementById('confirmCancelBtn');
    // Sin el diálogo en el DOM no se puede preguntar; negar es lo seguro en una
    // acción destructiva, que es para lo único que se usa esto.
    if(!modal || !okBtn || !noBtn) { resolve(false); return; }

    document.getElementById('confirmTitle').textContent = title || '¿Continuar?';
    // `body` es texto y se escapa solo; `bodyHtml` es para los diálogos que
    // necesitan estructura —una lista de quiénes, de qué van a poder ver— y lo
    // arma el llamador, que es quien sabe escapar lo que viene de datos.
    const cuerpo = document.getElementById('confirmBody');
    // .confirm-body trae white-space:pre-line, que existe para respetar los
    // saltos del texto plano. Con HTML eso reproduce cada salto y sangría de la
    // plantilla como espacio en blanco de verdad.
    cuerpo.classList.toggle('con-html', !!bodyHtml);
    if(bodyHtml) cuerpo.innerHTML = bodyHtml; else cuerpo.textContent = body || '';
    okBtn.textContent = confirmLabel || 'Continuar';
    noBtn.textContent = cancelLabel  || 'Cancelar';
    okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

    const cerrar = (valor) => {
      okBtn.removeEventListener('click', siClick);
      noBtn.removeEventListener('click', noClick);
      document.removeEventListener('keydown', onKey);
      closeModal('confirmModal');
      resolve(valor);
    };
    const siClick = () => cerrar(true);
    const noClick = () => cerrar(false);
    const onKey = (e) => {
      if(e.key === 'Escape') { e.preventDefault(); cerrar(false); }
      if(e.key === 'Enter')  { e.preventDefault(); cerrar(true); }
    };

    okBtn.addEventListener('click', siClick);
    noBtn.addEventListener('click', noClick);
    document.addEventListener('keydown', onKey);
    openModal('confirmModal');
    // El foco arranca en Cancelar: en un diálogo destructivo, la tecla que se
    // aprieta sin pensar no debe ser la que borra. `foco:'ok'` lo cambia para
    // los avisos que no destruyen nada y donde seguir es lo normal.
    setTimeout(() => { try { (foco === 'ok' ? okBtn : noBtn).focus(); } catch(e){} }, 30);
  });
}

// ============================================================
// FOCO EN MODALES
// Los modales eran divs que aparecían: el foco del teclado se quedaba atrás,
// en el botón que los abrió, así que Tab seguía recorriendo la página de
// abajo — invisible, tapada por el overlay — y Esc no hacía nada. Esto lo
// mueve adentro, lo encierra mientras el modal está abierto y lo devuelve
// al botón de origen al cerrar.
// ============================================================

// Pila, no variable suelta: la app encima de un modal abre otro (elegir
// creador dentro de escenario) y al cerrar el de arriba el foco tiene que
// volver al de abajo, no a la página.
const _focoPrevio = [];

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function _enfocables(el) {
  return Array.from(el.querySelectorAll(FOCUSABLES))
    .filter(n => n.offsetWidth || n.offsetHeight || n.getClientRects().length);
}

// Tab en el último elemento vuelve al primero, y Shift+Tab al revés. Se
// escucha en captura para ganarle a los handlers de cada modal.
function _trampaTab(e) {
  if(e.key !== 'Tab') return;
  const abiertos = document.querySelectorAll('.modal-overlay.open');
  const modal = abiertos[abiertos.length - 1];
  if(!modal) return;
  const f = _enfocables(modal);
  if(!f.length) { e.preventDefault(); modal.focus(); return; }
  const primero = f[0], ultimo = f[f.length - 1];
  if(e.shiftKey && (document.activeElement === primero || !modal.contains(document.activeElement))) {
    e.preventDefault(); ultimo.focus();
  } else if(!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault(); primero.focus();
  }
}
document.addEventListener('keydown', _trampaTab, true);

// Esc cierra el modal de más arriba. Si alguien ya trató la tecla (el
// confirm tiene su propio handler, que además resuelve su promesa), no se
// vuelve a cerrar encima.
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || e.defaultPrevented) return;
  const abiertos = document.querySelectorAll('.modal-overlay.open');
  const modal = abiertos[abiertos.length - 1];
  if(modal) { e.preventDefault(); closeModal(modal.id); }
});

function openModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  _focoPrevio.push(document.activeElement);
  _modalZ += 2;
  el.style.zIndex = _modalZ;
  el.classList.add('open');
  // En un tick, no en requestAnimationFrame: mientras el modal está
  // display:none no hay nada enfocable, pero rAF no corre si la pestaña
  // está en segundo plano y el foco se quedaría afuera. Un timeout de 0
  // sigue llegando antes que los setTimeout(30-50ms) con los que varias
  // pantallas enfocan su propio campo, así que quien tenga una preferencia
  // la conserva.
  setTimeout(() => {
    if(el.contains(document.activeElement)) return;
    const f = _enfocables(el);
    if(f.length) { try { f[0].focus(); } catch(e){} }
    else { el.setAttribute('tabindex','-1'); try { el.focus(); } catch(e){} }
  }, 0);
  // Las píldoras de pestaña se miden con offsetWidth, que da 0 mientras el modal
  // está oculto. Se remiden ya abierto, en el frame siguiente, para que el tab
  // activo tenga fondo desde el primer vistazo.
  requestAnimationFrame(() => {
    try { if(typeof initTransitions === 'function') initTransitions(el); } catch(e){}
  });
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
    // Devolver el foco a quien abrió. Se comprueba que siga en el documento:
    // varias listas se re-renderean mientras el modal está abierto y el botón
    // original ya no existe cuando volvemos.
    const previo = _focoPrevio.pop();
    if(previo && previo !== document.body && document.contains(previo)) {
      try { previo.focus({ preventScroll:true }); } catch(e){}
    }
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

const AREAS = ['Operaciones','Cuentas','Creativo','Data','Administración'];
const AREA_IDS = {Operaciones:'fAreaOps', Cuentas:'fAreaCuentas', Creativo:'fAreaCreativo', Data:'fAreaData', 'Administración':'fAreaAdmin'};
const AREA_KEYS = {Operaciones:'operaciones', Cuentas:'cuentas', Creativo:'creativo', Data:'data', 'Administración':'administracion'};
// Las llaves de responsables, en un solo lugar: antes estaban repetidas a mano
// en cuatro sitios y agregar un área obligaba a acordarse de todos.
const AREA_KEY_LIST = Object.values(AREA_KEYS);

// In-memory state for multi-picker during modal editing
let _areaSelections = {operaciones:[], cuentas:[], creativo:[], data:[], administracion:[]};

function getAreaUids(responsables, key) {
  const v = (responsables||{})[key];
  if(!v) return [];
  return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
}

/* ¿Esta persona es responsable de alguna área de esta campaña?
   Se recorre AREA_KEY_LIST y no una lista escrita a mano: había dos copias del
   chequeo con `['operaciones','cuentas','creativo','data']` y las dos se
   quedaron sin Administración cuando esa área se agregó. Cada área puede
   guardar un uid suelto o un arreglo, que es lo que normaliza getAreaUids. */
function esResponsableDe(c, uid) {
  if(!c || !uid || !c.responsables) return false;
  return AREA_KEY_LIST.some(k => getAreaUids(c.responsables, k).includes(uid));
}

/* Quién puede editar una campaña. Antes bastaba con ser Participante; al
   retirarse esa figura, el permiso pasa a quien tiene un papel real: quien la
   creó y quien es responsable de un área. Sin esto, un responsable de Cuentas
   dejaría de poder editar la campaña que lleva. */
function puedeEditarCampana(c) {
  if(!c || !currentUser) return false;
  if(typeof isAdmin === 'function' && isAdmin()) return true;
  if(c.createdBy === currentUser.uid) return true;
  return esResponsableDe(c, currentUser.uid);
}

function populateCampResponsibles(responsables) {
  responsables = responsables || {};
  _areaOpen = null;
  AREA_KEY_LIST.forEach(k => { _areaQuery[k] = ''; });
  AREAS.forEach(area => {
    const key = AREA_KEYS[area];
    _areaSelections[key] = getAreaUids(responsables, key);
    renderAreaPicker(key);
  });
}

function renderAreaPicker(areaKey) {
  const divId = AREA_IDS[AREAS.find(a => AREA_KEYS[a] === areaKey)];
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
  const q = (_areaQuery[areaKey] || '').trim().toLowerCase();
  const nameOf = u => u.name || (u.email || '').split('@')[0] || 'Sin nombre';
  const available = allUsers
    .filter(u => !selectedSet.has(u.uid))
    .filter(u => !q
      || nameOf(u).toLowerCase().includes(q)
      || String(u.email||'').toLowerCase().includes(q)
      || String(u.puesto||'').toLowerCase().includes(q)
      || String(u.area||'').toLowerCase().includes(q))
    .sort((a,b) => nameOf(a).localeCompare(nameOf(b)));
  const dropdownItems = available.length === 0
    ? `<div class="area-dropdown-empty">${q ? 'Nadie con ese nombre.' : 'Todos los usuarios asignados.'}</div>`
    : available.map(u => {
        const name = nameOf(u);
        return `<div class="area-dropdown-item" onclick="addToArea('${areaKey}','${u.uid}');event.stopPropagation();">
          ${memberAvatarHtml(u, 26)}
          <span style="flex:1">${_esc(name)}</span>
          ${u.puesto ? `<span style="font-size:10px;color:var(--text-muted);">${_esc(u.puesto)}</span>` : ''}
          ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:9px;">${_esc(u.area)}</span>` : ''}
        </div>`;
      }).join('');
  // Buscador: con ocho o más personas, encontrar a alguien deslizando una lista
  // es más lento que escribir su nombre. Se filtra por nombre, correo, puesto y
  // área, que es como la gente se acuerda de sus compañeros.
  const isOpen = _areaOpen === areaKey;
  el.innerHTML = chips + addBtn + `
    <div class="area-dropdown" id="areaDD_${areaKey}" style="display:${isOpen?'':'none'};">
      <input type="search" class="area-dropdown-search" id="areaQ_${areaKey}"
        placeholder="Buscar por nombre, puesto o área..." autocomplete="off"
        value="${_esc(_areaQuery[areaKey] || '')}"
        oninput="areaSearch('${areaKey}', this.value);event.stopPropagation();"
        onclick="event.stopPropagation();">
      <div class="area-dropdown-list">${dropdownItems}</div>
    </div>`;
  if(isOpen) {
    const inp = document.getElementById('areaQ_' + areaKey);
    if(inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e){} }
  }
}

// Texto del buscador por área, y cuál dropdown está abierto. Viven fuera del
// render porque renderAreaPicker rehace el nodo entero en cada tecla.
const _areaQuery = {};
let _areaOpen = null;

function areaSearch(areaKey, v) {
  _areaQuery[areaKey] = v;
  renderAreaPicker(areaKey);
}

// Un solo lector para las dos ramas de saveCampaign; agregar un área ya no
// obliga a tocar dos objetos literales que es fácil dejar desincronizados.
function _readAreaSelections() {
  const out = {};
  AREA_KEY_LIST.forEach(k => { out[k] = (_areaSelections[k] || []).slice(); });
  return out;
}

function addToArea(areaKey, uid) {
  if(!_areaSelections[areaKey]) _areaSelections[areaKey] = [];
  if(!_areaSelections[areaKey].includes(uid)) _areaSelections[areaKey].push(uid);
  // La búsqueda se vacía para poder teclear el siguiente nombre sin borrar.
  _areaQuery[areaKey] = '';
  renderAreaPicker(areaKey);
}

function removeFromArea(areaKey, uid) {
  _areaSelections[areaKey] = (_areaSelections[areaKey]||[]).filter(x => x !== uid);
  renderAreaPicker(areaKey);
}

function toggleAreaDropdown(areaKey) {
  const abrir = _areaOpen !== areaKey;
  _areaOpen = abrir ? areaKey : null;
  _areaQuery[areaKey] = '';
  // Se repintan todos: el que se abre necesita su buscador enfocado y los demás
  // tienen que cerrarse, y el estado vive en _areaOpen, no en el style del nodo.
  AREA_KEY_LIST.forEach(k => renderAreaPicker(k));
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
    showToast('Solo un admin o quien creó la campaña puede editarla.','error'); return;
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
  // Se escriben SIEMPRE, aunque la campaña no tenga nano: si solo se llenaban
  // cuando hasNano, editar una campaña con nano y luego una sin él dejaba los
  // inputs con las pestañas de la anterior, y saveCampaign las guardaba en la
  // campaña equivocada.
  const aonInp2 = document.getElementById('fCampAonTab');
  const nanoInp = document.getElementById('fCampNanoTab');
  if(aonInp2) aonInp2.value = c.trackerAonTab||'';
  if(nanoInp) nanoInp.value = c.trackerNanoTab||'';
  applyBudgetVisibility();
  openModal('campaignModal');
}

// === ASSIGNEES ===
/* Aviso de acceso, antes de etiquetar a alguien en una campaña.
   Etiquetar no es sólo repartir trabajo: abre la campaña entera a esa persona
   —presupuesto, contactos del cliente, el tracker y los links de los
   documentos— y eso no se ve por ningún lado al marcar una casilla. Quien
   etiqueta suele estar pensando "que se entere de esta tarea", no "que pueda
   abrir el contrato".

   Se pregunta SÓLO cuando hay gente nueva: reconfirmar a quien ya estaba
   dentro convierte el aviso en un trámite que se acepta sin leer, y a la
   tercera vez ya nadie lo lee de verdad.

   No es destructivo, así que el botón de seguir es el primario y se lleva el
   foco: lo normal aquí es continuar. */
async function confirmarAccesoCampana(nombresUids, nombreCampana, campanaAntes) {
  // Se avisa sólo por quien GANA acceso. A ti mismo no hay nada que avisarte, y
  // quien ya entraba por otra vía —ya era responsable, o ya estaba asignado— no
  // gana nada nuevo: contarlo otra vez convierte el aviso en ruido y el ruido
  // se acepta sin leer.
  const yaEntraba = (uid) => {
    const c = campanaAntes;
    if(!c) return false;
    if(esResponsableDe(c, uid)) return true;
    return c.createdBy === uid;
  };
  const uids = [...new Set((nombresUids || []).filter(Boolean))]
    .filter(uid => uid !== (currentUser && currentUser.uid))
    .filter(uid => !yaEntraba(uid));
  if(!uids.length) return true;

  const personas = uids.map(uid => {
    const u = (allUsers || []).find(x => x.uid === uid);
    return u ? (u.name || (u.email||'').split('@')[0] || 'Alguien') : 'Alguien';
  });

  const uno = personas.length === 1;
  const lista = personas.map(n => `<li>${_esc(n)}</li>`).join('');
  const sujeto = uno
    ? `<strong>${_esc(personas[0])}</strong>`
    : `estas <strong>${personas.length}</strong> personas`;

  // Sin clíticos con género: "al agregarla" se equivoca con la mitad del equipo,
  // y esta app pregunta los pronombres de cada quien justamente para no hacer eso.
  const bodyHtml = `
    <p>Si agregas a ${sujeto} a
    <strong>${_esc(nombreCampana || 'esta campaña')}</strong>, va${uno ? '' : 'n'} a poder ver
    <strong>toda la campaña</strong>, no sólo lo que le${uno ? '' : 's'} toca:</p>
    <ul class="confirm-list">
      <li>El presupuesto y los contactos del cliente</li>
      <li>Los documentos y sus links, incluido lo que esté enlazado a Drive</li>
      <li>El tracker, las métricas y el escenario</li>
      <li>Todas las tareas de la campaña y quién las lleva</li>
    </ul>
    ${uno ? '' : `<p style="margin-top:12px;font-weight:700;color:var(--text);">Se agrega a:</p>
    <ul class="confirm-list">${lista}</ul>`}`;

  return confirmar({
    title: uno ? 'Va a ver toda la campaña' : 'Van a ver toda la campaña',
    bodyHtml,
    confirmLabel: 'Sí, agregar',
    cancelLabel: 'Cancelar',
    foco: 'ok',
  });
}

// === TEAM MGMT ===
// ============================================================
// EQUIPO PAGE (visible to all users)
// ============================================================
let _equipoAreaFilter = 'todos';
let _equipoView = 'directorio';   // directorio | organigrama

function setEquipoView(v) {
  _equipoView = v;
  document.querySelectorAll('#equipoViewTabs .profile-tab-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.eqtab === v));
  renderEquipo();
}

function renderEquipo() {
  const filterBar = document.getElementById('equipoFilterBar');
  const grid = document.getElementById('equipoGrid');
  const org  = document.getElementById('equipoOrg');
  if(!filterBar || !grid) return;

  // El filtro por área es del directorio: en el organigrama esconder a media
  // empresa deja un árbol con huecos que se lee como si faltara gente.
  const esOrg = _equipoView === 'organigrama';
  filterBar.style.display = esOrg ? 'none' : '';
  grid.style.display      = esOrg ? 'none' : '';
  if(org) org.style.display = esOrg ? '' : 'none';
  if(esOrg) { renderOrganigrama(); return; }

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
    grid.innerHTML = '<div class="empty-state"><p>Nadie en esta área todavía. Cambia el área de alguien desde su perfil para verlo aquí.</p></div>';
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
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;"><span class="icn-inline">${ICN_trophy}</span>Kudos</button>` : ''}
      ${(!isMe && isAdmin()) ? `<button class="team-card-del" onclick="event.stopPropagation();openDeleteUserModal('${u.uid}')" title="Eliminar el perfil de esta persona del workspace">Eliminar perfil</button>` : ''}
    </div>`;
  }).join('')}</div>`;
  try { _wireAvatarGroup(document.getElementById('equipoAvatarGroup')); } catch(e){}
}

// ============================================================
// ORGANIGRAMA
// ============================================================
// Se dibuja desde NIVELES + PUESTO_NIVEL (js/core.js), no desde líneas de
// reporte capturadas a mano: el producto no las tiene. Cada fila es un nivel y
// dentro se agrupa por área, que es como el equipo se organiza en la práctica.
// Cuando existan permisos por nivel, este es el mismo dato que los va a regir.
function renderOrganigrama() {
  const host = document.getElementById('equipoOrg');
  if(!host) return;

  const porNivel = new Map();
  allUsers.forEach(u => {
    const n = nivelDe(u);
    if(!porNivel.has(n)) porNivel.set(n, []);
    porNivel.get(n).push(u);
  });
  const niveles = [...porNivel.keys()].sort((a,b) => a-b);

  if(!niveles.length) {
    host.innerHTML = '<div class="empty-state"><p>Sin equipo cargado. En cuanto alguien entre con su correo de Think Y., aparece aquí.</p></div>';
    return;
  }

  const tarjeta = u => `
    <div class="org-person" onclick="openProfileModal('${u.uid}')" title="${_esc((u.puesto||'Sin puesto') + ' · ' + (u.area||'Sin área'))}">
      ${memberAvatarHtml(u, 38, '12px')}
      <div class="org-person-id">
        <span class="org-person-name">${_esc(u.name || u.email || '—')}</span>
        <span class="org-person-role">${_esc(u.puesto || (u.role==='admin' ? 'Admin' : 'Sin puesto'))}</span>
      </div>
      ${u.area ? `<span class="badge badge-area-${u.area}" style="font-size:9px;">${_esc(u.area)}</span>` : ''}
    </div>`;

  host.innerHTML = niveles.map(n => {
    const gente = porNivel.get(n).slice().sort((a,b) =>
      String(a.area||'').localeCompare(String(b.area||'')) ||
      String(a.name||'').localeCompare(String(b.name||'')));
    const meta = NIVELES.find(v => v.n === n);
    // Por área dentro del nivel, para que se lea la fila como una capa real.
    const porArea = new Map();
    gente.forEach(u => {
      const a = u.area || 'Sin área';
      if(!porArea.has(a)) porArea.set(a, []);
      porArea.get(a).push(u);
    });
    return `
      <section class="org-nivel">
        <header class="org-nivel-head">
          <span class="org-nivel-n">${n === 99 ? '—' : n}</span>
          <div>
            <div class="org-nivel-label">${_esc(nivelLabel(n))}</div>
            <div class="org-nivel-desc">${_esc(meta ? meta.desc : 'Puesto sin nivel asignado en PUESTO_NIVEL.')}</div>
          </div>
          <span class="org-nivel-count">${gente.length}</span>
        </header>
        <div class="org-nivel-body">
          ${[...porArea.entries()].map(([area, us]) => `
            <div class="org-area">
              <div class="org-area-label">${_esc(area)}</div>
              <div class="org-area-people">${us.map(tarjeta).join('')}</div>
            </div>`).join('')}
        </div>
      </section>`;
  }).join('') + `
    <p class="org-nota">
      El orden sale del puesto de cada quien (<code>PUESTO_NIVEL</code> en
      <code>js/core.js</code>). No son líneas de reporte persona a persona: para
      eso hace falta capturarlas. Un puesto que no esté dado de alta ahí aparece
      como <b>Sin nivel</b>.
    </p>`;
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
    list.innerHTML = '<div class="empty-state"><p>Sin miembros todavía. En cuanto alguien entre con su correo de Think Y., aparece aquí.</p></div>';
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
      ${!isMe ? `<button class="kudos-btn" onclick="sendKudos('${u.uid}',event)" style="margin-top:2px;"><span class="icn-inline">${ICN_trophy}</span>Kudos</button>` : ''}
      ${adminSelects}
    </div>`;
  }).join('')}</div>`;
}

async function changeArea(uid, newArea) {
  if(!isAdmin()) { showToast('Cambiar el área es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
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
  } catch(e) { avisarError(e, 'cambiar el área', 'changeArea'); }
}

async function changeRole(uid, newRole) {
  if(!isAdmin()) { showToast('Cambiar roles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({role: newRole}),
      ws.collection('members').doc(uid).set({role: newRole}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.role = newRole;
    showToast('Rol actualizado','success');
    renderTeam();
  } catch(e) { avisarError(e, 'cambiar el rol', 'changeRole'); }
}

// ---- Eliminar perfil (admin) ----
function _countUserRefs(uid) {
  let campCreated=0, campSubs=0, campResp=0, tasksCamp=0, tasksGlobal=0;
  const perfil = (allUsers||[]).find(u => u.uid === uid);
  const seguidas = new Set(Array.isArray(perfil && perfil.subscribedCampaigns) ? perfil.subscribedCampaigns : []);
  (_cache.campaigns||[]).forEach(c => {
    if(c.createdBy === uid) campCreated++;
    // La suscripción vive en el perfil; en la campaña sólo puede quedar rastro
    // viejo de quien todavía no haya migrado. Cuenta si está en cualquiera de
    // las dos, pero una sola vez: si no, la que está en ambas suma doble.
    if(seguidas.has(c.id) || (Array.isArray(c.subscribers) && c.subscribers.includes(uid))) campSubs++;
    if(c.responsables) {
      AREA_KEY_LIST.forEach(k => { if(getAreaUids(c.responsables, k).includes(uid)) campResp++; });
    }
    (c.tasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksCamp++; });
  });
  (_cache.globalTasks||[]).forEach(t => { if(t.assigneeUid===uid) tasksGlobal++; });
  return { campCreated, campSubs, campResp, tasksCamp, tasksGlobal };
}

function openDeleteUserModal(uid) {
  if(!isAdmin()) { showToast('Eliminar perfiles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil. Pídele a otro admin que lo haga.','error'); return; }
  const target = allUsers.find(u=>u.uid===uid);
  if(!target) { showToast('Usuario no encontrado','error'); return; }
  const refs = _countUserRefs(uid);
  const totalRefs = refs.campCreated+refs.campSubs+refs.campResp+refs.tasksCamp+refs.tasksGlobal;
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
  if(!isAdmin()) { showToast('Eliminar perfiles es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  if(uid === currentUser?.uid) { showToast('No puedes eliminar tu propio perfil. Pídele a otro admin que lo haga.','error'); return; }
  const btn = document.getElementById('deleteUserConfirmBtn');
  if(btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
  try {
    // 1) Reassign campaign-level fields
    const campaigns = getData('campaigns');
    campaigns.forEach(c => {
      if(c.createdBy === uid) c.createdBy = newUid || null;
      // Sólo se borra el rastro: las suscripciones no se heredan. Seguir una
      // campaña es una preferencia de quien la sigue, no un pendiente que
      // alguien tenga que recoger — a diferencia de estar asignado o ser
      // responsable, que sí dejan trabajo sin dueño.
      if(Array.isArray(c.subscribers)) {
        c.subscribers = c.subscribers.filter(x => x !== uid);
      }
      if(c.responsables) {
        AREA_KEY_LIST.forEach(k => {
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
    if(typeof renderCampaignGrid==='function') renderCampaignGrid();
    if(typeof renderDashboard==='function') renderDashboard();
  } catch(e) {
    avisarError(e, 'eliminar el perfil', 'confirmDeleteUser');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Eliminar perfil'; }
  }
}

async function changePuesto(uid, newPuesto) {
  if(!isAdmin()) { showToast('Cambiar puestos es cosa de admins. Pídeselo a alguien con ese rol.','error'); return; }
  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).update({puesto: newPuesto}),
      ws.collection('members').doc(uid).set({puesto: newPuesto}, {merge:true})
    ]);
    const u = allUsers.find(x=>x.uid===uid); if(u) u.puesto = newPuesto;
    showToast('Puesto actualizado','success');
    renderTeam();
  } catch(e) { avisarError(e, 'cambiar el puesto', 'changePuesto'); }
}

async function saveCampaign() {
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
  // Foto previa ANTES de mutar: campaigns[idx] se reemplaza por un objeto nuevo,
  // así que el viejo sigue intacto para comparar.
  const _prevCamp = editingCampaignId ? campaigns.find(x=>x.id===editingCampaignId) : null;
  const _prevResp = _prevCamp ? (_prevCamp.responsables || {}) : {};

  // Poner a alguien de responsable de un área también le abre la campaña
  // entera. Se pregunta antes de escribir: cancelar deja todo como estaba.
  const _respNuevos = Object.values(_diffResponsables(_prevResp, _readAreaSelections())).flat();
  if(_respNuevos.length && !(await confirmarAccesoCampana(_respNuevos, name, _prevCamp))) return;

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
        responsables: _readAreaSelections(),
        startDate:document.getElementById('fCampStartDate').value,
        endDate:document.getElementById('fCampEndDate').value,
        hasNano: !!document.getElementById('fCampHasNano')?.checked,
        trackerAonTab: document.getElementById('fCampAonTab')?.value?.trim()||'',
        trackerNanoTab: document.getElementById('fCampNanoTab')?.value?.trim()||'',
        goal: _goal,
        // Se escribe aunque venga vacío: el input siempre se llena al abrir el
        // modal, así que un vacío significa "quítame el link", no "no sé".
        // Con el guard anterior era imposible desligar una campaña de su sheet.
        escenarioSheetUrl: _escUrl,
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
      responsables: _readAreaSelections(),
      startDate:document.getElementById('fCampStartDate').value,
      endDate:document.getElementById('fCampEndDate').value,
      hasNano: !!document.getElementById('fCampHasNano')?.checked,
      trackerAonTab: document.getElementById('fCampAonTab')?.value?.trim()||'',
      trackerNanoTab: document.getElementById('fCampNanoTab')?.value?.trim()||'',
      goal: _goal,
      escenarioSheetUrl: _escUrl,
      createdBy: currentUser.uid,
      flowSteps:FLOW_STEPS.map(s=>({step:s,status:'Pendiente'})),
      influencers:[], documents:[], tasks:[]
    });
  }
  const _saved = campaigns.find(x => x.id === (editingCampaignId || _newCampId));
  // Quién ENTRA como responsable con este guardado. Se calcula contra la foto
  // previa para no reavisar a los mismos en cada Guardar.
  const _added = { responsables: _diffResponsables(_prevResp, _saved && _saved.responsables) };
  // Solo se toca la caché: la escritura la hace persistCampaignNow, que es una
  // sola y esperada. Con setData() salían DOS escrituras en paralelo del mismo
  // documento (persistCampaigns por su lado y persistCampaignNow por el otro).
  if(_saved) setDataLocal('campaigns',campaigns); else setData('campaigns',campaigns);
  closeModal('campaignModal');
  // Guardar es una acción explícita: se confirma contra el servidor antes de
  // decir "actualizada". Si el doc no llega, persistCampaignNow lo grita en
  // pantalla en vez de dejar al usuario creyendo que se guardó.
  const _ok = _saved ? await persistCampaignNow(_saved) : true;
  if(_ok) {
    showToast(editingCampaignId?'Campaña actualizada':'Campaña creada','success');
    try { showSuccessCheck(); } catch(e){}
    // Solo si el guardado se confirmó: avisar de algo que no llegó al servidor
    // manda a la gente a buscar una campaña que no existe.
    try { _notifyCampaignRoles(name, _saved && _saved.id, _added); } catch(e){ console.warn('notify roles', e); }
  }
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
    setTimeout(async () => {
      if(await confirmar({
        title: 'Esta campaña no tiene escenario todavía',
        body: 'No pegaste un link de Google Sheets. Puedes armar el escenario aquí mismo, creador por creador, y vincular un Sheet después si lo necesitas.',
        confirmLabel: 'Armar escenario ahora',
        cancelLabel: 'Más tarde',
      })) {
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
  document.getElementById('fTaskDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('fTaskClientDate').value='';
  checkTaskDeadlines();
  document.getElementById('fTaskPriority').value='medium';
  initDocLinks([]);
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
  initPeoplePicker('fTaskSupervisors', [], [currentUser.uid]);
  initPeoplePicker('fTaskWatchers', [], [currentUser.uid]);
  document.getElementById('fTaskTitle').value='';
  document.getElementById('fTaskDate').value=new Date().toISOString().split('T')[0];
  document.getElementById('fTaskClientDate').value='';
  checkTaskDeadlines();
  document.getElementById('fTaskPriority').value='medium';
  initDocLinks([]);
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
          <div style="font-size:14px;">${task.campaignName||'General'}</div>
        </div>
      </div>
      ${(() => {
        const links = taskDocLinks(task);
        if(!links.length) return '';
        return `<div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">Documento${links.length > 1 ? 's' : ''}</div>
          <div class="td-links">${links.map(l => `<a href="${_esc(l.url)}" target="_blank" rel="noopener noreferrer" class="td-link">
            <span class="td-link-ico">🔗</span>
            <span class="td-link-name">${_esc(docLinkLabel(l))}</span>
          </a>`).join('')}</div>
        </div>`;
      })()}
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

  // Foto de quién estaba etiquetado antes: solo se avisa a los que se suman.
  const prev = { assigneeUid:'', supervisors:[], watchers:[] };
  const apply = t => {
    prev.assigneeUid = t.assigneeUid || '';
    prev.supervisors = (t.supervisors || []).slice();
    prev.watchers = (t.watchers || []).slice();
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
    const cid = editingTaskCampaignId;
    if(cid) {
      const campaigns = getData('campaigns');
      const c = campaigns.find(x=>x.id===cid);
      if(c) {
        const t = c.tasks.find(x=>x.id===editingTaskId);
        if(t) apply(t);
        setData('campaigns', campaigns);
      }
    } else {
      const tasks = getData('globalTasks');
      const t = tasks.find(x=>x.id===editingTaskId);
      if(t) apply(t);
      setData('globalTasks', tasks);
    }
    _notifyTaskPeople({
      title, campaignId: campId, dueDate, clientDueDate,
      added: {
        assignee: assigneeUid && assigneeUid !== prev.assigneeUid ? assigneeUid : '',
        supervisors: supervisors.filter(uid => !prev.supervisors.includes(uid)),
        watchers: watchers.filter(uid => !prev.watchers.includes(uid)),
      },
    });
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
      if(c) { c.tasks.push(task); setData('campaigns',campaigns); }
    } else {
      const tasks=getData('globalTasks');
      tasks.push({...task,campaignName:'General',campaignId:''});
      setData('globalTasks',tasks);
    }
    _notifyTaskPeople({
      title, campaignId: campId, dueDate, clientDueDate,
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
  if(!currentCampaignId) { showToast('Elige una campaña arriba para continuar.','error'); return; }
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
  if(!url) { showToast('Pega la URL del Google Sheet. La copias de la barra del navegador con el Sheet abierto.','error'); return; }
  // Extract spreadsheet ID
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!match) { showToast('URL de Google Sheets inválida','error'); return; }
  const sheetId = match[1];
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  showToast('Sincronizando desde Sheets…');
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
  if(!targetCid) { showToast('Elige una campaña arriba para continuar.','error'); return; }

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
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICN_doc}</div><p>Selecciona una campaña para ver sus documentos.</p></div>`;
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
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${ICN_doc}</div><p>Sin documentos en esta campaña.</p></div>`;
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
  if(!puedeEditarCampana(c)) {
    showToast('Solo un admin, quien creó la campaña o un responsable de área pueden borrar documentos.','error'); return;
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
  THEME_SWATCHES.forEach(t => {
    const sw = document.getElementById('stTheme-'+t);
    if(sw) sw.classList.toggle('selected', t === currentTheme);
  });
  // El selector de color arranca con el color que ya tienes puesto, no con el
  // rosa de fábrica: si no, abrir Ajustes parecía ofrecerte cambiarlo.
  const _acc = currentUserProfile?.themeAccent;
  if(_acc) ['customAccentInput','customAccentInput2'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = _acc;
  });
  const currentMode = (typeof getThemePref==='function') ? getThemePref() : 'auto';
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+currentMode);
  });
  applySidebarMode(getSidebarMode());
  // Vista: densidad, tamaño de texto y las listas para acomodar dashboard y menú.
  if(typeof prefs === 'function') {
    const p = prefs();
    document.querySelectorAll('#densityPicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === (p.density||'comodo')));
    document.querySelectorAll('#textSizePicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === (p.textSize||'normal')));
    try { prefsRenderPanels(); } catch(e){}
  }
  renderTeam();
  if(typeof _renderEmailSettings === 'function') _renderEmailSettings();
}

function setModeBtn(mode) {
  applyThemePref(mode);
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.id === 'modeBtn-'+mode);
  });
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

async function resetAllData() {
  if(!await confirmar({
    title: '¿Borrar los datos guardados en este navegador?',
    body: 'Se van tus preferencias locales y las llaves de API que tengas guardadas. Las campañas y tareas del workspace NO se tocan: viven en el servidor.\n\nLa página se va a recargar.',
    confirmLabel: 'Borrar y recargar',
    danger: true,
  })) return;
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
  if(!await confirmar({
    title: `¿Eliminar la campaña "${c.name}"?`,
    body: 'Se va para todo el equipo, con sus tareas, documentos y creadores. No hay forma de recuperarla.',
    confirmLabel: 'Eliminar campaña',
    cancelLabel: 'Conservar',
    danger: true,
  })) return;
  const filtered = campaigns.filter(x=>x.id!==currentCampaignId);
  setData('campaigns', filtered);
  showCampaignList();
  showToast('Campaña eliminada','success');
}

async function nukeAllCampaigns() {
  if(!isAdmin()) { showToast('Borrar el workspace entero es cosa de admins.','error'); return; }
  // Antes eran dos confirms encadenados; el segundo no aportaba información
  // nueva y solo entrenaba a darle Aceptar sin leer. Uno solo, con el número
  // exacto de lo que se va, informa más que preguntar dos veces.
  const _nCamps = (getData('campaigns')||[]).length;
  const _nTasks = (getData('globalTasks')||[]).length;
  if(!await confirmar({
    title: `¿Borrar ${_nCamps} campañas y ${_nTasks} pendientes del workspace?`,
    body: 'Se van para TODO el equipo, no solo para ti, y no hay forma de recuperarlos.',
    confirmLabel: `Borrar las ${_nCamps} campañas`,
    cancelLabel: 'Cancelar',
    danger: true,
  })) return;
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
  // Un error interrumpe, un "guardado" espera su turno. Se decide ANTES de
  // escribir el texto: si se cambia aria-live con el mensaje ya adentro, los
  // lectores de pantalla se quedan con la cortesía anterior.
  t.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
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
  // Son <div role="link">, no <a>: el navegador no les da Enter gratis.
  item.addEventListener('keydown',e=>{
    if(e.key === 'Enter') { e.preventDefault(); navigate(item.dataset.page); }
  });
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

  // Una sola verdad para "sigo esta campaña" antes de pintar nada: si no, el
  // primer render usa la lista vieja y la credencial vuelve a mentir.
  try { await migrarSuscripciones(); } catch(e) { console.warn('migrar suscripciones', e); }

  // Los contactos que ya vivían dentro de las campañas entran a la base de
  // clientes. No bloquea el arranque: si tarda, la pestaña se llena sola en
  // cuanto el listener reciba lo escrito.
  try { if(typeof rellenarClientesDesdeCampanas === 'function') rellenarClientesDesdeCampanas(); }
  catch(e) { console.warn('rellenar clientes', e); }

  // Realtime listeners
  attachListeners();

  // Update UI with user info
  const displayName = currentUserProfile.name || user.email.split('@')[0];
  const shortPron = (typeof _shortPronouns==='function') ? _shortPronouns(currentUserProfile.pronouns) : '';
  const sidebarNameEl = document.getElementById('userNameSidebar');
  sidebarNameEl.textContent = displayName + (shortPron ? ' ' + shortPron : '');
  updateSidebarAvatar();
  loadTheme(currentUserProfile);
  // Las preferencias de vista del servidor mandan sobre lo que había guardado
  // en este navegador: cambiar de compu no debe resetear tu acomodo.
  if(typeof prefsHydrateFromProfile === 'function') prefsHydrateFromProfile(currentUserProfile);
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
    // Si llegaste por un link con ruta (#/campannas/abc), esa manda sobre lo
    // último que viste: alguien te mandó el link justamente para llevarte ahí.
    const _porRuta = aplicarRuta();
    const _ctab = localStorage.getItem('cmos:lastCampaignTab');
    if(_porRuta) {
      if(currentCampaignId && _ctab) {
        setTimeout(() => { try { _switchCampaignTab(_ctab); } catch(e){} }, 50);
      }
    } else {
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
    }
  } catch(e){ console.warn('restore last view failed', e); }
  // La primera vista no debe dejar una entrada de historial anterior a ella:
  // con pushState, el primer Atrás no haría nada visible.
  try { escribirRuta(true); } catch(e){}

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
/* Seguir una campaña es una PREFERENCIA, no un permiso. Antes esta función
   devolvía true para cualquier admin, mezclando las dos cosas: como los admins
   ven todo, se daba por hecho que también seguían todo. El efecto era que un
   admin no podía dejar de seguir nada — el botón ni se dibujaba — y su
   credencial arrastraba para siempre lo que hubiera elegido en el onboarding.
   Quién PUEDE VER una campaña lo sigue decidiendo canSeeCampaign(), que abajo
   corta por isAdmin() antes de llegar acá. */
function isSubscribed(cid) {
  return (currentUserProfile?.subscribedCampaigns || []).includes(cid);
}
function canSeeCampaign(c) {
  if(!c) return false;
  if(isAdmin()) return true;
  if(c.createdBy === currentUser.uid) return true;
  // Ser responsable de un área es el vínculo MÁS fuerte que hay con una
  // campaña, y era el único que no daba acceso: se podía ser responsable de
  // Creativo en una campaña y no verla en la lista, ni abrirla desde el aviso
  // que anunciaba justamente que te habían puesto ahí.
  if(esResponsableDe(c, currentUser.uid)) return true;
  if(isSubscribed(c.id)) return true;
  return false;
}
/* Seguir / dejar de seguir. Es el ÚNICO camino: la campanita del detalle
   también entra por aquí.

   Antes había dos sistemas que no se hablaban. Este escribía
   `users/{uid}.subscribedCampaigns`; la campanita escribía
   `campaign.subscribers`. Ninguno limpiaba al otro, así que seguir por un lado
   y dejar de seguir por el otro dejaba la campaña colgada — y como la
   credencial sumaba los dos con un OR, ahí se quedaba a la vista.

   Se escribe en `users` (que es la copia autoritativa: las reglas sólo dejan
   escribirla a su dueño) y se refleja en `members`, que es de donde sale
   `allUsers` y por lo tanto lo que ven el Equipo y las credenciales de los
   demás. Mismo patrón que ya usan área, rol y puesto.

   De paso se borra el rastro en `campaign.subscribers`: mientras queden datos
   viejos ahí, hay dos verdades. */
async function toggleSubscribeCampaign(cid, e) {
  if(e && e.stopPropagation) e.stopPropagation();
  if(!currentUser || !currentUserProfile) return;
  const subs = currentUserProfile.subscribedCampaigns || [];
  const yaSeguia = subs.includes(cid);
  const newSubs = yaSeguia ? subs.filter(x=>x!==cid) : [...subs, cid];
  currentUserProfile.subscribedCampaigns = newSubs;

  // Que la lista en memoria del equipo también lo sepa, sin esperar al listener.
  const yo = allUsers.find(u => u.uid === currentUser.uid);
  if(yo) yo.subscribedCampaigns = newSubs;

  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(currentUser.uid).set({subscribedCampaigns: newSubs}, {merge:true}),
      ws.collection('members').doc(currentUser.uid).set({subscribedCampaigns: newSubs}, {merge:true}),
    ]);
    await _limpiarSubscriberViejo(cid);
  } catch(err) {
    // Se revierte lo local: dejar la pantalla diciendo que sigues algo que el
    // servidor no registró es peor que no haber hecho nada.
    currentUserProfile.subscribedCampaigns = subs;
    if(yo) yo.subscribedCampaigns = subs;
    if(typeof avisarError === 'function') avisarError(err, 'cambiar la suscripción', 'toggleSubscribeCampaign');
    else showToast('No se pudo cambiar la suscripción', 'error');
    renderCampaignGrid();
    return;
  }

  renderCampaignGrid();
  if(currentPage==='dashboard') renderDashboard();
  if(currentCampaignId === cid && typeof openCampaignDetail === 'function') openCampaignDetail(cid);
  try { if(typeof refreshHoloCamps === 'function') refreshHoloCamps(); } catch(err){}
  showToast(yaSeguia ? 'Dejaste de seguir esta campaña' : 'Ahora sigues esta campaña', 'success');
}

/* Migración de una sola vez, por persona.
   Hasta ahora seguir una campaña se guardaba en `campaign.subscribers`, y esa
   lista es la única que alimentaba la tira de la credencial: `members` —de
   donde sale allUsers— nunca llegó a tener `subscribedCampaigns`, así que la
   otra rama estaba muerta.

   Al entrar se hace lo mínimo para dejar una sola verdad:
     · lo que la campaña dice que sigo se suma a mi perfil,
     · mi perfil se refleja en `members`, que es lo que ven los demás,
     · y mi rastro se borra de las campañas.

   Es idempotente y silenciosa: si no hay nada que mover, no escribe nada.
   Cada quien migra lo suyo, que es además lo único que las reglas le dejan
   escribir de `users`. */
async function migrarSuscripciones() {
  if(!currentUser || !currentUserProfile) return;
  const uid = currentUser.uid;
  const actuales = Array.isArray(currentUserProfile.subscribedCampaigns)
    ? currentUserProfile.subscribedCampaigns : [];

  const campaigns = getData('campaigns') || [];
  // Dos herencias: la lista vieja de suscriptores dentro de la campaña, y
  // Participantes, que se retira. A quien era participante se le convierte en
  // seguidor para que NO pierda el acceso a una campaña en curso; sigue siendo
  // suyo dejar de seguirla cuando quiera.
  const heredadas = campaigns
    .filter(c => (Array.isArray(c.subscribers) && c.subscribers.includes(uid)) ||
                 (Array.isArray(c.assignedTo)  && c.assignedTo.includes(uid)))
    .map(c => c.id);

  const yo = (allUsers || []).find(u => u.uid === uid);
  const faltaEspejo = !yo || !Array.isArray(yo.subscribedCampaigns);

  if(!heredadas.length && !faltaEspejo) return;

  const unidas = [...new Set([...actuales, ...heredadas])];
  currentUserProfile.subscribedCampaigns = unidas;
  if(yo) yo.subscribedCampaigns = unidas;

  try {
    const ws = db.collection('workspaces').doc(WORKSPACE);
    await Promise.all([
      db.collection('users').doc(uid).set({subscribedCampaigns: unidas}, {merge:true}),
      ws.collection('members').doc(uid).set({subscribedCampaigns: unidas}, {merge:true}),
    ]);
    // Sólo ahora se borra el rastro: si lo de arriba falla, la lista vieja
    // sigue siendo la única copia y no hay que perderla.
    for(const cid of heredadas) {
      try { await _limpiarSubscriberViejo(cid); } catch(e) { console.warn('migrar suscripción', cid, e); }
    }
  } catch(e) {
    currentUserProfile.subscribedCampaigns = actuales;
    if(yo) yo.subscribedCampaigns = actuales;
    console.warn('migrarSuscripciones', e);
  }
}

/* El sistema viejo guardaba la suscripción dentro de la campaña. Se saca de ahí
   en cuanto se toca la campaña, para que no queden dos listas discrepando.
   Silencioso a propósito: es limpieza, no una acción que la persona pidió. */
async function _limpiarSubscriberViejo(cid) {
  const campaigns = getData('campaigns');
  const c = campaigns.find(x => x.id === cid);
  if(!c || !Array.isArray(c.subscribers) || !c.subscribers.includes(currentUser.uid)) return;
  c.subscribers = c.subscribers.filter(x => x !== currentUser.uid);
  setDataLocal('campaigns', campaigns);
  try {
    await db.collection('workspaces').doc(WORKSPACE).collection('campaigns').doc(String(cid))
      .set({ subscribers: c.subscribers }, { merge:true });
  } catch(err) { console.warn('limpiar subscribers', err); }
}

