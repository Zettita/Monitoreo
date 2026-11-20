# Sala de crisis · etapa 1 (parche 69) — plan de trabajo

> Primera etapa del **AICIM** (Asistente Inteligente de Coordinación de Incidentes Mayores), el que se presenta como "próxima capacidad" al final del video de demostración. Este documento lo leen el equipo y la IA de Ale: si algo cambia, se actualiza acá primero.
>
> **Estado (20/11):** plan escrito y rama creada. Falta confirmar las decisiones de la sección 2; recién después se programa.

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

## 2. Decisiones a confirmar antes del paso 3

| # | Pregunta | Propuesta |
|---|---|---|
| 1 | ¿Los datos de ejemplo usan los clientes y servicios de la demo? | **Sí:** `CLI_001` a `CLI_008` y sus servicios (`TRANSFERENCIAS`, `PAGO_SERVICIOS`, `RECARGA_CELULAR`, `RECARGA_TRANSPORTE`), así coinciden con las 19 escenas. |
| 2 | ¿Quién abre y dirige la sala? | **Analista** abre, dirige, crea y asigna tareas, cambia el estado y cierra. **Soporte** ve las salas donde tiene tareas, las actualiza y deja notas. **Gerente** y **Administrador** solo leen. "Solo comunicados" no ve la sala: le llega lo que se comunique. |
| 3 | El catálogo de infraestructura (componentes y dependencias) no sale de las métricas. ¿Va como configuración? | **Sí:** es configuración, como los equipos o las plantillas: lo carga el script 24 con un ejemplo y después se edita. No es una "tabla de demo": un cliente real también tendría que cargarlo. Pantalla para editarlo: etapa 2; en la 1, solo por SQL. |
| 4 | ¿Los antecedentes de la guía, de dónde salen? | De lo que ya existe: alertas resueltas con causa (`alertas_historico.causa_resolucion`) e incidentes mayores cerrados con su causa raíz. Para la demo, el script 24 carga 3 incidentes mayores **cerrados** del mes anterior como historia ficticia (igual que el perfil se entrenó con historia ficticia). |
| 5 | ¿Cómo entra en la demo sin romper las 19 escenas? | Escenas nuevas **20 a 22** al final (abrir la sala con la caída de CLI_006, tareas y propuesta del asistente, restablecimiento y cierre). Las 19 actuales tienen que dar exactamente lo mismo: `test_auth` se compara escena por escena hasta la 19 y `out_a.txt` se regenera solo con el agregado del final. |

## 3. Diseño de datos (borrador del paso 3)

Script **`24_sala_crisis_d1.txt`** (fuente `sala_crisis_d1.sql`): una sentencia por línea, sin comentarios, probado en SQLite con `SQLITE_LIMIT_COMPOUND_SELECT = 2`. Solo crea tablas e índices y carga el ejemplo: **no toca ninguna tabla existente**. Pasa de 26 a **32 tablas**. Sin el script, Helios funciona igual y la sala avisa que falta.

### `incidentes_mayores`
| Columna | Tipo | Qué es |
|---|---|---|
| `id` | INTEGER PK | Número del incidente (se muestra como "IM-12") |
| `titulo` | TEXT | "Caída de pagos de CLI_006" |
| `descripcion` | TEXT | Qué se sabe al abrir |
| `estado` | TEXT | `ABIERTO` → `MITIGADO` (servicio restablecido, se sigue mirando) → `RESUELTO` → `CERRADO` (con causa raíz y revisión) |
| `severidad` | TEXT | `CRITICA` o `ALTA` (las mismas palabras de Helios: Grave / Importante) |
| `cliente_id` | TEXT | Cliente principal; NULL si afecta a varios |
| `responsable_usuario_id` | INTEGER | Quien dirige la sala (un Analista) |
| `abierto_por` | INTEGER | Quien la abrió |
| `inicio` | TEXT | Desde cuándo se ve el problema (la primera ventana de las alertas), UTC ISO |
| `abierto` · `mitigado` · `resuelto` · `cerrado` | TEXT | Cuándo pasó a cada estado |
| `causa_raiz` | TEXT | Al cerrar (obligatoria para `CERRADO`) |
| `resumen_cierre` | TEXT | Qué se hizo y qué queda por mejorar |

Índices: `ix_incidentes_mayores_estado` (`estado`, `abierto`).

### `incidente_alertas`
Qué grupos de alertas agrupa cada incidente. Se guarda **una** `alerta_id` del grupo (como hace el tablero) y la clave para mostrarlo sin releer `alertas_historico`.
`incidente_id`, `alerta_id`, `tipo_alerta`, `cliente_id`, `servicio_id`, `canal_id`, `sumada_por`, `sumada`. PK (`incidente_id`, `alerta_id`). Índice por `alerta_id` (para mostrar "es parte de IM-12" en el detalle de la alerta).

### `incidente_tareas`
`id`, `incidente_id`, `titulo`, `detalle`, `responsable_usuario_id`, `equipo_id` (uno o los dos), `estado` (`PENDIENTE`, `EN_CURSO`, `HECHA`, `CANCELADA`), `resultado` (al terminar), `creada_por`, `creada`, `vence` (opcional), `actualizada`, `terminada`, `propuesta_por_asistente` (0/1). Índices: (`incidente_id`, `estado`) y (`responsable_usuario_id`, `estado`) para "Mis tareas".

### `incidente_linea_tiempo`
`id`, `incidente_id`, `fecha`, `usuario_id` (NULL = Helios), `tipo` (`APERTURA`, `ALERTA_SUMADA`, `ESTADO`, `TAREA`, `NOTA`, `COMUNICADO`, `ESCALAMIENTO`, `CIERRE`), `texto`, `referencia` (id de tarea o de comunicado). Índice (`incidente_id`, `fecha`). Se escribe en el mismo `batch` que cada acción: nunca queda una acción sin su renglón.

### Para la guía de diagnóstico
- **`componentes_infraestructura`**: `id`, `nombre` ("Gateway de pagos", "Base de cuentas", "Autenticación", "Proveedor de recargas"), `tipo` (`GATEWAY`, `BASE_DE_DATOS`, `AUTENTICACION`, `PROVEEDOR_EXTERNO`, `RED`, `APLICACION`), `descripcion`, `equipo_id` (quién lo atiende), `que_revisar` (pasos concretos), `activo`.
- **`componente_dependencias`**: une servicios y componentes, y componentes entre sí. `cliente_id` (NULL = todos), `servicio_id` (NULL = es una dependencia entre componentes), `componente_id`, `depende_de_componente_id`. Con eso la guía arma "Pago de servicios de CLI_006 → Gateway de pagos → Proveedor externo".

Ejemplo cargado: unos 8 componentes y 20 dependencias para los 4 servicios de la demo; 3 incidentes mayores cerrados del mes anterior (gateway de CLI_002, autenticación de CLI_001, proveedor de recargas de CLI_003), con su línea de tiempo resumida y causa raíz.

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

## 6. Demo (paso 5)
Escenas **20** "Se abre la sala de crisis" (el Analista agrupa la caída de CLI_006 y las alertas de aprobaciones), **21** "El asistente propone las tareas" (diagnóstico: gateway y proveedor; dos tareas a Soporte) y **22** "Servicio restablecido" (mitigado, comunicado y cierre con causa raíz). "Preparar demo" borra los incidentes mayores **abiertos** y los de la demo, y deja los 3 de historia.

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
