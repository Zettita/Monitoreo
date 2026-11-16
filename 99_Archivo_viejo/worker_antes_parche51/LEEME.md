# Respaldo: Worker antes del parche 51 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 48 y el 50 (la que Uriel publicó en Cloudflare el 16/11), **antes** del parche 51 (gráfico de tendencia por cliente y arreglo de desde cuándo se mide cada servicio).

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 51 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-51`.
- Versión nueva: rama `version-parche-51-tendencia-disponibilidad`.
