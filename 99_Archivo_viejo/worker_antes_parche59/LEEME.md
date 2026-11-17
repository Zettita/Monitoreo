# Respaldo: Worker antes del parche 59 (17/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 58, **antes** de arreglar el asistente con Gemma 4: en "¿Qué está sin asignar y a quién lo derivo?" el modelo gastaba todo el margen en "pensar" (`reasoning_content`) y devolvía la respuesta vacía, y se veía "No pude armar una respuesta". El parche 59 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-59`.
- Versión nueva: rama `version-parche-59-asistente-sin-razonamiento`.
