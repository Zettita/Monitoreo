# Respaldo: Worker antes del parche 74 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 73, **antes** de: preguntas sugeridas del asistente fijas abajo del panel,
saludos y agradecimientos sin modelo y "Quitar de la sala" en las salas de crisis.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 74 no tiene SQL.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-74`.
- Versión nueva: rama `version-parche-74-asistente-y-sala`.
