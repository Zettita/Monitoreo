# Respaldo: Worker antes del parche 80 (24/11)

`worker_alertas_cron.js` es el Worker del parche 79b (el bot de Teams ignora las salas que no existen o que la persona no ve), **antes** de que quien tiene asignada una alerta de la sala pueda entrar, de que la línea de tiempo diga quién es el responsable y de que «Mis alertas» pase a «Mis alertas/tareas».

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base. Los renglones nuevos de la línea de tiempo (tipo `ALERTA_SUMADA`) quedan en las salas, sin problema.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-80`.
- Versión nueva: rama `version-parche-80-sala-por-alerta-y-mis-tareas`.
