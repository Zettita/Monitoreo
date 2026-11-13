# Helios: contexto del sistema para asistentes de IA

> **Para la IA que lee esto:** este archivo describe la plataforma de alertas Helios tal como está al **13 de noviembre de 2026** (el asistente de IA, parche 28, ya está publicado en Cloudflare; su contexto externo, parche 29, está hecho y probado y falta aplicarlo), con lo publicado en Cloudflare, las decisiones ya tomadas por el equipo y hacia dónde se quiere migrar. Usalo como fuente de verdad: reemplaza a cualquier versión anterior de este archivo y al documento de contexto del 26/10/2026; los cambios están en la sección 16. Si algo de lo que te piden contradice la sección "Reglas que no se deben romper", avisalo antes de hacerlo. Si algo no está acá, preguntá antes de inventarlo. Respondé en español rioplatense, con lenguaje claro.

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
- Modo demo con reloj simulado y 19 escenas.

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
| Workers AI (asistente, parche 28) | Modelo de lenguaje del asistente de IA. Enlace (binding) `AI` del Worker; modelo en la variable `ASISTENTE_MODELO` (por defecto `@cf/qwen/qwen3-30b-a3b-fp8`) | Cupo gratuito: 10.000 neuronas por día para toda la cuenta. Una pregunta usa unas 30 a 70 neuronas con ese modelo: el Worker limita a 150 preguntas por día y 20 por persona por hora |
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
- **Contexto externo del asistente (13/11, parche 29): falta aplicar.** Correr `02_Base_de_datos_D1/12_contexto_externo_d1.txt` (tablas `contexto_externo` y `eventos_comerciales`, quedan 24 tablas) y publicar el Worker. Incluye las correcciones 28b a 28d.
- **Corrección del asistente (13/11, parches 28b a 28d): falta publicar el Worker** (sin SQL). Arregla respuestas que mostraban `<tools>…</tools>`, negativas falsas ("no tengo acceso"), respuestas fuera de tema y etiquetas o ids internos en el texto.
- **Asistente de IA (13/11, parche 28): aplicado.** Se corrió `02_Base_de_datos_D1/11_asistente_d1.txt` (tabla `asistente_uso`, quedan 22 tablas); en el Worker, Settings → Bindings → Add binding → **Workers AI**, nombre de variable `AI`, y se publicó `01_Worker/worker_alertas_cron.js`. El panel abre bien como Administrador; falta probar las respuestas con cada perfil. Sin el enlace, el resto funciona igual y el panel del asistente avisa que falta configurarlo. Guía: `novedades_asistente_ia.md`.
- **Cómo verificar la base desde la consola de D1** (una línea, solo lee): `SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'view') AS vistas, (SELECT COUNT(*) FROM sqlite_master WHERE name = 'ix_perfil_comportamiento_franja') AS indice_perfil, (SELECT COUNT(*) FROM feriados) AS feriados, (SELECT ahora FROM alerta_parametros WHERE id = 1) AS reloj;` → 0, 1, 23 o más, y el reloj de la demo.
- **Código fuente:** repositorio privado en GitHub `Zettita/Monitoreo` (rama `main`, desde el 12/11), compartido con Ale; cada cambio probado se sube ahí junto con este archivo actualizado, dejando siempre respaldo de la versión anterior (copia en `99_Archivo_viejo/` y rama `respaldo-antes-parche-NN`) y de la nueva (rama `version-parche-NN-<tema>`). El Worker se genera en `07_Codigo_fuente/worker` con `build.py` (Worker original + `demo_server.js` + parches 9 a 28) y se prueba con la demo de 19 escenas y 10 pruebas por módulo; `servidor_local.mjs` lo corre en la PC (Node 22.5+ con `node:sqlite`) sin Cloudflare.

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
| `alertas_historico` | Una fila por **ventana** con problema | `alerta_id` (hex de 32), `tipo_alerta`, clave de serie, `ventana_inicio`, `ventana_fin`, `metrica`, `severidad`, `severidad_maxima`, `valor_observado`, `valor_esperado`, `umbral`, `desvio`, `estado`, `primera_deteccion`, `ultima_deteccion`, `cantidad_detecciones`, `cantidad_reaperturas`, `fecha_reconocimiento`, `reconocida_por`, `fecha_resolucion`, `motivo_resolucion`, `resuelta_por`, `comentario`, `asignado_usuario_id`, `asignado_equipo_id`, `asignado_en`, `asignado_por`. Única por (`tipo_alerta`, `ventana_inicio`, `duracion_ventana_minutos`, clave de serie) |
| `alerta_eventos` | Historial de cada alerta | `id`, `fecha`, `alerta_id`, `usuario_id` (NULL = automático), `accion` (`DERIVAR`, `TOMAR`, `COMENTAR`, `DEVOLVER`, `RESOLVER`), `usuario_destino_id`, `equipo_destino_id`, `comentario` |
| `avisos` | Campanita, un registro por persona | `id`, `usuario_id`, `fecha`, `tipo` (`ASIGNADA`, `COMENTARIO`, `DEVUELTA`, `RESUELTA`, `GRAVE_SIN_ASIGNAR`), `alerta_id`, `texto`, `detalle`, `leido` |
| `alerta_reglas` | Las 12 reglas del sistema. Existe porque D1 no admite 12 `SELECT` unidos con `UNION ALL` | `regla` (PK), `orden`, `grupo`, `descripcion`, `activa` |
| `alerta_reglas_personalizadas` | Reglas propias | `id`, `nombre`, `metrica` (`VOLUMEN`, `APROBACION`, `RECHAZO`, `ERROR`, `IMPORTE`, `LATENCIA`), `direccion` (`BAJO` = por debajo del mínimo, `ALTO` = por encima del máximo), `ventanas_seguidas` (1 a 8), `cliente_id`, `servicio_id`, `canal_id` (NULL = todos), `severidad`, `activa` |
| `reglas_derivacion` | Derivación automática | `id`, `nombre`, `prioridad` (menor = primero), condiciones `cliente_id`, `servicio_id`, `canal_id`, `tipo_alerta`, `severidad_minima` (NULL = cualquiera), destino `equipo_id` y/o `usuario_id`, `activa` |
| `alerta_parametros` | Una sola fila (`id = 1`) | `ahora` (reloj: fecha = simulado; NULL = hora real), `volumen_minimo` (20) y `gracia_minutos` (5) **generales** (se editan desde Administración > Umbrales), `horizonte_horas` (24), `tolerancia_tasa` (0,001) |
| `umbrales_config` | **Umbrales por cliente** (solo Administrador). Clave (`cliente_id`, `servicio_id`): `('*','*')` = general; `('CLI_001','*')` = todo el cliente; `('CLI_001','TRANSFERENCIAS')` = cliente y servicio. En las excepciones NULL = hereda del nivel de arriba; gana el más específico | `criticidad` (`ALTA`/`MEDIA`/`BAJA`, fábrica `MEDIA`), `objetivo_disponibilidad` (0,97), `corte_pct_alta` / `corte_pct_critica` (0,25 / 0,50), `corte_tasa_alta` / `corte_tasa_critica` (0,05 / 0,15), `banda_volumen`, `banda_tasas`, `banda_importe`, `banda_latencia` (1 = banda del modelo), `volumen_minimo`, `gracia_minutos` (en la fila general van NULL: se usan los de `alerta_parametros`), `silenciar_feriados` (0/1: en feriados no se generan alertas, pre-alertas ni reglas personalizadas de ese servicio), `actualizado`, `actualizado_por` |
| `feriados` | Feriados nacionales y días no laborables (+ los agregados a mano). Se cargan de `https://api.argentinadatos.com/v1/feriados/{año}`: el cron trae solo el año en curso y, desde octubre, el siguiente; el Administrador puede actualizar o agregar desde Administración > Umbrales | `fecha` (PK, `AAAA-MM-DD`, fecha de Argentina), `nombre`, `tipo` (`inamovible`, `trasladable`, `puente`, `manual`), `origen` (`API` o `MANUAL`; la API nunca pisa los manuales) |
| `usuarios` | Personas | `id`, `usuario`, `nombre`, `perfil` (`ADMIN`, `GERENTE`, `ANALISTA`, `SOPORTE`), `hash`, `sal`, `iteraciones`, `debe_cambiar`, `activo`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_ingreso` |
| `sesiones` | Sesiones abiertas | `token_hash` (SHA-256 del token de la cookie), `usuario_id`, `creada`, `vence` |
| `equipos` · `equipo_miembros` | Equipos y su gente | `equipos`: `id`, `nombre`, `descripcion`, `responsable_id`, `activo` · `equipo_miembros`: (`equipo_id`, `usuario_id`) |
| `auditoria` | Quién hizo qué | `id`, `fecha`, `usuario_id`, `accion`, `detalle` |
| `tablero_cache` · `series_estado` · `prealertas_estado` | **Cache del tablero.** Cada revisión de alertas (cron, botón, escena de la demo) y "Preparar demo" cambian `tablero_cache.revision`. La primera carga del tablero después recalcula las series de 24 h y las pre-alertas y las guarda; las demás cargas solo leen estas tablas | Las escribe el Worker; no se tocan a mano. Si una ingesta nueva carga métricas sin pasar por la revisión, tiene que marcar `revision` |
| `suscripciones_push` | **Avisos push (parche 26, script 10).** Un dispositivo (celular o PC) que activó los avisos desde la campanita. Si el servicio de push responde que ya no existe (404/410), se borra sola; también al cerrar sesión o tocar "Desactivar" | `endpoint` (PK: la dirección del dispositivo en Google, Apple, Mozilla o Microsoft), `usuario_id`, `clave_p256dh` y `clave_auth` (claves del navegador para cifrar el contenido), `creada`, `actualizada`. Índice `ix_suscripciones_push_usuario` |
| `asistente_uso` | **Asistente de IA (parche 28, script 11).** Cuántas preguntas hizo cada persona en cada hora (para los límites de uso). `WITHOUT ROWID` | PK (`hora` = `AAAA-MM-DDTHH` en UTC, `usuario_id`), `preguntas` |
| `contexto_externo` | **Asistente, contexto externo (parche 29, script 12).** Lo último que se trajo de las páginas de estado de proveedores y de las noticias; 1 fila por fuente (`proveedores`, `noticias`), se renueva como mucho una vez por hora y solo cuando alguien pregunta. `WITHOUT ROWID` | `fuente` (PK), `actualizado` (UTC), `contenido` (JSON ya resumido), `error` (si la última consulta falló) |
| `eventos_comerciales` | **Eventos comerciales (parche 29, script 12).** Días con tráfico distinto al habitual (Black Friday, CyberMonday, Hot Sale, promos de un cliente). Los carga el Administrador en Umbrales; hoy solo los usa el asistente | `id`, `nombre`, `fecha_desde`, `fecha_hasta` (`AAAA-MM-DD`, hasta 31 días), `cliente_id` y `servicio_id` (NULL = todos), `efecto_esperado` (`MAS_TRAFICO` / `MENOS_TRAFICO`), `nota`, `creado_por`, `creado`. Índice `ix_eventos_comerciales_fechas` |
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
3. **Revisión** (botón "Revisar alertas ahora" o escena de la demo; el cron está apagado), en un solo lote (`env.DB.batch`):
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
- **Modelo:** variable `ASISTENTE_MODELO` (por defecto `@cf/qwen/qwen3-30b-a3b-fp8`: buena relación calidad / neuronas y soporta herramientas). Acepta las respuestas en formato OpenAI o en el propio de Workers AI, y si un modelo no acepta mensajes de herramienta reintenta con los datos como texto. Para cambiar a otro modelo (por ejemplo `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, mejor en español pero unas 5 veces más caro en neuronas) alcanza con la variable.
- **Probar sin Cloudflare:** `ASISTENTE_LOCAL=simulado node --no-warnings servidor_local.mjs prueba.sqlite` usa un modelo de mentira que muestra qué datos recibió (sirve para ver la pantalla y los permisos).

