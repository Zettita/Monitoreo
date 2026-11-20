# Sala de crisis · etapa 1 (parche 69) — plan de trabajo

> Primera etapa del **AICIM** (Asistente Inteligente de Coordinación de Incidentes Mayores), el que se presenta como "próxima capacidad" al final del video de demostración. Este documento lo leen el equipo y la IA de Ale: si algo cambia, se actualiza acá primero.
>
> **Estado (20/11):** decisiones confirmadas por Ale. Pasos 3, 4 y 5 hechos y probados en la rama `version-parche-69-sala-de-crisis` (secciones 5.1 y 6). Paso 6: Worker en `01_Worker/`, respaldo hecho y rama unida a `main` (20/11). **Falta:** correr los scripts y publicar en Cloudflare, y probar el asistente con el modelo real (lista en `novedades_sala_crisis.md`).

## 1. Qué es y qué no es la etapa 1

**Es:** una **sala de crisis dentro de Helios**. Cuando varias alertas son parte de un mismo problema grande, el Analista abre un **incidente mayor** que las agrupa. La sala muestra en una sola pantalla:
- el estado del incidente, quién lo dirige y desde cuándo;
- las alertas que agrupa;
- las tareas (quién hace qué, en qué estado);
- la línea de tiempo (cada hecho con su hora);
- y una guía de diagnóstico: qué componentes revisar, de qué dependen y qué pasó en incidentes parecidos.

El asistente de IA lee todo eso, explica, y **propone** asignar una tarea, comunicar o escalar. Como siempre, **no ejecuta nada**: la persona confirma con el botón de la acción.

**No es (queda para la etapa 2 o más adelante):**
- **Microsoft Teams.** La etapa 2 lleva la sala a un canal o chat de Teams (aviso automático con webhook, retomando el parche viejo de la rama `version-parche-30-avisos-teams`, y después un bot que conteste ahí). En la etapa 1 todo pasa dentro de Helios, así se prueba el flujo sin depender de IT.
- Que el asistente abra incidentes, asigne o escale solo.
- Correlación automática de alertas (depende de las definiciones de Hugo sobre servicios de acceso y tipo de impacto).
- SLAs por prioridad y escalamiento automático por tiempo (también de Hugo).

## 2. Decisiones (confirmadas por Ale el 20/11)

| # | Pregunta | Propuesta |
|---|---|---|
| 1 | ¿Los datos de ejemplo usan los clientes y servicios de la demo? | **Sí:** `CLI_001` a `CLI_008` y sus servicios (`TRANSFERENCIAS`, `PAGO_SERVICIOS`, `RECARGA_CELULAR`, `RECARGA_TRANSPORTE`), así coinciden con las 19 escenas. |
| 2 | ¿Quién abre y dirige la sala? | **Analista** abre, dirige, crea y asigna tareas, cambia el estado y cierra. **Soporte** ve las salas donde tiene tareas, las actualiza y deja notas. **Gerente** y **Administrador** solo leen. "Solo comunicados" no ve la sala: le llega lo que se comunique. |
| 3 | El catálogo de infraestructura (componentes y dependencias) no sale de las métricas. ¿Va como configuración? | **Sí:** es configuración, como los equipos o las plantillas: lo carga el script 24 con un ejemplo y después se edita. No es una "tabla de demo": un cliente real también tendría que cargarlo. Pantalla para editarlo: etapa 2; en la 1, solo por SQL. |
| 4 | ¿Los antecedentes de la guía, de dónde salen? | De lo que ya existe: alertas resueltas con causa (`alertas_historico.causa_resolucion`) e incidentes mayores cerrados con su causa raíz. Para la demo, el script 24 carga 3 incidentes mayores **cerrados** del mes anterior como historia ficticia (igual que el perfil se entrenó con historia ficticia). |
| 5 | ¿Cómo entra en la demo sin romper las 19 escenas? | Escenas nuevas **20 a 22** al final (abrir la sala con la caída de CLI_006, tareas y propuesta del asistente, restablecimiento y cierre). Las 19 actuales tienen que dar exactamente lo mismo: `test_auth` se compara escena por escena hasta la 19 y `out_a.txt` se regenera solo con el agregado del final. |

