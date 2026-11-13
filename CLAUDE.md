# Helios · Monitoreo de alertas — guía para Claude Code

Contexto completo del sistema (qué es, tablas, reglas, pantallas, permisos, pendientes):
@05_Documentacion/contexto_helios_para_ia.md

Mapa de carpetas y para qué sirve cada archivo: @LEEME.md

## Cómo trabajar conmigo
- Respondé en español rioplatense, conciso y práctico. Los textos de la interfaz también, sin jerga técnica.
- Antes de cambios grandes, resumí el plan en pocos pasos.
- Nombres de tablas y columnas **completos, sin abreviar** (`historico_metricas`, no `hist_metricas`; `numero_dia_habil`, no `habil_n`).
- Documentos para personas: Word con el estilo de la compañera (ver `07_Codigo_fuente/word/SKILL_documentos_word_helios.md`); presentaciones en PowerPoint.
- **Nada de tablas de demo**: los datos entran por `core_metricas_observadas` y todo lo demás se calcula.
- **Sin Power BI** (decidido el 11/11): el análisis es solo el tablero HTML. Lo de Power BI quedó en `99_Archivo_viejo/power_bi/`.

## Repositorio compartido (12/11)
- GitHub privado `Zettita/Monitoreo` (rama `main`), compartido con Ale Maggiolo (`alejandramaggiolo`) para que su IA y la nuestra trabajen sobre lo mismo.
- **Después de cada cambio probado** (build + pruebas en verde, Worker copiado a `01_Worker/`, documentación actualizada): `git add -A`, commit en español que diga qué cambió y por qué, y `git push`. Uriel ya lo autorizó: no hace falta preguntar para este repositorio. Antes de empezar a trabajar: `git pull`.
- Cada cambio actualiza en el mismo commit `05_Documentacion/contexto_helios_para_ia.md` (sección 16 y lo que corresponda) y este archivo.
- **Siempre con respaldo (pedido de Ale, 13/11):** cada vez que se publica una versión nueva del Worker, se deja (1) la copia del Worker anterior en `99_Archivo_viejo/worker_antes_parcheNN/` con un `LEEME.md` para volver atrás, (2) una rama `respaldo-antes-parche-NN` con el proyecto como estaba antes y (3) una rama `version-parche-NN-<tema>` con la versión nueva. Las ramas no se borran ni se pisan. Si una etiqueta no sube (el proxy corta), usar ramas.
- Nunca subir claves ni tokens (el `.gitignore` deja afuera `clave_push_*.txt`, `*.sqlite` salvo `pruebas/base.sqlite`, y `w.mjs`). Revisar `git status` antes de cada commit.

## Entorno real
- Cloudflare, plan gratuito. Base D1 `helios-monitoring-dev`; Worker `worker-alertas-cron` (todo el sistema). `worker-api-bi` (Power BI) ya no se usa: borrarlo del panel.
- **El Cron Trigger está apagado** (se quitó hace tiempo para no gastar lecturas): hoy las revisiones solo corren a mano (botón "Revisar alertas ahora" o escenas de la demo). Lo que figure en el uso de D1 viene de cargas manuales o del tablero.
- Límites D1 free: 500 MB por base, 5 GB por cuenta, **100.000 filas escritas/día**, 5 M filas leídas/día; 50 consultas por invocación; sentencia de hasta 100 KB; 100 parámetros; Workers 10 ms de CPU; `SQLITE_LIMIT_COMPOUND_SELECT = 2`.
- Consola de D1: **una sentencia por línea, sin comentarios**. Por eso los scripts para D1 se entregan como `.txt` con bloques numerados de una línea.
- Publicar el Worker: pegando el código en "Edit code" del panel (no con el cargador de archivos). Primero se corre el SQL nuevo, después se publica el Worker.
- No volver a correr el SQL viejo de objetos (`originales/alertas_d1_objetos_consola.txt`): pisa parámetros y reglas.

