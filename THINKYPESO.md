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

Un envío a varias personas se escribe en un solo `batch`: o entran todas las entregas o no entra ninguna.

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

**Lo que la regla NO puede hacer cumplir:** el tope de **10 pesos al mes por persona**. Verificarlo exige contar documentos, y una regla de Firestore no cuenta. Hoy ese límite vive solo en el cliente. Si algún día importa de verdad, el camino es un documento contador por persona y periodo, escrito en la misma transacción que la entrega.

## Archivos

| Archivo | Qué hace |
|---|---|
| `js/thinky-peso.js` | Todo: calendario, saldo, borrador, envío, render. Script clásico, IIFE. |
| `assets/styles.css` | Bloque `THINKYPESO` al final. |
| `index.html` | Item del riel `data-page="thinkypeso"` y la página `#page-thinkypeso`. |
| `js/core.js` | Listener de `thinkyPesos`, título de la pestaña y enganche en `navigate()`. |
| `firestore.rules` | Espejo de las reglas de la consola. |

API pública para otras vistas (dashboard, perfil), sin duplicar el calendario:

```js
thinkyPeso.GRANT              // 10
thinkyPeso.currentPeriod()    // '2026-08'
thinkyPeso.windowState()      // {open, start, end, next}
thinkyPeso.myBalance()        // saldo del usuario actual
thinkyPeso.receivedIn(uid, p) // lo que recibió alguien en un periodo
```
