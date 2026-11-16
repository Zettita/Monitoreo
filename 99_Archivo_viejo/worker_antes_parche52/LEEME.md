# Respaldo: Worker antes del parche 52 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 48, el 50 y el 51 (la que Uriel publicó en Cloudflare el 16/11), **antes** del parche 52 (la tendencia pasa a ser por ventana y acumulada del período).

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 52 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-52`.
- Versión nueva: rama `version-parche-52-evolucion-por-ventana`.
