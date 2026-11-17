# Respaldo: Worker antes del parche 56 (17/11)

`worker_alertas_cron.js` es la versión de `main` con los parches hasta el 55 (incluye el 52, la evolución por ventana, los de Ale 53 a 55), **antes** del parche 56 (período con Desde / Hasta, barras más altas y letras más grandes, y "Comparar con otro período").

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 56 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-56`.
- Versión nueva: rama `version-parche-56-periodo-desde-hasta`.
