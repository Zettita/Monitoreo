// =====================================================================
// ACCESO: usuarios, sesiones y permisos por perfil (etapa 1)
//
// Versión para el plan gratuito de Workers (10 ms de CPU por pedido) y datos
// ficticios de demo. PENDIENTE AL MIGRAR A PRODUCCIÓN:
//   - Subir ITERACIONES de PBKDF2 (referencia OWASP: 600.000 con SHA-256).
//     Cada hash guarda sus iteraciones: al subirlas, los usuarios se
//     actualizan solos en su próximo ingreso.
//   - Agregar un "pepper" (clave secreta del Worker) al cálculo del hash.
//   - Revisar política de contraseñas, duración de sesiones y bloqueo.
//
// Tablas: usuarios, sesiones, auditoria (acceso_d1_tablas.txt).
// Rutas públicas: GET /login, POST /api/login, GET/POST /api/setup.
// Todas las demás exigen sesión y se controlan por perfil.
// =====================================================================

const ITERACIONES = 20000;          // ~3 ms de CPU por cálculo
const DURACION_SESION_H = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 10;
const LARGO_MINIMO_CLAVE = 10;
const COOKIE_SESION = 'helios_sesion';
const PERFILES = ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'];
const PERMISOS = {
  ver: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],
  accion_alerta: ['ADMIN', 'ANALISTA', 'SOPORTE'],   // tomar y resolver
  procesar: ['ADMIN', 'ANALISTA'],                    // "Revisar alertas ahora"
  demo: ['ADMIN', 'ANALISTA'],                        // botones de la demo
  mis_alertas: ['ADMIN', 'SOPORTE'],                 // página "Mis alertas": quienes toman y resuelven alertas
  seguimiento: ['ADMIN', 'ANALISTA', 'GERENTE'],      // página "Seguimiento": todas las alertas abiertas y quién las tiene
  derivar: ['ADMIN', 'ANALISTA'],                     // asignar alertas a personas o equipos
  admin_panel: ['ADMIN', 'ANALISTA'],                 // entrar a /admin
  admin_usuarios: ['ADMIN'],                          // usuarios
  admin_equipos: ['ADMIN'],                           // equipos
  admin_reglas: ['ADMIN', 'ANALISTA'],                // reglas de alerta
  admin_derivacion: ['ADMIN', 'ANALISTA'],            // reglas de derivación automática
  admin_modelo: ['ADMIN', 'ANALISTA'],                // estado del modelo (solo lectura)
  admin_auditoria: ['ADMIN'],                         // registro de auditoría
  admin_umbrales: ['ADMIN'],                          // umbrales por cliente (criticidad, cortes, bandas, gracia)
};
const puede = (u, permiso) => !!u && (PERMISOS[permiso] || []).includes(u.perfil);
// Solo estos perfiles reciben alertas (las toman y las resuelven). El analista deriva; el gerente mira.
const PERFILES_RECIBEN = PERMISOS.mis_alertas;
const SQL_PERFILES_RECIBEN = "perfil IN ('ADMIN', 'SOPORTE')";

const aB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (txt) => Uint8Array.from(atob(txt), (c) => c.charCodeAt(0));
const aB64url = (buf) => aB64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hashClave(clave, salB64, iteraciones) {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deB64(salB64), iterations: iteraciones }, llave, 256);
  return aB64(bits);
}
async function nuevaClave(clave) {
  const sal = aB64(crypto.getRandomValues(new Uint8Array(16)));
  return { sal, iteraciones: ITERACIONES, hash: await hashClave(clave, sal, ITERACIONES) };
}
// Comparación en tiempo constante (no revela cuántos caracteres coinciden)
function mismoTexto(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function sha256(txt) { return aB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))); }
function validarClave(clave) {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_CLAVE) return 'La contraseña tiene que tener al menos ' + LARGO_MINIMO_CLAVE + ' caracteres.';
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}
function leerCookie(request, nombre) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? m[1] : null;
}
const cookieSesion = (token, segundos) => `${COOKIE_SESION}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${segundos}`;
const jsonError = (msg, status) => Response.json({ ok: false, error: msg }, { status });
async function leerCuerpo(request) { try { return await request.json(); } catch (e) { return {}; } }

