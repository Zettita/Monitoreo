// =====================================================================
// INTEGRACIÓN CON INVGATE Y JIRA (parche 41) — ARCHIVO PARA EL EQUIPO DE INTEGRACIÓN
//
// Helios ya resuelve todo lo de su lado (botón "Generar ticket", permisos, conversación, auditoría, el número en el correo
// y en el push). Acá está cómo se crea el ticket en cada herramienta.
//
// Jira (16/11): crearTicketJira crea el issue en https://monitoreo-helios.atlassian.net, proyecto KAN.
//   Para usarlo, en el Worker de Cloudflare:
//     Variable de texto:  TICKETS_JIRA = real
//     Secretos:           JIRA_USUARIO  (el mail de la cuenta de Atlassian) y JIRA_TOKEN (API token de esa cuenta)
//   Opcionales: JIRA_URL, JIRA_PROYECTO (por defecto el sitio y KAN de arriba), JIRA_TIPO (si no está, Helios elige
//   Task / Tarea / Story / Historia / Bug, el que exista en el proyecto).
//   Sin la variable, Jira sigue en modo simulado (HEL-101…). Sin los secretos, "Generar ticket" avisa y no guarda nada.
//
// InvGate: sigue en modo simulado. Para pasarlo a real, completar crearTicketInvgate y poner TICKETS_INVGATE = real,
//   con los secretos que necesite (INVGATE_URL, INVGATE_TOKEN). Nunca poner claves en el código ni en Git.
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
// Qué tiene que devolver:  { clave: 'KAN-12', url: 'https://…', estado: 'Abierto' }   (url y estado opcionales)
// Si algo falla: lanzar un Error con un mensaje para mostrar ("Jira no creó el ticket…"): Helios no guarda nada y lo muestra.
//
// Cambios de estado después (el ticket pasa a "En curso", "Resuelto", etc.): llamar a
//   await novedadTicket(env, sistema, clave, { estado, comentario })      (definida en tickets_server.js)
// desde donde se reciba la novedad (un webhook de InvGate/Jira o una consulta periódica). Actualiza el ticket y deja la
// novedad en la conversación de la alerta. Una ruta para webhooks se agrega en rutasTicketsIntegracion (abajo).
//
// Límites del plan gratuito: cada pedido externo cuenta como subpedido (50 por pedido) y hay 10 ms de CPU; usar fetch
// con tiempo máximo (pedidoConTiempo) y no hacer más de 1 o 2 llamadas por ticket.
// =====================================================================

const JIRA_SITIO = 'https://monitoreo-helios.atlassian.net';
const JIRA_PROYECTO_DEF = 'KAN';
const JIRA_TIPOS_PREFERIDOS = ['task', 'tarea', 'story', 'historia', 'bug', 'error', 'incident', 'incidente'];
let jiraTipoCache = null;

function jiraBase(env) {
  const u = String(env.JIRA_URL || JIRA_SITIO).trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u)) throw new Error('La dirección de Jira no es válida.');
  return u;
}

function jiraProyecto(env) {
  const p = String(env.JIRA_PROYECTO || JIRA_PROYECTO_DEF).trim();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(p)) throw new Error('La clave del proyecto de Jira no es válida.');
  return p;
}

function jiraAuth(env) {
  const usuario = String(env.JIRA_USUARIO || '').trim();
  const token = String(env.JIRA_TOKEN || '').trim();
  if (!usuario || !token) throw new Error('Falta configurar Jira: en el Worker hacen falta los secretos JIRA_USUARIO (el mail de Atlassian) y JIRA_TOKEN.');
  const bytes = new TextEncoder().encode(usuario + ':' + token);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'Basic ' + btoa(bin);
}

async function jiraLeer(r, que) {
  const texto = await r.text();
  let j = null;
  try { j = texto ? JSON.parse(texto) : null; } catch (e) { j = null; }
  if (r.status === 401 || r.status === 403) throw new Error('Jira rechazó el acceso. Revisá el mail (JIRA_USUARIO) y el token (JIRA_TOKEN).');
  if (!r.ok) {
    const msgs = j && Array.isArray(j.errorMessages) ? j.errorMessages.filter(Boolean) : [];
    const campos = j && j.errors && typeof j.errors === 'object' ? Object.keys(j.errors).map((k) => k + ': ' + j.errors[k]) : [];
    const msg = msgs.concat(campos).join(' ');
    throw new Error('Jira no ' + que + ': ' + String(msg || ('respondió ' + r.status)).slice(0, 300));
  }
  if (!j || typeof j !== 'object') throw new Error('Jira no ' + que + ': la respuesta no se pudo leer.');
  return j;
}

