/* Campaign OS — Credencial Thinky (tarjeta holográfica)
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde onclick y solo resuelven contra el scope global.

   Cuatro ideas sostienen el efecto:

     UNA SOLA FORMA DE ENTRADA. Puntero y giroscopio son señales distintas, así
     que ambas se normalizan al mismo {x,y} en -1..1 antes de que nadie las lea.
     Todo lo demás — inclinación, foil, brillo — sale de ese par.

     EL FOIL VA ATRASADO. El laminado real tiene masa: la superficie ALCANZA a
     la tarjeta en vez de moverse con ella. Dos seguidores a rigideces distintas
     es lo que convierte un degradado que persigue al cursor en un material.

     EL COLOR IMPRESO ES DEL USUARIO. Aquí sí cambia (es lo personalizable), y
     el foil encima es una capa aparte: se elige el material y la tinta por
     separado, como laminar la misma credencial con distintos acabados.

     LOS MATERIALES SON DATOS. Cada material son tres capas genéricas cuya
     pintura completa — imagen, escala, velocidad, blend, filtro, opacidad —
     viene de custom properties. El CSS nunca sabe qué material está montado,
     así que agregar uno es agregar un objeto al arreglo. */

// ============================================================
// TEJIDOS (SVG inline: sin requests extra, no pueden 404)
// ============================================================

/* Destellos de 4 puntas. Se dibuja DOS veces por material con offsets algo
   distintos: una copia sola es un campo estático; dos batiendo entre sí es lo
   que titila. */
const HOLO_GLITTER = `url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27100%27%20height%3D%27100%27%20fill%3D%27%23fff%27%3E%3Cpath%20d%3D%27M34%2015.3L35.7%2019L34%2023.3L33.3%2019Z%27%20opacity%3D%270.54%27%20transform%3D%27rotate%2848%2034%2019%29%27%2F%3E%3Cpath%20d%3D%27M38%207.5L39.3%2011L38%2014.7L37.1%2011Z%27%20opacity%3D%270.52%27%20transform%3D%27rotate%2839%2038%2011%29%27%2F%3E%3Cpath%20d%3D%27M12%2010.6L13.2%2014L12%2017.4L11.1%2014Z%27%20opacity%3D%270.91%27%20transform%3D%27rotate%2811%2012%2014%29%27%2F%3E%3Cpath%20d%3D%27M26%2056.4L27.1%2061L26%2066.1L24.2%2061Z%27%20opacity%3D%270.79%27%20transform%3D%27rotate%2836%2026%2061%29%27%2F%3E%3Cpath%20d%3D%27M92%205.5L93.3%2010L92%2014.7L90.5%2010Z%27%20opacity%3D%270.64%27%20transform%3D%27rotate%2813%2092%2010%29%27%2F%3E%3Cpath%20d%3D%27M16%2028.7L17.7%2033L16%2037.6L15.0%2033Z%27%20opacity%3D%270.59%27%20transform%3D%27rotate%2852%2016%2033%29%27%2F%3E%3Cpath%20d%3D%27M62%2035.0L63.3%2039L62%2042.5L61.1%2039Z%27%20opacity%3D%270.53%27%20transform%3D%27rotate%285%2062%2039%29%27%2F%3E%3Cpath%20d%3D%27M24%2062.5L25.1%2066L24%2069.3L23.1%2066Z%27%20opacity%3D%270.66%27%20transform%3D%27rotate%2853%2024%2066%29%27%2F%3E%3Cpath%20d%3D%27M46%2028.0L47.2%2032L46%2036.8L44.6%2032Z%27%20opacity%3D%270.85%27%20transform%3D%27rotate%2822%2046%2032%29%27%2F%3E%3Cpath%20d%3D%27M57%2047.6L57.9%2052L57%2056.9L55.2%2052Z%27%20opacity%3D%270.86%27%20transform%3D%27rotate%2826%2057%2052%29%27%2F%3E%3Cpath%20d%3D%27M92%2013.0L93.3%2016L92%2019.8L91.2%2016Z%27%20opacity%3D%270.88%27%20transform%3D%27rotate%2814%2092%2016%29%27%2F%3E%3Cpath%20d%3D%27M49%205.4L50.3%209L49%2013.5L47.8%209Z%27%20opacity%3D%270.88%27%20transform%3D%27rotate%2852%2049%209%29%27%2F%3E%3Cpath%20d%3D%27M83%2029.5L84.3%2034L83%2037.8L81.8%2034Z%27%20opacity%3D%270.80%27%20transform%3D%27rotate%2852%2083%2034%29%27%2F%3E%3Cpath%20d%3D%27M46%2075.1L47.6%2080L46%2084.8L44.7%2080Z%27%20opacity%3D%270.74%27%20transform%3D%27rotate%2860%2046%2080%29%27%2F%3E%3C%2Fsvg%3E")`;

/* Campo de estrellas denso para los materiales espaciales. */
const HOLO_STARS = `url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27100%27%20height%3D%27100%27%20fill%3D%27%23fff%27%3E%3Ccircle%20cx%3D%2768%27%20cy%3D%2778%27%20r%3D%270.6%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2726%27%20cy%3D%2726%27%20r%3D%270.5%27%20opacity%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2711%27%20cy%3D%2733%27%20r%3D%270.5%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2720%27%20cy%3D%277%27%20r%3D%270.4%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2739%27%20cy%3D%2773%27%20r%3D%270.7%27%20opacity%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2710%27%20cy%3D%2773%27%20r%3D%270.7%27%20opacity%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2766%27%20cy%3D%2730%27%20r%3D%270.8%27%20opacity%3D%270.8%27%2F%3E%3Ccircle%20cx%3D%2779%27%20cy%3D%2795%27%20r%3D%270.4%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2773%27%20cy%3D%2780%27%20r%3D%270.5%27%20opacity%3D%270.4%27%2F%3E%3Ccircle%20cx%3D%2763%27%20cy%3D%2710%27%20r%3D%270.7%27%20opacity%3D%270.3%27%2F%3E%3Ccircle%20cx%3D%2745%27%20cy%3D%2748%27%20r%3D%270.4%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2750%27%20cy%3D%2737%27%20r%3D%270.7%27%20opacity%3D%270.8%27%2F%3E%3Ccircle%20cx%3D%2789%27%20cy%3D%2724%27%20r%3D%270.3%27%20opacity%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2728%27%20cy%3D%2740%27%20r%3D%270.7%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2769%27%20cy%3D%2775%27%20r%3D%270.4%27%20opacity%3D%270.3%27%2F%3E%3Ccircle%20cx%3D%2751%27%20cy%3D%2766%27%20r%3D%270.3%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2747%27%20cy%3D%2711%27%20r%3D%270.6%27%20opacity%3D%270.8%27%2F%3E%3Ccircle%20cx%3D%2768%27%20cy%3D%277%27%20r%3D%270.6%27%20opacity%3D%270.7%27%2F%3E%3Ccircle%20cx%3D%271%27%20cy%3D%2738%27%20r%3D%270.6%27%20opacity%3D%270.9%27%2F%3E%3Ccircle%20cx%3D%2793%27%20cy%3D%2757%27%20r%3D%270.6%27%20opacity%3D%270.9%27%2F%3E%3Ccircle%20cx%3D%2721%27%20cy%3D%2751%27%20r%3D%270.3%27%20opacity%3D%270.8%27%2F%3E%3Ccircle%20cx%3D%2765%27%20cy%3D%2721%27%20r%3D%270.4%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2726%27%20cy%3D%2788%27%20r%3D%270.7%27%20opacity%3D%270.9%27%2F%3E%3Ccircle%20cx%3D%2715%27%20cy%3D%2746%27%20r%3D%270.8%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2732%27%20cy%3D%2737%27%20r%3D%270.5%27%20opacity%3D%270.8%27%2F%3E%3Ccircle%20cx%3D%2797%27%20cy%3D%279%27%20r%3D%270.6%27%20opacity%3D%270.6%27%2F%3E%3Ccircle%20cx%3D%2737%27%20cy%3D%2759%27%20r%3D%270.5%27%20opacity%3D%270.5%27%2F%3E%3Ccircle%20cx%3D%2717%27%20cy%3D%2766%27%20r%3D%270.6%27%20opacity%3D%270.7%27%2F%3E%3Ccircle%20cx%3D%2751%27%20cy%3D%2787%27%20r%3D%271.6%27%20opacity%3D%27.95%27%2F%3E%3Ccircle%20cx%3D%275%27%20cy%3D%2768%27%20r%3D%271.6%27%20opacity%3D%27.95%27%2F%3E%3Ccircle%20cx%3D%2725%27%20cy%3D%2773%27%20r%3D%271.8%27%20opacity%3D%27.95%27%2F%3E%3Ccircle%20cx%3D%2728%27%20cy%3D%2715%27%20r%3D%271.4%27%20opacity%3D%27.95%27%2F%3E%3Ccircle%20cx%3D%2759%27%20cy%3D%2744%27%20r%3D%271.3%27%20opacity%3D%27.95%27%2F%3E%3Ccircle%20cx%3D%2745%27%20cy%3D%2755%27%20r%3D%271.6%27%20opacity%3D%27.95%27%2F%3E%3C%2Fsvg%3E")`;

