# Respaldo: Worker antes del parche 46 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 45 (tickets, correo y plantillas de Ale; dashboard gerencial de Uriel),
**antes** de "Comunicar incidente" (perfil "Solo comunicados", listas de difusión, push con Recibido y Responder).

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- Lo del script 21 puede quedar: esta versión no lo usa. Ojo: los usuarios "Solo comunicados" quedan como **Gerente**
  (perfil = 'GERENTE'), así que con esta versión verían el tablero: desactivarlos o cambiarles el perfil antes de volver.
- Los comunicados ya mandados quedan como comentarios en la conversación de cada alerta.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-46`.
- Versión nueva: rama `version-parche-46-comunicar-incidente`.
