# Respaldo: Worker antes del parche 55 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 54c, **antes** de: (1) pasar el modelo por defecto del asistente a Gemma y armar los botones "Derivar" desde el servidor, (2) la marca "Abierta hace más de 24 h" en Seguimiento y en el tablero, (3) la pregunta "¿Qué alertas llevan más tiempo abiertas?". El parche 55 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Esta versión usa Qwen3.8 por defecto; mientras la variable `ASISTENTE_MODELO` apunte a Gemma, el asistente sigue andando igual.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-55`.
- Versión nueva: rama `version-parche-55-asistente-y-abiertas-largas`.
