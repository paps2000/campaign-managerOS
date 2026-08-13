/* Campaign OS — Stickers de vinil para la credencial
   Script CLÁSICO a propósito (NO type="module").

   La idea central: el look de troquelado NO viene de arte pre-hecho, se GENERA.
   Se dibuja la palabra a un canvas fuera de pantalla y se DILATA su silueta
   hacia afuera estampando la palabra rellena muchas veces alrededor de un anillo
   del radio del borde. Eso hace crecer un contorno parejo que sigue la forma
   real de las letras — contraformas incluidas — cosa que ningún `strokeText`
   logra: el trazo de canvas se centra en el contorno y en las esquinas
   agudas se dispara en picos.

   Por eso también hay que ESPERAR a la webfont antes de rasterizar: si se
   dibuja con la fuente de respaldo, el troquel abraza los glifos equivocados y
   ya no se corrige solo cuando la fuente llega.

   Sin librería de canvas ni de física: un rasterizador y un bucle rAF. */

// ============================================================
// CATÁLOGO
// ============================================================

/* Un espécimen tipográfico en miniatura: cada palabra en una familia distinta.
   Solo Quicksand y Fraunces se cargan por red (ya son parte del sitio); el resto
   son familias del sistema, que cuestan cero bytes. Pedir seis webfonts para
   seis stickers sería exactamente el peso que no queremos. */
const HOLO_STICKER_FONTS = [
  { key:'quick',  label:'Redonda',  css:"'Quicksand', sans-serif",      weight:700, style:'normal' },
  { key:'serif',  label:'Serif',    css:"'Fraunces', Georgia, serif",   weight:600, style:'normal' },
  { key:'ital',   label:'Cursiva',  css:"Georgia, 'Times New Roman', serif", weight:700, style:'italic' },
  { key:'mono',   label:'Mono',     css:"'Courier New', monospace",     weight:700, style:'normal' },
  { key:'impact', label:'Bloque',   css:"Impact, 'Arial Black', sans-serif", weight:400, style:'normal' },
  { key:'sys',    label:'Grotesca', css:"system-ui, 'Helvetica Neue', sans-serif", weight:800, style:'normal' },
];
const HOLO_STICKER_FONT_BY_KEY = Object.fromEntries(HOLO_STICKER_FONTS.map(f => [f.key, f]));

/* Pares relleno/contorno. El contorno es siempre el claro y el relleno el
   oscuro (o al revés) para que el troquel se despegue de cualquier tinta de
   tarjeta: un sticker con el borde del mismo valor que la tarjeta desaparece. */
const HOLO_STICKER_COLORS = [
  { key:'fresa',  label:'Fresa',   outline:'#ffffff', fill:'#ff2d87' },
  { key:'limon',  label:'Limón',   outline:'#2b0b4f', fill:'#eaff5a' },
  { key:'menta',  label:'Menta',   outline:'#0b3a2c', fill:'#7dffb0' },
  { key:'cielo',  label:'Cielo',   outline:'#ffffff', fill:'#1668ff' },
  { key:'uva',    label:'Uva',     outline:'#ffd21e', fill:'#7c4dff' },
  { key:'fuego',  label:'Fuego',   outline:'#2b0b4f', fill:'#ff7a1a' },
  { key:'tinta',  label:'Tinta',   outline:'#ffffff', fill:'#16121f' },
  { key:'papel',  label:'Papel',   outline:'#16121f', fill:'#ffffff' },
];
const HOLO_STICKER_COLOR_BY_KEY = Object.fromEntries(HOLO_STICKER_COLORS.map(c => [c.key, c]));

/* Vocabulario de agencia. Cortos a propósito: un sticker largo deja de ser
   sticker y se vuelve un letrero encima de la credencial. */
const HOLO_STICKER_WORDS = [
  '¡sí!', 'wow', 'top', 'brief', 'en vivo', 'WIP', 'aprobado', 'urgente',
  'ship it', 'crack', 'jefa', 'jefe', 'café', 'creativo', 'data', 'ya quedó',
];

const HOLO_STICKER_MAX = 6;

// ============================================================
// RASTERIZADO
// ============================================================

/* Espera a que las webfonts del catálogo estén listas. Se resuelve una sola vez
   y se cachea: rasterizar antes de tiempo produce un troquel pegado a la fuente
   de respaldo, y eso ya no se arregla solo cuando la real llega. */