async function auditar(env, usuarioId, accion, detalle) {
  await env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
    .bind(usuarioId == null ? null : usuarioId, accion, detalle == null ? null : String(detalle).slice(0, 500)).run();
}

// Usuario de la sesión (una sola consulta por la clave primaria de sesiones)
async function usuarioDeSesion(env, request) {
  const token = leerCookie(request, COOKIE_SESION);
  if (!token) return null;
  return await env.DB.prepare(`
    SELECT u.id, u.usuario, u.nombre, u.perfil, u.debe_cambiar
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ?1 AND s.vence > ?2 AND u.activo = 1`).bind(await sha256(token), new Date().toISOString()).first();
}

async function iniciarSesion(env, request) {
  const b = await leerCuerpo(request);
  const usuario = String(b.usuario || '').trim().toLowerCase().slice(0, 60);
  const clave = String(b.clave || '');
  const incorrecto = () => jsonError('Usuario o contraseña incorrectos.', 401);
  if (!usuario || !clave) return incorrecto();
  const u = await env.DB.prepare('SELECT * FROM usuarios WHERE usuario = ?1').bind(usuario).first();
  const ahora = new Date();
  if (!u || !u.activo) { await auditar(env, u ? u.id : null, 'LOGIN_FALLIDO', usuario); return incorrecto(); }
  if (u.bloqueado_hasta && u.bloqueado_hasta > ahora.toISOString()) {
    return jsonError('Demasiados intentos fallidos. Probá de nuevo en unos minutos.', 429);
  }
  if (!mismoTexto(await hashClave(clave, u.sal, u.iteraciones), u.hash)) {
    const n = (u.intentos_fallidos || 0) + 1;
    const bloqueo = n >= MAX_INTENTOS ? new Date(ahora.getTime() + BLOQUEO_MIN * 60e3).toISOString() : null;
    await env.DB.batch([
      env.DB.prepare('UPDATE usuarios SET intentos_fallidos = ?1, bloqueado_hasta = ?2 WHERE id = ?3').bind(bloqueo ? 0 : n, bloqueo, u.id),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(u.id, bloqueo ? 'USUARIO_BLOQUEADO' : 'LOGIN_FALLIDO', usuario),
    ]);
    return bloqueo ? jsonError('Demasiados intentos fallidos. El usuario queda bloqueado ' + BLOQUEO_MIN + ' minutos.', 429) : incorrecto();
  }
  const token = aB64url(crypto.getRandomValues(new Uint8Array(32)));
  const vence = new Date(ahora.getTime() + DURACION_SESION_H * 3600e3).toISOString();
  const pasos = [
    env.DB.prepare('INSERT INTO sesiones (token_hash, usuario_id, creada, vence) VALUES (?1, ?2, ?3, ?4)').bind(await sha256(token), u.id, ahora.toISOString(), vence),
    env.DB.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = ?1 WHERE id = ?2').bind(ahora.toISOString(), u.id),
    env.DB.prepare('DELETE FROM sesiones WHERE vence <= ?1').bind(ahora.toISOString()),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, NULL)').bind(u.id, 'LOGIN'),
  ];
  // Si cambió la cantidad de iteraciones, se actualiza el hash ahora que tenemos la clave
  if (u.iteraciones !== ITERACIONES) {
    const n = await nuevaClave(clave);
    pasos.push(env.DB.prepare('UPDATE usuarios SET hash = ?1, sal = ?2, iteraciones = ?3 WHERE id = ?4').bind(n.hash, n.sal, n.iteraciones, u.id));
  }
  await env.DB.batch(pasos);
  return Response.json({ ok: true, debe_cambiar: !!u.debe_cambiar }, { headers: { 'set-cookie': cookieSesion(token, DURACION_SESION_H * 3600) } });
}

async function cerrarSesion(env, request, u) {
  const token = leerCookie(request, COOKIE_SESION);
  if (token) await env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?1').bind(await sha256(token)).run();
  if (u) await auditar(env, u.id, 'LOGOUT', null);
  return Response.json({ ok: true }, { headers: { 'set-cookie': cookieSesion('', 0) } });
}

