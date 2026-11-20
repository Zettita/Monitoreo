# Respaldo: Worker antes del parche 73 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 72, **antes** de cambiar la tarjeta del aviso de prueba de Teams
(salía como «IM-0 · Aviso de prueba · Abierto · Importante»).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 73 no tiene SQL.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-73`.
- Versión nueva: rama `version-parche-73-aviso-prueba-teams`.
