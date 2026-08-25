/* Campaign OS — Modales: apertura, cierre, foco y confirmación
   ==============================================
   `confirmar()` sustituye al confirm() del navegador, que rotula sus botones
   Aceptar/Cancelar: en una acción destructiva eso se acepta sin leer. Aquí el
   botón dice la acción ("Borrar las 14 campañas").

   Y la trampa de foco: un modal es un div que aparece, así que sin esto el
   teclado se quedaba recorriendo la página de abajo, invisible tras el overlay.
   Script CLÁSICO a propósito (NO type="module"): el HTML llama estas funciones
   desde atributos onclick/onchange, que sólo resuelven contra el scope global,
   y todos los archivos de js/ comparten ese mismo scope. El orden de <script>
   en index.html es el orden real de ejecución. */

// ============================================================
// MODALS
// ============================================================
// Stacking: cada modal que se abre se pone por encima del anterior, así los
// modales anidados (p.ej. "creadores anteriores" sobre el editor de escenario)
// no quedan tapados por el de atrás.
let _modalZ = 1000;
// ============================================================
// CONFIRMAR
// ============================================================
// Sustituye a confirm(). El nativo rotula sus botones Aceptar/Cancelar, así que
// en una acción destructiva se confirma sin leer qué se acepta; aquí el botón
// dice la acción ("Borrar las 14 campañas") y el cuerpo dice qué se pierde.
// Devuelve una promesa: `if(!await confirmar({...})) return;`
function confirmar({ title, body, bodyHtml, confirmLabel, cancelLabel, danger, foco } = {}) {
  return new Promise(resolve => {
    const modal  = document.getElementById('confirmModal');
    const okBtn  = document.getElementById('confirmOkBtn');
    const noBtn  = document.getElementById('confirmCancelBtn');
    // Sin el diálogo en el DOM no se puede preguntar; negar es lo seguro en una
    // acción destructiva, que es para lo único que se usa esto.
    if(!modal || !okBtn || !noBtn) { resolve(false); return; }

    document.getElementById('confirmTitle').textContent = title || '¿Continuar?';
    // `body` es texto y se escapa solo; `bodyHtml` es para los diálogos que
    // necesitan estructura —una lista de quiénes, de qué van a poder ver— y lo
    // arma el llamador, que es quien sabe escapar lo que viene de datos.
    const cuerpo = document.getElementById('confirmBody');
    // .confirm-body trae white-space:pre-line, que existe para respetar los
    // saltos del texto plano. Con HTML eso reproduce cada salto y sangría de la
    // plantilla como espacio en blanco de verdad.
    cuerpo.classList.toggle('con-html', !!bodyHtml);
    if(bodyHtml) cuerpo.innerHTML = bodyHtml; else cuerpo.textContent = body || '';
    okBtn.textContent = confirmLabel || 'Continuar';
    noBtn.textContent = cancelLabel  || 'Cancelar';
    okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

    const cerrar = (valor) => {
      okBtn.removeEventListener('click', siClick);
      noBtn.removeEventListener('click', noClick);
      document.removeEventListener('keydown', onKey);
      closeModal('confirmModal');
      resolve(valor);
    };
    const siClick = () => cerrar(true);
    const noClick = () => cerrar(false);
    const onKey = (e) => {
      if(e.key === 'Escape') { e.preventDefault(); cerrar(false); }
      if(e.key === 'Enter')  { e.preventDefault(); cerrar(true); }
    };

    okBtn.addEventListener('click', siClick);
    noBtn.addEventListener('click', noClick);
    document.addEventListener('keydown', onKey);
    openModal('confirmModal');
    // El foco arranca en Cancelar: en un diálogo destructivo, la tecla que se
    // aprieta sin pensar no debe ser la que borra. `foco:'ok'` lo cambia para
    // los avisos que no destruyen nada y donde seguir es lo normal.
    setTimeout(() => { try { (foco === 'ok' ? okBtn : noBtn).focus(); } catch(e){} }, 30);
  });
}

// ============================================================
// FOCO EN MODALES
// Los modales eran divs que aparecían: el foco del teclado se quedaba atrás,
// en el botón que los abrió, así que Tab seguía recorriendo la página de
// abajo — invisible, tapada por el overlay — y Esc no hacía nada. Esto lo
// mueve adentro, lo encierra mientras el modal está abierto y lo devuelve
// al botón de origen al cerrar.
// ============================================================

