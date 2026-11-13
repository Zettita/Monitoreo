# Respaldo: Worker antes de filtrar el contexto externo (parche 29b, 13/11)

`worker_alertas_cron.js` es la versión publicada el 13/11 con el contexto externo (parche 29), **antes** de filtrar
las novedades de proveedores por relevancia (respondía con incidentes de Reino Unido, Filipinas, Costa Rica, etc.).

## Cómo volver a esta versión
- Más rápido: Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy. No hay SQL que deshacer.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-29b`.
- Versión nueva: rama `version-parche-29b-contexto-relevante`.
