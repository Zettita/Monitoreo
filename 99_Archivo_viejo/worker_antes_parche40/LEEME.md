# Respaldo: Worker antes del parche 40 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 39 (correo desde la alerta, con el botón "Preparar correo"),
**antes** de las plantillas de correo y de los ajustes que pidió Ale (nombre "Template correo alerta", destinatarios reales al confirmar).
El parche 39 no llegó a publicarse en Cloudflare.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- La columna `alerta_parametros.plantillas_correo` (script 18) puede quedar: esta versión no la usa.
- Esta versión necesita el parche 38 en la base (scripts 16 y 17, ya corridos el 16/11).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-40`.
- Versión nueva: rama `version-parche-40-plantillas-correo`.