/* Ruido fino monocromo: rompe los materiales más planos para que se lean como
   superficie impresa y no como degradado limpio. */
const HOLO_GRAIN = `url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27120%27%20height%3D%27120%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%27.85%27%20numOctaves%3D%273%27%20stitchTiles%3D%27stitch%27%2F%3E%3CfeColorMatrix%20type%3D%27saturate%27%20values%3D%270%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27120%27%20height%3D%27120%27%20filter%3D%27url%28%23n%29%27%20opacity%3D%27.4%27%2F%3E%3C%2Fsvg%3E")`;

/* Los seis tonos espectrales del foil. Valor y saturación altos: el filtro de
   cada capa los machaca, así que partir de algo apagado no deja nada que
   machacar. */
const HOLO_SUNPILLARS = [
  'hsl(2, 100%, 73%)',
  'hsl(53, 100%, 69%)',
  'hsl(93, 100%, 69%)',
  'hsl(176, 100%, 76%)',
  'hsl(228, 100%, 74%)',
  'hsl(283, 100%, 73%)',
];
const _HS = HOLO_SUNPILLARS;

/* Rampa espectral repetida a un ángulo y paso dados. El caballo de batalla:
   casi todos los materiales son esto más una o dos capas. */
function _holoRainbow(angle, space, hues) {
  const h = hues || _HS;
  const stops = h
    .map((c, i) => `${c} calc(${space} * ${i + 1})`)
    .concat(`${h[0]} calc(${space} * ${h.length + 1})`)
    .join(', ');
  return `repeating-linear-gradient(${angle}, ${stops})`;
}

// ============================================================
// MATERIALES
// ============================================================
/* Ocho TÉCNICAS distintas — campo de destellos, cónica, rampas grises cruzadas,
   pila multiescala — no un degradado en ocho colores.

   Campos de cada capa:
     img      una o varias imágenes, pintadas de atrás hacia adelante
     size     background-size; escalas distintas entre capas = profundidad
     rate     cuánto se desliza por unidad de inclinación. NEGATIVO la corre
              contra el puntero, que es como dos capas del mismo material se
              separan al girar
     bgBlend  background-blend-mode cuando img trae varias imágenes
     blend    mix-blend-mode contra la tarjeta de abajo
     filter   la machacada: contraste arriba, saturación abajo, es lo que
              convierte una rampa suave en bandas duras
     base     opacidad en reposo (de frente)
     gain     cuánta opacidad SUMA al girar del todo. Negativo apaga la capa,
              que es como un material se pasa la superficie entre sus capas en
              vez de apilarlas todas */
const HOLO_FOILS = [
  {
    // El default. Tres capas y no una: una sola hoja desaturada se lee como
    // brillo, y un holo real tiene COLOR — bandas que puedes nombrar, moviéndose
    // unas contra otras según el ángulo.
    key: 'holo', label: 'Holo',
    layers: [
      // gain moderado a propósito: a .6 la hoja principal lavaba la tinta hasta
      // dejarla casi blanca al inclinar del todo, y la credencial perdía el
      // color que su dueño eligió. El punto es que el foil ATRAPE luz sobre la
      // tinta, no que la sustituya.
      { img: _holoRainbow('10deg', '8%'), size: '380% 380%', rate: 1,
        blend: 'overlay', filter: 'brightness(1.08) contrast(2.3) saturate(1.5)', base: .24, gain: .42 },
      // Segunda hoja en ángulo cruzado, paso más grueso y corriendo AL REVÉS.
      // Donde no coinciden baten entre sí: eso da la calidad aceitosa que una
      // sola hoja no puede — una hoja solo se desliza, dos interfieren.
      { img: _holoRainbow('104deg', '13%'), size: '300% 300%', rate: -.7,
        blend: 'color-dodge', filter: 'brightness(.82) contrast(2) saturate(1.7)', base: .14, gain: .34 },
      // Líneas finas de difracción. El foil real es iridiscente PORQUE está
      // físicamente estriado; sin estructura el color se lee como filtro encima
      // y no como luz saliendo de una superficie.
      { img: 'repeating-linear-gradient(96deg, rgba(255,255,255,.5) 0px, rgba(255,255,255,0) 2px, rgba(0,0,0,.16) 3px, rgba(255,255,255,0) 5px)',
        size: 'auto', rate: 1.8, blend: 'overlay', filter: 'contrast(1.3)', base: .1, gain: .26 },
    ],
    parallax: .26, bloom: .55, glare: .55,
  },
  {
    // Casi sin degradado: el material ES el campo de destellos, y las dos copias
    // desfasadas son lo que lo hace titilar en vez de quedarse quieto.
    key: 'glitter', label: 'Glitter',
    layers: [
      { img: `${HOLO_GLITTER}, ${HOLO_GLITTER}`, size: '26% 26%, 19% 19%', rate: .5,
        bgBlend: 'soft-light', blend: 'color-dodge',
        filter: 'brightness(1.1) contrast(1.6) saturate(1.2)', base: .3, gain: .55 },
      { img: _holoRainbow('122deg', '13%'), size: '320% 320%', rate: 1.4,
        blend: 'overlay', filter: 'brightness(1) contrast(2) saturate(.8)', base: .16, gain: .34 },
    ],
    parallax: .3, bloom: .6, glare: .6,
  },
  {
    // Dos rampas grises cruzadas a ±45°. El truco es `exclusion` entre ellas:
    // donde coinciden se cancelan hacia negro, donde discrepan se encienden, así
    // que los cruces destellan sin que la capa tenga color alguno.
    key: 'prism', label: 'Prisma',
    layers: [
      { img: 'repeating-linear-gradient(45deg, hsl(0,0%,10%) 0%, hsl(0,0%,22%) 1.4%, hsl(0,0%,42%) 2.6%, hsl(0,0%,50%) 3.4%, hsl(0,0%,32%) 4.6%, hsl(0,0%,8%) 6%), repeating-linear-gradient(-45deg, hsl(0,0%,10%) 0%, hsl(0,0%,24%) 1.6%, hsl(0,0%,46%) 3%, hsl(0,0%,52%) 3.8%, hsl(0,0%,28%) 5.2%, hsl(0,0%,8%) 6.6%)',
        size: '210% 210%, 190% 190%', rate: 1.5, bgBlend: 'exclusion', blend: 'color-dodge',
        filter: 'brightness(.62) contrast(2.2) saturate(1.6)', base: .3, gain: .5 },
      { img: _holoRainbow('55deg', '16%'), size: '400% 100%', rate: -2.5,
        blend: 'color-dodge', filter: 'brightness(.6) contrast(2.4) saturate(1.7)', base: .2, gain: .4 },
    ],
    parallax: .24, bloom: .55, glare: .52,
  },
  {
    // Una cónica se lee completamente distinto a una rampa lineal: el espectro
    // envuelve un punto en vez de cruzar, así que inclinar GIRA el color en vez
    // de deslizarlo.
    key: 'conic', label: 'Cónico',
    layers: [
      { img: `conic-gradient(from var(--spin, 0deg) at 50% 50%, ${_HS[3]}, ${_HS[4]}, ${_HS[5]}, ${_HS[0]}, ${_HS[1]}, ${_HS[2]}, ${_HS[3]})`,
        size: 'cover', rate: 0, blend: 'color-dodge',
        filter: 'brightness(.55) contrast(1.5) saturate(2.4)', base: .22, gain: .42 },
      { img: `${HOLO_GLITTER}, ${HOLO_GLITTER}`, size: '24% 24%, 17% 17%', rate: .7,
        bgBlend: 'hard-light', blend: 'color-dodge', filter: 'brightness(1.05) contrast(1.5)', base: .26, gain: .5 },
    ],
    parallax: .22, bloom: .5, glare: .58,
  },
  {
    // Tres planos de estrellas a escalas y velocidades distintas. La diferencia
    // de velocidades ES el efecto: las cercanas barren, las lejanas apenas se
    // mueven, y la tarjeta gana profundidad real.
    key: 'cosmos', label: 'Cosmos',
    layers: [
      { img: `${HOLO_STARS}, ${_holoRainbow('82deg', '8%')}`, size: '38% 38%, 420% 900%', rate: .35,
        bgBlend: 'color-burn', blend: 'color-dodge',
        filter: 'brightness(1) contrast(1.6) saturate(.9)', base: .28, gain: .45 },
      { img: HOLO_STARS, size: '22% 22%', rate: 1.6, blend: 'overlay',
        filter: 'brightness(1.3) contrast(1.7)', base: .2, gain: .4 },
      { img: HOLO_STARS, size: '13% 13%', rate: 2.6, blend: 'overlay',
        filter: 'brightness(1.1) contrast(1.5)', base: .12, gain: .3 },
    ],
    parallax: .34, bloom: .55, glare: .46,
  },
  {
    // Un degradado muy alto y muy angosto (200% × 700%) se lee como VETA
    // vertical en vez de como campo.
    key: 'refractor', label: 'Refractor',
    layers: [
      { img: _holoRainbow('125deg', '7%', ['hsl(176,100%,76%)','hsl(196,100%,78%)','hsl(214,100%,76%)','hsl(228,100%,74%)','hsl(200,100%,80%)','hsl(168,100%,78%)']),
        size: '200% 700%', rate: 1.2, blend: 'color-dodge',
        filter: 'brightness(.7) contrast(1.8) saturate(1.9)', base: .22, gain: .4 },
      { img: 'repeating-linear-gradient(100deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 1.2%, rgba(0,0,0,.25) 2.2%, rgba(255,255,255,0) 3.4%)',
        size: '300% 100%', rate: -.8, blend: 'hard-light',
        filter: 'brightness(1.05) contrast(1.4)', base: .18, gain: .36 },
    ],
    parallax: .18, bloom: .55, glare: .64,
  },
  {
    // `exclusion` invierte lo que hay debajo, así que este se va FRÍO y algo
    // negativo en los extremos en vez de simplemente aclarar. Pero invierte
    // también la tinta, por eso la opacidad se mantiene baja.
    key: 'ice', label: 'Hielo',
    layers: [
      { img: _holoRainbow('115deg', '10%', ['hsl(190,90%,80%)','hsl(210,85%,82%)','hsl(230,80%,80%)','hsl(250,70%,82%)','hsl(200,90%,85%)','hsl(175,80%,82%)']),
        size: '300% 300%', rate: 1.1, blend: 'exclusion',
        filter: 'brightness(.8) contrast(1.6) saturate(1.3)', base: .12, gain: .22 },
      { img: `${HOLO_GRAIN}, ${HOLO_GLITTER}`, size: '38% 38%, 22% 22%', rate: .6,
        bgBlend: 'overlay', blend: 'hard-light', filter: 'brightness(1.1) contrast(1.3)', base: .18, gain: .34 },
    ],
    parallax: .2, bloom: .5, glare: .62,
  },
  {
    // El sobrio: paso fino casi neutro que apenas se mueve. El único que favorece
    // al contenido en vez de competir con él, y el que hay que elegir si la
    // credencial tiene que LEERSE.
    key: 'brushed', label: 'Mate',
    layers: [
      { img: _holoRainbow('94deg', '4%', ['hsl(30,40%,86%)','hsl(200,30%,88%)','hsl(260,25%,87%)','hsl(180,25%,89%)','hsl(40,30%,88%)','hsl(220,25%,87%)']),
        size: '260% 260%', rate: .8, blend: 'soft-light',
        filter: 'brightness(1.02) contrast(1.7) saturate(.55)', base: .34, gain: .3 },
      { img: HOLO_GRAIN, size: '34% 34%', rate: .3, blend: 'overlay',
        filter: 'brightness(1) contrast(1.1)', base: .14, gain: .16 },
    ],
    parallax: .13, bloom: .32, glare: .34,
  },
];
const HOLO_FOIL_BY_KEY = Object.fromEntries(HOLO_FOILS.map(f => [f.key, f]));
function holoFoil(key) { return HOLO_FOIL_BY_KEY[key] || HOLO_FOILS[0]; }

