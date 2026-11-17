# Respaldo: Worker antes del parche 62 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 61, **antes** de la dona "Alertas por estado" en Operaciones y de los filtros del Histórico (cliente, gravedad, problema). El parche 62 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-62`.
- Versión nueva: rama `version-parche-62-operaciones-e-historico`.
