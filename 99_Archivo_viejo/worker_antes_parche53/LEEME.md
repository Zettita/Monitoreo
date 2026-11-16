# Respaldo: Worker antes del parche 53 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 52, **antes** de que `crearTicketJira` cree el issue en el proyecto KAN (parche 53). El parche 53 no tiene SQL: volver atrás no deja nada pendiente en la base.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Los tickets que se hayan generado en Jira quedan en la tabla `tickets_alerta` y en la conversación de cada alerta; en Jira no se borran solos.
- Con esta versión, `TICKETS_JIRA = real` vuelve a mostrar "La integración con Jira todavía no está terminada". Para seguir probando, dejar `TICKETS_JIRA` sin definir (modo simulado).

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-53`.
- Versión nueva: rama `version-parche-53-conexion-jira`.
