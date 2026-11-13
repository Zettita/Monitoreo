# Respaldo: Worker antes de la corrección del asistente (parche 28b, 13/11)

`worker_alertas_cron.js` es la versión publicada el 13/11 con el asistente de IA (parche 28) **antes** de la corrección
en la que el modelo mostraba la definición de las herramientas (`<tools> … </tools>`) en vez de responder.

## Cómo volver a esta versión
- Más rápido: en Cloudflare, Worker `worker-alertas-cron` → **Deployments** → elegir la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy.
- No hay SQL que deshacer: la corrección no tocó la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-28b`.
- Versión nueva: rama `version-parche-28c-asistente-datos-por-pregunta` (incluye la 28b, `version-parche-28b-asistente-respuestas`, que quedó intermedia y no se publicó).
