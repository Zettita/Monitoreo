# Respaldo: Worker antes del parche 79 (24/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 78 (el bot de Teams con memoria por chat), **antes** de que el saludo salga una sola vez por chat y de las herramientas nuevas `tareas_salas` y `casos_parecidos`.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 79 no tiene SQL: no hay nada que deshacer en la base. Las filas `saludo:<chat>` que quedan en `teams_bot_memoria` no molestan (se borran solas a los 7 días).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-79`.
- Versión nueva: rama `version-parche-79-gemma-saludo-y-perfiles`.
