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
- Cloudflare, plan gratuito. Base D1 `helios-monitoring-dev`; Worker `worker-alertas-cron` (todo el sistema). `worker-api-bi` (Power BI) ya no se usa, pero Uriel decidió dejarlo en el panel por las dudas (16/11): no proponer borrarlo.
- **El Cron Trigger está apagado** (se quitó hace tiempo para no gastar lecturas): hoy las revisiones solo corren con las escenas de la demo (el botón "Revisar alertas ahora" se sacó en el parche 34). Lo que figure en el uso de D1 viene de cargas manuales o del tablero.
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
    build.py            aplica demo_server.js y patch9.py … patch48.py, patch50.py, patch51.py y patch52.py → w.mjs (no hay patch49.py: el 49 es la rama de Jira de Ale)
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
    patch52.py          la tendencia pasa a ser por ventana y acumulada del período (Día: un punto cada 15 minutos; Semana: cada hora; Mes: cada día; el paso se
                        adapta a los datos medidos), con el último punto igual al número de arriba. Reemplaza al gráfico diario de 30 días del 51, que pedía varios
                        días de datos. `dispoTendencia` y `tendencia: {inicio_utc, paso_minutos, pt}` en GET /api/tablero/periodo. Sin SQL.
    patch51.py          gráfico lineal de tendencia en el desplegable de cada cliente (reemplazado por el 52) y arreglo de "desde cuándo se mide" cada
                        servicio (antes salía de series_estado, que solo recuerda 25 h; el arreglo sigue). Sin SQL. Prueba: pruebas/disponibilidadtest.mjs
    patch50.py          disponibilidad más clara: el texto largo de "cómo se mide" pasa a una línea (Grave = 100 % · Importante = 50 % · Leve = 0 %), el semáforo
                        y la barra comparan la disponibilidad del período elegido con el objetivo (antes, el tiempo sin servicio contra el margen de todo el mes:
                        un día con 96 % salía verde con objetivo 99,9 %) y la barra tiene una marca de lo que permite el objetivo. Sin SQL.
                        Prueba: pruebas/disponibilidadtest.mjs
    patch48.py          ajustes del dashboard gerencial: filtro por estado en las alertas abiertas, la disponibilidad sube bajo "Estado por cliente"
                        (sin los 4 recuadros), semáforo verde / amarillo / rojo por cliente y servicio (dispoEstado; límite del amarillo
                        = umbral_amarillo en alerta_parametros.disponibilidad_config, 150 % del margen por defecto) y resumen de clientes
                        en barras horizontales que se abren al tocarlas. Sin SQL nuevo. Prueba: pruebas/disponibilidadtest.mjs
    patch47.py          "Comunicar incidente" sin el texto "Le llega a hasta N personas…" (pedido de Ale; solo la página de detalle)
    patch46.py          comunicar incidente por push: perfil "Solo comunicados" (usuarios.solo_comunicados = 1 con perfil 'GERENTE', leído como
                        COMUNICADOS), listas de difusión (Administración, JSON en alerta_parametros.listas_difusion; rol informado / técnico / líder),
                        "Comunicar incidente" en el detalle, página /comunicados y /comunicado/<id> (comunicados.html), botones "Recibido" y
                        "Responder" en el aviso (sw.js), campanita y push también para Gerente y "Solo comunicados", enlace "Comunicados" en el menú.
                        comunicados_server.js; comunicados_d1.sql = script 21. Prueba: pruebas/comunicadostest.mjs. Guía: 05_Documentacion/novedades_comunicados.md
    patch45.py          disponibilidad mensual contra un objetivo, configurable: objetivo_mensual (umbrales_config, por defecto 99,9 %, con decimales,
                        general / cliente / servicio) y pesos en alerta_parametros.disponibilidad_config (JSON: cuánto cuenta cada gravedad y cuánto
                        pesa cada criticidad); dispoCalcular en el Worker; grupo "5 · Disponibilidad mensual" y "Cómo se mide la disponibilidad" en
                        Administración > Umbrales; bloque de disponibilidad en el tablero. disponibilidad_d1.sql = script 20. Prueba: pruebas/disponibilidadtest.mjs
    patch44.py          resumen por período (Día / Semana / Mes con ‹ ›): GET /api/tablero/periodo, KPIs y "Distribución de fallas" del período
                        (reemplaza a la sección hoy / 7 / 30 días). Prueba: pruebas/periodotest.mjs
    patch43.py          gráfico "Incidentes activos ahora" (barras por cliente o tipo de falla; tocar una barra filtra la lista). Solo página
    patch42.py          Gerente y Administrador ven la lista de alertas activas y el detalle, en solo lectura (rolEnAlerta.lectura / botonesDe),
                        actualización automática del tablero cada 2 min (GET /api/tablero/version) y pregunta del asistente. Prueba: pruebas/gerentetest.mjs
    patch41.py          tickets a demanda en InvGate o Jira: "Generar ticket" en el detalle y casilla en el correo (el número va al asunto,
                        al texto y a {ticket}); tickets_server.js (POST /api/alertas/<id>/ticket, novedadTicket) y tickets_integracion.js
                        (PUNTO DE ENGANCHE del equipo de integración: crearTicketInvgate / crearTicketJira / rutasTicketsIntegracion);
                        modo por herramienta TICKETS_INVGATE / TICKETS_JIRA = 'real' (si no, simulado). tickets_d1.sql = script 19
                        (tabla tickets_alerta). Prueba: pruebas/integraciontest.mjs (con una integración de mentira). Guía: 05_Documentacion/integracion_tickets.md
    patch40.py          plantillas de correo (Administración > "Plantillas de correo", solo Administrador; plantillas_server.js,
                        alerta_parametros.plantillas_correo en JSON, plantillas_d1.sql = script 18; sin la columna usa las 6 de fábrica)
                        y ajustes al 39: botón "Template correo alerta «problema · cliente»", sin texto explicativo, selector de plantilla,
                        y "Confirmar envío" pide Para/CC reales. Prueba: pruebas/correotest.mjs
    patch39.py          correo desde la alerta: botón "Preparar correo" en el detalle (borrador con los datos de la alerta, Outlook web por
                        enlace deeplink o de escritorio por mailto, "Copiar texto") y "Confirmar envío" en la conversación (tal cual / con
                        cambios + texto final / no se envió). correo_server.js (POST /api/alertas/<id>/correo y /correo/envio). Sin SQL.
                        Prueba: pruebas/correotest.mjs
    patch38.py          etapa 3b: reglas_alerta (reemplaza a alerta_reglas y alerta_reglas_personalizadas) y columnas tablero_revision /
                        tablero_calculado en alerta_parametros (reemplazan a tablero_cache); scripts 16 y 17 (reglas_cache_d1.sql, limpieza_d1.sql).
                        Prueba: pruebas/migtest.mjs (necesita pruebas/w_anterior.mjs: git show HEAD:01_Worker/worker_alertas_cron.js antes del parche)
    patch37.py          etapa 3: revisión incremental (marca alerta_parametros.revisado_hasta + índice ix_observadas_recepcion,
                        revision_d1.sql = script 15); variantes *_INC armadas desde las consultas completas; caché del tablero
                        en la misma revisión; "Recalcular 24 h" (Administrador, /api/admin/recalcular). Prueba: pruebas/inctest.mjs
    patch36.py          "Distribución de fallas": % de problemas por cliente / tipo / causa, hoy-7-30 días, en el tablero
                        y en Mis alertas (solo lo propio); Q_INCIDENTES_30D suma causa_resolucion; /api/mis-alertas suma incidentes
    patch35.py          leyenda de colores en la conversación del detalle (movimiento, comentario, archivo, resolución)
    patch34.py          sin botón "Revisar alertas ahora"; POST /api/procesar solo con PERMITIR_REVISION_MANUAL = '1' (umbtest y fertest)
    patch33.py          "Ver detalle" en las resueltas (Seguimiento y Histórico del tablero) para Analista y Soporte;
                        Q_INCIDENTES_30D suma alerta_id (cachetest lo verifica y compara el resto igual que antes)
    patch32.py          tablero: el recuadro "Urgente" muestra el estado real (en curso / asignada sin tomar / devuelta / sin asignar)
    patch31.py          tono profesional (sin "vos"/"tuyo" para nombrar a la persona: nombre o "(sesión actual)") y Umbrales
                        explicado: "Cómo decide Helios" en 4 pasos, grupos numerados, "↑ Si lo subís / ↓ Si lo bajás" por campo
    patch30.py          ticketera: página /alerta/<id> (alerta.html, armada desde Mis alertas ya terminada), ticketera_server.js
                        (detalle, evidencia en D1 —evidencia_d1.sql, tabla evidencia_archivos, base64 en pedazos— o en R2 si hay binding
                        EVIDENCIA; resolución con causa; opciones editables), ticketera_d1.sql (scripts 13 y 14 de 02_Base_de_datos_D1).
                        servidor_local guarda la evidencia en la base; con CON_R2=1 simula R2 en worker/evidencia_local/
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
for t in umbtest segtest fertest admtest asigtest avtest cachetest perftest pushtest asistest ctxtest tickettest correotest integraciontest gerentetest periodotest disponibilidadtest comunicadostest; do
  node --no-warnings ../worker/mkdb.mjs base.sqlite $t.sqlite && node --no-warnings $t.mjs $t.sqlite