## 3. Diseño de datos (paso 3, hecho)

Script **`24_sala_crisis_d1.txt`** (fuente `sala_crisis_d1.sql`; los dos los genera `07_Codigo_fuente/worker/sala_crisis_sql.py`, 30 bloques): una sentencia por línea, sin comentarios, probado en SQLite con `SQLITE_LIMIT_COMPOUND_SELECT = 2`. Solo crea tablas e índices y carga el ejemplo: **no toca ninguna tabla existente**. Pasa de 26 a **32 tablas**. Sin el script, Helios funciona igual y la sala avisa que falta.

### `incidentes_mayores`
| Columna | Tipo | Qué es |
|---|---|---|
| `id` | INTEGER PK | Número del incidente (se muestra como "IM-12") |
| `titulo` | TEXT | "Caída de pagos de CLI_006" |
| `descripcion` | TEXT | Qué se sabe al abrir |
| `estado` | TEXT | `ABIERTO` → `MITIGADO` (servicio restablecido, se sigue mirando) → `RESUELTO` → `CERRADO` (con causa raíz y revisión) |
| `severidad` | TEXT | `CRITICA` o `ALTA` (las mismas palabras de Helios: Grave / Importante) |
| `cliente_id` · `servicio_id` | TEXT | Cliente y servicio principales; NULL si afecta a varios. El servicio arranca la guía de diagnóstico |
| `responsable_usuario_id` | INTEGER | Quien dirige la sala (un Analista) |
| `abierto_por` | INTEGER | Quien la abrió |
| `inicio` | TEXT | Desde cuándo se ve el problema (la primera ventana de las alertas), UTC ISO |
| `abierto` · `mitigado` · `resuelto` · `cerrado` | TEXT | Cuándo pasó a cada estado |
| `causa_raiz` | TEXT | Al cerrar (obligatoria para `CERRADO`) |
| `componente_causa_id` | INTEGER | Componente donde estuvo la causa (al cerrar): con esto la guía encuentra los antecedentes |
| `resumen_cierre` | TEXT | Qué se hizo y qué queda por mejorar |
| `origen` | TEXT | `HELIOS` (abierto en Helios) o `IMPORTADO` (antecedente cargado de antes). "Preparar demo" solo borra los `HELIOS` |
| `actualizado` | TEXT | Último cambio |

Índices: `ix_incidentes_mayores_estado` (`estado`, `abierto`) e `ix_incidentes_mayores_componente` (`componente_causa_id`, `cerrado`).

### `incidente_alertas`
Qué grupos de alertas agrupa cada incidente. Se guarda **una** `alerta_id` del grupo (como hace el tablero) y la clave para mostrarlo sin releer `alertas_historico`.
`incidente_id`, `alerta_id`, `tipo_alerta`, `cliente_id`, `servicio_id`, `canal_id`, `sumada_por`, `sumada`. PK (`incidente_id`, `alerta_id`). Índice por `alerta_id` (para mostrar "es parte de IM-12" en el detalle de la alerta).

### `incidente_tareas`
`id`, `incidente_id`, `titulo`, `detalle`, `responsable_usuario_id`, `equipo_id` (uno o los dos), `estado` (`PENDIENTE`, `EN_CURSO`, `HECHA`, `CANCELADA`), `componente_id` (qué componente revisa, opcional), `resultado` (al terminar), `creada_por`, `creada`, `vence` (opcional), `actualizada`, `terminada`, `propuesta_por_asistente` (0/1). Índices: (`incidente_id`, `estado`) y (`responsable_usuario_id`, `estado`) para "Mis tareas".