---

## 8. Pantallas

| Pantalla | Quién | Qué muestra |
|---|---|---|
| Tablero (`/`) | Administrador (lectura), Analista y Gerente | Resumen arriba, **Estado por cliente** (Panorama: una tarjeta por cliente con cada servicio y canal en color: bien, viene empeorando, leve, importante, grave, sin datos o sin historia), barras de 24 h por cliente (con "Bien el X % del día" contra su objetivo), alertas abiertas por prioridad con estado y asignación, pre-alertas (con "Avisar a Soporte" para el analista), histórico. **El Gerente no ve** la lista de alertas abiertas ni las pre-alertas. Botones: Actualizar, Revisar alertas ahora (Admin y Analista), Derivar / Resolver (Analista) / Historial por alerta. Soporte que entra a `/` va a Mis alertas |
| Mis alertas (`/mis-alertas`) | Soporte | Su única página (sin enlace al tablero). Tarjetas por prioridad: En curso, Para tomar, De mis equipos (si es responsable), Resueltas en 24 h. Acciones: tomar, comentar, devolver, resolver, reasignar dentro del equipo |
| Seguimiento (`/seguimiento`) | Analista y Administrador (solo lectura) | Contadores (sin asignar, devueltas, asignadas sin tomar, en curso, resueltas 24 h) que filtran la tabla; filtros por estado, equipo, persona y cliente; tabla con prioridad, estado, quién la tiene, cuánto lleva en ese estado (en rojo si pasa 15 min sin asignar, 30 sin tomar o 2 h en curso) y última novedad; carga por equipo; resueltas en 24 h |
| Administración (`/admin`) | Administrador y Analista (pestañas según perfil) | Usuarios, Equipos, Reglas de alerta (solo Administrador), Derivación, **Umbrales** (solo Administrador), Modelo, Auditoría |
| Login (`/login`) | Todos | Ingreso y cambio de contraseña temporal. Después del ingreso, `/inicio` lleva a la página de cada perfil: Administración (Administrador), Mis alertas (Soporte) o el tablero (Analista y Gerente); con `?demo`, al tablero de la demo |

