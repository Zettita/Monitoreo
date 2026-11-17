# Respaldo: Worker antes del parche 63 (17/11)

`worker_alertas_cron.js` es la versión publicada con los parches hasta el 62, **antes** de unificar Equipos y Listas de difusión (rol de comunicado por persona, equipo general o de un cliente, comunicar a personas sueltas, el Analista arma equipos y plantillas).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- El script 22 se puede dejar corrido: solo agrega dos columnas y equipos; este Worker no las usa y sigue leyendo las listas viejas (`alerta_parametros.listas_difusion` no se borró). Los equipos que se crearon a partir de las listas quedan como equipos comunes.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-63`.
- Versión nueva: rama `version-parche-63-equipos-y-listas`.
