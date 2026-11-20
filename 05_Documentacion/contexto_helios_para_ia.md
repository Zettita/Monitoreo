# Helios: contexto del sistema para asistentes de IA

> **Para la IA que lee esto:** este archivo describe la plataforma de alertas Helios tal como está al **16 de noviembre de 2026** (publicado en Cloudflare hasta el parche 38: revisión incremental y 23 tablas), con lo publicado en Cloudflare, las decisiones ya tomadas por el equipo y hacia dónde se quiere migrar. Usalo como fuente de verdad: reemplaza a cualquier versión anterior de este archivo y al documento de contexto del 26/10/2026; los cambios están en la sección 16. Si algo de lo que te piden contradice la sección "Reglas que no se deben romper", avisalo antes de hacerlo. Si algo no está acá, preguntá antes de inventarlo. Respondé en español rioplatense, con lenguaje claro.

---

## 1. Qué es y para qué sirve

**Helios** es una empresa argentina de servicios de tecnología. Una de sus líneas es *Monitoreo inteligente y observabilidad*. Este proyecto es el **MVP de una plataforma de observabilidad** para clientes que procesan transacciones: bancos, fintech, billeteras y procesadores de pagos.

**Idea central:** comparar, por cada ventana de 15 minutos, lo que pasó en la operación (**observado**) contra lo que se esperaba según el histórico (**esperado**, con una banda de mínimo y máximo). Cuando lo observado sale de la banda se genera una **alerta** con severidad. Las alertas se guardan, se agrupan en **incidentes**, se asignan a personas o equipos y se muestran en tableros.

**Mensaje comercial:** "Enterate antes que tus clientes". Detecta un problema unos 20 minutos después de que empieza, con el diagnóstico: cliente, servicio, canal y cuánto se desvió. Las **pre-alertas** avisan antes de que se cruce el umbral.

**Kick off del MVP:** 22/09/2026, fecha objetivo 15/10/2026. Criterio de éxito: generar actividad simulada, detectar una caída o desvío, registrar la alerta y verla en un tablero. Eso está cumplido y la demo se presentó con buena recepción. Después, el cliente pidió login con perfiles y asignación de alertas con avisos, que ya están hechos.

**Todos los datos son ficticios.** Es una demo.

Funciones que existen hoy:

- Tablero web: estado general, barras de las últimas 24 h por cliente con su **objetivo de disponibilidad**, alertas abiertas ordenadas por **prioridad P1 a P4**, pre-alertas, histórico, tiempo de resolución y clientes más afectados.
- Login propio con 4 perfiles: Administrador, Gerente, Analista y Soporte.
- 12 reglas de alerta del sistema y reglas personalizadas.
- **Umbrales configurables por cliente** (criticidad, objetivo de disponibilidad, cortes de severidad, ancho de la banda del modelo, volumen mínimo y gracia), con el modelo como recomendación.
- Asignación de alertas (derivar, tomar, comentar, devolver, resolver). El **Analista deriva** y sigue todo desde la página **Seguimiento**; **Soporte** trabaja lo asignado en **Mis alertas** (es su única página). El **Gerente** mira el negocio (Panorama por cliente) y el **Administrador** configura.
- Derivación automática por reglas y "campanita" de avisos.
- Panel de administración: usuarios, equipos, reglas, derivación, umbrales, modelo (solo lectura) y auditoría.
- Tema claro, oscuro o el del sistema, con color principal verde azulado.
- El análisis histórico se hace en el propio tablero (Power BI se dejó de usar el 11/11).
- Modo demo con reloj simulado y 22 escenas (las 20 a 22, desde el parche 69, para la sala de crisis).
- **Sala de crisis** (parche 69): incidentes mayores que agrupan alertas, con tareas, línea de tiempo, guía de diagnóstico y el asistente que propone (no ejecuta).

**Lo que se quiere ahora:** sumar un **agente de IA** (todavía no definido) y **migrar fuera de Cloudflare** a un servidor propio, por los límites de la base.

---

## 2. Arquitectura actual (Cloudflare, plan gratuito)

```
Usuarios (navegador) ──► Worker "worker-alertas-cron" ◄──► Base D1 "helios-monitoring-dev" (SQLite)
                            │  páginas, API, login,              ▲            ▲
                            │  proceso de alertas (botón / demo; cron apagado)
                            │                                    │            │
                                                                 │
Ingesta de métricas (a definir; en la demo, botón de escena) ────┘
Perfil de comportamiento (entrenado fuera de D1 con 12 meses de historia) ─► perfil_comportamiento
```

| Pieza | Qué hace | Tecnología |
|---|---|---|
| `worker-alertas-cron` (`https://worker-alertas-cron.developers-hs-842.workers.dev`) | Tablero, login, Mis alertas, Seguimiento, Administración, API interna, proceso de alertas, modo demo | Un solo archivo JavaScript sin dependencias. Las páginas HTML van embebidas como strings. Usa solo APIs web estándar (`Request`, `Response`, `fetch`, `crypto.subtle`) y el binding `env.DB` de D1 |
| Cron Trigger | **Apagado** (se quitó para no gastar lecturas). Si se vuelve a configurar: cada 15 min (`5-59/15 * * * *`) | Con `alerta_parametros.ahora` con fecha (reloj simulado) no procesa |
| `worker-api-bi` | **Ya no se usa** (sin Power BI desde el 11/11): hay que borrarlo del panel. Su código quedó en `99_Archivo_viejo/power_bi/` | — |
| Avisos push (Web Push) | Los avisos de la campanita llegan al celular o la PC aunque Helios esté cerrado (parche 26) | Estándar de los navegadores, gratis: los entregan Google (Chrome, Edge en Android, Samsung), Apple (iPhone con Helios instalado), Mozilla o Microsoft. El Worker firma con la clave VAPID (secreto `VAPID_JWK`) y cifra el contenido |
| Workers AI (asistente, parche 28) | Modelo de lenguaje del asistente de IA. Enlace (binding) `AI` del Worker; modelo en la variable `ASISTENTE_MODELO` (por defecto `@cf/qwen/qwen3.8-27b` desde el parche 54; el anterior, `@cf/qwen/qwen3-30b-a3b-fp8`, se da de baja el 20/11/2026) | Cupo gratuito: 10.000 neuronas por día para toda la cuenta. Una pregunta usa unas 30 a 70 neuronas con ese modelo: el Worker limita a 150 preguntas por día y 20 por persona por hora |
| D1 `helios-monitoring-dev` | Toda la persistencia | SQLite administrado. En la cuenta hay otra base, `cliente-demo-transaccional-dev`, que este trabajo no usa |
| Perfil de comportamiento (modelo v2) | Esperado, mínimo y máximo por serie × día de la semana × franja de 15 min × tercio del mes (ver sección 6) | Se entrena fuera de D1 (PostgreSQL o PGlite) y se carga con `perfil_comportamiento_d1.txt` |

**El archivo publicado se genera:** `worker_alertas_cron.js` se arma con un script a partir de archivos fuente (servidor de login, administración, asignación, avisos, umbrales, páginas HTML y tema) más una serie de parches numerados que Uriel mantiene. Si una IA propone cambios, que los haga sobre el archivo completo y diga qué partes tocó, para pasarlos a las fuentes.

**El tablero web no se actualiza solo:** carga los datos al abrirse, con el botón "Actualizar", con los botones de la demo y después de cada acción. Así cuida las lecturas de D1. La única consulta periódica es el contador de la campanita, cada 2 minutos y solo con la pestaña visible (o también en segundo plano, si la persona activó los avisos del navegador).

### Estado en Cloudflare (11/11, noche)

- **Worker publicado:** `worker-alertas-cron` tiene la última versión (modelo v2 contra el perfil, sin vistas, perfiles del parche 25, Panorama, "Avisar a Soporte" y avisos del navegador). Se probó entrando como Gerente sin errores.
- **Base D1 `helios-monitoring-dev`:** 20 tablas (más las internas `_cf_KV` y `sqlite_sequence`) y 0 vistas. Corridos todos los scripts de `02_Base_de_datos_D1` del 01 al 09. Ojo: el 08 (feriados) no se había corrido; se aplicó el 11/11 después del 09, **solo sus bloques 1 a 26 y 35**. Sus bloques 27 a 34 recrean las vistas viejas y **no se deben correr** (usan `core_metricas_esperadas`, que ya no existe).
- **Datos:** `perfil_comportamiento` cargado (26.208 filas). Alertas, eventos, avisos, cache y métricas observadas vacíos; reloj de la demo en el lunes 26/10/2026 10:00 ARG (`ahora = '2026-10-26T13:00:00Z'`). La demo arranca con "Preparar demo" y las 19 escenas.
- **Cron Trigger:** apagado. **`worker-api-bi`:** todavía existe en el panel; hay que borrarlo.
- **Avisos push (12/11, parche 26): aplicado.** Tabla `suscripciones_push` creada (script 10, 21 tablas), secreto `VAPID_JWK` cargado y Worker publicado; probado en una PC con Chrome. El secreto se genera con `07_Codigo_fuente/worker/generar_clave_push.mjs` y no se guarda en el proyecto. Detalle y guía por dispositivo: `novedades_avisos_push_y_app.md`.
- **Ajustes después de las pruebas reales (13/11, parche 29e): publicado el 13/11** (sin SQL): respuestas más cortas y en frases, sin asignar bien separado de asignada sin tomar, botón Tomar para Soporte, umbrales explicados, contexto externo en español, con fecha real y Qué vigilar concreto.
- **Enlaces cortos (13/11, parche 29d): publicado y probado** con Workers AI: respuesta completa, enlaces que funcionan y filtrada a Argentina.
- **Noticias y filtro por país (13/11, parche 29c): publicado.**
- **Contexto externo filtrado (13/11, parche 29b): publicado.**
- **Contexto externo del asistente (13/11, parche 29): aplicado.** Se corrió `02_Base_de_datos_D1/12_contexto_externo_d1.txt` (tablas `contexto_externo` y `eventos_comerciales`, 24 tablas, 2 eventos cargados) y se publicó el Worker, que incluye las correcciones 28b a 28d. Falta probar las respuestas con las fuentes reales.
- **Ticketera y textos (14/11, parches 30 y 31): publicado el 14/11.** Corridos `13_ticketera_d1.txt` (columnas `causa_resolucion` y `acciones_resolucion` en `alertas_historico`, `opciones_resolucion` en `alerta_parametros`) y `14_evidencia_d1.txt` (tabla `evidencia_archivos`: la evidencia va a D1 porque R2 pide tarjeta; quedan 25 tablas), y publicado el Worker. Falta probarlo con Soporte y Analista. Guía: `novedades_ticketera.md`.
- **Corrección del asistente (13/11, parches 28b a 28d): publicada** junto con el parche 29. Arregla respuestas que mostraban `<tools>…</tools>`, negativas falsas ("no tengo acceso"), respuestas fuera de tema y etiquetas o ids internos en el texto.
- **Asistente de IA (13/11, parche 28): aplicado.** Se corrió `02_Base_de_datos_D1/11_asistente_d1.txt` (tabla `asistente_uso`, quedan 22 tablas); en el Worker, Settings → Bindings → Add binding → **Workers AI**, nombre de variable `AI`, y se publicó `01_Worker/worker_alertas_cron.js`. El panel abre bien como Administrador; falta probar las respuestas con cada perfil. Sin el enlace, el resto funciona igual y el panel del asistente avisa que falta configurarlo. Guía: `novedades_asistente_ia.md`.
- **Cómo verificar la base desde la consola de D1** (una línea, solo lee): `SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view') AS vistas, (SELECT COUNT(*) FROM sqlite_master WHERE name = 'ix_perfil_comportamiento_franja') AS indice_perfil, (SELECT COUNT(*) FROM feriados) AS feriados, (SELECT ahora FROM alerta_parametros WHERE id = 1) AS reloj;` → 0, 1, 23 o más, y el reloj de la demo.
- **Código fuente:** repositorio privado en GitHub `Zettita/Monitoreo` (rama `main`, desde el 12/11), compartido con Ale; cada cambio probado se sube ahí junto con este archivo actualizado, dejando siempre respaldo de la versión anterior (copia en `99_Archivo_viejo/` y rama `respaldo-antes-parche-NN`) y de la nueva (rama `version-parche-NN-<tema>`). El Worker se genera en `07_Codigo_fuente/worker` con `build.py` (Worker original + `demo_server.js` + parches 9 a 29) y se prueba con la demo de 19 escenas y 10 pruebas por módulo; `servidor_local.mjs` lo corre en la PC (Node 22.5+ con `node:sqlite`) sin Cloudflare.

---

## 3. Base de datos

Hoy pesa unos 7 MB (13 series con historia, unos 9 días). Casi todo son métricas.

### Valores de dominio

- `duracion_ventana_minutos`: 1, 5 o 15 (la demo usa 15).
- `ambiente`: `DESA`, `TEST`, `QA`, `PROD`.
- `moneda_id`: 3 letras (`ARS`).
- `origen_dato`: `API`, `BACKFILL` o `SIMULACION`.
- `cantidad_total = cantidad_exitos + cantidad_rechazos + cantidad_errores` (lo exige un `CHECK`). Las tasas van de 0 a 1.
- `origen_prediccion`: `SIMULACION`, `BIGQUERY_ML`, `VERTEX_AI` o `REGLA_MANUAL`. `estado_prediccion`: `ACTIVA`, `INACTIVA` o `VENCIDA`.
- Datos de la demo: clientes `CLI_001` a `CLI_008`, producto `BILLETERA`, servicios `TRANSFERENCIAS`, `PAGO_SERVICIOS`, `RECARGA_CELULAR`, `RECARGA_TRANSPORTE`, canales `MOBILE`, `WEB`, `API`.

### Tablas

