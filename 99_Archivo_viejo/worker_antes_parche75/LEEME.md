# Respaldo: Worker antes del parche 75 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 74, **antes** de que el Administrador pueda eliminar usuarios, equipos con
historial, reglas de alerta, reglas de derivación y causas / acciones, y antes de que «Preparar demo» reinicie la numeración de las salas (IM-N).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 75 no tiene SQL.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-75`.
- Versión nueva: rama `version-parche-75-eliminar-y-salas-demo`.
