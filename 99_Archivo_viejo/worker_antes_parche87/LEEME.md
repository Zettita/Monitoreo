# Respaldo: Worker antes del parche 87 (25/11)

`worker_alertas_cron.js` es el Worker del parche 86 (menú del usuario igual en todas las páginas y pestaña inicial), **antes** de arreglar «¿a quién la asigno?» dentro de la conversación de una alerta en el asistente.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-87`.
- Versión nueva: rama `version-parche-87-asistente-asignar`.