done
# etapa 3b: migración a mitad de camino (esquema viejo -> scripts 16 y 17 -> Worker nuevo); necesita w_anterior.mjs
git show bbca169~1:01_Worker/worker_alertas_cron.js > w_anterior.mjs   # el Worker de antes del parche 38 (commit anterior a bbca169)
SIN_ETAPA_3B=1 node --no-warnings ../worker/mkdb.mjs base.sqlite mig_a.sqlite && SIN_ETAPA_3B=1 node --no-warnings ../worker/mkdb.mjs base.sqlite mig_b.sqlite && node --no-warnings migtest.mjs mig_a.sqlite mig_b.sqlite
# revisión incremental: la demo en dos bases (incremental y completa) tiene que dar lo mismo en cada escena
node --no-warnings ../worker/mkdb.mjs base.sqlite inc_a.sqlite && node --no-warnings ../worker/mkdb.mjs base.sqlite inc_b.sqlite && node --no-warnings inctest.mjs inc_a.sqlite inc_b.sqlite                                                                   # cada una termina en "TODO OK" / "TODO IGUAL"
```
Para un cambio nuevo: crear `patch53.py` con una función `aplicar(s)` (como los anteriores), sumarlo al final de `build.py`, correr build + pruebas y recién después copiar el resultado a `01_Worker/`. Todo SQL nuevo se prueba antes en SQLite con `SQLITE_LIMIT_COMPOUND_SELECT = 2`.

## Perfiles (11/11, patch25) — publicado
- Gerente: tablero de lectura con **Estado por cliente** (Panorama), 24 h, histórico, **lista de alertas activas con su estado y quién las tiene, pre-alertas y el detalle de cada alerta, todo en solo lectura** (desde el parche 42); sin Seguimiento ni acciones.
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
- **29e (13/11, publicado el 13/11; sin SQL):** ajustes después de probar todas las preguntas sugeridas con los 4 perfiles y el modelo real. Cada pregunta sugerida lleva una **guía de respuesta** (`guia` en `ASIST_SUGERENCIAS`) y el servidor arma los datos en frases: `alertas_abiertas` trae `cuantas` (sin asignar / asignadas sin tomar / en curso / demoradas; antes decía "sin asignar" de una asignada), todas las alertas traen `lleva_en_este_estado` y `demorada` (15 min / 30 min / 2 h, como Seguimiento), `estado_clientes` trae frases, clientes nuevos y `resto` contado (no lista los que están bien), `ajustes_sugeridos` explica que 100 % es la banda del modelo y la fila general ya no parece "el cliente general". Soporte recibe el botón "Tomar" armado por el servidor (`proponer`). Reglas de voseo y sin títulos `###` (el servidor los pasa a negrita). Contexto externo: títulos en español armados en el servidor (`ctxTituloEs`, el original queda en `titulo`), en Helios solo Workers en ejecución, D1 y Workers AI (`CTX_NO_HELIOS` saca Event Subscriptions, Builds, Logs, etc.), proveedores con nombres cortos, **Qué vigilar armado en el servidor** y **calendario con la fecha real** cuando está el reloj de la demo (`CONTEXTO_CALENDARIO=demo` vuelve al reloj de la demo). Respaldo en `99_Archivo_viejo/worker_antes_parche29e/`, ramas `respaldo-antes-parche-29e` y `version-parche-29e-ajustes-pruebas-reales`.
- **29c (13/11, publicado):** segunda prueba real: el modelo copió "Helios (solo si hay algo)" como título, se colaron Twilio Costa Rica y Colombia (el componente decía "Latin America") y las noticias dieron "no respondió a tiempo". Ahora gana el país del título; las noticias salen de **Google Noticias** (RSS de Argentina en español, sin clave; `CONTEXTO_NOTICIAS_CONSULTA`) con GDELT de respaldo; si una fuente falló, se reintenta a los 10 minutos (no a la hora); y `como_usarlo` pide títulos exactos (**Helios** solo si hay algo, **Calendario**, **Proveedores**, **Noticias**, **Qué vigilar**). Respaldo en `99_Archivo_viejo/worker_antes_parche29c/`, ramas `respaldo-antes-parche-29c` y `version-parche-29c-noticias-y-filtro`.
- Aplicado en Cloudflare el 13/11 (script 12 y Worker, que incluye 28b–28d). **Pendiente:** preguntar "¿Hay algo de afuera que pueda afectar hoy o mañana?" con cada perfil. Respaldo en `99_Archivo_viejo/worker_antes_parche29/`, ramas `respaldo-antes-parche-29` y `version-parche-29-contexto-externo`.

