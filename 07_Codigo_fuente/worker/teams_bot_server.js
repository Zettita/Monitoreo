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
//   TEAMS_BOT_NOMBRE   (opcional) el nombre con el que se lo menciona en Teams; por defecto Gemma (el que figure como nombre de la app)
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
//   - Recuerda la conversación (parches 77 y 78, script 25): últimos 6 mensajes de cada chat (con el nombre de quien preguntó) y la sala de la que venían hablando;
//     es del chat, no de cada persona, porque en un chat grupal todos leen las mismas respuestas. «Empezar de nuevo» la borra.
//   - El pedido se contesta enseguida (200) y la respuesta se manda después, por la API de Microsoft: la IA puede tardar unos segundos.
// =====================================================================
const BOT_RUTA = '/api/teams/bot';
const BOT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_SERVICIOS = /^https:\/\/(smba\.trafficmanager\.net|([a-z0-9-]+\.)+botframework\.com|smba\.infra\.[a-z0-9.-]+\.microsoft\.(com|us))\//i;
const BOT_JWKS_BF = 'https://login.botframework.com/v1/.well-known/keys';
const BOT_TOPE_MS = 8000;
const BOT_MAX_CUERPO = 100000;
const BOT_MAX_RESPUESTA = 3800;
// El nombre con el que se lo menciona en Teams (@Gemma) es el de la app: lo manda Teams en cada mensaje (act.recipient.name) y, si no, TEAMS_BOT_NOMBRE
const BOT_NOMBRE_FABRICA = 'Gemma';
function botNombre(env, act) {
  const n = String((act && act.recipient && act.recipient.name) || (env && env.TEAMS_BOT_NOMBRE) || BOT_NOMBRE_FABRICA).replace(/[<>@]/g, '').trim().slice(0, 30);
  return n || BOT_NOMBRE_FABRICA;
}
function botSinNombre(texto, nombre) {   // «gemma, ¿qué reviso?» → «¿qué reviso?»
  const t = String(texto).replace(/^@/, ''), n = nombre.toLowerCase();
  if (t.toLowerCase().startsWith(n) && !/[\p{L}\p{N}_]/u.test(t.charAt(n.length) || ' ')) return t.slice(n.length).replace(/^[\s,:;-]+/, '').trim();
  return texto;
}
const botSaludo = (nombre) => 'Hola, soy ' + nombre + ', el asistente de Helios. Mencioname y preguntame por la operación; por ejemplo: **@' + nombre + ' IM-4 ¿qué reviso primero?**, **¿qué alertas tengo asignadas?**, '
  + '**¿qué tareas tengo en las salas?** o **¿hubo algo parecido antes?** '
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

