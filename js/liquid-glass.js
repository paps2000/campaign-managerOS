/* Campaign OS — Refracción de superficies glass
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse.

   Presupuesto de rendimiento (por qué el módulo está escrito así):
   - Nada de esto corre antes del primer paint. La lente es decoración; si
     bloquea el arranque, el usuario mira una pantalla en blanco.
   - Un elemento se mide UNA vez, y solo cuando entra en viewport. El
     IntersectionObserver ya nos entrega el rect, así que medir sale gratis
     (cero layout sincrónico) y los paneles/modales cerrados no se miden nunca.
   - Los mapas de desplazamiento se generan en tiempo idle y se cachean por
     tamaño redondeado: una lista de 40 tarjetas iguales comparte un mapa. */

(function(){
  const reduceTransp = window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  if(reduceTransp) return; // honour the system "can't read text on glass" switch

  // Equipos flojos: el bend cuesta un filtro SVG encadenado a cada
  // backdrop-filter. Con pocos núcleos se nota más el coste que el efecto,
  // así que se quedan con el blur plano.
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  if(cores <= 4 || mem <= 4) return;

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
    // tablero de pendientes
    '.tb-toolbar', '.tb-group', '.tb-card', '.tb-menu', '.tb-col',
    '.tb-search', '.tb-chip:not(.on):not(.tb-seg-btn)',
    // login screen glass
    '#loginScreen .lr-card', '#loginScreen .lr-card-wrap', '#loginScreen .lr-shell',
    '#loginScreen .lr-topbar', '#loginScreen .lr-brand-pill', '#loginScreen .lr-status-pill',
    '#loginScreen .lr-chip', '#loginScreen .lr-chips',
    '.login-card', '.login-input'
  ].join(',');

  const idle = window.requestIdleCallback
    ? (fn, t) => window.requestIdleCallback(fn, { timeout: t || 500 })
    : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 1);

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
  // bendAt cuesta 3 pow + atan + asin + 2 sin. En un mapa de 256×256 eso son
  // 65k evaluaciones; tabulada, cero. La curva es suave, 1024 muestras con
  // interpolación lineal son indistinguibles del cálculo exacto.
  const LUT_N = 1024;
  const BEND_LUT = new Float32Array(LUT_N + 1);
  for(let i = 0; i <= LUT_N; i++) BEND_LUT[i] = bendAt(i / LUT_N) / BEND_MAX;
  function bendNorm(xn){
    const p = xn * LUT_N;
    const i = p | 0;
    if(i >= LUT_N) return BEND_LUT[LUT_N];
    const f = p - i;
    return BEND_LUT[i] + (BEND_LUT[i+1] - BEND_LUT[i]) * f;
  }

  // ---- generate the displacement map for a given box, return blob URL ----
  // 256 px de lado largo: el feImage estira el mapa hasta el tamaño real, así
  // que la resolución solo afecta la nitidez del canto. Bajar de 512 a 256
  // divide el trabajo por 4 sin diferencia perceptible.
  const GEN_MAX = 256;
  const blobCache = new Map();   // key -> {url, w, h}
  function genMap(W, H, R, band, cb){
    // cap generation resolution; feImage stretches the rest
    const longest = Math.max(W, H);
    const gs = longest > GEN_MAX ? GEN_MAX / longest : 1;
    // Redondear el tamaño del mapa hace que superficies casi iguales (las 40
    // tarjetas de una lista, los chips de un toolbar) compartan un solo blob.
    // El estirado del feImage absorbe la diferencia.
    const q = 8;
    const w = Math.max(2, Math.round(W * gs / q) * q);
    const h = Math.max(2, Math.round(H * gs / q) * q);
    const r = Math.min(Math.round(R * gs), w/2, h/2);
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
        const sdf = Math.sqrt(ax*ax + ay*ay) + Math.min(Math.max(qx,qy),0) - r;
        const dist = -sdf; // inward depth from the rim
        if(dist <= 0){ d[i]=128; d[i+1]=128; d[i+2]=0; d[i+3]=255; continue; }
        const xn = dist < bnd ? dist / bnd : 1;      // 0 rim → 1 flat centre
        const bend = bendNorm(xn);                   // normalised 0..1
        // outward normal = SDF gradient
        let nx, ny;
        if(qx>0 || qy>0){ nx = (px<0?-1:1)*ax; ny = (py<0?-1:1)*ay; }
        else if(qx > qy){ nx = (px<0?-1:1); ny = 0; }
        else { nx = 0; ny = (py<0?-1:1); }
        const nl = Math.sqrt(nx*nx + ny*ny) || 1; nx/=nl; ny/=nl;
        d[i]   = Math.max(0, Math.min(255, 128 + nx * bend * 127));
        d[i+1] = Math.max(0, Math.min(255, 128 + ny * bend * 127));
        d[i+2] = bend * 255; // specular height (rim light source)
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
  /* Lo que el usuario no ve no lleva lente. `visibility` es el criterio real,
     pero un panel que se está cerrando la conserva durante la animación de
     salida (--panel-close-dur), y este barrido corre en tiempo idle: puede
     caer justo dentro de esa ventana y volver a ponerle lente a algo que ya
     nadie va a mirar. data-open="false" es el estado declarado, sin depender
     de en qué punto de la transición estemos. */
  function invisible(el, cs){
    if(el.dataset.open === 'false') return true;
    return (cs || getComputedStyle(el)).visibility !== 'visible';
  }

  // rect llega del IntersectionObserver, que lo calcula fuera del hilo de
  // layout: pedirlo aquí con getBoundingClientRect forzaría un reflow
  // sincrónico por elemento.
  function applyGlass(el, rect){
    if(el.dataset.lg) return true;
    const cs = getComputedStyle(el);
    // Un panel cerrado sigue en el layout: .t-panel-slide lo deja pintado para
    // poder animarle el cierre, así que el IntersectionObserver lo ve y le mide
    // un rect de verdad. Ponerle lente ahí deja un backdrop-filter encadenado a
    // un filtro SVG, en capa promovida, FIJO ENCIMA del contenido y sin que
    // nadie lo vea: un backdrop root permanente que obliga a re-rasterizar lo
    // que tiene detrás. La lente se pone cuando el panel se abre —el observador
    // vigila data-open— y se quita al cerrarse.
    if(invisible(el, cs)) return false;
    const base = cs.backdropFilter || cs.webkitBackdropFilter || '';
    if(!/blur/.test(base)) return false;   // not a glass surface (no blur) — todavía
    if(/url\(/.test(base)) { el.dataset.lg='1'; return true; }
    // Lo que scrollea de verdad se queda con el blur plano, sin bend. Un filtro
    // SVG encadenado al backdrop-filter saca al scroller de la ruta compuesta y
    // el desplazamiento pasa a resolverse en el hilo principal frame a frame:
    // es lo que hace que bajar dentro de un modal o de un textarea largo vaya a
    // tirones. Y es donde menos se nota: el bend vive en el canto y en un panel
    // grande el desplazamiento ya está topado.
    // Se mira el desbordamiento REAL, no solo `overflow:auto`. Media app lleva
    // `auto` por si acaso — el sidebar, sin ir más lejos — y casi nunca
    // desborda; esos no scrollean y se quedan con su lente.
    const oy = cs.overflowY, ox = cs.overflowX;
    const canScrollY = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    const canScrollX = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    if(canScrollY || canScrollX){
      el.dataset.lg = '1';
      return true;
    }
    const W = Math.round(rect.width), H = Math.round(rect.height);
    if(W < 44 || H < 18) return false;     // chips qualify; sub-pill noise does not
    let R = parseFloat(cs.borderTopLeftRadius) || 12;
    R = Math.min(R, W/2, H/2);
    // proportional bend: gentle on chips, fuller on big panels
    const scale = Math.max(3, Math.min(22, Math.round(Math.min(W,H) * 0.07)));
    el.dataset.lg = '1';
    el.dataset.lgw = W; el.dataset.lgh = H;
    ensureFilter(W, H, Math.round(R), scale, id => {
      encolarEstilo(el, base + ' url(#' + id + ')');
    });
    return true;
  }

  /* Cada mapa termina en su propio callback (toBlob es asíncrono) y el primero
     de un tamaño nuevo tarda más que los que ya lo tienen en caché. Escribiendo
     el estilo ahí mismo, las lentes del arranque aterrizaban de una en una:
     dos segundos de superficies cambiando de aspecto por turnos, que es medio
     parpadeo por sí solo. Se juntan y se aplican todas en el mismo frame. */
  const estilosPendientes = [];
  let escrituraPedida = false;
  function encolarEstilo(el, val){
    estilosPendientes.push([el, val]);
    if(escrituraPedida) return;
    escrituraPedida = true;
    requestAnimationFrame(() => {
      escrituraPedida = false;
      const lote = estilosPendientes.splice(0, estilosPendientes.length);
      for(const [e, v] of lote){
        if(!e.isConnected || !e.dataset.lg) continue;   // se le quitó la lente mientras tanto
        e.style.setProperty('backdrop-filter', v, 'important');
        e.style.setProperty('-webkit-backdrop-filter', v, 'important');
      }
    });
  }

  // ---- visibilidad: solo se mide lo que el usuario llega a ver ----
  // Un modal cerrado, una pestaña inactiva o una tarjeta 300 px más abajo no
  // gastan nada hasta que aparecen. Antes cada mutación del DOM las volvía a
  // medir todas.
  // estado por elemento: {watching, tries}. Un elemento que aún no es cristal
  // (su backdrop-filter puede depender de una clase que se pone más tarde) no
  // se descarta para siempre: se vuelve a comprobar en el siguiente sweep,
  // hasta MAX_TRIES. Sin ese reintento, el sidebar y la topbar se quedaban sin
  // lente para siempre por haberse comprobado mientras el login los tapaba.
  const MAX_TRIES = 3;
  const state = new WeakMap();
  const queue = [];       // [{el, rect}] pendientes de generar mapa
  let draining = false;

  function drain(deadline){
    draining = false;
    while(queue.length){
      // El bucle de píxeles del primer mapa de un tamaño nuevo puede tardar
      // unos ms; ceder el hilo evita frames largos al abrir una vista.
      if(deadline && deadline.timeRemaining() <= 2 && queue.length){
        draining = true; idle(drain, 300); return;
      }
      const job = queue.shift();
      if(!job.el.isConnected) continue;
      if(applyGlass(job.el, job.rect)) continue;
      const s = state.get(job.el);
      if(s) s.tries++;
    }
  }
  function enqueue(el, rect){
    queue.push({ el, rect });
    if(draining) return;
    draining = true;
    idle(drain, 300);
  }

  const io = new IntersectionObserver(entries => {
    for(const e of entries){
      if(!e.isIntersecting) continue;
      io.unobserve(e.target);
      const s = state.get(e.target);
      if(s) s.watching = false;
      // rect vacío = está en un contenedor display:none que aun así intersecta
      if(e.boundingClientRect.width > 0) enqueue(e.target, e.boundingClientRect);
    }
  }, { rootMargin: '200px' });

  function register(el){
    if(el.dataset.lg) return;
    let s = state.get(el);
    if(!s){ s = { watching:false, tries:0 }; state.set(el, s); }
    if(s.watching || s.tries >= MAX_TRIES) return;
    s.watching = true;
    io.observe(el);
  }
  function sweep(root){
    const r = root || document;
    if(r.nodeType === 1 && r.matches && r.matches(SEL)) register(r);
    r.querySelectorAll(SEL).forEach(register);
  }
  window.refractGlass = sweep;

  // Quita la lente de un elemento que ya no debería llevarla (p. ej. un
  // .nav-item que pierde .active). El estilo se aplica inline con !important,
  // así que la clase sola no lo revierte.
  function unglass(el){
    if(!el.dataset.lg) return;
    delete el.dataset.lg; delete el.dataset.lgw; delete el.dataset.lgh;
    el.style.removeProperty('backdrop-filter');
    el.style.removeProperty('-webkit-backdrop-filter');
    state.delete(el);
  }

  // re-apply on dynamic renders — solo sobre los subárboles añadidos, no
  // sobre todo el documento: renderizar una lista de 200 filas disparaba un
  // querySelectorAll global por frame.
  const added = [];
  // Set y no array: durante un render la misma fila puede cambiar de clase
  // varias veces y no hace falta comprobarla más de una vez por lote.
  const touched = new Set();
  let pending = false;
  function flushAdded(){
    pending = false;
    const batch = added.splice(0, added.length);
    const cls = Array.from(touched); touched.clear();
    const gated = loginUp();
    for(const node of batch){
      if(!node.isConnected) continue;
      // mismo motivo que en boot(): nada detrás del login
      if(gated && !node.closest('#loginScreen')) continue;
      sweep(node);
    }
    // Varios selectores dependen de una clase (.nav-item.active,
    // .filter-tab:not(.active), .tb-chip:not(.on)…) y el panel de avisos de un
    // atributo (data-open). Ninguno de los dos añade nodos, así que hay que
    // reevaluar el elemento tocado: si ahora encaja y se ve, se le pone lente;
    // si dejó de encajar —o se cerró y ya no se ve— se le quita. Resetear el
    // estado es correcto justamente porque la clase es lo que decide su estilo.
    for(const el of cls){
      if(!el.isConnected) continue;
      if(gated && !el.closest('#loginScreen')) continue;
      if(el.matches(SEL) && !invisible(el)){ state.delete(el); register(el); }
      else unglass(el);
    }
  }
  const obs = new MutationObserver(records => {
    for(const rec of records){
      if(rec.type === 'attributes'){
        if(rec.target.nodeType === 1) touched.add(rec.target);
        continue;
      }
      const nodes = rec.addedNodes;
      for(let i=0; i<nodes.length; i++){
        if(nodes[i].nodeType === 1) added.push(nodes[i]);
      }
    }
    if((!added.length && !touched.size) || pending) return;
    pending = true;
    idle(flushAdded, 400);
  });

  // size-sensitive chrome (sidebar/topbar/login) needs its map regenerated
  // when the viewport changes, or the static rim slides out of register
  let rT;
  function resweep(){
    // Solo se reinicia lo que de verdad cambió de tamaño. Un resize de altura
    // no invalida el mapa de un chip de ancho fijo.
    const dirty = [];
    document.querySelectorAll('[data-lg]').forEach(el=>{
      const r = el.getBoundingClientRect();
      if(!r.width) return;
      if(Math.abs(r.width - (+el.dataset.lgw||0)) < 2 &&
         Math.abs(r.height - (+el.dataset.lgh||0)) < 2) return;
      dirty.push(el);
    });
    for(const el of dirty){
      delete el.dataset.lg; delete el.dataset.lgw; delete el.dataset.lgh;
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
      state.delete(el);
      register(el);
    }
    sweep(document);
  }
  window.addEventListener('resize', ()=>{ clearTimeout(rT); rT=setTimeout(resweep, 300); }, { passive: true });

  // Con el login arriba, el sidebar y la topbar están renderizados debajo: el
  // IntersectionObserver los ve "visibles" y les generaría lente aunque nadie
  // los mire. Mientras el login esté abierto solo se refracta el login.
  function loginUp(){
    const l = document.getElementById('loginScreen');
    return !!l && !l.classList.contains('hidden');
  }

  function boot(){
    const login = document.getElementById('loginScreen');
    if(loginUp()){
      sweep(login);
      new MutationObserver((recs, self) => {
        if(loginUp()) return;
        self.disconnect();
        idle(() => sweep(document), 800);
      }).observe(login, { attributes:true, attributeFilter:['class'] });
    } else {
      sweep(document);
    }
    // data-open además de class: es el interruptor de .t-panel-slide, y sin
    // vigilarlo un panel que se abre no recibiría la lente nunca.
    obs.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','data-open'] });
  }
  // Nunca antes del primer paint: el bend es decoración y bloqueaba ~1.5 s de
  // arranque generando mapas de superficies que ni se veían.
  function schedule(){ idle(boot, 1500); }
  if(document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