| Tabla | Qué guarda | Columnas clave |
|---|---|---|
| `core_metricas_observadas` | Una fila por serie y ventana. Existía antes del proyecto: **no se modifica su estructura** | `metrica_id` (PK), `recepcion_id`, `lote_id`, `collector_id`, `ventana_inicio`, `ventana_fin`, `duracion_ventana_minutos`, `ambiente`, `cliente_id`, `servicio_id`, `producto_id`, `canal_id`, `moneda_id`, `cantidad_total`, `cantidad_exitos`, `cantidad_rechazos`, `cantidad_errores`, `tasa_aprobacion`, `tasa_rechazo`, `tasa_error` (informadas), `importe_total`, `importe_promedio`, `tiempo_respuesta_promedio`, `tiempo_respuesta_maximo` (ms), `ultimo_evento_exitoso`, `origen_dato`, `schema_version`, `fecha_recepcion`. Clave única: ventana + duración + ambiente + cliente + producto + servicio + canal + moneda |
| `perfil_comportamiento` | **Modelo v2.** Lo esperado y su banda por serie × día de la semana (0 = domingo) × franja de 15 min (0–95, hora ARG) × tercio del mes (1 = días 1-10, 2 = 11-20, 3 = 21 a fin). 26.208 filas, `WITHOUT ROWID`. Reemplazó a `core_metricas_esperadas` (borrada el 11/11) | PK: clave de serie + `dia_semana`, `franja_horaria`, `tercio_mes`; `nivel_perfil`, `muestras`, `cantidad_total_esperada/minima/maxima`, `tasa_aprobacion_esperada/minima`, `tasa_rechazo_esperada/maxima`, `tasa_error_esperada/maxima`, `importe_total_esperado/minimo/maximo`, `tiempo_respuesta_esperado/maximo`, `modelo_id`, `modelo_version`, `entrenado_hasta`, `fecha_carga`. Índice `ix_perfil_comportamiento_franja` (`dia_semana`, `franja_horaria`, `tercio_mes`) |
| `alertas_historico` | Una fila por **ventana** con problema | `alerta_id` (hex de 32), `tipo_alerta`, clave de serie, `ventana_inicio`, `ventana_fin`, `metrica`, `severidad`, `severidad_maxima`, `valor_observado`, `valor_esperado`, `umbral`, `desvio`, `estado`, `primera_deteccion`, `ultima_deteccion`, `cantidad_detecciones`, `cantidad_reaperturas`, `fecha_reconocimiento`, `reconocida_por`, `fecha_resolucion`, `motivo_resolucion`, `resuelta_por`, `comentario`, `asignado_usuario_id`, `asignado_equipo_id`, `asignado_en`, `asignado_por`. Única por (`tipo_alerta`, `ventana_inicio`, `duracion_ventana_minutos`, clave de serie). Desde el parche 30: `causa_resolucion` y `acciones_resolucion` (lo elegido al resolver a mano; acciones separadas por ` · `) |
| `alerta_eventos` | Historial de cada alerta | `id`, `fecha`, `alerta_id`, `usuario_id` (NULL = automático), `accion` (`DERIVAR`, `TOMAR`, `COMENTAR`, `DEVOLVER`, `RESOLVER`), `usuario_destino_id`, `equipo_destino_id`, `comentario` |
| `avisos` | Campanita, un registro por persona | `id`, `usuario_id`, `fecha`, `tipo` (`ASIGNADA`, `COMENTARIO`, `DEVUELTA`, `RESUELTA`, `GRAVE_SIN_ASIGNAR`), `alerta_id`, `texto`, `detalle`, `leido` |
| `reglas_alerta` | **Etapa 3b (parche 38, scripts 16 y 17).** Las 12 reglas del sistema y las reglas personalizadas en una sola tabla (reemplazó a `alerta_reglas` y `alerta_reglas_personalizadas`, borradas). `tipo = 'SISTEMA'`: `regla` (única), `orden`, `grupo`, `descripcion`, `activa`; ids **negativos** (−orden). `tipo = 'PERSONALIZADA'`: `nombre`, `metrica` (`VOLUMEN`, `APROBACION`, `RECHAZO`, `ERROR`, `IMPORTE`, `LATENCIA`), `direccion` (`BAJO` = por debajo del mínimo, `ALTO` = por encima del máximo), `ventanas_seguidas` (1 a 8), `cliente_id`, `servicio_id`, `canal_id` (NULL = todos), `severidad`, `activa`, `creada_por`, `creada`, `actualizada`; ids positivos desde 1: sus alertas se llaman `PERS_<id>` (los ids se conservaron en la migración) | `id` (PK autoincremental), `tipo`, y las columnas de cada tipo (las que no corresponden van NULL). **Toda consulta filtra `tipo`:** el motor recorre las del sistema con `tipo = 'SISTEMA'`, y editar o leer por id una personalizada exige `tipo = 'PERSONALIZADA'` |
| `reglas_derivacion` | Derivación automática | `id`, `nombre`, `prioridad` (menor = primero), condiciones `cliente_id`, `servicio_id`, `canal_id`, `tipo_alerta`, `severidad_minima` (NULL = cualquiera), destino `equipo_id` y/o `usuario_id`, `activa` |
| `alerta_parametros` | Una sola fila (`id = 1`) | `ahora` (reloj: fecha = simulado; NULL = hora real), `volumen_minimo` (20) y `gracia_minutos` (5) **generales** (se editan desde Administración > Umbrales), `horizonte_horas` (24), `tolerancia_tasa` (0,001). Desde el parche 30: `opciones_resolucion` (JSON `{causas:[{id,nombre,activo}], acciones:[…]}`: lo que se elige al resolver; lo edita el Administrador). Desde el parche 37: `revisado_hasta` (marca de agua de la revisión incremental). Desde el parche 38: `tablero_revision` y `tablero_calculado` (reemplazan a la tabla `tablero_cache`). Desde el parche 45: `disponibilidad_config` (JSON `{pesos_gravedad:{CRITICA,ALTA,MEDIA}, pesos_criticidad:{ALTA,MEDIA,BAJA}}`: cómo se mide la disponibilidad; vacío = valores de fábrica) |
| `umbrales_config` | **Umbrales por cliente** (solo Administrador). Clave (`cliente_id`, `servicio_id`): `('*','*')` = general; `('CLI_001','*')` = todo el cliente; `('CLI_001','TRANSFERENCIAS')` = cliente y servicio. En las excepciones NULL = hereda del nivel de arriba; gana el más específico | `criticidad` (`ALTA`/`MEDIA`/`BAJA`, fábrica `MEDIA`), `objetivo_disponibilidad` (0,97), `corte_pct_alta` / `corte_pct_critica` (0,25 / 0,50), `corte_tasa_alta` / `corte_tasa_critica` (0,05 / 0,15), `banda_volumen`, `banda_tasas`, `banda_importe`, `banda_latencia` (1 = banda del modelo), `volumen_minimo`, `gracia_minutos` (en la fila general van NULL: se usan los de `alerta_parametros`), `silenciar_feriados` (0/1: en feriados no se generan alertas, pre-alertas ni reglas personalizadas de ese servicio), `actualizado`, `actualizado_por`, y desde el parche 45 `objetivo_mensual` (objetivo mensual de disponibilidad con decimales, fábrica 0,999; mismo orden de precedencia que los demás) |
| `feriados` | Feriados nacionales y días no laborables (+ los agregados a mano). Se cargan de `https://api.argentinadatos.com/v1/feriados/{año}`: el cron trae solo el año en curso y, desde octubre, el siguiente; el Administrador puede actualizar o agregar desde Administración > Umbrales | `fecha` (PK, `AAAA-MM-DD`, fecha de Argentina), `nombre`, `tipo` (`inamovible`, `trasladable`, `puente`, `manual`), `origen` (`API` o `MANUAL`; la API nunca pisa los manuales) |
| `usuarios` | Personas | `id`, `usuario`, `nombre`, `perfil` (`ADMIN`, `GERENTE`, `ANALISTA`, `SOPORTE`), `hash`, `sal`, `iteraciones`, `debe_cambiar`, `activo`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_ingreso`, y desde el parche 68 `correo` (la casilla de la persona, en minúsculas, única; obligatorio al crear el usuario; los de antes pueden quedar vacíos hasta que el Administrador lo cargue; script 23) |
| `sesiones` | Sesiones abiertas | `token_hash` (SHA-256 del token de la cookie), `usuario_id`, `creada`, `vence` |
| `equipos` · `equipo_miembros` | Equipos y su gente (desde el parche 63, también los destinatarios de los comunicados: reemplazan a las listas de difusión) | `equipos`: `id`, `nombre`, `descripcion`, `responsable_id`, `activo`, `alcance_cliente_id` (script 22: NULL = todas las alertas) · `equipo_miembros`: (`equipo_id`, `usuario_id`), `rol_comunicado` (script 22: `TECNICO`/`LIDER`/`INFORMADO`, NULL = técnico) |
| `auditoria` | Quién hizo qué | `id`, `fecha`, `usuario_id`, `accion`, `detalle` |
| `series_estado` · `prealertas_estado` (+ `alerta_parametros.tablero_revision` y `tablero_calculado`) | **Cache del tablero.** Cada revisión de alertas y "Preparar demo" cambian `alerta_parametros.tablero_revision`; con la revisión incremental (parche 37) la misma revisión actualiza el caché y deja `tablero_calculado` igual a `tablero_revision` (al día). La tabla `tablero_cache` (una fila) se reemplazó por esas dos columnas en la etapa 3b | Las escribe el Worker; no se tocan a mano. Si una ingesta nueva carga métricas sin pasar por la revisión, tiene que marcar `tablero_revision` |
| `suscripciones_push` | **Avisos push (parche 26, script 10).** Un dispositivo (celular o PC) que activó los avisos desde la campanita. Si el servicio de push responde que ya no existe (404/410), se borra sola; también al cerrar sesión o tocar "Desactivar" | `endpoint` (PK: la dirección del dispositivo en Google, Apple, Mozilla o Microsoft), `usuario_id`, `clave_p256dh` y `clave_auth` (claves del navegador para cifrar el contenido), `creada`, `actualizada`. Índice `ix_suscripciones_push_usuario` |
| `evidencia_archivos` | **Ticketera (parche 30, script 14).** La evidencia adjunta a las alertas mientras no haya R2: texto base64 partido en filas de 90.000 caracteres | PK (`clave`, `parte`), `WITHOUT ROWID`. `clave` = `alertas/<primera ventana del problema>/<aleatorio>.<ext>`; `datos` (base64); en `parte = 0` también `tipo_contenido`, `metadatos` (JSON: nombre, usuario, fecha), `tamano_bytes`, `subido`. Topes: 1 MB por archivo, 200 MB en total |
| `asistente_uso` | **Asistente de IA (parche 28, script 11).** Cuántas preguntas hizo cada persona en cada hora (para los límites de uso). `WITHOUT ROWID` | PK (`hora` = `AAAA-MM-DDTHH` en UTC, `usuario_id`), `preguntas` |
| `contexto_externo` | **Asistente, contexto externo (parche 29, script 12).** Lo último que se trajo de las páginas de estado de proveedores y de las noticias; 1 fila por fuente (`proveedores`, `noticias`), se renueva como mucho una vez por hora y solo cuando alguien pregunta. `WITHOUT ROWID` | `fuente` (PK), `actualizado` (UTC), `contenido` (JSON ya resumido), `error` (si la última consulta falló) |
| `eventos_comerciales` | **Eventos comerciales (parche 29, script 12).** Días con tráfico distinto al habitual (Black Friday, CyberMonday, Hot Sale, promos de un cliente). Los carga el Administrador en Umbrales; hoy solo los usa el asistente | `id`, `nombre`, `fecha_desde`, `fecha_hasta` (`AAAA-MM-DD`, hasta 31 días), `cliente_id` y `servicio_id` (NULL = todos), `efecto_esperado` (`MAS_TRAFICO` / `MENOS_TRAFICO`), `nota`, `creado_por`, `creado`. Índice `ix_eventos_comerciales_fechas` |
| `tickets_alerta` | **Tickets a demanda (parche 41, script 19).** Un ticket de InvGate o Jira generado desde una alerta (o simulado) | `id`, `alerta_id`, `sistema` (`INVGATE`/`JIRA`), `clave` (única por herramienta), `url`, `estado`, `simulado`, `resumen`, `descripcion`, `creado_por`, `creado`, `actualizado`. Índice `ix_tickets_alerta_alerta` |
| `comunicados_incidente` · `comunicado_destinatarios` | **Comunicar incidente (parche 46, script 21).** Cada comunicado de un incidente y a quién le llegó | `comunicados_incidente`: `id`, `alerta_id`, `mensaje`, `listas`, `enviado_por`, `enviado` · `comunicado_destinatarios`: PK (`comunicado_id`, `usuario_id`), `rol` (`INFORMADO`/`TECNICO`/`LIDER`), `visto`, `recibido` |
| `teams_bot_memoria` | **Memoria del bot de Teams (parche 77, script 25).** Los últimos mensajes de cada persona en cada chat y la sala de la que venía hablando. `WITHOUT ROWID` | PK (`conversacion_id`, `usuario_id`), `mensajes` (JSON, hasta 6), `sala_id`, `actualizado` (UTC). Índice `ix_teams_bot_memoria_actualizado` |
| `meta_diccionario_datos` | Diccionario de datos: `capa`, `tipo_objeto`, `objeto_nombre`, `campo_nombre`, `descripcion` | Del equipo; vacía: hay que completarla |

### Sin vistas (desde el 11/11)

No quedan vistas en la base. El SQL que antes estaba en `v_comparacion`, `v_alertas_observadas`, `v_alertas_faltantes` y `v_prealertas` vive en el Worker (`SQL_ALERTAS_OBSERVADAS`, `SQL_ALERTAS_FALTANTES`, `SQL_PREALERTAS`), igual que los incidentes (`Q_INCIDENTES_30D`). Así no hay que coordinar SQL en la consola con la publicación del Worker, y lo que cuesta cada consulta queda a la vista.

- **Comparación:** cada ventana observada de las últimas `horizonte_horas` + 1 se cruza con su celda de `perfil_comportamiento` por clave primaria (día de la semana y fecha en hora de Argentina; un feriado se compara como domingo). **Las tasas se recalculan desde las cantidades** (`tasa_*_calc`); las informadas quedan aparte (`tasa_*_informada`).
- **Ventana faltante:** genera las ventanas del horizonte (`WITH RECURSIVE`, ~100), busca qué series tienen perfil en cada una (índice `ix_perfil_comportamiento_franja`) y avisa si no llegó el dato pasada la gracia.
- En `alertas_historico.prediccion_id` queda la celda usada: `modelo:día:franja:tercio`.

Índices propios importantes: `ix_observadas_serie_ventana` (expresión sobre la serie y `strftime('%Y-%m-%dT%H:%M:%S', ventana_inicio)`, lo usa la regla de ventana faltante), el índice único de observadas, que empieza por `ventana_inicio`, y `ix_perfil_comportamiento_franja`.

### Formatos

- Todas las fechas son **texto ISO en UTC**. En observadas y esperadas: `2026-10-18T03:00:00.000Z` (con milisegundos). En `alertas_historico`: `2026-10-18T03:00:00Z`. La interfaz muestra hora de Argentina (UTC−3). En SQL, `'now'` es UTC.
- **El formato de `ventana_inicio` y `ventana_fin` en observadas y esperadas es obligatorio** (`strftime('%Y-%m-%dT%H:%M:%fZ', …)`): el motor compara esas fechas como texto para usar los índices. Una fecha guardada con otro formato (sin milisegundos, con `+00:00`, con espacio) deja de encontrarse. La ingesta tiene que normalizarlas.
- `severidad`: `CRITICA` (Grave), `ALTA` (Importante), `MEDIA` (Leve), `BAJA` (Informativa: no se trabaja ni se asigna).

---

## 4. Las 12 reglas del sistema (13 tipos de alerta)

| # | Tipo | Se dispara cuando | Severidad |
|---|---|---|---|
| 1 | `VOLUMEN_BAJO` | cantidad < mínimo | Por desvío; `CRITICA` si es 0 y se esperaba ≥ volumen mínimo |
| 2 | `VOLUMEN_ALTO` | cantidad > máximo | Por desvío |
| 3 | `APROBACION_BAJA` | tasa < mínimo (con volumen ≥ volumen mínimo) | Por puntos |
| 4 | `RECHAZO_ALTO` | tasa > máximo (con volumen mínimo) | Por puntos |
| 5 | `ERROR_ALTO` | tasa > máximo (con volumen mínimo) | Por puntos |
| 6 | `IMPORTE_BAJO` / `IMPORTE_ALTO` | importe fuera de la banda (regla `IMPORTE_FUERA_DE_BANDA`) | Por desvío |
| 7 | `LATENCIA_ALTA` | tiempo promedio > máximo | Por desvío |
| 8 | `SIN_EXITOS` | hay volumen y 0 aprobadas (no necesita predicción) | Siempre `CRITICA` |
| 9 | `DATO_TARDIO` | recepción − fin de ventana > gracia (solo origen `API`) | `ALTA` si la demora ≥ 4 × gracia; si no, `MEDIA` |
| 10 | `DATO_INCONSISTENTE` | tasa informada ≠ recalculada (> tolerancia) | `MEDIA` |
| 11 | `SIN_PREDICCION` | dato de una serie sin perfil de comportamiento (cliente nuevo) | `BAJA` |
| 12 | `VENTANA_FALTANTE` | la serie tiene perfil para esa ventana (esperaba > 0), ya había mandado algún dato antes y no llegó el dato, pasada la gracia | `CRITICA` si se esperaba ≥ volumen mínimo; si no, `MEDIA` |

**Cálculo de severidad:** para volumen, importe y latencia, desvío relativo contra el esperado: ≥ `corte_pct_critica` (fábrica 50 %) `CRITICA`, ≥ `corte_pct_alta` (25 %) `ALTA`, el resto `MEDIA`. Para tasas, en puntos: ≥ `corte_tasa_critica` (15) `CRITICA`, ≥ `corte_tasa_alta` (5) `ALTA`, el resto `MEDIA`. Los cortes salen de `umbrales_config` (el valor más específico para el cliente y servicio).

**Banda ajustada:** cada límite que se compara es `esperado + factor × (límite del modelo − esperado)`, con el factor de `umbrales_config` (`banda_volumen`, `banda_tasas`, `banda_importe`, `banda_latencia`). Con factor 1 se usa el límite del modelo tal cual (el código lo trata aparte para que el resultado sea idéntico al de antes). Vale para las reglas del sistema, las pre-alertas (el margen consumido se mide contra la banda ajustada) y las reglas personalizadas. El volumen mínimo y la gracia también se toman por cliente y servicio.

**Prioridad (P1 a P4):** se calcula en el tablero con la severidad y la criticidad del servicio. Grave: P1 / P2 / P3 (criticidad alta / media / baja). Importante: P2 / P3 / P3. Leve: P3 / P4 / P4. Informativa: P4. El tablero ordena las alertas abiertas por prioridad.

**Reglas personalizadas** (`tipo_alerta = 'PERS_<id>'`): eligen métrica, dirección, ventanas seguidas, alcance y severidad fija. El umbral es el mínimo o el máximo del modelo, con el ancho de banda configurado para el cliente. Combinaciones posibles: volumen bajo o alto, aprobación baja, rechazo alto, error alto, importe bajo o alto, latencia alta. Con N ventanas seguidas, cuando un tramo llega a N se registran todas sus ventanas, así se ve desde cuándo viene el problema. Las tasas solo se evalúan con volumen ≥ volumen mínimo.

---

## 5. Pre-alertas (`SQL_PREALERTAS`, en el Worker)

Avisan **antes** de que se abra la alerta: la métrica todavía está dentro de la banda pero viene empeorando y, al ritmo actual, cruza el umbral en 30 minutos o menos.

- **Decisión: se calcula y no se mezcla con `alertas_historico`**, así los KPIs y los incidentes tienen solo alertas reales. Para que el tablero no la recalcule en cada carga, su resultado se guarda una vez por revisión en `prealertas_estado` (cache).
- Tipos: `RIESGO_VOLUMEN_BAJO`, `RIESGO_APROBACION_BAJA`, `RIESGO_RECHAZO_ALTO`, `RIESGO_ERROR_ALTO`, `RIESGO_LATENCIA_ALTA` (cada uno anticipa la alerta del mismo nombre sin el prefijo).
- **Margen consumido** = (observado − esperado) / (umbral − esperado), en la dirección del problema: 0 en lo esperado, 1 en el umbral.
- Señal en una ventana: no tiene alertas (todos los márgenes < 1); margen ≥ 0,5; empeoró ≥ 0,1 en cada una de las 2 ventanas anteriores (3 seguidas); al ritmo actual llega a 1 en 2 ventanas o menos. Severidad `ALTA` si cruza en la próxima ventana (~15 min), `MEDIA` si en 2 (~30 min). Tasas y latencia, con volumen ≥ volumen mínimo.
- Las señales seguidas forman un episodio (una fila). Columnas clave: `activa`, `resultado` (`CONFIRMADA` si llegó la alerta prevista dentro de los 60 minutos, `NO_SE_CUMPLIO` o `EN_OBSERVACION`) y `minutos_anticipacion`.
- Límites: no anticipa problemas súbitos (caídas de golpe, cortes) ni ve tendencias con volumen muy bajo (madrugada). Es estadística por tendencia, no machine learning. Si en el futuro se notifican pre-alertas, guardar las notificadas en una tabla propia, no en `alertas_historico`.

---

## 6. Modelo de comportamiento esperado (perfil de comportamiento, modelo v2)

- **Qué es:** para cada serie, lo esperado y su banda por **día de la semana × franja de 15 minutos × tercio del mes** (días 1-10, 11-20 y 21 a fin de mes, por calendario). El día de la semana ya separa hábiles de fines de semana; el tercio capta el movimiento de principio de mes. Tabla `perfil_comportamiento` (26.208 filas para 13 series).
- **Feriados:** no entrenan el perfil; en un feriado se espera lo de un domingo (o se silencia, si el servicio lo tiene configurado).
- **Entrenamiento, fuera de D1:** `perfil_comportamiento_postgres.sql` sobre 12 meses de historia (en la demo, ficticia: `historico_metricas_demo.csv`). Se corre en PostgreSQL o en PGlite (Postgres dentro de Node) y a D1 se sube solo el resumen con `perfil_comportamiento_d1.txt`. Se reentrena cada tanto (por ejemplo, una vez por mes).
- **Esperado:** mediana (las tasas, Σ cantidad / Σ total). **Banda:** nunca más angosta que la del modelo anterior y más ancha donde el histórico varía más: volumen mínimo = el menor entre esperado × 0,85 y el percentil 5, máximo = el mayor entre esperado × 1,15 y el p95; aprobación mínima − 3,5 puntos o p5; rechazo + 3 puntos o p95; error + 1,5 puntos o p95; importe × 0,75 / × 1,20 o p5 / p95; latencia × 1,15 o p95. Las tasas solo usan ventanas con al menos 20 operaciones.
- **Mínimo 6 muestras por celda** (hoy todas tienen entre 13 y 19); si no, se usa la celda sin tercio (`nivel_perfil = DIA_FRANJA`).
- Una serie sin perfil (cliente nuevo) genera `SIN_PREDICCION`. **Pendiente:** perfil genérico para clientes nuevos.
- `modelo_id = 'PERFIL_DIA_FRANJA_TERCIO_MES'`, `modelo_version = '2'`. El modelo anterior (`LINEA_BASE_HORARIA`, 7 días corridos, predicciones de 48 h en `core_metricas_esperadas`) quedó reemplazado el 11/11.

Los mínimos y máximos los calcula el modelo; el Administrador solo puede ensanchar o angostar esa banda por cliente (en porcentaje) desde Umbrales. El modelo se usa como recomendación: el diálogo muestra qué espera para ese cliente en un día como hoy (mismo día de la semana y tercio), cómo quedaría la banda y valores sugeridos (gracia = demora p95 de las últimas 24 h + 2 min; volumen mínimo = la mitad del volumen esperado en la franja más tranquila, entre 5 y 20).

---

## 7. Cómo vive una alerta

1. **Ingesta:** llega la métrica de la ventana.
2. **Perfil:** el modelo ya tiene esperado, mínimo y máximo para esa ventana (su día de la semana, franja y tercio).
3. **Revisión** (escena de la demo; el cron está apagado; desde el parche 34 no hay botón manual), en un solo lote (`env.DB.batch`). **Desde el parche 37 es incremental:** mira solo los datos recibidos desde la última revisión (marca `alerta_parametros.revisado_hasta`, índice `ix_observadas_recepcion`) y actualiza el caché del tablero en el mismo lote; la revisión completa de 24 h queda para la primera vez, después de Preparar demo, si pasaron más de 24 h y para "Recalcular 24 h" (Administrador). Pasos:
   1. **Registrar:** `INSERT … ON CONFLICT DO UPDATE` desde el motor (reglas 1 a 11 y, en otra sentencia, la 12) y desde las reglas personalizadas. Actualiza valores, severidad, severidad máxima y última detección. Reabre las cerradas por `CONDICION_DESAPARECIDA`.
   2. **Heredar asignación:** las ventanas nuevas de un problema ya asignado copian su asignación.
   3. **Cerrar normalizadas:** si llegó una ventana posterior de la misma serie sin ese tipo de alerta. La fecha de resolución es el fin de esa ventana.
   4. **Cerrar desaparecidas:** las abiertas dentro del horizonte que no se vieron en esta corrida, con un margen de 2 minutos (corrige un error: si los pasos caían en segundos distintos, se cerraban alertas recién registradas).
   5. **Derivar y avisar** (después del lote): deriva las que quedaron sin asignar según `reglas_derivacion` y genera los avisos.
4. **Asignación y trabajo**, por la API (cada paso queda en `alerta_eventos` y en `auditoria`).
5. **Cierre:** a mano, con comentario obligatorio (`MANUAL`, no se reabre), o solo cuando se normaliza.

**Una "alerta" en la interfaz** es el grupo de filas abiertas con el mismo `tipo_alerta` en la misma serie. Cada acción se aplica al grupo entero.

### Estados

| Estado en la interfaz | En la base |
|---|---|
| Sin asignar | `estado = 'ABIERTA'`, sin `asignado_*` |
| Asignada (sin tomar) | `ABIERTA` con `asignado_usuario_id` y/o `asignado_equipo_id` |
| En curso | `RECONOCIDA`, `asignado_usuario_id` = quien la tomó |
| Devuelta | `ABIERTA`, sin asignar, con un evento `DEVOLVER` (la derivación automática no la toca) |
| Resuelta | `RESUELTA` + `motivo_resolucion` (`MANUAL`, `NORMALIZADA`, `CONDICION_DESAPARECIDA`) |

### Avisos de la campanita

| Quién lo recibe | Cuándo |
|---|---|
| La persona o los miembros del equipo | Le asignan una alerta (a mano o por regla) |
| Quien la tiene y quien la derivó | Alguien comenta |
| Quien la tiene y quien la derivó | La resuelve otra persona |
| Quien la tiene | Se normaliza sola o deja de detectarse |
| Quien la derivó (o todos los analistas, si la derivó una regla) | La devuelven (al analista el aviso lo lleva a Seguimiento) |
| Analistas, una vez por problema | Aparece una grave que nadie tiene y ninguna regla deriva |
| La persona o los miembros del equipo que eligió el analista | El analista toca "Avisar a Soporte" en una pre-alerta (tipo `PREALERTA`, sin `alerta_id`: la pre-alerta no se convierte en alerta) |

Nadie recibe aviso de lo que hizo él mismo. El Gerente y el Administrador no tienen campanita. Los avisos de asignación llevan a "Mis alertas" (Soporte) o a "Seguimiento" (Analista): el servidor lo indica en `/api/avisos/contador` (`bandeja`).

**Avisos en el dispositivo** (11/11 y 12/11), desde la campanita ("Activar"):

- **Push (parche 26):** si el servidor tiene el secreto `VAPID_JWK` y el navegador lo permite, "Activar" suscribe el dispositivo (`/api/push/suscribir`, tabla `suscripciones_push`) y cada aviso nuevo llega como aviso del sistema **aunque Helios esté cerrado**. Lo recibe el service worker (`/sw.js`), que lo muestra y al tocarlo abre la página que corresponde. Después de cada pedido POST que crea avisos (derivar, comentar, devolver, resolver, revisar alertas, escenas de la demo, "Avisar a Soporte") el Worker manda un push por dispositivo con hasta 3 avisos (y "Y N avisos más"), con el texto **cifrado** (RFC 8291: solo lo lee el dispositivo) y firmado con VAPID. Máximo 25 dispositivos por pedido. Cuesta 2 consultas más por POST (solo si hay secreto).
- **Dónde llega:** Android y PC con Chrome, Edge o Firefox. **En PC, Chrome tiene que quedar corriendo en segundo plano** al cerrar la ventana (Chrome → Configuración → Sistema → "Seguir ejecutando aplicaciones en segundo plano"; queda el ícono junto al reloj de Windows). Si se cierra del todo no recibe nada y los avisos llegan juntos al abrirlo (se guardan 24 h). En Windows no hay nada que tocar en Configuración → Apps (ese permiso es solo para apps de la Store); sí tienen que estar activadas las notificaciones de Google Chrome en Windows. **iPhone: solo con Helios agregado a la pantalla de inicio** desde Safari (iOS 16.4+); la campanita lo explica. Helios se puede **instalar como app** (manifiesto, ícono, `start_url = /inicio`).
- **Sin push** (sin secreto o navegador sin soporte): queda el nivel 1, avisos del sistema con la página abierta (consulta el contador cada 2 minutos también en segundo plano). Con push activo el nivel 1 se apaga para no duplicar.
- Al cerrar sesión, ese dispositivo deja de recibir (`/api/push/desuscribir`, que no pide sesión: la dirección del dispositivo solo la conoce ese navegador).
- **Se rehace sola:** si el navegador ya tiene el permiso pero perdió la suscripción (por ejemplo, Chrome configurado para borrar los datos de los sitios al cerrarse, o después de cerrar sesión y volver a entrar), al abrir Helios se vuelve a suscribir sin tocar nada, salvo que la persona haya tocado "Desactivar" (se recuerda en el navegador). Si se cambió la clave `VAPID_JWK`, las suscripciones viejas se rehacen con la nueva. Una vez por día la página le recuerda al servidor el dispositivo. **Con Chrome borrando los datos al cerrarse, el push con el navegador cerrado no puede funcionar:** hay que agregar el sitio a "Sitios que siempre pueden usar cookies".
- Solo se aceptan direcciones de servicios de push conocidos (Google, Apple, Mozilla, Microsoft).
- Mail, SMS o app propia: pendiente (lo investiga la compañera); se engancharían en el mismo punto que el push.

---

### Asistente de IA (parche 28, 13/11)

Botón **"Asistente"** abajo a la derecha en el tablero, Mis alertas, Seguimiento y Administración (en el celular ocupa toda la pantalla), y botón **"¿Qué está pasando?"** junto a las acciones de cada alerta. Corre en **Workers AI** dentro de Cloudflare.

- **Responde según el perfil:** el modelo no consulta la base; usa herramientas del servidor (`asistente_server.js`) y cada una exige el permiso de la pantalla equivalente. Si una herramienta no corresponde al perfil, no se le ofrece al modelo y, si igual la pide, el servidor la rechaza.

| Herramienta (solo lectura) | Permiso | Admin | Analista | Soporte | Gerente |
|---|---|---|---|---|---|
| `estado_clientes` (problemas abiertos y "viene empeorando" por cliente, servicio y canal) | `tablero` | Sí | Sí | No | Sí |
| `incidentes` (por cliente, graves, abiertos, tiempo de resolución, hasta 30 días; informe de un cliente) | `tablero` | Sí | Sí | No | Sí |
| `alertas_abiertas` (problemas por prioridad, estado y asignación) · `prealertas` | `alertas_abiertas` | Sí | Sí | No | No |
| `carga_equipos` (sin asignar y carga por equipo y persona) | `seguimiento` | Sí | Sí | No | No |
| `opciones_derivacion` (equipos y personas de Soporte con su carga) | `derivar` | No | Sí | No | No |
| `mis_alertas` (en curso, para tomar, resueltas en 24 h) | `mis_alertas` | No | No | Sí | No |
| `detalle_alerta` (últimas ventanas, historial, casos parecidos resueltos, otros problemas del cliente) | `tablero`, o Soporte solo lo suyo o de su equipo (misma regla que el historial) | Sí | Sí | Lo suyo | Sí |
| `ajustes_sugeridos` (posibles falsas alarmas de 30 días y umbrales configurados) | `admin_umbrales` | Sí | No | No | No |
| `contexto_externo` (parche 29: calendario con feriados, fines de semana largos, cobro de sueldos, aguinaldo y eventos comerciales; incidentes y mantenimientos de proveedores; noticias de Argentina de 48 h) | `asistente` (los servicios críticos de los clientes, solo con `tablero`) | Sí | Sí | Sí | Sí |

- **Nunca ejecuta nada.** Puede **proponer** derivar, tomar, comentar, devolver o resolver (`sugerir_accion`), solo si el perfil puede hacerlo; el servidor valida la alerta y el destino. La página muestra la propuesta con el comentario editable y un botón **"Hacerlo"**: recién con ese clic se llama a la ruta de siempre (`/api/alertas/{id}/...`), con sus permisos, historial y auditoría. El Gerente y el Administrador no reciben propuestas (no trabajan alertas); al Administrador le recomienda ajustes en texto y los hace él en Administración.
- **Preguntas sugeridas por perfil** (traen los datos directo, una sola llamada al modelo): Soporte "¿Qué tengo pendiente y por dónde empiezo?"; Analista "Resumen del turno", "¿Qué está sin asignar y a quién lo derivo?", "¿Hay alertas relacionadas entre sí?", "¿Qué pre-alertas conviene avisar a Soporte?"; Gerente "¿Cómo está la operación ahora?", "¿Qué cliente tuvo más problemas este mes?"; Administrador "¿Qué umbrales conviene revisar?" y "¿Cómo está la operación ahora?". Las preguntas libres usan hasta 3 vueltas con el modelo y 5 herramientas.
- **Cuida D1:** lee del caché del tablero (`series_estado`, `prealertas_estado`) y por índice, con límite de filas; cada pregunta escribe 2 filas (`asistente_uso` y `auditoria` con acción `ASISTENTE` y el texto de la pregunta). Unas 15 a 20 consultas por pregunta (tope del plan: 50).
- **Límites:** 600 caracteres por pregunta; 6 mensajes de historia (solo de la persona y del asistente); `ASISTENTE_POR_HORA` (20) por persona y `ASISTENTE_POR_DIA` (150) en total, para no pasar el cupo diario gratuito de Workers AI. Al pasarlos responde 429 con un mensaje claro.
- **Seguridad:** lo que devuelven las herramientas (comentarios, nombres) va como dato y el sistema le indica que no son órdenes; igual, aunque un texto lo "convenza", no puede leer fuera del perfil ni ejecutar nada. La respuesta se muestra escapada (solo negrita y listas). Si el modelo falla responde 502 y nada cambia.
- **Modelo:** variable `ASISTENTE_MODELO` (por defecto `@cf/qwen/qwen3.8-27b` desde el parche 54; el anterior, `@cf/qwen/qwen3-30b-a3b-fp8`, se da de baja el 20/11/2026: buena relación calidad / neuronas y soporta herramientas). Acepta las respuestas en formato OpenAI o en el propio de Workers AI, y si un modelo no acepta mensajes de herramienta reintenta con los datos como texto. Para cambiar a otro modelo (por ejemplo `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, mejor en español pero unas 5 veces más caro en neuronas) alcanza con la variable.
- **Probar sin Cloudflare:** `ASISTENTE_LOCAL=simulado node --no-warnings servidor_local.mjs prueba.sqlite` usa un modelo de mentira que muestra qué datos recibió (sirve para ver la pantalla y los permisos).

