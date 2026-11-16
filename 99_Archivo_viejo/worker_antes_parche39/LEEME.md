# Respaldo: Worker antes del parche 39 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 38 (limpieza de tablas, etapa 3b), **antes** del correo
desde la alerta. El parche 39 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Los correos ya registrados quedan como comentarios en la conversación de cada alerta ("Preparó un correo «…»"): se siguen viendo, pero sin el botón "Confirmar envío".
- Esta versión necesita el parche 38 en la base (scripts 16 y 17, ya corridos el 16/11).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-39`.
- Versión nueva: rama `version-parche-39-correo-desde-alerta`.