## Código fuente (`07_Codigo_fuente/`)
El Worker publicado (`01_Worker/worker_alertas_cron.js`) **no se edita a mano**: se genera aplicando parches sobre el Worker original.

```
07_Codigo_fuente/
  worker/
    originales/worker_alertas_cron_original.js   punto de partida (no tocar)
    build.py            aplica demo_server.js y patch9.py … patch29.py → w.mjs
    patchNN.py          cada parche inyecta código y páginas; las páginas HTML viven en el Worker como
                        constantes JSON: HTML, ADMIN_HTML, MIS_ALERTAS_HTML, SEGUIMIENTO_HTML, LOGIN_HTML
    *_server.js         lógica de servidor por módulo (auth, admin, asignacion, avisos, umbrales, feriados)
    patch24.py          modelo v2: el motor compara contra perfil_comportamiento y no usa vistas
                        (SQL_ALERTAS_OBSERVADAS, SQL_ALERTAS_FALTANTES, SQL_PREALERTAS, armados desde las vistas viejas)
    patch25.py          qué ve cada perfil (tabla PERMISOS), Panorama por cliente, "Avisar" de pre-alertas (/api/prealertas/avisar),
                        página de inicio por perfil (/inicio) y avisos del navegador en la campanita
    patch27.py          diálogo de umbrales con textos más claros y un ejemplo "En la práctica" por campo (solo página)
    patch26.py          avisos push (llegan con Helios cerrado) e instalar como app: push_server.js (cifrado RFC 8291 y
                        firma VAPID con crypto.subtle), sw.js (service worker), manifiesto e íconos (iconos.py arma, con Pillow, el caballo de iconos/logo_helios_system.png → iconos/*.png)
    push_d1.sql         tabla suscripciones_push (02_Base_de_datos_D1/10_avisos_push_d1.txt)
    patch28.py          asistente de IA (Workers AI): asistente_server.js (herramientas de solo lectura por permiso, propuestas de
                        acción validadas, límites de uso) y asistente.html (panel y botón "¿Qué está pasando?" en las alertas)
    asistente_d1.sql    tabla asistente_uso (02_Base_de_datos_D1/11_asistente_d1.txt)
    patch29.py          contexto externo del asistente: contexto_server.js (herramienta contexto_externo: calendario, proveedores,
                        noticias; eventos comerciales en Administración > Umbrales) y enlaces en el panel del asistente
    contexto_d1.sql     tablas contexto_externo y eventos_comerciales (02_Base_de_datos_D1/12_contexto_externo_d1.txt)
    generar_clave_push.mjs  genera la clave VAPID (secreto VAPID_JWK del Worker; no se guarda en el proyecto)
    reglas_pers.js      SQL de reglas personalizadas
    *.html              páginas (admin, mis_alertas, seguimiento, campanita, login, tema)
    *_d1_tablas.sql / vistas_fecha.sql / prealertas_prod.sql / umbrales_d1.sql / feriados_d1.sql
                        el SQL de cada etapa, una sentencia por línea (lo usa mkdb.mjs para armar la base de prueba)
    umbrales_sql.py, feriados_sql.py   generan umbrales_d1.sql / feriados_d1.sql y su .txt para la consola
    modelo_v2_sql.py    genera modelo_v2_d1.sql y 02_Base_de_datos_D1/09_modelo_v2_d1.txt (índice del perfil, borrado de
                        vistas y tablas sin uso, vacía alertas y métricas: la demo arranca sin datos recibidos)
    mkdb.mjs            arma una base SQLite de prueba: base.sqlite + todos los .sql de las etapas
                        (incluye 03_Modelo_v2_perfil/perfil_comportamiento_d1.sql y modelo_v2_d1.sql)
    test_auth.mjs       recorre la demo completa (se compara con pruebas/out_a.txt)
    servidor_local.mjs  corre w.mjs en Node con una base SQLite para verlo en el navegador (http://localhost:8787);
                        con ASISTENTE_LOCAL=simulado el asistente usa un modelo de mentira (para ver pantalla y permisos)
  pruebas/
    base.sqlite         la base como estaba antes del modelo v2 (mkdb le aplica las etapas encima)
    *test.mjs           pruebas por módulo (umbrales, seguimiento, feriados, admin, asignación, avisos, caché, perfiles, push, asistente)
    motor.mjs           para las pruebas: el SQL del motor sacado de w.mjs (reemplaza a las vistas)
    referencia_tablero.mjs  consultas del tablero anterior, para que cachetest compare el cache
    gen.py              generador original de la base de la demo (series, curva horaria, escenas)
  modelo_v2/            modelo nuevo: generar_historico.py, perfil_comportamiento_postgres.sql, correr_perfil_pglite.mjs,
                        armar_d1.py, feriados.csv
  word/                 helper de Word con el estilo de la compañera e índice real (helios_docx.js, indice.py)
```

