// =====================================================================
// BOT DE HELIOS EN TEAMS (parche 76, parte C de la sala de crisis en Teams). Sin SQL nuevo.
//
// El asistente de IA de Helios como bot de Microsoft Teams: se le escribe en el chat de la sala (o en un chat de a dos) y responde
// con lo que la persona puede ver en Helios, con los datos de la sala (alertas, tareas, guía de diagnóstico, casos parecidos, contexto
// externo). Solo lee y propone: nada se ejecuta desde Teams; las propuestas se confirman en Helios (se manda el enlace).
//
//   POST /api/teams/bot                 lo llama Microsoft (Bot Framework) con cada mensaje. Sin sesión: se valida la firma.
//   GET  /api/admin/teams/bot           estado (qué falta cargar) y dirección de mensajes (Administrador)
//   POST /api/admin/teams/bot/probar    pide un token a Microsoft con el App ID y el secreto cargados (Administrador)
//
// Secretos del Worker (los entrega IT al registrar el bot en el Developer Portal de Teams o en Azure Bot):
//   TEAMS_BOT_APP_ID   el Bot ID / Microsoft App ID (un GUID)
//   TEAMS_BOT_SECRET   el secreto de cliente
//   TEAMS_BOT_TENANT   el ID del tenant (obligatorio si el bot es de un solo tenant; si es multi-tenant se deja vacío)
// Sin App ID y secreto el bot no hace nada (responde 503 a Microsoft) y el resto de Helios anda igual.
//
// Seguridad:
//   - Cada pedido trae un token de Microsoft: se verifica la firma RS256 con las claves públicas de Bot Framework (o del tenant),
//     que el destinatario sea este bot, que no esté vencido y que la dirección del servicio sea la del mensaje. Si falla: 401.
//   - Las respuestas solo se mandan a direcciones de servicio de Microsoft (smba.trafficmanager.net y *.botframework.com).
//   - Quién pregunta se identifica por su correo de Teams, que se busca en usuarios.correo (script 23). Sin usuario no hay datos.
//     La pregunta pasa por la misma ruta del asistente de siempre (/api/asistente): mismos permisos por perfil, mismos límites
//     de preguntas por hora y por día, misma auditoría, y las mismas reglas de la sala (Soporte solo ve salas donde tiene una tarea).
//   - Los saludos y agradecimientos sueltos no llaman al modelo (parche 74).
//   - El pedido se contesta enseguida (200) y la respuesta se manda después, por la API de Microsoft: la IA puede tardar unos segundos.
// =====================================================================
const BOT_RUTA = '/api/teams/bot';
const BOT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_SERVICIOS = /^https:\/\/(smba\.trafficmanager\.net|([a-z0-9-]+\.)+botframework\.com|smba\.infra\.[a-z0-9.-]+\.microsoft\.(com|us))\//i;
const BOT_JWKS_BF = 'https://login.botframework.com/v1/.well-known/keys';
const BOT_TOPE_MS = 8000;
const BOT_MAX_CUERPO = 100000;
const BOT_MAX_RESPUESTA = 3800;
const BOT_SALUDO = 'Hola, soy el asistente de Helios. Mencioname y preguntame por la operación; por ejemplo: **@Helios IM-4 ¿qué reviso primero?** o **¿hubo algo parecido antes?** '
  + 'Respondo con lo que tu perfil puede ver en Helios. No hago cambios: si propongo algo, lo confirmás en Helios.';
let BOT_JWKS = {};          // dirección de las claves -> { t, claves }
let BOT_TOKEN = null;       // { valor, vence }
const BOT_CORREOS = new Map();   // id de Teams -> { t, correos }

function botConfig(env) {
  const id = String((env && env.TEAMS_BOT_APP_ID) || '').trim(), secreto = String((env && env.TEAMS_BOT_SECRET) || '').trim(), tenant = String((env && env.TEAMS_BOT_TENANT) || '').trim();
  return { id: BOT_GUID.test(id) ? id.toLowerCase() : null, secreto: secreto.length >= 8 && secreto.length < 400 ? secreto : null, tenant: BOT_GUID.test(tenant) ? tenant.toLowerCase() : null,
    cargado: !!(id || secreto || tenant) };
}

