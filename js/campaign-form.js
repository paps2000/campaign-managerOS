/* Campaign OS — Formulario de campaña
   =====================
   Alta y edición: responsables por área, presupuesto, logo de la marca y el
   aviso de acceso antes de meter a alguien —etiquetar a una persona le abre la
   campaña entera, presupuesto y contactos incluidos, y eso no se ve al marcar
   una casilla.

   `saveCampaign()` venía después del bloque de Equipo en el archivo viejo y
   aquí quedó junto al formulario que guarda. Son declaraciones: nadie las llama
   mientras se carga la página, así que el cambio de sitio no altera nada.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

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
    return `<span class="area-chip"><span>${_esc(name)}</span><button class="chip-x" onclick="removeFromArea('${areaKey}','${_esc(uid)}');event.stopPropagation();" type="button">×</button></span>`;
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
  return `<span class="badge badge-area-${_esc(area)}" style="font-size:10px;">${_esc(area)}</span>`;
}

function userChip(uid, fallbackName) {
  const u = allUsers.find(x => x.uid === uid);
  if(!u && !fallbackName) return '';
  const name = u ? (u.name || u.email.split('@')[0]) : fallbackName;
  const initial = name[0]?.toUpperCase() || '?';
  const area = u?.area || '';
  const clickAttr = u ? `class="user-name-link" onclick="event.stopPropagation();openProfileModal('${u.uid}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--white);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 4px;"` : `style="display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--white);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 4px;"`;
  return `<span ${clickAttr}>
    <span style="width:20px;height:20px;border-radius:50%;background:var(--pink-deep);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${_esc(initial)}</span>
    ${_esc(name)}${area?` <span class="badge badge-area-${_esc(area)}" style="font-size:9px;padding:1px 5px;">${_esc(area)}</span>`:''}
  </span>`;
}

function toggleNanoSection() {
  const checked = document.getElementById('fCampHasNano')?.checked;
  const section = document.getElementById('fCampNanoSection');
  if(section) section.style.display = checked ? '' : 'none';
}

/* ============================================================
   LOGO DE LA MARCA
   ============================================================
   El logo del cliente vive DENTRO del documento de la campaña, como data URL.
   No hay Storage montado en el proyecto, y meterlo habría significado reglas
   nuevas que alguien tiene que publicar a mano antes de que el logo se vea; el
   documento ya se escribe y se lee por los caminos que existen.

   El precio es el límite de 1MB por documento de Firestore, así que la imagen
   no se guarda como llega: se re-encoda SIEMPRE a 256 px de lado mayor. Un PNG
   de marca a ese tamaño ronda las decenas de KB, que es ruido frente al resto
   del documento; el archivo original que arrastra la gente suele pesar cientos
   de veces más. */
const CAMP_LOGO_MAX_PX = 256;
const CAMP_LOGO_MAX_BYTES = 220 * 1024;
let _editCampLogo = '';

function _campLogoScale(im, lado) {
  const ar = im.naturalWidth / Math.max(1, im.naturalHeight);
  const cv = document.createElement('canvas');
  cv.width  = Math.max(1, ar >= 1 ? lado : Math.round(lado * ar));
  cv.height = Math.max(1, ar >= 1 ? Math.round(lado / ar) : lado);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, cv.width, cv.height);
  // PNG y no JPEG: los logos vienen con fondo transparente y un JPEG lo
  // rellenaría de negro, que es justo lo que se ve mal recortado sobre la
  // credencial.
  return cv.toDataURL('image/png');
}

