# Respaldo: Worker antes del parche 77 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 76 (el bot de Teams sin memoria y que se menciona como @Helios), **antes** de que el bot recuerde la conversación y se lo mencione como @Gemma.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 77 trae el script 25 (tabla `teams_bot_memoria`); con el Worker anterior esa tabla simplemente no se usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-77`.
- Versión nueva: rama `version-parche-77-bot-memoria-y-nombre`.
