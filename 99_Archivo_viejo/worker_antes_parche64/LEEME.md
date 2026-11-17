# Respaldo: Worker antes del parche 64 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 63, **antes** de la quinta tanda de ajustes de Ale (textos del detalle, desplegables de Comunicar, estados "Cumple / En riesgo / No cumple", servicio aparte en el Histórico, tarjetas de Operaciones, tortas en Distribución de fallas y pre-alertas con anillo de acierto). El parche 64 no tiene SQL.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-64`.
- Versión nueva: rama `version-parche-64-ajustes-visuales`.