/* Tintas de la credencial.
   TIENEN QUE SER DE VALOR MEDIO, no pasteles casi blancos. Casi todas las capas
   componen con `overlay` o `color-dodge`, y ambas conservan la luminosidad del
   fondo: sobre una impresión casi blanca no queda nada que teñir y el foil
   desaparece. Con la tinta en torno al 65-75% de luminosidad las bandas tienen
   dónde caer y la tipografía oscura sigue leyéndose encima. */
/* `hold` es la PASADA DE TINTA: una reimpresión del color por ENCIMA del foil,
   compuesta con `color`, que toma matiz y croma de la tinta y luminancia del
   foil. Sin ella todas las tintas claras convergían al mismo pastel lavado al
   inclinar del todo — el foil se comía el color que el dueño eligió y ocho
   credenciales distintas se volvían la misma.
   En las tintas oscuras va en 0 a propósito: ahí el color YA sobrevive solo, y
   la pasada aplanaría el arcoíris a un solo matiz, que es justo lo que hace
   interesantes a esas dos. */
const HOLO_TINTS = [
  { key:'rosa',    label:'Rosa',    grad:'linear-gradient(115deg,#ffb3d3,#f78bb8,#e96fa6,#ffa1c6)', ink:'dark',  hold:.55 },
  { key:'noche',   label:'Noche',   grad:'linear-gradient(115deg,#241b3a,#3b2b63,#1e1b3c,#2c2350)', ink:'light', hold:0   },
  { key:'azul',    label:'Azul',    grad:'linear-gradient(115deg,#a8c8ff,#7ea6f7,#6b8fe8,#9dc0ff)', ink:'dark',  hold:.55 },
  { key:'menta',   label:'Menta',   grad:'linear-gradient(115deg,#9fe6c0,#71d6a4,#5cc794,#96e3ba)', ink:'dark',  hold:.55 },
  { key:'oro',     label:'Oro',     grad:'linear-gradient(115deg,#ffd79a,#f7bc6e,#eda94f,#ffd08c)', ink:'dark',  hold:.55 },
  { key:'lavanda', label:'Lavanda', grad:'linear-gradient(115deg,#cbb2f7,#ab8ceb,#9576e0,#c3a8f5)', ink:'dark',  hold:.55 },
  { key:'grafito', label:'Grafito', grad:'linear-gradient(115deg,#2b2b33,#3d3d47,#25252c,#33333d)', ink:'light', hold:0   },
  { key:'coral',   label:'Coral',   grad:'linear-gradient(115deg,#ffb69c,#ff9578,#f57c5e,#ffab8e)', ink:'dark',  hold:.55 },
];
const HOLO_TINT_BY_KEY = Object.fromEntries(HOLO_TINTS.map(t => [t.key, t]));
function holoTint(key) { return HOLO_TINT_BY_KEY[key] || HOLO_TINTS[0]; }

// ============================================================
// MATEMÁTICAS
// ============================================================

/* Inclinación máxima en el borde. Chica: pasando ~16° la distorsión de
   perspectiva se lee como doblez y no como giro. */
const HOLO_MAX_TILT = 14;
/* Cuántas ranuras de capa provee el CSS. Un material con menos deja el resto
   vacío. */
const HOLO_LAYER_SLOTS = 3;

/* Remapea un valor de un rango a otro. Casi todo lo derivado pasa por aquí, que
   es lo que los mantiene de acuerdo entre sí. */
function _holoAdjust(v, fromMin, fromMax, toMin, toMax) {
  return toMin + ((toMax - toMin) * (v - fromMin)) / (fromMax - fromMin);
}
function _holoClamp(v, min, max) {
  return Math.min(Math.max(v, min === undefined ? -1 : min), max === undefined ? 1 : max);
}

/* Seguidor amortiguado.
   No es un resorte con rebote — es un ease exponencial hacia un objetivo, por
   frame. El rebote está mal aquí: una tarjeta asentándose debe verse como peso,
   no como brinco, y una tarjeta que brinca se lee como animación web y no como
   objeto.
   `stiffness` es la fracción de distancia restante que cubre cada frame, así que
   número más bajo = más pesado. */
