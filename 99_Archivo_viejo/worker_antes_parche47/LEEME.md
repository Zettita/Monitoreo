# Respaldo: Worker antes del parche 47 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 46 (comunicar incidente), con el texto "Le llega a hasta N personas…" en el diálogo de "Comunicar incidente". El 47 solo saca ese texto: sin SQL.

## Cómo volver
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → Rollback, o pegar este archivo en "Edit code" y Deploy.

## En Git
- Antes: rama `respaldo-antes-parche-47`. Nueva: rama `version-parche-47-comunicar-sin-resumen`.
