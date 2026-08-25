/* Lint para un sitio SIN bundler.
   ============================================================
   Los 21 archivos de js/ son scripts CLÁSICOS (no módulos): comparten un solo
   scope global y el HTML los llama desde atributos onclick. Eso es a propósito
   —está explicado en la cabecera de cada archivo— pero tiene un precio: nada
   avisa cuando una función se renombra en un archivo y se sigue llamando desde
   otro. Se descubre en producción, con un ReferenceError, y normalmente lo
   descubre quien iba a usarla.

   `no-undef` es justo la regla que ataja eso, pero necesita saber qué nombres
   son globales de verdad. Escribir esa lista a mano y mantenerla al día sería
   otra cosa que se olvida, así que se DERIVA: se leen los archivos en el orden
   en que index.html los carga y se recogen sus declaraciones de primer nivel.
   Agregar una función nueva no obliga a tocar este archivo.
   La heurística vive en tools/globales.js, compartida con test/. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import globals from 'globals';

const raiz = path.dirname(fileURLToPath(import.meta.url));
// tools/globales.js es CommonJS porque test/ también lo usa y ese sí corre en
// CJS. Una sola copia de la heurística para las dos herramientas.
const { globalesDelProyecto } = createRequire(import.meta.url)('./tools/globales.js');

const globalesDeJs = {};
for (const nombre of globalesDelProyecto(raiz).keys()) globalesDeJs[nombre] = 'writable';

export default [
  { ignores: ['node_modules/**', 'assets/**'] },

  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      // 'script', no 'module': es la diferencia que hace que estos archivos
      // compartan scope. Ponerlo en 'module' haría que el lint pasara con
      // código que en el navegador no resuelve nada.
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Cargado por <script> desde gstatic, no por npm.
        firebase: 'readonly',
        // Se pide bajo demanda al entrar a Métricas (ver _loadChartJs).
        Chart: 'readonly',
        // SheetJS, también bajo demanda (importar creadores desde .xlsx).
        XLSX: 'readonly',
        ...globalesDeJs,
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      // El motivo de todo esto: llamar a algo que no existe.
      'no-undef': 'error',
      // Un `x = 1` sin declarar crea un global silencioso desde cualquier
      // función. En 21 archivos que comparten scope, eso es una colisión
      // esperando a pasar.
      'no-implicit-globals': 'off',
      'no-undef-init': 'warn',

      // Errores de verdad, no de estilo.
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-duplicate-case': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-obj-calls': 'error',
      'no-sparse-arrays': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      // 'except-parens' y no 'always': `while((m = re.exec(s)) !== null)` es EL
      // modismo para recorrer coincidencias con una regex global, y prohibirlo
      // obligaría a reescribirlo peor.
      'no-cond-assign': ['error', 'except-parens'],
      'no-constant-condition': ['error', { checkLoops: false }],
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      // Apagada: sus 20 avisos son todos el mismo patrón —escribir en
      // `currentUserProfile` después de un await—, y en una app de un solo
      // usuario por pestaña no hay dos flujos compitiendo por ese objeto.
      'require-atomic-updates': 'off',
      // Redeclarar `let x` en dos archivos de primer nivel es un SyntaxError que
      // tumba el SEGUNDO archivo entero, sin más aviso que la consola.
      'no-redeclare': ['error', { builtinGlobals: false }],

      // Ruido conocido, apagado a propósito: `catch(e){}` vacío es el modismo
      // de este código para "esto es best-effort y no debe tumbar el render".
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Apagada, y no por pereza: en scripts clásicos la declaración de primer
      // nivel ES la exportación. `openProfileModal` se declara en app.js y se
      // llama desde ui.js y desde un onclick del HTML, pero ESLint mira un
      // archivo a la vez y no ve ninguna de las dos cosas. Encendida daba 237
      // avisos y los 237 eran falsos — que es la forma más rápida de que nadie
      // vuelva a leer la salida del lint.
      // Lo que sí importa de esto (¿alguien llama a algo que ya no existe?) lo
      // cubren `no-undef` aquí arriba, con la lista de globales derivada de los
      // propios archivos, y test/estructura.test.js para los onclick del HTML.
      'no-unused-vars': 'off',
    },
  },

  {
    files: ['test/**/*.js', 'tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