---

## 8. Pantallas

| Pantalla | Quién | Qué muestra |
|---|---|---|
| Tablero (`/`) | Administrador (lectura), Analista y Gerente | Resumen arriba, **Estado por cliente** (Panorama: una tarjeta por cliente con cada servicio y canal en color: bien, viene empeorando, leve, importante, grave, sin datos o sin historia), barras de 24 h por cliente (con "Bien el X % del día" contra su objetivo), alertas abiertas por prioridad con estado y asignación, pre-alertas (con "Avisar a Soporte" para el analista), histórico. **Desde el parche 42 el Gerente también ve** la lista de alertas abiertas (con su estado y quién las tiene), las pre-alertas y el detalle de cada alerta, **solo en lectura** (sin botones de acción). Más abajo, **"Disponibilidad y resumen del período"** (parches 44 y 45): selector Desde / Hasta y "Comparar con otro período" (parche 56; antes Día / Semana / Mes con ‹ ›), disponibilidad global y por cliente contra su objetivo mensual, tiempo sin servicio contra lo que permite el objetivo, comparación con el período anterior, KPIs y "Distribución de fallas" del período; arriba de la lista, el gráfico "Incidentes activos ahora" (parche 43) que filtra la lista; el tablero se actualiza solo cada 2 minutos. Botones: Actualizar, Derivar / Resolver (Analista) / Historial por alerta. Soporte que entra a `/` va a Mis alertas |
| Mis alertas (`/mis-alertas`) | Soporte | Su única página (sin enlace al tablero). Tarjetas por prioridad: En curso, Para tomar, De mis equipos (si es responsable), Resueltas en 24 h. Acciones: tomar, comentar, devolver, resolver, reasignar dentro del equipo |
| Seguimiento (`/seguimiento`) | Analista y Administrador (solo lectura) | Contadores (sin asignar, devueltas, asignadas sin tomar, en curso, resueltas 24 h) que filtran la tabla; filtros por estado, equipo, persona y cliente; tabla con prioridad, estado, quién la tiene, cuánto lleva en ese estado (en rojo si pasa 15 min sin asignar, 30 sin tomar o 2 h en curso) y última novedad; carga por equipo; resueltas en 24 h |
| Detalle de alerta (`/alerta/<id>`) | Soporte (lo suyo o de su equipo), Analista y, en solo lectura, Gerente y Administrador | **Parche 30.** Conversación completa (derivaciones, comentarios, archivos y resolución en orden), cuadro para comentar y adjuntar evidencia, datos de la alerta, evidencia, ventanas con problema (observado, esperado, límite) y acciones (tomar, derivar, reasignar, devolver, resolver). Resolver pide "¿Qué lo causó?" (una) y "¿Qué se hizo?" (una o más) con un clic; con las dos, el texto es opcional. Se llega con "Ver detalle" (Mis alertas, Seguimiento), "Detalle" (tablero), el título de la tarjeta, Resolver (`?resolver` abre el diálogo) y los avisos de la campanita y push |
| Administración (`/admin`) | Administrador y Analista (pestañas según perfil) | Usuarios, Equipos, Reglas de alerta (solo Administrador), Derivación, **Umbrales** (solo Administrador), Modelo, Auditoría |
| Login (`/login`) | Todos | Ingreso y cambio de contraseña temporal. Después del ingreso, `/inicio` lleva a la página de cada perfil: Administración (Administrador), Mis alertas (Soporte) o el tablero (Analista y Gerente); con `?demo`, al tablero de la demo |

**Barra superior:** hora de los datos, Actualizar, campanita y la foto de perfil. "Mis alertas", "Seguimiento" y "Administración" están **solo en el menú de la foto de perfil**, con el número de pendientes al lado; un punto rojo en la foto avisa que hay algo pendiente. En el mismo menú se elige el tema (claro, oscuro o sistema) y se cambia la contraseña.

**Estilo:** base neutra tipo Atlassian / InvGate (tipografía del sistema, bordes chicos, etiquetas de estado) con color principal verde azulado `#0F766E` (claro) / `#2DD4BF` (oscuro). Funciona en el celular sin desplazamiento horizontal.

**Umbrales (Administración):** valores generales + excepciones por cliente o por cliente y servicio. El diálogo muestra qué espera el modelo para ese alcance (tráfico, tasas, latencia, demora de llegada), cómo quedaría la banda con el porcentaje elegido y un botón "Usar lo recomendado". Desde el parche 31 (14/11) la pestaña y el diálogo empiezan con "Cómo decide Helios" en 4 pasos (1 lo normal y su margen, 2 ¿hay alerta?, 3 ¿qué tan grave?, 4 ¿qué se atiende primero?), los grupos del diálogo siguen ese orden y cada campo dice qué pasa si se sube o se baja. Desde el parche 27 (12/11) cada campo explica en palabras simples qué hace y muestra un ejemplo "En la práctica" que se actualiza al escribir (por ejemplo: "si se esperan 537 operaciones, es Importante con 403 o menos"; "se toleran hasta 2 ventanas de 15 minutos con problemas por día"). Validaciones: Grave tiene que ser mayor que Importante; bandas entre 50 % y 300 %. Cada cambio marca el tablero para recalcular y queda en auditoría.

---

## 9. Perfiles y permisos (se controlan en el servidor)

| Acción | Admin | Analista | Soporte | Gerente |
|---|---|---|---|---|
| Página de inicio | Administración | Tablero | Mis alertas | Tablero |
| Tablero: Panorama, 24 h, histórico, tiempos, clientes | Sí (lectura) | Sí | **No** | Sí |
| Tablero: alertas abiertas y pre-alertas | Sí (lectura) | Sí | No | Sí (lectura) |
| Historial de una alerta | Sí | Sí | Solo las suyas o de su equipo | Sí |
| Derivar / reasignar | **No** | Sí | Solo si es responsable del equipo, y dentro de su equipo | No |
| Avisar a Soporte de una pre-alerta | No | Sí | No | No |
| Tomar | **No** | **No** (el analista solo deriva) | Solo lo asignado a él o a su equipo | No |
| Resolver | **No** | Cualquiera (por ejemplo, falsas alarmas) | Solo lo asignado a él | No |
| Devolver | — | — | Lo que tiene asignado | No |
| Mis alertas (bandeja propia) | No | No | Sí | No |
| Seguimiento (todas las abiertas, quién las tiene, carga por equipo) | Sí, solo lectura | Sí | No | **No** |
| Campanita | No | Sí (lleva a Seguimiento) | Sí (lleva a Mis alertas) | No |
| Detalle de alerta | Sí (solo lectura) | Sí (todas) | Solo lo suyo o de su equipo | Sí (solo lectura) |
| Adjuntar evidencia, correo, tickets | No | Sí (todas) | Solo lo suyo o de su equipo | No |
| Causas y acciones para resolver (catálogo) | Sí | No | No | No |
| Avisos push en el dispositivo | No | Sí | Sí | No |
| Instalar Helios como app | Sí | Sí | Sí | Sí |
| Asistente de IA (responde con lo que el perfil puede ver; propone, no ejecuta) | Sí (sin propuestas de acción) | Sí | Sí | Sí (sin propuestas de acción) |
| Recibir alertas (destino de una derivación) | **No** | No | Sí | No |
| Reglas de alerta (del sistema y personalizadas) | Sí | **No** | No | No |
| Reglas de derivación, ver modelo | Sí | Sí | No | No |
| Usuarios, equipos, auditoría, umbrales por cliente | Sí | No | No | No |
| Modo demo | Sí | Sí | No | No |

El Administrador puede crear usuarios de cualquier perfil, incluso otros administradores. Siempre queda al menos un administrador activo y nadie puede quitarse a sí mismo el perfil ni desactivarse.

Contraseñas con PBKDF2-SHA256 (20.000 iteraciones, sal por usuario), 5 intentos fallidos = 10 min de bloqueo, sesión de 12 h en cookie `helios_sesion` (HttpOnly, Secure, SameSite=Strict), cambio obligatorio de la contraseña temporal. El primer administrador se crea en `/api/setup`, que solo funciona sin usuarios. **Está adaptado al plan gratuito: al migrar hay que endurecerlo.**

---

## 10. API del Worker de alertas

Todas exigen sesión salvo las públicas. Hoy **no existe token para máquinas**.

| Ruta | Para qué |
|---|---|
| `GET /login` · `POST /api/login` · `GET/POST /api/setup` | Públicas: ingreso y alta del primer administrador |
| `GET /api/yo` · `POST /api/cambiar-clave` · `POST /api/logout` | Sesión actual, permisos e `inicio` (página de inicio del perfil) |
| `GET /inicio` | Redirige a la página de inicio del perfil (la usa el login) |
| `GET /` · `GET /api/dashboard` | Tablero y sus datos en un solo viaje a la base: abiertas con asignación, incidentes de 30 días, parámetros, pre-alertas y series (del cache), reglas personalizadas, eventos y `umbrales` (criticidad y objetivo). Soporte no puede usarlo (403). Los KPIs, el MTTR y los clientes se calculan en la página |
| `GET /api/tablero/version` · `GET /api/tablero/periodo?tipo=dia\|semana\|mes&fecha=AAAA-MM-DD` o `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&liviano=1]` (parche 56) | Parches 42 y 44 (permiso `tablero`). El primero es el marcador de revisión (1 fila) para la actualización automática. El segundo da un período (semana de lunes a domingo, hora de Argentina, hasta 400 días atrás): incidentes que empezaron en él, disponibilidad por cliente y servicio (con el período anterior para comparar) y la configuración de pesos |
| `POST /api/procesar` | **Solo para las pruebas de la PC** (parche 34: existe si el Worker tiene `PERMITIR_REVISION_MANUAL = '1'`; en Cloudflare no). Correr el proceso de alertas; devuelve `{ok, registradas_o_actualizadas, resueltas, derivadas_automaticamente, filas_leidas, filas_escritas}` |
| `POST /api/alertas/{id}/derivar` | Body `{equipo_id?, usuario_id?, comentario?}` |
| `POST /api/alertas/{id}/tomar` · `/comentar` · `/devolver` · `/resolver` | Body `{comentario}`; obligatorio al devolver. Al resolver, desde el parche 30, también `causa_id` y `acciones_ids` (del catálogo): con las dos el comentario es opcional; sin ellas, obligatorio. `/reconocer` sigue funcionando como sinónimo de `/tomar` |
| `GET /api/alertas/{id}/correo/contactos` | Parche 68: personas activas con correo y equipos activos (con los correos de sus miembros) para elegir destinatarios en "Template correo alerta" y en "Confirmar envío". Solo quien trabaja la alerta (Analista; Soporte en lo suyo o de su equipo); Gerente y Administrador, 403. `falta_script: true` si no se corrió el script 23 |
| `GET /api/alertas/{id}/historial` | Eventos de la alerta (Soporte, solo de las suyas o de su equipo) |
| `POST /api/prealertas/avisar` | Analista: body con la clave de la pre-alerta activa (`tipo_prealerta`, `ambiente`, `cliente_id`, `servicio_id`, `producto_id`, `canal_id`, `moneda_id`) + `{equipo_id?, usuario_id?, comentario?}`. Crea avisos `PREALERTA` y queda en auditoría (`AVISAR_PREALERTA`); no crea alertas |
| `GET /mis-alertas` · `GET /api/mis-alertas` · `GET /api/asignables` | Bandeja personal (incluye `umbrales` para la prioridad y `mis_pendientes`) y a quién se puede derivar (solo Soporte) |
| `GET /alerta/{id}` · `GET /api/alertas/{id}/detalle` | Ticketera (parche 30): página y datos del detalle (ventanas, eventos, adjuntos, resolución, opciones del catálogo, qué botones mostrar) |
| `POST /api/alertas/{id}/adjuntos` · `GET /api/alertas/{id}/adjuntos/{archivo}` · `POST /api/alertas/{id}/adjuntos/{archivo}/borrar` | Evidencia. Va a la tabla `evidencia_archivos` de D1 (o a R2 si el Worker tiene el binding `EVIDENCIA`), en la carpeta `alertas/<primera ventana del problema>/`; en `alerta_eventos` queda el comentario "Adjuntó el archivo «…»". Subir: el cuerpo es el archivo, nombre en `x-nombre-archivo` (URL-encoded); hasta 1 MB en D1 (10 MB en R2), 15 por alerta y 200 MB en total en D1; tipos png, jpg, gif, webp, pdf, txt, log, csv, json, har, zip, eml, xlsx, docx. Borrar: solo quien lo subió y con la alerta abierta |
| `POST /api/admin/recalcular` | Recalcular las últimas 24 h (parche 37; solo Administrador): revisión completa; devuelve lo mismo que el proceso, con `modo` |
| `GET/POST /api/admin/catalogo-resolucion` | Causas y acciones (solo Administrador): alta `{tipo, nombre}`, cambio `{id, nombre, activo}`; queda en auditoría |
| `GET /seguimiento` · `GET /api/seguimiento` | Seguimiento: abiertas con asignación, eventos, resueltas de las últimas 24 h (por índice de `ventana_inicio`), equipos, miembros y umbrales |
| `GET /api/avisos` · `GET /api/avisos/contador` · `POST /api/avisos/{id}/leido` · `POST /api/avisos/leer-todos` | Campanita |
| `GET /api/push/clave` · `POST /api/push/suscribir` · `POST /api/push/desuscribir` | Avisos push: clave pública VAPID (null sin secreto o sin campanita), suscribir el dispositivo (body `{suscripcion, anterior?}`, lo que entrega `pushManager.subscribe()`), dejar de recibir (body `{endpoint}`, **pública**) |
| `GET /sw.js` · `/manifest.webmanifest` · `/icono-192.png` · `/icono-512.png` · `/apple-touch-icon.png` · `/icono-insignia.png` · `/favicon.ico` | **Públicas:** service worker, manifiesto e íconos para instalar Helios como app |
| `GET /api/asistente` · `POST /api/asistente` | Asistente de IA (todos los perfiles): estado, preguntas sugeridas del perfil y preguntas que quedan; preguntar con body `{pregunta, historia?}`, `{sugerencia}` o `{alerta_id}`. Devuelve `{respuesta, acciones, herramientas, restantes}`. Las `acciones` son propuestas: se ejecutan desde la página con las rutas de `/api/alertas/{id}/...`. 503 sin Workers AI, 429 al pasar los límites, 502 si el modelo falla |
| `GET /api/admin/eventos` · `POST /api/admin/eventos` · `POST /api/admin/eventos/borrar` | Eventos comerciales (solo Administrador, parche 29). Alta: `{nombre, fecha_desde, fecha_hasta?, cliente_id?, servicio_id?, efecto_esperado, nota?}`; baja: `{id}`. Quedan en auditoría |
| `GET /admin` · `/api/admin/usuarios`, `/equipos`, `/reglas`, `/derivacion`, `/modelo`, `/auditoria` | Administración |
| `GET /api/admin/umbrales` · `GET /api/admin/umbrales/recomendacion?cliente=&servicio=` · `POST /api/admin/umbrales` · `POST /api/admin/umbrales/borrar` | Umbrales (solo Administrador). El POST recibe `cliente_id`, `servicio_id` (vacíos = general) y los campos de `umbrales_config` en fracciones (0,25 = 25 %, 1 = banda del modelo); vacío = hereda |
| `POST /api/teams/bot` · `GET /api/admin/teams/bot` · `POST /api/admin/teams/bot/probar` | Bot de Teams (parche 76). El primero lo llama Microsoft con su token (sin sesión; 401 si la firma no es válida, 503 sin secretos); los otros dos, solo Administrador: estado y dirección de mensajes, y prueba de conexión (auditoría `TEAMS_BOT_PRUEBA`) |
| `POST /api/admin/usuarios/{id}/borrar` · `/reglas/{id}/borrar` · `/derivacion/{id}/borrar` · `POST /api/admin/catalogo-resolucion` con `{id, borrar: true}` | Eliminar (parche 75). Usuarios y reglas de alerta: solo Administrador; reglas de derivación: Administrador y Analista. Usuarios: 409 si tiene alertas abiertas asignadas, tareas abiertas en una sala o dirige una sala abierta; 400 si es uno mismo o el último administrador. Auditoría `BORRAR_*` |
| `POST /api/admin/umbrales/disponibilidad` | Pesos de la disponibilidad (solo Administrador, parche 45): `{pesos_gravedad:{CRITICA,ALTA,MEDIA}` en fracciones de 0 a 1, `pesos_criticidad:{ALTA,MEDIA,BAJA}}` de 0,1 a 100. Valida el orden. 409 si falta el script 20. Auditoría `EDITAR_DISPONIBILIDAD` |
| `GET /api/demo` · `POST /api/demo/preparar` · `POST /api/demo/siguiente` | Modo demo (`/?demo`) |

