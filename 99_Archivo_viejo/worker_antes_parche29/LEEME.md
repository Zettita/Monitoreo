# Respaldo: Worker antes del contexto externo del asistente (parche 29, 13/11)

`worker_alertas_cron.js` es la versión con el asistente de IA corregido (parches 28 a 28d), **antes** de sumarle
el contexto externo (calendario, proveedores, noticias y eventos comerciales).

## Cómo volver a esta versión
- Más rápido: en Cloudflare, Worker `worker-alertas-cron` → **Deployments** → elegir la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy.
- Las tablas del script 12 (`contexto_externo`, `eventos_comerciales`) pueden quedar en la base: esta versión no las usa.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-29`.
- Versión nueva: rama `version-parche-29-contexto-externo`.
