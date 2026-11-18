# Respaldo: Worker antes del parche 67 (18/11)

`worker_alertas_cron.js` es la versión de `main` con los parches hasta el 66 (Comparar con el estilo de Disponibilidad), **antes** del parche 67 (todos los selectores y campos de texto con el mismo tamaño). Según las notas, los parches 64 a 66 podían estar sin publicar en Cloudflare; este archivo es lo que había en `main`, no necesariamente lo publicado.

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 67 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-67`.
- Versión nueva: rama `version-parche-67-campos-unificados`.