Respuestas JSON con `{ok: true, ...}` o `{ok: false, error: "mensaje para mostrar"}`.

---

## 11. La demo

- **Sin carga base** (desde el 11/11): la demo arranca sin datos recibidos. El perfil está entrenado con la historia hasta el lunes 26/10 a las 10:00 (hora de Argentina) y la escena 1 es la primera llegada de datos de cada serie; las escenas toman lo "normal" del perfil. `09_modelo_v2_d1.txt` vacía las métricas viejas. **Las fechas son fijas**: sirve para presentar cualquier día, todas las veces que haga falta.
- **Reloj:** "Preparar demo" lo pone en el lunes 26/10 a las 10:00 (hora de Argentina), borra alertas, eventos y avisos, borra las métricas desde ese momento y reactiva las reglas del sistema (las personalizadas no las toca). Cada "Siguiente escena" carga una ventana de 15 minutos y corre el proceso.
- **Las 19 escenas:** 1 Arranca la guardia · 2 La app de CLI_001 se queda muda · 3 CLI_001 se recupera solo · 4 Promo de recarga de transporte · 5 Suben los rechazos de CLI_004 · 6 Pre-alerta en CLI_004 · 7 Se confirma: rechazo alto en CLI_004 · 8 Falla el gateway de CLI_002 · 9 CLI_006 aprueba menos · 10 Transferencias fuera de lo común · 11 Tickets más chicos · 12 Pre-alerta: recargas lentas · 13 Se confirma: latencia alta en CLI_003 · 14 Caída total en CLI_006 · 15 El dato llega tarde · 16 Un bug informa mal la tasa · 17 Llega un cliente nuevo (CLI_008, sin historia) · 18 CLI_007 deja de enviar · 19 Cierre de la guardia · **desde el parche 69:** 20 Se cae el gateway de pagos (CLI_006, CLI_002 y CLI_005) · 21 La sala de crisis trabaja · 22 Servicio restablecido. Las escenas 20 a 22 traen los datos; abrir la sala, asignar tareas y cerrarla lo hace quien presenta (el texto de cada escena lo indica).
- **Prueba de regresión:** la demo de 19 escenas tiene que dar las mismas alertas antes y después de cualquier cambio. Con el perfil (11/11) da exactamente las mismas alertas, severidades y pre-alertas que con el modelo anterior.

---

## 12. Por qué migramos

| Límite (plan gratuito de Cloudflare) | Valor | Situación |
|---|---|---|
| Filas leídas de D1 | 5 millones por día | **Resuelto el 5/11/2026:** antes cada revisión recorría las tablas enteras y el cupo se pasaba en una semana. Con el motor que filtra por fecha, cada revisión lee solo las últimas ~25 horas. Antes ya se había agotado una vez (26/10) por `v_alertas_faltantes`, y otra por `v_prealertas`; las dos están corregidas |
| Filas escritas de D1 | 100.000 por día | Holgado en uso normal; cada índice suma una escritura. Una carga grande puede pasarlo |
| Tamaño de una base D1 | 500 MB (10 GB en el plan pago, no ampliable) | Unos 157 KB por serie por día: 13 series llenan 500 MB en ~8 meses |
| CPU por pedido | 10 ms | Obliga a pocas iteraciones de PBKDF2; un agente no entra |
| Consultas por pedido | 50 | Lotes grandes de avisos pueden pasarse |
| Subpedidos por pedido | 50 | Un agente que llama varias veces a un modelo de IA los consume. Los avisos push usan uno por dispositivo (tope 25 por pedido) |

Capacidad estimada de la base (métricas con índices):

| Series | Por año | 3 años |
|---|---|---|
| 13 | 0,75 GB | 2,2 GB |
| 100 | 5,7 GB | 17 GB |
| 500 | 29 GB | 86 GB |

Con el perfil ya no se guardan predicciones por ventana: el modelo ocupa unas 26.000 filas fijas (para 13 series), sin importar cuánto tiempo pase.

---

## 13. Destino propuesto (a confirmar por el equipo)

La empresa no usa nube pública: el destino es **un servidor propio (máquina virtual Linux, 4 vCPU, 8 a 16 GB de RAM, ~100 GB de disco) con Docker Compose**.

**Fase 1, salir de Cloudflare sin reescribir:** el código del Worker usa APIs web estándar, así que corre en Node.js 20+ con un adaptador chico: un servidor HTTP que arma un `Request`, llama a `worker.fetch(request, env)` y devuelve el `Response`. `env.DB` se implementa sobre un archivo **SQLite** local (`node:sqlite` o `better-sqlite3`) con la misma interfaz de D1 (`prepare().bind().all()/first()/run()` y `batch()` como transacción). El SQL no cambia. El cron se reemplaza por un timer que llama a `worker.scheduled()` cada 15 minutos. Esto ya se probó: todas las pruebas de la demo corren así.

**Fase 2, PostgreSQL con `pgvector`:** cuando haga falta concurrencia, más volumen o vectores para el agente. Hay que traducir:

- `julianday()` y `strftime()` → tipos `timestamptz` y funciones de fecha de Postgres.
- `lower(hex(randomblob(16)))` → `gen_random_uuid()` o `md5(random()::text)`.
- `INSERT OR REPLACE` del modelo → `INSERT … ON CONFLICT … DO UPDATE`.
- La capa de acceso: `env.DB.prepare/batch` → driver de Postgres con transacciones.
- Window functions (`ROW_NUMBER`, `LAG`), `ON CONFLICT` y `UPDATE … SET (a, b) = (subconsulta)` funcionan casi igual.
- Mantener el criterio del motor: filtro por rango sobre la columna de fecha indexada, sin funciones aplicadas a la columna.

**Propuesta de la compañera** (`Alertas_Modelo_Datos.docx`): un modelo normalizado para PostgreSQL / Cloud SQL con `customers`, `services`, `metrics`, `baselines`, `alert_rules`, `alert_state` (persistencia, histéresis y recuperación) y `alerts`, y la distinción entre `ZERO_ACTIVITY` y `NO_DATA`. Si se adopta, hay que mapear las tablas actuales (sección 3) y los umbrales por cliente (`umbrales_config`) a ese modelo; no está decidido.

**Herramientas:** Node.js para la app, SQLite y después PostgreSQL, Caddy o Nginx para HTTPS con el certificado de IT, Python con FastAPI para el agente, copia nocturna de la base a otro disco.

---

## 14. El agente de IA (primera versión: el asistente del parche 28)

La primera versión es el **asistente del parche 28** (sección 7): corre en Workers AI, solo lee con los permisos de quien pregunta y propone acciones que confirma una persona. Lo que sigue vale para versiones más autónomas o fuera de Cloudflare.

Requisitos para cualquier versión:

1. **Usuario propio** con un perfil nuevo (por ejemplo `AGENTE`) y un **token de máquina**. Sus acciones quedan en `auditoria` y `alerta_eventos` con su nombre.
2. **Usa la API, no la base.** Herramientas sugeridas: alertas abiertas, historial de una alerta, observado contra esperado de una serie en las últimas N ventanas, incidentes parecidos, bandeja de una persona. Si actúa, por las mismas rutas de derivar, comentar o resolver.
3. **Consultas livianas** por serie y rango de fechas, con índice.
4. **Diccionario de datos** completo en `meta_diccionario_datos`.
5. **Servicio aparte** (Python con FastAPI) que corre al lado de la app, llama al modelo de IA y a la API de Helios.

Posibles roles: analizar alertas (explicar causa, resumir el incidente en lenguaje natural, sugerir derivación), responder preguntas en un chat, o actuar solo con límites y confirmación humana.

Opciones de modelo: una API externa (mejor calidad; los datos salen de la empresa) o un modelo local con Ollama o vLLM (los datos no salen; necesita un servidor con GPU y la calidad es menor). Los modelos cambian rápido: elegir con un set de prueba propio (20 o 30 alertas de la demo con la explicación esperada).

Preguntas abiertas: qué rol primero, quién lo usa, qué proveedor (o modelo local) aprueba la empresa, si los datos de clientes pueden salir a un proveedor externo, cuántas series tendrá producción.

**Comparación de modelos (20/11, solo documentos, sin código):** `Helios_modelos_IA_propuesta_cliente.docx` (alcance, cuatro integraciones, costo en plan pago y seguridad para revisar con informática) y `Helios_modelos_IA_analisis_tecnico.docx` (seis opciones, precios del 18/11/2026 sin descontar cupo gratis). Los generan `07_Codigo_fuente/word/modelos_ia_datos.js`, `modelos_ia_build.js` e `indice_word.py`. Decisión del equipo: la integración local se desarrolla igual en el servidor de desarrollo, sin GPU para empezar (CPU alcanza para armarla; la GPU se evalúa si el chat queda lento). Mientras Helios siga en Cloudflare, Workers AI con Qwen3 en plan pago. API externa solo en plan pago y si seguridad aprueba que los datos salgan. Un modelo en la LAN no lo alcanza un Worker en Cloudflare sin túnel. La primera placa, si la medición en CPU no entra en los 8 segundos, es una RTX PRO 4500 (32 GB, ECC, 200 W, unos USD 4.600 a 5.900), no una o dos RTX 3090: dos de 24 GB no se suman solas. Escalar de a un paso (8.6 del análisis técnico): modelo que no entra → una placa de 48 o 96 GB; lentitud con una persona → 5090; cola de personas → un segundo servidor igual. Hostear la GPU en AWS o GCP (precios de lista al 20/11, regiones baratas de EE.UU.): una L4 de 24 GB prendida todo el mes sale USD 516 a 588, y reservada a 3 años USD 232 a 270, parecido a amortizar en 3 años una placa local de 32 GB (USD 214 a 400, más la luz). Una L40S de 48 GB en AWS sale USD 1.359 por mes. Los datos salen igual. Pendiente: que seguridad diga si los datos pueden salir, el tope mensual y la prueba con ~40 casos.

---

## 15. Reglas que no se deben romper

**Del negocio**

- **Nada de tablas de demo:** el prototipo tiene que parecerse a lo que tendría un cliente real. Los datos entran por `core_metricas_observadas` y todo lo demás se calcula.
- **El diccionario y los datos tienen que ser consistentes:** mismos nombres de tablas, campos, clientes y casos.
- No se modifica la estructura de `core_metricas_observadas`. (`core_metricas_esperadas` se reemplazó por `perfil_comportamiento` el 11/11.)
- Los mínimos y máximos los calcula el modelo. Nadie escribe un umbral fijo: el Administrador ajusta el **ancho** de la banda (porcentaje) por cliente en `umbrales_config`. Las reglas personalizadas eligen métrica, dirección, ventanas, alcance y severidad.
- Criticidad, objetivo de disponibilidad, cortes de severidad, ancho de banda, volumen mínimo y gracia se configuran desde Administración > Umbrales (solo Administrador; queda en auditoría). Con los valores de fábrica el sistema se comporta exactamente como antes. El horizonte y la tolerancia siguen siendo solo por SQL.
- El motor lee `umbrales_config` con tres LEFT JOIN por clave primaria (general, cliente, cliente + servicio). Al migrar, mantener ese orden de precedencia.
- El analista siempre deriva; Soporte solo trabaja lo asignado; el Gerente solo mira.
- **Toda escritura pasa por la API** para que apliquen permisos, historial y auditoría.
- Las pre-alertas no se guardan en `alertas_historico`.
- Textos de la interfaz en español rioplatense, sin jerga técnica. Los documentos para personas se entregan en Word y las presentaciones en PowerPoint. Los Word siguen el estilo del documento "Alertas - modelo de datos": títulos en azul `1F4E79` y verde azulado `00707D`, Calibri en títulos y Aptos en el texto, recuadros de código en gris `F4F6F8` y notas en celeste `EAF2F8` (idea clave), amarillo `FFF2CC` (regla obligatoria) o verde `E2F0D9` (decisión), e índice de Word.
- Cada página muestra solo lo que el perfil puede usar; los accesos a Mis alertas, Seguimiento y Administración van en el menú del usuario, no repetidos en la barra.

**De los datos y la base**

- El "ahora" sale siempre de `alerta_parametros.ahora` (fecha = demo; NULL = reloj real).
- Solo parámetros posicionales en las consultas (`?1`, `?2`), nunca valores pegados al SQL.
- **Cargar el tablero tiene que ser barato** (cientos de filas, no miles): nada de recalcular alertas ni pre-alertas en `/api/dashboard`; lo calculado se guarda una vez por revisión. Los KPIs, el MTTR y los clientes más afectados se calculan en la página a partir de los incidentes de 30 días.
- Cuidar las lecturas: filtrar por columnas con índice (`ventana_inicio` como texto), no cruzar contra subconsultas grandes, revisar el plan de la consulta.
- En D1: como máximo 2 `SELECT` unidos por `UNION` (`SQLITE_LIMIT_COMPOUND_SELECT = 2`). Antes de entregar SQL, probarlo en SQLite con ese límite. En la consola de D1, una sentencia por línea, sin saltos ni comentarios.
- Antes de una carga grande en la consola de D1, ejecutar `/bookmark` para poder volver con `/restore`.
- **No volver a correr el SQL viejo de objetos** (`alertas_d1_objetos.sql` o su versión de consola): restablece parámetros y reglas (sus bloques 1 a 3 borran `alerta_parametros`) y trae la `v_prealertas` y las `v_alertas` lentas.
- "Preparar demo" **borra** alertas, eventos, avisos y métricas desde el inicio de la demo. No debe existir en producción.

**Del despliegue (mientras siga en Cloudflare)**

- El Worker de alertas es un solo archivo. Se publica pegando el código en "Edit code" del panel (o con `wrangler deploy`), **no** con el cargador de archivos.
- Primero se corre el SQL nuevo, después se publica el Worker.
- **El contexto externo se consulta poco:** proveedores y noticias, como mucho una vez por hora y solo cuando alguien pregunta (caché en `contexto_externo`). Nada de cron ni de consultas en cada carga de página. El asistente nunca responde de memoria cosas del mundo: lo de afuera, solo con esa herramienta y citando la fuente.
- **El asistente de IA solo lee y propone.** Cualquier herramienta nueva tiene que exigir el permiso de la pantalla equivalente y leer poco (caché o índice, con límite de filas); las acciones se ejecutan siempre desde la página, por las rutas de siempre.
- **No hay vistas:** el SQL vive en el Worker. Si una consulta se repite, va como constante en el Worker, no como vista.

---

## 16. Cambios recientes

Si tenés también un documento de contexto anterior, estas son las diferencias; vale lo de este archivo.

**El bot de Teams recuerda la conversación y se lo menciona como @Gemma (20/11, parche 77; script 25, falta publicar y que IT registre el bot)**

- Tabla nueva `teams_bot_memoria` (script `25_teams_bot_memoria_d1.txt`; pasa a 33 tablas): una fila por persona y chat con los últimos 6 mensajes y la sala de la que venía hablando; se usa hasta 2 horas después del último mensaje, lo de más de 7 días se borra solo, es por persona (lo contestado a alguien no se usa con otro) y «empezar de nuevo» la borra. Sin el script, el bot anda sin memoria. Al eliminar un usuario se borra también su memoria.
- El nombre para mencionarlo es el de la app en Teams (por defecto **Gemma**; `armar_paquete.py --nombre`, secreto opcional `TEAMS_BOT_NOMBRE`). En chats grupales Teams solo entrega los mensajes con mención real.
- Respaldo: `99_Archivo_viejo/worker_antes_parche77/`, ramas `respaldo-antes-parche-77` y `version-parche-77-bot-memoria-y-nombre`.

**Bot de Helios en Teams (20/11, parche 76; sin SQL, falta que IT registre el bot)**

- El asistente de IA como bot de Microsoft Teams: se lo suma al chat de la sala (o se le escribe de a dos) y responde con lo que cada persona puede ver en Helios (estado de la sala, tareas, guía de diagnóstico, casos parecidos, contexto externo). Solo lee y propone; las acciones se confirman en Helios (el bot manda el enlace). Quien pregunta se identifica por su correo de Teams (`usuarios.correo`) y la pregunta pasa por la misma ruta del asistente: mismos permisos, límites y auditoría.
- `POST /api/teams/bot` (lo llama Microsoft, valida la firma del token), secretos `TEAMS_BOT_APP_ID`, `TEAMS_BOT_SECRET` y `TEAMS_BOT_TENANT` (si el bot es de un solo tenant). Administración > Equipos > «Bot de Helios en Teams»: estado, dirección de mensajes y «Probar conexión con Microsoft». Paquete de la app: `07_Codigo_fuente/teams_app/`. Pasos para IT: `Helios_pasos_para_IT_bot_de_Teams.docx`.
- Respaldo: `99_Archivo_viejo/worker_antes_parche76/`, ramas `respaldo-antes-parche-76` y `version-parche-76-bot-de-teams`.

**El Administrador elimina lo que crea y las salas de la demo se reinician (20/11, parche 75; sin SQL, falta publicar)**

- Administración: se pueden eliminar **usuarios** (no uno mismo, ni el último administrador, ni quien tiene alertas o tareas de sala abiertas; lo que hizo queda en el historial sin su nombre), **equipos** (ahora también con historial; se borran sus integrantes y reglas de derivación), **reglas de alerta personalizadas** (y las reglas de derivación que las usaban), **reglas de derivación** y **causas y acciones para resolver**. Rutas `POST /api/admin/usuarios/<id>/borrar`, `/reglas/<id>/borrar`, `/derivacion/<id>/borrar` y `/catalogo-resolucion` con `{id, borrar: true}`. Cada una queda en la auditoría (`BORRAR_USUARIO`, `BORRAR_EQUIPO`, `BORRAR_REGLA`, `BORRAR_DERIVACION`, `BORRAR_CATALOGO_RESOLUCION`).
- «Preparar demo» deja la numeración de las salas de crisis en el último antecedente importado: la primera sala de la demo es siempre IM-4 (antes subía IM-7, IM-8…).
- Respaldo: `99_Archivo_viejo/worker_antes_parche75/`, ramas `respaldo-antes-parche-75` y `version-parche-75-eliminar-y-salas-demo`.

**Asistente más cómodo y alertas que se quitan de la sala (20/11, parche 74; sin SQL, falta publicar)**

- Las preguntas sugeridas del asistente quedan fijas abajo del panel, arriba del cuadro de texto, para usarlas en cualquier momento de la conversación.
- Los saludos y agradecimientos sueltos ("hola", "gracias", "de nada", "ok", "chau") se contestan con una frase fija, sin llamar al modelo: no gastan neuronas, no cuentan en el límite de preguntas y no dejan registro. Si el mensaje trae algo de trabajo ("hola, ¿cómo está CLI_004?") va al modelo como siempre.
- Sala de crisis: "Quitar de la sala" en cada alerta (el Analista que dirige; la sala conserva al menos una). Ruta `POST /api/incidentes/<id>/alertas/<alerta_id>/quitar` con `{motivo?}`. La alerta sigue abierta y puede sumarse otra vez; queda en la línea de tiempo, en la conversación de la alerta y en la auditoría (`QUITAR_ALERTA_INCIDENTE`).
- Respaldo: `99_Archivo_viejo/worker_antes_parche74/`, ramas `respaldo-antes-parche-74` y `version-parche-74-asistente-y-sala`.

**Aviso de prueba de Teams (20/11, parche 73; sin SQL, falta publicar)**

- El canal de Teams "Plataforma Monitoreo" quedó conectado el 20/11 (secreto `TEAMS_WEBHOOK` cargado; llegó el aviso de prueba). El aviso de prueba ahora tiene su propia tarjeta, sin "IM-0" ni estado de sala.
- Respaldo: `99_Archivo_viejo/worker_antes_parche73/`, ramas `respaldo-antes-parche-73` y `version-parche-73-aviso-prueba-teams`.

**Llamadas escritas como texto y "lo gestiona" en Escalar (20/11, parche 72; sin SQL, falta publicar)**

