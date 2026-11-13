# Helios: ticketera (parche 30, 14/11/2026)

> **Para quien lo lea (persona o IA):** resume lo que se agregó el 14/11 sobre lo que describe `contexto_helios_para_ia.md`, que sigue siendo la fuente de verdad. El Worker que incluye todo esto es `01_Worker/worker_alertas_cron.js`.

## 1. Qué hay de nuevo

| Novedad | Qué hace |
|---|---|
| **Detalle de cada alerta** | Página propia (`/alerta/<id>`) con todo el problema: la conversación completa (derivaciones, comentarios, archivos y la resolución, en orden), los datos de la alerta (cliente, servicio, desde cuándo, prioridad, quién la tiene), la evidencia y las ventanas con problema (observado, esperado y límite de cada una). Tiene su propio enlace: se puede abrir en otra pestaña o pasar a un compañero |
| **Evidencia adjunta** | Capturas, logs, PDF, planillas: se adjuntan desde el cuadro de comentarios (con o sin texto) o al resolver. Hasta **1 MB por archivo** y 15 por alerta; las capturas más grandes se achican solas en el navegador antes de subir (máximo 1600 px, JPG). Las imágenes se ven en miniatura; el resto se abre o se descarga. Quien subió un archivo lo puede borrar mientras la alerta siga abierta |
| **Resolver con causa** | El diálogo de Resolver suma dos selecciones de un clic arriba del texto: **¿Qué lo causó?** (una: falla del cliente, falla nuestra, proveedor o gateway, comportamiento esperado, falsa alarma) y **¿Qué se hizo?** (una o más: se contactó al cliente, se corrigió, se escaló, no requirió acción). Con las dos elegidas, el detalle escrito es opcional |
| **Opciones editables** | El Administrador agrega, renombra o desactiva causas y acciones en **Administración > Reglas de alerta > Al resolver**. Cada opción muestra cuántos problemas la eligieron. Cuando llegue la lista de Hugo, se cambia ahí sin tocar código |

**Quién lo usa:** Soporte (desde Mis alertas, solo lo suyo o de su equipo) y Analista (desde Seguimiento o el tablero, todas). El Administrador y el Gerente no tienen el detalle.

**Dónde aparece:**
- **Mis alertas:** el título de cada tarjeta y el botón **Ver detalle** abren el detalle. **Resolver** abre el detalle con el diálogo nuevo.
- **Seguimiento:** **Ver detalle** en cada fila; **Resolver** abre el detalle con el diálogo nuevo.
- **Tablero (Analista):** **Detalle** en cada alerta; **Resolver** abre el detalle.
- **Campanita y avisos push:** los avisos de una alerta (asignada, comentada, resuelta, devuelta) llevan directo a su detalle.

Lo que se elige al resolver queda también como texto en la resolución ("Causa: Proveedor o gateway. Se hizo: se contactó al cliente, se escaló."), así las otras pantallas y el asistente lo muestran sin cambios. El asistente puede seguir resolviendo solo con texto.

## 2. Cómo activarlo en Cloudflare (sin R2)

1. **Script 13** (ya corrido el 14/11). Console de D1 de `helios-monitoring-dev`: los 4 bloques de `02_Base_de_datos_D1/13_ticketera_d1.txt`. Agrega 3 columnas (los 3 primeros bloques se corren una sola vez).
2. **Script 14.** El bloque de `02_Base_de_datos_D1/14_evidencia_d1.txt`: crea la tabla `evidencia_archivos`, donde se guarda la evidencia. Quedan 25 tablas.
3. **Publicar** `01_Worker/worker_alertas_cron.js` (Edit code › pegar todo › Deploy).
4. **Probar:** entrar como Soporte, abrir una alerta asignada con **Ver detalle**, adjuntar una captura, comentar y resolver eligiendo causa y acción.

**R2 no hace falta.** Se decidió no activarlo porque Cloudflare pide una tarjeta. Si algún día se activa: crear el bucket `helios-evidencia` (privado) y en el Worker, Settings › Bindings › R2 bucket, variable `EVIDENCIA`. Desde ese momento los archivos nuevos van a R2 (hasta 10 MB cada uno) sin cambiar código; los que ya estaban en D1 dejan de verse en el detalle (habría que pasarlos).

## 3. Si algo no anda

| Qué pasa | Qué revisar |
|---|---|
| "Falta preparar la base para la ticketera" | Correr `13_ticketera_d1.txt` |
| "Falta correr 14_evidencia_d1.txt" | Correr el script 14 (paso 2) |
| "El archivo pesa más de 1 MB" | Comprimir el PDF o el log (o subirlo como .zip). Las capturas se achican solas |
| "Se llenó el espacio para evidencia" | Se llegó a 200 MB de archivos en la base: activar R2 o borrar evidencia vieja |
| "Ese tipo de archivo no se puede adjuntar" | Se aceptan png, jpg, gif, webp, pdf, txt, log, csv, json, har, zip, eml, xlsx y docx. HTML y SVG no, por seguridad (el navegador los podría ejecutar) |
| "Esa alerta no está asignada a vos ni a tu equipo" | Soporte solo ve el detalle de lo suyo, de su equipo o de alertas en las que intervino |
| En Resolver no aparecen las opciones | Están todas desactivadas: activarlas en Administración > Reglas de alerta |

