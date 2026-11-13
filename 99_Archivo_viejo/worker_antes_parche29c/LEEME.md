# Respaldo: Worker antes del parche 29c (13/11)

`worker_alertas_cron.js` es la versión 29b publicada el 13/11 (contexto externo filtrado), **antes** de:
que gane el país del título (se colaban Costa Rica y Colombia por el componente "Latin America"),
las noticias de Google Noticias (GDELT no respondía a tiempo) y los títulos de bloque exactos.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy. No hay SQL que deshacer.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-29c`.
- Versión nueva: rama `version-parche-29c-noticias-y-filtro`.