## Ticketera (14/11, patch30) — publicado el 14/11
- Detalle de cada alerta en `/alerta/<id>` (Soporte y Analista; permiso `detalle_alerta`): conversación con la evidencia intercalada, datos, ventanas, acciones. Lo elegido al resolver en `alertas_historico.causa_resolucion` / `acciones_resolucion`; las opciones en `alerta_parametros.opciones_resolucion` (JSON, editable en Administración > Reglas de alerta). **Evidencia en D1** (tabla `evidencia_archivos`, base64 en filas de 90.000 caracteres; 1 MB por archivo, 200 MB en total; las capturas se achican en el navegador) porque R2 pide tarjeta; si se conecta R2 (binding `EVIDENCIA`) el mismo código lo usa.
- Aplicado en Cloudflare el 14/11: scripts 13 y 14 corridos y Worker publicado (con el parche 31). **Pendiente:** probar con Soporte y Analista. Guía: `05_Documentacion/novedades_ticketera.md`.
- Respaldo: `99_Archivo_viejo/worker_antes_parche30/`, ramas `respaldo-antes-parche-30` y `version-parche-30-ticketera`.
- Conocido y anterior a este cambio: en el celular, la barra de Seguimiento no entra y "Helios" se pisa con "Actualizar".

## Textos y Umbrales (14/11, patch31) — publicado el 14/11 junto con el parche 30
- Tono: la app no nombra a la persona con "vos" ni "tuyo" ("Resuelta por Sol Porte", "Asignada a Sol Porte", "(sesión actual)" en listas); las indicaciones siguen en rioplatense ("Elegí", "Tocá"). También los mensajes de error del servidor.
- Umbrales: recuadro "Cómo decide Helios" (1 lo normal y su margen → 2 ¿hay alerta? → 3 ¿qué tan grave? → 4 ¿qué se atiende primero?) en la pestaña y en el diálogo; grupos del diálogo en ese orden; cada campo con "↑ Si lo subís / ↓ Si lo bajás"; tarjetas en frases simples. Sin SQL.