### Construir y probar (Python 3.11+ y Node 22.5+, que trae `node:sqlite`)
En Windows, Python tiene que leer los archivos como UTF-8: `export PYTHONUTF8=1` (o `set PYTHONUTF8=1` en cmd) antes del build.
```bash
cd 07_Codigo_fuente/worker
python build.py originales/worker_alertas_cron_original.js w.mjs     # genera el Worker
# comparar w.mjs con 01_Worker/worker_alertas_cron.js; si está bien, copiarlo ahí para publicar

node --no-warnings mkdb.mjs ../pruebas/base.sqlite prueba.sqlite
node --no-warnings test_auth.mjs prueba.sqlite > salida.txt            # debe ser igual a ../pruebas/out_a.txt

cd ../pruebas
for t in umbtest segtest fertest admtest asigtest avtest cachetest perftest pushtest asistest ctxtest; do
  node --no-warnings ../worker/mkdb.mjs base.sqlite $t.sqlite && node --no-warnings $t.mjs $t.sqlite
done                                                                   # cada una termina en "TODO OK" / "TODO IGUAL"
```
Para un cambio nuevo: crear `patch30.py` con una función `aplicar(s)` (como los anteriores), sumarlo al final de `build.py`, correr build + pruebas y recién después copiar el resultado a `01_Worker/`. Todo SQL nuevo se prueba antes en SQLite con `SQLITE_LIMIT_COMPOUND_SELECT = 2`.

## Perfiles (11/11, patch25) — publicado
- Gerente: tablero de lectura con **Estado por cliente** (Panorama), 24 h e histórico; sin lista de alertas, pre-alertas ni Seguimiento.
- Analista: tablero completo, Seguimiento, deriva, resuelve, "Avisar a Soporte" en pre-alertas, reglas de derivación. Sin reglas de alerta.
- Soporte: solo Mis alertas (`/` lo redirige, `/api/dashboard` da 403, historial solo de lo suyo o de su equipo).
- Administrador: arranca en Administración; tablero y Seguimiento en lectura; no recibe alertas ni tiene campanita.
- Avisos del navegador desde la campanita (con la página abierta). Pendiente: push con el navegador cerrado, mail, SMS o app (lo investiga la compañera).
- Sin SQL nuevo: solo publicar `01_Worker/worker_alertas_cron.js` (puede ir junto con el del modelo v2, después del script 09).

## Avisos push (12/11, patch26) — publicado
- Los avisos de la campanita llegan al celular o la PC aunque Helios esté cerrado (Web Push, gratis). Android y PC con Chrome/Edge/Firefox; iPhone solo con Helios agregado a la pantalla de inicio (iOS 16.4+). Helios se puede instalar como app (manifiesto, ícono del caballo de ajedrez del logo "Helios System", service worker `/sw.js`; el mismo caballo es el logo de la barra superior y del login).
- Tabla nueva `suscripciones_push` (una fila por dispositivo; 21 tablas). Secreto nuevo del Worker `VAPID_JWK` (JSON de la clave P-256). Sin el secreto todo sigue como antes.
- Después de cada POST que crea avisos (y en el cron) se mandan los push: contenido cifrado, máximo 25 dispositivos por pedido, 3 avisos por push + "y N más". 2 consultas extra por POST solo si hay secreto. 404/410 borra la suscripción. Desuscribir no pide sesión (la dirección del dispositivo es la credencial) y se hace al cerrar sesión.
- Solo se aceptan servicios de push conocidos (Google, Apple, Mozilla, Microsoft), así el Worker no le manda pedidos a cualquier dirección.
- Probado: entrega real en PC con Chrome; cifrado (se descifra como el navegador), firma VAPID, service worker simulado y regresión completa.
- Aplicado en Cloudflare el 12/11 (script 10, secreto, Worker) y probado en PC con Chrome. En PC, Chrome tiene que quedar corriendo en segundo plano. La última versión ("Revisando…" en la campanita) puede faltar publicar.