**Barra superior:** hora de los datos, Actualizar, Revisar alertas ahora, campanita y la foto de perfil. "Mis alertas", "Seguimiento" y "Administración" están **solo en el menú de la foto de perfil**, con el número de pendientes al lado; un punto rojo en la foto avisa que hay algo pendiente. En el mismo menú se elige el tema (claro, oscuro o sistema) y se cambia la contraseña.

**Estilo:** base neutra tipo Atlassian / InvGate (tipografía del sistema, bordes chicos, etiquetas de estado) con color principal verde azulado `#0F766E` (claro) / `#2DD4BF` (oscuro). Funciona en el celular sin desplazamiento horizontal.

**Umbrales (Administración):** valores generales + excepciones por cliente o por cliente y servicio. El diálogo muestra qué espera el modelo para ese alcance (tráfico, tasas, latencia, demora de llegada), cómo quedaría la banda con el porcentaje elegido y un botón "Usar lo recomendado". Desde el parche 27 (12/11) cada campo explica en palabras simples qué hace y muestra un ejemplo "En la práctica" que se actualiza al escribir (por ejemplo: "si se esperan 537 operaciones, es Importante con 403 o menos"; "se toleran hasta 2 ventanas de 15 minutos con problemas por día"). Validaciones: Grave tiene que ser mayor que Importante; bandas entre 50 % y 300 %. Cada cambio marca el tablero para recalcular y queda en auditoría.