- Gemma escribió la propuesta como texto (`sugerir_accion(…)`) y la tarjeta "Escalar el incidente a <persona de Soporte>" se leía como si esa persona fuera el proveedor. Ahora esas llamadas escritas se leen como llamadas y no se muestran, y la tarjeta dice "· lo gestiona <persona>" (escalar crea una tarea para quien contacta al proveedor).
- Gold set del asistente: `Helios_gold_set_asistente.docx` (20 preguntas, 8 críticas, pasa con 34 de 40).
- Respaldo: `99_Archivo_viejo/worker_antes_parche72/`, ramas `respaldo-antes-parche-72` y `version-parche-72-asistente-llamadas-y-escalar`.

**Asistente en la sala: preguntas libres (20/11, parche 71; sin SQL, falta publicar)**

- Con Gemma, "¿Escalo esto al proveedor?" dentro de la sala respondía "dejame consultar…" sin consultar ni dejar botón. Ahora la pregunta libre en la sala lleva estado, tareas y, según las palabras, la guía de diagnóstico y el contexto externo; si se pregunta por escalar y el modelo no lo propuso ni dijo que no hace falta, el servidor deja el botón Escalar. En todo el asistente, si el modelo anuncia una consulta sin hacerla, se le insiste una vez.
- Respaldo: `99_Archivo_viejo/worker_antes_parche71/`, ramas `respaldo-antes-parche-71` y `version-parche-71-asistente-sala-preguntas-libres`.

**Sala de crisis en Teams (20/11, parche 70; sin SQL, falta publicar)**

- **A:** las novedades de cada sala (apertura, alertas sumadas, tareas nuevas y hechas, escalamientos, estado, comunicados y cierre; no las notas) llegan a un canal de Teams como tarjeta con "Abrir sala en Helios". Se conecta con un flujo de Workflows de Teams y su dirección en el secreto `TEAMS_WEBHOOK`; sin él no hace nada. Administración > Equipos: "Avisos en Teams" con aviso de prueba (solo Administrador; rutas `GET /api/admin/teams` y `POST /api/admin/teams/probar`, auditoría `TEAMS_PRUEBA`).
- **B:** botón "Chat en Teams" en la sala: abre un chat grupal de Teams con quienes están en la sala, por su correo (`teams_chat` en `GET /api/incidentes/<id>`).
- **C (bot de Helios en Teams):** pendiente de IT; qué pedir en `05_Documentacion/novedades_sala_teams.md`.
- Respaldo: `99_Archivo_viejo/worker_antes_parche70/`, ramas `respaldo-antes-parche-70` y `version-parche-70-sala-en-teams`.

**Sala de crisis, etapa 1 del AICIM (20/11, parche 69; script 24; lista para publicar)**

- Plan en `05_Documentacion/plan_sala_crisis_etapa1.md`: incidentes mayores que agrupan alertas, con tareas, línea de tiempo y guía de diagnóstico dentro de Helios; el asistente propone asignar tareas, comunicar o escalar. Seis tablas nuevas (script `24_sala_crisis_d1.txt`, generado por `sala_crisis_sql.py` y ya probado; sin correr en D1): `incidentes_mayores`, `incidente_alertas`, `incidente_tareas`, `incidente_linea_tiempo`, `componentes_infraestructura`, `componente_dependencias`, con un catálogo de ejemplo y 3 antecedentes cerrados. Microsoft Teams queda para la etapa 2. Decisiones confirmadas por Ale. Programado y probado en la rama `version-parche-69-sala-de-crisis` (páginas `/incidentes` y `/incidente/<id>`, rutas `/api/incidentes…`, herramientas `estado_incidente`, `tareas_incidente` y `guia_diagnostico` del asistente, que solo se ofrecen dentro de una sala; propuestas `asignar_tarea`, `escalar` y `comunicar`). Demo: escenas 20 a 22 (se cae el gateway de pagos en tres clientes, la sala trabaja, servicio restablecido). Listo para publicar (script 24 → Worker, que trae también los parches 64 a 68; el script 23 ya se corrió el 20/11); falta probar el asistente con el modelo real. Guía: `05_Documentacion/novedades_sala_crisis.md`. Respaldo: `99_Archivo_viejo/worker_antes_parche69/`, ramas `respaldo-antes-parche-69` y `version-parche-69-sala-de-crisis`.


**Correo de cada usuario y elegir destinatarios (18/11, parche 68; script 23 corrido el 20/11; el Worker se publica junto con el 69)**

- Pedido de Uriel: cada usuario lleva su casilla de correo para tener el listado a mano al enviar notificaciones por Outlook, sin escribir, copiar ni pegar. **Reemplaza** lo decidido el 16/11 con Ale ("los destinatarios del correo se escriben siempre a mano, sin agenda de contactos"): ahora se pueden elegir de una lista y seguir escribiendo a mano (clientes, proveedores). Las plantillas de correo siguen sin destinatarios.
- Columna nueva `usuarios.correo` (script `23_correo_usuarios_d1.txt`; siguen 26 tablas). Administración > Usuarios: campo "Correo" **obligatorio al crear**, editable, único (sin importar mayúsculas) y que no se puede vaciar una vez cargado; los usuarios de antes (y el primer administrador) quedan sin correo hasta que se cargue, y aparecen como "Sin correo cargado". Sin el script, crear usuarios sigue sin pedir correo y Administración lo avisa.
- Detalle de la alerta: "Elegir de la lista" en Para y CC del correo y en los destinatarios de "Confirmar envío" (buscador, equipos que suman o sacan a todos sus miembros, personas). Ruta `GET /api/alertas/<id>/correo/contactos` (sección 10). Un equipo solo aporta los correos de sus miembros que tienen correo; las personas desactivadas no aparecen.
- Probado: `correousuariostest.mjs` (nueva) y el resto de la batería con usuarios creados con correo; demo igual. Respaldo: `99_Archivo_viejo/worker_antes_parche68/`, ramas `respaldo-antes-parche-68` y `version-parche-68-correo-usuarios`.

**Campos unificados después de los parches 59 a 65 (18/11, parche 67; sin SQL, falta publicar)**

- Todos los selectores y campos de texto de las páginas (menos el login) tienen el mismo tamaño: 40 px de alto, letra de 15 px y esquinas de 3 px (Umbrales, feriados, Reglas de alerta y los filtros nuevos del Histórico estaban distintos). Los títulos de tarjeta de Operaciones pasan a 16 px. Solo páginas.
- Respaldo: `99_Archivo_viejo/worker_antes_parche67/`, ramas `respaldo-antes-parche-67` y `version-parche-67-campos-unificados`.

**Comparar con el estilo de Disponibilidad (18/11, parche 66; sin SQL, falta publicar)**

- La ventana "Comparar con otro período" usa el mismo estilo que la pestaña Disponibilidad: las tres tarjetas por período (Disponibilidad real, Tiempo sin servicio, Servicios que cumplen), barras verticales con una barra por período (actual sólido, comparado rayado) y la línea de Disponibilidad general con las dos curvas. Solo página.
- Sin textos explicativos en la ventana (ajuste del 18/11): no dice "Elegí con qué período…", ni avisa de distinta duración o de períodos superpuestos, ni "Ordenado de quien más empeoró…".
- Respaldo: `99_Archivo_viejo/worker_antes_parche66/`, ramas `respaldo-antes-parche-66` y `version-parche-66-comparar-estilo-disponibilidad`.

**Gráficos de Operaciones y de fallas (17/11, parche 65; sin SQL, falta publicar junto con el 64)**

- Operaciones > Alertas abiertas: tres gráficos en una línea (Alertas por estado, Problemas por cliente, Problemas por tipo de falla), sin selector; tocar una barra de cualquiera filtra la lista.
- Distribución de fallas: las tortas del parche 64 se reemplazan por filas que son barras (nombre a la izquierda; % y cantidad a la derecha), en el tablero y en Mis alertas.
- Respaldo: `99_Archivo_viejo/worker_antes_parche65/`, ramas `respaldo-antes-parche-65` y `version-parche-65-graficos-operaciones-y-fallas`.

**Ajustes visuales (17/11, parche 64; sin SQL, falta publicar)**

- Detalle: menos textos de ayuda, títulos de los diálogos con solo "problema · cliente", botón "Template correo", y en "Comunicar incidente" equipos y personas como desplegables.
- Disponibilidad: estados "Cumple / En riesgo / No cumple" y "Desvío vs. objetivo". Histórico: cliente y servicio separados y filtro por servicio. Operaciones: dos tarjetas, y el corte por cliente o tipo de falla solo cambia "Problemas activos". Distribución de fallas en tortas (reemplazadas por filas-barra en el parche 65). Pre-alertas con anillo de acierto y resultado por aviso.
- Respaldo: `99_Archivo_viejo/worker_antes_parche64/`, ramas `respaldo-antes-parche-64` y `version-parche-64-ajustes-visuales`.

**Equipos y listas de difusión en uno (17/11, parche 63; script 22 corrido y publicado el 17/11)**

- Las listas de difusión pasan a ser los **equipos**: cada persona del equipo tiene un rol para los comunicados (técnico, líder o informado) y el equipo puede ser general o de un cliente (`equipos.alcance_cliente_id`). Las alertas derivadas a un equipo solo le llegan a su gente de Soporte; los comunicados, a todos con su rol. "Comunicar incidente" elige equipos y también personas sueltas (como técnicos).
- Sin la pestaña "Listas de difusión". El Analista crea, modifica y elimina equipos y plantillas de correo. Un equipo se elimina solo si nunca tuvo alertas ni reglas de derivación; si no, se desactiva.
- Script `22_equipos_y_comunicados_d1.txt`: columnas `equipo_miembros.rol_comunicado` y `equipos.alcance_cliente_id`, y pasa las listas existentes a equipos (el JSON viejo queda de respaldo). Siguen 26 tablas. Primero el SQL, después el Worker.
- Respaldo: `99_Archivo_viejo/worker_antes_parche63/`, ramas `respaldo-antes-parche-63` y `version-parche-63-equipos-y-listas`.

**Operaciones e Histórico (17/11, parche 62; sin SQL, publicado el 17/11)**

- Operaciones > Alertas abiertas: dona "Alertas por estado" (tocar un estado filtra la lista) y al lado "Problemas activos" por cliente o tipo de falla, divididos por gravedad.
- Histórico: gravedad en su propia columna, filtros por cliente, gravedad y problema, y "Clientes con más problemas" con el mismo período y filtros del Histórico (sin Desde / Hasta propio).
- Respaldo: `99_Archivo_viejo/worker_antes_parche62/`, ramas `respaldo-antes-parche-62` y `version-parche-62-operaciones-e-historico`.

**Disponibilidad con tarjetas y barras (17/11, parche 61; sin SQL, publicado el 17/11)**

- La pestaña Disponibilidad arranca con 3 tarjetas (disponibilidad real contra el objetivo y la diferencia en puntos, tiempo sin servicio contra lo permitido, servicios y clientes que cumplen) y abajo, lado a lado, "Cumplimiento del objetivo" en barras verticales y "Disponibilidad general" (línea de evolución). Tocar una barra recalcula las tarjetas y la línea para ese grupo de clientes, con la misma cuenta que el servidor.
- Distribución de fallas muestra los 3 cortes juntos (cliente, tipo de falla, causa); en causa, solo las causas cargadas al resolver, y lo abierto, lo normalizado solo y lo resuelto sin causa se cuentan en una línea aparte. También en Mis alertas.
- Respaldo: `99_Archivo_viejo/worker_antes_parche61/`, ramas `respaldo-antes-parche-61` y `version-parche-61-disponibilidad-tarjetas`.

**Textos y detalles (17/11, parche 60; sin SQL, publicado el 17/11)**

- Primera tanda de ajustes de Ale: sin los textos explicativos del tablero, Administración, Mis alertas, asistente y Resolver; "Operación ahora" pasa a "Operaciones" y "De mis equipos" a "Equipos"; pre-alertas con frases profesionales y su resumen de 48 h en tarjetas; el botón del asistente dice "Derivar" (o la acción que sea); para el Analista, Disponibilidad es la última pestaña y el tablero arranca en Operaciones; "Mis alertas" en el menú de Comunicados y del detalle; "Fecha y hora" de la auditoría en un renglón.
- **Cambio de permisos:** Soporte (incluido el responsable de un equipo) ya no reasigna alertas: derivar y reasignar quedan para el Analista.
- Siguen: parche 61 (Disponibilidad: tarjetas de indicadores, barras con la disponibilidad del grupo, fallas en 3 gráficos, solo causas reales), 62 (Operaciones con torta por estado y barras por cliente, Histórico con filtros por cliente, criticidad y problema) y 63 (Equipos y listas de difusión unificados, con rol por persona; el Analista gestiona equipos y plantillas).
- Respaldo: `99_Archivo_viejo/worker_antes_parche60/`, ramas `respaldo-antes-parche-60` y `version-parche-60-textos-y-detalles`.

**Asistente: respuesta vacía con Gemma 4 (17/11, parche 59; sin SQL, publicado y probado el 17/11)**

- Con Gemma 4, "¿Qué está sin asignar y a quién lo derivo?" (Analista) daba "No pude armar una respuesta": el modelo gastaba todo el margen en su razonamiento interno (`reasoning_content`) y devolvía `content` vacío, también en el reintento.
- Ahora a Gemma 4 se le apaga el razonamiento (`chat_template_kwargs: { enable_thinking: false }`); si Workers AI rechazara el parámetro, se repite el pedido sin él. Si igual vuelve vacía, las preguntas sugeridas "sin asignar" y "más tiempo abiertas" las contesta el servidor con los datos (lista de alertas y los botones Derivar, o el aviso de que faltan personas o equipos de Soporte).
- **Probado en Cloudflare (17/11, Ale, Analista):** la respuesta la escribió Gemma (no el respaldo del servidor), con las 3 alertas sin asignar y los 3 botones Derivar a Soporte1. O sea, Cloudflare acepta `enable_thinking = false`.
- Respaldo: `99_Archivo_viejo/worker_antes_parche59/`, ramas `respaldo-antes-parche-59` y `version-parche-59-asistente-sin-razonamiento`.

**Un solo tema y un solo campo de fecha (17/11, parche 58; sin SQL, publicado el 17/11 con el 59)**

- Un único campo de fecha (`dd/mm/aaaa`, con calendario, que solo aplica con la fecha completa y válida) en el tablero (Disponibilidad, Comparar, Histórico, Clientes con más problemas) y en Administración (auditoría, feriados, eventos comerciales). Tema unificado en todas las páginas: esquinas de 4 px en cajas y 3 px en campos y etiquetas, selectores y campos de 40 px, títulos con el mismo grosor y etiquetas de estado como lozenge. Solo páginas.
- Respaldo: `99_Archivo_viejo/worker_antes_parche58/`, ramas `respaldo-antes-parche-58` y `version-parche-58-tema-y-fechas`.

**Pestañas del tablero y nuevo orden (17/11, parche 57; sin SQL, publicado el 17/11)**

- El tablero se agrupa en tres pestañas con el resumen de arriba fijo: **Disponibilidad** (con la Distribución de fallas), **Operación ahora** (Estado por cliente, Últimas 24 horas, Alertas abiertas y Pre-alertas, con el número de abiertas) e **Histórico** (Histórico de alertas, Tiempo de resolución y Clientes con más problemas). Nuevo orden pedido: Disponibilidad, tarjetas de Estado por cliente, Últimas 24 horas. Solo página.
- Respaldo: `99_Archivo_viejo/worker_antes_parche57/`, ramas `respaldo-antes-parche-57` y `version-parche-57-pestanas-tablero`.

**Período con Desde / Hasta y comparación (17/11, parche 56; sin SQL, publicado el 17/11)**

- "Disponibilidad y resumen del período" se elige con dos campos de fecha (Desde y Hasta) en lugar de Día / Semana / Mes con ‹ ›: `GET /api/tablero/periodo?desde=&hasta=` (hasta 366 días; el período anterior es otro de la misma duración). Las barras de clientes son más altas, con flecha, y las letras de la sección más grandes.
- **"Comparar con otro período"**: ventana con las dos disponibilidades lado a lado, la diferencia, las dos líneas de evolución superpuestas y una tabla por cliente (quién mejoró y quién empeoró). El segundo período se pide con `&liviano=1` (sin incidentes ni período anterior).
- Respaldo: `99_Archivo_viejo/worker_antes_parche56/`, ramas `respaldo-antes-parche-56` y `version-parche-56-periodo-desde-hasta`.

**Parche 55 (17/11; sin SQL, publicado el 17/11 con el 59)**

- Asistente: Gemma 4 por defecto en el código, tope de 100 preguntas por día, botones "Derivar" armados por el servidor en "¿Qué está sin asignar y a quién lo derivo?" (hasta 3, a la persona de Soporte con menos problemas abiertos) y pregunta nueva "¿Qué alertas llevan más tiempo abiertas?" (Analista y Administrador).
- Marca roja "Abierta hace N h/días" en Seguimiento y en el tablero cuando una alerta lleva más de 24 h abierta.
- Origen: reunión del 12/11 con Hugo (herramienta GPI): un incidente con 231 horas abierto, planilla contra tickets de InvGate que no coinciden, y disponibilidad ponderada por tipo de impacto (0,75 total, 0,50 parcial, 0,25 degradación, por coeficiente de clientes afectados): **eso último queda pendiente de que Hugo confirme** (sección 18).
- Respaldo: `99_Archivo_viejo/worker_antes_parche55/`, ramas `respaldo-antes-parche-55` y `version-parche-55-asistente-y-abiertas-largas`.

**Asistente: cambio de modelo de IA (16/11, parche 54; sin SQL, falta publicar)**

- Cloudflare da de baja el **20/11/2026** el modelo del asistente (`@cf/qwen/qwen3-30b-a3b-fp8`); después responde 410 y el asistente falla. El de fábrica pasa a `@cf/qwen/qwen3.8-27b` (misma familia, el reemplazo "chico" que sugiere Cloudflare; alternativa `@cf/google/gemma-4-26b-a4b-it`).
- Si la variable `ASISTENTE_MODELO` apunta a un modelo dado de baja, el Worker la ignora y usa el de fábrica (`asistNombreModelo`, lista `ASISTENTE_MODELOS_BAJA`).
- **54b/54c (17/11, publicados):** respuesta vacía del modelo → un reintento con el triple de tokens y registro del detalle. **Probado con Gemma 4** (`@cf/google/gemma-4-26b-a4b-it`, variable `ASISTENTE_MODELO`): responde bien con el Analista, unas 60-80 neuronas por pregunta (Qwen3.8 cuesta ~9 veces más que el modelo viejo, Gemma ~2 veces en entrada y casi igual en salida).
- **Pendiente:** default del código a Gemma; botón "Derivar" armado por el servidor en la pregunta de sin asignar (hoy depende de que el modelo pida la herramienta y Gemma no lo hizo); `ASISTENTE_POR_DIA` a 100; probar los otros perfiles.
- Respaldo: `99_Archivo_viejo/worker_antes_parche54/`, ramas `respaldo-antes-parche-54` y `version-parche-54-modelo-asistente`.

**Jira real, proyecto KAN (16/11, parche 53; sin SQL)**

- `crearTicketJira` crea el issue en Jira Cloud (`POST /rest/api/3/issue`). Por defecto el sitio es `https://monitoreo-helios.atlassian.net` y el proyecto **KAN**. Se prende con `TICKETS_JIRA = real` y los secretos `JIRA_USUARIO` (mail de Atlassian) y `JIRA_TOKEN`. Opcionales: `JIRA_URL`, `JIRA_PROYECTO` y `JIRA_TIPO` (por defecto `Task`; en un proyecto en español, `Tarea`). Los tokens no van en el código ni en Git.
- No manda el campo prioridad de Jira. P1–P4 va en la descripción (formato de Jira, con el enlace a la alerta tocable y «Lo pidió en Helios») y como etiqueta, junto con `helios` y el tipo de alerta. Si el proyecto no tiene etiquetas, reintenta una vez sin ellas. Hasta 2 llamados por ticket.
- Si Jira falla, "Generar ticket" muestra un mensaje claro (token rechazado, sin permiso, proyecto no encontrado, tipo inválido, tiempo agotado) y no guarda nada. La clave y la url (`/browse/KAN-7`) quedan en `tickets_alerta` como reales. InvGate sigue simulado. No hay webhook de vuelta.
- Une la rama `version-parche-49-conexion-jira` con el armado de la carpeta del equipo. El número 51 ya era el gráfico de tendencia, así que este queda como 53. Sin `patch53.py`: el build ya mete `tickets_integracion.js` con el parche 41.
- Probado: `jiratest.mjs` (25 controles, fetch de mentira) e `integraciontest.mjs`. Respaldo: `99_Archivo_viejo/worker_antes_parche53/`, ramas `respaldo-antes-parche-53` y `version-parche-53-conexion-jira`.

**Tickets a demanda en InvGate o Jira (16/11, parche 41; script 19, falta publicar)**