// ---------- Token que manda Microsoft ----------
function botBytes(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const botTexto = (s) => new TextDecoder().decode(botBytes(s));
async function botJwks(url, forzar) {
  const c = BOT_JWKS[url];
  if (c && Date.now() - c.t < (forzar ? 300e3 : 3600e3)) return c.claves;   // se vuelve a pedir como mucho cada 5 minutos si aparece una clave nueva
  const r = await fetch(url, { signal: AbortSignal.timeout(BOT_TOPE_MS) });
  if (!r.ok) throw new Error('no se pudieron leer las claves de Microsoft (' + r.status + ')');
  const claves = ((await r.json()).keys) || [];
  BOT_JWKS[url] = { t: Date.now(), claves };
  return claves;
}
// Devuelve null si el pedido es de Microsoft y para este bot; si no, el motivo (solo para el registro, no se le muestra a nadie)
async function botValidar(env, request, act) {
  const cfg = botConfig(env);
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (!m) return 'falta el token';
  const partes = m[1].split('.');
  if (partes.length !== 3) return 'token mal formado';
  let cab, carga;
  try { cab = JSON.parse(botTexto(partes[0])); carga = JSON.parse(botTexto(partes[1])); } catch (e) { return 'token mal formado'; }
  if (!cab || !carga || cab.alg !== 'RS256' || !cab.kid) return 'algoritmo no aceptado';
  const iss = String(carga.iss || '');
  const deBotFramework = iss === 'https://api.botframework.com';
  const deTenant = !!cfg.tenant && (iss === 'https://sts.windows.net/' + cfg.tenant + '/' || iss === 'https://login.microsoftonline.com/' + cfg.tenant + '/v2.0');
  if (!deBotFramework && !deTenant) return 'emisor no aceptado: ' + iss.slice(0, 80);
  if (String(carga.aud || '').toLowerCase() !== cfg.id) return 'el token no es para este bot';
  const ahora = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(carga.exp) || carga.exp < ahora - 300) return 'token vencido';
  if (Number.isFinite(carga.nbf) && carga.nbf > ahora + 300) return 'token todavía no vale';
  if (deBotFramework) {
    const su = String(carga.serviceurl || carga.serviceUrl || '').replace(/\/+$/, '').toLowerCase();
    if (!su || su !== String(act.serviceUrl || '').replace(/\/+$/, '').toLowerCase()) return 'la dirección del servicio no coincide con la del token';
  }
  const url = deBotFramework ? BOT_JWKS_BF : 'https://login.microsoftonline.com/' + cfg.tenant + '/discovery/v2.0/keys';
  let clave = (await botJwks(url, false)).find((x) => x.kid === cab.kid);
  if (!clave) clave = (await botJwks(url, true)).find((x) => x.kid === cab.kid);
  if (!clave || clave.kty !== 'RSA') return 'clave desconocida';
  if (deBotFramework && Array.isArray(clave.endorsements) && act.channelId && !clave.endorsements.includes(act.channelId)) return 'clave no habilitada para el canal';
  const llave = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: clave.n, e: clave.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const firmado = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, botBytes(partes[2]), new TextEncoder().encode(partes[0] + '.' + partes[1]));
  return firmado ? null : 'firma inválida';
}

