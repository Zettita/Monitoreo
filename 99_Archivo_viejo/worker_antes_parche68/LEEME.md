# Respaldo: Worker antes del parche 68 (18/11)

`worker_alertas_cron.js` es la versión de `main` con los parches hasta el 67 (y el ajuste del 66), **antes** del parche 68 (correo de cada usuario y elegir destinatarios de una lista al enviar correos). Es lo que había en `main`, no necesariamente lo publicado en Cloudflare.

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 68 trae el script 23 (`ALTER TABLE usuarios ADD COLUMN correo TEXT`). Volver al Worker anterior **no hace falta deshacerlo**: la columna nueva queda sin usar y el Worker viejo la ignora.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-68`.
- Versión nueva: rama `version-parche-68-correo-usuarios`.
