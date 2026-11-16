# Integración de tickets con InvGate y Jira (parche 41)

Guía de la integración con InvGate y Jira. Helios ya tiene todo lo de su lado. Jira crea el issue; InvGate falta completarlo, en el mismo archivo.

## Qué hace Helios hoy

- En el detalle de una alerta (`/alerta/<id>`), el Analista y Soporte (en lo suyo o de su equipo) tienen **"Generar ticket"**: eligen InvGate o Jira y Helios arma el resumen y la descripción con los datos de la alerta (se pueden editar). También desde **"Template correo alerta"**, con la casilla "Generar ticket ahora en …".
- **No sale solo:** el ticket se genera solo cuando una persona lo pide.
- Un ticket por herramienta y por problema (todas las ventanas de la misma alerta). Queda en la tabla `tickets_alerta`, en la conversación ("Generó el ticket INV-1001 en InvGate"), en la auditoría (`GENERAR_TICKET`) y avisa a quien tiene la alerta y a quien la derivó.
- El número se suma solo al **correo** (asunto `[INV-1001] …`, variable `{ticket}` de las plantillas) y va a sumarse al **push de incidente** (parche 42).
- **Jira ya crea el issue** en `https://monitoreo-helios.atlassian.net`, proyecto **KAN**, cuando la variable `TICKETS_JIRA` vale `real` y están los secretos. **InvGate** sigue en modo simulado.
- Sin la variable de cada herramienta, Helios inventa el número (`INV-1001`, `HEL-101`…) y lo marca "simulado" en pantalla.

## El archivo de la integración

Archivo: `07_Codigo_fuente/worker/tickets_integracion.js`. El build lo mete en el Worker (parche 41).

| Función | Qué hace |
|---|---|
| `crearTicketInvgate(env, datos)` | Crea el ticket en InvGate y devuelve `{ clave, url, estado }`. **Todavía sin completar** |
| `crearTicketJira(env, datos)` | Crea el issue en Jira Cloud (por defecto el proyecto KAN) y devuelve `{ clave, url, estado }` |
| `rutasTicketsIntegracion(env, request, ruta)` | Rutas propias de la integración bajo `/api/integraciones/…` (por ejemplo, el webhook que avisa los cambios). **No tienen sesión de Helios:** protegerlas con un secreto propio |

Funciones de Helios que se pueden usar:

- `novedadTicket(env, sistema, clave, { estado, comentario })`: registra un cambio del ticket (pasa a "En curso", "Resuelto", un comentario del técnico…). Actualiza `tickets_alerta.estado` y deja la novedad en la conversación de la alerta. Devuelve `false` si no conoce el ticket.
- `pedidoConTiempo(url, opciones, ms)`: `fetch` con tiempo máximo (8 s por defecto) y mensajes de error claros.

### Qué recibe `datos`

| Campo | Ejemplo |
|---|---|
| `resumen` | `[P2 · Importante] CLI_004 · Transferencias por app: Suben los rechazos` |
| `descripcion` | Texto con qué pasa, cliente, servicio, desde cuándo, gravedad, última medición, estado y enlace (editable por quien lo pide) |
| `prioridad` | `P1` a `P4` |
| `gravedad` | `CRITICA`, `ALTA`, `MEDIA` o `BAJA` |
| `tipo_alerta` | `RECHAZO_ALTO`, `VOLUMEN_BAJO`, `PERS_3`… |
| `cliente_id`, `servicio_id`, `canal_id`, `ambiente` | `CLI_004`, `TRANSFERENCIAS`, `MOBILE`, `PROD` |
| `desde` | Inicio del problema, ISO en UTC |
| `enlace` | `https://…/alerta/<id>`: conviene guardarlo en el ticket para volver a Helios |
| `alerta_id` | Id de la alerta en Helios |
| `solicitante` | `{ id, nombre, usuario }` de quien lo pidió |

### Qué tiene que devolver

`{ clave: 'INV-4521', url: 'https://…', estado: 'Abierto' }`. `url` (solo `https://`) y `estado` son opcionales. Si algo falla, **lanzar un `Error` con un mensaje para mostrar**: Helios no guarda nada y se lo muestra a la persona (respuesta 502).

## Cómo se prende Jira

En Cloudflare, Worker `worker-alertas-cron` → Settings → Variables and secrets:

| Nombre | Tipo | Valor |
|---|---|---|
| `TICKETS_JIRA` | variable de texto | `real` |
| `JIRA_USUARIO` | secreto | el mail de la cuenta de Atlassian que crea los issues |
| `JIRA_TOKEN` | secreto | un API token de esa cuenta (id.atlassian.com → Security → API tokens) |

Opcionales (si no están, se usa el sitio y el proyecto de esta demo):

| Nombre | Tipo | Por defecto |
|---|---|---|
| `JIRA_URL` | secreto o variable | `https://monitoreo-helios.atlassian.net` |
| `JIRA_PROYECTO` | secreto o variable | `KAN` |
| `JIRA_TIPO` | secreto o variable | el que encuentre: Task, Tarea, Story, Historia, Bug, Error |

Sin `TICKETS_JIRA = real`, el botón sigue en simulado. Con `real` y sin los dos secretos, "Generar ticket" dice que falta configurarlos y no guarda nada. El token no se escribe en el código ni en Git.

La cuenta del token queda como quien creó el issue en Jira. En la descripción va quién lo pidió desde Helios y el enlace a la alerta. Son dos pedidos como máximo: uno para ver los tipos de tarea del proyecto y uno para crear. El tipo se recuerda mientras el Worker sigue en marcha.

## Cómo se pasa InvGate a real

1. Completar `crearTicketInvgate`.
2. Variable `TICKETS_INVGATE = real` y los secretos que use (`INVGATE_URL`, `INVGATE_TOKEN`). **Nunca en el código ni en Git.**
3. Con la variable en `real` y la función sin completar, "Generar ticket" muestra "La integración con InvGate todavía no está terminada" y no guarda nada.

Cada herramienta se pasa por separado: hoy Jira puede estar en real y InvGate en simulado.

## Cómo probarlo sin las herramientas

`07_Codigo_fuente/pruebas/integraciontest.mjs` arma una copia del Worker con una integración de mentira (devuelve `INV-4501…`, falla si el resumen dice "FALLA" y tiene un webhook protegido con un encabezado) y comprueba de punta a punta: los datos que recibe la función, qué se guarda, la conversación, el webhook con `novedadTicket`, los errores y el modo simulado. Sirve de ejemplo de cómo enchufar las funciones reales.

```bash
cd 07_Codigo_fuente/pruebas
node --no-warnings ../worker/mkdb.mjs base.sqlite integraciontest.sqlite && node --no-warnings integraciontest.mjs integraciontest.sqlite
```

## Límites del plan gratuito de Cloudflare

- 10 ms de CPU y 50 subpedidos por pedido: 1 o 2 llamadas a la herramienta por ticket, con tiempo máximo (`pedidoConTiempo`).
- Las rutas de webhook leen y escriben poco: `novedadTicket` hace 1 lectura y 2 escrituras.

## Base de datos

Script `02_Base_de_datos_D1/19_tickets_d1.txt` (tabla `tickets_alerta`; quedan 24 tablas): `id`, `alerta_id` (la ventana desde la que se generó; el detalle encuentra los tickets de todo el problema), `sistema` (`INVGATE` / `JIRA`), `clave` (única por herramienta), `url`, `estado`, `simulado` (0/1), `resumen`, `descripcion`, `creado_por`, `creado`, `actualizado`. "Preparar demo" borra los tickets de Helios (no los de las herramientas).
