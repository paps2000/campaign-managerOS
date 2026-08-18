/* Campaign OS — Animaciones de entrada / stagger (respeta prefers-reduced-motion)
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

(function(){
  const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Stagger replay (used by navigate) ---- */
  window.tdevReplay = function(el){
    if(!el) return;
    el.classList.remove('is-shown');
    void el.offsetWidth;           // force reflow
    requestAnimationFrame(()=>el.classList.add('is-shown'));
  };

  /* ---- Sliding tab pill ----
     Medir y escribir en el mismo bucle (offsetWidth -> style.width -> siguiente
     barra) fuerza un layout sincrónico por barra. Aquí se lee todo primero y se
     escribe después, y solo se escribe si la geometría cambió de verdad: el
     observador de DOM llamaba a esto en cada render y la píldora casi nunca se
     mueve. */
  const pillGeom = new WeakMap();
  function measurePill(bar){
    const active = bar.querySelector('.detail-tab.active, .profile-tab-btn.active');
    const pill = bar.querySelector(':scope > .tdev-tab-pill');
    if(!pill) return null;
    if(!active) return { bar, pill, active:null };
    return { bar, pill, active,
      underline: bar.classList.contains('detail-tabs'),
      w: active.offsetWidth, l: active.offsetLeft,
      h: active.offsetHeight, t: active.offsetTop };
  }
  function writePill(m){
    if(!m) return;
    if(!m.active){ m.pill.style.opacity = '0'; m.bar.classList.remove('pill-ready'); pillGeom.delete(m.bar); return; }
    const prev = pillGeom.get(m.bar);
    if(prev && prev.active === m.active && prev.w === m.w && prev.l === m.l &&
       prev.h === m.h && prev.t === m.t) return;
    pillGeom.set(m.bar, m);
    // La píldora es el ÚNICO fondo del tab activo: el CSS le pone color:#fff y
    // background:transparent. Si se mide con el contenedor oculto (un modal que
    // todavía no se abre) todo sale 0 y el rótulo queda blanco sobre claro —
    // "Credencial" ilegible hasta tocar otra pestaña. `pill-ready` le dice al
    // CSS que ya hay píldora de verdad; sin ella, el tab pinta su propio fondo.
    m.bar.classList.toggle('pill-ready', m.w > 0);
    m.pill.style.opacity = '1';
    m.pill.style.width = m.w + 'px';
    if(m.underline){
      m.pill.style.transform = 'translateX(' + m.l + 'px)';
    } else {
      m.pill.style.height = m.h + 'px';
      m.pill.style.transform = 'translateX(' + m.l + 'px) translateY(' + m.t + 'px)';
    }
  }
  function positionPill(bar){ writePill(measurePill(bar)); }
  function positionPills(bars){
    const measured = [];
    for(const b of bars) measured.push(measurePill(b));  // todas las lecturas
    for(const m of measured) writePill(m);               // luego las escrituras
  }
  function enhanceTabs(bar){
    if(bar.classList.contains('tdev-tabs')) return;
    bar.classList.add('tdev-tabs');
    const pill = document.createElement('span');
    pill.className = 'tdev-tab-pill';
    bar.insertBefore(pill, bar.firstChild);
    // snap into place without animating on first paint
    const prev = pill.style.transition; pill.style.transition='none';
    positionPill(bar); void pill.offsetWidth; pill.style.transition = prev;
    bar.addEventListener('click', e=>{
      if(e.target.closest('.detail-tab, .profile-tab-btn')) requestAnimationFrame(()=>positionPill(bar));
    });
  }

  /* ---- Accordion (task-area-group details) ---- */
  function enhanceAccordion(d){
    if(d.classList.contains('tdev-acc')) return;
    const body = d.querySelector(':scope > .task-area-body');
    if(!body) return;
    d.classList.add('tdev-acc');
    if(!body.querySelector(':scope > .tdev-acc-inner')){
      const inner = document.createElement('div');
      inner.className = 'tdev-acc-inner';
      while(body.firstChild) inner.appendChild(body.firstChild);
      body.appendChild(inner);
    }
  }

  /* ---- Avatar group hover spring ---- */
  function enhanceAvatars(group){
    if(group.dataset.tdevAv) return;
    group.dataset.tdevAv = '1';
    const items = () => Array.from(group.querySelectorAll('.t-avatar'));
    const LIFT=-5, SCALE=1.12, FALLOFF=0.45;
    group.addEventListener('mouseleave', ()=>{
      items().forEach(el=>{ el.style.setProperty('--shift','0px'); el.style.setProperty('--scale-active','1'); });
    });
    group.addEventListener('mouseover', e=>{
      const t = e.target.closest('.t-avatar'); if(!t) return;
      const list = items(); const idx = list.indexOf(t);
      list.forEach((el,i)=>{
        const dist = Math.abs(i-idx);
        el.style.setProperty('--shift', (LIFT*Math.pow(FALLOFF,dist)).toFixed(2)+'px');
        el.style.setProperty('--scale-active', i===idx?SCALE:1);
      });
    });
  }

  /* ---- Card tilt ---- */
  function enhanceTilt(card){
    if(card.dataset.tdevTilt) return;
    card.dataset.tdevTilt='1';
    card.classList.add('t-tilt','t-tilt-card');
    if(!card.querySelector(':scope > .t-tilt-glare')){
      const g = document.createElement('div'); g.className='t-tilt-glare'; card.appendChild(g);
    }
    const MAX=7;
    let raf=null;
    card.addEventListener('pointerenter', ()=>{ if(RM) return; card.classList.add('is-tilting','is-hover'); });
    card.addEventListener('pointermove', e=>{
      if(RM) return;
      if(raf) return;
      raf = requestAnimationFrame(()=>{
        raf=null;
        const r = card.getBoundingClientRect();
        const px = (e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
        card.style.setProperty('--tilt-ry', ((px-0.5)*2*MAX).toFixed(2)+'deg');
        card.style.setProperty('--tilt-rx', (-(py-0.5)*2*MAX).toFixed(2)+'deg');
        card.style.setProperty('--tilt-gx', (px*100).toFixed(1)+'%');
        card.style.setProperty('--tilt-gy', (py*100).toFixed(1)+'%');
      });
    }, { passive:true });
    card.addEventListener('pointerleave', ()=>{
      card.classList.remove('is-tilting','is-hover');
      card.style.setProperty('--tilt-rx','0deg'); card.style.setProperty('--tilt-ry','0deg');
    });
  }

  /* ---- Tooltip (data-tip) ---- */
  let tip;
  function ensureTip(){ if(!tip){ tip=document.createElement('div'); tip.className='tdev-tooltip'; document.body.appendChild(tip); } return tip; }
  function showTip(el){
    const txt = el.getAttribute('data-tip'); if(!txt) return;
    const t = ensureTip(); t.textContent = txt;
    const r = el.getBoundingClientRect();
    t.style.left = (r.left + r.width/2) + 'px';
    t.style.top  = (r.top - 8) + 'px';
    t.style.transform = 'translate(-50%, -100%) scale(.97)';
    requestAnimationFrame(()=>{ t.classList.add('is-shown'); t.style.transform='translate(-50%, -100%) scale(1)'; });
  }
  function hideTip(){ if(tip) tip.classList.remove('is-shown'); }
  document.addEventListener('mouseover', e=>{ const el=e.target.closest('[data-tip]'); if(el) showTip(el); });
  document.addEventListener('mouseout', e=>{ if(e.target.closest('[data-tip]')) hideTip(); });
  document.addEventListener('focusin', e=>{ const el=e.target.closest('[data-tip]'); if(el) showTip(el); });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { capture:true, passive:true });

  /* ---- Main sweep ---- */
  const ENH_SEL = '.detail-tabs, .profile-tab-bar, details.task-area-group, .tdev-avatars, [data-tilt], .t-stagger:not(.is-shown)';
  function enhance(el){
    if(el.matches('.detail-tabs, .profile-tab-bar')) enhanceTabs(el);
    else if(el.matches('details.task-area-group')) enhanceAccordion(el);
    else if(el.matches('.tdev-avatars')) enhanceAvatars(el);
    if(el.hasAttribute('data-tilt')) enhanceTilt(el);
    if(el.classList.contains('t-stagger') && !el.classList.contains('is-shown')){
      requestAnimationFrame(()=>el.classList.add('is-shown'));
    }
  }
  function initTransitions(root){
    root = root || document;
    if(root.nodeType === 1 && root.matches && root.matches(ENH_SEL)) enhance(root);
    root.querySelectorAll(ENH_SEL).forEach(enhance);
    // la píldora sí puede haberse movido si cambió el contenido del root
    positionPills(root.querySelectorAll ? root.querySelectorAll('.tdev-tabs') : []);
  }
  window.initTransitions = initTransitions;

  /* ---- Observe DOM for dynamically rendered views ----
     Solo los subárboles añadidos. Antes cada lote de mutaciones relanzaba
     cinco querySelectorAll sobre todo el documento más un reposicionamiento de
     píldora con lectura y escritura de layout intercaladas: renderizar una
     lista costaba un layout sincrónico por frame. */
  const added = [];
  let pending = false;
  function flush(){
    pending = false;
    const batch = added.splice(0, added.length);
    const bars = new Set();
    for(const node of batch){
      if(!node.isConnected) continue;
      initTransitionsNoPills(node);
      const bar = node.closest && node.closest('.tdev-tabs');
      if(bar) bars.add(bar);
      if(node.querySelectorAll) node.querySelectorAll('.tdev-tabs').forEach(b=>bars.add(b));
    }
    if(bars.size) positionPills(bars);
  }
  function initTransitionsNoPills(root){
    if(root.nodeType === 1 && root.matches && root.matches(ENH_SEL)) enhance(root);
    if(root.querySelectorAll) root.querySelectorAll(ENH_SEL).forEach(enhance);
  }
  const obs = new MutationObserver(records=>{
    for(const rec of records){
      const nodes = rec.addedNodes;
      for(let i=0;i<nodes.length;i++) if(nodes[i].nodeType === 1) added.push(nodes[i]);
    }
    if(!added.length || pending) return;
    pending = true;
    requestAnimationFrame(flush);
  });
  /* ---- Congelar el fondo mientras se scrollea ----
     Los orbes van en position:fixed y se mueven sin parar detrás del sidebar y
     de la topbar, que son superficies con backdrop-filter. Un backdrop que
     cambia cada frame obliga a rehacer el blur cada frame, y eso se paga
     entero justo cuando el usuario está scrolleando. Quietos, el resultado del
     filtro se puede reutilizar. Se vuelven a soltar al parar. */
  let scrollIdle = null;
  function onAnyScroll(){
    const r = document.documentElement;
    if(!scrollIdle) r.classList.add('is-scrolling');
    else clearTimeout(scrollIdle);
    scrollIdle = setTimeout(()=>{ scrollIdle = null; r.classList.remove('is-scrolling'); }, 140);
  }

  let resizeRaf = null;
  function boot(){
    window.addEventListener('scroll', onAnyScroll, { capture:true, passive:true });
    initTransitions(document);
    obs.observe(document.body, {childList:true, subtree:true});
    window.addEventListener('resize', ()=>{
      if(resizeRaf) return;
      resizeRaf = requestAnimationFrame(()=>{
        resizeRaf = null;
        positionPills(document.querySelectorAll('.tdev-tabs'));
      });
    }, { passive:true });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