// ---------- Memoria de la conversación (parches 77 y 78, script 25) ----------
// Una fila por CHAT con sus últimos mensajes (hasta 6, con el nombre de quien preguntó cada uno) y la sala de la que venían hablando. Es del chat y no
// de cada persona: en un chat grupal todos leen las mismas respuestas, así que si alguien pregunta y otra persona sigue después, el bot responde en
// base a lo que se viene hablando ahí. El permiso de cada pregunta sigue siendo el de quien la hace. Se usa hasta 2 horas después del último
// mensaje y lo viejo (más de 7 días) se borra solo. Sin la tabla, cada mensaje es independiente.
const BOT_MEMORIA_MENSAJES = 6;
const BOT_MEMORIA_HORAS = 2;
const BOT_OLVIDAR = /^(empezar de nuevo|empecemos de nuevo|nueva consulta|nueva conversaci[oó]n|olvid[aá](te)?( todo| lo anterior)?|reiniciar|borr[aá] (la )?(memoria|conversaci[oó]n))[.!? ]*$/i;
const botChat = (act) => String(act.conversation.id).slice(0, 200);
async function botMemoria(env, act) {
  try {
    const f = await env.DB.prepare('SELECT mensajes, sala_id, actualizado FROM teams_bot_memoria WHERE conversacion_id = ?1').bind(botChat(act)).first();
    if (!f || Date.parse(f.actualizado) < Date.now() - BOT_MEMORIA_HORAS * 3600e3) return { mensajes: [], sala_id: null, activa: true };
    let ms = []; try { ms = JSON.parse(f.mensajes); } catch (e) { /* fila ilegible: se empieza de nuevo */ }
    return { mensajes: Array.isArray(ms) ? ms.filter((x) => x && (x.rol === 'usuario' || x.rol === 'asistente') && typeof x.texto === 'string').slice(-BOT_MEMORIA_MENSAJES) : [], sala_id: f.sala_id, activa: true };
  } catch (e) {
    if (/no such table|no such column/i.test(e.message)) return { mensajes: [], sala_id: null, activa: false };   // sin el script 25
    throw e;
  }
}
// Lo que se le pasa al modelo: cada pregunta con el nombre de quien la hizo, para que distinga quién dijo qué
const botHistoria = (mensajes) => mensajes.map((m) => ({ rol: m.rol, texto: m.rol === 'usuario' && m.quien ? m.quien + ': ' + m.texto : m.texto }));
async function botGuardarMemoria(env, act, mensajes, salaId) {
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO teams_bot_memoria (conversacion_id, mensajes, sala_id, actualizado) VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        ON CONFLICT (conversacion_id) DO UPDATE SET mensajes = excluded.mensajes, sala_id = excluded.sala_id, actualizado = excluded.actualizado`)
        .bind(botChat(act), JSON.stringify(mensajes.slice(-BOT_MEMORIA_MENSAJES)), salaId || null),
      env.DB.prepare("DELETE FROM teams_bot_memoria WHERE actualizado < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')"),
    ]);
  } catch (e) { if (!/no such table|no such column/i.test(e.message)) console.error('Bot de Teams: no se pudo guardar la memoria: ' + e.message); }
}
// Al instalar la app, Teams manda dos avisos (installationUpdate y conversationUpdate) y cada uno saludaba: el chat recibía el saludo dos veces (parche 79).
// Ahora saluda uno solo por chat: el primero que llega anota una marca en la misma tabla de memoria (clave «saludo:<chat>», atómico) y el otro la encuentra.
// Si se lo saca y se lo vuelve a sumar pasados 10 minutos, saluda de nuevo. Sin el script 25 no hay dónde anotar: saluda solo con conversationUpdate.
async function botSaludar(env, act, evento) {
  let saluda = true;
  try {
    const r = await env.DB.prepare(`INSERT INTO teams_bot_memoria (conversacion_id, mensajes, sala_id, actualizado) VALUES (?1, '[]', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT (conversacion_id) DO UPDATE SET actualizado = excluded.actualizado WHERE teams_bot_memoria.actualizado < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')`)
      .bind('saludo:' + botChat(act)).run();
    saluda = !!(r.meta && r.meta.changes > 0);
  } catch (e) {
    if (!/no such table|no such column/i.test(e.message)) console.error('Bot de Teams: no se pudo anotar el saludo: ' + e.message);
    saluda = evento === 'conversationUpdate';
  }
  if (saluda) await botResponder(env, act, botSaludo(botNombre(env, act)));
}
async function botOlvidar(env, act) {
  try { await env.DB.prepare('DELETE FROM teams_bot_memoria WHERE conversacion_id = ?1').bind(botChat(act)).run(); }
  catch (e) { if (!/no such table|no such column/i.test(e.message)) throw e; }
}