class HoloFollow {
  constructor(stiffness) {
    this.stiffness = stiffness;
    this.value = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    /* Cuánto se movió en el último frame. La posición sola no distingue entre
       cruzar despacio la tarjeta y pasarle un latigazo, y un material que
       responde igual a ambos no se lee como físico. */
    this.velocity = { x: 0, y: 0 };
    /* Magnitud suavizada de esa velocidad. Los deltas crudos son lo bastante
       nerviosos como para hacer parpadear cualquier cosa que los use. */
    this.speed = 0;
  }
  step() {
    const px = this.value.x, py = this.value.y;
    this.value.x += (this.target.x - this.value.x) * this.stiffness;
    this.value.y += (this.target.y - this.value.y) * this.stiffness;
    this.velocity.x = this.value.x - px;
    this.velocity.y = this.value.y - py;
    // Suavizado asimétrico: sube rápido para que un flick registre en el frame
    // en que pasa, baja lento para que la veta que deja se apague en vez de
    // cortarse en seco. Un filtro simétrico da uno u otro, nunca ambos.
    const raw = Math.min(1, Math.hypot(this.velocity.x, this.velocity.y) * 14);
    this.speed += (raw - this.speed) * (raw > this.speed ? .45 : .06);
  }
  /* True cuando efectivamente llegó, para poder cortar el rAF en vez de quemar
     frames en movimiento sub-pixel para siempre. */
  get settled() {
    return Math.abs(this.target.x - this.value.x) < .0006 &&
           Math.abs(this.target.y - this.value.y) < .0006 &&
           this.speed < .004;
  }
}

/* Sobrepaso de un solo disparo, para el momento en que el puntero se va.
   Los objetos reales no frenan por el camino más corto: se pasan un poco sobre
   el eje en que los empujaste y regresan. NO es un resorte en el seguidor
   principal a propósito: un resorte resuena en cada movimiento. Este se dispara
   una vez, escalado por la velocidad que llevabas, y decae a nada. */
class HoloKick {
  constructor() { this.amount = { x: 0, y: 0 }; this.life = 0; }
  fire(v, gain) {
    const mag = Math.hypot(v.x, v.y);
    // Debajo del umbral no hubo lanzamiento — solo un puntero saliendo de la
    // caja — y meter rebote ahí se ve como tic nervioso.
    if (mag < .002) return;
    const g = gain === undefined ? 2.6 : gain;
    this.amount = { x: v.x * g, y: v.y * g };
    this.life = 1;
  }
  step() {
    if (this.life <= 0) return { x: 0, y: 0 };
    this.life = Math.max(0, this.life - .035);
    // Media onda seno sobre la vida: sube al sobrepaso y regresa por cero.
    // Terminar exactamente en cero es el punto — una oscilación decayente
    // dejaría la tarjeta fraccionalmente chueca.
    const e = Math.sin(this.life * Math.PI) * this.life;
    return { x: this.amount.x * e, y: this.amount.y * e };
  }
  get active() { return this.life > 0; }
}

/* Orientación del dispositivo, puesta a cero en la primera lectura.
   ESTE ES EL DETALLE QUE HACE USABLE EL GIROSCOPIO. La orientación absoluta no
   sirve porque nadie sostiene el teléfono plano — beta anda en 40-70° para una
   persona mirando la pantalla, así que sin cero la tarjeta se clava en una
   esquina y nunca vuelve. Tomar la primera lectura como origen hace que
   responda a cuánto giraste DESDE DONDE YA ESTABAS. */
class HoloOrientation {
  constructor() {
    this.base = null;
    /* Grados que mapean al rango completo. Poco, porque el movimiento de muñeca
       es poco: a 45° tendrías que voltear el teléfono. */
    this.range = 22;
  }
  read(e) {
    const beta = e.beta, gamma = e.gamma;
    if (beta == null || gamma == null) return null;
    if (!this.base) { this.base = { beta, gamma }; return { x: 0, y: 0 }; }
    return {
      x: _holoClamp((gamma - this.base.gamma) / this.range),
      y: _holoClamp((beta - this.base.beta) / this.range),
    };
  }
  reset() { this.base = null; }
}

/* Posición del puntero dentro de un elemento, normalizada a -1..1 desde su
   centro. */
function _holoFromPointer(rect, cx, cy) {
  return {
    x: _holoClamp(((cx - rect.left) / rect.width) * 2 - 1),
    y: _holoClamp(((cy - rect.top) / rect.height) * 2 - 1),
  };
}

// ============================================================
// PINTADO
// ============================================================

/* Variables estáticas del material: solo cambian cuando cambia el preset, y
   reescribir dos docenas de propiedades por frame sería puro desperdicio.
   Las ranuras sin usar se BORRAN explícitamente: pasar de un material de 3 capas
   a uno de 1 tiene que LIMPIAR las viejas, o las capas 2 y 3 del anterior se
   quedan pintadas debajo y cada preset después del primero es una mezcla. */
function applyHoloFoil(card, foil, tint) {
  const s = card.style;
  s.setProperty('--body-grad', tint.grad);
  s.setProperty('--tint-hold', String(tint.hold === undefined ? .5 : tint.hold));
  s.setProperty('--glare-o', String(foil.glare));
  card.dataset.ink = tint.ink;

  for (let i = 0; i < HOLO_LAYER_SLOTS; i++) {
    const n = `--l${i + 1}`;
    const L = foil.layers[i];
    if (!L) {
      // `none` y no cadena vacía: un background-image vacío es inválido y cae al
      // valor inicial de la propiedad, que en contexto apilado puede resolver a
      // la declaración anterior.
      s.setProperty(`${n}-img`, 'none');
      s.setProperty(`${n}-o`, '0');
      continue;
    }
    s.setProperty(`${n}-img`, L.img);
    s.setProperty(`${n}-size`, L.size);
    s.setProperty(`${n}-bgblend`, L.bgBlend || 'normal');
    s.setProperty(`${n}-blend`, L.blend);
    s.setProperty(`${n}-filter`, L.filter);
  }
}

/* Un frame de variables CSS sobre la tarjeta.
   `tilt` mueve todo lo atado a la geometría de la tarjeta (rotación, brillo) y
   `sheet` mueve el foil, que va atrasado respecto a ella. */
