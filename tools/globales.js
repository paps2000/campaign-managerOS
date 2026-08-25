/* Qué nombres deja cada archivo de js/ en el scope global compartido.
   ============================================================
   Una sola copia de esta lógica, usada por dos consumidores:

     · eslint.config.mjs      → para que `no-undef` sepa qué existe
     · test/estructura.test.js → para verificar los onclick del HTML y avisar
                                 de colisiones entre archivos

   Tenerla duplicada era pedir que las dos se desincronizaran y que una
   aprobara lo que la otra rechaza.

   POR QUÉ NO SE PARSEA DE VERDAD
   ------------------------------
   Se intentó quitar cadenas y comentarios antes de escanear, y no funciona: el
   código está lleno de plantillas anidadas (`${x ? `<b>${y}</b>` : ''}`) y de
   expresiones regulares con llaves sin balancear —`/^(\d{1,2})[/-](\d{1,2})$/`—
   así que un escáner de caracteres se desincroniza a la primera y a partir de
   ahí devuelve basura. Meter un parser de verdad (acorn) por esto sería la
   primera dependencia de producción del proyecto.

   La regla que sí aguanta: en la columna 0 sólo hay declaraciones. El estilo
   del código es consistente en eso y las dos herramientas lo verifican entre
   ellas — si alguien rompe la convención, `no-undef` empieza a gritar.
*/
'use strict';
const fs = require('fs');
const path = require('path');

/* La primera línea de código real del archivo, sin comentarios ni blancos. */
function primeraLinea(src) {
  let dentroDeBloque = false;
  for (const cruda of src.split('\n')) {
    let s = cruda.trim();
    if (dentroDeBloque) {
      const cierre = s.indexOf('*/');
      if (cierre === -1) continue;
      dentroDeBloque = false;
      s = s.slice(cierre + 2).trim();
    }
    if (s.startsWith('/*')) {
      if (!s.includes('*/')) { dentroDeBloque = true; continue; }
      s = s.slice(s.indexOf('*/') + 2).trim();
    }
    if (!s || s.startsWith('//')) continue;
    return s;
  }
  return '';
}

/* La última línea de código real. */
function ultimaLinea(src) {
  const lineas = src.split('\n');
  for (let i = lineas.length - 1; i >= 0; i--) {
    const s = lineas[i].trim();
    if (!s || s.startsWith('//')) continue;
    return s;
  }
  return '';
}

/* ¿Está TODO el archivo dentro de un IIFE?
   No basta con mirar la primera línea: js/login-shell.js abre un IIFE para la
   animación del login y DESPUÉS declara `lrGoogleLogin` en el nivel de arriba,
   que es global y la llama un onclick del HTML. Mirando sólo el principio se
   daba el archivo entero por envuelto y esa función salía como inexistente.
   Tiene que cerrar donde termina el archivo para contar como envuelto. */
function estaEnvuelto(src) {
  const abre = /^[!;]?\(\s*(?:async\s+)?function\s*\(|^\(\s*\(\s*\)\s*=>/.test(primeraLinea(src));
  const cierra = /^\}\)\s*\(\s*\)\s*;?$/.test(ultimaLinea(src));
  return abre && cierra;
}

/* Las declaraciones de primer nivel de UN archivo: [{nombre, tipo}].
   `tipo` es 'function' | 'const' | 'let' | 'var' | 'class' | 'window'. */
function declaracionesDe(archivo) {
  const src = fs.readFileSync(archivo, 'utf8');
  const out = [];
  // Lo que cualquier archivo puede exportar a mano, esté envuelto o no.
  for (const m of src.matchAll(/^\s*window\.([A-Za-z_$][\w$]*)\s*=/gm)) {
    out.push({ nombre: m[1], tipo: 'window' });
  }
  if (estaEnvuelto(src)) return out;
  for (const linea of src.split('\n')) {
    const m = linea.match(/^(?:async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/);
    if (m) out.push({ nombre: m[2], tipo: m[1] });
  }
  return out;
}

/* Los <script src="js/..."> de index.html, en el orden en que se cargan —que
   es el orden real de ejecución y por tanto el orden en que estos nombres
   entran al scope. */
function archivosDeIndex(raiz) {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
}

/* nombre → { archivo, tipo } para todo el proyecto. Gana el primero que lo
   declara, igual que en el navegador. */
function globalesDelProyecto(raiz) {
  const mapa = new Map();
  for (const rel of archivosDeIndex(raiz)) {
    for (const d of declaracionesDe(path.join(raiz, rel))) {
      if (!mapa.has(d.nombre)) mapa.set(d.nombre, { archivo: rel, tipo: d.tipo });
    }
  }
  return mapa;
}

module.exports = {
  primeraLinea,
  ultimaLinea,
  estaEnvuelto,
  declaracionesDe,
  archivosDeIndex,
  globalesDelProyecto,
};
