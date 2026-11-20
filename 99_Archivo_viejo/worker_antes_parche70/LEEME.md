# Respaldo: Worker antes del parche 70 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 69 (sala de crisis), **antes** de llevar la sala a Teams
(avisos de las salas en un canal de Teams y botón "Chat en Teams").

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 70 no tiene SQL: no hay nada que deshacer en la base. El secreto `TEAMS_WEBHOOK` puede quedar cargado; este Worker no lo usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-70`.
- Versión nueva: rama `version-parche-70-sala-en-teams`.