## Asistente de IA (13/11, patch28) — publicado (con las correcciones 28b–28d, publicadas el 13/11 junto con el parche 29)
- Botón "Asistente" en todas las páginas y "¿Qué está pasando?" junto a las acciones de cada alerta. Workers AI (enlace `AI`; modelo en `ASISTENTE_MODELO`, por defecto `@cf/qwen/qwen3-30b-a3b-fp8`).
- Responde solo con lo que el perfil puede ver: herramientas de solo lectura en el servidor, cada una con el permiso de la pantalla equivalente (el modelo no ve las que no corresponden y, si las pide, el servidor las rechaza).
- **Nunca ejecuta nada:** propone acciones (`sugerir_accion`, validadas en el servidor) y la página muestra "Hacerlo", que llama a las rutas de siempre. Gerente y Administrador no reciben propuestas.
- Cuidado de D1: caché e índices, ~15-20 consultas y 2 escrituras por pregunta (`asistente_uso` + auditoría `ASISTENTE`). Límites: 20 por persona por hora (`ASISTENTE_POR_HORA`) y 150 por día en total (`ASISTENTE_POR_DIA`), para el cupo gratuito de 10.000 neuronas.
- Aplicado en Cloudflare el 13/11 (script 11, enlace `AI` de Workers AI, Worker publicado); el panel abre bien como Administrador. **Pendiente:** probar las preguntas sugeridas de cada perfil con el modelo real y ajustar el prompt o el modelo si hace falta.
- **Corrección 28b (13/11):** con Workers AI, Qwen3 a veces escribía la definición de las herramientas (`<tools>…</tools>`) en vez de usarlas. Ahora: la pregunta libre lleva siempre los datos principales del perfil (`ASIST_BASE`: Soporte `mis_alertas`, Analista `alertas_abiertas`, Gerente y Administrador `estado_clientes`), se leen llamadas escritas como `<tool_call>`, y si el modelo devuelve un eco se le pide la respuesta de nuevo sin herramientas; nunca se muestra ese texto. **28c:** el Analista preguntó por horarios y clientes y el modelo dijo que no tenía acceso: ahora, según las palabras de la pregunta (`ASIST_PALABRAS`), se suman los datos que hacen falta (máximo 3, siempre dentro del perfil), `incidentes` trae `por_horario` (hora de Argentina) y el prompt describe cada herramienta y prohíbe negarse sin pedirla. Sin SQL nuevo. Respaldo del publicado en `99_Archivo_viejo/worker_antes_parche28b/`; ramas `respaldo-antes-parche-28b`, `version-parche-28b-asistente-respuestas` (intermedia, no publicada) `version-parche-28c-asistente-datos-por-pregunta` (intermedia) y `version-parche-28d-asistente-tema-y-formato` (la que se publica). **28d:** solo habla de Helios (preguntó si Maradona vivía y contestó); nunca responde de memoria cosas del mundo; no muestra `alerta_id`, nombres de campos ni etiquetas tipo `<resumen_turno>` (instrucciones + limpieza en el servidor).
- Si se agrega una herramienta: que exija un permiso de `PERMISOS`, lea poco (caché o índice, con LIMIT) y devuelva datos ya resumidos (horas en Argentina, valores formateados) para gastar pocas neuronas.

