# Respaldo: Worker antes del parche 50 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 48 (la que Uriel publicó en Cloudflare el 16/11), **antes** del parche 50 (disponibilidad más clara: texto corto y semáforo contra el objetivo del período).

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 50 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-50`.
- Versión nueva: rama `version-parche-50-disponibilidad-clara`.