### `incidente_linea_tiempo`
`id`, `incidente_id`, `fecha`, `usuario_id` (NULL = Helios), `tipo` (`APERTURA`, `ALERTA_SUMADA`, `ESTADO`, `TAREA`, `NOTA`, `COMUNICADO`, `ESCALAMIENTO`, `CIERRE`), `texto`, `referencia` (id de tarea o de comunicado). Índice (`incidente_id`, `fecha`). Se escribe en el mismo `batch` que cada acción: nunca queda una acción sin su renglón.

### Para la guía de diagnóstico
- **`componentes_infraestructura`**: `id`, `nombre` (único), `tipo` (`GATEWAY`, `BASE_DE_DATOS`, `AUTENTICACION`, `PROVEEDOR_EXTERNO`, `RED`, `APLICACION`), `descripcion`, `area_responsable` (texto: "Pagos y transferencias", "Plataforma"…), `equipo_id` (opcional: el equipo de Helios que lo atiende, cuando exista), `que_revisar` (pasos concretos), `activo`.
- **`componente_dependencias`**: cada fila es "un servicio depende de un componente" (`servicio_id` lleno, `componente_id` vacío) o "un componente depende de otro" (`componente_id` lleno, `servicio_id` vacío); lo controla un CHECK. `cliente_id` NULL = vale para todos los clientes. Índice único (no se duplica al repetir la carga) e índice por servicio. Con eso la guía arma "Pago de servicios de CLI_006 → Gateway de pagos → Proveedor de cobranza".

Ejemplo cargado: **9 componentes** (Autenticación, Core de cuentas y saldos, Motor de transferencias, Red interbancaria, Gateway de pagos, Proveedor de cobranza de servicios, Proveedor de recargas de celular, Proveedor de carga de transporte, Balanceador y red de entrada) y **18 dependencias** para los 4 servicios de la demo (una particular de CLI_006); **3 incidentes mayores cerrados** de septiembre (IM-1 certificado vencido en el gateway de CLI_002, IM-2 demora de SMS en la autenticación de CLI_001, IM-3 mantenimiento del proveedor de recargas de CLI_003), con su línea de tiempo resumida y causa raíz. Los incidentes nuevos siguen desde IM-4.

**Probado** (SQLite con el límite de dos `SELECT` unidos y claves foráneas activas): crea las 6 tablas (quedan 32), repetir el script no duplica nada, la consulta de la guía usa el índice por servicio, los CHECK rechazan estados, severidades, tipos y dependencias mal armadas, y toda la batería y la demo dan igual con el script cargado.

## 4. Permisos (tabla `PERMISOS`)
| Permiso | Perfiles |
|---|---|
| `sala_crisis` (ver la lista y una sala) | ADMIN, GERENTE, ANALISTA; SOPORTE solo las salas donde tiene una tarea |
| `sala_crisis_dirigir` (abrir, sumar alertas, crear y asignar tareas, cambiar estado, cerrar) | ANALISTA |
| `sala_crisis_tarea` (actualizar **su** tarea y dejar notas) | SOPORTE, ANALISTA |

El servidor valida cada ruta; la página solo esconde botones. Todo queda en `auditoria` (`ABRIR_INCIDENTE_MAYOR`, `SUMAR_ALERTA_INCIDENTE`, `CREAR_TAREA_INCIDENTE`, `ACTUALIZAR_TAREA_INCIDENTE`, `CAMBIAR_ESTADO_INCIDENTE`, `CERRAR_INCIDENTE_MAYOR`, `ESCALAR_INCIDENTE`).

## 5. Lo que se programa (`patch69.py` + `sala_crisis_server.js` + `sala_crisis.html`)

En este orden, cada paso con su prueba antes del siguiente:

