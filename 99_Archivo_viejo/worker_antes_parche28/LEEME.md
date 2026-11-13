# Respaldo: Worker antes del asistente de IA (parche 28)

`worker_alertas_cron.js` es el Worker publicado hasta el 13/11/2026 (parches 9 a 27: push, perfiles, umbrales), sin el asistente.

Para volver atrás en Cloudflare: Workers › `worker-alertas-cron` › Edit code › pegar este archivo › Deploy.
No hace falta deshacer nada en D1: la tabla `asistente_uso` (script 11) puede quedar, este Worker no la usa.
Otra opción: en el panel del Worker, Deployments, volver a la versión anterior.

En Git, todo el proyecto como estaba antes del parche 28 queda en la rama `respaldo-antes-parche-28` (commit `c77c542`).

## Versión nueva (con el asistente de IA)
El parche 28 se publicó en Cloudflare el 13/11. Esa versión queda fija en la rama `version-parche-28-asistente-ia` y es la que hoy está en `main` y en `01_Worker/worker_alertas_cron.js`.
