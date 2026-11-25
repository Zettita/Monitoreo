# Respaldo: Worker antes del parche 83 (25/11)

`worker_alertas_cron.js` es el Worker del parche 82 (demo oficial de **14 escenas**), **antes** de pasarla a una sola escena (`/?demo=oficial` con «Cargar escena»).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-83`.
- Versión nueva: rama `version-parche-83-demo-oficial-escena-unica`.