// ---------- Hablar con Microsoft ----------
async function botToken(env, forzar) {
  const cfg = botConfig(env);
  if (!cfg.id || !cfg.secreto) throw new Error('el bot no está configurado');
  if (!forzar && BOT_TOKEN && BOT_TOKEN.vence > Date.now() + 60e3) return BOT_TOKEN.valor;
  const r = await fetch('https://login.microsoftonline.com/' + (cfg.tenant || 'botframework.com') + '/oauth2/v2.0/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(BOT_TOPE_MS),
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.id, client_secret: cfg.secreto, scope: 'https://api.botframework.com/.default' }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Microsoft no dio el token (' + r.status + (j.error_description ? ': ' + String(j.error_description).split('\n')[0].slice(0, 160) : '') + ')');
  BOT_TOKEN = { valor: j.access_token, vence: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return BOT_TOKEN.valor;
}
async function botLlamar(env, metodo, url, cuerpo, reintento) {
  const token = await botToken(env, !!reintento);
  const r = await fetch(url, { method: metodo, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: AbortSignal.timeout(BOT_TOPE_MS) });
  if (r.status === 401 && !reintento) return await botLlamar(env, metodo, url, cuerpo, true);   // el token pudo haber vencido: se pide uno nuevo una vez
  if (!r.ok) throw new Error('Teams respondió ' + r.status + ': ' + (await r.text().catch(() => '')).slice(0, 200));
  return r;
}
const botBase = (act) => String(act.serviceUrl).replace(/\/+$/, '') + '/v3/conversations/' + encodeURIComponent(act.conversation.id);
async function botResponder(env, act, texto) {
  await botLlamar(env, 'POST', botBase(act) + '/activities' + (act.id ? '/' + encodeURIComponent(act.id) : ''), {
    type: 'message', text: String(texto).slice(0, BOT_MAX_RESPUESTA), textFormat: 'markdown',
    from: act.recipient, conversation: { id: act.conversation.id }, recipient: act.from, replyToId: act.id,
  });
}
async function botEscribiendo(env, act) {   // "Helios está escribiendo…" mientras piensa (si falla, no pasa nada)
  try { await botLlamar(env, 'POST', botBase(act) + '/activities', { type: 'typing', from: act.recipient, conversation: { id: act.conversation.id }, recipient: act.from }); }
  catch (e) { /* es solo un detalle de la pantalla */ }
}

// ---------- Quién pregunta ----------
async function botCorreos(env, act) {
  const id = act.from && act.from.id;
  if (!id) return [];
  const c = BOT_CORREOS.get(id);
  if (c && Date.now() - c.t < 3600e3) return c.correos;
  const j = await (await botLlamar(env, 'GET', botBase(act) + '/members/' + encodeURIComponent(id))).json().catch(() => ({}));
  const correos = [...new Set([j.email, j.userPrincipalName].filter(Boolean).map((x) => String(x).trim().toLowerCase()))];
  if (BOT_CORREOS.size > 500) BOT_CORREOS.clear();
  BOT_CORREOS.set(id, { t: Date.now(), correos });
  return correos;
}
async function botUsuario(env, correos) {
  if (!correos.length) return null;
  const a = correos[0], b = correos[1] || correos[0];
  return await conPerfil(
    () => env.DB.prepare(`SELECT id, usuario, nombre, CASE WHEN solo_comunicados = 1 THEN 'COMUNICADOS' ELSE perfil END AS perfil, debe_cambiar
      FROM usuarios WHERE activo = 1 AND lower(correo) IN (?1, ?2) ORDER BY id LIMIT 1`).bind(a, b).first(),
    () => env.DB.prepare('SELECT id, usuario, nombre, perfil, debe_cambiar FROM usuarios WHERE activo = 1 AND lower(correo) IN (?1, ?2) ORDER BY id LIMIT 1').bind(a, b).first());
}

// ---------- Sobre qué sala pregunta ----------
// 1) lo que escribe ("IM-4"), 2) el título del chat (el chat de Helios se llama "IM-4 · …"), 3) la única sala abierta, si hay una sola
async function botSala(env, yo, texto, act) {
  const m = texto.match(/\bIM-(\d{1,6})\b/i) || String((act.conversation && act.conversation.name) || '').match(/\bIM-(\d{1,6})\b/i);
  if (m) return { id: Number(m[1]) };
  if (!puede(yo, 'sala_crisis')) return {};
  try {
    const r = (await env.DB.prepare("SELECT id FROM incidentes_mayores WHERE estado <> 'CERRADO' ORDER BY id DESC LIMIT 3").all()).results;
    if (r.length === 1) return { id: r[0].id };
    if (r.length > 1) return { varias: true };
  } catch (e) { /* sin el script 24 */ }
  return {};
}

const botLimpiar = (t) => String(t || '').replace(/<at>.*?<\/at>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 600);

function botArmarRespuesta(j, origen, sala) {
  let t = String(j.respuesta || '').trim() || 'No pude armar una respuesta. Probá preguntarlo de otra forma.';
  const acc = Array.isArray(j.acciones) ? j.acciones : [];
  if (acc.length) {
    t += '\n\n**Propuestas (no se hizo nada)**\n' + acc.map((a) => '- ' + [String(a.titulo || a.tipo || 'Acción') + (a.destino ? ' → ' + a.destino : ''), a.alerta, a.motivo].filter(Boolean).join(' · ')).join('\n');
    const donde = sala.id ? origen + '/incidente/' + sala.id : acc[0].alerta_id ? origen + '/alerta/' + acc[0].alerta_id : origen + '/inicio';
    t += '\n\nPara hacerlo, abrilo en Helios: ' + donde;
  } else if (sala.id) {
    t += '\n\n[Abrir la sala IM-' + sala.id + ' en Helios](' + origen + '/incidente/' + sala.id + ')';
  }
  if (sala.varias && !sala.id) t += '\n\n_Hay varias salas abiertas: para preguntar por una, escribí su número, por ejemplo IM-4._';
  return t.slice(0, BOT_MAX_RESPUESTA);
}

// ---------- Un mensaje de Teams ----------
async function botProcesar(env, request, act) {
  const origen = new URL(request.url).origin;
  const tipo = String(act.type || '');
  if (tipo === 'conversationUpdate') {
    if ((act.membersAdded || []).some((x) => x && act.recipient && x.id === act.recipient.id)) await botResponder(env, act, BOT_SALUDO);
    return;
  }
  if (tipo === 'installationUpdate') { if (act.action === 'add') await botResponder(env, act, BOT_SALUDO); return; }
  if (tipo !== 'message') return;
  const texto = botLimpiar(act.text);
  if (!texto) { await botResponder(env, act, BOT_SALUDO); return; }
  let correos;
  try { correos = await botCorreos(env, act); }
  catch (e) { console.error('Bot de Teams: no se pudo leer quién escribe: ' + e.message); await botResponder(env, act, 'No pude confirmar quién sos en Teams. Probá de nuevo en un momento.'); return; }
  let yo;
  try { yo = await botUsuario(env, correos); }
  catch (e) { console.error('Bot de Teams: ' + e.message); await botResponder(env, act, 'Todavía falta configurar el correo de los usuarios en Helios (script 23). Avisale al Administrador.'); return; }
  if (!yo) { await botResponder(env, act, 'No encontré tu usuario de Helios' + (correos[0] ? ' con el correo ' + correos[0] : '') + '. Pedile al Administrador que cargue tu correo en Administración > Usuarios.'); return; }
  if (!puede(yo, 'asistente')) { await botResponder(env, act, 'Tu perfil no tiene el asistente.'); return; }
  await botEscribiendo(env, act);
  const sala = await botSala(env, yo, texto, act);
  const cuerpo = { pregunta: texto };
  if (sala.id) cuerpo.incidente_id = sala.id;
  // La misma ruta del asistente de siempre: permisos del perfil, límites de preguntas, auditoría y reglas de la sala
  const resp = await rutasAsistente(env, new Request(origen + '/api/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }), '/api/asistente', yo);
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || j.ok === false) { await botResponder(env, act, String(j.error || 'No pude responder ahora. Probá de nuevo en un momento.')); return; }
  await botResponder(env, act, botArmarRespuesta(j, origen, sala));
}

// ---------- Lo que llama Microsoft ----------
async function botTeamsRuta(env, request, ctx) {
  const cfg = botConfig(env);
  if (!cfg.id || !cfg.secreto) return Response.json({ ok: false, error: 'El bot de Teams no está configurado.' }, { status: 503 });
  let act;
  try {
    if (Number(request.headers.get('content-length') || 0) > BOT_MAX_CUERPO) return Response.json({ ok: false }, { status: 413 });
    const t = await request.text();
    if (t.length > BOT_MAX_CUERPO) return Response.json({ ok: false }, { status: 413 });
    act = JSON.parse(t);
  } catch (e) { return Response.json({ ok: false }, { status: 400 }); }
  if (!act || typeof act !== 'object' || !act.serviceUrl || !act.conversation || !act.conversation.id || !BOT_SERVICIOS.test(String(act.serviceUrl).replace(/\/*$/, '/'))) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const motivo = await botValidar(env, request, act).catch((e) => 'error: ' + e.message);
  if (motivo) { console.error('Bot de Teams: pedido rechazado (' + motivo + ')'); return Response.json({ ok: false, error: 'No autorizado.' }, { status: 401 }); }
  const tid = act.channelData && act.channelData.tenant && act.channelData.tenant.id;
  if (cfg.tenant && tid && String(tid).toLowerCase() !== cfg.tenant) return new Response(null, { status: 200 });   // de otro tenant: se ignora
  const tarea = botProcesar(env, request, act).catch((e) => console.error('Bot de Teams: ' + e.message));
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(tarea); else await tarea;
  return new Response(null, { status: 200 });
}

// ---------- Administración > Equipos: estado y prueba de conexión (solo Administrador) ----------
async function rutasTeamsBot(env, request, p, yo) {
  const cfg = botConfig(env);
  if (request.method === 'GET' && p === '/teams/bot') {
    const falta = [];
    if (!cfg.id) falta.push('TEAMS_BOT_APP_ID');
    if (!cfg.secreto) falta.push('TEAMS_BOT_SECRET');
    return okJson({ configurado: !!(cfg.id && cfg.secreto), falta, con_tenant: !!cfg.tenant, algo_cargado: cfg.cargado, direccion: new URL(request.url).origin + BOT_RUTA });
  }
  if (request.method === 'POST' && p === '/teams/bot/probar') {
    if (!cfg.id || !cfg.secreto) return jsonError('Faltan cargar los secretos del bot (TEAMS_BOT_APP_ID y TEAMS_BOT_SECRET).', 409);
    try { await botToken(env, true); }
    catch (e) { return jsonError('No se pudo conectar con Microsoft: ' + (e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message) + '. Revisá el App ID, el secreto' + (cfg.tenant ? ' y el tenant.' : '; si el bot es de un solo tenant, cargá TEAMS_BOT_TENANT.'), 502); }
    await env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'TEAMS_BOT_PRUEBA', 'Conexión con Microsoft').run();
    return okJson({});
  }
  return null;
}
