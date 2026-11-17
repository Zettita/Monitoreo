# Respaldo: Worker antes del parche 65 (17/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 64, **antes** de la sexta tanda de ajustes de Ale (Operaciones con tres gráficos en la misma línea y Distribución de fallas con filas-barra en lugar de tortas). El parche 65 no tiene SQL.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-65`.
- Versión nueva: rama `version-parche-65-graficos-operaciones-y-fallas`.
