# Respaldo: Worker antes del parche 30 (14/11)

`worker_alertas_cron.js` es la versión 29e publicada el 13/11 (ajustes del asistente), **antes** de la ticketera:
detalle de cada alerta, evidencia adjunta en R2 y resolución con causa.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback.
- O pegar este archivo en "Edit code" y Deploy.
- Las 3 columnas del script 13 (`causa_resolucion`, `acciones_resolucion`, `opciones_resolucion`) pueden quedar: esta versión no las usa.
  El bucket de R2 tampoco molesta.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-30`.
- Versión nueva: rama `version-parche-30-ticketera`.