## Distribución de fallas (16/11, patch36) — publicado el 16/11
- Pedido del líder que vio la demo ("torta" de fallas por cliente). Se hizo como lista con barras de un color (la guía de gráficos desaconseja torta: con 8 clientes no se distinguen porciones y el color cambiaría de significado al cambiar de período). Cortes Cliente / Tipo de falla / Causa; períodos Hoy / 7 / 30 días. Tablero (Analista, Gerente, Administrador) y Mis alertas (Soporte, solo lo suyo). Sin SQL.
- Las pruebas: `cachetest` ignora `causa_resolucion` al comparar con la consulta vieja; `ctxtest` tenía fechas fijas en el GDELT simulado (fallaba a las 48 h): ahora son relativas a la hora actual.

## Sin botón "Revisar alertas ahora" (14/11, patch34) — publicado el 16/11
- Decidido por Uriel: cada revisión lee hoy 24 h (~6.500 filas) y el botón no hacía falta (las escenas ya revisan; en producción, el cron o la ingesta). No volver a agregar un disparador manual en la barra; si hace falta, un "Recalcular últimas 24 h" para el Administrador junto con la etapa 3.

## "Ver detalle" en las resueltas (14/11, patch33) — publicado el 16/11
- El Analista no tenía forma de ver cómo se resolvió una alerta. Ahora: Seguimiento > Resueltas (24 h) y Tablero > Histórico tienen "Ver detalle" (conversación, evidencia, causa y qué se hizo). Solo para quien tiene `detalle_alerta`. Sin SQL.

## Recuadro "Urgente" del tablero (14/11, patch32) — publicado el 16/11
- Decía "Sin asignar" cuando la alerta estaba asignada pero nadie la había tomado (solo miraba si estaba tomada). Ahora: "En curso: X", "Asignada a X (equipo Y), sin tomar", "Asignada al equipo Y, sin tomar", "Devuelta al analista" o "Sin asignar". Solo la página del tablero; sin SQL.

## Pendientes en pausa (16/11) — se retoman después de Correo y War Room
Pedido de Ale: quedan guardados en este orden, sin empezar.
1. ~~Aplicar la etapa 3b en Cloudflare~~ — hecho por Uriel el 16/11 (scripts 16 y 17, Worker del 38).
2. Probar en Cloudflare la ticketera con Soporte y Analista, y "¿Hay algo de afuera…?" con cada perfil.
3. Tablero de causas (`causa_resolucion` / `acciones_resolucion` por cliente, servicio y mes).
4. Ingesta real `POST /api/metricas` (normaliza fechas) + token para máquinas.
5. Series del tablero sobre lo nuevo (hoy se recalculan sobre 25 h).
6. Mejoras de Hugo: esperar sus definiciones (sección siguiente).

## En curso (16/11): correo y War Room desde una alerta — de a un punto por vez
1. **Template correo alerta — hecho (parches 39 y 40), Worker publicado el 16/11.** Ver la sección siguiente.
2. **Plantillas de correo — hecho (parche 40), Worker publicado el 16/11; falta correr el script 18 (Ale).**
3. **War Room en Teams** desde la alerta: primero evaluar opciones (enlace directo vs. Microsoft Graph) y después decidir.

## Evolución por ventana (16/11, parche 52) — hecho en código, falta publicar (sin SQL)
Pedido de Uriel al ver el gráfico del parche 51 en la demo ("Todavía no hay datos de varios días"): la tendencia no tiene que necesitar varios días sino varias ventanas, que los clientes sí tienen. Elegido con Uriel: **acumulada, un punto por ventana**.
- **Qué muestra:** en el desplegable de cada cliente, "Evolución de la disponibilidad · cada 15 minutos": cada punto es la disponibilidad **acumulada desde el inicio del período** hasta ese momento, y el último punto es el número grande de arriba (se ve cuándo cruzó el objetivo). Objetivo punteado, puntos con el color del semáforo (con más de 40 puntos solo se marcan los cambios de color y el último), tooltip al pasar por cualquier momento y una frase: "Está por debajo del objetivo y lejos desde 13:30 (94,74 %)".
- **Paso (`paso_minutos`) según lo medido:** Día siempre 15 minutos; con hasta un día y medio de datos también 15 minutos (Semana y Mes); Semana, o hasta ~8 días de datos, cada hora; con más datos (Mes), cada día. Los pasos empiezan en el primer momento medido, no en el inicio del período (un mes con un día de datos no trae miles de pasos vacíos). Respuesta de ~15 KB.
- **Datos:** `GET /api/tablero/periodo` trae `tendencia: { inicio_utc, paso_minutos, pt: [[disponibilidad, estado] | null, …] }` por cliente y en `disponibilidad.global` (`estado`: 0 verde, 1 amarillo, 2 rojo; null = todavía no se medía). `dispoTendencia` usa la misma cuenta que `dispoCalcular` con "hasta" en el final de cada paso, así que el último punto es la disponibilidad del período. Una consulta nueva (`Q_DISPO_PUNTOS`: ventanas con problema del período, por el índice de `ventana_inicio`). Reemplaza a la tendencia diaria de 30 días del parche 51.
- Probado: `disponibilidadtest` (último punto = disponibilidad y semáforo en global y clientes, en Día / Semana / Mes y con datos de varios días; la caída de una ventana Grave aparece en su ventana exacta; pasos adaptables; sin pasos vacíos), demo igual y toda la batería; pantalla en PC con la demo de 19 escenas.
- Respaldo: `99_Archivo_viejo/worker_antes_parche52/`, ramas `respaldo-antes-parche-52` y `version-parche-52-evolucion-por-ventana`.

