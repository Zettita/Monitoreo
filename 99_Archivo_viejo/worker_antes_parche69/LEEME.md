# Respaldo: Worker antes del parche 69 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 68 (correo de cada usuario), **antes** de la sala de crisis
(etapa 1 del AICIM: incidentes mayores, tareas, línea de tiempo, guía de diagnóstico, asistente dentro de la sala y escenas 20 a 22 de la demo).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Las 6 tablas del script 24 (`24_sala_crisis_d1.txt`) pueden quedar en la base: este Worker no las usa y no molestan.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-69`.
- Versión nueva: rama `version-parche-69-sala-de-crisis`.
