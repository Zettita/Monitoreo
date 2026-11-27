# Respaldo: Worker antes del parche 92 (27/11)

`worker_alertas_cron.js` es el Worker del parche 91 (Gerente sin sugerencias, sala con una sola forma de cerrar, botones del correo y franjas del tablero), **antes** de que el ticket de «Comunicar incidente» se genere al confirmar el comunicado y no al marcar la casilla.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-92`.
- Versión nueva: rama `version-parche-92-ticket-al-comunicar`.