---

## 9. Perfiles y permisos (se controlan en el servidor)

| Acción | Admin | Analista | Soporte | Gerente |
|---|---|---|---|---|
| Página de inicio | Administración | Tablero | Mis alertas | Tablero |
| Tablero: Panorama, 24 h, histórico, tiempos, clientes | Sí (lectura) | Sí | **No** | Sí |
| Tablero: alertas abiertas y pre-alertas | Sí (lectura) | Sí | No | **No** |
| Historial de una alerta | Sí | Sí | Solo las suyas o de su equipo | Sí |
| Derivar / reasignar | **No** | Sí | Solo si es responsable del equipo, y dentro de su equipo | No |
| Avisar a Soporte de una pre-alerta | No | Sí | No | No |
| Tomar | **No** | **No** (el analista solo deriva) | Solo lo asignado a él o a su equipo | No |
| Resolver | **No** | Cualquiera (por ejemplo, falsas alarmas) | Solo lo asignado a él | No |
| Devolver | — | — | Lo que tiene asignado | No |
| Mis alertas (bandeja propia) | No | No | Sí | No |
| Seguimiento (todas las abiertas, quién las tiene, carga por equipo) | Sí, solo lectura | Sí | No | **No** |
| Campanita | No | Sí (lleva a Seguimiento) | Sí (lleva a Mis alertas) | No |
| Avisos push en el dispositivo | No | Sí | Sí | No |
| Instalar Helios como app | Sí | Sí | Sí | Sí |
| Asistente de IA (responde con lo que el perfil puede ver; propone, no ejecuta) | Sí (sin propuestas de acción) | Sí | Sí | Sí (sin propuestas de acción) |
| Recibir alertas (destino de una derivación) | **No** | No | Sí | No |
| Reglas de alerta (del sistema y personalizadas) | Sí | **No** | No | No |
| Reglas de derivación, ver modelo | Sí | Sí | No | No |
| Usuarios, equipos, auditoría, umbrales por cliente | Sí | No | No | No |
| Revisar alertas ahora, modo demo | Sí | Sí | No | No |

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
| `POST /api/procesar` · `GET /procesar` | Correr el proceso de alertas; devuelve `{ok, registradas_o_actualizadas, resueltas, derivadas_automaticamente, filas_leidas, filas_escritas}` |
| `POST /api/alertas/{id}/derivar` | Body `{equipo_id?, usuario_id?, comentario?}` |
| `POST /api/alertas/{id}/tomar` · `/comentar` · `/devolver` · `/resolver` | Body `{comentario}`; obligatorio al devolver y al resolver. `/reconocer` sigue funcionando como sinónimo de `/tomar` |
| `GET /api/alertas/{id}/historial` | Eventos de la alerta (Soporte, solo de las suyas o de su equipo) |
| `POST /api/prealertas/avisar` | Analista: body con la clave de la pre-alerta activa (`tipo_prealerta`, `ambiente`, `cliente_id`, `servicio_id`, `producto_id`, `canal_id`, `moneda_id`) + `{equipo_id?, usuario_id?, comentario?}`. Crea avisos `PREALERTA` y queda en auditoría (`AVISAR_PREALERTA`); no crea alertas |
| `GET /mis-alertas` · `GET /api/mis-alertas` · `GET /api/asignables` | Bandeja personal (incluye `umbrales` para la prioridad y `mis_pendientes`) y a quién se puede derivar (solo Soporte) |
| `GET /seguimiento` · `GET /api/seguimiento` | Seguimiento: abiertas con asignación, eventos, resueltas de las últimas 24 h (por índice de `ventana_inicio`), equipos, miembros y umbrales |
| `GET /api/avisos` · `GET /api/avisos/contador` · `POST /api/avisos/{id}/leido` · `POST /api/avisos/leer-todos` | Campanita |
| `GET /api/push/clave` · `POST /api/push/suscribir` · `POST /api/push/desuscribir` | Avisos push: clave pública VAPID (null sin secreto o sin campanita), suscribir el dispositivo (body `{suscripcion, anterior?}`, lo que entrega `pushManager.subscribe()`), dejar de recibir (body `{endpoint}`, **pública**) |
| `GET /sw.js` · `/manifest.webmanifest` · `/icono-192.png` · `/icono-512.png` · `/apple-touch-icon.png` · `/icono-insignia.png` · `/favicon.ico` | **Públicas:** service worker, manifiesto e íconos para instalar Helios como app |
| `GET /api/asistente` · `POST /api/asistente` | Asistente de IA (todos los perfiles): estado, preguntas sugeridas del perfil y preguntas que quedan; preguntar con body `{pregunta, historia?}`, `{sugerencia}` o `{alerta_id}`. Devuelve `{respuesta, acciones, herramientas, restantes}`. Las `acciones` son propuestas: se ejecutan desde la página con las rutas de `/api/alertas/{id}/...`. 503 sin Workers AI, 429 al pasar los límites, 502 si el modelo falla |
| `GET /api/admin/eventos` · `POST /api/admin/eventos` · `POST /api/admin/eventos/borrar` | Eventos comerciales (solo Administrador, parche 29). Alta: `{nombre, fecha_desde, fecha_hasta?, cliente_id?, servicio_id?, efecto_esperado, nota?}`; baja: `{id}`. Quedan en auditoría |
| `GET /admin` · `/api/admin/usuarios`, `/equipos`, `/reglas`, `/derivacion`, `/modelo`, `/auditoria` | Administración |
| `GET /api/admin/umbrales` · `GET /api/admin/umbrales/recomendacion?cliente=&servicio=` · `POST /api/admin/umbrales` · `POST /api/admin/umbrales/borrar` | Umbrales (solo Administrador). El POST recibe `cliente_id`, `servicio_id` (vacíos = general) y los campos de `umbrales_config` en fracciones (0,25 = 25 %, 1 = banda del modelo); vacío = hereda |
| `GET /api/demo` · `POST /api/demo/preparar` · `POST /api/demo/siguiente` | Modo demo (`/?demo`) |