- Pedido de Ale: "veo un evento, lo gestiono, mando un push, cargo el mail, **tildo que genere un ticket** (a demanda, no sale solo) y el ticket se suma al mail y al push". La integración con InvGate y Jira la arma el mismo equipo dentro de esta demo.
- **"Generar ticket"** en el detalle de la alerta (Analista; Soporte en lo suyo o de su equipo; abierta o resuelta): se elige **InvGate o Jira** y Helios arma el resumen (`[P2 · Importante] CLI_004 · servicio: problema`) y la descripción (qué pasa, cliente, servicio, desde, gravedad, medición, estado, enlace), editables. Uno por herramienta y por problema.
- En **"Template correo alerta"**: si la alerta tiene ticket, el número va solo al asunto (`[INV-1001] …`) y al texto (variable nueva `{ticket}` en las plantillas o, si la plantilla no la trae, una línea "Ticket: …"); y la casilla **"Generar ticket ahora en [InvGate / Jira]"** lo genera en el momento y lo suma al correo.
- El ticket se ve en "Datos de la alerta" (con enlace si la herramienta lo devuelve, y su estado) y en la conversación ("Generó el ticket INV-1001 en InvGate"); avisa a quien tiene la alerta y a quien la derivó; auditoría `GENERAR_TICKET`.
- **Punto de enganche para la integración:** `07_Codigo_fuente/worker/tickets_integracion.js`. **Jira ya crea el issue** en el proyecto KAN (parche 53): hace falta `TICKETS_JIRA = real` y los secretos. `crearTicketInvgate` sigue sin completar. `rutasTicketsIntegracion` (webhooks) y `novedadTicket` quedan para los cambios de estado. Sin la variable de cada herramienta, **simulado** (`INV-1001`, `HEL-101`). Guía: `05_Documentacion/integracion_tickets.md`.
- Tabla nueva **`tickets_alerta`** (script `19_tickets_d1.txt`; quedan **24 tablas**): `alerta_id`, `sistema` (`INVGATE`/`JIRA`), `clave` (única por herramienta), `url`, `estado`, `simulado`, `resumen`, `descripcion`, `creado_por`, `creado`, `actualizado`. Ruta `POST /api/alertas/{id}/ticket` (body `{sistema, resumen, descripcion, prioridad}`); el detalle trae `tickets` y `tickets_sistemas`. "Preparar demo" borra los tickets de Helios. Sin el script, "Generar ticket" avisa (503) y el resto anda igual.
- Corrige además el botón "Template correo alerta «…»" del parche 40, que en el celular se salía de la pantalla.
- **Para publicar:** scripts 18 y 19 → Worker (trae los parches 39, 40 y 41).
- Probado: `integraciontest.mjs` (31 controles, con una integración de mentira para el modo real y su webhook), la demo y todas las pruebas iguales; pantallas en PC y celular. Respaldo: `99_Archivo_viejo/worker_antes_parche41/`, ramas `respaldo-antes-parche-41` y `version-parche-41-tickets-invgate-jira`.
- **Sigue (parche 42):** "Comunicar incidente" por push con listas de difusión (informados, técnicos con ACK y respuesta, líderes que suman información), con el ticket incluido.

**"Comunicar incidente" sin el resumen de destinatarios (16/11, parche 47; sin SQL, falta publicar)**

- Pedido de Ale: el diálogo ya no muestra "Le llega a hasta N personas (…)". **Decidido también:** los destinatarios del correo se escriben siempre a mano (Para y CC libres); no hay destinatarios sugeridos ni agenda de contactos, y las listas de difusión son solo para el push, no para el correo. Solo la página del detalle; se publica junto con el 46. Respaldo: `99_Archivo_viejo/worker_antes_parche47/`, ramas `respaldo-antes-parche-47` y `version-parche-47-comunicar-sin-resumen`.

**Comunicar incidente por push (16/11, parche 46; script 21, falta publicar)**

- Pedido de Ale: "veo un evento, lo gestiono, mando un push 'Tenemos este incidente', cargo el mail, tildo que genere un ticket y el ticket se suma al mail y al push", con tres tipos de destinatarios: **todos** (solo se enteran, por su atención a los clientes), **técnicos** (dan ACK y responden) y **líderes / dueños de negocio** (responden sumando algo).
- **Perfil nuevo "Solo comunicados"** (`COMUNICADOS`): para quien hoy no usa Helios (por ejemplo, atención al cliente). Entra a `/comunicados` y no ve nada más (sin tablero, alertas, asistente). Se guarda como `usuarios.solo_comunicados = 1` con `perfil = 'GERENTE'` (la columna `perfil` tiene un CHECK que D1 no deja cambiar sin rehacer la tabla de usuarios); Helios lo lee como perfil `COMUNICADOS` en la sesión y en Administración.
- **Listas de difusión** (Administración > "Listas de difusión", solo Administrador, permiso `admin_listas`): nombre, **general o de un cliente** (las del cliente se proponen primero), y cada persona con su rol: **informado** (solo lee), **técnico** (Recibido y responde), **líder** (responde). JSON en `alerta_parametros.listas_difusion`. Pueden estar Analistas, Soporte, Gerentes y "Solo comunicados". Auditoría `ALTA/EDITAR/BORRAR_LISTA_DIFUSION`.
- **"Comunicar incidente"** en el detalle de la alerta (Analista; Soporte en lo suyo o de su equipo; `POST /api/alertas/{id}/comunicar` con `{listas, mensaje}`): mensaje armado (qué pasa, cliente, servicio, desde, gravedad, prioridad, **ticket**) y editable, con la casilla "Generar ticket ahora en InvGate / Jira". Cada persona una vez, con el rol que más puede; hasta 100 personas. Aviso en la campanita (tipo `COMUNICADO_<ROL>`, `alerta_id = 'c' + número`) y push.
- **Push con botones:** técnicos "Recibido" (se registra desde el aviso sin abrir Helios: `POST /api/comunicados/{id}/recibido`) y "Responder"; líderes "Responder" (abre `/comunicado/{id}` listo para escribir); informados sin botones. En iPhone y algunos navegadores el aviso no muestra botones: se abre el comunicado y ahí están.
- **Página `/comunicados` y `/comunicado/{id}`** (Gerente, Analista, Soporte y "Solo comunicados"; permiso `comunicados`): lista de lo que llegó, mensaje, datos y ticket, respuestas y a quiénes les llegó (quién lo vio y quién dio Recibido). Enlace "Comunicados" en el menú del usuario.
- **Vuelve a la conversación de la alerta:** "Comunicó el incidente (comunicado N) a … (X personas)" con "Recibido: 2 de 3 técnicos · Lo vieron 5 de 8" y cada respuesta ("Respondió al comunicado N como líder: …"); a quien comunicó y a quien tiene la alerta les llega un aviso con cada respuesta. Auditoría `COMUNICAR_INCIDENTE`, `RESPONDER_COMUNICADO`.
- **Cambios de permisos:** el **Gerente ahora tiene campanita y push** (solo le llegan comunicados: puede ser líder en una lista). `avisos` suma Gerente y "Solo comunicados"; permiso nuevo `comunicados`.
- **Corrección:** el push de los avisos de una alerta ahora abre su detalle (`/alerta/{id}`), como estaba previsto desde el parche 30: la consulta de los push no traía `alerta_id`.
- Datos: script **`21_comunicados_d1.txt`** (columnas `usuarios.solo_comunicados` y `alerta_parametros.listas_difusion`, tablas `comunicados_incidente` y `comunicado_destinatarios`; quedan **26 tablas**). Sin el script, todo anda igual: no deja crear "Solo comunicados", ni guardar listas, ni comunicar (avisa qué falta).
- Probado: `comunicadostest.mjs` (58 controles, incluido sin el script 21), la demo y todas las pruebas (`avtest`, `perftest` y `pushtest` actualizadas al Gerente con campanita y al push que abre el detalle); pantallas en PC y celular. Guía: `05_Documentacion/novedades_comunicados.md`. Respaldo: `99_Archivo_viejo/worker_antes_parche46/`, ramas `respaldo-antes-parche-46` y `version-parche-46-comunicar-incidente`.
- **Para publicar:** scripts 18, 19, 20 y 21 → Worker (trae los parches 39 a 46).

**Evolución por ventana (16/11, parche 52; sin SQL, falta publicar)**

- La tendencia del desplegable de cada cliente pasa a ser la disponibilidad **acumulada desde el inicio del período**, un punto por ventana de 15 minutos (Día), por hora (Semana) o por día (Mes); el paso se adapta a lo que hay medido (hasta día y medio de datos, siempre por ventana). El último punto es el número grande de arriba. Antes (parche 51) pedía varios días de datos y en la demo no aparecía. `GET /api/tablero/periodo` trae `tendencia: {inicio_utc, paso_minutos, pt}` por cliente y global.
- Respaldo: `99_Archivo_viejo/worker_antes_parche52/`, ramas `respaldo-antes-parche-52` y `version-parche-52-evolucion-por-ventana`.

**Tendencia por cliente (16/11, parche 51; sin SQL, publicado el 16/11)**

- (Reemplazado por el parche 52.) En el desplegable de disponibilidad de cada cliente hay un gráfico lineal: la disponibilidad de cada uno de los últimos 30 días (terminan en el período elegido o en hoy), el objetivo punteado y un punto por día con el color del semáforo; abajo, cuántos días cumplió y cuál fue el peor. `GET /api/tablero/periodo` trae `tendencia` por cliente y global.
- **Arreglo:** "desde cuándo se mide" cada servicio salía de `series_estado` (solo las últimas 25 h), así que con datos reales la semana y el mes se habrían medido solo desde ayer. Ahora sale de la primera ventana recibida dentro del rango mirado (una consulta por servicio, por el índice de `ventana_inicio`).
- Respaldo: `99_Archivo_viejo/worker_antes_parche51/`, ramas `respaldo-antes-parche-51` y `version-parche-51-tendencia-disponibilidad`.

**Disponibilidad más clara (16/11, parche 50; sin SQL, publicado el 16/11)**

- El texto largo de cómo se mide la disponibilidad se reemplaza por una línea: `Cuenta como sin servicio: alerta Grave = 100 % · Importante = 50 % · Leve = 0 %` (valores configurados).
- **Corrección del semáforo y la barra:** antes el tiempo sin servicio se comparaba contra el margen de errores de **todo el mes** (por eso un día con 96 % de disponibilidad salía verde con un objetivo de 99,9 %). Ahora se compara la disponibilidad del período elegido (día, semana o mes) con el objetivo: `minutos_permitidos = (1 − objetivo) × minutos medidos`, `consumo = (1 − disponibilidad) / (1 − objetivo)`. Verde: llega al objetivo. Amarillo: no llega pero tuvo hasta `umbral_amarillo` veces (1,5 por defecto, editable) el tiempo sin servicio que permite el objetivo. Rojo: más. Para un mes completo da lo mismo que antes; para un día, una semana o un mes a medias es más exigente.
- La barra llega hasta el límite del amarillo y tiene una marca en lo que permite el objetivo; el texto dice cuántos minutos estuvo sin servicio contra cuántos permite el objetivo. Reemplaza lo que decían los parches 45 y 48 sobre el margen del mes.
- Respaldo: `99_Archivo_viejo/worker_antes_parche50/`, ramas `respaldo-antes-parche-50` y `version-parche-50-disponibilidad-clara`.

**Ajustes del dashboard gerencial (16/11, parche 48; sin SQL, publicado el 16/11)**

- Filtro por estado en las alertas abiertas; la disponibilidad pasa debajo de "Estado por cliente" (sin los recuadros de problemas, graves, abiertos y tiempo de resolución); semáforo verde / amarillo / rojo por cliente y servicio (verde: cumple; amarillo: no cumple pero está cerca, hasta 1,5 veces lo que permite el objetivo, editable en "Cómo se mide la disponibilidad"; rojo: más; desde el parche 50 se mide contra el objetivo del período, no contra el margen del mes) y resumen de clientes en barras horizontales cuyos grupos se despliegan al tocarlos. Los estados (`estado`: `verde` / `amarillo` / `rojo`) y `config_disponibilidad.umbral_amarillo` salen de `GET /api/tablero/periodo`; `POST /api/admin/umbrales/disponibilidad` acepta `umbral_amarillo` (1 a 10, fracciones del margen; si no viene se conserva).
- Respaldo: `99_Archivo_viejo/worker_antes_parche48/`, ramas `respaldo-antes-parche-48` y `version-parche-48-ajustes-dashboard`.

**Dashboard gerencial (16/11, parches 42 a 45; script 20, falta publicar)**

- **Gerente y Administrador ven lo activo y el detalle, en solo lectura** (parche 42): la lista de alertas con su estado y quién las tiene, las pre-alertas y la página de cada alerta con la conversación y la evidencia, sin ningún botón de acción (el servidor rechaza todo lo que cambia algo). Pedido de Hugo: un dueño no podía transferir y el gerente no tenía forma de ver si alguien ya lo estaba trabajando. El tablero se actualiza solo cada 2 minutos con la pestaña visible (marcador `GET /api/tablero/version`). El asistente suma "¿Qué incidentes están activos y quién los está trabajando?".
- **Incidentes activos ahora** (parche 43): barras por cliente o por tipo de falla, por gravedad; tocar una barra filtra la lista.
- **Resumen por período** (parche 44): Día / Semana / Mes con ‹ › y "Volver a hoy" (`GET /api/tablero/periodo`); KPIs y Distribución de fallas del período (reemplaza a hoy / 7 / 30 días).
- **Disponibilidad mensual** (parche 45): se mide en ventanas de 15 minutos de cada servicio (Grave 100 %, Importante 50 %, Leve 0 %; editable) y se promedia por cliente según la criticidad (Alta 3, Media 2, Baja 1; editable). Objetivo mensual por defecto **99,9 %** (43,2 minutos por mes), configurable con decimales por general, cliente o servicio (Administración > Umbrales, grupo "5 · Disponibilidad mensual" y "Cómo se mide la disponibilidad"). Se muestra la disponibilidad, cuánto tiempo estuvo sin servicio contra lo que permite el objetivo (parche 50; antes, contra el margen del mes), la comparación con el período anterior y el detalle por servicio. Script `20_disponibilidad_d1.txt` (dos columnas y el objetivo general; siguen 24 tablas). Primero el SQL, después el Worker.
- Probado: `gerentetest`, `periodotest`, `disponibilidadtest` y todas las anteriores; la demo da lo mismo. Respaldo: `99_Archivo_viejo/worker_antes_parche42/`, ramas `respaldo-antes-parche-42` y `version-parche-42-dashboard-gerencial`.

**Plantillas de correo y ajustes al correo (16/11, parche 40; script 18, falta publicar)**

- **Nombre:** el botón del detalle (y el título del diálogo) ahora dice **"Template correo alerta «<problema> · <cliente>»"**; se sacó el texto explicativo del diálogo.
- **Destinatarios reales:** "Confirmar envío" pide a quién se envió (Para obligatorio, CC opcional), precargado con lo que se escribió al armar el correo y editable. Queda en la conversación: `Envió el correo «asunto» sin cambios para a@x (copia a b@y)` (o `con cambios para …` con el texto final).
- **Plantillas de correo** (Administración > "Plantillas de correo", solo Administrador; permiso `admin_plantillas`): nombre, **sector** al que se escala (Mesa de ayuda, Proveedor, Cliente, Comercial…), **tipos de alerta** (ninguno = todas), para alertas **abiertas, resueltas o las dos**, asunto y texto con variables entre llaves (`{alerta}`, `{problema}`, `{cliente}`, `{servicio}`, `{ambiente}`, `{desde}`, `{duracion}`, `{gravedad}`, `{prioridad}`, `{etiqueta}`, `{medicion}`, `{estado}`, `{responsable}`, `{equipo}`, `{ultima_novedad}`, `{resolucion}`, `{enlace}`, `{firma}`). Una línea con una variable vacía no se escribe (por ejemplo, "Cómo se resolvió" en una alerta abierta). El diálogo tiene un ejemplo en vivo con una alerta de muestra. Los **destinatarios no van en la plantilla**: los pone quien envía (decidido con Ale).
- **6 plantillas de fábrica** (no había un modelo real): General (Interno), Aviso al cliente, Escalar a proveedor o gateway (errores, rechazos, aprobaciones, lentitud, sin aprobaciones), Caída: escalar a Mesa de ayuda (tráfico bajo, sin aprobaciones, dejaron de llegar datos), Aviso a Comercial (tráfico e importe fuera de lo normal) y Cierre del incidente (solo resueltas).
- En el correo, el selector "Plantilla" muestra solo las que sirven para esa alerta, primero las de su tipo; cambiar de plantilla pide confirmación si ya se había editado el texto. En la conversación queda qué plantilla se usó.
- Datos: `alerta_parametros.plantillas_correo` (JSON `{plantillas:[…]}`), **script `18_plantillas_correo_d1.txt`** (una columna; siguen 23 tablas). Sin el script se usan las de fábrica y Administración avisa que falta para poder guardar. Rutas: `GET/POST /api/admin/plantillas-correo`, `POST /api/admin/plantillas-correo/borrar`; el detalle de la alerta trae `plantillas_correo` (las activas). Auditoría `ALTA_PLANTILLA_CORREO`, `EDITAR_PLANTILLA_CORREO`, `BORRAR_PLANTILLA_CORREO`.
- **Para publicar:** script 18 → Worker (incluye el parche 39).
- Probado: `correotest.mjs` (57 controles), la demo y todas las pruebas iguales; pantallas en PC y celular. Respaldo: `99_Archivo_viejo/worker_antes_parche40/`, ramas `respaldo-antes-parche-40` y `version-parche-40-plantillas-correo`.

**Correo desde la alerta (16/11, parche 39; sin SQL, falta publicar; ajustado en el 40)**

- En el detalle de una alerta (`/alerta/<id>`), botón **"Preparar correo"** para Analista y Soporte (Soporte solo en lo suyo o de su equipo), con la alerta abierta o resuelta. El diálogo trae el asunto y el texto ya armados con los datos de la alerta (qué pasa, cliente, servicio, desde cuándo, cuánto lleva, gravedad y prioridad, última medición contra lo esperado, estado y quién la tiene —o cómo se resolvió—, última novedad y el enlace a Helios) y lugares "[Completar: …]". Se completan Para y CC y se abre con **"Abrir en Outlook web"** (Microsoft 365, `outlook.office.com/mail/deeplink/compose`) o **"Outlook de escritorio"** (`mailto:`); también "Copiar texto". Si el texto es demasiado largo para el enlace, el correo se abre sin el texto y el texto queda copiado para pegarlo.
- **Helios no manda correos ni se conecta a Microsoft 365** (no hace falta registrar nada en Azure). Por eso, al abrirlo queda en la conversación "preparó un correo" (asunto, destinatarios y el texto armado, desplegable) con **"Falta confirmar si se envió"** y el botón **"Confirmar envío"**: *se envió tal cual*, *se envió con cambios* (se pega el texto final, que queda guardado) o *no se envió*.
- Rutas nuevas: `POST /api/alertas/{id}/correo` (body `{asunto, para, cc, texto}`) y `POST /api/alertas/{id}/correo/envio` (body `{evento_id, resultado: SIN_CAMBIOS | CON_CAMBIOS | NO_ENVIADO, texto?}`). Se guardan como comentarios en `alerta_eventos` (`Preparó un correo «asunto» para …`, `Envió el correo «asunto» sin cambios` / `con cambios`, `No envió el correo «asunto»`; el texto va después de una línea `---`) y en la auditoría (`PREPARAR_CORREO`, `CONFIRMAR_CORREO`). No genera avisos. Sin tablas ni columnas nuevas.
- Próximos pasos acordados: **plantillas de correo** por tipo de incidente o sector, con destinatarios conocidos (punto 2), y evaluar la **War Room en Teams** (punto 3). Más adelante, si IT lo aprueba, Microsoft Graph para crear el borrador directamente en el buzón (con formato y adjuntos).
- Probado: `correotest.mjs` (35 controles: permisos por perfil, direcciones mal escritas, repetidos, texto largo, confirmaciones, mismo asunto dos veces, alerta resuelta), la demo y todas las pruebas anteriores iguales; pantallas en claro, oscuro y celular. Respaldo: `99_Archivo_viejo/worker_antes_parche39/`, ramas `respaldo-antes-parche-39` y `version-parche-39-correo-desde-alerta`.

**Limpieza de tablas: etapa 3b (16/11, parche 38; publicado: scripts 16 y 17 corridos y Worker)**

- **De 25 a 23 tablas, mismo comportamiento.** `alerta_reglas` + `alerta_reglas_personalizadas` pasan a `reglas_alerta` (columna `tipo` SISTEMA / PERSONALIZADA; las personalizadas conservan su id, las del sistema llevan ids negativos para que las nuevas sigan numerándose desde donde iban) y `tablero_cache` pasa a las columnas `tablero_revision` y `tablero_calculado` de `alerta_parametros`.
- **Cómo se aplica:** script `16_reglas_y_cache_d1.txt` (crea lo nuevo y copia, no borra nada) → publicar el Worker → comprobar → script `17_borrar_tablas_viejas_d1.txt` (borra las 3 viejas). Hasta el 17 se puede volver al Worker anterior. **Regla del Worker:** como siempre, primero el SQL, después el Worker.
- **Cuidado al tocar reglas:** el motor recorre las reglas del sistema con `tipo = 'SISTEMA'`; las ediciones y lecturas por id de una personalizada filtran `tipo = 'PERSONALIZADA'` (así no se puede editar una del sistema por su id); "Preparar demo" reactiva solo las del sistema.
- Probado con `migtest.mjs`: la demo corre en dos bases con el esquema viejo (Worker anterior); en una se aplican los scripts 16 y 17 a mitad de camino y sigue con el Worker nuevo. Las 19 escenas dan lo mismo (alertas, pre-alertas, series, avisos, pantalla de reglas), incluidas 3 reglas personalizadas, una personalizada apagada y una del sistema apagada. También: ids conservados, repetir el 16 no duplica, el caché copiado, la nueva personalizada sigue la numeración, "Preparar demo" no reactiva las personalizadas. Necesita `pruebas/w_anterior.mjs` (el Worker publicado antes del parche 38; no se sube a Git). Respaldo: `99_Archivo_viejo/worker_antes_parche38/`, ramas `respaldo-antes-parche-38` y `version-parche-38-limpieza-tablas`.

**Revisión incremental: etapa 3 (16/11, parche 37; script 15 corrido y publicado el 16/11)**

