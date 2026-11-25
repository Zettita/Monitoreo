# Respaldo: Worker antes del parche 86 (25/11)

`worker_alertas_cron.js` es el Worker del parche 85 (asistente con la alerta de la conversación y las horas separadas), **antes** de unificar el menú del usuario y la pestaña inicial del tablero.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-86`.
- Versión nueva: rama `version-parche-86-menu-usuario-y-pestana`.
