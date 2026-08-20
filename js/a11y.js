/* Campaign OS — Teclado para lo que no es <button>
   ============================================================
   La app tiene ~47 controles reales escritos como <div onclick> o
   <span onclick>: las tarjetas de campaña, los documentos, las filas de
   influencers, los avisos de la campanita, el volver de los detalles, los
   swatches del onboarding y — el peor — el `.task-check`, que es la casilla
   con la que se marca una tarea como hecha.

   El mouse los usa sin problema. El teclado no los ve: un div no entra en el
   orden de tabulación y no dispara click con Enter. O sea que había tareas que
   sólo se podían completar con mouse.

   Reescribirlos como <button> significaba tocar decenas de templates dentro de
   strings generados en campaigns.js, ui.js, tasks-board.js y creators.js, con
   riesgo alto de romper estilos (un <button> trae padding, borde y font
   propios) para un cambio que no se puede verificar visualmente en toda la app.
   Este archivo hace lo mismo desde un solo lugar y sin tocar el markup:

     1. Marca cada control con tabindex="0" y el role que le toca, así entra en
        el orden de tabulación y el lector de pantalla lo anuncia como control
        y no como texto suelto.
     2. Escucha Enter y Espacio y los convierte en click.
     3. Un MutationObserver repite el marcado sobre todo lo que la app dibuje
        después, que es casi todo.

   Lo que NO se marca: los fondos que cierran modales. Son clickeables a
   propósito pero no son un control — meterlos en la tabulación agrega una
   parada muerta antes de cada modal. Para cerrar ya están Escape y la X.
   ============================================================ */

(function () {
  'use strict';

  // Ya son operables por teclado de fábrica, o alguien ya los configuró a mano.
  var YA_OPERABLE = 'a[href],button,input,select,textarea,summary,[tabindex],[role]';

  // Fondos y capas de cierre: clickeables, pero no son un control.
  var NO_MARCAR = '.sidebar-overlay,.modal-overlay,.modal-backdrop,.overlay,.backdrop';

  function rolDe(el) {
    // El check de tarea es una casilla, no un botón: anunciarlo como "botón"
    // esconde justo el dato que importa, que es si está marcada o no.
    if (el.classList.contains('task-check')) return 'checkbox';
    return 'button';
  }

  function marcar(el) {
    if (!el || el.dataset.a11yListo === '1') return;
    if (el.matches(YA_OPERABLE) || el.matches(NO_MARCAR)) return;
    // Si vive dentro de un control que ya es operable, marcarlo agrega una
    // segunda parada de tabulación para la misma acción.
    if (el.closest('a[href],button')) return;

    var rol = rolDe(el);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', rol);
    if (rol === 'checkbox') {
      el.setAttribute('aria-checked', el.classList.contains('done') ? 'true' : 'false');
    }
    el.dataset.a11yListo = '1';
  }

  /* Los títulos de sección son <span class="card-title"> y <h4> sueltos: se
     ven como encabezados pero el lector de pantalla no los ofrece para saltar
     de sección, así que en el Resumen —cinco bloques— la única forma de
     recorrerlo era leerlo entero. Se les pone el rol y el nivel en vez de
     cambiar la etiqueta: un <h3> arrastra márgenes y tamaños propios que
     descuadran las cabeceras de tarjeta. El nivel es 2 porque el título de la
     página (topbar) es el h1. */
  var TITULOS = '.card-title,.detail-title';
  function marcarTitulo(el) {
    if (!el || el.dataset.a11yTitulo === '1') return;
    if (/^H[1-6]$/.test(el.tagName) || el.hasAttribute('role')) { el.dataset.a11yTitulo = '1'; return; }
    el.setAttribute('role', 'heading');
    el.setAttribute('aria-level', el.classList.contains('detail-title') ? '2' : '2');
    el.dataset.a11yTitulo = '1';
  }

  function barrer(raiz) {
    if (!raiz || raiz.nodeType !== 1) return;
    if (raiz.matches && raiz.matches(TITULOS)) marcarTitulo(raiz);
    var tits = raiz.querySelectorAll ? raiz.querySelectorAll(TITULOS) : [];
    for (var t = 0; t < tits.length; t++) marcarTitulo(tits[t]);
    if (raiz.hasAttribute && raiz.hasAttribute('onclick')) marcar(raiz);
    var hijos = raiz.querySelectorAll ? raiz.querySelectorAll('[onclick]') : [];
    for (var i = 0; i < hijos.length; i++) marcar(hijos[i]);
  }

  // Enter y Espacio activan; Espacio además scrollea la página si no se frena.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;

    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (el.dataset.a11yListo !== '1') return;
    // Si el foco está escribiendo en algún lado, Enter y Espacio son texto.
    if (el.isContentEditable) return;

    e.preventDefault();
    el.click();

    if (el.getAttribute('role') === 'checkbox') {
      // El handler de la app cambia la clase; se lee después del click.
      el.setAttribute('aria-checked', el.classList.contains('done') ? 'true' : 'false');
    }
  });

  // El estado de la casilla también cambia por mouse o por otra pestaña.
  document.addEventListener('click', function (e) {
    var chk = e.target && e.target.closest && e.target.closest('[role="checkbox"][data-a11y-listo="1"]');
    if (chk) chk.setAttribute('aria-checked', chk.classList.contains('done') ? 'true' : 'false');
  }, true);

  /* ── La app queda inerte mientras se ve el login ──
     El login es un overlay con z-index 10000: tapa la app, pero la app sigue
     ahí. Con la pantalla de login puesta hay 30 elementos tabulables y 29 están
     detrás de ella. O sea que quien entra con Tab recorre el sidebar entero —
     Dashboard, Campañas, Equipo — sin ver nada, y recién después llega al botón
     de Google; y un lector de pantalla lee toda esa navegación antes del
     formulario, como si ya hubiera sesión iniciada.

     `inert` lo resuelve de una: saca al elemento y a todo lo que tiene adentro
     del orden de tabulación, del árbol de accesibilidad y de los clics. Se
     aplica a los hermanos del login en vez de a un contenedor puntual porque
     el body tiene 30 hijos directos (sidebar, main, 17 modales, el FAB) y
     nombrarlos uno por uno se rompe en cuanto se agregue el 31. */
  function sincronizarInert() {
    var login = document.getElementById('loginScreen');
    if (!login) return;
    var visible = !login.classList.contains('hidden') &&
                  getComputedStyle(login).display !== 'none';
    var hijos = document.body.children;
    for (var i = 0; i < hijos.length; i++) {
      var el = hijos[i];
      if (el === login) { el.inert = false; continue; }
      var t = el.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'LINK' || t === 'TEMPLATE') continue;
      el.inert = visible;
    }
  }

  function arrancar() {
    barrer(document.body);
    sincronizarInert();

    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var añadidos = muts[i].addedNodes;
        for (var j = 0; j < añadidos.length; j++) barrer(añadidos[j]);
      }
      // Hijos nuevos del body nacen sin el inert que les toca.
      sincronizarInert();
    }).observe(document.body, { childList: true, subtree: true });

    // El login se muestra y se esconde con una clase, no desmontándolo.
    var login = document.getElementById('loginScreen');
    if (login) {
      new MutationObserver(sincronizarInert)
        .observe(login, { attributes: true, attributeFilter: ['class', 'style'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
