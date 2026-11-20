# Sala de crisis en Teams (parche 70) — cómo ponerla en marcha

Etapa 2 del AICIM, partes **A** y **B**. La sala sigue viviendo en Helios (tareas, línea de tiempo, causa raíz): Teams es donde el equipo se entera y conversa.

- **A · Avisos en un canal de Teams.** Cada novedad de una sala llega al canal como tarjeta, con el botón **"Abrir sala en Helios"**: se abrió la sala, se sumó una alerta, tarea nueva, tarea hecha (con lo que se encontró), escalamiento, cambio de estado, comunicado y cierre. Las notas y "empezó la tarea" no se mandan, para no llenar el canal. Una sala grave abierta va en rojo.
- **B · "Chat en Teams"** en la sala: abre un chat grupal de Teams con quienes están en la sala (quien la abrió, quien la dirige, los responsables de las tareas y la gente de Soporte de los equipos con tareas), con el título del incidente y el enlace a la sala. Usa el correo de cada usuario (script 23). Si alguien no tiene correo cargado, el botón lo dice al pasar el mouse.
- **C · Bot de Helios en Teams** (trabajar la sala y preguntarle al asistente desde Teams): todavía no. Necesita lo de la sección 4.

No hay SQL nuevo. Sin configurar nada, B ya funciona y A no hace nada.

## 1. Publicar

1. Pegar `01_Worker/worker_alertas_cron.js` en "Edit code" del Worker `worker-alertas-cron` → Deploy.
2. Probar B: abrir una sala de crisis → **Chat en Teams**. Se abre Teams con el chat armado (la primera vez, el navegador puede preguntar si abre la app de Teams).

## 2. Conectar el canal (A)

Lo hace alguien que sea miembro del canal de Teams (no hace falta IT ni Azure):

1. En Teams, en el canal → **⋯ → Workflows** (o la app **Workflows**).
2. Elegir la plantilla **"Publicar en un canal cuando se recibe una solicitud de webhook"** (*Post to a channel when a webhook request is received*).
3. Elegir el equipo y el canal → **Agregar flujo de trabajo**. Teams muestra una dirección larga (`https://…logic.azure.com/…` o `https://…powerplatform.com/…`). **Copiarla.** Esa dirección es como una clave: quien la tiene puede publicar en el canal. No mandarla por chat ni subirla a Git.
4. En Cloudflare → Worker `worker-alertas-cron` → **Settings → Variables and Secrets → Add → Secret**, nombre `TEAMS_WEBHOOK`, valor: la dirección. Guardar (Deploy).
5. En Helios, como Administrador → **Administración → Equipos**, abajo: **Avisos en Teams** tiene que decir "Conectado". Tocar **Mandar aviso de prueba**: tiene que llegar una tarjeta "Aviso de prueba" al canal (desde el parche 73; antes salía como "IM-0").

Conectado el 20/11 al canal **Plataforma Monitoreo** (equipo Plataforma Monitoreo). Teams agrega abajo de cada tarjeta "<quien creó el flujo> used a Workflow template…": no se puede sacar desde Helios; para que no figure una persona, el flujo se crea con una cuenta de servicio y se actualiza el secreto.

## 3. Probarlo con la demo

Recorrer las escenas 20 a 22 como en `novedades_sala_crisis.md`. En el canal tienen que ir llegando:

| Acción en Helios | En el canal |
|---|---|
| Abrir sala de crisis | 🔴 IM-N · título, "Abrió la sala…" y las alertas sumadas |
| Sumar alertas | "Sumó la alerta: …" |
| Asignar una tarea (a mano o desde el asistente) | "Asignó la tarea «…» a …" |
| Soporte marca la tarea hecha | "Tarea «…»: hecha. <lo que encontró>" |
| Escalar | "Escaló a …: <motivo>" |
| Servicio restablecido / resuelto / cerrar | El estado nuevo y la causa raíz |
| Comunicar (desde la alerta de la sala) | "Comunicó el incidente…" |

Si un aviso no llega: en Cloudflare → **Observability**, buscar `Teams:` (el motivo que dio Teams). La acción en Helios se hace igual aunque Teams falle.

**Costo:** solo con el secreto cargado, y solo en las acciones de la sala: 2 consultas a D1 y un pedido a Teams por acción.

## 4. Para la parte C (bot): qué pedirle a IT

1. **Registrar el bot**: en el Developer Portal de Teams (Herramientas → Administración de bots), que no pide suscripción de Azure, o como recurso *Azure Bot* (plan F0, gratis; Teams es un canal sin costo). Necesitamos:
   - **ID de la aplicación** (Microsoft App ID),
   - un **secreto de cliente** (lo cargan ellos directo como secreto en Cloudflare; no por chat ni mail),
   - el **ID del tenant**,
   - que la app sea de **un solo tenant**.
2. **Dirección de mensajes del bot**: `https://worker-alertas-cron.developers-hs-842.workers.dev/api/teams/bot`.
3. **Permiso para instalar la app en Teams**: aprobarla en el catálogo de la organización (Centro de administración de Teams → Administrar aplicaciones) o habilitar "Cargar aplicaciones personalizadas" para quien la instale. Nosotros armamos el paquete (manifiesto e íconos).
4. **En qué equipo o canal** se va a usar el bot.
5. **Confirmar que el correo de cada persona en Teams es el mismo que tiene en Helios**: así el bot sabe quién escribe y aplica sus permisos.
6. **El OK para que datos de las alertas** (clientes, servicios, gravedad) **se muestren en Teams** (quedan dentro del Microsoft 365 de la empresa).

La primera versión no necesita permisos de Microsoft Graph. Si más adelante el bot tiene que crear reuniones o chats solo, eso sí lleva un permiso aparte.

## 5. Problemas comunes

- **"La dirección cargada en TEAMS_WEBHOOK no es de un flujo de Workflows de Teams"**: solo se aceptan direcciones de Microsoft (Workflows, Power Automate, Logic Apps). Las de los "Incoming Webhook" viejos de Office 365 también se aceptan, pero Microsoft los está dando de baja: usar Workflows.
- **Llega la prueba pero no las novedades**: los avisos salen solo de las acciones de la sala hechas en Helios (y de "Comunicar" desde una alerta que está en una sala). Las salas importadas (IM-1 a IM-3) no mandan nada.
- **"Teams respondió 400"**: el flujo de Workflows se modificó o se borró. Volver a crearlo y actualizar el secreto.
- **"Chat en Teams" está gris**: nadie más de la sala tiene correo cargado (Administración → Usuarios), o todavía no hay otras personas en la sala.
- **El chat de Teams se abre con una sola persona**: con una sola persona más, Teams arma un chat de a dos y no usa el título.
