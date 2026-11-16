// =====================================================================
// INTEGRACIÓN CON INVGATE Y JIRA (parche 41) — ARCHIVO PARA EL EQUIPO DE INTEGRACIÓN
//
// Helios ya resuelve todo lo de su lado (botón "Generar ticket", permisos, conversación, auditoría, el número en el correo
// y en el push). Jira crea el issue (parche 53). InvGate sigue en modo simulado (INV-1001…) hasta completar crearTicketInvgate.
//
// Para pasar InvGate a real:
//   1. Completar crearTicketInvgate.
//   2. En el Worker de Cloudflare: Settings → Variables → TICKETS_INVGATE = real,
//      y los secretos que necesite (por ejemplo INVGATE_URL, INVGATE_TOKEN).
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

// ---- JIRA (parche 53) ----------------------------------------------------------------------------------------------
// Jira Cloud, API REST v3 (POST /rest/api/3/issue). Secretos en Cloudflare (nunca en el código ni en Git):
//   JIRA_USUARIO    correo de la cuenta de Atlassian     JIRA_TOKEN  token de API de esa cuenta
//   TICKETS_JIRA    real
// Opcionales (si no están, se usa el sitio y el proyecto de esta demo):
//   JIRA_URL        por defecto https://monitoreo-helios.atlassian.net
//   JIRA_PROYECTO   por defecto KAN
//   JIRA_TIPO       nombre del tipo tal como figura en el proyecto: "Tarea", "Task", "Bug"… (por defecto "Task")
// No se manda el campo "prioridad" (no todos los proyectos lo tienen): la prioridad P1–P4 va en la descripción y como etiqueta.
// Hasta 2 llamadas por ticket (la 2.ª solo si el proyecto no admite etiquetas).
const JIRA_SITIO = 'https://monitoreo-helios.atlassian.net';
const JIRA_PROYECTO_DEF = 'KAN';
const jiraTexto = (t) => String(t || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
const jiraParrafo = (linea, enlace) => {
  const partes = [];
  const m = enlace ? linea.indexOf(enlace) : -1;
  if (m >= 0) {
    if (m > 0) partes.push({ type: 'text', text: linea.slice(0, m) });
    partes.push({ type: 'text', text: enlace, marks: [{ type: 'link', attrs: { href: enlace } }] });
    if (m + enlace.length < linea.length) partes.push({ type: 'text', text: linea.slice(m + enlace.length) });
  } else partes.push({ type: 'text', text: linea });
  return { type: 'paragraph', content: partes };
};
function jiraDescripcion(datos) {
  const lineas = [];
  if (datos.prioridad) lineas.push('Prioridad en Helios: ' + datos.prioridad + (datos.gravedad ? ' · Gravedad: ' + datos.gravedad : ''));
  jiraTexto(datos.descripcion).split('\n').forEach((l) => { if (l.trim()) lineas.push(l); });
  if (datos.enlace && !lineas.some((l) => l.indexOf(datos.enlace) >= 0)) lineas.push('Alerta en Helios: ' + datos.enlace);
  const quien = datos.solicitante && jiraTexto(datos.solicitante.nombre || datos.solicitante.usuario).replace(/\s+/g, ' ').trim();
  if (quien) lineas.push('Lo pidió en Helios: ' + quien.slice(0, 120));
  const content = lineas.slice(0, 200).map((l) => jiraParrafo(l.slice(0, 2000), datos.enlace));
  return { type: 'doc', version: 1, content: content.length ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '(sin descripción)' }] }] };
}
const jiraEtiqueta = (t) => String(t || '').replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 60);
function jiraBase(env) {
  const u = String(env.JIRA_URL || JIRA_SITIO).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s\/]+$/.test(u)) throw new Error('Falta configurar la conexión con Jira (JIRA_URL tiene que ser https://…).');
  return u;
}
function jiraAuth(usuario, token) {
  const bytes = new TextEncoder().encode(usuario + ':' + token);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'Basic ' + btoa(bin);
}
// Mensaje claro a partir de lo que contesta Jira (nunca incluye credenciales)
async function jiraError(r) {
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  const detalle = j ? [].concat(j.errorMessages || [], Object.values(j.errors || {})).filter(Boolean).join(' · ').slice(0, 300) : '';
  if (r.status === 401) return 'Jira no aceptó el usuario o el token. Revisá JIRA_USUARIO y JIRA_TOKEN.';
  if (r.status === 403) return 'La cuenta de Helios no tiene permiso para crear tickets en ese proyecto de Jira.' + (detalle ? ' (' + detalle + ')' : '');
  if (r.status === 404) return 'Jira no encontró el sitio o el proyecto. Revisá JIRA_URL y JIRA_PROYECTO.';
  if (r.status === 429) return 'Jira pidió esperar un momento. Probá de nuevo en un minuto.';
  if (r.status >= 500) return 'Jira no está respondiendo bien en este momento (error ' + r.status + ').';
  return 'Jira no aceptó el ticket' + (detalle ? ': ' + detalle : ' (error ' + r.status + ').');
}

async function crearTicketJira(env, datos) {
  const usuario = String(env.JIRA_USUARIO || '').trim();
  const token = String(env.JIRA_TOKEN || '').trim();
  if (!usuario || !token) throw new Error('Falta configurar la conexión con Jira (hacen falta los secretos JIRA_USUARIO y JIRA_TOKEN en el Worker).');
  const base = jiraBase(env);
  const proyecto = String(env.JIRA_PROYECTO || JIRA_PROYECTO_DEF).trim();
  const campos = {
    project: { key: proyecto },
    issuetype: { name: String(env.JIRA_TIPO || 'Task').trim() },
    summary: jiraTexto(datos.resumen).replace(/\s+/g, ' ').trim().slice(0, 250),
    description: jiraDescripcion(datos),
    labels: ['helios'].concat(datos.prioridad ? [jiraEtiqueta(datos.prioridad)] : [], datos.tipo_alerta ? [jiraEtiqueta(datos.tipo_alerta)] : []),
  };
  const pedir = (f) => pedidoConTiempo(base + '/rest/api/3/issue', { method: 'POST',
    headers: { authorization: jiraAuth(usuario, token), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ fields: f }) });
  let r = await pedir(campos);
  if (r.status === 400) {
    // Algunos proyectos no tienen el campo "etiquetas" en la pantalla de creación: se reintenta una vez sin él.
    let j = null; try { j = await r.clone().json(); } catch (e) { /* sin cuerpo */ }
    if (j && j.errors && j.errors.labels) { delete campos.labels; r = await pedir(campos); }
  }
  if (r.status !== 201 && r.status !== 200) throw new Error(await jiraError(r));
  let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ }
  if (!j || !j.key) throw new Error('Jira contestó, pero no devolvió el número del ticket.');
  return { clave: String(j.key), url: base + '/browse/' + encodeURIComponent(j.key), estado: 'Abierto' };
}

// Rutas que necesite la integración (por ejemplo, el webhook de Jira o InvGate). Devuelve una respuesta o null.
// Ojo: estas rutas no tienen sesión de Helios; protegerlas con un secreto propio (por ejemplo, ?clave= o un encabezado).
async function rutasTicketsIntegracion(env, request, ruta) {
  return null;
}