- Cada revisión mira **solo lo que llegó desde la anterior**, en vez de las últimas 24 h. Marca de agua `alerta_parametros.revisado_hasta` (hasta qué hora se revisó; se relee con 2 minutos de solape) e índice nuevo `ix_observadas_recepcion` sobre `core_metricas_observadas.fecha_recepcion` (no cambia columnas). Script `15_revision_incremental_d1.txt`; siguen 25 tablas.
- Qué mira: reglas del sistema, solo las ventanas de los datos nuevos; "dejaron de llegar datos", las ventanas desde 2,5 h antes de la marca (la gracia llega a 120 min); reglas personalizadas, desde 4 h antes; cierre por normalización, solo series con datos nuevos; cierre por "desaparecida", solo en ventanas que recibieron datos nuevos (dato corregido, o dato tardío que cierra un "dejaron de llegar datos"). El caché del tablero (series y pre-alertas) se actualiza en la misma revisión: el tablero ya no recalcula al abrirse.
- **Revisión completa** (como antes) si no hay marca, si el reloj volvió atrás (Preparar demo), si pasaron más de 24 h, si falta el script 15 y con **"Recalcular 24 h"** (Administración > Umbrales, solo Administrador, `POST /api/admin/recalcular`, auditoría `RECALCULAR_24H`). Un cambio de umbrales, reglas o feriados vale para lo que llegue después; hacia atrás, con ese botón.
- `CERRAR_NORMALIZADAS` ahora usa el índice de la serie (antes recorría toda su historia).
- Probado con `inctest.mjs`: la demo de 19 escenas en incremental y en completa da lo mismo en cada escena (alertas, pre-alertas, series, avisos e incidentes). Cada revisión de la demo miró 13 datos contra hasta 247. Respaldo: `99_Archivo_viejo/worker_antes_parche37/`, ramas `respaldo-antes-parche-37` y `version-parche-37-revision-incremental`.

**Distribución de fallas (16/11, parche 36; publicado el 16/11)**

- Nueva sección "Distribución de fallas": qué porcentaje de los problemas corresponde a cada **cliente**, **tipo de falla** o **causa** (la elegida al resolver; si no hay: "Todavía abierto", "Se normalizó solo" o "Resuelto sin causa cargada"), en **hoy, 7 días o 30 días**. Lista ordenada con barra de un solo color, porcentaje y cantidad, y el detalle (graves, abiertos, minutos) al pasar el mouse. No cuenta avisos informativos ni clientes nuevos sin historia; cada problema cuenta una vez.
- Dónde: **tablero** (Analista, **Gerente** —la vista para un directivo— y Administrador; todos los clientes) y **Mis alertas** (Soporte; solo lo asignado a su usuario o a sus equipos).
- Datos: `Q_INCIDENTES_30D` suma `causa_resolucion`; `/api/mis-alertas` suma `incidentes` (30 días por el índice de `ventana_inicio`, solo lo propio). La página calcula los porcentajes: no hay consultas nuevas en el tablero.
- Se pidió como "torta": se hizo con barras porque con 8 clientes las porciones no se distinguen y los colores cambiarían de cliente al cambiar de período.

**Leyenda de colores en la conversación del detalle (14/11, parche 35; publicado el 16/11)**

- Al lado del título "Conversación" se explica qué significa cada punto: gris = movimiento (derivar, tomar, devolver, reasignar, borrar un archivo), verde azulado = comentario, azul = archivo, verde = resolución. El color depende del tipo de movimiento, no de quién lo hizo.

**Sin botón "Revisar alertas ahora" (14/11, parche 34; publicado el 16/11)**

- Se sacó el botón de la barra del tablero (Administrador y Analista). Cada revisión recorre hoy las últimas 24 h (~6.500 filas): el botón multiplicaba lecturas sin hacer falta, porque cada escena de la demo ya revisa sola y en producción revisará el cron o la llegada de datos. La ruta `POST /api/procesar` solo existe con `PERMITIR_REVISION_MANUAL = '1'` (pruebas de la PC); `GET /procesar` ya no existe. Un cambio de umbrales o reglas se aplica en la próxima revisión (escena o cron). **Pendiente (etapa 3):** revisión incremental, que mire solo la ventana nueva.

**"Ver detalle" en las alertas resueltas (14/11, parche 33; publicado el 16/11)**

- El Analista puede ver cómo se resolvió una alerta (conversación, evidencia, causa y qué se hizo): botón "Ver detalle" en Seguimiento > "Resueltas en las últimas 24 horas" y en Tablero > "Histórico de Alertas". Solo aparece para quien tiene el detalle (Analista y Soporte). `Q_INCIDENTES_30D` trae además `alerta_id` (una ventana del problema) para armar el enlace.

**Recuadro "Urgente" del tablero con el estado real (14/11, parche 32; publicado el 16/11)**

- Arriba del tablero, el problema más urgente decía "Sin asignar" si nadie había tomado la alerta, aunque estuviera asignada (por ejemplo, a soporte1). Ahora muestra lo mismo que la lista: "En curso: X", "Asignada a X (equipo Y), sin tomar", "Asignada al equipo Y, sin tomar", "Devuelta al analista" o "Sin asignar".

**Tono profesional y Umbrales explicado (14/11, parche 31; sin SQL, publicado el 14/11 junto con el 30)**

- La app ya no nombra a la persona con "vos" ni "tuyo": "Resuelta por Sol Porte" (antes "La resolvió vos"), "En curso: Sol Porte", "Asignada a Sol Porte", "(sesión actual)" en las listas, "alertas asignadas" en el menú, sin "Hola, Sol.". Las indicaciones siguen en rioplatense ("Elegí", "Tocá"). Mensajes del servidor: "asignada a tu usuario" en vez de "asignada a vos". **Regla para lo que venga:** no usar "vos"/"tuyo" para referirse a quien usa la app.
- Umbrales: recuadro "Cómo decide Helios" en 4 pasos en la pestaña y en el diálogo; grupos del diálogo numerados en ese orden (1 Sensibilidad, 2 Llegada de datos y feriados, 3 Gravedad, 4 Importancia); cada campo con "↑ Si lo subís: … ↓ Si lo bajás: …"; tarjetas de la pestaña en frases simples y numeradas.

**Ticketera: detalle de cada alerta, evidencia y resolución con causa (14/11, parche 30; publicado el 14/11)**

- Página nueva **`/alerta/<id>`** (Soporte y Analista; permiso `detalle_alerta`): conversación completa con la evidencia intercalada, datos, ventanas con problema y las acciones de siempre. Se llega desde Mis alertas ("Ver detalle" y el título), Seguimiento ("Ver detalle"), el tablero ("Detalle") y los avisos (campanita y push llevan directo a la alerta). Resolver, en esas tres pantallas, abre el detalle con el diálogo nuevo.
- **Evidencia** en la tabla nueva `evidencia_archivos` de D1 (script `14_evidencia_d1.txt`), porque R2 pide tarjeta: cada archivo en texto base64 partido en filas de 90.000 caracteres (base64 y no BLOB porque D1 devuelve los BLOB como lista de números y leerlos se pasa de los 10 ms de CPU). Hasta 1 MB por archivo (las capturas se achican solas en el navegador), 15 por alerta y 200 MB en total; lista cerrada de tipos (sin HTML ni SVG), siempre privados. El mismo código usa R2 si algún día se conecta el binding `EVIDENCIA` (hasta 10 MB). En el historial queda el comentario "Adjuntó el archivo «…»".
- **Resolver con causa:** "¿Qué lo causó?" y "¿Qué se hizo?" con un clic (propuesta de Ale), detalle opcional si se eligieron las dos. Se guarda en `alertas_historico.causa_resolucion` y `acciones_resolucion` (en todas las ventanas del problema, como `resuelta_por`) y también como texto armado en `comentario` ("Causa: … Se hizo: …"), así lo ven igual Seguimiento, el tablero y el asistente. El asistente sigue pudiendo resolver solo con texto.
- **Opciones editables** (`alerta_parametros.opciones_resolucion`, JSON) en Administración > Reglas de alerta > "Al resolver": agregar, renombrar, desactivar; muestra cuántos problemas eligieron cada opción. Lo ya resuelto conserva el nombre de entonces. La lista inicial es la de Ale: cuando llegue la de Hugo, se carga ahí sin código.
- Scripts: `13_ticketera_d1.txt` (3 columnas, ya corrido) y `14_evidencia_d1.txt` (tabla `evidencia_archivos`): quedan **25 tablas**. Prueba nueva `tickettest.mjs`; la demo y las 11 pruebas anteriores dan igual. Respaldo: `99_Archivo_viejo/worker_antes_parche30/`, ramas `respaldo-antes-parche-30` y `version-parche-30-ticketera`.

**Asistente: ajustes después de probar todas las preguntas (13/11, parche 29e; sin SQL, publicado el 13/11)**

- Se probaron las preguntas sugeridas de los 4 perfiles con Workers AI. Problemas encontrados: el Analista recibió "hay una alerta sin asignar" de una alerta asignada a Soporte; "Resumen del turno" recomendaba derivar lo ya asignado; "¿Cómo está la operación?" listaba todos los clientes sin problemas y copiaba nombres de campos ("Peor gravedad", "Cantidad"); salían títulos `###` sin formato; el Administrador leyó la banda al 100 % como "muy amplia" y habló del "cliente general"; Soporte terminaba con "¿Querés que te ayude a tomarla?" sin botón y sin voseo; el Gerente no veía que un cliente con menos incidentes tenía graves. En el contexto externo: títulos de Cloudflare en inglés, "Event Subscription" de Workers puesto como si afectara a Helios, el calendario con la fecha de la demo (26/10) mezclado con proveedores de hoy y un "Qué vigilar" genérico.
- Ahora cada pregunta sugerida lleva una guía de cómo responder y los datos llegan ya en frases: conteos separados (sin asignar, asignadas sin tomar, en curso, demoradas), cuánto lleva cada alerta en su estado (demorada: más de 15 min sin asignar, 30 sin tomar o 2 h en curso, como en Seguimiento), el estado por cliente con frases, clientes nuevos y "los otros N clientes están bien", y los umbrales explicados (100 % = la banda del modelo, valores de fábrica). A Soporte el servidor le deja el botón "Tomar" de la primera para tomar (propuesta: igual hay que tocar "Hacerlo"). El asistente trata de vos y no usa títulos `###` (si los usa, se muestran en negrita).
- Contexto externo: los títulos llegan en español (el servidor los arma; el original queda guardado), en **Helios** solo van incidentes de Workers en ejecución, D1 y Workers AI, los proveedores van con nombre corto, **Qué vigilar** lo arma el servidor (por ejemplo: "si el tablero da error, puede ser el incidente de Cloudflare y no un problema de los clientes") y, con el reloj de la demo puesto, **el calendario usa la fecha real** como los proveedores y las noticias (variable opcional `CONTEXTO_CALENDARIO=demo` para que siga el reloj de la demo).
- Probado: la demo igual, las 11 pruebas en verde, con casos nuevos en `asistest.mjs` y `ctxtest.mjs` para cada problema real.
- Respaldo: Worker anterior (29d) en `99_Archivo_viejo/worker_antes_parche29e/`, ramas `respaldo-antes-parche-29e` y `version-parche-29e-ajustes-pruebas-reales`.

**Contexto externo: enlaces cortos (13/11, parche 29d; publicado y probado con el modelo real, sin SQL)**

- En la tercera prueba real la respuesta salió con la estructura correcta y filtrada, pero los enlaces de Google Noticias (unos 400 caracteres) salían rotos y la respuesta se cortaba antes de "Qué vigilar".
- Ahora al modelo no le llega ninguna dirección web: cada novedad lleva un código corto ([E1] para proveedores, [N1] para noticias) y el servidor lo cambia por el enlace real antes de mostrar la respuesta; si el modelo inventa un código, se borra. Las prioridades (P1 a P4) no se tocan. La respuesta puede ser un poco más larga (900 tokens).
- Respaldo: Worker anterior (29c) en `99_Archivo_viejo/worker_antes_parche29d/`, ramas `respaldo-antes-parche-29d` y `version-parche-29d-enlaces-cortos`.

**Contexto externo: noticias que responden y filtro por país (13/11, parche 29c; publicado)**

- En la segunda prueba real el modelo puso "Helios (solo si hay algo)" como título (copió la instrucción), se colaron incidentes de Twilio en Costa Rica y Colombia (su componente decía "Latin America") y las noticias dieron "no respondió a tiempo" (GDELT es lento).
- Ahora: si el título nombra otro país, se descarta aunque el componente diga "Latin America"; las noticias salen de **Google Noticias** (Argentina, en español, sin clave) y GDELT queda de respaldo; si una fuente falla, se vuelve a probar a los 10 minutos; y las instrucciones piden títulos exactos (**Helios** solo si hay algo, **Calendario**, **Proveedores**, **Noticias**, **Qué vigilar**) con enlaces "[más info]".
- Respaldo: Worker anterior (29b) en `99_Archivo_viejo/worker_antes_parche29c/`, ramas `respaldo-antes-parche-29c` y `version-parche-29c-noticias-y-filtro`.

**Contexto externo: solo lo que importa (13/11, parche 29b; publicado en Cloudflare, sin SQL)**

- En la primera prueba real, "¿Hay algo de afuera que pueda afectar hoy o mañana?" listó incidentes de Twilio y Cloudflare en Reino Unido, Filipinas, Costa Rica, India, Rusia, Italia y Singapur, y no mencionó el calendario ni las noticias. El incidente de Cloudflare sobre errores al iniciar Workers (que afecta a Helios mismo) quedó perdido en la lista.
- Ahora el servidor filtra antes de pasarle los datos al modelo: primero, aparte, lo de Cloudflare Workers / D1 ("Helios mismo"); después lo de Argentina o la región; lo global solo si es de impacto importante o grave. Lo de otros países y lo menor sin lugar se descarta (solo se cuenta). Le arma `puntos_clave` en orden: Helios, calendario (siempre), proveedores y noticias (solo las que afectan pagos o el acceso), con enlaces; los títulos en inglés se traducen.
- El panel del asistente muestra las sublistas con sangría.
- Respaldo: Worker anterior (29) en `99_Archivo_viejo/worker_antes_parche29b/`, ramas `respaldo-antes-parche-29b` y `version-parche-29b-contexto-relevante`.

**Contexto externo del asistente (13/11, parche 29; publicado en Cloudflare)**

- Se le puede preguntar al asistente "¿hay algo de afuera que pueda afectar hoy o mañana?" (también es pregunta sugerida en los 4 perfiles). Responde con una herramienta nueva, `contexto_externo`, y cruza lo de afuera con las alertas y los servicios del cliente:
  1. **Calendario** (de la base, gratis): feriados, fines de semana largos, el primer día hábil después, 1.º a 4.º día hábil del mes (cobro de sueldos), aguinaldo y eventos comerciales.
  2. **Proveedores**: incidentes abiertos y mantenimientos de las próximas 48 h (páginas de estado públicas; por defecto Cloudflare y Twilio, configurable con `CONTEXTO_PROVEEDORES`).
  3. **Noticias** de Argentina de las últimas 48 h (desde el 29c, Google Noticias con GDELT de respaldo): paros bancarios, caídas, cortes de luz, BCRA, billeteras. Se muestran con medio, fecha y enlace, aclarando que no están verificadas por Helios.
  4. **Eventos comerciales**: sección nueva en Administración > Umbrales. Ya cargados CyberMonday (2 al 4/11) y Black Friday (27 al 30/11) de 2026.
- **Cuidado del plan gratuito:** proveedores y noticias se guardan una hora (`contexto_externo`, 2 filas) y solo se consultan cuando alguien pregunta; como mucho ~5 pedidos externos por hora, 5 s de tope cada uno. Si una fuente falla, usa lo último guardado y lo avisa. `CONTEXTO_EXTERNO=apagado` deja solo el calendario.
- Sigue limitado a Helios: lo de afuera solo si afecta la operación y con la herramienta (nunca de memoria). Soporte no recibe la criticidad de los servicios de los clientes. Los enlaces del panel se pueden tocar (solo https; el resto sigue escapado).
- Tablas nuevas `contexto_externo` y `eventos_comerciales` (script `12_contexto_externo_d1.txt`): quedan **24 tablas**.
- Probado: `ctxtest.mjs` (35 controles, con internet y modelo simulados), la demo igual y las 10 pruebas; pantalla de eventos en PC y celular.
- Respaldo: Worker anterior (28d) en `99_Archivo_viejo/worker_antes_parche29/`, ramas `respaldo-antes-parche-29` y `version-parche-29-contexto-externo`.

**Corrección del asistente (13/11, parche 28b)**

- Probándolo con Soporte en Cloudflare, el modelo (Qwen3) respondió con la definición de una herramienta (`<tools>…</tools>`) en vez de con los datos. Ahora la pregunta libre lleva siempre los datos principales de cada perfil (Soporte: sus alertas; Analista: alertas abiertas; Gerente y Administrador: estado por cliente), así responde aunque el modelo no pida herramientas, y casi siempre en una sola vuelta. Además se leen las llamadas escritas como `<tool_call>` y, si el modelo devuelve un eco de las herramientas, se le vuelve a pedir la respuesta sin ellas; ese texto nunca se muestra.
- **28c:** con el Analista, a "¿en qué horario surgieron más alertas y qué cliente tuvo más problemas?" el modelo contestó que no tenía acceso (sí lo tiene, por `incidentes`). Ahora, según las palabras de la pregunta, se suman los datos que hacen falta (máximo 3 herramientas, siempre las del perfil); `incidentes` trae también **en qué horario empiezan** (hora de Argentina); y las instrucciones describen cada herramienta y le prohíben decir "no disponible" sin haberla pedido.
- **28d:** a "¿Maradona sigue vivo?" respondió de memoria, y el "Resumen del turno" salió con `<resumen_turno>` y el id interno de la alerta. Ahora las instrucciones lo limitan a Helios (otro tema → "Solo puedo ayudarte con la operación y las alertas de Helios") y le prohíben responder de memoria cosas del mundo; y el servidor quita etiquetas sueltas e ids internos antes de mostrar la respuesta.
- Sin SQL nuevo: solo publicar el Worker. Probado: demo igual, 9 pruebas OK y `asistest.mjs` con los cuatro casos reales.
- Respaldo: Worker anterior en `99_Archivo_viejo/worker_antes_parche28b/`, ramas `respaldo-antes-parche-28b`, `version-parche-28b-asistente-respuestas` (intermedia) `version-parche-28c-asistente-datos-por-pregunta` (intermedia) y `version-parche-28d-asistente-tema-y-formato` (la que se publica).

**Asistente de IA (13/11, parche 28; publicado en Cloudflare)**

- Chat "Asistente" en todas las páginas y "¿Qué está pasando?" en cada alerta, con Workers AI. Responde solo con lo que el perfil puede ver (herramientas con el permiso de cada pantalla), propone acciones que se confirman con "Hacerlo" y nunca ejecuta nada solo. Ver "Asistente de IA" en la sección 7.
- Tabla nueva `asistente_uso` (script `11_asistente_d1.txt`), enlace `AI` (Workers AI) en el Worker y variables opcionales `ASISTENTE_MODELO`, `ASISTENTE_POR_HORA`, `ASISTENTE_POR_DIA`. Quedan **22 tablas**.
- Partes del Worker tocadas (`patch28.py`): permiso nuevo `asistente`; módulo `asistente_server.js` antes de `const TRABAJADOR`; la ruta `/api/asistente` después de las de push; el panel `asistente.html` antes de `</body>` en las cuatro páginas; la etiqueta "Consultó al asistente" en la auditoría. No se cambió nada de lo que ya existía.
- Probado: la demo y las 9 pruebas dan lo mismo; `asistest.mjs` (permisos por perfil aunque el modelo insista, que no ejecuta nada, propuestas validadas, preguntas sugeridas en una llamada, límites, 2 escrituras por pregunta, formatos del modelo) y las páginas en Chromium con el modelo simulado. Aplicado en Cloudflare el 13/11 (script 11, enlace `AI`, Worker). Respaldo: el Worker anterior está en `99_Archivo_viejo/worker_antes_parche28/`, el proyecto anterior en la rama `respaldo-antes-parche-28` y esta versión en la rama `version-parche-28-asistente-ia`.

**Avisos push e instalar como app (12/11, parche 26)**

- Los avisos de la campanita llegan al celular o la PC aunque Helios esté cerrado (Web Push, gratis). En iPhone, con Helios agregado a la pantalla de inicio. Ver "Avisos en el dispositivo" en la sección 7.
- Helios se puede instalar como app: manifiesto, ícono (el caballo de ajedrez blanco del logo "Helios System" sobre verde azulado), service worker. El mismo caballo pasó a ser el logo de la barra superior de todas las páginas y del login.
- Tabla nueva `suscripciones_push` (script `10_avisos_push_d1.txt`) y secreto nuevo del Worker `VAPID_JWK`. Quedan **21 tablas**.
- Probado: cifrado (se descifra igual que el navegador), firma VAPID, limpieza de dispositivos vencidos, permisos, service worker simulado; la demo y las 9 pruebas dan lo mismo. Publicado y probado de punta a punta en una PC con Chrome el 12/11.

**Perfiles: qué ve y qué hace cada uno (11/11, parche 25)**

