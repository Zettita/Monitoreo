// =====================================================================
// SALA DE CRISIS EN TEAMS (parche 70, etapa 2 del AICIM, partes A y B). Sin SQL nuevo.
//
// A · Avisos en un canal de Teams. Cada novedad de una sala (se abrió, se sumó una alerta, tarea nueva, tarea hecha,
//     escalamiento, cambio de estado, comunicado, cierre) llega al canal como tarjeta, con "Abrir sala en Helios".
//     - El canal se conecta con un flujo de Workflows de Teams ("Publicar en un canal cuando se recibe una solicitud de
//       webhook"). La dirección que da el flujo se carga como secreto del Worker: TEAMS_WEBHOOK.
//     - Sin el secreto no hace nada ni consulta la base.
//     - Sale de incidente_linea_tiempo: antes del pedido se toma el último id y después se mandan los renglones nuevos.
//       No se mandan las notas ni "empezó la tarea" (para no llenar el canal).
//     - Costo: solo en los POST de la sala y de "Comunicar incidente", y solo con el secreto: 2 consultas y 1 pedido a Teams.
//     - Solo se aceptan direcciones de Microsoft (Workflows / Power Automate / Logic Apps).
//     - Si Teams falla, la acción en Helios igual se hace (queda en el registro: "Teams: …").
//
// B · "Chat en Teams" en la sala: abre un chat grupal de Teams (enlace teams.microsoft.com/l/chat) con quienes están en
//     la sala (quien la abrió, quien la dirige, responsables de tareas y la gente de Soporte de los equipos con tareas),
//     con el título del incidente y el enlace a la sala. Usa usuarios.correo (script 23). No necesita Azure.
// =====================================================================
const TEAMS_HOSTS = /^https:\/\/[a-z0-9.-]+\.(logic\.azure\.com|powerplatform\.com|powerautomate\.com|azure-apim\.net|webhook\.office\.com)(:443)?\//i;
const TEAMS_TOPE_MS = 5000;
const TEAMS_MAX_RENGLONES = 8;
const TEAMS_MAX_CHAT = 40;   // personas en el enlace del chat (el enlace tiene que entrar en una URL)
const TEAMS_RUTAS = /^\/api\/(incidentes(\/|$)|alertas\/[^/]+\/comunicar$)/;
const TEAMS_SEV = { CRITICA: 'Grave', ALTA: 'Importante' };

function teamsUrl(env) {
  const u = String((env && env.TEAMS_WEBHOOK) || '').trim();
  return u && u.length < 2000 && !/\s/.test(u) && TEAMS_HOSTS.test(u) ? u : null;
}

// Antes del pedido: hasta qué renglón de la línea de tiempo ya se conocía (null = no hace falta mandar nada)
async function teamsMarca(env, request, ruta) {
  if (request.method !== 'POST' || !TEAMS_RUTAS.test(ruta) || !teamsUrl(env) || !env.DB) return null;
  try { const r = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM incidente_linea_tiempo').first(); return r ? r.m : null; }
  catch (e) { return null; }   // sin el script 24
}

// Un renglón de la línea de tiempo merece ir al canal?
function teamsVaAlCanal(x) {
  if (x.tipo === 'NOTA') return false;
  if (x.tipo === 'TAREA') return /^Asignó la tarea|: hecha/.test(x.texto || '');
  return true;
}

function teamsTarjetaSala(inc, renglones, resto, origen) {
  const urgente = inc.estado === 'ABIERTO' && inc.severidad === 'CRITICA';
  const est = { ABIERTO: 'Abierto', MITIGADO: 'Mitigado', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' }[inc.estado] || inc.estado;
  const cuerpo = [
    { type: 'TextBlock', text: 'Helios · Sala de crisis', size: 'Small', isSubtle: true, spacing: 'None' },
    { type: 'TextBlock', text: (urgente ? '🔴 ' : '') + 'IM-' + inc.id + ' · ' + inc.titulo, weight: 'Bolder', size: 'Medium', wrap: true, color: urgente ? 'Attention' : 'Default', spacing: 'None' },
    { type: 'TextBlock', text: [est, TEAMS_SEV[inc.severidad], inc.cliente_id, inc.servicio_id ? (PUSH_SERVICIO[inc.servicio_id] || inc.servicio_id) : null].filter(Boolean).join(' · '), isSubtle: true, wrap: true, spacing: 'None' },
  ];
  for (const x of renglones) {
    cuerpo.push({ type: 'TextBlock', text: '**' + (x.usuario || 'Helios') + '**: ' + x.texto, wrap: true, separator: true, spacing: 'Small' });
  }
  if (resto > 0) cuerpo.push({ type: 'TextBlock', text: 'Y ' + resto + ' novedades más en la sala.', isSubtle: true, size: 'Small' });
  const tarjeta = { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: cuerpo };
  if (/^https:\/\//.test(origen || '')) tarjeta.actions = [{ type: 'Action.OpenUrl', title: 'Abrir sala en Helios', url: origen + '/incidente/' + inc.id }];
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: tarjeta }] };
}