function applyHoloFrame(card, tilt, sheet, foil, motion) {
  const x = tilt.x, y = tilt.y;
  const s = card.style;
  const m = motion || {};

  s.setProperty('--rx', `${(-y * HOLO_MAX_TILT).toFixed(2)}deg`);
  s.setProperty('--ry', `${(x * HOLO_MAX_TILT).toFixed(2)}deg`);

  // EL RANGO COMPRIMIDO. El foil recorre una fracción de la distancia del
  // puntero: una hoja que sigue 1:1 se lee como degradado persiguiendo un
  // cursor, una que apenas se mueve se lee como capa POSADA encima de la
  // impresión. Es el número más importante del efecto.
  const p = foil.parallax;

  // CADA CAPA A SU PROPIA VELOCIDAD, y algunas contra el puntero. Dos capas
  // viajando juntas son solo una capa más gruesa; el desacuerdo entre ellas es
  // lo que se lee como profundidad y como destello.
  for (let i = 0; i < HOLO_LAYER_SLOTS; i++) {
    const L = foil.layers[i];
    if (!L) continue;
    const t = p * L.rate;
    const n = `--l${i + 1}`;
    s.setProperty(`${n}-x`, `${_holoAdjust(sheet.x, -1, 1, 50 - t * 100, 50 + t * 100).toFixed(1)}%`);
    s.setProperty(`${n}-y`, `${_holoAdjust(sheet.y, -1, 1, 50 - t * 100, 50 + t * 100).toFixed(1)}%`);
  }

  // CUÁN LEJOS DE ESTAR DE FRENTE, 0..1 — y todo el presupuesto de decoración de
  // la tarjeta. Es una DISTANCIA, así que es simétrica: inclinar a izquierda y a
  // derecha da lo mismo, y la decoración sube igual hacia cualquier lado.
  const off = Math.min(1, Math.hypot(x, y));
  s.setProperty('--off', off.toFixed(3));

  // El sello de seguridad solo aparece EN ÁNGULO. No es un fade desde cero — es
  // un UMBRAL. Debajo de HOLO_FROM la credencial está perfectamente limpia, y
  // pasando el umbral el sello entra sobre el recorrido restante. Ese hueco es
  // el punto: una decoración siempre algo visible es solo decoración; una que
  // está ausente y luego LLEGA se lee como algo que la superficie escondía hasta
  // que le pegó la luz.
  // Va sobre `sheet` y no sobre `tilt`: la hoja es el seguidor pesado, así que
  // el sello hereda su retraso gratis y nunca puede aparecer en un solo frame.
  const softOff = Math.min(1, Math.hypot(sheet.x, sheet.y));
  // Por encima del máximo de la deriva en reposo (hypot(.28,.2) ≈ .344). A .34
  // el sello asomaba solo, y sin giro se leía como suciedad sobre la impresión
  // en vez de como algo que aparece cuando la giras.
  const SEAL_FROM = .46;
  const t = Math.max(0, Math.min(1, (softOff - SEAL_FROM) / (1 - SEAL_FROM)));
  // Smoothstep en vez de rampa lineal, para que entre suave en el umbral en vez
  // de encenderse con una esquina visible.
  s.setProperty('--reveal', (t * t * (3 - 2 * t) * .9).toFixed(3));

  // Y SOLO DONDE ESTÁ LA LUZ. Revelar todo el campo de golpe se ve mal: inclinas
  // el borde izquierdo hacia ti y el sello aparece también del lado que está
  // girado en CONTRA y no debería estar atrapando nada. Un barniz solo se ve
  // donde de verdad le pega luz, así que la capa va enmascarada a una banda
  // suave que sigue la inclinación.
  const ang = Math.atan2(sheet.y, sheet.x) * (180 / Math.PI);
  s.setProperty('--reveal-angle', `${(ang + 90).toFixed(0)}deg`);
  s.setProperty('--reveal-x', `${_holoAdjust(sheet.x, -1, 1, 78, 22).toFixed(1)}%`);
  s.setProperty('--reveal-y', `${_holoAdjust(sheet.y, -1, 1, 78, 22).toFixed(1)}%`);

  // EL PUNTO DULCE. El foil real tiene un ángulo donde toda la superficie se
  // alinea y se pone brillante, y buscarlo es casi toda la razón por la que uno
  // sigue girando una tarjeta. Va descentrado a propósito: el centro es donde la
  // tarjeta descansa, y un brillo que te dan gratis no vale la pena encontrarlo.
  // La caída es deliberadamente cerrada: una ancha solo aclara un lado, una
  // angosta hace que pases de largo, lo notes, y vuelvas.
  const SPOT = { x: -.42, y: -.36 };
  const dSpot = Math.hypot(sheet.x - SPOT.x, sheet.y - SPOT.y);
  const hit = Math.max(0, 1 - dSpot / .34);
  const spotBloom = hit * hit * (3 - 2 * hit);
  s.setProperty('--spot', spotBloom.toFixed(3));

  // Ciclo de reposo muy lento, para que el material esté vivo mientras nadie
  // toca la tarjeta. Dos periodos inconmensurables, así nunca se ve el loop.
  const time = m.time || 0;
  const breath = .5 + .5 * Math.sin(time * .5) * Math.cos(time * .31);
  s.setProperty('--breath', breath.toFixed(3));

  // Opacidad por capa. `base` es lo que muestra de frente y `gain` lo que SUMA
  // la inclinación — gain puede ser negativo, lo que apaga una capa al girar
  // para que el material se pase la superficie entre sus capas.
  for (let i = 0; i < HOLO_LAYER_SLOTS; i++) {
    const L = foil.layers[i];
    if (!L) continue;
    let o = Math.max(0, L.base + off * L.gain * (foil.bloom / .5));
    // El punto dulce levanta TODAS las capas a la vez — esa simultaneidad es lo
    // que se lee como el material alineándose y no como una hoja aclarando.
    o *= 1 + spotBloom * .85;
    o *= .94 + breath * .06;
    s.setProperty(`--l${i + 1}-o`, Math.min(1, o).toFixed(3));
  }

  // El material cónico gira en vez de deslizarse: su espectro envuelve un punto,
  // así que el equivalente a deslizar una rampa lineal es mover el ángulo de
  // inicio. Inofensivo para los demás, que nunca lo leen.
  s.setProperty('--spin', `${(sheet.x * 90 + sheet.y * 45).toFixed(1)}deg`);

  // El brillo sigue al puntero DIRECTO, sin retraso: un reflejo es simplemente
  // donde está la luz, así que retrasarlo se vería como error.
  s.setProperty('--gx', `${_holoAdjust(x, -1, 1, 12, 88).toFixed(1)}%`);
  s.setProperty('--gy', `${_holoAdjust(y, -1, 1, 12, 88).toFixed(1)}%`);

  // El avatar deriva muy poco contra la cara de la tarjeta, para que los dos
  // planos se lean separados. Un cuarto del recorrido del foil: suficiente para
  // separarlos, no tanto como para verse despegado.
  s.setProperty('--tile-x', `${_holoAdjust(sheet.x, -1, 1, 58, 42).toFixed(1)}%`);
  // Y su tono viaja conforme giras, así que el recuadro recorre un rango del
  // espectro en vez de aterrizar en un color fijo — que es lo que separa
  // "holográfico" de "teñido".
  const FLIP_FROM = .52;
  const flip = Math.max(0, Math.min(1, (softOff - FLIP_FROM) / (1 - FLIP_FROM)));
  s.setProperty('--tile-flip', flip.toFixed(3));
  s.setProperty('--tile-hue', `${(flip * 55).toFixed(0)}deg`);

  // LA VETA. Un pase rápido embarra el reflejo en la dirección del movimiento;
  // uno lento lo deja redondo. Es la lectura más clara de velocidad, y cuesta un
  // ángulo de degradado más un largo.
  const speed = m.speed || 0;
  const vel = m.velocity || { x: 0, y: 0 };
  s.setProperty('--speed', speed.toFixed(3));
  if (Math.hypot(vel.x, vel.y) > .0001) {
    s.setProperty('--smear-angle', `${(Math.atan2(vel.y, vel.x) * (180 / Math.PI)).toFixed(0)}deg`);
  }
  s.setProperty('--smear', (Math.min(1, speed) * .8).toFixed(3));

  // RELIEVE. La tipografía toma su luz del lado opuesto a la sombra, ambas
  // movidas por la inclinación, así que las letras atrapan luz como si
  // estuvieran prensadas en el cartón y no impresas encima. Menos de un pixel:
  // un relieve que puedes medir es un bisel.
  s.setProperty('--emboss-x', `${(-x * .9).toFixed(2)}px`);
  s.setProperty('--emboss-y', `${(-y * .9).toFixed(2)}px`);

  // CANTOS. Cada borde se ilumina por separado según cuánto encara al
  // observador, así que la tarjeta se lee con espesor en vez de con un marco
  // uniforme.
  s.setProperty('--edge-l', Math.max(0, -x).toFixed(3));
  s.setProperty('--edge-r', Math.max(0, x).toFixed(3));
  s.setProperty('--edge-t', Math.max(0, -y).toFixed(3));
  s.setProperty('--edge-b', Math.max(0, y).toFixed(3));
}

// ============================================================
// CREDENCIAL
// ============================================================

/* Un folio estable derivado del uid: la misma persona siempre ve el mismo
   número. No es un identificador real ni pretende serlo — es el detalle de
   credencial que hace que el objeto se lea como emitido y no como impreso. */
function _holoFolio(uid) {
  let h = 0;
  const s = String(uid || 'thinky');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(h % 100000).padStart(5, '0');
}

const HOLO_AREA_ABBR = { Cuentas:'CTA', Operaciones:'OPS', Creativo:'CRE', Data:'DAT' };

/* Cuántas campañas caben en el pie antes de resumirse en un "+N". Tres: con
   cuatro los nombres se recortan tanto que dejan de distinguirse entre sí, y la
   tira deja de servir para lo único que sirve — ver de un vistazo qué lleva
   cada quien. */
const HOLO_CAMPS_MAX = 3;

/* Las campañas donde la persona aparece: asignada (assignedTo), responsable de
   un área, o suscrita. Las tres cuentan porque las tres significan que esa
   campaña es suya en algún sentido.

   La suscripción vive en UN solo lado: `subscribedCampaigns` en el perfil.
   Antes había dos listas —esa y `campaign.subscribers`— escritas por dos
   botones distintos que no se limpiaban entre sí, así que la tira mostraba
   campañas que la persona ya había dejado de seguir por el otro camino.

   Se filtra además por lo que puede ver QUIEN MIRA la credencial, no su dueño:
   la tarjeta de otra persona no puede volverse un índice de campañas
   restringidas.

   Lee de la caché en memoria y tolera no encontrarla: la credencial también se
   monta antes de que Firestore conteste, y ahí la tira simplemente no aparece. */
