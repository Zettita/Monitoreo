# Respaldo: Worker antes del parche 37 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 36 (distribución de fallas), **antes** de la revisión
incremental (etapa 3): cada revisión recorre las últimas 24 horas y el tablero recalcula su caché al abrirse.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy.
- El índice y la columna del script 15 pueden quedar: esta versión no los usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-37`.
- Versión nueva: rama `version-parche-37-revision-incremental`.
