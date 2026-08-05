/* Campaign OS — Botón flotante de acciones rápidas
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

// ── QUICK-ADD FAB ──
let _fabOpen = false;
function toggleFab() {
  _fabOpen = !_fabOpen;
  document.getElementById('fabMainBtn')?.classList.toggle('open', _fabOpen);
  document.getElementById('fabActions')?.classList.toggle('open', _fabOpen);
}
function closeFab() {
  _fabOpen = false;
  document.getElementById('fabMainBtn')?.classList.remove('open');
  document.getElementById('fabActions')?.classList.remove('open');
}
document.addEventListener('click', e => { if(_fabOpen && !e.target.closest('.fab-wrap')) closeFab(); });
// Show FAB once user is logged in (login overlay hidden) — mirrors v2 observer
(function(){
  const apply = () => {
    const ls = document.getElementById('loginScreen');
    const w = document.getElementById('fabWrap');
    if(!ls || !w) return;
    if(ls.classList.contains('hidden')) w.style.display = 'flex';
    else { w.style.display = 'none'; closeFab(); }
  };
  const start = () => {
    const ls = document.getElementById('loginScreen');
    if(!ls) return;
    apply();
    new MutationObserver(apply).observe(ls, { attributes:true, attributeFilter:['class'] });
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// ── G+key navigation shortcuts (Liquid Glass v2) ──
(function() {
  let gPressed = false, gTimer = null;
  const SHORTCUTS = {
    d:'dashboard', c:'campannas', m:'metricas', i:'influencers',
    f:'documentos', l:'calendario', g:'generador', e:'equipo',
    s:'ajustes', p:'pendientes'
  };
  document.addEventListener('keydown', function(e) {
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if(e.target.isContentEditable) return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.key === 'g' || e.key === 'G') {
      gPressed = true;
      clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPressed = false; }, 1500);
      return;
    }
    if(gPressed) {
      const page = SHORTCUTS[e.key.toLowerCase()];
      if(page && typeof navigate === 'function') {
        e.preventDefault();
        navigate(page);
        gPressed = false;
        clearTimeout(gTimer);
        try { showToast('Navegando a ' + page.charAt(0).toUpperCase()+page.slice(1) + ' ↗'); } catch(_){}
      }
    }
  });
})();

