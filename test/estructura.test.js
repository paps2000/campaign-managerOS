/* Pruebas de ESTRUCTURA: lo que se rompe por cómo está montado el proyecto,
 * no por lo que hace una función.
 *
 * Corre con:  node test/estructura.test.js   (o `npm test`, que corre las dos)
 *
 * Los 21 archivos de js/ son scripts clásicos que comparten un solo scope
 * global, y el HTML los llama desde atributos onclick. Es una decisión
 * deliberada —no hay bundler y no queremos uno— pero deja tres formas de
 * romper la app sin que nada avise hasta que alguien hace clic:
 *
 *   1. Renombrar una función y dejar el nombre viejo en un onclick del HTML.
 *      Resultado: el botón no hace nada y la consola dice ReferenceError.
 *   2. Declarar `let X` de primer nivel en dos archivos. Resultado: el SEGUNDO
 *      archivo no se parsea ENTERO —SyntaxError: Identifier already declared—
 *      así que se caen de golpe todas sus funciones.
 *   3. Cambiar el orden de <script> en index.html. Casi todo tolera el cambio
 *      porque las llamadas ocurren después de cargar, pero el código que corre
 *      al evaluarse (los `applyThemePref(...)` sueltos) no.
 *
 * `npm run lint` cubre lo que pasa dentro de js/ (no-undef con la lista de
 * globales derivada de los propios archivos). Esto cubre la frontera con el
 * HTML, que el lint no mira.
 */
const fs = require('fs');
const path = require('path');
const { archivosDeIndex, declaracionesDe } = require('../tools/globales.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const archivos = archivosDeIndex(ROOT);

let pass = 0, fail = 0;
const ok = (cond, label, detalle) => {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.log('  \u2717 ' + label + (detalle ? '\n      ' + detalle : '')); }
};
const group = name => console.log('\n' + name);

// nombre -> {archivo, tipo}   |   nombre -> [sitios] para los lexicos
const declarados = new Map();
const lexicosPorNombre = new Map();

for (const rel of archivos) {
  for (const { nombre, tipo } of declaracionesDe(path.join(ROOT, rel))) {
    if (!declarados.has(nombre)) declarados.set(nombre, { archivo: rel, tipo });
    // `const`, `let` y `class` son declaraciones lexicas: repetirlas en el
    // scope global es un SyntaxError que tumba el segundo archivo ENTERO.
    // `function` y `var` se pisan sin quejarse (mal, pero sin romper).
    if (tipo === 'const' || tipo === 'let' || tipo === 'class') {
      if (!lexicosPorNombre.has(nombre)) lexicosPorNombre.set(nombre, []);
      lexicosPorNombre.get(nombre).push(rel + ' (' + tipo + ')');
    }
  }
}

// ===========================================================================
group('index.html — los onclick apuntan a funciones que existen');

// Lo que el navegador ya trae y no tiene que estar en js/.
const DEL_NAVEGADOR = new Set([
  'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'String',
  'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Set', 'Map',
  'setTimeout', 'setInterval', 'clearTimeout', 'encodeURIComponent',
  'decodeURIComponent', 'requestAnimationFrame', 'fetch',
  // palabras clave que la regex de abajo puede confundir con una llamada
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new',
]);

const llamadas = new Map();   // nombre → nº de veces
for (const attr of html.matchAll(/\bon[a-z]+\s*=\s*"([^"]*)"/g)) {
  // Sólo llamadas sueltas: `foo(`. Lo que va detrás de un punto —`this.focus()`,
  // `event.stopPropagation()`— es un método de algo, no un global.
  for (const c of attr[1].matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    llamadas.set(c[1], (llamadas.get(c[1]) || 0) + 1);
  }
}

const faltantes = [...llamadas.keys()]
  .filter(n => !DEL_NAVEGADOR.has(n) && !declarados.has(n))
  .sort();

ok(llamadas.size > 50, `se encontraron llamadas en los onclick (${llamadas.size} nombres distintos)`,
   'si esto baja de golpe, la regex dejó de leer el HTML y la prueba de abajo no prueba nada');
ok(faltantes.length === 0, 'ningún onclick llama a una función que no existe',
   faltantes.length ? 'sin declarar: ' + faltantes.join(', ') : '');

// ===========================================================================
group('js/ — el scope global compartido no tiene colisiones');

const colisiones = [...lexicosPorNombre.entries()]
  .filter(([, sitios]) => sitios.length > 1)
  .map(([nombre, sitios]) => `${nombre}: ${sitios.join(' vs ')}`);

ok(colisiones.length === 0,
   'ningún const/let/class de primer nivel está declarado en dos archivos',
   colisiones.join('\n      '));

// ===========================================================================
group('index.html — el orden de carga sigue siendo el esperado');

// core.js define el scope base (_cache, db, navigate, los helpers de fecha) y
// tiene código que corre al evaluarse. Todo lo demás lo asume cargado.
ok(archivos[1] === 'js/core.js', 'core.js se carga primero (después del login-shell)',
   'orden actual: ' + archivos.slice(0, 3).join(', '));
ok(archivos.every(f => fs.existsSync(path.join(ROOT, f))),
   'todos los <script src> apuntan a un archivo que existe',
   archivos.filter(f => !fs.existsSync(path.join(ROOT, f))).join(', '));

// ===========================================================================
console.log('');
if (fail) { console.log(`❌ ${fail} fallo(s), ${pass} OK`); process.exit(1); }
console.log(`✅ ${pass} pruebas OK`);
