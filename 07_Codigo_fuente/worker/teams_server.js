// =====================================================================
// AVISOS EN TEAMS (parche 30)
//
// Manda los avisos importantes a un canal de Microsoft Teams, como una tarjeta.
// - El canal se conecta con un flujo de Workflows de Teams ("Publicar en un canal cuando se recibe una
//   solicitud de webhook"). La dirección que da ese flujo se carga como secreto del Worker: TEAMS_WEBHOOK.
//   (Los "Incoming Webhook" viejos de Office 365 dejaron de funcionar en mayo de 2026.)
// - Sin el secreto no hace nada (ni consulta la base).
// - Qué se manda: grave sin asignar, alerta asignada, pre-alerta avisada a Soporte, devuelta y resuelta.
//   Los comentarios no (para no llenar el canal).
// - Un aviso de la campanita es uno por persona; al canal va UN mensaje por hecho, con a quién le llegó.
// - Cuidado del plan: 2 consultas y 1 pedido externo por cada POST que creó avisos (solo con el secreto).
// - Solo se aceptan direcciones de Microsoft (Workflows / Power Automate / Logic Apps), así el Worker
//   no le manda pedidos a cualquier dirección.
// =====================================================================

const TEAMS_HOSTS = /^https:\/\/[a-z0-9.-]+\.(logic\.azure\.com|powerplatform\.com|powerautomate\.com|azure-apim\.net|webhook\.office\.com)(:443)?\//i;
const TEAMS_TIPOS = ['ASIGNADA', 'GRAVE_SIN_ASIGNAR', 'PREALERTA', 'DEVUELTA', 'RESUELTA'];
const TEAMS_MAX = 6;          // hechos por mensaje (el resto: "y N más")
const TEAMS_TOPE_MS = 5000;
const TEAMS_SEV = { CRITICA: 'Grave', ALTA: 'Importante', MEDIA: 'Leve', BAJA: 'Informativa' };

function teamsUrl(env) {
  const u = String((env && env.TEAMS_WEBHOOK) || '').trim();
  return u && u.length < 2000 && !/\s/.test(u) && TEAMS_HOSTS.test(u) ? u : null;
}
async function teamsUltimoAviso(env) {
  try { const r = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM avisos').first(); return r ? r.m : null; } catch (e) { return null; }
}

// Un hecho por (tipo, alerta) o, en las pre-alertas, por texto. Con a quién le llegó.
const Q_TEAMS_PENDIENTES = `
SELECT MIN(a.id) AS id, a.tipo, a.alerta_id, MIN(a.texto) AS texto, MIN(a.detalle) AS detalle,
       GROUP_CONCAT(u.nombre, ', ') AS para,
       h.tipo_alerta, h.cliente_id, h.servicio_id, h.canal_id, h.valor_observado, h.severidad_maxima, h.resuelta_por,
       ua.nombre AS asignado_nombre, eq.nombre AS equipo_nombre, rp.nombre AS regla_nombre
FROM avisos a
JOIN usuarios u ON u.id = a.usuario_id
LEFT JOIN alertas_historico h ON h.alerta_id = a.alerta_id
LEFT JOIN usuarios ua ON ua.id = h.asignado_usuario_id
LEFT JOIN equipos eq ON eq.id = h.asignado_equipo_id
LEFT JOIN alerta_reglas_personalizadas rp ON 'PERS_' || rp.id = h.tipo_alerta
WHERE a.id > ?1 AND a.tipo IN ('ASIGNADA', 'GRAVE_SIN_ASIGNAR', 'PREALERTA', 'DEVUELTA', 'RESUELTA')
GROUP BY a.tipo, COALESCE(a.alerta_id, a.texto)
ORDER BY MIN(a.id)
LIMIT 30`;

// Texto para el canal (la campanita le habla a una persona: "se te asignó"; el canal, a todos)
function teamsHecho(x) {
  const alerta = x.tipo_alerta
    ? (x.regla_nombre || (x.tipo_alerta === 'VOLUMEN_BAJO' && x.valor_observado === 0 ? 'No está entrando tráfico' : PUSH_FRASE[x.tipo_alerta] || x.tipo_alerta)) +
      ' · ' + x.cliente_id + ', ' + (PUSH_SERVICIO[x.servicio_id] || x.servicio_id) + ' por ' + (PUSH_CANAL[x.canal_id] || x.canal_id)
    : '';
  const gravedad = TEAMS_SEV[x.severidad_maxima] || null;
  const regla = /regla «([^»]+)»/.exec(x.texto || '');
  let titulo, detalle = [], urgente = false;
  if (x.tipo === 'GRAVE_SIN_ASIGNAR') { titulo = 'Alerta grave sin asignar'; urgente = true; detalle.push('Nadie la tiene y ninguna regla la deriva: hay que derivarla.'); }
  else if (x.tipo === 'ASIGNADA') {
    titulo = 'Alerta asignada a ' + ([x.asignado_nombre, x.equipo_nombre ? 'equipo ' + x.equipo_nombre : null].filter(Boolean).join(', ') || x.para);
    if (regla) detalle.push('Por la regla «' + regla[1] + '».');
  }
  else if (x.tipo === 'PREALERTA') {
    const m = /^(.*?) (?:te avisó|le avisó a tu equipo (.+?)) de una pre-alerta: (.*)$/.exec(x.texto || '');
    titulo = 'Pre-alerta avisada a Soporte';
    if (m) { detalle.push(m[3].charAt(0).toUpperCase() + m[3].slice(1) + '.'); detalle.push('Avisó ' + m[1] + (m[2] ? ' al equipo ' + m[2] : '') + '.'); }
    else detalle.push(x.texto);
  }
  else if (x.tipo === 'DEVUELTA') { titulo = 'Devolvieron una alerta al analista'; }
  else {
    titulo = /normalizó/.test(x.texto || '') ? 'Una alerta se normalizó sola' : /dejó de detectarse/.test(x.texto || '') ? 'Una alerta dejó de detectarse y se cerró'
      : 'Alerta resuelta' + (x.resuelta_por && x.resuelta_por !== 'SISTEMA' ? ' por ' + x.resuelta_por : '');
  }
  if (x.detalle) detalle.push('“' + String(x.detalle).slice(0, 300) + '”');
  if (x.tipo !== 'GRAVE_SIN_ASIGNAR' && x.tipo !== 'PREALERTA' && x.para) detalle.push('Le llegó a: ' + x.para + '.');
  return { titulo, alerta, gravedad, urgente: urgente || x.severidad_maxima === 'CRITICA', detalle: detalle.join(' ') };
}

// Tarjeta adaptable (el formato que acepta el flujo de Workflows de Teams)
function teamsTarjeta(hechos, resto, origen) {
  const cuerpo = [{ type: 'TextBlock', text: 'Helios · Monitoreo', weight: 'Bolder', size: 'Medium', color: 'Accent' }];
  for (const h of hechos) {
    const items = [{ type: 'TextBlock', text: (h.urgente ? '🔴 ' : '') + h.titulo, weight: 'Bolder', wrap: true, color: h.urgente ? 'Attention' : 'Default', spacing: 'Medium' }];
    if (h.alerta) items.push({ type: 'TextBlock', text: h.alerta + (h.gravedad ? ' · ' + h.gravedad : ''), wrap: true, spacing: 'None' });
    if (h.detalle) items.push({ type: 'TextBlock', text: h.detalle, wrap: true, isSubtle: true, size: 'Small', spacing: 'None' });
    cuerpo.push({ type: 'Container', separator: true, items });
  }
  if (resto > 0) cuerpo.push({ type: 'TextBlock', text: 'Y ' + resto + ' avisos más en Helios.', isSubtle: true, size: 'Small' });
  const tarjeta = { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: cuerpo };
  if (/^https:\/\//.test(origen || '') && !/\.invalid$/.test(new URL(origen).hostname)) tarjeta.actions = [{ type: 'Action.OpenUrl', title: 'Abrir Helios', url: origen + '/inicio' }];
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: tarjeta }] };
}