async function teamsMandar(url, mensaje) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mensaje), signal: AbortSignal.timeout(TEAMS_TOPE_MS) });
  if (!r.ok) throw new Error('Teams respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.status;
}

// Después del pedido: una tarjeta por sala con sus novedades
async function enviarTeamsSala(env, desde, origen) {
  const url = teamsUrl(env);
  if (!url || desde == null) return { enviados: 0 };
  const filas = (await env.DB.prepare(`SELECT l.id, l.incidente_id, l.tipo, l.texto, u.nombre AS usuario,
      i.titulo, i.estado, i.severidad, i.cliente_id, i.servicio_id
    FROM incidente_linea_tiempo l JOIN incidentes_mayores i ON i.id = l.incidente_id LEFT JOIN usuarios u ON u.id = l.usuario_id
    WHERE l.id > ?1 AND i.origen = 'HELIOS' ORDER BY l.id LIMIT 60`).bind(desde).all()).results.filter(teamsVaAlCanal);
  const porSala = new Map();
  for (const x of filas) { if (!porSala.has(x.incidente_id)) porSala.set(x.incidente_id, []); porSala.get(x.incidente_id).push(x); }
  let enviados = 0;
  for (const [id, rs] of porSala) {
    const inc = { id, titulo: rs[0].titulo, estado: rs[0].estado, severidad: rs[0].severidad, cliente_id: rs[0].cliente_id, servicio_id: rs[0].servicio_id };
    await teamsMandar(url, teamsTarjetaSala(inc, rs.slice(0, TEAMS_MAX_RENGLONES), rs.length - TEAMS_MAX_RENGLONES, origen));
    enviados++;
  }
  return { enviados };
}

// ---------- B · Chat en Teams ----------
// Quiénes están en la sala, con su correo. Quien mira no va en la lista (Teams lo suma solo).
async function teamsChatSala(env, yo, inc, tareas) {
  if (!(await hayCorreoUsuarios(env))) return { correos: [], sin_correo: [], falta_script: true };
  const ids = new Set([inc.abierto_por, inc.responsable_usuario_id]);
  const equipos = new Set();
  for (const t of tareas) {
    if (t.estado === 'CANCELADA') continue;
    if (t.responsable_usuario_id != null) ids.add(t.responsable_usuario_id);
    else if (t.equipo_id != null) equipos.add(t.equipo_id);
  }
  for (const e of equipos) for (const u of await miembrosActivos(env, e)) ids.add(u);
  ids.delete(null); ids.delete(undefined); ids.delete(yo.id);
  if (!ids.size) return { correos: [], sin_correo: [] };
  const lista = [...ids].slice(0, 90);
  const r = await env.DB.prepare(`SELECT id, nombre, correo FROM usuarios WHERE activo = 1 AND id IN (${lista.map((_, i) => '?' + (i + 1)).join(', ')}) ORDER BY nombre COLLATE NOCASE`)
    .bind(...lista).all();
  const con = r.results.filter((u) => u.correo), sin = r.results.filter((u) => !u.correo);
  return { correos: con.slice(0, TEAMS_MAX_CHAT).map((u) => u.correo), nombres: con.slice(0, TEAMS_MAX_CHAT).map((u) => u.nombre), sin_correo: sin.map((u) => u.nombre) };
}

// ---------- Administración > Equipos: estado y aviso de prueba (solo Administrador) ----------
async function rutasTeams(env, request, p, yo) {
  if (request.method === 'GET' && p === '/teams') {
    return okJson({ configurado: !!teamsUrl(env), cargado: !!(env && env.TEAMS_WEBHOOK) });
  }
  if (request.method === 'POST' && p === '/teams/probar') {
    const url = teamsUrl(env);
    if (!url) return jsonError(env && env.TEAMS_WEBHOOK ? 'La dirección cargada en TEAMS_WEBHOOK no es de un flujo de Workflows de Teams.' : 'Falta cargar el secreto TEAMS_WEBHOOK en el Worker.', 409);
    const prueba = { id: 0, titulo: 'Aviso de prueba', estado: 'ABIERTO', severidad: 'ALTA' };
    const msg = teamsTarjetaSala(prueba, [{ usuario: yo.nombre, texto: 'Mandó un aviso de prueba desde Administración. Si lo ves, las novedades de las salas de crisis ya llegan a este canal.' }], 0, null);
    try { await teamsMandar(url, msg); }
    catch (e) { return jsonError('No se pudo mandar a Teams (' + (e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message) + ').', 502); }
    await env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'TEAMS_PRUEBA', 'Aviso de prueba a Teams').run();
    return okJson({});
  }
  return null;
}
