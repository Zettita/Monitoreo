# Respaldo: Worker antes del parche 57 (17/11)

`worker_alertas_cron.js` es la versión que Uriel publicó el 17/11 (parches hasta el 56 incluidos el 52 y los de Ale 53 a 55), **antes** del parche 57 (el tablero se agrupa en tres pestañas y cambia el orden de las secciones).

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 57 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-57`.
- Versión nueva: rama `version-parche-57-pestanas-tablero`.
