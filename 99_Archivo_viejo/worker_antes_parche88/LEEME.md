# Respaldo: Worker antes del parche 88 (25/11)

`worker_alertas_cron.js` es el Worker del parche 87 («¿a quién la asigno?» dentro de la conversación de una alerta), **antes** de sacar las frases que mandan a tocar el botón «Hacerlo» cuando no hay ninguna propuesta en el chat.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-88`.
- Versión nueva: rama `version-parche-88-asistente-boton-hacerlo`.