// Pila, no variable suelta: la app encima de un modal abre otro (elegir
// creador dentro de escenario) y al cerrar el de arriba el foco tiene que
// volver al de abajo, no a la página.
const _focoPrevio = [];

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function _enfocables(el) {
  return Array.from(el.querySelectorAll(FOCUSABLES))
    .filter(n => n.offsetWidth || n.offsetHeight || n.getClientRects().length);
}

// Tab en el último elemento vuelve al primero, y Shift+Tab al revés. Se
// escucha en captura para ganarle a los handlers de cada modal.
function _trampaTab(e) {
  if(e.key !== 'Tab') return;
  const abiertos = document.querySelectorAll('.modal-overlay.open');
  const modal = abiertos[abiertos.length - 1];
  if(!modal) return;
  const f = _enfocables(modal);
  if(!f.length) { e.preventDefault(); modal.focus(); return; }
  const primero = f[0], ultimo = f[f.length - 1];
  if(e.shiftKey && (document.activeElement === primero || !modal.contains(document.activeElement))) {
    e.preventDefault(); ultimo.focus();
  } else if(!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault(); primero.focus();
  }
}
document.addEventListener('keydown', _trampaTab, true);

// Esc cierra el modal de más arriba. Si alguien ya trató la tecla (el
// confirm tiene su propio handler, que además resuelve su promesa), no se
// vuelve a cerrar encima.
document.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || e.defaultPrevented) return;
  const abiertos = document.querySelectorAll('.modal-overlay.open');
  const modal = abiertos[abiertos.length - 1];
  if(modal) { e.preventDefault(); closeModal(modal.id); }
});

function openModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  _focoPrevio.push(document.activeElement);
  _modalZ += 2;
  el.style.zIndex = _modalZ;
  el.classList.add('open');
  // En un tick, no en requestAnimationFrame: mientras el modal está
  // display:none no hay nada enfocable, pero rAF no corre si la pestaña
  // está en segundo plano y el foco se quedaría afuera. Un timeout de 0
  // sigue llegando antes que los setTimeout(30-50ms) con los que varias
  // pantallas enfocan su propio campo, así que quien tenga una preferencia
  // la conserva.
  setTimeout(() => {
    if(el.contains(document.activeElement)) return;
    const f = _enfocables(el);
    if(f.length) { try { f[0].focus(); } catch(e){} }
    else { el.setAttribute('tabindex','-1'); try { el.focus(); } catch(e){} }
  }, 0);
  // Las píldoras de pestaña se miden con offsetWidth, que da 0 mientras el modal
  // está oculto. Se remiden ya abierto, en el frame siguiente, para que el tab
  // activo tenga fondo desde el primer vistazo.
  requestAnimationFrame(() => {
    try { if(typeof initTransitions === 'function') initTransitions(el); } catch(e){}
  });
}
function closeModal(id) {
  const el = document.getElementById(id);
  if(!el) return;
  const finish = () => {
    el.classList.remove('open', 'is-closing');
    el.style.zIndex = '';
    // Cada credencial tiene su propio rAF y sus listeners globales: dejarlas
    // montadas tras cerrar el modal deja loops corriendo sobre DOM invisible.
    if(typeof unmountHolo === 'function') {
      if(id === 'profileModal')     unmountHolo('profileHoloHost');
      if(id === 'editProfileModal') unmountHolo('holoPreviewHost');
    }
    // Si ya no queda ningún modal abierto, reinicia el contador.
    if(!document.querySelector('.modal-overlay.open')) _modalZ = 1000;
    // Devolver el foco a quien abrió. Se comprueba que siga en el documento:
    // varias listas se re-renderean mientras el modal está abierto y el botón
    // original ya no existe cuando volvemos.
    const previo = _focoPrevio.pop();
    if(previo && previo !== document.body && document.contains(previo)) {
      try { previo.focus({ preventScroll:true }); } catch(e){}
    }
  };
  const rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(rm || !el.classList.contains('open')) { finish(); return; }
  el.classList.add('is-closing');
  // Se lee la duración real del CSS en vez de escuchar animationend: con
  // varias animaciones compitiendo en el mismo elemento (fadeIn de .open y
  // modalOut de .is-closing) el evento no dispara de forma fiable.
  let ms = 150;
  try {
    const d = getComputedStyle(el).animationDuration.split(',')[0].trim();
    ms = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
    if(!isFinite(ms) || ms <= 0) ms = 150;
  } catch(e){}
  setTimeout(finish, ms);
}
