# Respaldo: Worker antes del parche 66 (18/11)

`worker_alertas_cron.js` es la versión de `main` con los parches hasta el 65 (los de Ale 59 a 65 y mi 58), **antes** del parche 66 (la ventana "Comparar con otro período" con el estilo de la pestaña Disponibilidad). Ojo: según las notas, los parches 64 y 65 todavía podían estar sin publicar en Cloudflare; este archivo es lo que había en `main`, no necesariamente lo que está publicado.

## Cómo volver a esta versión
- Cloudflare -> Worker `worker-alertas-cron` -> **Deployments** -> la versión anterior -> Rollback. O pegar este archivo en "Edit code" y Deploy.
- El parche 66 no usa SQL nuevo: no hay nada que deshacer en la base.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-66`.
- Versión nueva: rama `version-parche-66-comparar-estilo-disponibilidad`.