## 4. Cómo funciona por dentro

- **Base de datos:** el script 13 agrega `alertas_historico.causa_resolucion` y `acciones_resolucion` (lo elegido al resolver, en todas las ventanas del problema, como `resuelta_por`; acciones separadas por ` · `) y `alerta_parametros.opciones_resolucion` (las opciones en JSON: `{causas:[{id,nombre,activo}], acciones:[…]}`). Los nombres se copian al resolver: si después se renombran, lo ya resuelto conserva el nombre original. El script 14 crea `evidencia_archivos`.
- **Evidencia en D1 (`evidencia_archivos`):** cada archivo se guarda como texto base64 partido en filas de 90.000 caracteres (una sentencia de D1 acepta hasta 100 KB); la fila `parte = 0` lleva también tipo, tamaño, fecha y quién lo subió (`metadatos`, JSON). Base64 y no BLOB porque D1 devuelve los BLOB como una lista de números y leer 1 MB así gasta más CPU de la que da el plan gratuito (10 ms por pedido); en base64, leer 1 MB lleva unos 2 ms. Un archivo de 1 MB son 16 filas. Clave: `alertas/<primera ventana del problema>/<16 caracteres al azar>.<ext>`.
- **Mismo código para R2 o D1:** el servidor usa un "almacén" con las operaciones de R2 (`put`, `get`, `head`, `delete`, `list`); si el Worker tiene el binding `EVIDENCIA` usa R2, si no, la tabla. En el historial (`alerta_eventos`) queda un comentario "Adjuntó el archivo «…»" (y "Borró el archivo «…»"), que el detalle muestra como la ficha del archivo.
- **API nueva:** `GET /alerta/<id>` (página), `GET /api/alertas/<id>/detalle`, `POST /api/alertas/<id>/adjuntos` (el cuerpo es el archivo; nombre en el encabezado `x-nombre-archivo`), `GET /api/alertas/<id>/adjuntos/<archivo>`, `POST /api/alertas/<id>/adjuntos/<archivo>/borrar`, `GET/POST /api/admin/catalogo-resolucion`. `POST /api/alertas/<id>/resolver` acepta además `causa_id` y `acciones_ids` (sigue aceptando solo `comentario`).
- **Permisos (en el servidor):** permiso nuevo `detalle_alerta` (Analista y Soporte). Soporte: lo asignado a ella, a su equipo, a un equipo que lidera, o donde intervino. Adjuntar: quien puede comentar, con la alerta abierta. Descargar: quien puede ver el detalle. Opciones: solo Administrador (permiso `admin_reglas`), queda en auditoría.
- **Seguridad de los archivos:** el tipo sale de la extensión (no de lo que diga el navegador), lista cerrada sin HTML ni SVG, `x-content-type-options: nosniff`, sin caché, y nunca son públicos: cada descarga pasa por la sesión y los permisos.
- **Costo en D1:** abrir el detalle son unas 10 consultas. Subir un archivo de 1 MB: 17 filas escritas en `evidencia_archivos` más el comentario del historial, la auditoría y los avisos (unas 30 consultas en total, dentro de las 50 por pedido). Ver un archivo: 1 consulta. Con 200 MB de tope, la evidencia nunca pasa del 40 % de la base.
- **Para la página** se reusa Mis alertas ya terminada (barra, tema, campanita, avisos push y asistente) con su contenido y su script reemplazados.
- **Pruebas:** `07_Codigo_fuente/pruebas/tickettest.mjs` (permisos por perfil, subida y descarga en D1 y en R2 simulado, que vuelvan idénticos, tipos y tamaños rechazados, sin tabla, resolución con causa y sin ella, opciones y enlaces). La demo de 19 escenas y las 11 pruebas anteriores dan igual. En la PC, `servidor_local.mjs` guarda la evidencia en la base, como Cloudflare sin R2 (con `CON_R2=1` simula R2 en la carpeta `worker/evidencia_local/`).

## 5. Pendiente

- Cuando Hugo mande su lista de causas, cargarla en Administración (no hace falta código). Si pide además tipo de impacto, problemas e incidentes tipo ITIL o SLAs, eso sí es desarrollo (ver sección 18 del contexto).
- Un tablero de "por qué pasan los problemas" a partir de `alertas_historico.causa_resolucion` y `acciones_resolucion` (causas por cliente, servicio y mes) para el Gerente y el Analista.
- Retención de la evidencia (por ejemplo, borrar archivos de alertas resueltas hace más de 6 meses), sobre todo mientras esté en D1.