## Tendencia por cliente (16/11, parche 51) — publicado el 16/11 (sin SQL; el gráfico diario lo reemplaza el parche 52)
Pedido de Uriel (el último punto del pedido original, que había quedado afuera del parche 48): "un gráfico lineal para mostrar las tendencias en el tiempo, como si fuera una crypto", dentro del desplegable de disponibilidad de cada cliente.
- **Gráfico:** en cada cliente, "Tendencia diaria · 27/09 al 26/10": línea con la disponibilidad de cada uno de los últimos 30 días (siempre terminan en el período que se mira, o en hoy si es el actual), el objetivo como línea punteada (leyenda arriba), un punto por día con el color del semáforo (verde / amarillo / rojo, con el mismo criterio del parche 50) y un texto abajo: "Cumplió el objetivo 21 de 30 días · peor día: 29/09 (96,88 %)". Al pasar el mouse por un punto: fecha, disponibilidad, minutos sin servicio y estado. Los días sin datos dejan un hueco. SVG propio, sin librerías; funciona en celular y en modo oscuro.
- **Datos:** `GET /api/tablero/periodo` suma `tendencia` (lista de `{fecha, disponibilidad, estado, minutos_perdidos, hasta_ahora}`) a cada cliente y a `disponibilidad.global` (el global todavía no se dibuja). Cada día se calcula con la misma cuenta del período (`dispoCalcular`); una sola consulta nueva por el índice de `ventana_inicio` (`Q_DISPO_DIARIO`).
- **Arreglo importante (venía de los parches 44 y 45):** "desde cuándo se mide" cada servicio salía de `series_estado.primera_ventana_inicio`, que solo mira las últimas 25 horas. En la demo (todo en un día) no se notaba, pero con datos reales la semana y el mes se habrían medido solo desde ayer: un mes de alertas dividido por ~100 ventanas, o sea una disponibilidad muy baja. Ahora sale de la primera ventana recibida dentro del rango mirado (`Q_DISPO_PRIMERAS`: una consulta correlacionada por servicio que se detiene en la primera fila, por el índice de `ventana_inicio`).
- Probado: `disponibilidadtest` (tendencia con días anteriores armados a mano: desde el 20/10 a las 10:00, ventana Grave el 22/10 = 98,96 %, sin puntos antes de recibir datos, día 22/10 coincide con su punto, el índice), demo igual y todas las pruebas; pantallas en PC, celular y modo oscuro.
- Respaldo: `99_Archivo_viejo/worker_antes_parche51/`, ramas `respaldo-antes-parche-51` y `version-parche-51-tendencia-disponibilidad`.

## Disponibilidad más clara (16/11, parche 50) — publicado el 16/11 (sin SQL)
Pedido de Uriel al mirar el tablero publicado: (1) sacar el texto largo de abajo de la disponibilidad y dejar algo simple ("Alerta Grave = 100 %", etc.); (2) la barra salía verde con 96 % de disponibilidad aunque el objetivo era 99,9 %.
- **Texto:** queda una línea, `Cuenta como sin servicio: alerta Grave = 100 % · Importante = 50 % · Leve = 0 %` (con los valores configurados). Se fue lo de los datos tardíos, el margen del mes y quién define el objetivo.
- **Causa del verde:** `consumo` y `minutos_permitidos` se medían contra el margen de **todo el mes** (43 minutos). Un día con una ventana Grave (15 minutos, 96 % del día) usaba 35 % del margen del mes y salía verde ("Cumple") aunque el número grande dijera 96 % contra 99,9 %.
- **Ahora** (`dispoCalcular`): el margen es el del período medido: `minutos_permitidos = (1 − objetivo) × minutos medidos` y `consumo = tiempo sin servicio / permitido = (1 − disponibilidad) / (1 − objetivo)`. Verde = la disponibilidad llega al objetivo; amarillo = no llega pero `consumo` ≤ `umbral_amarillo` (1,5 por defecto: "Amarillo hasta" en Administración, ahora en % de lo que permite el objetivo); rojo = más. Para un mes completo da lo mismo que antes; para un día, una semana o un mes a medias es más exigente (con 99,9 %, cualquier ventana Grave en un día lo deja en rojo). El parámetro `minutosMes` de `dispoCalcular` ya no se usa.
- **Barra:** llega hasta el límite del amarillo y tiene una marca en lo que permite el objetivo (verde hasta la marca, amarillo hasta el final, rojo cuando se llena). El texto dice `Estuvo X min sin servicio; el objetivo permite hasta Y min`.
- Probado: `disponibilidadtest` (semáforo con casos a 0,8 / 1,2 / 1,8 / 2,5 veces lo permitido, "96 % contra 99,9 % = rojo", cumple y número siempre coinciden, textos nuevos), demo igual y todas las pruebas; pantallas en PC y celular.

