# Respaldo: Worker antes del parche 58 (17/11)

`worker_alertas_cron.js` es la versión que Uriel publicó el 17/11 (parches hasta el 57: pestañas del tablero), **antes** del parche 58 (un solo campo de fecha y un solo tema en todas las páginas).

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 58 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-58`.
- Versión nueva: rama `version-parche-58-tema-y-fechas`.
