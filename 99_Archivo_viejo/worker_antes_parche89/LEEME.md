# Respaldo: Worker antes del parche 89 (26/11)

`worker_alertas_cron.js` es el Worker del parche 88 (el asistente no nombra el botón «Hacerlo» sin propuesta), **antes** de alinear los botones de las listas de alertas y de mostrar «¿Qué está pasando?» en todas las filas.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-89`.
- Versión nueva: rama `version-parche-89-botones-alineados`.