// ---------- Sobre qué sala pregunta ----------
// 1) lo que escribe ("IM-4"): si no existe o no la ve, se le dice. Si no lo escribe, se prueba (2) el título del chat de Helios ("IM-4 · …"), (3) la sala de la que
// venía hablando y (4) la única sala abierta, pero SOLO si existe y la persona la puede ver (parche 79): si no, la pregunta sigue como una pregunta general
// (sus alertas, sus tareas, casos parecidos). Antes, una sala que ya no existía (por ejemplo, después de «Preparar demo») o una sala donde la persona no tiene
// tareas hacía que el bot contestara «Ese incidente no existe.» o «Esa sala de crisis no tiene tareas…» aunque preguntara por lo suyo.
async function botSalaVisible(env, yo, id) {
  try { return !(await rolEnIncidente(env, yo, id)).error; }
  catch (e) { return false; }   // sin el script 24
}
async function botSala(env, yo, texto, act, memoria) {
  const m = texto.match(/\bIM-(\d{1,6})\b/i);
  if (m) return { id: Number(m[1]) };
  const t = String((act.conversation && act.conversation.name) || '').match(/\bIM-(\d{1,6})\b/i);
  for (const id of [t && Number(t[1]), memoria && memoria.mensajes.length && memoria.sala_id].filter(Boolean)) if (await botSalaVisible(env, yo, id)) return { id };
  if (!puede(yo, 'sala_crisis')) return {};
  try {
    const r = (await env.DB.prepare("SELECT id FROM incidentes_mayores WHERE estado <> 'CERRADO' ORDER BY id DESC LIMIT 3").all()).results;
    const vistas = [];
    for (const x of r) if (await botSalaVisible(env, yo, x.id)) vistas.push(x.id);
    if (vistas.length === 1) return { id: vistas[0] };
    if (vistas.length > 1) return { varias: true };
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
    if ((act.membersAdded || []).some((x) => x && act.recipient && x.id === act.recipient.id)) await botSaludar(env, act, 'conversationUpdate');
    return;
  }
  if (tipo === 'installationUpdate') { if (act.action === 'add') await botSaludar(env, act, 'installationUpdate'); return; }
  if (tipo !== 'message') return;
  // Además de la mención de Teams, en un chat de a dos se lo puede llamar por el nombre («gemma, ¿qué reviso?»)
  const nombre = botNombre(env, act);
  const texto = botSinNombre(botLimpiar(act.text), nombre);
  if (!texto) { await botResponder(env, act, botSaludo(nombre)); return; }
  let correos;
  try { correos = await botCorreos(env, act); }
  catch (e) { console.error('Bot de Teams: no se pudo leer quién escribe: ' + e.message); await botResponder(env, act, 'No pude confirmar quién sos en Teams. Probá de nuevo en un momento.'); return; }
  let yo;
  try { yo = await botUsuario(env, correos); }
  catch (e) { console.error('Bot de Teams: ' + e.message); await botResponder(env, act, 'Todavía falta configurar el correo de los usuarios en Helios (script 23). Avisale al Administrador.'); return; }
  if (!yo) { await botResponder(env, act, 'No encontré tu usuario de Helios' + (correos[0] ? ' con el correo ' + correos[0] : '') + '. Pedile al Administrador que cargue tu correo en Administración > Usuarios.'); return; }
  if (!puede(yo, 'asistente')) { await botResponder(env, act, 'Tu perfil no tiene el asistente.'); return; }
  if (BOT_OLVIDAR.test(texto)) {
    await botOlvidar(env, act);
    await botResponder(env, act, 'Listo, empezamos de nuevo: no recuerdo lo anterior de este chat. Preguntame lo que necesites.');
    return;
  }
  await botEscribiendo(env, act);
  let memoria = await botMemoria(env, act);
  const sala = await botSala(env, yo, texto, act, memoria);
  // Si ahora se pregunta por otra sala, lo anterior era de otro tema: se empieza de nuevo
  // Otra sala escrita a mano: lo anterior era de otro tema. Si la sala de la que venía hablando el chat existe pero esta persona no la ve, contesta como pregunta general
  // (sin la conversación del chat y sin tocarla: no se guarda), y si ya no existe (por ejemplo, después de «Preparar demo») se empieza de nuevo.
  let aparte = false;
  if (memoria.sala_id && sala.id !== memoria.sala_id) {
    if (!sala.id) { try { aparte = !!(await env.DB.prepare('SELECT 1 FROM incidentes_mayores WHERE id = ?1').bind(memoria.sala_id).first()); } catch (e) { /* sin el script 24 */ } }
    memoria = { ...memoria, mensajes: [] };
  }
  const cuerpo = { pregunta: texto };
  if (sala.id) cuerpo.incidente_id = sala.id;
  if (memoria.mensajes.length) cuerpo.historia = botHistoria(memoria.mensajes);
  // La misma ruta del asistente de siempre: permisos del perfil, límites de preguntas, auditoría y reglas de la sala
  const resp = await rutasAsistente(env, new Request(origen + '/api/asistente', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }), '/api/asistente', yo);
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || j.ok === false) { await botResponder(env, act, String(j.error || 'No pude responder ahora. Probá de nuevo en un momento.')); return; }
  await botResponder(env, act, botArmarRespuesta(j, origen, sala));
  // Se recuerda lo conversado (sin los saludos sueltos, que no pasaron por el modelo)
  if (memoria.activa && !aparte && !j.sin_ia && j.respuesta) await botGuardarMemoria(env, act, memoria.mensajes.concat([{ rol: 'usuario', texto, quien: String(yo.nombre || '').split(/\s+/)[0] }, { rol: 'asistente', texto: String(j.respuesta).slice(0, 1500) }]), sala.id);
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
    let memoria = true;
    try { await env.DB.prepare('SELECT 1 FROM teams_bot_memoria LIMIT 1').all(); } catch (e) { if (/no such table/i.test(e.message)) memoria = false; else throw e; }
    return okJson({ configurado: !!(cfg.id && cfg.secreto), falta, con_tenant: !!cfg.tenant, algo_cargado: cfg.cargado, memoria, nombre: botNombre(env, null), direccion: new URL(request.url).origin + BOT_RUTA });
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