1. **Abrir un incidente mayor desde un grupo de alertas.** Botón "Abrir sala de crisis" en el detalle de una alerta grave abierta y en Seguimiento (selección de varias). `POST /api/incidentes` con `{titulo, descripcion, severidad, alertas:[alerta_id]}`. Sumar alertas después: `POST /api/incidentes/<id>/alertas`. Una alerta no puede estar en dos incidentes abiertos.
2. **Tareas y línea de tiempo.** `POST /api/incidentes/<id>/tareas`, `POST /api/incidentes/<id>/tareas/<t>` (estado, resultado), `POST /api/incidentes/<id>/notas`, `POST /api/incidentes/<id>/estado`. Avisos de la campanita y push al asignar una tarea (tipo `TAREA_INCIDENTE`, que lleva a la sala) y al cambiar el estado.
3. **Herramientas nuevas del asistente, solo lectura** (permiso `sala_crisis`): `estado_incidente` (estado, tiempos, alertas, últimos hechos), `tareas_incidente` (pendientes, demoradas, sin responsable) y `guia_diagnostico` (componentes del servicio afectado con sus dependencias y qué revisar, más los 3 antecedentes más parecidos con su causa). Preguntas sugeridas dentro de la sala: "¿Cómo vamos con este incidente?", "¿Qué reviso primero?", "¿Qué está demorado?".
4. **Propuestas del asistente**, que se confirman con el botón de la acción: `asignar_tarea` (título, responsable o equipo), `comunicar` (abre "Comunicar incidente" con el mensaje armado con el estado de la sala) y `escalar` (suma una tarea al responsable del componente o a un líder y le manda aviso). Las valida el servidor como las de hoy (`sugerir_accion`); Gerente y Administrador no reciben propuestas.
5. **Pantalla `/incidente/<id>`** (y la lista `/incidentes`): cabecera con estado, severidad, quién dirige y cuánto lleva; columnas de alertas, tareas y línea de tiempo; panel de diagnóstico; el asistente abierto en el contexto del incidente. Mismo tema que el resto (parche 58) y que funcione en el celular. Enlace "Sala de crisis" en el menú del usuario con el número de salas abiertas.

**Cuidado del plan gratuito:** la sala se carga en un solo viaje (~6 consultas, decenas de filas); nada se recalcula en cada carga; cada acción escribe 2 o 3 filas (acción + línea de tiempo + auditoría). El asistente dentro de la sala usa las mismas cuotas de siempre.

### 5.1 Cómo quedó (paso 4, 20/11)
- **Archivos:** `sala_crisis_server.js` (rutas, permisos, línea de tiempo, avisos, guía), `sala_crisis_asistente.js` (herramientas y propuestas del asistente), `sala_crisis.html` (página) y `patch69.py` (los inserta y toca el detalle de la alerta, el menú, la campanita, el push, "Preparar demo" y el panel del asistente).
- **Ruta extra** que no estaba en el plan: `GET /api/incidentes/candidatas` (Analista): las alertas abiertas que se pueden sumar, una por grupo, graves primero, marcando las que ya están en otra sala. La usa el diálogo "Abrir sala de crisis" / "Sumar alertas". También `GET /api/incidentes/contador`.
- **Detalle de la alerta:** aviso "Es parte de la sala de crisis IM-N" (o "Fue parte", si se cerró), botón "Abrir sala de crisis" (Analista, si la alerta no está en una sala abierta) y `?comunicar`, que abre "Comunicar incidente" con el mensaje que armó el asistente. Comunicar una alerta que está en una sala abierta deja el renglón COMUNICADO en la línea de tiempo de la sala.
- **Asistente:** las herramientas y propuestas de la sala se le ofrecen al modelo **solo si la pregunta se hace dentro de la sala** (`incidente_id`); afuera el asistente queda igual que antes (lo controla `salacrisistest`). Las tareas que propone y confirma una persona quedan marcadas ("Asistente" en la tarjeta, `propuesta_por_asistente = 1`, y "(propuesta del asistente)" en la auditoría).
- **Avisos:** `TAREA_INCIDENTE` (tarea nueva o escalamiento) e `INCIDENTE` (tarea hecha, cambio de estado), con `alerta_id = 'i' + número`; la campanita y el push llevan a `/incidente/<id>`. Una tarea de un equipo le avisa a su gente de Soporte.
- **Pantalla:** cabecera con estado, gravedad, desde cuándo y quién dirige; botones de quien dirige (mitigado, resuelto, volver a abierto, cerrar con causa raíz, escalar, sumar alertas, comunicar); tres columnas (alertas y guía · tareas · línea de tiempo con notas); en el celular, una debajo de la otra con las tareas primero. Gerente y Administrador la ven sin botones. Enlace "Sala de crisis" en el menú del usuario de todas las páginas.
- **Probado:** `salacrisistest.mjs` (93 controles: permisos de los 4 perfiles, abrir y sumar, una alerta en una sola sala abierta, tareas a persona y a equipo, notas, escalar, comunicar, estados y cierre, auditoría y línea de tiempo de cada acción, guía y antecedentes, asistente con modelo simulado, candidatas, páginas, Preparar demo y sin el script 24); demo igual y toda la batería; pantallas en PC (Analista, Soporte, Gerente) y celular, sin errores de JavaScript ni desplazamiento horizontal.

