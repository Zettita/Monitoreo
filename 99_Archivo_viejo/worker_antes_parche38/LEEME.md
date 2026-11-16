# Respaldo: Worker antes del parche 38 (16/11)

`worker_alertas_cron.js` es la versión con los parches hasta el 37 (revisión incremental), **antes** de la limpieza
de tablas (etapa 3b): usa las tablas `alerta_reglas`, `alerta_reglas_personalizadas` y `tablero_cache`.

## Cómo volver a esta versión
- Cloudflare → Worker `worker-alertas-cron` → **Deployments** → la versión anterior → Rollback. O pegar este archivo en "Edit code" y Deploy.
- **Solo vale mientras no se haya corrido el script 17** (`17_borrar_tablas_viejas_d1.txt`): ese script borra las 3 tablas que esta versión necesita.
  Hasta el 16 incluido no pasa nada: la tabla `reglas_alerta` y las columnas nuevas quedan sin usar. Si ya se corrió el 17 y hay que volver, hay que
  recrear las tablas viejas desde `reglas_alerta` y `alerta_parametros` (pedírselo a Claude) o restaurar con `/restore` desde el `/bookmark` que se tomó antes del 17.
- Un cambio de reglas hecho con el Worker nuevo (antes del 17) no se ve en las tablas viejas: volver a mirarlas en Administración.

## En Git
- Proyecto como estaba antes: rama `respaldo-antes-parche-38`.
- Versión nueva: rama `version-parche-38-limpieza-tablas`.
