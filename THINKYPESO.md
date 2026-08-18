# ThinkyPeso · Campaign OS

Moneda interna de reconocimiento. Vive en la pestaña **🪙 ThinkyPesos** del riel.

---

## Las reglas

1. Cada persona registrada recibe **10 ThinkyPesos al mes**.
2. Solo se pueden repartir durante la **última semana del mes** — los últimos 7 días naturales, de las 00:00 del primero de esos días a las 23:59:59 del último.
3. Los divides como quieras: los 10 a una sola persona, de uno en uno, o cualquier combinación.
4. **Ningún peso viaja sin motivo escrito.** Mínimo 12 caracteres, máximo 280, y es obligatorio por cada persona a la que le des.
5. Lo que no repartes **se pierde**. No se acumula para el mes siguiente.
6. Puedes **deshacer** un envío tuyo mientras la ventana siga abierta. Cerrado el mes, ya no.

Ejemplos de ventana: agosto 2026 → del 25 al 31. Febrero 2027 → del 22 al 28. Se calcula desde el último día real del mes, así que los meses de 30 días y los febreros bisiestos salen solos.

---

## La automatización, y por qué no hay cron

**El abono mensual no se escribe en ningún lado: se deriva del calendario.**

El saldo de cualquier persona es siempre:

```
saldo = 10 − (lo que ya mandó en el periodo actual)
```

donde el periodo es `YYYY-MM` de la fecha de hoy. Al cambiar el mes, el filtro por periodo deja de contar las entregas viejas y todo el mundo amanece con 10 sin que nadie ejecute nada.

Esto se eligió sobre un job programado a propósito:

- La app es un sitio estático en Vercel — no hay servidor donde correr un cron.
- Un abono escrito puede duplicarse (dos clientes disparando el mismo job) o saltarse un mes (nadie abrió la app el día 1). Un abono derivado no puede fallar: o es el mes, o no lo es.
- La caducidad sale gratis. Como el saldo se calcula contra el periodo actual, lo del mes pasado no existe. No hay que "expirar" nada.

El único documento que se escribe es la **entrega**.

---

## Datos

Colección: `workspaces/default/thinkyPesos/{id}`

```js
{
  id: 'm8x...',            // mismo valor que el id del doc
  period: '2026-08',       // YYYY-MM — corta saldo, ranking e historial
  fromUid, fromName,       // quién da
  toUid, toName,           // quién recibe
  amount: 3,               // entero ≥ 1
  reason: 'Me salvó…',     // obligatorio, ≥ 12 caracteres
  createdAt: 1787860839547 // ms
}
```

Un envío a varias personas ya **no** va en un solo `batch`: cada entrega se
commitea por separado, junto con su movimiento del contador de saldo. Es lo que
permite que la regla verifique el tope (ver abajo). Si una falla a media lista,
las que ya salieron se quedan hechas, las demás vuelven al borrador y la app lo
dice — callarlo haría que la gente reintentara el envío completo y duplicara.

### Colección `workspaces/default/thinkyPesoBalances/{uid}_{periodo}`

```js
{
  uid:    'abc123',   // dueño; tiene que coincidir con el id del doc
  period: '2026-08',  // idem
  spent:  7,          // entero 0–10, lo repartido este mes
  undoTx: ''          // id de la entrega que se está devolviendo en este commit
}
```

Este documento **no es la fuente de verdad de la UI** — el saldo que se ve
sigue saliendo de sumar las entregas del periodo. Existe solo para que la regla
tenga contra qué cobrar el tope.

`fromName` / `toName` se guardan como respaldo para que el historial siga legible si alguien se va del workspace y desaparece de `members`. La UI siempre prefiere el nombre vivo de `allUsers`.

### Permiso en Firestore

Publicadas en la consola el **2026-08-18**. Las reglas viven ahí (Firestore → Reglas); Vercel no las despliega. El archivo `firestore.rules` de este repo es **espejo** de lo que está allá: si cambias uno, cambia el otro.

Pendiente de comprobar en vivo: la primera entrega real, el 25 de agosto. Antes de esa fecha la regla rechaza a propósito, así que un fallo hoy no prueba nada.

Lo que hace cumplir la regla:

