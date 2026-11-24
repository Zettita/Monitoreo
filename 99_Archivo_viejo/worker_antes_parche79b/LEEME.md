# Respaldo: Worker antes del parche 79b (24/11)

`worker_alertas_cron.js` es el Worker del parche 79 (saludo único y herramientas `tareas_salas` y `casos_parecidos`), **antes** de que el bot ignore las salas que no existen o que la persona no ve y de que «Preparar demo» borre la memoria del bot.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Sin SQL: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-79b`.
- Versión nueva: rama `version-parche-79b-bot-salas-visibles`.
