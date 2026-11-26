# Respaldo: Worker antes del parche 90 (26/11)

`worker_alertas_cron.js` es el Worker del parche 89 (botones alineados), **antes** de hacer que la campanita y el menú del perfil se cierren entre sí.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-90`.
- Versión nueva: rama `version-parche-90-desplegables`.
