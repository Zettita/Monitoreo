# Respaldo: Worker antes del parche 30 (13/11)

`worker_alertas_cron.js` es la versión 29e publicada el 13/11 (ajustes del asistente), **antes** de sumar los avisos en Teams.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy. No hay SQL que deshacer (el parche 30 no tiene SQL).
- El secreto `TEAMS_WEBHOOK` se puede dejar: esta versión no lo usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-30`.
- Versión nueva: rama `version-parche-30-avisos-teams`.
