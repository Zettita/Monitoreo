# Respaldo: Worker antes del parche 76 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 75, **antes** del bot de Helios en Teams (el asistente como bot de Microsoft Teams).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 76 no tiene SQL. Sin los secretos `TEAMS_BOT_APP_ID` y `TEAMS_BOT_SECRET` el bot no hace nada, así que publicarlo no cambia el resto de Helios.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-76`.
- Versión nueva: rama `version-parche-76-bot-de-teams`.