Respuestas JSON con `{ok: true, ...}` o `{ok: false, error: "mensaje para mostrar"}`.

---

## 11. La demo

- **Sin carga base** (desde el 11/11): la demo arranca sin datos recibidos. El perfil está entrenado con la historia hasta el lunes 26/10 a las 10:00 (hora de Argentina) y la escena 1 es la primera llegada de datos de cada serie; las escenas toman lo "normal" del perfil. `09_modelo_v2_d1.txt` vacía las métricas viejas. **Las fechas son fijas**: sirve para presentar cualquier día, todas las veces que haga falta.
- **Reloj:** "Preparar demo" lo pone en el lunes 26/10 a las 10:00 (hora de Argentina), borra alertas, eventos y avisos, borra las métricas desde ese momento y reactiva las reglas del sistema (las personalizadas no las toca). Cada "Siguiente escena" carga una ventana de 15 minutos y corre el proceso.
- **Las 19 escenas:** 1 Arranca la guardia · 2 La app de CLI_001 se queda muda · 3 CLI_001 se recupera solo · 4 Promo de recarga de transporte · 5 Suben los rechazos de CLI_004 · 6 Pre-alerta en CLI_004 · 7 Se confirma: rechazo alto en CLI_004 · 8 Falla el gateway de CLI_002 · 9 CLI_006 aprueba menos · 10 Transferencias fuera de lo común · 11 Tickets más chicos · 12 Pre-alerta: recargas lentas · 13 Se confirma: latencia alta en CLI_003 · 14 Caída total en CLI_006 · 15 El dato llega tarde · 16 Un bug informa mal la tasa · 17 Llega un cliente nuevo (CLI_008, sin historia) · 18 CLI_007 deja de enviar · 19 Cierre de la guardia.
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