let _holoFontsReady = null;
function holoStickerFontsReady() {
  if (_holoFontsReady) return _holoFontsReady;
  if (!document.fonts || !document.fonts.load) {
    _holoFontsReady = Promise.resolve();
    return _holoFontsReady;
  }
  _holoFontsReady = Promise.all([
    document.fonts.load("700 40px 'Quicksand'"),
    document.fonts.load("600 40px 'Fraunces'"),
  ]).catch(() => {});
  return _holoFontsReady;
}

/* Dibuja UN sticker a un canvas propio y lo devuelve con su tamaño en CSS px. */
function renderStickerCanvas(opts) {
  const dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 2);
  const size = opts.fontSizePx;
  const border = opts.border == null ? Math.max(4, Math.round(size * 0.16)) : opts.border;
  const fontStr = `${opts.style || 'normal'} ${opts.weight} ${size}px ${opts.font}`;

  const meas = document.createElement('canvas').getContext('2d');
  meas.font = fontStr;
  const m = meas.measureText(opts.word);
  const ascent = m.actualBoundingBoxAscent || size * 0.8;
  const descent = m.actualBoundingBoxDescent || size * 0.2;
  // El ancho de tinta real, no `m.width`: en cursivas e Impact el avance se
  // queda corto respecto a lo que de verdad se pinta y el troquel salía cortado.
  const left = m.actualBoundingBoxLeft || 0;
  const right = m.actualBoundingBoxRight || m.width;
  const textW = Math.max(m.width, left + right);
  const textH = ascent + descent;

  const pad = border + 4;
  const cssW = Math.ceil(textW + pad * 2);
  const cssH = Math.ceil(textH + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  const ctx = canvas.getContext('2d');

  const bx = pad + left;
  const by = pad + ascent;

  // LA DILATACIÓN. Anillos concéntricos de estampas de la palabra rellena, de
  // afuera hacia adentro. Cada anillo lleva suficientes estampas como para que
  // los huecos entre una y otra sean menores a un pixel; con pocas estampas el
  // contorno sale festoneado en las curvas.
  const base = document.createElement('canvas');
  base.width = canvas.width;
  base.height = canvas.height;
  const bctx = base.getContext('2d');
  bctx.scale(dpr, dpr);
  bctx.font = fontStr;
  bctx.textBaseline = 'alphabetic';
  bctx.fillStyle = opts.outline;
  for (let r = border; r > 0.5; r -= 1) {
    const stamps = Math.max(16, Math.ceil(r * 3));
    for (let a = 0; a < stamps; a++) {
      const ang = (a / stamps) * Math.PI * 2;
      bctx.fillText(opts.word, bx + Math.cos(ang) * r, by + Math.sin(ang) * r);
    }
  }
  // Y el centro, que cierra los huecos que dejan los anillos dentro de trazos
  // más delgados que el borde.
  bctx.fillText(opts.word, bx, by);

  ctx.drawImage(base, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = fontStr;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = opts.fill;
  ctx.fillText(opts.word, bx, by);

  return { canvas, width: cssW, height: cssH };
}

// ============================================================
// TABLERO
// ============================================================

const _HS_FRICTION = 0.92;
const _HS_BOUNCE = 0.55;
const _HS_MIN_VEL = 0.05;
const _HS_THROW = 0.7;
const _HS_GRAB_SCALE = 1.1;
const _HS_SCALE_EASE = 0.14;
const _HS_DRAG_EASE = 0.22;
/* Distancia bajo la cual un pointerup cuenta como toque y no como lanzamiento. */
const _HS_TAP = 4;

/* Los stickers viven DENTRO de la tarjeta (comparten su plano 3D, así que se
   inclinan con ella). `host` es el elemento `.holo-stickers` que ya está en el
   árbol de la credencial. */
class HoloStickerBoard {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.items = [];
    this.raf = 0;
    this.running = false;
    this.dragging = null;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.editable = !!this.opts.editable;
    this.W = host.clientWidth || 1;
    this.H = host.clientHeight || 1;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._loop = this._loop.bind(this);

    this.ro = new ResizeObserver(() => this._onResize());
    this.ro.observe(host);
  }

  _onResize() {
    const pw = this.W, ph = this.H;
    this.W = this.host.clientWidth || 1;
    this.H = this.host.clientHeight || 1;
    if (this.W < 2 || this.H < 2) return;
    if (Math.abs(this.W - pw) < 1 && Math.abs(this.H - ph) < 1) return;
    // Se repinta desde las coordenadas NORMALIZADAS de cada def, no desde los
    // px actuales. La tarjeta se monta dentro de un modal cerrado, donde mide 0:
    // si el reposicionamiento leyera los px de ese momento, dividiría entre un
    // ancho de 1 y todos los stickers quedarían clavados en la esquina — que es
    // justo lo que pasaba.
    this._relayout();
  }

  /* Re-rasteriza al tamaño actual y recoloca desde las coordenadas guardadas.
     El tamaño de letra va atado al ancho de la tarjeta, así que escalar el
     bitmap en vez de repintarlo dejaría el troquel borroso. */
  _relayout() {
    if (this.W < 2 || this.H < 2) return;
    const fontPx = this._fontPx();
    for (const it of this.items) {
      const f = HOLO_STICKER_FONT_BY_KEY[it.def.f] || HOLO_STICKER_FONTS[0];
      const c = HOLO_STICKER_COLOR_BY_KEY[it.def.c] || HOLO_STICKER_COLORS[0];
      const r = renderStickerCanvas({
        word: it.def.w, font: f.css, weight: f.weight, style: f.style,
        fill: c.fill, outline: c.outline, fontSizePx: fontPx,
      });
      const old = it.el;
      r.canvas.className = 'holo-sticker';
      r.canvas.style.width = r.width + 'px';
      r.canvas.style.height = r.height + 'px';
      r.canvas.setAttribute('aria-hidden', 'true');
      old.replaceWith(r.canvas);
      it.el = r.canvas;
      this._bind(it);
      it.w = r.width; it.h = r.height;
      it.x = (it.def.x == null ? .5 : it.def.x) * this.W - r.width / 2;
      it.y = (it.def.y == null ? .5 : it.def.y) * this.H - r.height / 2;
      it.rot = it.def.r || 0;
      it.vx = it.vy = it.vrot = 0;
      it.scale = 1;
      this._clamp(it);
      this._place(it);
    }
  }

  /* Tamaño de letra proporcional a la tarjeta: la misma credencial se monta a
     520px en el perfil y a 300px en la vista previa. */
  _fontPx() {
    return Math.max(13, Math.min(34, this.W * 0.062));
  }

  setStickers(list) {
    this.host.innerHTML = '';
    this.items = [];
    // Copia propia: el tablero MUTA def.x/def.y conforme los mueves, y hacerlo
    // sobre el arreglo del llamador lo sorprendería.
    const arr = (list || []).slice(0, HOLO_STICKER_MAX).map(d => Object.assign({}, d));
    this.W = this.host.clientWidth || this.W;
    this.H = this.host.clientHeight || this.H;
    const fontPx = this._fontPx();

    arr.forEach(def => {
      const f = HOLO_STICKER_FONT_BY_KEY[def.f] || HOLO_STICKER_FONTS[0];
      const c = HOLO_STICKER_COLOR_BY_KEY[def.c] || HOLO_STICKER_COLORS[0];
      const r = renderStickerCanvas({
        word: def.w, font: f.css, weight: f.weight, style: f.style,
        fill: c.fill, outline: c.outline, fontSizePx: fontPx,
      });
      const el = r.canvas;
      el.className = 'holo-sticker';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      el.setAttribute('aria-hidden', 'true');
      this.host.appendChild(el);

      const it = {
        def, el, w: r.width, h: r.height,
        x: (def.x == null ? 0.5 : def.x) * this.W - r.width / 2,
        y: (def.y == null ? 0.5 : def.y) * this.H - r.height / 2,
        tx: 0, ty: 0, vx: 0, vy: 0,
        rot: def.r || 0, vrot: 0,
        scale: 1, drag: false,
      };
      it.tx = it.x; it.ty = it.y;
      this._clamp(it);
      this._place(it);
      this._bind(it);
      this.items.push(it);
    });
    this._wake();
  }

  /* Posiciones normalizadas, listas para guardar. Normalizadas y no en px
     porque la credencial se pinta a anchos distintos según dónde se monte. */
  getStickers() {
    return this.items.map(it => {
      // Solo se confía en los px cuando la tarjeta tiene tamaño real: leerlos
      // con la tarjeta a 0 de ancho reescribiría las posiciones a basura.
      if (this.W > 2 && this.H > 2) {
        it.def.x = +(((it.x + it.w / 2) / this.W).toFixed(4));
        it.def.y = +(((it.y + it.h / 2) / this.H).toFixed(4));
        it.def.r = Math.round(it.rot * 10) / 10;
      }
      return { w: it.def.w, f: it.def.f, c: it.def.c, x: it.def.x, y: it.def.y, r: it.def.r };
    });
  }

  setEditable(v) { this.editable = !!v; }

  _clamp(it) {
    it.x = Math.max(0, Math.min(this.W - it.w, it.x));
    it.y = Math.max(0, Math.min(this.H - it.h, it.y));
  }

  _place(it) {
    it.el.style.transform =
      `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) rotate(${it.rot.toFixed(2)}deg)` +
      (it.scale !== 1 ? ` scale(${it.scale.toFixed(3)})` : '');
  }

  /* Factores para pasar un desplazamiento en PANTALLA al espacio local de la
     tarjeta. Hacen falta porque la credencial está rotada en 3D: un
     getBoundingClientRect da la caja YA transformada, así que restarle clientX
     produce coordenadas que no corresponden a las del sticker. Solo se
     convierten DELTAS, no posiciones absolutas — con eso basta para arrastrar y
     evita tener que invertir la matriz de perspectiva. Durante el arrastre la
     tarjeta queda congelada, así que el factor no cambia a media gesto. */
  _screenScale() {
    const r = this.host.getBoundingClientRect();
    return {
      sx: r.width > 1 ? this.W / r.width : 1,
      sy: r.height > 1 ? this.H / r.height : 1,
    };
  }

  _onDown(e, it) {
    if (this.reduced) return;
    e.preventDefault();
    // Corta la propagación para que el mismo gesto no incline además la
    // tarjeta: arrastrar un sticker y girar la credencial son dos acciones
    // distintas sobre el mismo pixel.
    e.stopPropagation();

    it.drag = true;
    it.vx = it.vy = 0; it.vrot = 0;
    const k = this._screenScale();
    this.dragging = {
      it,
      startX: e.clientX, startY: e.clientY,
      originX: it.x, originY: it.y,
      sx: k.sx, sy: k.sy,
      moved: 0, lastX: e.clientX, lastY: e.clientY,
      // Velocidad del PUNTERO, suavizada. No sirve leer la del seguidor al
      // soltar: si terminas el gesto despacio, el sticker ya alcanzó al cursor
      // y su delta es cero — el lanzamiento salía muerto justo cuando el
      // movimiento había sido largo.
      pvx: 0, pvy: 0,
      id: e.pointerId,
    };
    // Al frente: un sticker que agarras y se queda debajo de otro se siente roto.
    this.host.appendChild(it.el);
    const i = this.items.indexOf(it);
    if (i >= 0) { this.items.splice(i, 1); this.items.push(it); }

    // Con try: setPointerCapture lanza NotFoundError si el puntero ya no está
    // activo (p.ej. el navegador lo liberó entre eventos), y una excepción aquí
    // aborta el enganche de los listeners de move/up — el sticker se quedaría
    // pegado al cursor sin poder soltarse.
    try { it.el.setPointerCapture && it.el.setPointerCapture(e.pointerId); } catch (_) {}
    it.el.addEventListener('pointermove', this._onMove);
    it.el.addEventListener('pointerup', this._onUp);
    it.el.addEventListener('pointercancel', this._onUp);
    if (this.opts.onDragChange) this.opts.onDragChange(true);
    this._wake();
  }

  /* Un listener por sticker en vez de uno en la capa: así el hit-test lo hace
     el navegador a través de la transformación 3D, que es la única forma de que
     acierte cuando la tarjeta está inclinada. */
  _bind(it) {
    it._down = (e) => this._onDown(e, it);
    it.el.addEventListener('pointerdown', it._down);
  }

  _onMove(e) {
    const d = this.dragging;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    e.stopPropagation();
    d.it.tx = d.originX + (e.clientX - d.startX) * d.sx;
    d.it.ty = d.originY + (e.clientY - d.startY) * d.sy;
    const ddx = (e.clientX - d.lastX) * d.sx;
    const ddy = (e.clientY - d.lastY) * d.sy;
    // Media móvil corta: cruda salta demasiado entre eventos, y demasiado
    // suave se traga los flicks, que es exactamente lo que hay que capturar.
    d.pvx += (ddx - d.pvx) * 0.4;
    d.pvy += (ddy - d.pvy) * 0.4;
    d.moved += Math.hypot(e.clientX - d.lastX, e.clientY - d.lastY);
    d.lastX = e.clientX; d.lastY = e.clientY;
    this._wake();
  }

  _onUp(e) {
    const d = this.dragging;
    if (!d) return;
    const it = d.it;
    it.drag = false;
    if (d.moved < _HS_TAP) {
      // Toque, no lanzamiento: un bamboleo corto. Sin esto, tocar un sticker no
      // devuelve nada y se siente muerto.
      it.vrot = 6;
      it.vx = it.vy = 0;
    } else {
      // LANZAMIENTO con la velocidad del puntero, no con la del seguidor.
      // El giro sale del componente horizontal: lanzar hacia la derecha hace
      // girar en el sentido del reloj, como un objeto real.
      it.vx = Math.max(-42, Math.min(42, d.pvx)) * _HS_THROW;
      it.vy = Math.max(-42, Math.min(42, d.pvy)) * _HS_THROW;
      it.vrot = Math.max(-9, Math.min(9, it.vx * 0.55));
    }
    this.dragging = null;
    try { it.el.releasePointerCapture && it.el.releasePointerCapture(e.pointerId); } catch (_) {}
    it.el.removeEventListener('pointermove', this._onMove);
    it.el.removeEventListener('pointerup', this._onUp);
    it.el.removeEventListener('pointercancel', this._onUp);
    if (this.opts.onDragChange) this.opts.onDragChange(false);
    if (this.editable && this.opts.onChange) this.opts.onChange(this.getStickers());
    this._wake();
  }

  _wake() {
    if (this.reduced || this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this._loop);
  }

  _loop() {
    this.raf = 0;
    let alive = false;

    for (const it of this.items) {
      const targetScale = it.drag ? _HS_GRAB_SCALE : 1;
      if (Math.abs(targetScale - it.scale) > 0.001) {
        it.scale += (targetScale - it.scale) * _HS_SCALE_EASE;
        alive = true;
      }

      if (it.drag) {
        // El sticker persigue al puntero con un poco de retraso, y ESA
        // diferencia es la velocidad que se usará al soltar: medirla del evento
        // da picos, medirla del movimiento propio da algo suave.
        const nx = it.x + (it.tx - it.x) * _HS_DRAG_EASE;
        const ny = it.y + (it.ty - it.y) * _HS_DRAG_EASE;
        it.vx = nx - it.x;
        it.vy = ny - it.y;
        it.x = nx; it.y = ny;
        this._place(it);
        alive = true;
        continue;
      }

      const moving = Math.abs(it.vx) >= _HS_MIN_VEL || Math.abs(it.vy) >= _HS_MIN_VEL || Math.abs(it.vrot) > 0.05;
      if (!moving) continue;

      it.x += it.vx;
      it.y += it.vy;
      it.rot += it.vrot;

      // REBOTE contra los cantos de la tarjeta: invierte y amortigua.
      if (it.x < 0) { it.x = 0; it.vx = -it.vx * _HS_BOUNCE; it.vrot *= -0.6; }
      else if (it.x > this.W - it.w) { it.x = this.W - it.w; it.vx = -it.vx * _HS_BOUNCE; it.vrot *= -0.6; }
      if (it.y < 0) { it.y = 0; it.vy = -it.vy * _HS_BOUNCE; it.vrot *= -0.6; }
      else if (it.y > this.H - it.h) { it.y = this.H - it.h; it.vy = -it.vy * _HS_BOUNCE; it.vrot *= -0.6; }

      it.vx *= _HS_FRICTION;
      it.vy *= _HS_FRICTION;
      it.vrot *= 0.88;
      if (Math.abs(it.vrot) < 0.05) it.vrot = 0;

      this._place(it);
      alive = true;

      // Al detenerse, si estamos editando, se guarda la posición final.
      if (Math.abs(it.vx) < _HS_MIN_VEL && Math.abs(it.vy) < _HS_MIN_VEL && !it.vrot) {
        if (this.editable && this.opts.onChange) this.opts.onChange(this.getStickers());
      }
    }

    if (alive) this.raf = requestAnimationFrame(this._loop);
    else this.running = false;
  }

  destroy() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ro && this.ro.disconnect();
    for (const it of this.items) {
      if (it._down) it.el.removeEventListener('pointerdown', it._down);
    }
    this.host.innerHTML = '';
    this.items = [];
  }
}

/* Un reparto por defecto para quien nunca puso stickers: disperso, con rotación
   ligera, lejos del nombre y del avatar. */
function holoDefaultStickers() {
  return [
    { w:'¡sí!',  f:'impact', c:'fresa', x:0.17, y:0.30, r:-9 },
    { w:'top',   f:'ital',   c:'limon', x:0.60, y:0.80, r:6 },
  ];
}
