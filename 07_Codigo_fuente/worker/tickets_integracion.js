// =====================================================================
// INTEGRACIÓN CON INVGATE Y JIRA (parche 41) — ARCHIVO PARA EL EQUIPO DE INTEGRACIÓN
//
// Helios ya resuelve todo lo de su lado (botón "Generar ticket", permisos, conversación, auditoría, el número en el correo
// y en el push). Acá solo falta completar cómo se crea el ticket en cada herramienta. Mientras tanto, cada herramienta
// funciona en modo SIMULADO (INV-1001, HEL-101…).
//
// Para pasar una herramienta a real:
//   1. Completar la función de abajo (crearTicketInvgate o crearTicketJira).
//   2. En el Worker de Cloudflare: Settings → Variables → TICKETS_INVGATE = real (o TICKETS_JIRA = real),
//      y los secretos que necesite (por ejemplo INVGATE_URL, INVGATE_TOKEN, JIRA_URL, JIRA_USUARIO, JIRA_TOKEN, JIRA_PROYECTO).
//      Nunca poner claves en el código ni en Git.
//
// Qué recibe cada función (datos):
//   { resumen,          // texto corto, ej. "[P2 · Importante] CLI_004 · Transferencias por app: Suben los rechazos"
//     descripcion,      // texto largo, armado con los datos de la alerta (editable por quien lo genera)
//     prioridad,        // 'P1' | 'P2' | 'P3' | 'P4'
//     gravedad,         // 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
//     tipo_alerta,      // ej. 'RECHAZO_ALTO'
//     cliente_id, servicio_id, canal_id, ambiente,
//     desde,            // inicio del problema, ISO UTC
//     enlace,           // https://…/alerta/<id> (la alerta en Helios)
//     alerta_id,        // id de la alerta en Helios (guardarlo en el ticket sirve para volver desde la herramienta)
//     solicitante: { id, nombre, usuario } }   // quién lo pidió en Helios
//
// Qué tiene que devolver:  { clave: 'INV-4521', url: 'https://…', estado: 'Abierto' }   (url y estado opcionales)
// Si algo falla: lanzar un Error con un mensaje para mostrar ("InvGate no respondió…"): Helios no guarda nada y lo muestra.
//
// Cambios de estado después (el ticket pasa a "En curso", "Resuelto", etc.): llamar a
//   await novedadTicket(env, sistema, clave, { estado, comentario })      (definida en tickets_server.js)
// desde donde se reciba la novedad (un webhook de InvGate/Jira o una consulta periódica). Actualiza el ticket y deja la
// novedad en la conversación de la alerta. Una ruta para webhooks se agrega en rutasTicketsIntegracion (abajo).
//
// Límites del plan gratuito: cada pedido externo cuenta como subpedido (50 por pedido) y hay 10 ms de CPU; usar fetch
// con tiempo máximo (pedidoConTiempo) y no hacer más de 1 o 2 llamadas por ticket.
// =====================================================================

async function crearTicketInvgate(env, datos) {
  // Ejemplo de por dónde va (a completar con la API real de InvGate Service Management):
  //   const r = await pedidoConTiempo(env.INVGATE_URL + '/api/v1/incident', { method: 'POST',
  //     headers: { authorization: 'Basic ' + btoa(env.INVGATE_USUARIO + ':' + env.INVGATE_TOKEN), 'content-type': 'application/json' },
  //     body: JSON.stringify({ title: datos.resumen, description: datos.descripcion, priority_id: … , category_id: … }) });
  //   const j = await r.json();
  //   return { clave: 'INV-' + j.request_id, url: env.INVGATE_URL + '/requests/show/index/id/' + j.request_id, estado: 'Abierto' };
  throw new Error('La integración con InvGate todavía no está terminada (TICKETS_INVGATE = real sin completar crearTicketInvgate).');
}

async function crearTicketJira(env, datos) {
  // Ejemplo de por dónde va (a completar con la API real de Jira):
  //   const r = await pedidoConTiempo(env.JIRA_URL + '/rest/api/3/issue', { method: 'POST',
  //     headers: { authorization: 'Basic ' + btoa(env.JIRA_USUARIO + ':' + env.JIRA_TOKEN), 'content-type': 'application/json' },
  //     body: JSON.stringify({ fields: { project: { key: env.JIRA_PROYECTO }, issuetype: { name: 'Incident' }, summary: datos.resumen,
  //       description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: datos.descripcion }] }] } } }) });
  //   const j = await r.json();
  //   return { clave: j.key, url: env.JIRA_URL + '/browse/' + j.key, estado: 'Abierto' };
  throw new Error('La integración con Jira todavía no está terminada (TICKETS_JIRA = real sin completar crearTicketJira).');
}

// Rutas que necesite la integración (por ejemplo, el webhook de Jira o InvGate). Devuelve una respuesta o null.
// Ojo: estas rutas no tienen sesión de Helios; protegerlas con un secreto propio (por ejemplo, ?clave= o un encabezado).
async function rutasTicketsIntegracion(env, request, ruta) {
  return null;
}

