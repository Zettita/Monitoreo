# Respaldo: Worker antes del parche 61 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 60, **antes** del cambio de la pestaña Disponibilidad (tarjetas de indicadores, barras verticales con la disponibilidad del grupo y Distribución de fallas en 3 columnas). El parche 61 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-61`.
- Versión nueva: rama `version-parche-61-disponibilidad-tarjetas`.