function holoUserCampaigns(u) {
  const uid = u && u.uid;
  if (!uid) return [];
  let list = [];
  try {
    if (typeof _cache !== 'undefined' && Array.isArray(_cache.campaigns)) list = _cache.campaigns;
    else if (typeof getData === 'function') list = getData('campaigns') || [];
  } catch (e) { return []; }
  // Para la credencial propia se lee del perfil en memoria, que es la copia
  // autoritativa y se actualiza en el momento; `allUsers` viene del espejo en
  // `members` y puede ir un listener por detrás. Para la de otra persona sólo
  // existe el espejo.
  const esMia = typeof currentUser !== 'undefined' && currentUser && currentUser.uid === uid;
  const perfil = esMia && typeof currentUserProfile !== 'undefined' && currentUserProfile
    ? currentUserProfile : u;
  const subs = Array.isArray(perfil.subscribedCampaigns) ? perfil.subscribedCampaigns : [];

  return list.filter(c => {
    if (typeof canSeeCampaign === 'function' && !canSeeCampaign(c)) return false;
    if ((c.assignedTo || []).includes(uid)) return true;
    if (subs.includes(c.id)) return true;
    const r = c.responsables || {};
    return Object.values(r).some(v => Array.isArray(v) ? v.includes(uid) : v === uid);
  });
}

/* La tira de campañas del pie. Va vacía — no oculta — cuando el dueño la apagó
   o cuando no hay campañas: quien no lleva ninguna no debería ver un hueco con
   una etiqueta vacía. */
function _holoCampsHtml(u) {
  if (u.cardCampaigns === false) return '';
  const camps = holoUserCampaigns(u);
  if (!camps.length) return '';
  const shown = camps.slice(0, HOLO_CAMPS_MAX);
  const rest = camps.length - shown.length;
  return `
      <div class="holo-camps">
        ${shown.map(c => `<span class="holo-camp">${_esc(c.name)}</span>`).join('')}
        ${rest ? `<span class="holo-camp holo-camp--more">+${rest}</span>` : ''}
      </div>`;
}

/* El nombre se escala por largo en vez de recortarse con puntos suspensivos.
   "Paulo Andres Perez Sanchez" no cabe al tamaño de "Ana Ruiz", y una credencial
   que dice "Paulo Andres Per…" está rota: el nombre completo es justamente lo
   que la credencial certifica. Tamaños en unidades de contenedor, así que el
   corte por largo vale igual en la tarjeta grande y en la vista previa. */
function _holoNameSize(name) {
  const n = String(name || '').length;
  if (n <= 13) return '7.4cqw';
  if (n <= 18) return '6.2cqw';
  if (n <= 24) return '5.2cqw';
  if (n <= 32) return '4.4cqw';
  return '3.8cqw';
}

/* El HTML de la tarjeta. La estructura es idéntica en el perfil y en el editor:
   solo cambia de dónde salen sus números. */
function holoCardHtml(u) {
  // El logo se elige por tinta, así que hace falta saberla antes de armar el
  // HTML (applyHoloFoil corre después y ya sería tarde para cambiar el src).
  u = Object.assign({}, u, { __ink: holoTint(u.cardTint).ink });
  const name    = u.name || (u.email ? u.email.split('@')[0] : 'Miembro');
  const puesto  = u.puesto || 'Think Y.';
  const area    = u.area || '';
  const avatar  = u.profileEmoji || (name[0] || '?').toUpperCase();
  const avBg    = u.profileGradient || 'linear-gradient(135deg,#ff2d87,#a855f7)';
  const pron    = (typeof _shortPronouns === 'function' ? _shortPronouns(u.pronouns || '') : '') || '';

  return `
  <div class="holo-card">
    <!-- LA SUPERFICIE IMPRESA. Color del usuario; todo lo de arriba es luz
         cayendo sobre ella. -->
    <div class="holo-body"></div>
    <!-- El sello de seguridad, pagado con el presupuesto de inclinación: apenas
         existe en reposo y sube al girar. -->
    <div class="holo-pattern"></div>

    <!-- EL FOIL: tres ranuras genéricas. Qué pinta cada una, a qué velocidad se
         mueve y cómo compone viene todo del material. -->
    <div class="holo-foil"></div>
    <div class="holo-foil--b"></div>
    <div class="holo-foil--c"></div>
    <!-- La pasada de tinta: devuelve el color del dueño encima del foil, sin
         tocar su estructura de luz. -->
    <div class="holo-tint"></div>
    <div class="holo-smear"></div>
    <div class="holo-spot"></div>
    <div class="holo-noise"></div>
    <div class="holo-glare"></div>

    <!-- EL CONTENIDO, ENCIMA DEL FOIL. La tipografía debajo de la hoja se la
         come el foil: el foil es luz, y la luz cae sobre la impresión, no sobre
         lo que está escrito encima de ella. -->
    <div class="holo-content">
      <div class="holo-top">
        <div class="holo-brand">
          <!-- La Y original. Dos archivos porque son dos marcas distintas: sobre
               tinta clara va el badge rosa (la Y calada en su cuadro), y sobre
               tinta oscura la Y blanca suelta, que ahí sí tiene contraste. -->
          <img class="holo-brand-mark" src="assets/${u.__ink === 'light' ? 'y-white-transparent-128.png' : 'y-pink-transparent-128.png'}" alt="" width="128" height="128">
          <span class="holo-brand-name">THINK Y<span class="holo-brand-dot">.</span></span>
        </div>
        <span class="holo-kind">Credencial</span>
      </div>

      <div class="holo-main">
        <div class="holo-text">
          <p class="holo-name" style="--name-size:${_holoNameSize(name)}">${_esc(name)}</p>
          <p class="holo-role">${_esc(puesto)}${pron ? `<span class="holo-pron">${_esc(pron)}</span>` : ''}</p>
        </div>
        <!-- El recuadro del avatar: deliberadamente más simple que la tarjeta.
             Recibe brillo pero no arcoíris, que es lo que mantiene las dos
             superficies leyéndose como materiales distintos. -->
        <div class="holo-tile" style="--av-bg:${avBg};">
          <div class="holo-tile__fill"></div>
          <div class="holo-tile__face">${_esc(avatar)}</div>
          <div class="holo-tile__gloss"></div>
        </div>
      </div>

      ${_holoCampsHtml(u)}

      <div class="holo-foot">
        ${area ? `<span class="holo-chip">${_esc(HOLO_AREA_ABBR[area] || area)} · ${_esc(area)}</span>` : ''}
        <span class="holo-folio">N.º ${_holoFolio(u.uid)}</span>
      </div>
    </div>

    <!-- Los stickers van ENCIMA del contenido y dentro de la tarjeta, así que
         comparten su plano 3D y se inclinan con ella. Fuera de .holo-content
         para que el relieve del texto no les aplique sombra. -->
    <div class="holo-stickers"></div>
  </div>`;
}

/* Monta la credencial dentro de `host` y le engancha el loop.
   Devuelve un objeto con `destroy()` y `setStyle(foilKey, tintKey)`, que es lo
   que usa el editor para cambiar el material en vivo sin remontar nada. */