## Ajustes del dashboard gerencial (16/11, parche 48) — publicado el 16/11
Pedido al ver el tablero (4 puntos):
1. **Alertas abiertas:** filtro por estado (Todas / Sin asignar / Asignada sin tomar / En curso / Devuelta, con la cantidad de cada una), junto al filtro por cliente o tipo de falla.
2. **"Disponibilidad y resumen del período" sube:** va debajo de "Estado por cliente" y arriba de "Últimas 24 horas". Se sacaron los 4 recuadros (problemas, graves, siguen abiertos, tardó en resolverse).
3. **Semáforo** por cliente y servicio: verde = llega al objetivo, amarillo = no llega pero está cerca (tiempo sin servicio de hasta 1,5 veces lo que permite el objetivo), rojo = lejos (así desde el parche 50; el 48 lo medía contra el margen de todo el mes). El 150 % es editable en "Cómo se mide la disponibilidad" ("Amarillo hasta"); vive en el mismo JSON de pesos, **sin script nuevo**.
4. **Resumen de clientes en barras horizontales** (verde / amarillo / rojo, con % y cantidad): los clientes de cada grupo aparecen recién al tocar la barra.
- Decisión mía a confirmar con Hugo: "cerca" = hasta 150 % del margen (con 99,9 % son hasta ~65 minutos sin servicio en el mes).

## Dashboard gerencial (16/11, parches 42 a 45) — publicado el 16/11 (script 20 corrido y Worker)
Pedido de Hugo (ejemplo: un dueño no podía transferir, el gerente no tenía acceso a estas vistas y tuvo que preguntarle a un analista que no estaba, así que nadie sabía si alguien ya lo trabajaba). Uriel decidió hacerlo en Helios.
- **42 · Gerente y Administrador ven lo activo y el detalle en solo lectura.** Permisos `alertas_abiertas` (suma Gerente) y `detalle_alerta` (suma Gerente y Administrador). El servidor sigue rechazando tomar, derivar, comentar, adjuntar, resolver, devolver, correo y tickets (`rol.lectura`; `botonesDe` devuelve todo apagado); el detalle muestra "Solo lectura". El tablero se actualiza solo cada 2 minutos con la pestaña visible: consulta `GET /api/tablero/version` (1 fila) y recarga todo solo si hubo una revisión. El asistente suma la pregunta "¿Qué incidentes están activos y quién los está trabajando?" para Gerente y Administrador.
- **43 · "Incidentes activos ahora":** barras por cliente (o por tipo de falla) divididas por gravedad, con los números en texto; tocar una barra filtra la lista de abajo. Solo página.
- **44 · Resumen por período:** selector Día / Semana (lunes a domingo) / Mes con ‹ ›, "Volver a hoy" y hasta 400 días atrás (`GET /api/tablero/periodo?tipo=&fecha=`, por el índice de `ventana_inicio`). KPIs y "Distribución de fallas" del período elegido.
- **45 · Disponibilidad mensual configurable.** Se mide en ventanas de 15 minutos de cada servicio: una ventana con alerta Grave cuenta como no disponible (100 %), Importante 50 %, Leve 0 % (editable); no cuentan datos tardíos ni inconsistentes ni series sin perfil. La disponibilidad de un cliente es el promedio de sus servicios ponderado por criticidad (Alta 3, Media 2, Baja 1, editable). **Objetivo mensual por defecto 99,9 %** (43,2 minutos por mes ≈ 2,9 ventanas Graves; 99,98 % = 8,6 minutos, una sola ventana Grave ya lo supera), editable con decimales en general, por cliente o por servicio (Administración > Umbrales, grupo "5 · Disponibilidad mensual", con la equivalencia en vivo y "↑ Si lo subís / ↓ Si lo bajás"); los pesos, en "Cómo se mide la disponibilidad" (`POST /api/admin/umbrales/disponibilidad`, auditoría `EDITAR_DISPONIBILIDAD`). En el tablero: disponibilidad global y por cliente contra su objetivo, barra del margen de errores del mes que se usó (un día o una semana se comparan contra el margen del mes), "Cumple" mientras no se gaste todo el margen, comparación con el período anterior y detalle por servicio. **Script 20** (`20_disponibilidad_d1.txt`: columnas `umbrales_config.objetivo_mensual` y `alerta_parametros.disponibilidad_config`, objetivo general 99,9 %); sin él se usan los valores de fábrica y Administración avisa. **Primero el SQL, después el Worker** (con el Worker nuevo y sin script, guardar umbrales da error).
- Probado: `gerentetest` (36), `periodotest`, `disponibilidadtest` (disponibilidad calculada a mano contra la del Worker, pesos, objetivos, sin script 20), la demo igual y todas las pruebas; pantallas en PC, celular y oscuro.

## Integración InvGate / Jira y comunicación de incidentes (16/11) — en curso
Flujo pedido por Ale: veo un evento → lo gestiono → mando un push "Tenemos este incidente" → cargo el mail → tildo que genere un ticket
(a demanda, nunca solo) → el ticket se suma al mail y al push. La integración con InvGate y Jira la hace **el mismo equipo, en esta misma demo**:
el único punto a completar es `tickets_integracion.js` (ver `05_Documentacion/integracion_tickets.md`). Decidido con Ale: la herramienta se elige en
cada alerta; generan tickets y comunican Analista y Soporte (lo suyo o de su equipo); las audiencias del push son **listas de difusión** con un rol por
persona (informado / técnico / líder).
1. **Tickets a demanda — hecho (parche 41), Worker publicado el 16/11; falta correr el script 19 (Ale).** "Generar ticket" (InvGate o Jira, resumen y descripción armados) y
   casilla en el correo; el número va al asunto (`[INV-1001] …`), al texto (`{ticket}` o una línea "Ticket: …"), a "Datos de la alerta" y a la conversación.
   Simulado hasta que esté la integración (`INV-1001`, `HEL-101`, marcado "simulado"). "Preparar demo" borra los tickets de Helios.
