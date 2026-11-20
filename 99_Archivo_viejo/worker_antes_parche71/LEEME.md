# Respaldo: Worker antes del parche 71 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 70 (sala de crisis en Teams), **antes** de mejorar las
preguntas libres del asistente dentro de la sala.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 71 no tiene SQL.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-71`.
- Versión nueva: rama `version-parche-71-asistente-sala-preguntas-libres`.
