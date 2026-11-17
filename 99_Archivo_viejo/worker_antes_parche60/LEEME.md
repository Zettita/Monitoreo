# Respaldo: Worker antes del parche 60 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 59, **antes** de la primera tanda de ajustes que pidió Ale (textos explicativos, "Operaciones", pre-alertas en tarjetas, botón "Derivar" del asistente, orden de pestañas del Analista, menú de Soporte y Soporte sin reasignar). El parche 60 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-60`.
- Versión nueva: rama `version-parche-60-textos-y-detalles`.