function jiraElegirTipo(lista) {
  const tipos = (Array.isArray(lista) ? lista : []).filter((t) => t && t.id && t.name && !t.subtask && !(Number(t.hierarchyLevel) > 0) && !/^epic$/i.test(String(t.name)));
  for (const n of JIRA_TIPOS_PREFERIDOS) {
    const hit = tipos.find((t) => String(t.name).toLowerCase() === n);
    if (hit) return { id: String(hit.id) };
  }
  if (tipos[0]) return { id: String(tipos[0].id) };
  throw new Error('Jira no tiene un tipo de tarea para crear en este proyecto. Configurá JIRA_TIPO (por ejemplo Task o Tarea).');
}

async function jiraTipo(env, base, auth, proyecto) {
  const pedido = String(env.JIRA_TIPO || '').trim().slice(0, 60);
  if (pedido) return { name: pedido };
  if (jiraTipoCache && jiraTipoCache.proyecto === proyecto && jiraTipoCache.base === base) return jiraTipoCache.tipo;
  const r = await pedidoConTiempo(base + '/rest/api/3/issue/createmeta/' + encodeURIComponent(proyecto) + '/issuetypes', {
    headers: { authorization: auth, accept: 'application/json' },
  });
  if (r.status === 404) throw new Error('Jira no encuentra el proyecto ' + proyecto + '.');
  const j = await jiraLeer(r, 'pudo consultar los tipos de tarea');
  const tipo = jiraElegirTipo(j.issueTypes || j.values);
  jiraTipoCache = { proyecto, base, tipo };
  return tipo;
}

function jiraNodos(linea) {
  const re = /https:\/\/[^\s)]+/g;
  const nodes = [];
  let last = 0, m;
  while ((m = re.exec(linea))) {
    if (m.index > last) nodes.push({ type: 'text', text: linea.slice(last, m.index) });
    const url = m[0].replace(/[.,;:]+$/, '');
    nodes.push({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] });
    last = m.index + url.length;
    if (last < m.index + m[0].length) nodes.push({ type: 'text', text: linea.slice(last, m.index + m[0].length) });
    last = m.index + m[0].length;
  }
  if (last < linea.length) nodes.push({ type: 'text', text: linea.slice(last) });
  return nodes.length ? nodes : [{ type: 'text', text: linea }];
}

function jiraAdf(datos) {
  let texto = String(datos.descripcion || '').trim();
  const extra = [];
  if (datos.enlace && texto.indexOf(datos.enlace) < 0) extra.push('Alerta en Helios: ' + datos.enlace);
  const quien = datos.solicitante && (datos.solicitante.nombre || datos.solicitante.usuario);
  if (quien) extra.push('Lo pidió en Helios: ' + quien);
  if (extra.length) texto = (texto ? texto + '\n\n' : '') + extra.join('\n');
  const content = [];
  for (const linea of texto.split('\n')) {
    const t = linea.replace(/\s+$/g, '').slice(0, 3000);
    if (!t) continue;
    content.push({ type: 'paragraph', content: jiraNodos(t) });
    if (content.length >= 80) break;
  }
  if (!content.length) content.push({ type: 'paragraph', content: [{ type: 'text', text: '(sin descripción)' }] });
  return { type: 'doc', version: 1, content };
}

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
  const base = jiraBase(env);
  const proyecto = jiraProyecto(env);
  const auth = jiraAuth(env);
  const tipo = await jiraTipo(env, base, auth, proyecto);
  const r = await pedidoConTiempo(base + '/rest/api/3/issue', {
    method: 'POST',
    headers: { authorization: auth, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: proyecto },
        issuetype: tipo,
        summary: String(datos.resumen || '').slice(0, 255),
        description: jiraAdf(datos),
      },
    }),
  });
  const j = await jiraLeer(r, 'creó el ticket');
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(j.key || '')) throw new Error('Jira no devolvió el número del ticket.');
  return { clave: j.key, url: base + '/browse/' + j.key, estado: 'Abierto' };
}

// Rutas que necesite la integración (por ejemplo, el webhook de Jira o InvGate). Devuelve una respuesta o null.
// Ojo: estas rutas no tienen sesión de Helios; protegerlas con un secreto propio (por ejemplo, ?clave= o un encabezado).
async function rutasTicketsIntegracion(env, request, ruta) {
  return null;
}
