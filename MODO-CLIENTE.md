# Modo cliente · Campaign OS

Guía de uso. Dos partes: **cómo funciona** (para el equipo) y **cómo explicárselo al cliente** (texto listo para copiar).

---

## Parte 1 — Cómo funciona (equipo Think Y)

### Qué resuelve

Antes: cada actualización de estatus significaba exportar una hoja, armar un PDF y mandarlo por correo. El cliente veía una foto congelada y volvía a preguntar tres días después.

Ahora: le mandas **un link, una sola vez**. Ese link muestra siempre el estado actual de su campaña. No caduca por sí solo, no hay que reenviarlo, y no requiere que el cliente tenga cuenta ni contraseña.

### Activarlo (30 segundos)

1. Abre la campaña → botón **🔗 Modo cliente** (arriba a la derecha, junto a "Descargar resultados").
2. Clic en **Activar modo cliente**.
3. Se genera el link. Botón **Copiar** y ya lo puedes mandar.

Eso es todo. El link queda vivo desde ese momento.

### Qué ve el cliente

- **Fase del proyecto** — en qué paso va (kickoff, producción, publicación, reporte).
- **Publicaciones** — cuántas publicadas sobre el total cerrado con barra de avance, más el desglose: aprobadas, en revisión interna, por publicar.
- **Calendario** — mes por mes, qué creador publica qué día, con color por estatus. Navegable hacia atrás y adelante.
- **Big numbers** — views, alcance, interacciones, likes, ER. Y si hay escenario vinculado, barras de cumplimiento contra lo estimado.
- **Desempeño por perfil** — tabla por creador y plataforma: posts, views, alcance, interacciones.
- **Documentos** — solo los que tú marcaste como visibles.

Todo con la identidad de Think Y, responsive (se ve bien en celular), y con la fecha de última actualización visible.

### Qué NO ve el cliente

Esto es lo importante y conviene tenerlo claro para poder afirmarlo con seguridad:

- **Presupuestos, costos, márgenes, CPV, CPI, CPE** — ninguna métrica de dinero.
- **Cualquier otra campaña** — el link es de una campaña y solo de esa.
- **Notas internas, tareas, pendientes del equipo, contactos.**

No es que estén ocultos con CSS o "escondidos" en la página. Al activar el modo cliente se publica un **resumen aparte** que literalmente no contiene esos campos. Aunque alguien abriera el inspector del navegador, ahí no hay nada que encontrar.

### Cómo se mantiene actualizado

Automático. Cada vez que el equipo guarda un cambio en la campaña, el resumen del cliente se refresca solo (unos segundos después). No hay que hacer nada.

Si quieres forzarlo antes de una junta: abre **🔗 Modo cliente** → **Actualizar datos ahora**.

### Control de documentos

Dos formas de decidir qué documentos ve el cliente:

- **Al cargar un documento nuevo:** toggle **👁 Visible para el cliente**. Viene **apagado por defecto** — nada se comparte por accidente.
- **Después:** en el modal de Modo cliente hay una lista con checkbox por documento. Palomea o despalomea cuando quieras.

En las listas de documentos del equipo, los que el cliente ve llevan un badge **👁 Cliente** para identificarlos de un vistazo.

### Cortar el acceso

**🔗 Modo cliente** → **Desactivar link**. El link muere al instante: quien lo tenga verá "Link no disponible". Útil al cerrar una campaña o si el link salió de donde debía.

### Seguridad del link

El link lleva un token aleatorio de 24 caracteres. No es adivinable ni indexable, y no existe forma de listar campañas desde afuera: sin el token exacto no hay acceso a nada.

Dicho eso, **cualquiera con el link puede verlo** (igual que un Google Doc compartido por enlace). Mándalo por los canales normales del cliente y, si necesitas cortar, desactívalo.

---

## Parte 2 — Cómo explicárselo al cliente

### Texto listo para copiar (correo o WhatsApp)

> Hola [nombre],
>
> Te comparto el acceso al seguimiento en vivo de [campaña]:
>
> [LINK]
>
> Ahí puedes consultar en cualquier momento cómo va la campaña: cuántas publicaciones ya salieron y cuántas están aprobadas, en revisión o por publicar, el calendario de publicaciones, los resultados acumulados (views, alcance, interacciones), el desempeño de cada perfil y los documentos del proyecto.
>
> Se actualiza solo conforme avanzamos, así que no hace falta que te mandemos reportes sueltos: guarda el link y entra cuando quieras. No necesitas usuario ni contraseña.
>
> Cualquier duda me dices.

### Si te preguntan

**"¿Necesito crear una cuenta?"**
No. Abres el link y ya. Funciona en compu y celular.

**"¿Esto se actualiza o es una foto de hoy?"**
Se actualiza solo. Conforme el equipo registra avances, el link los refleja. Arriba a la derecha aparece la fecha de la última actualización.

**"¿Puedo compartirlo con mi equipo?"**
Sí, es tuyo. Solo considera que quien tenga el link puede verlo, así que compártelo dentro de tu organización.

**"¿Puedo ver el detalle de costos ahí?"**
El link está pensado para seguimiento de avance y resultados. Los temas comerciales los seguimos viendo por los canales de siempre.

**"¿Puedo descargar el reporte?"**
El link es la versión viva. Si necesitas un documento para presentar internamente, dinos y lo armamos.

### Cómo posicionarlo (tono)

Véndelo como **transparencia y ahorro de tiempo para el cliente**, no como una herramienta más que tiene que aprender:

- "Para que no tengas que pedirnos actualizaciones, aquí lo ves cuando quieras."
- "Es la misma información que revisamos nosotros, en vivo."

Evita venderlo como "nuestro dashboard" o "nuestra plataforma" — el foco es su campaña, no nuestro software.

---

## Nota técnica

El permiso en Firestore ya está aplicado y verificado (2026-08-05). La regla activa es:

```
match /clientShares/{token} {
  allow get: if true;
  allow list: if false;
  allow create, update, delete: if request.auth != null;
}
```

Comprobado en vivo: leer un token concreto funciona, **enumerar la colección está bloqueado** (nadie puede descubrir los links de otros clientes) y **escribir sin sesión está bloqueado** (nadie externo puede alterar lo que ve un cliente). No hay que volver a tocarlo: es una sola vez para todo el sistema, no por campaña.
