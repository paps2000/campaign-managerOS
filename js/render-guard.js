/* Campaign OS — Repintar sólo lo que cambió
   =========================================
   Casi todas las vistas se pintan con `el.innerHTML = html`. Eso tira el
   subárbol entero y lo vuelve a construir aunque el HTML sea idéntico letra
   por letra, que es el caso normal: `rerenderCurrent()` corre en CADA snapshot
   de Firestore (campaigns, globalTasks, config, members, clients, events…) y
   el tablero se repinta además cada vez que termina una bajada de sheet.
   Medido en el Resumen: siete escrituras por repintado, las siete con el mismo
   HTML que ya estaba puesto.

   Dos cosas se rompen con eso, y las dos se sienten como que la app se traba:

   1. Los clics se pierden. El navegador sólo dispara `click` si el `mousedown`
      y el `mouseup` caen en el mismo nodo. Si un repintado cae entre los dos,
      el botón que se apretó ya no existe y el clic NUNCA llega. Con un
      repintado cada pocos cientos de milisegundos, apretar "Conectar Google"
      —o cualquier botón del tablero— es una lotería.
   2. Las animaciones de entrada vuelven a empezar, porque cada elemento
      renace. Ver [[animaciones-de-entrada]].

   El arreglo es escribir sólo si el HTML cambió de verdad. Se memoriza la
   última cadena que ESTE código escribió en cada elemento (el getter de
   innerHTML no sirve para comparar: el navegador re-serializa y normaliza
   comillas y atributos, así que nunca da igual a lo escrito).

   Dos salvaguardas para no saltarse una escritura que sí hacía falta:
   - `innerHTML = ''` nunca se salta. Es el "vaciar antes de appendChild", y
     saltarlo dejaría el contenido viejo pegado.
   - Si alguien añadió o quitó hijos directos después de nuestra escritura, el
     memo ya no describe lo que hay: se reescribe.

   Va antes que todo lo demás en index.html porque parcha un prototipo y tiene
   que estar puesto antes de la primera escritura. Script CLÁSICO, como el
   resto: ver [[arquitectura-archivos]]. */

(function(){
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if(!desc || !desc.set || !desc.get) return;   // navegador raro: mejor no tocar

  const ultimo = new WeakMap();   // elemento -> { html, hijos }

  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(valor){
      const html = String(valor);
      const memo = ultimo.get(this);
      if(html && memo && memo.html === html && memo.hijos === this.childNodes.length) return;
      desc.set.call(this, html);
      ultimo.set(this, { html, hijos: this.childNodes.length });
    }
  });
})();
