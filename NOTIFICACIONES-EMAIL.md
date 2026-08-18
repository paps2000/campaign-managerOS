# Notificaciones por correo

## Qué ya funciona sin tocar nada

Cuando alguien te etiqueta en una tarea —como **responsable**, **supervisor** o
**colaborador**— te llega el aviso dentro de la app (la campanita del topbar).
Eso ya está y no necesita configuración.

Los recordatorios de deadline (interno y cliente) también salen ahí, y ahora le
llegan a todas las personas etiquetadas en la tarea, no solo al responsable.

## ¿Cuánto cuesta?

**En dinero, cero.** Lo que sí hay que dar es una tarjeta.

El navegador no puede mandar correo: hace falta algo del lado del servidor.
Hay dos caminos y los dos salen gratis con este volumen.

### Camino A — Vercel + Resend (el recomendado: no pide tarjeta)

El proyecto ya vive en Vercel. El plan Hobby incluye funciones serverless sin
costo, y Resend regala 3,000 correos al mes / 100 al día. Con un equipo de ~10
personas etiquetándose en tareas, eso no se agota.

Requiere una función en `api/send-email.js` y cambiar `_queueEmail` para que le
haga `fetch` en vez de escribir en Firestore. Son ~40 líneas. **No está
implementado todavía** — dilo y lo hago.

### Camino B — Firebase Trigger Email (ya está el lado del cliente)

Es la extensión oficial. La app deja el correo en una colección y la extensión
lo manda. El código del cliente ya está escrito (`_queueEmail` en
`js/campaigns.js`) con el formato exacto que espera.

El pero: **la extensión corre sobre Cloud Functions, y eso obliga a pasar el
proyecto de Firebase al plan Blaze.** Blaze es pago por uso, no cuota fija:

| Concepto | Gratis al mes | Lo que gastaría este equipo |
|---|---|---|
| Invocaciones de funciones | 2,000,000 | unas cuantas al día |
| Lecturas de Firestore | 50,000/día | ya las usas hoy |
| Correos (Resend / SendGrid) | 3,000 / 100 al día | decenas |

O sea: la factura real da **$0**, pero Google exige una tarjeta y una cuenta de
facturación para activar Blaze. Si eso es el problema, vete por el camino A.

## Instalación del camino B (una vez, ~15 min)

1. **Plan Blaze** en la consola de Firebase.

2. **Proveedor de envío.** Hace falta un SMTP:
   - Resend — `smtp://resend:API_KEY@smtp.resend.com:465`
   - SendGrid — `smtp://apikey:API_KEY@smtp.sendgrid.net:465`
   - Google Workspace con contraseña de aplicación.

   Conviene verificar el dominio `thinkydigital.com` con el proveedor para que
   los correos no caigan en spam.

3. **Instalar la extensión.** Firebase → Extensions → *Trigger Email from
   Firestore* → Install. Parámetros:

   | Parámetro | Valor |
   |---|---|
   | Email documents collection | `mail` |
   | SMTP connection URI | el del paso 2 |
   | Default FROM address | `Campaign OS <no-reply@thinkydigital.com>` |
   | Users collection | *(dejar vacío)* |

4. **Reglas de Firestore.** La app escribe en `mail` desde el cliente, así que
   hay que permitirlo solo a gente autenticada del workspace:

   ```
   match /mail/{docId} {
     allow create: if request.auth != null
       && request.auth.token.email.matches('.*@thinkydigital[.]com$');
     allow read, update, delete: if false;
   }
   ```

5. **Prender el interruptor.** En Firestore, crear el documento
   `workspaces/default/config/notifications` con:

   ```json
   { "enabled": true }
   ```

   Sin ese documento —o con `enabled: false`— la app no encola nada. Es el
   apagador general si algún día hay que cortar el correo sin desplegar.

## Cómo se ve una vez prendido

- En **Ajustes → Notificaciones** aparece un switch personal:
  *"Mandarme también un correo cuando me etiqueten en una tarea"*.
  Se guarda en el perfil (`emailNotifs`), y quien lo apaga sigue viendo la
  campanita.
- El asunto del correo dice el papel y la tarea: `Supervisor · Cerrar
  presupuesto Q4`.
- El cuerpo trae campaña, deadline interno, deadline cliente, notas y un botón
  a Pendientes.
- Solo se manda correo al **etiquetar**. Los recordatorios de deadline no van
  por correo: a diario serían ruido y la gente los filtra.