async function cambiarClave(env, request, u) {
  const b = await leerCuerpo(request);
  const fila = await env.DB.prepare('SELECT hash, sal, iteraciones FROM usuarios WHERE id = ?1').bind(u.id).first();
  if (!fila || !mismoTexto(await hashClave(String(b.actual || ''), fila.sal, fila.iteraciones), fila.hash)) return jsonError('La contraseña actual no es correcta.', 400);
  const err = validarClave(b.nueva);
  if (err) return jsonError(err, 400);
  if (b.nueva === b.actual) return jsonError('La contraseña nueva tiene que ser distinta de la actual.', 400);
  const n = await nuevaClave(b.nueva);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET hash = ?1, sal = ?2, iteraciones = ?3, debe_cambiar = 0 WHERE id = ?4').bind(n.hash, n.sal, n.iteraciones, u.id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, NULL)').bind(u.id, 'CAMBIO_CLAVE'),
  ]);
  return Response.json({ ok: true });
}

// Configuración inicial: solo funciona mientras no haya ningún usuario
async function hayUsuarios(env) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
  return r && r.n > 0;
}
async function crearPrimerAdmin(env, request) {
  if (await hayUsuarios(env)) return jsonError('El sistema ya tiene usuarios. Pedile acceso a un administrador.', 403);
  const b = await leerCuerpo(request);
  const usuario = String(b.usuario || '').trim().toLowerCase();
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return jsonError('El usuario tiene que tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.', 400);
  if (!nombre) return jsonError('Falta el nombre.', 400);
  const err = validarClave(b.clave);
  if (err) return jsonError(err, 400);
  const n = await nuevaClave(b.clave);
  await env.DB.prepare('INSERT INTO usuarios (usuario, nombre, perfil, hash, sal, iteraciones, debe_cambiar) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)')
    .bind(usuario, nombre, 'ADMIN', n.hash, n.sal, n.iteraciones).run();
  const u = await env.DB.prepare('SELECT id FROM usuarios WHERE usuario = ?1').bind(usuario).first();
  await auditar(env, u.id, 'ALTA_PRIMER_ADMIN', usuario);
  return Response.json({ ok: true });
}

// Rutas de acceso. Devuelve una respuesta, o { usuario } si el pedido puede seguir.
async function controlarAcceso(env, request, ruta) {
  const m = request.method;
  if (m === 'GET' && ruta === '/login') return new Response(LOGIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  if (m === 'POST' && ruta === '/api/login') return await iniciarSesion(env, request);
  if (m === 'GET' && ruta === '/api/setup') return Response.json({ ok: true, necesita: !(await hayUsuarios(env)) });
  if (m === 'POST' && ruta === '/api/setup') return await crearPrimerAdmin(env, request);

  const u = await usuarioDeSesion(env, request);
  if (!u) {
    if (m === 'GET' && !ruta.startsWith('/api/')) return Response.redirect(new URL('/login', request.url).toString(), 302);
    return jsonError('Tu sesión venció o no iniciaste sesión.', 401);
  }
  if (m === 'POST' && ruta === '/api/logout') return await cerrarSesion(env, request, u);
  if (m === 'GET' && ruta === '/api/yo') {
    return Response.json({ ok: true, usuario: { id: u.id, usuario: u.usuario, nombre: u.nombre, perfil: u.perfil, debe_cambiar: !!u.debe_cambiar },
      permisos: Object.keys(PERMISOS).filter((p) => puede(u, p)) }, { headers: { 'cache-control': 'no-store' } });
  }
  if (m === 'POST' && ruta === '/api/cambiar-clave') return await cambiarClave(env, request, u);
  if (u.debe_cambiar && ruta.startsWith('/api/')) return jsonError('Antes de seguir tenés que cambiar tu contraseña.', 403);

  // Permisos por ruta
  const exigir = (permiso) => (puede(u, permiso) ? null : jsonError('Tu perfil no tiene permiso para esta acción.', 403));
  if (ruta === '/api/procesar' || ruta === '/procesar') { const e = exigir('procesar'); if (e) return e; }
  if (ruta.startsWith('/api/demo')) { const e = exigir('demo'); if (e) return e; }
  if (/^\/api\/alertas\/[0-9a-f]{32}\/(reconocer|resolver)$/.test(ruta)) { const e = exigir('accion_alerta'); if (e) return e; }
  return { usuario: u };
}
