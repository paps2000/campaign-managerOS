/* Campaign OS — Utilidades compartidas
   ======================
   Las funciones que usa todo el mundo: escapado de HTML, saneado de URLs,
   formato de fechas y números, el toast y los pronombres.

   Se carga JUSTO DESPUÉS de core.js, antes que cualquier vista. Antes vivían
   al final de ui.js —el noveno archivo— y todo lo que cargaba antes dependía de
   ellas: funcionaba porque nadie las llama al evaluarse, pero leído desde fuera
   parecía que la dependencia iba al revés. Aquí dentro no hay una sola línea
   que corra al cargar, sólo declaraciones, así que adelantarlas no cambia nada
   en pantalla.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

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
  if(!/^https?:\/\//i.test(s)) return '#';
  // Comillas y ángulos fuera. Una URL válida no los lleva literales, y varios
  // sitios meten el resultado dentro de una cadena de JavaScript que a su vez
  // vive en un atributo HTML: `onclick="window.open('<url>')"`. Ahí escapar a
  // entidades HTML no basta —el parser las decodifica ANTES de que el motor de
  // JS lea la cadena—, así que un `'` en el link cierra la cadena y lo que
  // sigue se ejecuta. Percent-encodarlos no cambia a dónde apunta el link.
  return s.replace(/['"<>`]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
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