| Regla | Qué impide |
|---|---|
| `fromUid == request.auth.uid` | dar a nombre de otra persona |
| `toUid != request.auth.uid` | darte pesos a ti mismo |
| `amount is int`, 1–10 | montos negativos, fraccionarios o absurdos |
| `reason.size() >= 12` | entregar sin motivo |
| `period == mxPeriod()` | fechar una entrega en un mes ya cerrado |
| `(hoy + 8d).month() != hoy.month()` | repartir fuera de la última semana |
| `allow update: if false` | editar el motivo o el monto después |
| `delete` solo propio y del mes en curso | borrar historial ajeno o viejo |

**Detalle que importa:** las reglas de Firestore **se suman**, no se pisan por especificidad. El `match /workspaces/{ws}/{document=**}` que ya existía daba escritura a todo el workspace, así que habría anulado la regla estricta. Por eso se partió en `match /workspaces/{ws}/{coll}/{doc=**}` con `allow write: if isThinky() && coll != 'thinkyPesos'`. Nombrar la colección permite la excepción sin tener que enumerar las demás.

**Zona horaria:** `request.time` es UTC. Sin corregir, un envío del día 31 a las 7 pm hora de México ya sería día 1 para el servidor y la regla lo rechazaría — justo en las horas de más prisa. `mxNow()` resta 6 horas (México no cambia horario desde 2022). Si alguien reparte desde otro huso, su navegador puede calcular un periodo distinto al del servidor y la entrega se rechaza; para el equipo en México no aplica.

### El tope de 10 al mes, ahora sí del lado del servidor

Verificarlo exige contar documentos y una regla de Firestore no cuenta. Se
resuelve al revés: en vez de contar entregas, se cobra cada una contra un
contador con techo.

- El doc de saldo `{uid}_{periodo}` tiene `spent` acotado a **0–10** por la
  regla, y su id lo fija la propia regla (`request.auth.uid + '_' + mxPeriod()`),
  así que nadie escribe el saldo de otro ni revive el de un mes cerrado.
- Crear una entrega **exige** que el contador suba al menos su `amount` **en el
  mismo commit** (`tpSpentAfter >= tpSpentBefore + amount`). Sin ese movimiento,
  la entrega se rechaza.
- Como el contador nunca pasa de 10, el total entregado en el periodo no puede
  pasar de 10. No importa cuántas veces se intente ni desde dónde.
- El contador **no se puede borrar** (`allow delete: if false`): borrarlo sería
  resetear el mes.
- Para **bajarlo** hay que nombrar en `undoTx` la entrega que se está borrando,
  que tiene que ser tuya, del mes en curso, y desaparecer en ese mismo commit
  (`exists` + `!existsAfter`). Y no se puede devolver más de lo que esa entrega
  valía. Así el "Deshacer" refunda de verdad sin abrir la puerta a resetear el
  saldo a mano.

Por eso el cliente **commitea una entrega a la vez**: la regla compara el alza
del contador contra el monto de la entrega de ese commit, y un lote con varias
no se puede verificar documento por documento.

**Punto ciego de la transición:** el mes en que se estrenó el contador, las
entregas anteriores a él no están contadas. `tpSend` arranca desde
`max(contador del servidor, suma de entregas del periodo)` para no regalar
saldo, pero un cliente modificado podría reclamar ese hueco una sola vez, ese
mes. A partir del siguiente periodo no existe.

**Costo en lecturas:** el commit de una entrega gasta 4 accesos de regla
(`exists`/`get`/`existsAfter`/`getAfter` del saldo); el de una devolución, 7.
El límite de Firestore es 20 por request multi-documento.

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/thinky-peso.js` | Todo: calendario, saldo, borrador, envío, render. Script clásico, IIFE. |
| `assets/styles.css` | Bloque `THINKYPESO` al final. |
| `index.html` | Item del riel `data-page="thinkypeso"` y la página `#page-thinkypeso`. |
| `js/core.js` | Listener de `thinkyPesos`, título de la pestaña y enganche en `navigate()`. |
| `firestore.rules` | Espejo de las reglas de la consola. |

> Las reglas de este repo son **espejo**: hay que pegarlas en Firebase →
> Firestore → Reglas para que surtan efecto. Vercel no las despliega.

API pública para otras vistas (dashboard, perfil), sin duplicar el calendario:

```js
thinkyPeso.GRANT              // 10
thinkyPeso.currentPeriod()    // '2026-08'
thinkyPeso.windowState()      // {open, start, end, next}
thinkyPeso.myBalance()        // saldo del usuario actual
thinkyPeso.receivedIn(uid, p) // lo que recibió alguien en un periodo
```