2. **Comunicar incidente (push a demanda) — hecho (parche 46), Worker publicado el 16/11; falta correr el script 21 (Ale).** Decidido con Ale: perfil nuevo **"Solo comunicados"**
   para quien solo se tiene que enterar; listas **generales o de un cliente**, las arma el **Administrador**. "Comunicar incidente" en el detalle (Analista;
   Soporte en lo suyo): listas (primero las del cliente), mensaje armado con el ticket (o casilla para generarlo). Informados solo leen; técnicos dan
   "Recibido" (desde el aviso, sin abrir Helios) y responden; líderes responden sumando información. Respuestas y resumen ("Recibido: 2 de 3 técnicos")
   en la conversación. **El Gerente ahora tiene campanita y push** (solo le llegan comunicados). Se corrigió el push de los avisos de una alerta: ahora sí
   abre el detalle (la consulta no traía `alerta_id`). Guía: `05_Documentacion/novedades_comunicados.md`.
- La War Room en Teams queda en pausa hasta terminar esto.
- **Publicar:** scripts 18, 19, 20 y 21 → Worker (trae los parches 39 a 47). Parche 47: sin el texto "Le llega a hasta N personas…" en el diálogo.

## Plantillas de correo y ajustes (16/11, patch40) — Worker publicado el 16/11 (falta el script 18, de Ale)
- Pedido de Ale: el botón se llama **"Template correo alerta «<problema> · <cliente>»"** (también el título del diálogo); se sacó el texto explicativo.
- **"Confirmar envío" pide a quién se envió** (Para obligatorio, CC opcional), precargado con lo que se escribió al armar el correo y editable: queda
  `Envió el correo «…» sin cambios para a@x (copia a b@y)`. La conversación muestra esos destinatarios reales.
- **Plantillas** (decidido con Ale: por tipo de incidente y por sector; las crea el Administrador; los destinatarios los pone quien envía; sin modelo real
  todavía, así que hay 6 de fábrica: General, Aviso al cliente, Escalar a proveedor o gateway, Caída: escalar a Mesa de ayuda, Aviso a Comercial,
  Cierre del incidente). Cada una: nombre, sector, tipos de alerta (ninguno = todas), para abiertas / resueltas / las dos, asunto y texto con
  variables `{cliente}`, `{problema}`, `{desde}`, `{medicion}`, `{estado}`, `{resolucion}`, `{firma}`… (lista en `plantillas_server.js`).
  Una línea con una variable vacía no se escribe. Ejemplo en vivo en el diálogo de Administración. Auditoría `ALTA/EDITAR/BORRAR_PLANTILLA_CORREO`.
- En el correo, "Plantilla" muestra solo las que sirven para esa alerta (primero las de su tipo) y queda registrado qué plantilla se usó.
- Se guardan en `alerta_parametros.plantillas_correo` (JSON): **script 18** (`18_plantillas_correo_d1.txt`, una columna). Sin el script, todo funciona
  con las de fábrica y Administración avisa que falta para poder guardar.
- **Publicar:** script 18 → Worker (el 38 ya está publicado: scripts 16 y 17 corridos). Incluye el parche 39.

## Correo desde la alerta (16/11, patch39) — Worker publicado el 16/11 (ajustado en el patch40)
- Decidido con Ale: los dos botones (Outlook web y de escritorio), lo usan Analista y Soporte (lo suyo o de su equipo), y queda en la conversación.
- Detalle de la alerta → **"Preparar correo"**: el diálogo trae asunto (`[P1 · Grave] CLI_006 · servicio: problema`, o `[Resuelta] …`) y texto armados
  (qué pasa, cliente, servicio, desde cuándo con fecha completa, lleva/duró, gravedad y prioridad, última medición, estado y quién la tiene o la
  resolución, última novedad, enlace a la alerta y "[Completar: …]"). Se completan Para y CC (validados) y se abre en **Outlook web**
  (`outlook.office.com/mail/deeplink/compose`) o **de escritorio** (`mailto:`); si el texto no entra en el enlace, se abre sin texto y queda copiado.
- Helios **no envía correos ni se conecta a Microsoft 365** (sin Azure ni claves). Por eso la persona confirma después: en la conversación queda
  "preparó un correo" (asunto, destinatarios, texto armado) con **"Falta confirmar si se envió"** y el botón **"Confirmar envío"**:
  se envió tal cual / se envió con cambios (pide el texto final) / no se envió. Punto morado en la conversación (leyenda "Correo").
- Todo como comentarios en `alerta_eventos` (formato en `correo_server.js`) y auditoría `PREPARAR_CORREO` / `CONFIRMAR_CORREO`; sin avisos a nadie.
  El mismo correo reabierto en 10 min no se repite. Cada confirmación se aparea con el primer correo pendiente de ese asunto. Texto hasta 6000 caracteres.
- Vale con la alerta abierta o resuelta. **Sin SQL.** Se publica junto con el parche 40.
- Más adelante (si IT lo aprueba): Microsoft Graph para crear el borrador directo en el buzón, con formato y adjuntos.
- **Decidido con Ale (16/11): los destinatarios del correo se escriben siempre a mano** (Para y CC libres, cualquier dirección). Sin destinatarios
  sugeridos en las plantillas ni agenda de contactos. Las listas de difusión son solo para el push de "Comunicar incidente", no para el correo.

