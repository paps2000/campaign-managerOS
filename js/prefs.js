/* Campaign OS — Preferencias de vista, por persona
   ============================================================
   Cada quien acomoda su app: qué tan apretado se ve, qué tan grande está el
   texto, de qué color es el acento, en qué orden salen las tarjetas del
   dashboard y qué items del menú quiere ver.

   Todo es OPCIONAL: sin preferencias guardadas la app se ve exactamente igual
   que antes. Los valores por defecto no aplican ningún atributo ni orden, así
   que quien nunca entre a Ajustes no nota nada.

   Dónde vive: localStorage para que aplique de inmediato al cargar (antes de
   que Firestore conteste) y `users/{uid}.uiPrefs` para que te siga cuando
   abres la app en otra compu. El tema de color no vive aquí: ya vivía en el
   perfil (users + members) junto con el resto de la identidad, y ahí se queda
   — ver applyTheme() en campaigns.js.
   ============================================================ */

const PREFS_KEY = 'cmos:prefs';

// Los widgets del dashboard. `col` dice en qué columna vive cada uno: se
// reordenan dentro de su columna, no entre columnas, porque la derecha es una
// barra angosta y pegajosa y meter ahí la tabla de campañas no se ve.
const DASH_WIDGETS = [
  { id:'stats',     col:'top',  label:'Números de arriba',        fixed:true },
  { id:'hoy',       col:'main', label:'Qué tengo que hacer hoy' },
  { id:'alertas',   col:'main', label:'Alertas importantes' },
  { id:'campanas',  col:'main', label:'Status de campañas' },
  { id:'pubs',      col:'main', label:'Próximas publicaciones' },
  { id:'docs',      col:'main', label:'Documentos recientes' },
  { id:'generador', col:'main', label:'Generador de textos' },
  { id:'gcal',      col:'side', label:'Google Calendar' },
  { id:'gmail',     col:'side', label:'Gmail' },
];

const DENSIDADES = ['compacto','comodo','amplio'];
const TAMANOS    = ['chico','normal','grande'];

const PREFS_DEFAULTS = {
  density:    'comodo',
  textSize:   'normal',
  dashOrder:  [],   // ids de la columna principal
  sideOrder:  [],   // ids de la columna derecha
  dashHidden: [],
  navOrder:   [],   // data-page en el orden que los quiere ver
  navHidden:  [],
};

let _prefs = Object.assign({}, PREFS_DEFAULTS);

function prefs() { return _prefs; }

function _prefsLoadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    Object.keys(PREFS_DEFAULTS).forEach(k => { if(k in saved) _prefs[k] = saved[k]; });
  } catch(e){}
}

function _prefsSaveLocal() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); } catch(e){}
}

// Se escribe en el doc del usuario, no en members: a nadie más le sirve saber
// cómo tienes acomodado tu dashboard, y members lo lee todo el workspace.
function _prefsSaveRemote() {
  try {
    if(typeof db === 'undefined' || !db || typeof currentUser === 'undefined' || !currentUser) return;
    db.collection('users').doc(currentUser.uid).set({ uiPrefs: _prefs }, { merge:true });
    if(typeof currentUserProfile !== 'undefined' && currentUserProfile) currentUserProfile.uiPrefs = _prefs;
  } catch(e) { console.warn('no se pudieron guardar las preferencias:', e.message); }
}

function prefsSet(patch) {
  Object.assign(_prefs, patch);
  _prefsSaveLocal();
  _prefsSaveRemote();
  prefsApply();
}

// Al entrar: lo que diga el servidor manda sobre lo que había en este
// navegador. Si no, cambiar de compu significaría empezar de cero cada vez.
function prefsHydrateFromProfile(profile) {
  const remote = profile && profile.uiPrefs;
  if(remote && typeof remote === 'object') {
    Object.keys(PREFS_DEFAULTS).forEach(k => { if(k in remote) _prefs[k] = remote[k]; });
    _prefsSaveLocal();
  }
  prefsApply();
}

