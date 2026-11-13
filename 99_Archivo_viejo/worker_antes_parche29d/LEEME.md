# Respaldo: Worker antes del parche 29d (13/11)

`worker_alertas_cron.js` es la versión 29c publicada el 13/11, **antes** de cambiar cómo se ponen los enlaces:
el modelo copiaba los enlaces de Google Noticias (~400 caracteres), salían rotos y la respuesta se cortaba.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy. No hay SQL que deshacer.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-29d`.
- Versión nueva: rama `version-parche-29d-enlaces-cortos`.
