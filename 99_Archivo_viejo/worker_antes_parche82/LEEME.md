# Respaldo: Worker antes del parche 82 (25/11)

`worker_alertas_cron.js` es el Worker del parche 81 («Mis tareas» del Analista y «Mis alertas/tareas» en dos grupos), **antes** de la demo oficial (`/?demo=oficial` y `/api/demo-oficial`).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-82`.
- Versión nueva: rama `version-parche-82-demo-oficial`.