## 6. Demo (paso 5, hecho)
Las escenas traen **los datos**; las acciones de la sala las hace **quien presenta**, desde la pantalla (como derivar o resolver en las 19 de antes). El texto de cada escena dice qué tocar.
- **20 · Se cae el gateway de pagos** (17:45): CLI_006 Pago de servicios por API sin aprobaciones (3 alertas graves) y errores leves en CLI_002 (web) y CLI_005 (app). Quien presenta, como Analista, abre la sala desde la alerta grave y suma las otras dos.
- **21 · La sala de crisis trabaja** (18:00): sigue caído. En la sala, "¿Qué reviso primero?" al asistente: propone las tareas con la guía (gateway, proveedor de cobranza; IM-1 como antecedente) y el Analista las confirma.
- **22 · Servicio restablecido** (18:15): llega todo normal y las alertas se cierran solas; la sala sigue abierta hasta que el Analista la marca mitigada, comunica y la cierra con la causa raíz (queda como antecedente).
- Las 19 escenas de antes dan exactamente lo mismo: `out_a.txt` solo suma las líneas E20 a E22 (y "estado 22"); `test_auth` recorre ahora todas las escenas. `inctest` compara las 22 en incremental y en completa; `migtest` sigue con 19 (compara contra el Worker de antes del parche 38). `salacrisistest` recorre las 22 con la sala (106 controles).
- "Preparar demo" borra las salas abiertas en Helios (`origen = 'HELIOS'`) y deja los 3 antecedentes importados.

## 7. Pruebas y publicación (paso 6)
1. `build.py` + toda la batería + **`salacrisistest.mjs`** nueva: permisos por perfil (Soporte sin tarea no entra; Gerente lee y no escribe), una alerta no puede estar en dos incidentes abiertos, cada acción deja su renglón y su auditoría, cerrar exige causa raíz, avisos de tarea, herramientas del asistente rechazadas fuera del permiso, propuestas validadas, sin el script 24 todo sigue andando.
2. Demo: las 19 escenas iguales a hoy; las 20 a 22 nuevas.
3. Probar con el modelo real (Gemma 4) las 3 preguntas de la sala y ajustar.
4. Publicar: **primero** `24_sala_crisis_d1.txt` en la consola de D1, **después** el Worker.
5. Respaldo `99_Archivo_viejo/worker_antes_parche69/` con su `LEEME.md`, ramas `respaldo-antes-parche-69` (ya creada) y `version-parche-69-sala-de-crisis`, documentación (`contexto_helios_para_ia.md` sección 16, `CLAUDE.md`, `LEEME.md`), commit en español y `git push`.

## 8. Etapa 2 (para tener el rumbo, no se hace ahora)
- Aviso automático a un canal de Teams al abrir, cambiar de estado o cerrar una sala (webhook; retomar la rama `version-parche-30-avisos-teams`).
- Botón "Abrir en Teams" (chat grupal con los participantes por enlace directo, sin Microsoft Graph).
- Después, si IT lo aprueba: bot de Teams que conteste las mismas preguntas del asistente desde el canal.
- Pantalla para editar el catálogo de infraestructura.
