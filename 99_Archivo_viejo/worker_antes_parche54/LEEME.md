# Respaldo: Worker antes del parche 54 (16/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 53, **antes** de cambiar el modelo de IA del asistente. El parche 54 no tiene SQL.

## Por qué existe el parche 54
Cloudflare da de baja el 20/11/2026 el modelo `@cf/qwen/qwen3-30b-a3b-fp8` (después responde 410). Esta versión lo usa por defecto, así que **el asistente deja de funcionar ese día**.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → Deployments → versión anterior → Rollback, o pegar este archivo en "Edit code".
- Ojo: después del 20/11 el asistente no anda con este archivo, salvo que la variable `ASISTENTE_MODELO` apunte a un modelo vigente.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-54`.
- Versión nueva: rama `version-parche-54-modelo-asistente`.
