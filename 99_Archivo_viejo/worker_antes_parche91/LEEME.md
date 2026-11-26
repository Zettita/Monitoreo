# Respaldo: Worker antes del parche 91 (26/11)

`worker_alertas_cron.js` es el Worker del parche 90 (la campanita y el menú del perfil se cierran entre sí), **antes** de: el asistente sin sugerencias para el Gerente, la sala de crisis con una sola forma de cerrar, los botones del correo («Se envió») y las franjas de «Urgente» y «Pre-alerta» del tablero.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-91`.
- Versión nueva: rama `version-parche-91-gerente-sala-correo-franjas`.
