# Respaldo: Worker antes del parche 78 (20/11)

`worker_alertas_cron.js` es el Worker con los parches hasta el 77 (el bot de Teams con memoria **por persona**), **antes** de que la memoria sea **del chat** (compartida por quienes están en él).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 78 cambió el script 25 (la tabla `teams_bot_memoria` pasa a una fila por chat). Con el Worker del parche 77 hay que usar la tabla por persona: volver a correr la versión anterior del script 25 (ver `git show respaldo-antes-parche-78:02_Base_de_datos_D1/25_teams_bot_memoria_d1.txt`).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-78`.
- Versión nueva: rama `version-parche-78-memoria-por-chat`.