function mountHoloCard(host, u, opts) {
  if (!host) return null;
  const o = opts || {};
  host.innerHTML = holoCardHtml(u);
  const card = host.querySelector('.holo-card');
  if (!card) return null;

  let foil = holoFoil(u.cardFoil);
  let tint = holoTint(u.cardTint);
  applyHoloFoil(card, foil, tint);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Dos seguidores de pesos distintos. La tarjeta sigue rápido; el foil es más
  // pesado y llega unos frames después, así que la superficie ALCANZA a la
  // tarjeta. Ese retraso es casi todo lo que separa esto de un degradado
  // persiguiendo un cursor.
  const tilt = new HoloFollow(.16);
  const sheet = new HoloFollow(.09);
  const kick = new HoloKick();
  const t0 = performance.now();

  let raf = 0, running = false, onScreen = false, hidden = false;
  let idle = 0, touched = false;
  /* Cuánto llevamos del regreso al reposo, 0..1. */
  let release = 1;
  /* Hacia dónde apuntaba la tarjeta cuando se fue el puntero — el inicio de esa
     mezcla. Sin esto el inicio es la fase de la deriva, que no está ni cerca de
     donde estabas. */
  let handoff = { x: 0, y: 0 };
  /* La misma mezcla al ENTRAR. El puntero llega lejos de donde la tarjeta había
     derivado, así que tomarlo como objetivo de golpe es un salto de casi todo el
     recorrido en un frame. */
  let grab = 1, grabFrom = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  /* Mientras se arrastra un sticker la tarjeta deja de seguir al puntero:
     arrastrar un sticker y girar la credencial son dos gestos distintos sobre
     el mismo pixel, y hacer ambos a la vez marea. */
  let stickerDrag = false;

  const frame = () => {
    raf = 0;

    if (!touched) {
      // Dos ritmos inconmensurables, así la deriva en reposo nunca se repite
      // visiblemente.
      idle += .0042;
      const drift = { x: Math.sin(idle) * .28, y: Math.cos(idle * .73) * .2 };
      // REGRESAR A LA DERIVA CON EASE, no cortar hacia ella. La fase de la
      // deriva sigue avanzando mientras estás encima, así que al soltar está en
      // un punto sin relación con donde apunta la tarjeta. Entregar el objetivo
      // directo la teletransporta.
      release = Math.min(1, release + .016);
      const k = release * release;
      tilt.target = {
        x: handoff.x + (drift.x - handoff.x) * k,
        y: handoff.y + (drift.y - handoff.y) * k,
      };
    } else {
      grab = Math.min(1, grab + .018);
      const k = grab * grab;
      tilt.target = {
        x: grabFrom.x + (aim.x - grabFrom.x) * k,
        y: grabFrom.y + (aim.y - grabFrom.y) * k,
      };
    }

    // El sobrepaso de soltar va ENCIMA del objetivo en vez de reemplazarlo, así
    // la lógica de deriva/puntero queda intacta y el rebote simplemente suma y
    // se apaga.
    const k = kick.step();
    if (k.x || k.y) tilt.target = { x: tilt.target.x + k.x, y: tilt.target.y + k.y };

    tilt.step();
    sheet.target = tilt.value;
    sheet.step();

    applyHoloFrame(card, tilt.value, sheet.value, foil, {
      speed: sheet.speed,
      velocity: sheet.velocity,
      time: (performance.now() - t0) / 1000,
    });

    // Sigue corriendo mientras la mezcla de regreso está en vuelo: los
    // seguidores pueden estar "asentados" contra un objetivo que a su vez se
    // mueve, y parar ahí congelaría la tarjeta a medio camino.
    if (running && (!touched || release < 1 || grab < 1 || kick.active || !tilt.settled || !sheet.settled)) {
      raf = requestAnimationFrame(frame);
    }
  };

  const wake = () => { if (running && !raf) raf = requestAnimationFrame(frame); };
  const sync = () => {
    const should = onScreen && !hidden && !reduced;
    if (should === running) return;
    running = should;
    if (should) wake();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  };

  const onPointer = (e) => {
    if (reduced || stickerDrag) return;
    aim = _holoFromPointer(host.getBoundingClientRect(), e.clientX, e.clientY);
    if (!touched) {
      // PRIMER contacto: arranca la mezcla de recogida desde la pose actual.
      // Solo en la transición — reiniciarla en cada pointermove dejaría la
      // tarjeta permanentemente atrás del cursor.
      touched = true;
      grabFrom = { x: tilt.value.x, y: tilt.value.y };
      grab = 0;
    }
    release = 0;
    wake();
  };
  const onLeave = () => {
    touched = false;
    handoff = { x: tilt.value.x, y: tilt.value.y };
    release = 0;
    grab = 1;
    // Se pasa un poco sobre el eje que venías empujando. Escalado por la
    // velocidad al soltar, así un flick la lanza y dejarla no hace nada.
    kick.fire(tilt.velocity);
    wake();
  };

  host.addEventListener('pointermove', onPointer);
  host.addEventListener('pointerleave', onLeave);

  const io = new IntersectionObserver((es) => {
    onScreen = es.some(e => e.isIntersecting);
    sync();
  }, { rootMargin: '120px' });
  io.observe(host);

  const onVis = () => { hidden = document.hidden; sync(); };
  document.addEventListener('visibilitychange', onVis);

  // Giroscopio. En Android los eventos simplemente llegan; en iOS nunca disparan
  // sin un gesto, y ahí la tarjeta cae a su deriva de reposo — lo mismo que hace
  // en escritorio sin puntero encima.
  const orient = new HoloOrientation();
  const onOrient = (e) => {
    if (reduced) return;
    const v = orient.read(e);
    if (!v) return;
    touched = true;
    aim = v;
    wake();
  };
  window.addEventListener('deviceorientation', onOrient);

  // Primer frame aunque el IntersectionObserver tarde: una tarjeta plana un
  // instante antes de animarse se ve como carga fallida.
  applyHoloFrame(card, { x: 0, y: 0 }, { x: 0, y: 0 }, foil, {});

  // ── Stickers ──
  // Se montan después de que las webfonts estén listas: rasterizar el troquel
  // contra la fuente de respaldo lo deja pegado a los glifos equivocados, y eso
  // no se corrige solo cuando la fuente real llega.
  let board = null;
  const stickerHost = card.querySelector('.holo-stickers');
  if (stickerHost && typeof HoloStickerBoard === 'function') {
    board = new HoloStickerBoard(stickerHost, {
      editable: !!o.editable,
      onChange: o.onStickersChange,
      onDragChange: (v) => { stickerDrag = v; },
    });
    holoStickerAssetsReady().then(() => {
      if (board) board.setStickers(u.cardStickers || []);
    });
  }

  return {
    card,
    board,
    setStyle(foilKey, tintKey) {
      foil = holoFoil(foilKey);
      tint = holoTint(tintKey);
      applyHoloFoil(card, foil, tint);
      // El logo cambia con la tinta (badge rosa sobre claro, Y blanca sobre
      // oscuro); es lo único del contenido que depende del material.
      const mark = card.querySelector('.holo-brand-mark');
      if (mark) mark.src = 'assets/' + (tint.ink === 'light' ? 'y-white-transparent-128.png' : 'y-pink-transparent-128.png');
      wake();
    },
    setStickers(list) { if (board) board.setStickers(list); },
    getStickers() { return board ? board.getStickers() : []; },
    destroy() {
      if (board) { board.destroy(); board = null; }
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('deviceorientation', onOrient);
      host.removeEventListener('pointermove', onPointer);
      host.removeEventListener('pointerleave', onLeave);
      if (o.keepHtml !== true) host.innerHTML = '';
    },
  };
}

/* Instancias vivas, para poder desmontarlas cuando su modal se cierra: cada una
   tiene su propio rAF y sus propios listeners globales. */
const _holoMounts = new Map();

function mountHoloInto(hostId, u, opts) {
  unmountHolo(hostId);
  const host = document.getElementById(hostId);
  if (!host) return null;
  const inst = mountHoloCard(host, u, opts);
  if (inst) { _holoMounts.set(hostId, inst); inst.user = u; }
  return inst;
}
function unmountHolo(hostId) {
  const prev = _holoMounts.get(hostId);
  if (prev) { prev.destroy(); _holoMounts.delete(hostId); }
}

/* La tira de campañas se arma al montar y ahí se quedaba: si te quitaban de una
   campaña con la credencial abierta —o si la quitas tú mismo desde otra
   pestaña— seguía enseñándola hasta cerrar y volver a abrir el perfil. Se
   repinta SOLO ese trozo, no la tarjeta: remontarla reiniciaría la inclinación
   y el foil a media pasada del cursor. */
function refreshHoloCamps() {
  _holoMounts.forEach(inst => {
    if (!inst || !inst.card || !inst.user) return;
    const content = inst.card.querySelector('.holo-content');
    if (!content) return;
    const actual = content.querySelector('.holo-camps');
    const html = _holoCampsHtml(inst.user).trim();
    if (!html) { if (actual) actual.remove(); return; }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const nueva = tmp.firstElementChild;
    if (!nueva) return;
    if (actual) { if (actual.outerHTML !== nueva.outerHTML) actual.replaceWith(nueva); }
    else {
      const foot = content.querySelector('.holo-foot');
      if (foot) content.insertBefore(nueva, foot); else content.appendChild(nueva);
    }
  });
}
window.refreshHoloCamps = refreshHoloCamps;

// ============================================================
// COMPARTIR
// ============================================================
/* La imagen para redes se DIBUJA, no se captura.
   html2canvas no entiende mix-blend-mode ni backdrop-filter, que es
   literalmente todo el efecto: una captura saldría como un rectángulo de color
   plano. Así que se repinta la tarjeta en canvas, donde
   globalCompositeOperation sí soporta 'overlay', 'color-dodge' y 'color' — los
   mismos modos que usa el CSS.

   Es una RENDICIÓN, no una copia pixel a pixel: la exportación congela un solo
   ángulo y aplana el foil a una hoja espectral, en vez de reproducir las tres
   capas con sus velocidades. Lo que se comparte es una foto de la credencial,
   no la credencial. */

/* Los degradados de las tintas están escritos como CSS. Para el canvas hacen
   falta los colores sueltos. */