**Contexto externo del asistente (13/11, parche 29; falta aplicar en Cloudflare)**

- Se le puede preguntar al asistente "¿hay algo de afuera que pueda afectar hoy o mañana?" (también es pregunta sugerida en los 4 perfiles). Responde con una herramienta nueva, `contexto_externo`, y cruza lo de afuera con las alertas y los servicios del cliente:
  1. **Calendario** (de la base, gratis): feriados, fines de semana largos, el primer día hábil después, 1.º a 4.º día hábil del mes (cobro de sueldos), aguinaldo y eventos comerciales.
  2. **Proveedores**: incidentes abiertos y mantenimientos de las próximas 48 h (páginas de estado públicas; por defecto Cloudflare y Twilio, configurable con `CONTEXTO_PROVEEDORES`).
  3. **Noticias** de Argentina de las últimas 48 h (buscador abierto GDELT): paros bancarios, caídas, cortes de luz, BCRA, billeteras. Se muestran con medio, fecha y enlace, aclarando que no están verificadas por Helios.
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
| `12_contexto_externo_d1.txt` | Tablas `contexto_externo` y `eventos_comerciales` (parche 29; falta correrlo) |
| `novedades_asistente_ia.md` | Asistente de IA: cómo activarlo en Cloudflare, qué responde a cada perfil, límites y problemas comunes |
| `novedades_avisos_push_y_app.md` | Avisos push, app instalable y logo nuevo: guía por dispositivo, problemas comunes, diagnóstico y cómo funciona |
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