function _campLogoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = ev => {
      const im = new Image();
      im.onerror = () => reject(new Error('Ese archivo no es una imagen que el navegador pueda abrir.'));
      im.onload = () => {
        // Un SVG sin tamaño intrínseco carga con 0×0: dibujarlo daría un lienzo
        // en blanco y el logo se guardaría vacío sin avisar.
        if (!im.naturalWidth || !im.naturalHeight) {
          return reject(new Error('La imagen no trae tamaño. Exporta el logo como PNG y reintenta.'));
        }
        let lado = CAMP_LOGO_MAX_PX, out = '';
        for (let i = 0; i < 3; i++) {
          out = _campLogoScale(im, lado);
          if (out.length <= CAMP_LOGO_MAX_BYTES) break;
          lado = Math.round(lado * 0.7);
        }
        if (out.length > CAMP_LOGO_MAX_BYTES) {
          return reject(new Error('El logo sigue pesando demasiado aun reducido. Prueba con un PNG más simple.'));
        }
        resolve(out);
      };
      im.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function onCampLogoPick(input) {
  const f = input.files && input.files[0];
  // Se limpia el input SIEMPRE: sin esto, elegir el mismo archivo dos veces
  // seguidas no dispara change y parece que la subida se ignoró.
  input.value = '';
  if (!f) return;
  if (!/^image\//.test(f.type)) { showToast('Elige una imagen. Un PNG con fondo transparente es lo que mejor se ve.', 'error'); return; }
  try {
    _setCampLogo(await _campLogoDataUrl(f));
    showToast('Logo listo. Guarda la campaña para que lo vea el equipo.');
  } catch (e) { showToast(e.message || 'No se pudo procesar el logo.', 'error'); }
}

function clearCampLogo() { _setCampLogo(''); }

function _setCampLogo(url) {
  _editCampLogo = url || '';
  const prev = document.getElementById('fCampLogoPreview');
  if (prev) prev.innerHTML = _editCampLogo
    ? `<img src="${_editCampLogo}" alt="Logo de la campaña">`
    : '<span>Sin logo</span>';
  const lbl = document.getElementById('fCampLogoLabel');
  if (lbl) lbl.textContent = _editCampLogo ? '✓ Cambiar logo' : '＋ Subir logo';
  const clr = document.getElementById('fCampLogoClear');
  if (clr) clr.style.display = _editCampLogo ? 'inline-flex' : 'none';
}

function openNewCampaignModal() {
  editingCampaignId = null;
  document.getElementById('campaignModalTitle').textContent='Nueva campaña';
  ['fCampName','fCampClient','fCampSeason','fCampObjective','fCampCore','fCampBudgetClient','fCampMargin','fCampStartDate','fCampEndDate','fCampGoalContenidos','fCampGoalViews','fCampGoalEngagement','fCampGoalReach','fCampEscenarioUrl'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('fCampBudgetOpsResult').textContent='—';
  document.getElementById('fCampStatus').value='En proceso';
  const nanoChk = document.getElementById('fCampHasNano');
  if(nanoChk) { nanoChk.checked = false; toggleNanoSection(); }
  _setCampLogo('');
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
  // Mismo criterio que el resto del detalle (contactos, documentos):
  // puedeEditarCampana incluye a los responsables de área. Con el chequeo
  // viejo, quien llevaba Cuentas veía el botón Editar y al pulsarlo recibía
  // un "no puedes" — el permiso decía una cosa y la interfaz otra.
  if(!puedeEditarCampana(c)) {
    showToast('Solo un admin, quien creó la campaña o un responsable de área pueden editarla.','error'); return;
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
  _setCampLogo(c.logo || '');
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
/* Confirmación de que el aviso salió. Etiquetar a alguien y no ver nada en
   pantalla deja la duda de si se enteró; con esto se lee "Avisamos a Fulano" en
   el mismo momento del guardado. Incluye avisarte a ti: eres el caso donde el
   silencio confundía más. */
function _avisarQuienFueNotificado(added) {
  const uids = [...new Set(Object.values((added && added.responsables) || {}).flat().filter(Boolean))];
  if(!uids.length) return;
  const nombre = uid => {
    if(uid === currentUser?.uid) return 'ti';
    const u = (allUsers || []).find(x => x.uid === uid);
    return u ? (u.name || (u.email||'').split('@')[0]) : 'alguien';
  };
  const lista = uids.map(nombre);
  const texto = lista.length === 1 ? lista[0]
    : lista.length === 2 ? `${lista[0]} y ${lista[1]}`
    : `${lista[0]} y ${lista.length - 1} más`;
  setTimeout(() => showToast(`Avisamos a ${texto} 🔔`), 1200);
}

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
        // Vacío significa "quítalo", igual que el link del escenario: si solo
        // se escribiera cuando hay logo, no habría forma de borrar uno.
        logo: _editCampLogo || '',
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
      logo: _editCampLogo || '',
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
    try {
      _notifyCampaignRoles(name, _saved && _saved.id, _added);
      _avisarQuienFueNotificado(_added);
    } catch(e){ console.warn('notify roles', e); }
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
