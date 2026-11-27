# Respaldo: Worker antes del parche 93 (27/11)

`worker_alertas_cron.js` es el Worker del parche 92 (el ticket de «Comunicar incidente» se genera al confirmar), **antes** de que el ticket del correo («Template correo») se genere al abrirlo en Outlook y no al marcar la casilla.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-93`.
- Versión nueva: rama `version-parche-93-ticket-al-abrir-correo`.
