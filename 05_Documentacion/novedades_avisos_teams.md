# Avisos de Helios en Microsoft Teams (parche 30, 13/11/2026)

## Qué hace

Los avisos importantes de Helios llegan como mensaje a un **canal de Teams**, en una tarjeta con el problema, el cliente, el servicio y el canal, y un botón **Abrir Helios**.

| Llega a Teams | Ejemplo |
|---|---|
| Alerta grave sin asignar (en rojo) | "🔴 Alerta grave sin asignar · No se aprueba ninguna operación · CLI_006, Transferencias por app" |
| Alerta asignada (a mano o por regla) | "Alerta asignada a equipo Mesa · Suben los rechazos · CLI_004, Transferencias por API" + comentario + a quién le llegó |
| Pre-alerta avisada a Soporte | "Pre-alerta avisada a Soporte · Los rechazos vienen subiendo en CLI_004… · Avisó Ana al equipo Mesa" |
| Devuelta | "Devolvieron una alerta al analista" + el motivo |
| Resuelta | "Alerta resuelta por Ana" + el comentario, o "se normalizó sola" |

Los comentarios, y el momento en que alguien toma una alerta, **no** se mandan, para no llenar el canal. La campanita y los avisos push siguen igual.

A la campanita le llega un aviso por persona. **Al canal llega un solo mensaje por acción**, que dice a quiénes les llegó. Si una misma acción genera varios hechos (por ejemplo, una escena de la demo con varias alertas nuevas), van todos en un mensaje: hasta 6, y después "Y N avisos más en Helios".

## Cómo conectarlo (una sola vez)

Los "Incoming Webhook" viejos de Teams (conectores de Office 365) **dejaron de funcionar en mayo de 2026**. Ahora se usa **Workflows**, que ya viene con Teams.

1. **En Teams, crear el canal** (por ejemplo "Helios – Alertas") dentro de un equipo de Teams.
2. En ese canal, tocá **•••** (más opciones) → **Workflows**.
3. Buscá la plantilla **"Publicar en un canal cuando se recibe una solicitud de webhook"** (en inglés: *"Post to a channel when a webhook request is received"*) y elegila.
4. Ponele un nombre (por ejemplo "Helios") → **Siguiente**. Elegí el equipo y el canal → **Agregar flujo de trabajo**.
5. Teams muestra una **dirección** larga (empieza con `https://` y suele tener `logic.azure.com` o `powerplatform.com`). **Copiala.** Esa dirección es la llave del canal: no la compartas ni la subas a GitHub.
6. **En Cloudflare:** Workers → `worker-alertas-cron` → **Settings** → **Variables and Secrets** → **Add** → tipo **Secret**, nombre **`TEAMS_WEBHOOK`**, valor: la dirección. **Deploy**.
7. **Publicá el Worker nuevo** (`01_Worker/worker_alertas_cron.js`, "Edit code" → pegar → Deploy). No hay SQL para correr.
8. **Probalo:** entrá como Administrador → **Administración › Equipos** → recuadro **Avisos en Teams** → **Mandar aviso de prueba**. Tiene que llegar al canal en unos segundos.
9. Para verlo con la demo: tablero con `?demo` → **Preparar demo** → **Siguiente escena** varias veces. Las alertas graves sin asignar y las derivaciones aparecen en el canal.

Sin el secreto, Helios funciona igual que antes y no consulta nada de más.

## Problemas comunes

| Qué pasa | Qué hacer |
|---|---|
| El recuadro dice "Sin conectar" | Falta el secreto `TEAMS_WEBHOOK`, o se cargó como variable de texto en vez de secreto, o falta publicar el Worker después de cargarlo |
| Dice "La dirección cargada no es de un flujo de Workflows" | Por seguridad, Helios solo manda a direcciones de Microsoft (Logic Apps, Power Automate, Power Platform). Copiá de nuevo la dirección que da Workflows, sin espacios |
| "Mandar aviso de prueba" da error 401 o 403 | El flujo se desactivó o se borró, o la persona que lo creó ya no tiene acceso al canal. Crealo de nuevo y actualizá el secreto |
| La prueba anda pero no llegan los avisos | Solo llegan los cinco tipos de la tabla de arriba. Probá derivar una alerta a un equipo |
| El mensaje aparece "en nombre de" una persona | Es normal: el flujo de Workflows publica con la cuenta de quien lo creó |

## Cómo funciona por dentro

- `teams_server.js` (lo inyecta `patch30.py`). Después de cada pedido POST que crea avisos (derivar, devolver, resolver, revisar alertas, escenas de la demo, "Avisar a Soporte"), junta los avisos nuevos de esos cinco tipos y los agrupa por hecho (tipo + alerta). Manda **un** pedido al canal con una tarjeta adaptable (`type: "message"`, `application/vnd.microsoft.card.adaptive`, versión 1.4).
- Cuidado del plan gratuito: con el secreto cargado son 2 consultas más por pedido POST y 1 pedido externo solo si hubo avisos (tope de 5 segundos). Se manda después de responder (`waitUntil`). Si Teams falla, la acción en Helios igual se hace; el error queda en los logs del Worker.
- Solo se aceptan direcciones de Microsoft (`*.logic.azure.com`, `*.powerplatform.com`, `*.powerautomate.com`, `*.azure-apim.net`).
- Prueba automática: `07_Codigo_fuente/pruebas/teamstest.mjs` (Teams simulado).
- Más adelante: un canal por equipo (con una columna en `equipos`) o mensajes directos a cada persona (eso necesita una app registrada en Azure y Microsoft Graph).
