/* Campaign OS — Refracción de superficies glass
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

(function(){
  const reduceTransp = window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  if(reduceTransp) return; // honour the system "can't read text on glass" switch

  // Panel-level glass surfaces worth refracting (skip tiny chips + login)
  // Every glass surface on the platform. Over-inclusion is safe: applyGlass
  // skips anything whose computed backdrop-filter has no blur. Pure full-bleed
  // scrims / background layers (.modal-overlay, .cmd-overlay, .content, .main,
  // .lr-bk, .login-hero) are left out — a lens over a dim screen is pointless.
  const SEL = [
    // panels / overlays-content
    '.modal', '.profile-modal', '.cmd-palette', '.notif-panel', '.ai-panel',
    '#infDetailContent', '.inf-detail-header', '.detail-header', '.settings-section',
    // chrome
    '.sidebar', '.sidebar-inner', '.sidebar-user', '.topbar', '.topbar-date',
    '.topbar-search-btn', '.mobile-nav', '.nav-item.active',
    // cards / tiles
    '.stat-card.featured', '.stat-card.urgent', '.team-card', '.flow-step',
    // controls / chips / buttons / inputs
    '.fab-action', '.btn-ghost', '.season-switch', '.profile-tab-bar',
    '.theme-toggle-btn', '.notif-bell-btn', '.empty-glass-icon',
    '.filter-tab:not(.active)', '.metrics-tab-pill:not(.active)',
    '.form-input', '.gen-select', '.flow-step-select',
    '.profile-status-preview', '.toast', '.task-area-group',
    // login screen glass
    '#loginScreen .lr-card', '#loginScreen .lr-card-wrap', '#loginScreen .lr-shell',
    '#loginScreen .lr-topbar', '#loginScreen .lr-brand-pill', '#loginScreen .lr-status-pill',
    '#loginScreen .lr-chip', '#loginScreen .lr-chips',
    '.login-card', '.login-input'
  ].join(',');

  // ---- defs host ----
  const svgNS = 'http://www.w3.org/2000/svg';
  const host = document.createElementNS(svgNS, 'svg');
  host.setAttribute('width','0'); host.setAttribute('height','0');
  host.setAttribute('aria-hidden','true');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  const defs = document.createElementNS(svgNS, 'defs');
  host.appendChild(defs);
  (document.body || document.documentElement).appendChild(host);

  // ---- optics: bend(x) for the squircle dome (x: 0 edge → 1 centre) ----
  function bendAt(x){
    x = Math.min(Math.max(x, 0.0015), 1);
    const ix = 1 - x;
    const slope = Math.pow(ix,3) / Math.pow(1 - Math.pow(ix,4), 0.75);
    const ti = Math.atan(slope);
    const tt = Math.asin(Math.min(1, Math.sin(ti) / 1.5)); // Snell, n=1.5
    return Math.sin(ti - tt);                               // 0 centre, max rim
  }
  const BEND_MAX = bendAt(0.0015);

  // ---- generate the displacement map for a given box, return blob URL ----
  const blobCache = new Map();   // key -> {url, w, h}
  function genMap(W, H, R, band, cb){
    // cap generation resolution; feImage stretches the rest
    const longest = Math.max(W, H);
    const gs = longest > 512 ? 512 / longest : 1;
    const w = Math.max(2, Math.round(W * gs));
    const h = Math.max(2, Math.round(H * gs));
    const r = Math.min(R * gs, w/2, h/2);
    const bnd = Math.max(2, band * gs);
    const key = w+'_'+h+'_'+Math.round(r)+'_'+Math.round(bnd);
    if(blobCache.has(key)){ cb(blobCache.get(key)); return; }

    const cnv = document.createElement('canvas');
    cnv.width = w; cnv.height = h;
    const ctx = cnv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const hw = w/2, hh = h/2;
    for(let y=0; y<h; y++){
      for(let x=0; x<w; x++){
        const i = (y*w + x) * 4;
        const px = x - hw + 0.5, py = y - hh + 0.5;
        // signed distance to rounded-rect boundary (negative inside)
        const qx = Math.abs(px) - (hw - r);
        const qy = Math.abs(py) - (hh - r);
        const ax = Math.max(qx,0), ay = Math.max(qy,0);
        const sdf = Math.hypot(ax,ay) + Math.min(Math.max(qx,qy),0) - r;
        const dist = -sdf; // inward depth from the rim
        if(dist <= 0){ d[i]=128; d[i+1]=128; d[i+2]=0; d[i+3]=255; continue; }
        const xn = Math.min(dist / bnd, 1);          // 0 rim → 1 flat centre
        const bend = bendAt(xn) / BEND_MAX;          // normalised 0..1
        // outward normal = SDF gradient
        let nx, ny;
        if(qx>0 || qy>0){ nx = (px<0?-1:1)*ax; ny = (py<0?-1:1)*ay; }
        else if(qx > qy){ nx = (px<0?-1:1); ny = 0; }
        else { nx = 0; ny = (py<0?-1:1); }
        const nl = Math.hypot(nx,ny) || 1; nx/=nl; ny/=nl;
        d[i]   = Math.max(0, Math.min(255, 128 + nx * bend * 127));
        d[i+1] = Math.max(0, Math.min(255, 128 + ny * bend * 127));
        d[i+2] = Math.round(bend * 255); // specular height (rim light source)
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cnv.toBlob(b => {
      // real WebKit refuses data: URIs inside feImage — must be a blob:
      const url = URL.createObjectURL(b);
      const rec = { url, w, h };
      blobCache.set(key, rec);
      cb(rec);
    });
  }

  // ---- build (or reuse) a filter for an element size ----
  let fid = 0;
  const filterCache = new Map(); // key -> filterId
  function ensureFilter(W, H, R, scale, cb){
    const band = Math.max(R, 12);
    const fkey = W+'_'+H+'_'+R+'_'+scale;
    if(filterCache.has(fkey)){ cb(filterCache.get(fkey)); return; }
    genMap(W, H, R, band, rec => {
      // Safari caches filter output by id — a stable id per size is fine
      // here because the map for a given size never changes.
      const id = 'lg' + (fid++);
      const m = Math.ceil(scale) + 2; // expand region so bent edges aren't clipped
      const f = document.createElementNS(svgNS, 'filter');
      f.setAttribute('id', id);
      f.setAttribute('filterUnits','userSpaceOnUse');
      f.setAttribute('color-interpolation-filters','sRGB'); // not linearRGB
      f.setAttribute('x', -m); f.setAttribute('y', -m);
      f.setAttribute('width', W + m*2); f.setAttribute('height', H + m*2);
      const fe = document.createElementNS(svgNS, 'feImage');
      fe.setAttribute('href', rec.url);
      fe.setAttributeNS('http://www.w3.org/1999/xlink','href', rec.url);
      fe.setAttribute('x','0'); fe.setAttribute('y','0');
      fe.setAttribute('width', W); fe.setAttribute('height', H);
      fe.setAttribute('preserveAspectRatio','none');
      fe.setAttribute('result','lgmap');
      const dm = document.createElementNS(svgNS, 'feDisplacementMap');
      dm.setAttribute('in','SourceGraphic');
      dm.setAttribute('in2','lgmap');
      dm.setAttribute('scale', scale);
      dm.setAttribute('xChannelSelector','R');
      dm.setAttribute('yChannelSelector','G');
      f.appendChild(fe); f.appendChild(dm);
      defs.appendChild(f);
      filterCache.set(fkey, id);
      cb(id);
    });
  }

  // ---- apply the bend to an element, preserving its own blur ----
  function applyGlass(el){
    if(el.dataset.lg) return;
    const cs = getComputedStyle(el);
    const base = cs.backdropFilter || cs.webkitBackdropFilter || '';
    if(!/blur/.test(base)) return;       // not a glass surface (no blur)
    if(/url\(/.test(base)) { el.dataset.lg='1'; return; }
    const rect = el.getBoundingClientRect();
    const W = Math.round(rect.width), H = Math.round(rect.height);
    if(W < 44 || H < 18) return;         // chips qualify; sub-pill noise does not
    let R = parseFloat(cs.borderTopLeftRadius) || 12;
    R = Math.min(R, W/2, H/2);
    // proportional bend: gentle on chips, fuller on big panels
    const scale = Math.max(3, Math.min(22, Math.round(Math.min(W,H) * 0.07)));
    el.dataset.lg = '1';
    ensureFilter(W, H, Math.round(R), scale, id => {
      const val = base + ' url(#' + id + ')';
      el.style.setProperty('backdrop-filter', val, 'important');
      el.style.setProperty('-webkit-backdrop-filter', val, 'important');
    });
  }

  function sweep(root){
    (root || document).querySelectorAll(SEL).forEach(applyGlass);
  }
  window.refractGlass = sweep;

  // re-apply on dynamic renders
  let pending = false;
  const obs = new MutationObserver(()=>{
    if(pending) return; pending = true;
    requestAnimationFrame(()=>{ pending=false; sweep(document); });
  });
  // size-sensitive chrome (sidebar/topbar/login) needs its map regenerated
  // when the viewport changes, or the static rim slides out of register
  let rT;
  function resweep(){
    document.querySelectorAll('[data-lg]').forEach(el=>{
      delete el.dataset.lg;
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    });
    sweep(document);
  }
  window.addEventListener('resize', ()=>{ clearTimeout(rT); rT=setTimeout(resweep, 200); });

  function boot(){
    sweep(document);
    obs.observe(document.body, { childList:true, subtree:true });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