- **Gerente:** solo lectura del negocio. Tablero con el nuevo **Estado por cliente** (Panorama con colores por servicio y canal), barras de 24 h, histórico, tiempo de resolución y clientes con más problemas. Ya no ve la lista de alertas abiertas, las pre-alertas ni Seguimiento.
- **Analista:** tablero completo y Seguimiento; deriva, resuelve (falsas alarmas), **avisa a Soporte de una pre-alerta** (botón "Avisar a Soporte": manda un aviso a la campanita, no crea una alerta) y arma reglas de derivación. **Ya no crea reglas de alerta** (eso pasa al Administrador).
- **Soporte:** solo Mis alertas. No entra al tablero (`/` lo lleva a Mis alertas; `/api/dashboard` da 403) y solo ve el historial de las alertas suyas o de su equipo.
- **Administrador:** empieza en Administración (usuarios, equipos, reglas de alerta, derivación, umbrales, modelo, auditoría). Ve el tablero y Seguimiento en modo lectura; **ya no recibe ni trabaja alertas** (no tiene Mis alertas ni campanita). Solo Soporte recibe derivaciones; las alertas que hoy estén asignadas a un administrador hay que reasignarlas (Preparar demo las borra).
- **Avisos del navegador** (nivel 1): se activan desde la campanita; llegan con la página abierta aunque esté en otra pestaña. Push con el navegador cerrado, mail, SMS o app: pendiente.
- Para probar en el navegador sin Cloudflare: `07_Codigo_fuente/worker/servidor_local.mjs`.
- No hay SQL nuevo. Publicado en Cloudflare el 11/11.

**Motor contra el perfil, sin vistas y sin Power BI (11/11, etapa 2 del modelo nuevo)**

- El motor compara cada ventana con su celda de `perfil_comportamiento` (día de la semana × franja de 15 min × tercio del mes; un feriado como domingo) en vez de con `core_metricas_esperadas`. Lo hace el parche 24 del Worker. La demo de 19 escenas da exactamente las mismas alertas y pre-alertas que antes.
- **No quedan vistas:** su SQL pasó al Worker. Se borran también `core_metricas_esperadas`, `historico_metricas`, `calendario` (el día de la semana y el tercio se calculan de la fecha), `raw_metricas_recibidas` y `demo_escenarios`. Quedan **20 tablas y 0 vistas**.
- **Sin Power BI:** el análisis es solo el tablero HTML. El Worker `worker-api-bi` se tiene que borrar del panel; su código y los archivos de Power BI quedaron en `99_Archivo_viejo/power_bi/`.
- La demo arranca **sin datos recibidos**: el perfil está entrenado con la historia hasta el lunes 26/10 10:00 y la escena 1 es la primera llegada. La ventana faltante solo avisa desde el primer dato que mandó cada serie (un cliente que todavía no empezó a enviar no genera alertas) y el tablero muestra "bien desde las 10:00".
- **En Cloudflare (11/11):** `09_modelo_v2_d1.txt` corrido y Worker publicado. Falta recorrer la demo y borrar `worker-api-bi`.
- Queda para la etapa 3: `tablero_cache` como columna de `alerta_parametros` y `alerta_reglas` junto con `alerta_reglas_personalizadas` (18 tablas), más la revisión incremental.

**Perfil de comportamiento (11/11, etapa 2 del modelo nuevo)**

- Tabla nueva en D1, ya cargada: `perfil_comportamiento` (esperado y banda por serie × día de la semana × franja de 15 min × tercio del mes; 26.208 filas). El primer script también creaba `historico_metricas` y `calendario`, que se borran con `09_modelo_v2_d1.txt`. **Tercio del mes (`tercio_mes`) = por día del calendario: 1–10, 11–20, 21 a fin de mes** (decidido el 11/11: el día de la semana ya separa hábiles y fines de semana; por día hábil el tercio 3 tenía 0 a 3 días por mes). Los nombres de tablas y columnas van completos, sin abreviar.
- El perfil se calculó fuera de D1 (PostgreSQL, `perfil_comportamiento_postgres.sql`) con 12 meses de historia ficticia (`historico_metricas_demo.csv`); a D1 se sube solo el resumen. Mediana y percentiles 5/95, con bandas nunca más angostas que las del modelo actual; mínimo 6 muestras por celda (todas tienen entre 13 y 19 de su propio tercio); si no alcanzara, se usa la celda sin tercio (`nivel_perfil = DIA_FRANJA`).
- Ya conectado: ver la entrada "Motor contra el perfil".

**Feriados (11/11, etapa 1 del modelo nuevo)**

- Tabla `feriados` + API pública argentinadatos; opción "Silenciar alertas en feriados" por cliente o servicio (solo silenciar; el cliente lo elige por servicio/producto). El tablero avisa si hoy es feriado.
- Próximas etapas acordadas: (2) modelo nuevo con perfil por día de la semana × franja de 15 min × tercio del mes (días 1-10, 11-20, 21 a fin de mes), entrenado con 12 meses de historia (en la demo, ficticia) procesada fuera de D1, que reemplaza a `core_metricas_esperadas` (en feriado se espera como un domingo); (3) revisión incremental (cada revisión procesa solo lo recibido desde la anterior, ~50 filas en vez de ~6.500) y limpieza de tablas y vistas sin uso.

**Del 5/11 al 11/11**

| Antes | Ahora |
|---|---|
| Cortes de severidad, banda del modelo, volumen mínimo y gracia fijos en el SQL | Configurables en `umbrales_config` (general + excepciones por cliente o cliente y servicio), solo Administrador, con el modelo como recomendación. Con los valores de fábrica, idéntico a antes |
| Alertas ordenadas por severidad | Prioridad P1–P4 (severidad × criticidad del servicio) en el tablero, Mis alertas y Seguimiento |
| "Bien el X % del día" sin referencia | Comparado contra el objetivo de disponibilidad del cliente (fábrica 97 %: tolera hasta 2 ventanas de 15 min con problemas) |
| El analista tenía "Mis alertas" y podía tomar alertas | El analista solo deriva (no toma ni recibe alertas) y tiene **Seguimiento**: todas las abiertas, quién las tiene, desde cuándo y la carga por equipo. Solo Soporte y Administrador reciben derivaciones |
| Botones "Mis alertas" y "Seguimiento" en la barra | Solo en el menú de la foto de perfil, con contador y punto rojo de pendientes |
| Color principal azul (Atlassian) | Verde azulado (teal): `#0F766E` claro / `#2DD4BF` oscuro |
| Tablero que recalculaba vistas en cada carga (91.000 filas leídas en un fin de semana) | Cache del tablero (`tablero_cache`, `series_estado`, `prealertas_estado`): cientos de filas por carga |

**Del 26/10 al 5/11**

| Antes (26/10) | Ahora (5/11) |
|---|---|
| Dashboard público, se recargaba solo cada 5 minutos | Login con perfiles; no se recarga solo |
| `POST /api/alertas/<id>/reconocer` y `/resolver` con body `{usuario, comentario}` | Rutas de asignación; el nombre sale de la sesión; resolver exige comentario |
| El modelo predecía 24 horas | Predice 48 horas desde el último día completo |
| Carga del prototipo con fechas relativas a la hora de carga (`carga_inicial_prototipo`), 8 clientes, 31 incidentes en 48 h | Carga base con fechas fijas (`carga_baseline_demo_consola.txt`) y 19 escenas que se reproducen con botones |
| Segundo Worker sin revisar | `worker-api-bi` documentado; ya convierte a hora de Argentina |
| `v_alertas`, `v_comparacion` y `v_prealertas` recorrían tablas enteras | Filtran por fecha con índice |
| Sin usuarios, asignación ni avisos | Perfiles, equipos, reglas personalizadas, asignación, derivación automática, campanita y auditoría |

---

## 17. Archivos del proyecto

| Archivo | Qué es |
|---|---|
| `worker_alertas_cron.js` | Worker de alertas completo (páginas, API, proceso, demo). Es el que se publica |
| `10_avisos_push_d1.txt` | Tabla `suscripciones_push` para los avisos push (ya corrido el 12/11) |
| `11_asistente_d1.txt` | Tabla `asistente_uso` para los límites del asistente de IA (parche 28; ya corrido el 13/11) |
| `12_contexto_externo_d1.txt` | Tablas `contexto_externo` y `eventos_comerciales` (parche 29; ya corrido el 13/11) |
| `novedades_asistente_ia.md` | Asistente de IA: cómo activarlo en Cloudflare, qué responde a cada perfil, límites y problemas comunes |
| `novedades_avisos_push_y_app.md` | Avisos push, app instalable y logo nuevo: guía por dispositivo, problemas comunes, diagnóstico y cómo funciona |
| `novedades_ticketera.md` | Ticketera (parche 30): detalle de alerta, evidencia (en D1, o en R2 si se activa), resolución con causa; cómo activarlo y problemas comunes |
| `13_ticketera_d1.txt` | Columnas `causa_resolucion` y `acciones_resolucion` en `alertas_historico` y `opciones_resolucion` en `alerta_parametros` (parche 30; corrido el 14/11) |
| `14_evidencia_d1.txt` | Tabla `evidencia_archivos`: la evidencia adjunta, en D1 mientras no haya R2 (parche 30; corrido el 14/11) |
| `20_disponibilidad_d1.txt` | Columnas `umbrales_config.objetivo_mensual` y `alerta_parametros.disponibilidad_config` y el objetivo general de 99,9 % (parche 45; falta correrlo, después del 18 y el 19) |
| `09_modelo_v2_d1.txt` | Etapa 2 del modelo nuevo (ya corrido el 11/11): índice del perfil, borra las vistas y las tablas sin uso, y vacía alertas y métricas (la demo arranca sin datos recibidos). Se corre antes de publicar el Worker. Reemplaza a `carga_baseline_demo_consola.txt` |
| `acceso_d1_tablas.txt` · `admin_d1_tablas.txt` · `asignacion_d1_tablas.txt` · `avisos_d1_tablas.txt` | Tablas de login, administración, asignación y avisos (ya aplicadas) |
| `feriados_d1_tablas.txt` | Tabla `feriados` (fines de 2025 y 2026 precargados), columna `silenciar_feriados` y vistas que la respetan (ya aplicado el 11/11). **Desde el modelo v2 solo valen los bloques 1 a 26 y 35**: los 27 a 34 recrean vistas viejas y no se deben correr |
| `umbrales_d1_tablas.txt` | Tabla `umbrales_config` y vistas `v_alertas_*` y `v_prealertas` que la usan (11/11). Se corre en la consola de D1 **antes** de publicar el Worker del 11/11; si ya se aplicó, no hace falta repetirlo |
| `arreglo_vista_prealertas.txt` · `vistas_por_fecha_d1.txt` | Correcciones de lecturas de `v_prealertas` y de `v_comparacion` / `v_alertas` (ya aplicadas) |
| `vistas_anteriores_respaldo.sql` | Las vistas como estaban antes del 5/11, por si hay que volver atrás |
| `cache_d1_tablas.txt` | Tablas del cache del tablero (ya aplicadas) |
| `perfil_comportamiento_d1.txt` · `perfil_comportamiento_d1.sql` | Modelo v2: crea `perfil_comportamiento` y su índice e inserta los perfiles (ya cargado el 11/11; sirve para recargarlo después de reentrenar). El `.sql` es para Wrangler |
| `historico_metricas_demo.zip` · `perfil_comportamiento_postgres.sql` · `generar_historico_metricas.py` | Respaldo del modelo v2: historia ficticia, consulta que arma los perfiles y generador de la historia |
| Carpeta `07_Codigo_fuente/` | Código con el que se genera el Worker (parches, páginas, SQL por etapa) y sus pruebas. Ver `CLAUDE.md` |
| `Helios_inventario_de_tablas.docx` | Inventario de las 24 tablas y 7 vistas (anterior al modelo v2: hay que actualizarlo a 22 tablas (con `suscripciones_push` y `asistente_uso`) y 0 vistas): para qué sirve cada una, quién la escribe y la lee, y sus columnas. También existe como documento editable en Claude |
| `contexto_helios_para_ia.md` | Este archivo |
| Carpeta `99_Archivo_viejo/power_bi/` | Lo de Power BI, que ya no se usa: consultas, medidas DAX, tema y `worker_api_powerbi.js` |
| `demo_alertas.pptx` | Presentación de la demo, escena por escena, con inventario |
| `alertas_d1_objetos.sql` · `alertas_d1_historico.sql` · `alertas_d1_modelo_esperado.sql` · `alertas_d1_proceso.sql` · `alertas_d1_consultas.sql` | Archivos SQL originales de la compañera. El SQL del Worker partió de ellos, pero el Worker ya tiene cambios: si se toca uno, revisar el otro |
| `Diccionario_Alertas_y_Tablas.docx` · `Alertas_Monitoreo_Demo.docx` | Documentación anterior: no incluye login, asignación, avisos ni umbrales |
| `Alertas_Modelo_Datos.docx` | Especificación de la compañera para el modelo de datos en PostgreSQL / Cloud SQL (MVP con `customers`, `services`, `metrics`, `baselines`, `alert_rules`, `alert_state`, `alerts`); referencia de estilo para los Word |
| `reset_demo.sql` · `limpieza_demo_d1.sql` · `demo_alertas_paso_a_paso.sql` · `carga_inicial_prototipo.sql` | **Obsoletos, no usar:** son de cargas anteriores y borran datos (`reset_demo.sql` borra todas las observadas) |
| `Helios_Monitoreo_Inteligente_Demo.pptx` · `Guion_Demo_Helios_Monitoreo.docx` | Presentación de venta y guion: desactualizados |

---

## 18. Pendientes y próximos pasos

### Mejoras pedidas por Hugo (ITIL / ITSM / SRE) — **pendiente: no empezar hasta tener sus definiciones**

Salieron de las reuniones con Hugo (13/11). No hay nada implementado. Antes de tocar código hay que validar con él:

| Mejora | Qué falta que defina Hugo |
|---|---|
| Tipo de impacto: degradación, caída parcial y caída total (además de la severidad) | Cómo distingue él degradación, parcial y caída (criterios o ejemplos) |
| Servicios de acceso (login, códigos por SMS) y correlación: si falla el acceso, agrupar lo que cae detrás | La lista de servicios de cada cliente, marcando cuáles son de acceso; la foto del incidente de login que mencionó |
| Coeficientes o pesos por servicio o cliente | Un ejemplo con coeficientes reales |
| Segmentos de clientes | Qué segmentos usa y para qué |
| Registro tipo ITIL: incidentes y problemas, con causa | La lista de causas para elegir al resolver. **Desde el parche 30 ya se elige causa al resolver** con la lista de Ale, editable en Administración: cuando llegue la de Hugo se carga ahí. Falta lo de incidentes y problemas |
| SLAs por prioridad (P1 a P4) con escalamiento | Tiempos de respuesta y de resolución por prioridad, y a quién se escala |
| SLO por cliente y ventanas de mantenimiento (que no alerten) | Confirmar si los quiere y con qué criterio |

Hugo quedó en mandar un documento; cuando llegue, se arma el plan y recién ahí se implementa (empezando por el tipo de impacto).


- [x] Optimizar el motor (filtro por fecha con índice, mismo resultado) y sacar las vistas (11/11).
- [ ] Ticketera (parches 30 y 31, publicados el 14/11): probar con Soporte y Analista en Cloudflare.
- [ ] Tablero de causas a partir de `alertas_historico.causa_resolucion` y `acciones_resolucion` (por cliente, servicio y mes) y retención de la evidencia vieja en R2.
- [x] Etapa 3a: revisión incremental (16/11, parche 37; publicada con el script 15). El cron sigue apagado: con el reloj de la demo no procesaría igual; tiene sentido al pasar a reloj real con ingesta real.
- [x] Etapa 3b: `tablero_cache` como columnas de `alerta_parametros` y `reglas_alerta` (sistema + personalizadas juntas): 23 tablas (16/11, parche 38). Publicada el 16/11 (scripts 16 y 17 corridos, Worker publicado).
- [ ] Quitar el modo demo y poner el reloj real (`ahora` = NULL).
- [ ] Para el agente, un token propio. (`worker-api-bi` queda en el panel por decisión de Uriel, 16/11.)
- [ ] Contraseñas: PBKDF2 a 600.000 iteraciones (se actualizan solas al ingresar), pepper secreto, política y duración de sesión; idealmente SSO.
- [ ] Ingesta real: endpoint `POST /api/metricas` con el formato acordado, que normalice las fechas (si hace falta guardar lo recibido crudo, se diseña la tabla en ese momento).
- [x] Modelo de largo plazo: perfil por día de la semana × franja × tercio del mes con 12 meses de historia (11/11).
- [ ] Perfil genérico para clientes nuevos; reentrenar el perfil cada tanto (por ejemplo, una vez por mes) con la historia real.
- [ ] Retención: avisos leídos de más de 30 días, métricas viejas resumidas.
- [x] Código en Git: GitHub privado `Zettita/Monitoreo` (12/11).
- [ ] Ambientes QA y producción, copias de seguridad.
- [x] Avisos push con Helios cerrado e instalar como app (12/11, parche 26; publicado).
- [x] Preparar correo desde la alerta y confirmar el envío (16/11, parche 39; falta publicar).
- [x] Plantillas de correo por tipo de incidente y sector (16/11, parche 40; falta publicar con el script 18). Destinatarios por cliente: más adelante, si hace falta.
- [x] Tickets a demanda en InvGate o Jira (16/11, parche 41; falta publicar con el script 19). Jira crea el issue en el proyecto KAN (parche 53; se prende con `TICKETS_JIRA = real` y los secretos). InvGate sigue simulado.
- [x] Comunicar incidente por push con listas de difusión, Recibido y respuestas (16/11, parche 46; falta publicar con el script 21). Más adelante: adjuntar captura al responder.
- [x] Dashboard gerencial: Gerente con lista de alertas y detalle en solo lectura, incidentes activos, resumen por Día / Semana / Mes y disponibilidad mensual configurable (16/11, parches 42 a 45; falta publicar con el script 20).
- [ ] Disponibilidad: con datos reales, revisar si el objetivo de 99,9 % y los pesos (Grave 100 %, Importante 50 %) le sirven a Hugo; evaluar la evolución mes a mes de cada cliente.
- [ ] War Room en Teams desde una alerta (en pausa; evaluar enlace directo vs. Microsoft Graph).
- [x] Sala de crisis en Teams: avisos al canal y "Chat en Teams" (20/11, parche 70; falta publicar y conectar el canal). Bot de Teams: pendiente de IT.
- [ ] **Prioridad 2 (decidido el 17/11): avisos en un canal de Teams con webhook (etapa 5).** Para las salas de crisis, hecho en el parche 70; faltan las alertas sueltas. Ya hay un parche viejo en las ramas `version-parche-30-avisos-teams` y `avisos-teams-pendiente`: rehacerlo como parche nuevo encima de `main` y revisar antes qué cubre "Comunicar incidente". Además: Mail, SMS o app de celular (lo investiga la compañera; el servicio elegido tiene que tener una API HTTP simple, porque el Worker solo puede hacer `fetch`).
- [x] Perfiles: Gerente de lectura con Panorama, Analista deriva y avisa pre-alertas, Soporte solo con sus tickets, Administrador orientado a la configuración (11/11).
- [x] Criticidad por servicio, objetivo de disponibilidad y umbrales configurables por cliente (11/11).
- [ ] Definir advertencia vs. alerta (por ejemplo, `MEDIA` y `BAJA` = advertencia).
- [x] Prioridad P1–P4 en "Mis alertas" y en Seguimiento.
- [ ] Validar que los equipos tengan solo gente de Soporte (hoy se puede sumar un analista, que no va a poder tomar lo que se derive al equipo).
- [x] Asistente de IA con Workers AI, por perfil, que propone y no ejecuta (13/11, parche 28). Publicado el 13/11. Falta: probar la calidad de las respuestas con el modelo real con el gold set (`Helios_gold_set_asistente.docx`, 20/11).
- [ ] Contexto externo del asistente (parche 29, publicado el 13/11): probar con las fuentes reales. Más adelante: que los eventos comerciales también ajusten lo esperado (hoy solo los usa el asistente).
- [ ] Ideas de IA ya ofrecidas: resumen del incidente en lenguaje natural, índice de riesgo por cliente y, más adelante, un modelo de machine learning para comparar contra la línea base.
- [ ] Simulación en vivo para la demo: botones que provoquen una caída, suban los rechazos o corten el envío, con ventanas de 1 minuto.
- [ ] Actualizar la presentación de venta y el guion a los clientes `CLI_00x`.

---

## 19. Glosario

| Término | Significado |
|---|---|
| Serie | Combinación ambiente + cliente + servicio + producto + canal + moneda + duración de ventana |
| Ventana | Intervalo de 15 minutos |
| Observado / esperado | Lo que pasó / lo que el modelo predijo, con su banda de mínimo y máximo |
| Gracia | Minutos que se espera un dato antes de dar "Dejaron de llegar datos" (5 general; configurable por cliente) |
| Horizonte | Cuántas horas hacia atrás mira cada revisión (24) |
| Volumen mínimo | Operaciones mínimas en una ventana para evaluar tasas (20 general; configurable por cliente) |
| Criticidad | Qué tan importante es un servicio para el negocio (alta, media, baja); junto con la severidad da la prioridad |
| Prioridad | P1 a P4: orden de atención de una alerta |
| Objetivo de disponibilidad | % del día sin problemas que se espera de un cliente (97 % general) |
| Ancho de banda | Cuánto se ensancha o angosta la banda del modelo (100 % = como la calcula) |
| Seguimiento | Página del analista para ver todas las alertas abiertas y quién las tiene |
| Incidente | Ventanas seguidas de la misma alerta, agrupadas en un problema |
| Pre-alerta | Métrica que viene empeorando y todavía no cruzó el umbral |
| Margen consumido | Qué parte de la distancia entre lo esperado y el umbral ya se recorrió (0 a 1) |
| MTTR | Tiempo medio de resolución |
| Derivar | Asignar una alerta a una persona y/o equipo |
| Tomar | Hacerse cargo: la alerta pasa a "En curso" |
| Devolver | Soporte la devuelve al analista con un motivo |