function _holoGradStops(css) {
  const hex = String(css).match(/#[0-9a-fA-F]{3,8}/g);
  return hex && hex.length ? hex : ['#ffb3d3', '#e96fa6'];
}

function _holoRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function _holoLoadImg(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

/* Devuelve un <canvas> con la credencial de `u` lista para compartir. */
async function holoRenderShare(u, width) {
  const W = width || 1200;
  const H = Math.round(W / 1.55);
  const tint = holoTint(u.cardTint);
  const foil = holoFoil(u.cardFoil);
  const ink = tint.ink === 'light' ? '#ffffff' : '#1a1326';

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const u2 = W / 100; // 1 unidad de contenedor, igual que los cqw del CSS

  _holoRoundRect(ctx, 0, 0, W, H, 4.2 * u2);
  ctx.clip();

  // 1. La impresión.
  const stops = _holoGradStops(tint.grad);
  const g = ctx.createLinearGradient(0, H, W, 0);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 2. La hoja espectral, aplanada a un solo ángulo.
  const sheet = ctx.createLinearGradient(0, H, W, 0);
  const hues = HOLO_SUNPILLARS;
  for (let i = 0; i <= hues.length * 2; i++) {
    sheet.addColorStop(Math.min(1, i / (hues.length * 2)), hues[i % hues.length]);
  }
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = sheet;
  ctx.fillRect(0, 0, W, H);

  // 3. La pasada de tinta: devuelve el color del dueño encima del foil.
  if (tint.hold) {
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = tint.hold;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // 4. El brillo, en el punto dulce.
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = foil.glare;
  const gl = ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.3, H * 0.3, W * 0.8);
  gl.addColorStop(0, 'rgba(255,255,255,.62)');
  gl.addColorStop(0.26, 'rgba(255,255,255,.12)');
  gl.addColorStop(1, 'rgba(0,0,0,.22)');
  ctx.fillStyle = gl;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // 5. El contenido.
  const name   = u.name || (u.email ? u.email.split('@')[0] : 'Miembro');
  const puesto = u.puesto || 'Think Y.';
  const area   = u.area || '';
  const padX = 5.5 * u2, padY = 5 * u2;

  const logo = await _holoLoadImg('assets/' + (tint.ink === 'light' ? 'y-white-transparent-128.png' : 'y-pink-transparent-128.png'));
  if (logo) ctx.drawImage(logo, padX, padY, 5.4 * u2, 5.4 * u2);

  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${2.9 * u2}px Quicksand, sans-serif`;
  ctx.fillText('THINK Y.', padX + 7 * u2, padY + 2.9 * u2);

  ctx.globalAlpha = .62;
  ctx.font = `700 ${2.1 * u2}px Quicksand, sans-serif`;
  const kind = 'CREDENCIAL';
  ctx.fillText(kind, W - padX - ctx.measureText(kind).width, padY + 2.9 * u2);
  ctx.globalAlpha = 1;

  // Nombre y puesto, alineados abajo como en la tarjeta viva.
  const nameSize = parseFloat(_holoNameSize(name)) * u2;
  ctx.font = `700 ${nameSize}px Quicksand, sans-serif`;
  ctx.fillText(name, padX, H * 0.56);
  ctx.globalAlpha = .74;
  ctx.font = `600 ${3.1 * u2}px Quicksand, sans-serif`;
  ctx.fillText(puesto, padX, H * 0.56 + nameSize * 0.62 + 1.6 * u2);
  ctx.globalAlpha = 1;

  // El recuadro del avatar.
  const tw = 19 * u2, tx = W - padX - tw, ty = H * 0.5 - tw / 2;
  ctx.save();
  _holoRoundRect(ctx, tx, ty, tw, tw, 5 * u2);
  ctx.clip();
  const av = _holoGradStops(u.profileGradient || 'linear-gradient(135deg,#ff2d87,#a855f7)');
  const ag = ctx.createLinearGradient(tx, ty, tx + tw, ty + tw);
  av.forEach((c, i) => ag.addColorStop(i / Math.max(1, av.length - 1), c));
  ctx.fillStyle = ag;
  ctx.fillRect(tx, ty, tw, tw);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${9 * u2}px Quicksand, sans-serif`;
  ctx.textAlign = 'center';
  const face = u.profileEmoji || (name[0] || '?').toUpperCase();
  ctx.fillText(face, tx + tw / 2, ty + tw / 2);
  ctx.textAlign = 'left';
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = .6 * u2;
  _holoRoundRect(ctx, tx, ty, tw, tw, 5 * u2);
  ctx.stroke();

  // Pie: área y folio.
  const footY = H - padY - 1.4 * u2;

  // La tira de campañas, encima del pie. Mismo recorte que en la tarjeta viva.
  if (u.cardCampaigns !== false) {
    const camps = holoUserCampaigns(u);
    if (camps.length) {
      const shown = camps.slice(0, HOLO_CAMPS_MAX).map(c => c.name);
      if (camps.length > shown.length) shown.push('+' + (camps.length - shown.length));
      ctx.font = `700 ${2 * u2}px Quicksand, sans-serif`;
      let cx = padX;
      const cy = footY - 6.2 * u2;
      shown.forEach(txt => {
        const cw = ctx.measureText(txt).width + 3.6 * u2;
        if (cx + cw > W - padX) return;
        ctx.fillStyle = tint.ink === 'light' ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.48)';
        _holoRoundRect(ctx, cx, cy - 2.1 * u2, cw, 4.2 * u2, 2.1 * u2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.globalAlpha = .82;
        ctx.fillText(txt, cx + 1.8 * u2, cy);
        ctx.globalAlpha = 1;
        cx += cw + 1.2 * u2;
      });
    }
  }

  ctx.font = `700 ${2.2 * u2}px Quicksand, sans-serif`;
  if (area) {
    const chip = `${HOLO_AREA_ABBR[area] || area} · ${area}`;
    const cw = ctx.measureText(chip).width + 4.8 * u2;
    ctx.fillStyle = tint.ink === 'light' ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.55)';
    _holoRoundRect(ctx, padX, footY - 2.4 * u2, cw, 4.8 * u2, 2.4 * u2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(chip, padX + 2.4 * u2, footY);
  }
  ctx.globalAlpha = .55;
  ctx.fillStyle = ink;
  const folio = 'N.º ' + _holoFolio(u.uid);
  ctx.fillText(folio, W - padX - ctx.measureText(folio).width, footY);
  ctx.globalAlpha = 1;

  // 6. Los stickers, con su troquel real: se rasterizan igual que en la
  // tarjeta viva, solo que al tamaño de la exportación.
  if (typeof holoRenderStickerDef === 'function' && (u.cardStickers || []).length) {
    await holoStickerAssetsReady();
    // Sin el tope de 34px del tablero: ese existe para que en una tarjeta muy
    // ancha los stickers no se vuelvan carteles, pero la exportación es la MISMA
    // tarjeta a 1200px, así que topándolo salían a menos de la mitad del tamaño
    // con el que se acomodaron.
    const fontPx = Math.max(13, W * 0.062);
    (u.cardStickers || []).forEach(d => {
      const r = holoRenderStickerDef(d, fontPx, 1);
      if (!r) return;
      ctx.save();
      ctx.translate(d.x * W, d.y * H);
      ctx.rotate((d.r || 0) * Math.PI / 180);
      ctx.shadowColor = 'rgba(10,10,12,.3)';
      ctx.shadowBlur = 1.2 * u2;
      ctx.shadowOffsetY = .5 * u2;
      ctx.drawImage(r.canvas, -r.width / 2, -r.height / 2, r.width, r.height);
      ctx.restore();
    });
  }

  return cv;
}

/* Comparte la credencial. Usa el diálogo nativo del sistema cuando existe
   (móvil y Safari/Chrome recientes) y cae a descarga en el resto. */
async function holoShareCard(uid) {
  const u = (typeof allUsers !== 'undefined' && allUsers.find(x => x.uid === uid)) || null;
  if (!u) { showToast('Perfil no encontrado', 'error'); return; }
  return holoShareUser(u);
}

async function holoShareUser(u) {
  if (!u) { showToast('Perfil no encontrado', 'error'); return; }
  try {
    showToast('Preparando tu credencial…');
    const cv = await holoRenderShare(u, 1200);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen');
    const slug = String(u.name || 'credencial').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = new File([blob], `credencial-${slug}.png`, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Credencial Thinky — ${u.name || ''}`,
        text: `${u.name || ''}${u.puesto ? ' · ' + u.puesto : ''} · Think Y.`,
      });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Credencial descargada ✓', 'success');
  } catch (e) {
    // Cancelar el diálogo nativo lanza AbortError; no es un error que reportar.
    if (e && e.name === 'AbortError') return;
    showToast('No se pudo compartir: ' + e.message, 'error');
  }
}
