// =====================================================================
// Avisos push (parche 26): los avisos de la campanita llegan al celular o a la PC aunque
// Helios esté cerrado. Es el estándar Web Push de los navegadores (gratis: lo entregan
// Google, Apple, Mozilla o Microsoft según el navegador de cada persona).
//
// - Cada dispositivo que activa los avisos queda en suscripciones_push (una fila por dispositivo).
// - Después de cada pedido que crea avisos (derivar, comentar, revisar alertas, escenas de la demo...)
//   se manda un push a los dispositivos de esas personas. El contenido va cifrado (RFC 8291):
//   solo lo puede leer el dispositivo, no el servicio que lo entrega.
// - La clave VAPID (identifica a este servidor) va en el secreto del Worker VAPID_JWK.
//   Sin ese secreto no se envía nada y la campanita sigue con los avisos del navegador abierto.
// - Si un dispositivo ya no existe (respuesta 404 o 410), su suscripción se borra sola.
// =====================================================================

const PUSH_MAX_ENVIOS = 25;   // dispositivos por pedido (el plan gratuito permite 50 subpedidos)
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const PUSH_TXT = new TextEncoder();
const b64u = {
  aBytes(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); },
  deBytes(u) { let s = ''; for (const x of new Uint8Array(u)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
};
const unirBytes = (...p) => { const t = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { t.set(x, i); i += x.length; } return t; };

// Clave VAPID: el secreto VAPID_JWK es un JSON {kty:'EC', crv:'P-256', x, y, d}
function vapidDe(env) {
  if (!env || !env.VAPID_JWK) return null;
  try {
    const j = typeof env.VAPID_JWK === 'string' ? JSON.parse(env.VAPID_JWK) : env.VAPID_JWK;
    if (j.kty !== 'EC' || j.crv !== 'P-256' || !j.x || !j.y || !j.d) return null;
    const publica = new Uint8Array(65); publica[0] = 4; publica.set(b64u.aBytes(j.x), 1); publica.set(b64u.aBytes(j.y), 33);
    return { jwk: { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d }, publica: b64u.deBytes(publica) };
  } catch (e) { return null; }
}

// Firma VAPID (JWT ES256) para un servicio de push; vale 12 horas
async function firmaVapid(v, audiencia, sujeto, cache) {
  if (cache[audiencia]) return cache[audiencia];
  if (!cache.clave) cache.clave = crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cab = b64u.deBytes(PUSH_TXT.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cue = b64u.deBytes(PUSH_TXT.encode(JSON.stringify({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeto })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await cache.clave, PUSH_TXT.encode(cab + '.' + cue));
  return (cache[audiencia] = 'vapid t=' + cab + '.' + cue + '.' + b64u.deBytes(firma) + ', k=' + v.publica);
}

async function hkdfPush(sal, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, k, bytes * 8));
}

// Cifrado del contenido (RFC 8291, aes128gcm) con las claves que entregó el navegador
async function cifrarPush(texto, p256dh, auth) {
  const uaPublica = b64u.aBytes(p256dh), secreto = b64u.aBytes(auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaClave = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaClave }, par.privateKey, 256));
  const ikm = await hkdfPush(secreto, ecdh, unirBytes(PUSH_TXT.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdfPush(sal, ikm, PUSH_TXT.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfPush(sal, ikm, PUSH_TXT.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, unirBytes(PUSH_TXT.encode(texto), new Uint8Array([2]))));
  const cab = new Uint8Array(21); cab.set(sal, 0); new DataView(cab.buffer).setUint32(16, 4096); cab[20] = 65;
  return unirBytes(cab, asPublica, cifrado);
}

// Texto de cada aviso (el mismo que muestra la campanita)
const PUSH_TITULO = { ASIGNADA: 'Te asignaron una alerta', COMENTARIO: 'Comentaron una alerta', DEVUELTA: 'Devolvieron una alerta',
  RESUELTA: 'Se resolvió una alerta', GRAVE_SIN_ASIGNAR: 'Alerta grave sin asignar', PREALERTA: 'Pre-alerta' };
const PUSH_FRASE = {
  VOLUMEN_BAJO: 'Entra menos tráfico de lo normal', VOLUMEN_ALTO: 'Entra mucho más tráfico de lo normal', APROBACION_BAJA: 'Se aprueban menos operaciones',
  RECHAZO_ALTO: 'Suben los rechazos', ERROR_ALTO: 'Suben los errores técnicos', IMPORTE_BAJO: 'Se opera menos dinero de lo normal',
  IMPORTE_ALTO: 'Se opera más dinero de lo normal', LATENCIA_ALTA: 'El servicio responde lento', SIN_EXITOS: 'No se aprueba ninguna operación',
  DATO_TARDIO: 'Los datos llegan con demora', DATO_INCONSISTENTE: 'Los datos informados no cierran', SIN_PREDICCION: 'Cliente nuevo, sin historia', VENTANA_FALTANTE: 'Dejaron de llegar datos',
};
const PUSH_SERVICIO = { TRANSFERENCIAS: 'Transferencias', PAGO_SERVICIOS: 'Pago de servicios', RECARGA_CELULAR: 'Recarga de celular', RECARGA_TRANSPORTE: 'Recarga de transporte' };
const PUSH_CANAL = { MOBILE: 'app', WEB: 'web', API: 'API' };
const PUSH_A_BANDEJA = { ASIGNADA: 1, COMENTARIO: 1, RESUELTA: 1, DEVUELTA: 1, PREALERTA: 1 };
function avisoPush(a) {
  const bandeja = puede({ perfil: a.perfil }, 'mis_alertas') ? '/mis-alertas' : '/seguimiento';
  const url = PUSH_A_BANDEJA[a.tipo] ? (a.tipo === 'DEVUELTA' && bandeja === '/mis-alertas' ? '/' : bandeja) : '/';
  const alerta = a.tipo_alerta
    ? (a.regla_nombre || (a.tipo_alerta === 'VOLUMEN_BAJO' && a.valor_observado === 0 ? 'No está entrando tráfico' : PUSH_FRASE[a.tipo_alerta] || a.tipo_alerta)) +
      ' · ' + a.cliente_id + ', ' + (PUSH_SERVICIO[a.servicio_id] || a.servicio_id) + ' por ' + (PUSH_CANAL[a.canal_id] || a.canal_id)
    : '';
  return { titulo: 'Helios · ' + (PUSH_TITULO[a.tipo] || 'Aviso nuevo'), cuerpo: [a.texto, alerta, a.detalle ? '“' + a.detalle + '”' : ''].filter(Boolean).join('\n').slice(0, 450), url, tag: 'helios-aviso-' + a.id };
}

// Avisos creados después de "desde" para personas con algún dispositivo suscripto
const Q_PUSH_PENDIENTES = `
SELECT a.id, a.tipo, a.texto, a.detalle, u.perfil,
       h.tipo_alerta, h.cliente_id, h.servicio_id, h.canal_id, h.valor_observado, rp.nombre AS regla_nombre,
       s.endpoint, s.clave_p256dh, s.clave_auth
FROM avisos a
JOIN suscripciones_push s ON s.usuario_id = a.usuario_id
JOIN usuarios u ON u.id = a.usuario_id AND u.activo = 1
LEFT JOIN alertas_historico h ON h.alerta_id = a.alerta_id
LEFT JOIN alerta_reglas_personalizadas rp ON 'PERS_' || rp.id = h.tipo_alerta
WHERE a.id > ?1
ORDER BY a.id DESC
LIMIT 200`;

async function ultimoAvisoId(env) {
  if (!vapidDe(env) || !env.DB) return null;
  try { const r = await env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM avisos').first(); return r ? r.m : null; } catch (e) { return null; }
}

async function enviarPush(env, desde, origen) {
  const v = vapidDe(env);
  if (!v || desde == null) return { enviados: 0, vencidas: 0 };
  let filas;
  try { filas = (await env.DB.prepare(Q_PUSH_PENDIENTES).bind(desde).all()).results; }
  catch (e) { return { enviados: 0, vencidas: 0, error: e.message }; }   // sin la tabla suscripciones_push (falta el script 10)
  const porDispositivo = new Map();
  for (const a of filas) {
    if (!porDispositivo.has(a.endpoint)) porDispositivo.set(a.endpoint, { s: a, avisos: [] });
    porDispositivo.get(a.endpoint).avisos.push(a);
  }
  const sujeto = /^https:/.test(origen || '') ? origen : 'https://localhost';
  const cache = {}, vencidas = [];
  let enviados = 0;
  await Promise.all([...porDispositivo.values()].slice(0, PUSH_MAX_ENVIOS).map(async ({ s, avisos }) => {
    try {
      const lista = avisos.slice(0, 3).map(avisoPush);
      if (avisos.length > 3) lista.push({ titulo: 'Helios', cuerpo: 'Y ' + (avisos.length - 3) + ' avisos más en la campanita.', url: lista[0].url, tag: 'helios-mas' });
      const cuerpo = await cifrarPush(JSON.stringify({ avisos: lista }), s.clave_p256dh, s.clave_auth);
      const r = await fetch(s.endpoint, {
        method: 'POST', body: cuerpo,
        headers: { authorization: await firmaVapid(v, new URL(s.endpoint).origin, sujeto, cache), ttl: '86400', urgency: 'high',
          'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream' },
      });
      if (r.status === 404 || r.status === 410) vencidas.push(s.endpoint);
      else if (r.ok) enviados++;
      else console.error('Push ' + r.status + ': ' + (await r.text()).slice(0, 200));
    } catch (e) { console.error('Push: ' + e.message); }
  }));
  if (vencidas.length) await env.DB.batch(vencidas.map((e) => env.DB.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1').bind(e)));
  return { enviados, vencidas: vencidas.length };
}

// Rutas con sesión: clave pública y suscribirse
async function rutasPush(env, request, ruta, yo) {
  const m = request.method;
  if (m === 'GET' && ruta === '/api/push/clave') {
    const v = vapidDe(env);
    return Response.json({ ok: true, clave: v && puede(yo, 'avisos') ? v.publica : null }, { headers: { 'cache-control': 'no-store' } });
  }
  if (m === 'POST' && ruta === '/api/push/suscribir') {
    if (!puede(yo, 'avisos')) return jsonError('Tu perfil no recibe avisos.', 403);
    if (!vapidDe(env)) return jsonError('Los avisos en el dispositivo todavía no están configurados en el servidor.', 409);
    const b = await request.json().catch(() => ({}));
    const s = (b && b.suscripcion) || {}, k = s.keys || {};
    const endpoint = String(s.endpoint || '');
    if (!PUSH_HOSTS.test(endpoint) || endpoint.length > 1000 || /\s/.test(endpoint)) return jsonError('Este navegador no es compatible con los avisos en el dispositivo.', 400);
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(String(k.p256dh || '')) || !/^[A-Za-z0-9_-]{16,30}$/.test(String(k.auth || ''))) return jsonError('La suscripción del navegador no es válida.', 400);
    const pasos = [env.DB.prepare(`INSERT INTO suscripciones_push (endpoint, usuario_id, clave_p256dh, clave_auth, creada, actualizada)
      VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ON CONFLICT (endpoint) DO UPDATE SET usuario_id = excluded.usuario_id, clave_p256dh = excluded.clave_p256dh, clave_auth = excluded.clave_auth, actualizada = excluded.actualizada`)
      .bind(endpoint, yo.id, k.p256dh, k.auth)];
    if (b.anterior && String(b.anterior) !== endpoint) pasos.push(env.DB.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1 AND usuario_id = ?2').bind(String(b.anterior), yo.id));
    try { await env.DB.batch(pasos); }
    catch (e) { if (/no such table/i.test(e.message)) return jsonError('Falta crear la tabla suscripciones_push: corran el script 10 en la consola de D1.', 500); throw e; }
    return Response.json({ ok: true });
  }
  return null;
}

// Archivos públicos (sin sesión): el navegador los pide sin cookie para instalar Helios como app
const PUSH_ICONOS = {};
function bytesDeIcono(nombre) {
  if (!PUSH_ICONOS[nombre]) PUSH_ICONOS[nombre] = b64u.aBytes(ICONOS_B64[nombre].replace(/\+/g, '-').replace(/\//g, '_'));
  return PUSH_ICONOS[nombre];
}
async function archivosPublicos(env, request, ruta) {
  const m = request.method;
  if (m === 'GET' && ruta === '/sw.js') return new Response(SW_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
  if (m === 'GET' && ruta === '/manifest.webmanifest') return new Response(MANIFIESTO, { headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  const icono = { '/icono-192.png': 'icono-192', '/icono-512.png': 'icono-512', '/apple-touch-icon.png': 'apple-touch-icon', '/apple-touch-icon-precomposed.png': 'apple-touch-icon',
    '/icono-insignia.png': 'icono-insignia', '/favicon.ico': 'icono-192' }[ruta];
  if (m === 'GET' && icono) return new Response(bytesDeIcono(icono), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
  // Dejar de recibir avisos en un dispositivo (al cerrar sesión o desactivarlos). No pide sesión:
  // la dirección del dispositivo solo la conoce ese navegador.
  if (m === 'POST' && ruta === '/api/push/desuscribir') {
    const b = await request.json().catch(() => ({}));
    if (b && b.endpoint) { try { await env.DB.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1').bind(String(b.endpoint)).run(); } catch (e) { /* sin la tabla, no hay nada que borrar */ } }
    return Response.json({ ok: true });
  }
  return null;
}
