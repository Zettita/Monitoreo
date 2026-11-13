# Helios · Monitoreo de alertas — qué hay en cada carpeta

## 01_Worker — código a publicar en Cloudflare
- `worker_alertas_cron.js` — Worker principal (`worker-alertas-cron`): tablero, Mis alertas, Seguimiento, Administración, login, cron que evalúa alertas y trae feriados. **Es siempre la última versión**; se publica con "Edit code".

## 02_Base_de_datos_D1 — scripts para la Console de D1 (en el orden en que se corren)
Del 1 al 11 ya están aplicados: sirven para reconstruir la base desde cero o como referencia.
1. `01_acceso_d1_tablas.txt` — usuarios, perfiles y sesiones (login).
2. `02_admin_d1_tablas.txt` — reglas personalizadas y auditoría (pantalla de Administración).
3. `03_asignacion_d1_tablas.txt` — tomar / derivar / resolver alertas y equipos.
4. `04_avisos_d1_tablas.txt` — avisos de la campanita.
5. `05_vistas_por_fecha_d1.txt` — vistas de alertas filtradas por fecha (menos lecturas).
6. `06_cache_d1_tablas.txt` — caché del tablero (`tablero_cache`).
7. `07_umbrales_d1_tablas.txt` — umbrales configurables por cliente/servicio y prioridad.
8. `08_feriados_d1_tablas.txt` — tabla de feriados y opción "silenciar en feriados". **Desde el modelo v2 solo valen los bloques 1 a 26 y 35** (del 27 al 34 recrean vistas viejas: no correrlos).
9. `09_modelo_v2_d1.txt` — **ya corrido (11/11, 21 bloques).** Índice del perfil, borra las 7 vistas y las tablas sin uso (`core_metricas_esperadas`, `historico_metricas`, `calendario`, `raw_metricas_recibidas`, `demo_escenarios`) y vacía alertas y métricas: la demo arranca sin datos recibidos (el perfil ya está entrenado hasta el arranque).
10. `10_avisos_push_d1.txt` — **ya corrido (12/11).** Tabla `suscripciones_push` para los avisos push (el secreto `VAPID_JWK` ya está cargado en el Worker).
11. `11_asistente_d1.txt` — **ya corrido (13/11).** Tabla `asistente_uso` para los límites del asistente de IA (Workers AI ya está conectado al Worker con el enlace `AI`).

## 03_Modelo_v2_perfil — modelo nuevo (día de la semana × franja de 15 min × tercio del mes: días 1-10, 11-20, 21 a fin)
- `perfil_comportamiento_d1.txt` — **ya cargado en D1 (11/11).** Crea `perfil_comportamiento` y su índice e inserta los 26.208 perfiles. Sirve también para recargarlo después de reentrenar.
- `perfil_comportamiento_d1.sql` — las mismas sentencias, para correr de una con Wrangler:
  `npx wrangler d1 execute helios-monitoring-dev --remote --file=perfil_comportamiento_d1.sql`
- `respaldo_historico/` — solo backup, no se sube a D1:
  - `historico_metricas_demo.zip` — CSV con los 12 meses de historia ficticia (13 series, 456.040 ventanas).
  - `perfil_comportamiento_postgres.sql` — la consulta (PostgreSQL) que armó los perfiles a partir de esa historia.
  - `feriados_para_postgres.csv` — feriados que usa esa consulta.
  - `generar_historico_metricas.py` — script que generó la historia ficticia.

## Power BI — ya no se usa
Desde el 11/11 el análisis es solo el tablero HTML. Las consultas, medidas, tema y el Worker `worker_api_powerbi.js` quedaron en `99_Archivo_viejo/power_bi/`. En Cloudflare hay que borrar el Worker `worker-api-bi`.

## 05_Documentacion
- `Helios_inventario_de_tablas.docx` — inventario y detalle de todas las tablas (estilo de los documentos del equipo).
- `contexto_helios_para_ia.md` — contexto completo del proyecto para pasarle a otra IA.
- `novedades_avisos_push_y_app.md` — avisos push, app instalable y logo nuevo (12/11): guía por dispositivo y problemas comunes.
- `novedades_asistente_ia.md` — asistente de IA (13/11): cómo activarlo, qué responde a cada perfil, límites y problemas comunes.
- `demo_alertas.pptx`, `demo_alertas_paso_a_paso.pptx` — presentaciones de la demo.

## 06_Capturas
Capturas de pantalla de cada vista (tablero, Mis alertas, Seguimiento, Administración, umbrales, feriados, temas).

## 07_Codigo_fuente — para seguir desarrollando (Claude Code)
- `worker/` — el Worker original, `build.py` y los parches 9 a 28 que generan `01_Worker/worker_alertas_cron.js`; páginas HTML, módulos de servidor y el SQL de cada etapa (`modelo_v2_sql.py` arma el script 09). `servidor_local.mjs` corre el sistema en la PC (http://localhost:8787) con una base SQLite de prueba, para verlo sin Cloudflare.
- `pruebas/` — base de la demo (`base.sqlite`) y pruebas automáticas por módulo.
- `modelo_v2/` — scripts del perfil de comportamiento (generar historia, consulta Postgres, correrla en PGlite, armar el archivo para D1).
- `word/` — helper para armar los Word con el estilo de la compañera.
Cómo construir y probar: ver `CLAUDE.md`.

## CLAUDE.md (en la raíz)
Instrucciones para Claude Code: qué es el proyecto, reglas, cómo construir y probar, y en qué etapa estamos. Claude Code lo lee solo al abrir esta carpeta.

## 99_Archivo_viejo — NO CORRER
Versiones anteriores ya reemplazadas (cargas viejas de la demo, casos de prueba, arreglos de vistas, respaldo de vistas anteriores, tema v1). Se guardan solo por trazabilidad.
