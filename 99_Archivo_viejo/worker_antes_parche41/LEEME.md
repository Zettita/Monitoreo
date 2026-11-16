# Respaldo: Worker antes del parche 41 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 40 (correo desde la alerta y plantillas de correo),
**antes** de los tickets a demanda en InvGate o Jira. Los parches 39 y 40 todavía no se publicaron en Cloudflare.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- La tabla `tickets_alerta` (script 19) puede quedar: esta versión no la usa. Los tickets generados quedan como comentarios
  en la conversación de cada alerta ("Generó el ticket …").
- Necesita la columna del script 18 para guardar plantillas (sin ella usa las de fábrica).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-41`.
- Versión nueva: rama `version-parche-41-tickets-invgate-jira`.