- [x] Optimizar el motor (filtro por fecha con índice, mismo resultado) y sacar las vistas (11/11).
- [ ] Etapa 3: revisión incremental, `tablero_cache` como columna de `alerta_parametros` y `reglas_alerta` (sistema + personalizadas juntas).
- [ ] Quitar el modo demo y poner el reloj real (`ahora` = NULL).
- [ ] Borrar el Worker `worker-api-bi` y su token (Power BI ya no se usa). Para el agente, un token propio.
- [ ] Contraseñas: PBKDF2 a 600.000 iteraciones (se actualizan solas al ingresar), pepper secreto, política y duración de sesión; idealmente SSO.
- [ ] Ingesta real: endpoint `POST /api/metricas` con el formato acordado, que normalice las fechas (si hace falta guardar lo recibido crudo, se diseña la tabla en ese momento).
- [x] Modelo de largo plazo: perfil por día de la semana × franja × tercio del mes con 12 meses de historia (11/11).
- [ ] Perfil genérico para clientes nuevos; reentrenar el perfil cada tanto (por ejemplo, una vez por mes) con la historia real.
- [ ] Retención: avisos leídos de más de 30 días, métricas viejas resumidas.
- [x] Código en Git: GitHub privado `Zettita/Monitoreo` (12/11).
- [ ] Ambientes QA y producción, copias de seguridad.
- [x] Avisos push con Helios cerrado e instalar como app (12/11, parche 26; publicado).
- [ ] Avisos por Teams con webhook (etapa 5). Mail, SMS o app de celular (lo investiga la compañera; el servicio elegido tiene que tener una API HTTP simple, porque el Worker solo puede hacer `fetch`).
- [x] Perfiles: Gerente de lectura con Panorama, Analista deriva y avisa pre-alertas, Soporte solo con sus tickets, Administrador orientado a la configuración (11/11).
- [x] Criticidad por servicio, objetivo de disponibilidad y umbrales configurables por cliente (11/11).
- [ ] Definir advertencia vs. alerta (por ejemplo, `MEDIA` y `BAJA` = advertencia).
- [x] Prioridad P1–P4 en "Mis alertas" y en Seguimiento.
- [ ] Validar que los equipos tengan solo gente de Soporte (hoy se puede sumar un analista, que no va a poder tomar lo que se derive al equipo).
- [x] Asistente de IA con Workers AI, por perfil, que propone y no ejecuta (13/11, parche 28). Publicado el 13/11. Falta: probar la calidad de las respuestas con el modelo real; armar un set de 20 o 30 preguntas de prueba.
- [ ] Contexto externo del asistente (parche 29): aplicar en Cloudflare y probar con las fuentes reales. Más adelante: que los eventos comerciales también ajusten lo esperado (hoy solo los usa el asistente).
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
