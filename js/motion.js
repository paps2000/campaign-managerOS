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

  /* ---- Sliding tab pill ---- */
  function positionPill(bar){
    const active = bar.querySelector('.detail-tab.active, .profile-tab-btn.active');
    const pill = bar.querySelector(':scope > .tdev-tab-pill');
    if(!pill) return;
    if(!active){ pill.style.opacity='0'; return; }
    pill.style.opacity='1';
    const isUnderline = bar.classList.contains('detail-tabs');
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    if(!isUnderline){ pill.style.height = active.offsetHeight + 'px'; pill.style.transform = 'translateX('+active.offsetLeft+'px) translateY('+active.offsetTop+'px)'; }
  }
  function enhanceTabs(bar){
    if(bar.classList.contains('tdev-tabs')) { positionPill(bar); return; }
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
    });
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
  window.addEventListener('scroll', hideTip, true);

  /* ---- Main sweep ---- */
  function initTransitions(root){
    root = root || document;
    root.querySelectorAll('.detail-tabs, .profile-tab-bar').forEach(enhanceTabs);
    root.querySelectorAll('details.task-area-group').forEach(enhanceAccordion);
    root.querySelectorAll('.tdev-avatars').forEach(enhanceAvatars);
    root.querySelectorAll('[data-tilt]').forEach(enhanceTilt);
    root.querySelectorAll('.t-stagger:not(.is-shown)').forEach(el=>requestAnimationFrame(()=>el.classList.add('is-shown')));
  }
  window.initTransitions = initTransitions;

  /* ---- Observe DOM for dynamically rendered views ---- */
  let pending=false;
  const obs = new MutationObserver(()=>{
    if(pending) return; pending=true;
    requestAnimationFrame(()=>{ pending=false; initTransitions(document); });
  });
  function boot(){
    initTransitions(document);
    obs.observe(document.body, {childList:true, subtree:true});
    window.addEventListener('resize', ()=>document.querySelectorAll('.tdev-tabs').forEach(positionPill));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

