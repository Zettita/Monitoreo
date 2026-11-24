# Respaldo: Worker antes del parche 81 (24/11)

`worker_alertas_cron.js` es el Worker del parche 80 (sala por alerta asignada, responsable en la línea de tiempo y «Mis alertas/tareas»), **antes** de la página «Mis tareas» del Analista y de ordenar «Mis alertas/tareas» en dos grupos (alertas y tareas).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-81`.
- Versión nueva: rama `version-parche-81-mis-tareas-analista`.