// ============================================================
// APLICAR
// ============================================================

// El atributo solo se pone cuando la preferencia NO es la de fábrica: así las
// reglas de densidad/tamaño ni siquiera entran en juego para quien no eligió
// nada, y no hay riesgo de mover un pixel que nadie pidió mover.
function _applyDensity() {
  const d = DENSIDADES.includes(_prefs.density) ? _prefs.density : 'comodo';
  const html = document.documentElement;
  if(d === 'comodo') html.removeAttribute('data-density');
  else html.setAttribute('data-density', d);
}

function _applyTextSize() {
  const t = TAMANOS.includes(_prefs.textSize) ? _prefs.textSize : 'normal';
  const html = document.documentElement;
  if(t === 'normal') html.removeAttribute('data-text');
  else html.setAttribute('data-text', t);
}

// Mantiene el orden guardado pero sobrevive a que se agregue o se quite un
// widget/página: lo conocido conserva su lugar, lo nuevo entra donde vivía por
// defecto en vez de irse siempre hasta abajo.
function _mergeOrder(saved, defaults) {
  const known = new Set(defaults);
  const out = (Array.isArray(saved) ? saved : []).filter(x => known.has(x));
  defaults.forEach((id, i) => {
    if(out.includes(id)) return;
    out.splice(Math.min(i, out.length), 0, id);
  });
  return out;
}

function prefsDashOrder(col) {
  const defs = DASH_WIDGETS.filter(w => w.col === col).map(w => w.id);
  return _mergeOrder(col === 'side' ? _prefs.sideOrder : _prefs.dashOrder, defs);
}

function _applyDashboard() {
  const hidden = new Set(_prefs.dashHidden || []);
  ['main','side'].forEach(col => {
    prefsDashOrder(col).forEach((id, i) => {
      const el = document.querySelector(`[data-widget="${id}"]`);
      if(el) el.style.order = i;
    });
  });
  DASH_WIDGETS.forEach(w => {
    const el = document.querySelector(`[data-widget="${w.id}"]`);
    if(el) el.style.display = hidden.has(w.id) ? 'none' : '';
  });
  // Si escondiste las dos cosas de Google, la columna derecha deja de existir
  // en vez de quedarse como una franja vacía de 360px.
  const split = document.querySelector('.dashboard-split');
  if(split) {
    const sideOff = DASH_WIDGETS.filter(w => w.col === 'side').every(w => hidden.has(w.id));
    split.classList.toggle('no-side', sideOff);
  }
}

function prefsNavItems() {
  return [...document.querySelectorAll('#navSection .nav-item[data-page]')].map(el => ({
    id: el.dataset.page,
    label: (el.querySelector('.nav-text')?.textContent || el.textContent || el.dataset.page).trim(),
  }));
}

function prefsNavOrder() {
  const defs = prefsNavItems().map(i => i.id);
  return _mergeOrder(_prefs.navOrder, defs);
}

function _applyNav() {
  const sec = document.getElementById('navSection');
  if(!sec) return;
  const hidden = new Set(_prefs.navHidden || []);
  const tocado = (_prefs.navOrder || []).length > 0 || hidden.size > 0;
  // Con orden propio, "Trabajo" y "Recursos" dejan de querer decir algo: los
  // items ya no están agrupados como el rótulo promete. Se vuelve una lista
  // plana y sin rótulos, que es lo que la persona pidió al reordenar.
  sec.classList.toggle('nav-custom', tocado);
  prefsNavOrder().forEach((page, i) => {
    const el = sec.querySelector(`.nav-item[data-page="${page}"]`);
    if(!el) return;
    el.style.order = i;
    el.style.display = hidden.has(page) ? 'none' : '';
  });
}

function prefsApply() {
  _applyDensity();
  _applyTextSize();
  try { _applyDashboard(); } catch(e){}
  try { _applyNav(); } catch(e){}
  try { prefsRenderPanels(); } catch(e){}
}

