# Respaldo: Worker antes del parche 29e (13/11)

`worker_alertas_cron.js` es la versión 29d publicada el 13/11 (enlaces cortos), **antes** de los ajustes que salieron
de probar todas las preguntas sugeridas con los cuatro perfiles y el modelo real.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy. No hay SQL que deshacer.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-29e`.
- Versión nueva: rama `version-parche-29e-ajustes-pruebas-reales`.
