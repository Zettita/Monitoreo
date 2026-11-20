# Respaldo: Worker antes del parche 72 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 71 (preguntas libres de la sala), **antes** de que el asistente lea las llamadas escritas como texto y de la tarjeta «lo gestiona» de Escalar.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 72 no tiene SQL.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-72`.
- Versión nueva: rama `version-parche-72-asistente-llamadas-y-escalar`.