async function teamsMandar(url, mensaje) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mensaje), signal: AbortSignal.timeout(TEAMS_TOPE_MS) });
  if (!r.ok) throw new Error('Teams respondió ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.status;
}

// Después de un pedido que creó avisos: un mensaje al canal con los hechos nuevos
async function enviarTeams(env, desde, origen) {
  const url = teamsUrl(env);
  if (!url || desde == null) return { enviados: 0 };
  const filas = (await env.DB.prepare(Q_TEAMS_PENDIENTES).bind(desde).all()).results;
  if (!filas.length) return { enviados: 0 };
  const hechos = filas.map(teamsHecho).sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0));
  await teamsMandar(url, teamsTarjeta(hechos.slice(0, TEAMS_MAX), hechos.length - TEAMS_MAX, origen));
  return { enviados: 1, hechos: hechos.length };
}

// Administración > Equipos: estado y aviso de prueba (solo Administrador)
async function rutasTeams(env, request, p, yo) {
  if (request.method === 'GET' && p === '/teams') {
    return okJson({ configurado: !!teamsUrl(env), cargado: !!(env && env.TEAMS_WEBHOOK), tipos: TEAMS_TIPOS });
  }
  if (request.method === 'POST' && p === '/teams/probar') {
    const url = teamsUrl(env);
    if (!url) return jsonError(env && env.TEAMS_WEBHOOK ? 'La dirección cargada en TEAMS_WEBHOOK no es de un flujo de Workflows de Teams.' : 'Falta cargar el secreto TEAMS_WEBHOOK en el Worker.', 409);
    const prueba = [{ titulo: 'Aviso de prueba', alerta: '', gravedad: null, urgente: false, detalle: 'Lo mandó ' + yo.nombre + ' desde Administración. Si lo ves, los avisos de Helios ya llegan a este canal.' }];
    try { await teamsMandar(url, teamsTarjeta(prueba, 0, new URL(request.url).origin)); }
    catch (e) { return jsonError('No se pudo mandar a Teams (' + (e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message) + ').', 502); }
    await env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'TEAMS_PRUEBA', 'Aviso de prueba a Teams').run();
    return okJson({});
  }
  return null;
}
