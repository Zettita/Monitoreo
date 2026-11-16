# Respaldo: Worker antes del parche 42 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 41 (correo desde la alerta, plantillas de correo y tickets a demanda
en InvGate o Jira), **antes** del dashboard gerencial (parches 42 a 45). Los parches 39, 40 y 41 todavía no se publicaron en Cloudflare.

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- Las columnas del script 20 (`objetivo_mensual`, `disponibilidad_config`) pueden quedar: esta versión no las usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-42`.
- Versión nueva: rama `version-parche-42-dashboard-gerencial`.
