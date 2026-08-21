/* Tests de los parsers de Google Sheets (tracker y escenario).
 *
 * Corre con:  node test/parsers.test.js
 * Sin dependencias: carga los archivos reales de js/ en un contexto con
 * stubs mínimos del navegador. Antes de separar el JS esto no se podía
 * hacer — había que extraer las funciones del HTML con regex.
 *
 * Los parsers son la parte del sistema con más formatos distintos de
 * entrada (cada equipo arma su sheet a su manera), así que son lo que
 * más se rompe en silencio: un cambio de heurística puede seguir
 * "funcionando" pero contar mal las publicaciones.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// --- stubs mínimos del navegador -------------------------------------------
const noop = () => {};
const fakeEl = { style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
                 addEventListener:noop, appendChild:noop, textContent:'', innerHTML:'',
                 value:'', dataset:{}, querySelector:()=>null, querySelectorAll:()=>[] };
const sandbox = {
  console,
  document: {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: () => ({ ...fakeEl }),
    body: { ...fakeEl },
    documentElement: { classList:{contains:()=>false,add:noop,remove:noop} },
    readyState: 'complete',
  },
  localStorage: { getItem:()=>null, setItem:noop, removeItem:noop },
  navigator: { userAgent:'node', clipboard:{writeText:noop} },
  location: { search:'', pathname:'/', origin:'http://localhost', href:'http://localhost/' },
  matchMedia: () => ({ matches:false, addEventListener:noop }),
  setTimeout, clearTimeout, setInterval, clearInterval, fetch: () => Promise.reject(new Error('sin red en tests')),
  // El enrutado por hash (core.js) escucha popstate/hashchange en `window` y
  // escribe con history.pushState. Sin estos stubs la carga de core.js reventaba
  // con "window.addEventListener is not a function" y NINGUNA prueba corría.
  addEventListener: noop, removeEventListener: noop,
  history: { pushState: noop, replaceState: noop },
  requestAnimationFrame: cb => setTimeout(cb, 0), cancelAnimationFrame: noop,
  getComputedStyle: () => ({ getPropertyValue: () => '', animationDuration: '0s' }),
  Blob: class { constructor(parts){ this.size = String(parts && parts[0] || '').length; } },
  // Firebase: lo justo para que core.js/ui.js carguen sin tocar la red.
  // El batch queda instrumentado desde el inicio porque `db` es const en
  // core.js y no se puede reemplazar después.
  firebase: {
    initializeApp: noop,
    auth: () => ({ onAuthStateChanged: noop, signInWithPopup: noop, signOut: noop }),
    firestore: Object.assign(() => ({
      batch: () => ({
        set:    ref => OPS.set.push(ref.__id),
        delete: ref => OPS.delete.push(ref.__id),
        commit: () => { OPS.commits++; return Promise.resolve(); },
      }),
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({exists:false}),
          set: noop,
          collection: () => ({ doc: id => ({ __id: id }) }),
        }),
      }),
    }), { FieldValue: { serverTimestamp: noop } }),
  },
};
// Registro de operaciones de Firestore que hacen las pruebas
const OPS = { set: [], delete: [], commits: 0 };
sandbox.OPS = OPS;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// --- cargar los archivos reales, en el mismo orden que index.html ----------
['core.js', 'campaigns.js', 'sheets.js', 'ui.js', 'clients.js'].forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  try { vm.runInContext(src, sandbox, { filename:'js/'+f }); }
  catch(e) { console.error('No se pudo cargar js/'+f+': '+e.message); process.exit(1); }
});

// Las `function` declaradas a top-level sí quedan en el objeto global, pero
// `const`/`let` no: viven en el scope léxico compartido. Para leer esas hay
// que evaluar el identificador dentro del contexto.
// (Es la misma razón por la que el split en scripts clásicos funciona: todos
// comparten ese scope léxico, en el orden en que index.html los carga.)
const lex = name => vm.runInContext(name, sandbox);

// --- mini framework --------------------------------------------------------
let pass = 0, fail = 0;
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if(a === b){ pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      esperado: ' + b + '\n      obtenido: ' + a); }
};
const group = name => console.log('\n' + name);

// ===========================================================================
group('parseLocaleNumber — formatos numéricos de los sheets');
eq(sandbox.parseLocaleNumber('3.240.000'), 3240000, 'miles con punto (formato europeo)');
eq(sandbox.parseLocaleNumber('1,234,567'), 1234567, 'miles con coma (formato US)');
eq(sandbox.parseLocaleNumber('2,70%'),     2.7,     'porcentaje con coma decimal');
eq(sandbox.parseLocaleNumber('$2.400.000'), 2400000, 'moneda con miles');
eq(sandbox.parseLocaleNumber('#REF!'),     0,       'error de fórmula = 0');
eq(sandbox.parseLocaleNumber('—'),         0,       'guión largo = 0');
eq(sandbox.parseLocaleNumber(''),          0,       'vacío = 0');

group('_isPublishedStatus — "¿esta fila ya se publicó?"');
eq(sandbox._isPublishedStatus('Publicado'), true,  'texto explícito');
eq(sandbox._isPublishedStatus('publicadas'), true, 'tolera inflexión');
eq(sandbox._isPublishedStatus('✅'),        true,  'checkmark (trackers tipo checklist)');
eq(sandbox._isPublishedStatus('TRUE'),      true,  'casilla marcada');
eq(sandbox._isPublishedStatus('⚠️'),        false, 'advertencia NO es publicado');
eq(sandbox._isPublishedStatus('Por publicar'), false, 'programado NO es publicado');
eq(sandbox._isPublishedStatus(''),          false, 'vacío');

group('_trackerParseDate — fechas heterogéneas');
eq(sandbox._trackerParseDate('29 de mayo', 2026), '2026-05-29', 'español sin año');
eq(sandbox._trackerParseDate('24 de Julio', 2026), '2026-07-24', 'español con mayúscula');
eq(sandbox._trackerParseDate('12/08/2026'),        '2026-08-12', 'dd/mm/yyyy');
eq(sandbox._trackerParseDate('2026-08-12'),        '2026-08-12', 'ISO');
eq(sandbox._trackerParseDate(''),                  '',           'vacío');

group('_trackerStatusOf — elegir la columna de estatus correcta');
eq(sandbox._trackerStatusOf({'ESTATUS CONTENIDO':'Aprobado'}), 'Aprobado', 'columna estándar');
eq(sandbox._trackerStatusOf({'TALENTO':'x','PUBLICADO':'✅'}), '✅', 'cae a PUBLICADO si no hay estatus textual');
eq(sandbox._trackerStatusOf({
     'STATUS':'•⁠ 1° contenido: publicado YT\n•⁠ 2° contenido: pendiente',
     'PUBLICADO':'✅'
   }), '✅', 'ignora columna con prosa de seguimiento y usa la real');

group('parseCSV — detección de la fila de headers');
{
  // headers en la fila 1
  const simple = 'NOMBRE,ESTATUS CONTENIDO\nAna,Publicado\n';
  eq(sandbox.parseCSV(simple).length, 1, 'CSV plano: 1 fila de datos');
  eq(sandbox.parseCSV(simple)[0]['NOMBRE'], 'Ana', 'lee el valor');

  // banner de agrupación encima de los headers reales
  const conBanner = 'MI TRACKER,,,\n,,,\nNOMBRE,PLATAFORMA,FECHA DE POST,ESTATUS CONTENIDO\nAna,TikTok,12/08/2026,Publicado\n';
  const r = sandbox.parseCSV(conBanner);
  eq(r.length, 1, 'con banner: sigue habiendo 1 fila de datos');
  eq(Object.keys(r[0]).includes('ESTATUS CONTENIDO'), true, 'encontró los headers reales, no el banner');
}

group('_trackerNormalizeRows — celdas combinadas y filas basura');
{
  const rows = [
    {TALENTO:'KNORR'},                                                              // separador de marca
    {TALENTO:'Chef en Proceso','FECHA DE PUBLICACIÓN':'29 de mayo',PUBLICADO:'✅'},
    {TALENTO:'','FECHA DE PUBLICACIÓN':'26 de Junio',PUBLICADO:'✅'},               // hereda nombre
    {TALENTO:'','FECHA DE PUBLICACIÓN':'',PUBLICADO:''},                            // vacía
    {TALENTO:'TOTAL DE CONTENIDOS'},                                                // leyenda del pie
  ];
  const out = sandbox._trackerNormalizeRows(rows);
  eq(out.length, 2, 'quedan solo las 2 filas reales');
  eq(sandbox._trackerGet(out[1], lex('TRACKER_NAME_KEYS')), 'Chef en Proceso',
     'la segunda fila heredó el talento de la primera');
}

group('parseEscenarioRows — creadores, totales y basura');
{
  const rows = [
    {NOMBRE:'Ana Beauty', PLATAFORMA:'TikTok', 'CANTIDAD DE CONTENIDO':'4',
     'VIEWS ESTIMADAS TOTALES':'300.000', 'INTERACCIONES ESTIMADAS TOTALES':'25.000', COSTO:'$80.000'},
    {NOMBRE:'', PLATAFORMA:'Instagram', 'CANTIDAD DE CONTENIDO':'2',
     'VIEWS ESTIMADAS TOTALES':'100.000', 'INTERACCIONES ESTIMADAS TOTALES':'8.000', COSTO:''},
    {NOMBRE:'Knorr: sigue con barrio, urbano, calle'},                               // nota, no creador
    {NOMBRE:'BIG NUMBERS', 'CANTIDAD DE CONTENIDO':'6',
     'VIEWS ESTIMADAS TOTALES':'400.000', 'INTERACCIONES ESTIMADAS TOTALES':'33.000'},
  ];
  const p = sandbox.parseEscenarioRows(rows);
  eq(p.creators.length, 1, 'un solo creador (la nota se descarta)');
  eq(p.creators[0].nombre, 'Ana Beauty', 'nombre correcto');
  eq(p.creators[0].contenidosTotal, 6, 'suma las 2 plataformas (celda combinada)');
  eq(p.creators[0].viewsEstTotal, 400000, 'suma views de ambas filas');
  eq(p.goal && p.goal.totalContenidos, 6, 'detecta la fila BIG NUMBERS como meta');
}


// ===========================================================================
group('medio de contacto preferido — cómo se lee y a dónde lleva');
{
  const label = sandbox.medioClienteLabel;
  eq(label({ medioPreferido:'whatsapp' }), 'WhatsApp', 'medio de la lista');
  eq(label({ medioPreferido:'inventado' }), 'Sin definir', 'un medio que no existe no rompe la ficha');
  eq(label({}), 'Sin definir', 'contacto viejo, sin el campo');
  // Con "Otro" gana el texto libre: poner la etiqueta genérica encima de lo que
  // alguien escribió borra la única parte que informa.
  eq(label({ medioPreferido:'otro', medioDetalle:'Discord' }), 'Discord', 'Otro muestra el detalle');
  eq(label({ medioPreferido:'otro', medioDetalle:'  ' }), 'Otro', 'Otro sin detalle cae a la etiqueta');

  const href = sandbox.celClienteHref;
  eq(href({ celular:'+52 55 1234 5678', medioPreferido:'whatsapp' }),
     'https://wa.me/525512345678', 'prefiere WhatsApp → abre el chat, sin separadores');
  eq(href({ celular:'+52 55 1234 5678', medioPreferido:'llamada' }),
     'tel:+525512345678', 'prefiere llamada → marca, conservando el +');
  eq(href({ celular:'5512345678', medioPreferido:'correo' }),
     'tel:5512345678', 'sin lada no se inventa un +');
  eq(href({ celular:'', medioPreferido:'whatsapp' }), '', 'sin número no hay enlace');
}

group('validarContactoCliente — el medio preferido tiene que ser alcanzable');
{
  const v = sandbox.validarContactoCliente;
  eq(v({ name:'Ana', medioPreferido:'na' }), '', 'sin medio ni celular: nada que exigir');
  eq(v({ name:'Ana', celular:'+52 55 1234 5678', medioPreferido:'whatsapp' }), '',
     'WhatsApp con celular: pasa');
  // Decir "prefiere WhatsApp" sin dejar número es una ficha que no sirve para
  // lo único que este campo vino a resolver.
  eq(v({ name:'Ana', medioPreferido:'whatsapp' }).includes('agrega el celular'), true,
     'WhatsApp sin celular: se explica qué falta');
  eq(v({ name:'Ana', medioPreferido:'correo' }).includes('agrega el correo'), true,
     'Correo sin correo: se explica qué falta');
  eq(v({ name:'Ana', medioPreferido:'linkedin' }).includes('agrega el LinkedIn'), true,
     'LinkedIn sin perfil: se explica qué falta');
  eq(v({ name:'Ana', medioPreferido:'slack' }), '', 'Slack no depende de ningún campo de la ficha');
  eq(v({ name:'Ana', celular:'123' }).includes('no parece un número'), true,
     'un celular de 3 dígitos es un dedo, no un teléfono');
  eq(v({ name:'Ana', celular:'55 1234 5678 ext. 12', medioPreferido:'llamada' }), '',
     'se respeta lo que escribieron: extensiones y notas no invalidan el número');
}

(async function(){
  // ===========================================================================
  // Persistencia diferencial de campañas.
  // persistCampaigns antes leía la colección entera y reescribía TODAS las
  // campañas en cada uno de los 47 puntos que llaman setData('campaigns').
  // Ahora solo escribe lo que cambió — y eso es código de escritura de datos,
  // así que se prueba: saltarse una escritura necesaria sería pérdida silenciosa.
  group('persistCampaigns — solo escribe lo que cambió');
  {
    const ops = OPS;                       // instrumentado en el stub de firebase
    vm.runInContext('currentUser = { uid: "u1" };', sandbox);
    const persist = sandbox.persistCampaigns;
    const camps = [
      { id:'a', name:'Alpha', status:'En proceso' },
      { id:'b', name:'Beta',  status:'En proceso' },
    ];

    const reset = () => { ops.set = []; ops.delete = []; ops.commits = 0; };

    // 1ª vez: sin huellas previas → escribe ambas
    reset();
    await persist(camps);
    eq(ops.set.sort(), ['a','b'], 'primera escritura: persiste las 2 campañas');

    // 2ª vez sin cambios → no escribe NADA, ni siquiera hace commit
    reset();
    await persist(camps);
    eq(ops.set.length, 0, 'sin cambios: 0 escrituras');
    eq(ops.commits, 0, 'sin cambios: ni siquiera abre commit');

    // cambia solo una → escribe solo esa
    reset();
    camps[1].status = 'Completada';
    await persist(camps);
    eq(ops.set, ['b'], 'solo se reescribe la campaña que cambió');

    // eliminar una → se borra del servidor
    reset();
    const menos = [camps[0]];
    await persist(menos);
    eq(ops.delete, ['b'], 'la campaña eliminada se borra');
    eq(ops.set.length, 0, 'y no se reescribe la que quedó igual');

    // un campo grande no cuenta como cambio (se strippea antes de escribir)
    reset();
    menos[0].trackerRows = [{a:1},{b:2}];
    await persist(menos);
    eq(ops.set.length, 0, 'cambiar trackerRows no dispara escritura (no se persiste)');
  }
  // ===========================================================================
  console.log('\n' + (fail === 0
    ? '✅ ' + pass + ' pruebas OK'
    : '❌ ' + fail + ' fallaron de ' + (pass+fail)));
  process.exit(fail === 0 ? 0 : 1);
})();