## Contexto externo del asistente (13/11, patch29) — publicado
- Herramienta `contexto_externo` (todos los perfiles; permiso `asistente`) y pregunta sugerida "¿Hay algo de afuera que pueda afectar hoy o mañana?". Trae:
  1. **Calendario** (de la base, con el reloj de Helios): feriados, fines de semana largos, primer día hábil después, 1.º a 4.º día hábil del mes (cobro de sueldos), aguinaldo (30/6 y 18/12) y eventos comerciales.
  2. **Proveedores**: incidentes abiertos y mantenimientos de las próximas 48 h de páginas de estado tipo Statuspage (`/api/v2/incidents/unresolved.json` y `/api/v2/scheduled-maintenances/upcoming.json`). Por defecto Cloudflare y Twilio; variable `CONTEXTO_PROVEEDORES` = `[{"nombre":"…","base":"https://…"}]` (máx. 6).
  3. **Noticias** de Argentina de las últimas 48 h (desde 29c: Google Noticias RSS, con GDELT de respaldo; sin clave; variable `CONTEXTO_NOTICIAS_CONSULTA`). Máx. 8 titulares, sin repetidos, solo https.
  4. **Eventos comerciales**: tabla `eventos_comerciales`, sección nueva en Administración > Umbrales (solo Administrador, auditoría `ALTA_EVENTO` / `BORRAR_EVENTO`). Precargados CyberMonday (2–4/11) y Black Friday (27–30/11) 2026.
- Cuidado del plan: proveedores y noticias se guardan una hora en `contexto_externo` (2 filas) y solo se consultan cuando alguien pregunta; si fallan, se usa lo último y no se reintenta hasta la hora. 5 s de tope por pedido, ~5 pedidos externos por hora como mucho. Con `CONTEXTO_EXTERNO=apagado` solo usa el calendario. Soporte no recibe los servicios críticos de los clientes.
- La regla 6 de las instrucciones sigue limitando el tema a Helios, pero acepta lo de afuera que afecta la operación, solo con esa herramienta y citando la fuente. El panel del asistente vuelve tocables los enlaces https (texto escapado).
- `ASIST_ARGS` (en `asistente_server.js`): parámetros que salen de la pregunta ("este mes" → 30 días; "la semana" → 7; "mañana" → 2).
- **29b (13/11, publicado):** la primera prueba real listó incidentes de Twilio y Cloudflare de otros países y no mencionó calendario ni noticias. Ahora el servidor filtra al leer (`ctxRelevantes`): aparte y primero lo de Cloudflare Workers/D1 (afecta a Helios mismo), después lo de Argentina o la región, lo global solo si es importante o grave; lo de otros países y lo menor sin lugar se descarta (y se cuenta). Arma `puntos_clave` (Helios, calendario, proveedores, noticias) y el panel muestra sublistas con sangría. Respaldo en `99_Archivo_viejo/worker_antes_parche29b/`, ramas `respaldo-antes-parche-29b` y `version-parche-29b-contexto-relevante`.
- **29d (13/11, publicado y probado con el modelo real: enlaces bien, respuesta completa con Qué vigilar):** tercera prueba real: la estructura salió bien, pero los enlaces de Google Noticias (~400 caracteres) salían rotos y la respuesta se cortaba. Ahora al modelo no le llega ninguna dirección web: cada novedad lleva un código corto (`[E1]` proveedores, `[N1]` noticias; no `P`, para no chocar con las prioridades P1–P4) y `asistEnlaces` los cambia por el enlace real en el servidor (las herramientas lo pasan en `_enlaces`, que no llega al modelo). Códigos inventados se borran. Respuesta hasta 900 tokens. Respaldo en `99_Archivo_viejo/worker_antes_parche29d/`, ramas `respaldo-antes-parche-29d` y `version-parche-29d-enlaces-cortos`.
- **29c (13/11, publicado):** segunda prueba real: el modelo copió "Helios (solo si hay algo)" como título, se colaron Twilio Costa Rica y Colombia (el componente decía "Latin America") y las noticias dieron "no respondió a tiempo". Ahora gana el país del título; las noticias salen de **Google Noticias** (RSS de Argentina en español, sin clave; `CONTEXTO_NOTICIAS_CONSULTA`) con GDELT de respaldo; si una fuente falló, se reintenta a los 10 minutos (no a la hora); y `como_usarlo` pide títulos exactos (**Helios** solo si hay algo, **Calendario**, **Proveedores**, **Noticias**, **Qué vigilar**). Respaldo en `99_Archivo_viejo/worker_antes_parche29c/`, ramas `respaldo-antes-parche-29c` y `version-parche-29c-noticias-y-filtro`.
- Aplicado en Cloudflare el 13/11 (script 12 y Worker, que incluye 28b–28d). **Pendiente:** preguntar "¿Hay algo de afuera que pueda afectar hoy o mañana?" con cada perfil. Respaldo en `99_Archivo_viejo/worker_antes_parche29/`, ramas `respaldo-antes-parche-29` y `version-parche-29-contexto-externo`.