// ============================================================
// CONTROLES (Ajustes → Vista)
// ============================================================
function setDensity(v) {
  if(!DENSIDADES.includes(v)) return;
  prefsSet({ density: v });
  document.querySelectorAll('#densityPicker .seg-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.val === v));
}

function setTextSize(v) {
  if(!TAMANOS.includes(v)) return;
  prefsSet({ textSize: v });
  document.querySelectorAll('#textSizePicker .seg-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.val === v));
}

function _prefsHiddenSet() { return new Set(_prefs.dashHidden || []); }

function prefsToggleWidget(id) {
  const h = _prefsHiddenSet();
  h.has(id) ? h.delete(id) : h.add(id);
  prefsSet({ dashHidden: [...h] });
}

function prefsToggleNav(page) {
  const h = new Set(_prefs.navHidden || []);
  h.has(page) ? h.delete(page) : h.add(page);
  // Nunca dejar el menú vacío: si escondes todo no hay forma de volver a
  // Ajustes más que por la URL.
  if(h.size >= prefsNavItems().length) { showToast('Deja al menos una sección visible','error'); return; }
  prefsSet({ navHidden: [...h] });
}

function _moveIn(list, id, dir) {
  const i = list.indexOf(id);
  const j = i + dir;
  if(i < 0 || j < 0 || j >= list.length) return list;
  const copy = list.slice();
  copy.splice(j, 0, copy.splice(i, 1)[0]);
  return copy;
}

function prefsMove(kind, id, dir) {
  if(kind === 'nav')       prefsSet({ navOrder:  _moveIn(prefsNavOrder(), id, dir) });
  else if(kind === 'side') prefsSet({ sideOrder: _moveIn(prefsDashOrder('side'), id, dir) });
  else                     prefsSet({ dashOrder: _moveIn(prefsDashOrder('main'), id, dir) });
}

function prefsResetVista() {
  prefsSet({
    density:'comodo', textSize:'normal',
    dashOrder:[], sideOrder:[], dashHidden:[], navOrder:[], navHidden:[],
  });
  document.querySelectorAll('#densityPicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === 'comodo'));
  document.querySelectorAll('#textSizePicker .seg-btn').forEach(b => b.classList.toggle('on', b.dataset.val === 'normal'));
  if(typeof showToast === 'function') showToast('Vista como venía de fábrica','success');
}

// ============================================================
// LISTAS ORDENABLES
// ============================================================
// Arrastrar es lo natural con el mouse, pero las flechas tienen que estar:
// con el trackpad a medio arrastre se pierde el elemento, y con teclado el
// drag nativo no existe.
// Cada botón de icono lleva el nombre del widget en su aria-label: en una
// lista de nueve renglones, "Subir" repetido nueve veces no dice cuál sube.
// El ojo es un interruptor, no una acción: aria-pressed dice si está visible.
function _prefsRow(kind, item, i, total, hidden) {
  const esc = (typeof _esc === 'function') ? _esc : (s => String(s));
  return `<div class="pref-row" draggable="true" data-kind="${kind}" data-id="${esc(item.id)}">
    <span class="pref-grip" aria-hidden="true">⠿</span>
    <span class="pref-row-name${hidden ? ' off' : ''}">${esc(item.label)}</span>
    <div class="pref-row-actions">
      <button type="button" class="pref-mini" ${i===0?'disabled':''} onclick="prefsMove('${kind}','${esc(item.id)}',-1)" title="Subir" aria-label="Subir ${esc(item.label)}">↑</button>
      <button type="button" class="pref-mini" ${i===total-1?'disabled':''} onclick="prefsMove('${kind}','${esc(item.id)}',1)" title="Bajar" aria-label="Bajar ${esc(item.label)}">↓</button>
      <button type="button" class="pref-eye${hidden?' off':''}" onclick="${kind==='nav'?`prefsToggleNav('${esc(item.id)}')`:`prefsToggleWidget('${esc(item.id)}')`}" title="${hidden?'Mostrar':'Ocultar'}" aria-label="Mostrar ${esc(item.label)}" aria-pressed="${hidden?'false':'true'}">${hidden?'🚫':'👁'}</button>
    </div>
  </div>`;
}

function prefsRenderPanels() {
  const hidden = _prefsHiddenSet();
  const label = id => (DASH_WIDGETS.find(w => w.id === id) || {}).label || id;

  const main = document.getElementById('prefsDashMain');
  if(main) {
    const ids = prefsDashOrder('main');
    main.innerHTML = ids.map((id,i) => _prefsRow('dash', {id, label:label(id)}, i, ids.length, hidden.has(id))).join('');
  }
  const side = document.getElementById('prefsDashSide');
  if(side) {
    const ids = prefsDashOrder('side');
    side.innerHTML = ids.map((id,i) => _prefsRow('side', {id, label:label(id)}, i, ids.length, hidden.has(id))).join('');
  }
  // Los números de arriba no se reordenan (van pegados al techo), pero sí se
  // pueden apagar.
  const top = document.getElementById('prefsDashTop');
  if(top) {
    const esc = (typeof _esc === 'function') ? _esc : (s => String(s));
    top.innerHTML = DASH_WIDGETS.filter(w => w.col === 'top').map(w => {
      const off = hidden.has(w.id);
      return `<div class="pref-row static">
        <span class="pref-row-name${off?' off':''}">${esc(w.label)}</span>
        <div class="pref-row-actions">
          <button type="button" class="pref-eye${off?' off':''}" onclick="prefsToggleWidget('${w.id}')" title="${off?'Mostrar':'Ocultar'}" aria-label="Mostrar ${esc(w.label)}" aria-pressed="${off?'false':'true'}">${off?'🚫':'👁'}</button>
        </div>
      </div>`;
    }).join('');
  }

  const nav = document.getElementById('prefsNavList');
  if(nav) {
    const items = prefsNavItems();
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    const order = prefsNavOrder().filter(id => byId[id]);
    const nh = new Set(_prefs.navHidden || []);
    nav.innerHTML = order.map((id,i) => _prefsRow('nav', byId[id], i, order.length, nh.has(id))).join('');
  }
}

// --- Arrastrar y soltar ---
let _dragRow = null;
document.addEventListener('dragstart', e => {
  const row = e.target.closest && e.target.closest('.pref-row[draggable]');
  if(!row) return;
  _dragRow = row;
  row.classList.add('dragging');
  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.id); } catch(err){}
});
document.addEventListener('dragend', () => {
  if(_dragRow) _dragRow.classList.remove('dragging');
  _dragRow = null;
});
document.addEventListener('dragover', e => {
  if(!_dragRow) return;
  const over = e.target.closest && e.target.closest('.pref-row[draggable]');
  if(!over || over === _dragRow) return;
  if(over.dataset.kind !== _dragRow.dataset.kind) return; // no se cruzan columnas
  e.preventDefault();
  const r = over.getBoundingClientRect();
  const antes = (e.clientY - r.top) < r.height / 2;
  over.parentNode.insertBefore(_dragRow, antes ? over : over.nextSibling);
});
document.addEventListener('drop', e => {
  if(!_dragRow) return;
  e.preventDefault();
  const kind = _dragRow.dataset.kind;
  const ids = [..._dragRow.parentNode.querySelectorAll('.pref-row[draggable]')].map(r => r.dataset.id);
  if(kind === 'nav')       prefsSet({ navOrder: ids });
  else if(kind === 'side') prefsSet({ sideOrder: ids });
  else                     prefsSet({ dashOrder: ids });
});

// ============================================================
// ARRANQUE
// ============================================================
_prefsLoadLocal();
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefsApply);
else prefsApply();