## Pendiente: mejoras de Hugo (ITIL / ITSM / SRE) — no empezar sin sus definiciones
Tipo de impacto (degradación / parcial / caída), servicios de acceso y correlación, coeficientes, segmentos, registro de incidentes y problemas con causa, SLAs por prioridad con escalamiento, SLO y ventanas de mantenimiento. **Nada implementado.** Falta que Hugo mande: lista de servicios con los de acceso marcados, ejemplo de coeficientes reales, cómo distingue degradación / parcial / caída, SLAs y escalamiento por prioridad, lista de causas, la foto del incidente de login y el documento que prometió. Detalle en la sección 18 de `contexto_helios_para_ia.md`. Si alguien pide implementar algo de esto, primero preguntar si ya llegaron esas definiciones.

## Dónde estamos (modelo nuevo, 3 etapas)
1. **Feriados — hecho.** Tabla `feriados` (API argentinadatos), opción "silenciar en feriados" por cliente/servicio.
2. **Perfil de comportamiento — hecho y publicado (11/11); demo recorrida en Cloudflare (16/11).**
   - Perfil por serie × día de la semana (0 = domingo) × franja de 15 min (hora ARG, 0–95) × tercio del mes (por día del calendario: 1–10 / 11–20 / 21 a fin de mes; columna `tercio_mes`), entrenado fuera de D1 con 12 meses de historia ficticia. Todas las celdas tienen entre 13 y 19 muestras de su propio tercio. Ya está cargado en D1 (26.208 filas, 11/11).
   - El motor (patch24) compara cada ventana con su celda del perfil por clave primaria; un feriado se compara como domingo. **No hay vistas**: su SQL está en el Worker. La demo de 19 escenas da exactamente las mismas alertas y pre-alertas que antes. Arranca **sin datos recibidos**: el perfil está entrenado hasta el lunes 26/10 10:00 y la escena 1 es la primera llegada; por eso la ventana faltante solo avisa desde el primer dato que mandó cada serie, y el tablero dice "desde las 10:00" en vez de "del día" ("Cliente nuevo" queda solo para el que no tiene perfil).
   - Aplicado en Cloudflare el 11/11 (scripts 09 y 08, Worker). La demo se recorrió y anda bien (16/11). `worker-api-bi` queda en el panel (decisión de Uriel).
   - Quedaron 20 tablas y 0 vistas en ese momento (hoy son 25: push, asistente, contexto externo y evidencia).
3. **Revisión incremental — hecha y publicada (16/11, parche 37: script 15 corrido y Worker con los parches 32 a 37 publicado). Limpieza de tablas (3b) — hecha y publicada (16/11, parche 38: scripts 16 y 17 corridos y Worker publicado).**
   - Cada revisión mira solo lo recibido desde la marca `alerta_parametros.revisado_hasta` (con 2 min de solape), por el índice `ix_observadas_recepcion`: reglas del sistema solo en esas ventanas; "dejaron de llegar datos" desde 2,5 h antes de la marca; personalizadas desde 4 h antes; normalizadas solo de series con datos nuevos; "desaparecidas" solo en ventanas con datos nuevos (dato corregido o tardío). El caché del tablero se actualiza en la misma revisión (pre-alertas: episodios de las últimas 4 h, recalculados con 6 h).
   - Revisión completa (como antes) cuando: no hay marca, el reloj volvió atrás (Preparar demo), pasaron más de 24 h, falta el script 15, "Recalcular 24 h" del Administrador (al final de Umbrales) o la ruta de pruebas `/api/procesar` (con `?incremental=1` hace la incremental).
   - Un cambio de umbrales, reglas o feriados vale para lo que llegue después; hacia atrás, con "Recalcular 24 h".
   - Probado: `inctest.mjs` corre la demo en incremental y en completa y da lo mismo en las 19 escenas (alertas, pre-alertas, series, avisos, incidentes); más dato tardío, dato corregido, marca vieja, sin índice, Recalcular. `out_a.txt`: en la escena 15 cambió solo el orden de la lista (es el orden de inserción).
   - Datos que mira cada revisión en la demo: 13 contra hasta 247 de la completa (en producción con 13 series, unas 1.300 por revisión). Las series del tablero todavía se recalculan sobre 25 h (~1.300 filas con 13 series): mejora posible.
   - Pendiente aparte: prender el cron (cada 15 min) cuando Uriel lo decida.
   - **Etapa 3b — hecha y publicada (16/11, parche 38; scripts 16 y 17 corridos, quedan 23 tablas).** `alerta_reglas` + `alerta_reglas_personalizadas` → `reglas_alerta` (columna `tipo`; personalizadas con su id, sistema con ids negativos) y `tablero_cache` → columnas de `alerta_parametros`. 25 → 23 tablas. Toda consulta de reglas filtra `tipo`. Ver `contexto_helios_para_ia.md`, sección 16.

Decidido (11/11): el tercio es por día del calendario, no por día hábil. El día de la semana ya separa hábiles de fines de semana; por día hábil el tercio 3 tenía 0 a 3 días por mes.

Para reentrenar el perfil sin PostgreSQL instalado: `generar_historico.py` → `correr_perfil_pglite.mjs` (corre `perfil_comportamiento_postgres.sql` en PGlite, Postgres dentro de Node) → `python armar_d1.py <salida_postgres.sql> 03_Modelo_v2_perfil` → cargar `perfil_comportamiento_d1.txt` en D1.