## Dónde estamos (modelo nuevo, 3 etapas)
1. **Feriados — hecho.** Tabla `feriados` (API argentinadatos), opción "silenciar en feriados" por cliente/servicio.
2. **Perfil de comportamiento — hecho en código; falta aplicarlo en Cloudflare.**
   - Perfil por serie × día de la semana (0 = domingo) × franja de 15 min (hora ARG, 0–95) × tercio del mes (por día del calendario: 1–10 / 11–20 / 21 a fin de mes; columna `tercio_mes`), entrenado fuera de D1 con 12 meses de historia ficticia. Todas las celdas tienen entre 13 y 19 muestras de su propio tercio. Ya está cargado en D1 (26.208 filas, 11/11).
   - El motor (patch24) compara cada ventana con su celda del perfil por clave primaria; un feriado se compara como domingo. **No hay vistas**: su SQL está en el Worker. La demo de 19 escenas da exactamente las mismas alertas y pre-alertas que antes. Arranca **sin datos recibidos**: el perfil está entrenado hasta el lunes 26/10 10:00 y la escena 1 es la primera llegada; por eso la ventana faltante solo avisa desde el primer dato que mandó cada serie, y el tablero dice "desde las 10:00" en vez de "del día" ("Cliente nuevo" queda solo para el que no tiene perfil).
   - **Pendiente de Uriel, en este orden:** ~~(1) correr el script 09~~ y ~~(2) publicar el Worker~~ (hechos el 11/11; también se corrió el 08 de feriados, que faltaba: solo bloques 1–26 y 35); (3) Preparar demo y recorrer las escenas; (4) borrar el Worker `worker-api-bi` del panel.
   - Quedan 20 tablas y 0 vistas. Se borraron `core_metricas_esperadas`, `historico_metricas`, `calendario` (el día de la semana y el tercio se calculan de la fecha), `raw_metricas_recibidas` y `demo_escenarios`.
3. **Revisión incremental + limpieza — pendiente.** Cada revisión procesa solo lo recibido desde la anterior (marca de agua + estado por serie, ~50 filas en vez de ~6.500), botón "Recalcular últimas 24 h". Limpieza que queda: `tablero_cache` pasa a ser una columna de `alerta_parametros`, y `alerta_reglas` se junta con `alerta_reglas_personalizadas` en `reglas_alerta` (queda en 18 tablas).

Decidido (11/11): el tercio es por día del calendario, no por día hábil. El día de la semana ya separa hábiles de fines de semana; por día hábil el tercio 3 tenía 0 a 3 días por mes.

Para reentrenar el perfil sin PostgreSQL instalado: `generar_historico.py` → `correr_perfil_pglite.mjs` (corre `perfil_comportamiento_postgres.sql` en PGlite, Postgres dentro de Node) → `python armar_d1.py <salida_postgres.sql> 03_Modelo_v2_perfil` → cargar `perfil_comportamiento_d1.txt` en D1.
