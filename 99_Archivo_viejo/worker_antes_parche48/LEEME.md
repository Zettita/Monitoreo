# Respaldo: Worker antes del parche 48 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 47, **antes** de los ajustes del dashboard gerencial (parche 48: filtro por estado,
disponibilidad bajo Estado por cliente, semáforo y resumen de clientes en barras). Puede que todavía no esté publicada en Cloudflare.

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 48 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-48`.
- Versión nueva: rama `version-parche-48-ajustes-dashboard`.
