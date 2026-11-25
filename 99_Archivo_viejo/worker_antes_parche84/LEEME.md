# Respaldo: Worker antes del parche 84 (25/11)

`worker_alertas_cron.js` es el Worker del parche 83 (demo oficial en una sola escena), **antes** de arreglar las tarjetas de «Estado por cliente» con textos largos.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-84`.
- Versión nueva: rama `version-parche-84-tarjetas-estado-por-cliente`.
