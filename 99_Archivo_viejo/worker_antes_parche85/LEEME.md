# Respaldo: Worker antes del parche 85 (25/11)

`worker_alertas_cron.js` es el Worker del parche 84 (tarjetas de «Estado por cliente» sin cortes), **antes** de arreglar el asistente (la alerta de la conversación y las horas de asignación y toma).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-85`.
- Versión nueva: rama `version-parche-85-asistente-contexto-y-horas`.
