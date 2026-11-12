// =====================================================================
// ADMINISTRACIÓN (etapa 2): usuarios, equipos, reglas de alerta, modelo y auditoría
//
// Página: GET /admin (ADMIN_HTML). API bajo /api/admin/...
//   Usuarios y equipos ...... solo Administrador
//   Reglas de alerta ........ Administrador y Analista
//   Modelo (solo lectura) ... Administrador y Analista
//   Auditoría ............... solo Administrador
//   Umbrales ................ solo Administrador (ver UMBRALES CONFIGURABLES)
// El horizonte y la tolerancia de las tasas informadas no se editan desde acá:
// los cambia el equipo técnico por SQL.
// Tablas: equipos, equipo_miembros, alerta_reglas_personalizadas (admin_d1_tablas.txt).
// =====================================================================

const PERFILES_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte' };
const SEVERIDADES_REGLA = ['CRITICA', 'ALTA', 'MEDIA'];
// Combinaciones posibles: el modelo solo calcula estos límites
const REGLA_COMBINACIONES = {
  VOLUMEN: ['BAJO', 'ALTO'], APROBACION: ['BAJO'], RECHAZO: ['ALTO'], ERROR: ['ALTO'], IMPORTE: ['BAJO', 'ALTO'], LATENCIA: ['ALTO'],
};

// Contraseña temporal legible (sin 0/O, 1/l/I) de 12 caracteres
function claveTemporal() {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  while (out.length < 12) {
    for (const b of crypto.getRandomValues(new Uint8Array(24))) {
      if (b < 224 && out.length < 12) out += abc[b % abc.length];   // 224 = 4 * 56: sin sesgo
    }
  }
  return out;
}
const okJson = (obj) => Response.json(Object.assign({ ok: true }, obj), { headers: { 'cache-control': 'no-store' } });
const aId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const texto = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const opcional = (v, max) => { const t = texto(v, max); return t ? t : null; };

// ---------- Usuarios ----------
async function adminListarPersonas(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT id, usuario, nombre, perfil, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso
                    FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`),
    env.DB.prepare('SELECT id, nombre, descripcion, responsable_id, activo, creado FROM equipos ORDER BY activo DESC, nombre COLLATE NOCASE'),
    env.DB.prepare('SELECT equipo_id, usuario_id FROM equipo_miembros'),
  ]);
  const ahora = new Date().toISOString();
  const usuarios = r[0].results.map((u) => Object.assign(u, { bloqueado: !!(u.bloqueado_hasta && u.bloqueado_hasta > ahora) }));
  return okJson({ usuarios, equipos: r[1].results, miembros: r[2].results });
}

async function adminCrearUsuario(env, request, yo) {
  const b = await leerCuerpo(request);
  const usuario = texto(b.usuario, 60).toLowerCase();
  const nombre = texto(b.nombre, 80);
  const perfil = String(b.perfil || '');
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) return jsonError('El usuario tiene que tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.', 400);
  if (!nombre) return jsonError('Falta el nombre y apellido.', 400);
  if (!PERFILES.includes(perfil)) return jsonError('Elegí un perfil válido.', 400);
  if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE usuario = ?1').bind(usuario).first()) return jsonError('Ya existe un usuario "' + usuario + '".', 409);
  const equipos = (Array.isArray(b.equipos) ? b.equipos : []).map(aId).filter(Boolean).slice(0, 50);
  const clave = claveTemporal();
  const n = await nuevaClave(clave);
  const pasos = [
    env.DB.prepare('INSERT INTO usuarios (usuario, nombre, perfil, hash, sal, iteraciones, debe_cambiar) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)')
      .bind(usuario, nombre, perfil, n.hash, n.sal, n.iteraciones),
  ];
  for (const e of equipos) {
    pasos.push(env.DB.prepare('INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id) SELECT e.id, u.id FROM equipos e, usuarios u WHERE e.id = ?1 AND u.usuario = ?2').bind(e, usuario));
  }
  pasos.push(env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'ALTA_USUARIO', usuario + ' (' + PERFILES_TXT[perfil] + ')'));
  await env.DB.batch(pasos);
  return okJson({ usuario, clave_temporal: clave });
}

// ¿Quedaría algún administrador activo además de este usuario?
async function hayOtroAdmin(env, id) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE perfil = 'ADMIN' AND activo = 1 AND id <> ?1").bind(id).first();
  return r && r.n > 0;
}

async function adminEditarUsuario(env, request, yo, id) {
  const b = await leerCuerpo(request);
  const u = await env.DB.prepare('SELECT id, usuario, nombre, perfil, activo FROM usuarios WHERE id = ?1').bind(id).first();
  if (!u) return jsonError('El usuario no existe.', 404);
  const nombre = b.nombre === undefined ? u.nombre : texto(b.nombre, 80);
  const perfil = b.perfil === undefined ? u.perfil : String(b.perfil);
  const activo = b.activo === undefined ? u.activo : (b.activo ? 1 : 0);
  if (!nombre) return jsonError('Falta el nombre y apellido.', 400);
  if (!PERFILES.includes(perfil)) return jsonError('Elegí un perfil válido.', 400);
  if (u.id === yo.id && (perfil !== u.perfil || !activo)) return jsonError('No podés cambiar tu propio perfil ni desactivarte. Pedíselo a otro administrador.', 400);
  if (u.perfil === 'ADMIN' && u.activo && (perfil !== 'ADMIN' || !activo) && !(await hayOtroAdmin(env, u.id))) {
    return jsonError('Tiene que quedar al menos un administrador activo.', 400);
  }
  const cambios = [];
  if (nombre !== u.nombre) cambios.push('nombre');
  if (perfil !== u.perfil) cambios.push('perfil ' + PERFILES_TXT[u.perfil] + ' → ' + PERFILES_TXT[perfil]);
  if (activo !== u.activo) cambios.push(activo ? 'activado' : 'desactivado');
  const pasos = [];
  if (b.equipos !== undefined) {
    const equipos = (Array.isArray(b.equipos) ? b.equipos : []).map(aId).filter(Boolean).slice(0, 50);
    pasos.push(env.DB.prepare('DELETE FROM equipo_miembros WHERE usuario_id = ?1').bind(id));
    for (const e of equipos) pasos.push(env.DB.prepare('INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id) SELECT id, ?2 FROM equipos WHERE id = ?1').bind(e, id));
    cambios.push('equipos');
  }
  if (!cambios.length) return okJson({});
  pasos.unshift(env.DB.prepare('UPDATE usuarios SET nombre = ?1, perfil = ?2, activo = ?3 WHERE id = ?4').bind(nombre, perfil, activo, id));
  // Si cambia el perfil o se desactiva, se cierran sus sesiones (vuelve a ingresar con los permisos nuevos)
  if (perfil !== u.perfil || !activo) pasos.push(env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?1').bind(id));
  pasos.push(env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'EDITAR_USUARIO', u.usuario + ': ' + cambios.join(', ')));
  await env.DB.batch(pasos);
  return okJson({});
}

async function adminResetearClave(env, yo, id) {
  if (id === yo.id) return jsonError('Para tu propia contraseña usá "Cambiar contraseña" en tu menú.', 400);
  const u = await env.DB.prepare('SELECT id, usuario FROM usuarios WHERE id = ?1').bind(id).first();
  if (!u) return jsonError('El usuario no existe.', 404);
  const clave = claveTemporal();
  const n = await nuevaClave(clave);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET hash = ?1, sal = ?2, iteraciones = ?3, debe_cambiar = 1, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?4')
      .bind(n.hash, n.sal, n.iteraciones, id),
    env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?1').bind(id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'RESETEAR_CLAVE', u.usuario),
  ]);
  return okJson({ usuario: u.usuario, clave_temporal: clave });
}

async function adminDesbloquear(env, yo, id) {
  const u = await env.DB.prepare('SELECT usuario FROM usuarios WHERE id = ?1').bind(id).first();
  if (!u) return jsonError('El usuario no existe.', 404);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?1').bind(id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'DESBLOQUEAR_USUARIO', u.usuario),
  ]);
  return okJson({});
}

// ---------- Equipos ----------
async function adminGuardarEquipo(env, request, yo, id) {
  const b = await leerCuerpo(request);
  const previo = id ? await env.DB.prepare('SELECT * FROM equipos WHERE id = ?1').bind(id).first() : null;
  if (id && !previo) return jsonError('El equipo no existe.', 404);
  const nombre = b.nombre === undefined && previo ? previo.nombre : texto(b.nombre, 60);
  const descripcion = b.descripcion === undefined && previo ? previo.descripcion : opcional(b.descripcion, 200);
  const responsable = b.responsable_id === undefined && previo ? previo.responsable_id : aId(b.responsable_id);
  const activo = b.activo === undefined ? (previo ? previo.activo : 1) : (b.activo ? 1 : 0);
  if (nombre.length < 2) return jsonError('El nombre del equipo tiene que tener al menos 2 caracteres.', 400);
  const otro = await env.DB.prepare('SELECT id FROM equipos WHERE nombre = ?1 COLLATE NOCASE AND id <> ?2').bind(nombre, id || 0).first();
  if (otro) return jsonError('Ya existe un equipo llamado "' + nombre + '".', 409);
  if (responsable && !(await env.DB.prepare('SELECT 1 FROM usuarios WHERE id = ?1').bind(responsable).first())) return jsonError('El responsable no existe.', 400);
  let miembros = b.miembros === undefined ? null : (Array.isArray(b.miembros) ? b.miembros : []).map(aId).filter(Boolean).slice(0, 200);
  if (miembros && responsable && !miembros.includes(responsable)) miembros.push(responsable);   // el responsable es parte del equipo
  const pasos = [];
  if (previo) {
    pasos.push(env.DB.prepare('UPDATE equipos SET nombre = ?1, descripcion = ?2, responsable_id = ?3, activo = ?4 WHERE id = ?5').bind(nombre, descripcion, responsable, activo, id));
  } else {
    pasos.push(env.DB.prepare('INSERT INTO equipos (nombre, descripcion, responsable_id, activo) VALUES (?1, ?2, ?3, ?4)').bind(nombre, descripcion, responsable, activo));
  }
  // El id del equipo nuevo se busca por nombre dentro del mismo lote
  const idEquipo = 'SELECT id FROM equipos WHERE nombre = ?1 COLLATE NOCASE';
  if (miembros) {
    pasos.push(env.DB.prepare(`DELETE FROM equipo_miembros WHERE equipo_id = (${idEquipo})`).bind(nombre));
    for (const m of miembros) {
      pasos.push(env.DB.prepare(`INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id) SELECT (${idEquipo}), id FROM usuarios WHERE id = ?2`).bind(nombre, m));
    }
  }
  const det = nombre + (previo && previo.nombre !== nombre ? ' (antes ' + previo.nombre + ')' : '') + (previo && previo.activo !== activo ? (activo ? ', activado' : ', desactivado') : '') +
    (miembros ? ', ' + miembros.length + ' miembro(s)' : '');
  pasos.push(env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, previo ? 'EDITAR_EQUIPO' : 'ALTA_EQUIPO', det));
  await env.DB.batch(pasos);
  return okJson({});
}

// ---------- Reglas de alerta ----------
async function adminListarReglas(env) {
  const r = await env.DB.batch([
    env.DB.prepare('SELECT regla, orden, grupo, descripcion, activa FROM alerta_reglas ORDER BY orden'),
    env.DB.prepare(`SELECT r.id, r.nombre, r.metrica, r.direccion, r.ventanas_seguidas, r.cliente_id, r.servicio_id, r.canal_id,
                           r.severidad, r.activa, r.creada, r.actualizada, u.nombre AS creada_por_nombre
                    FROM alerta_reglas_personalizadas r LEFT JOIN usuarios u ON u.id = r.creada_por
                    ORDER BY r.activa DESC, r.id`),
    // Clientes, servicios y canales que tiene el modelo (último día de predicciones, por índice)
    env.DB.prepare(`SELECT DISTINCT cliente_id, servicio_id, canal_id FROM core_metricas_esperadas
                    WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')
                    ORDER BY cliente_id, servicio_id, canal_id`),
    // Cuántas veces disparó cada tipo en los últimos 7 días (del reloj de la demo si está puesto)
    env.DB.prepare(`SELECT tipo_alerta, COUNT(*) AS ventanas FROM alertas_historico
                    WHERE ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-7 days') FROM alerta_parametros WHERE id = 1)
                    GROUP BY tipo_alerta`),
  ]);
  return okJson({ base: r[0].results, personalizadas: r[1].results, series: r[2].results, disparos: r[3].results, combinaciones: REGLA_COMBINACIONES });
}

async function adminActivarReglaBase(env, request, yo, regla) {
  const b = await leerCuerpo(request);
  const activa = b.activa ? 1 : 0;
  const r = await env.DB.prepare('UPDATE alerta_reglas SET activa = ?1 WHERE regla = ?2').bind(activa, regla).run();
  if (!r.meta.changes) return jsonError('La regla no existe.', 404);
  await auditar(env, yo.id, activa ? 'REGLA_ACTIVADA' : 'REGLA_DESACTIVADA', regla);
  return okJson({});
}

async function adminGuardarRegla(env, request, yo, id) {
  const b = await leerCuerpo(request);
  const previo = id ? await env.DB.prepare('SELECT * FROM alerta_reglas_personalizadas WHERE id = ?1').bind(id).first() : null;
  if (id && !previo) return jsonError('La regla no existe.', 404);
  const v = (k, max) => (b[k] === undefined && previo ? previo[k] : opcional(b[k], max));
  const nombre = v('nombre', 80);
  const metrica = v('metrica', 20);
  const direccion = v('direccion', 10);
  const severidad = v('severidad', 10);
  const ventanas = b.ventanas_seguidas === undefined && previo ? previo.ventanas_seguidas : Number(b.ventanas_seguidas);
  const cliente = v('cliente_id', 40), servicio = v('servicio_id', 40), canal = v('canal_id', 40);
  const activa = b.activa === undefined ? (previo ? previo.activa : 1) : (b.activa ? 1 : 0);
  if (!nombre || nombre.length < 3) return jsonError('Poné un nombre de al menos 3 caracteres: es lo que se va a leer en el tablero.', 400);
  if (!REGLA_COMBINACIONES[metrica]) return jsonError('Elegí qué mirar.', 400);
  if (!REGLA_COMBINACIONES[metrica].includes(direccion)) return jsonError('Para esa métrica el modelo no calcula ese límite.', 400);
  if (!Number.isInteger(ventanas) || ventanas < 1 || ventanas > 8) return jsonError('Las ventanas seguidas tienen que ser entre 1 y 8.', 400);
  if (!SEVERIDADES_REGLA.includes(severidad)) return jsonError('Elegí la severidad.', 400);
  for (const t of [cliente, servicio, canal]) if (t && !/^[A-Za-z0-9_.-]{1,40}$/.test(t)) return jsonError('Alcance inválido.', 400);
  if (previo) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE alerta_reglas_personalizadas SET nombre = ?1, metrica = ?2, direccion = ?3, ventanas_seguidas = ?4, cliente_id = ?5,
                      servicio_id = ?6, canal_id = ?7, severidad = ?8, activa = ?9, actualizada = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10`)
        .bind(nombre, metrica, direccion, ventanas, cliente, servicio, canal, severidad, activa, id),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
        .bind(yo.id, previo.activa !== activa ? (activa ? 'REGLA_ACTIVADA' : 'REGLA_DESACTIVADA') : 'EDITAR_REGLA', 'PERS_' + id + ' ' + nombre),
    ]);
    return okJson({ id });
  }
  await env.DB.prepare(`INSERT INTO alerta_reglas_personalizadas (nombre, metrica, direccion, ventanas_seguidas, cliente_id, servicio_id, canal_id, severidad, activa, creada_por)
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`).bind(nombre, metrica, direccion, ventanas, cliente, servicio, canal, severidad, activa, yo.id).run();
  const nueva = await env.DB.prepare('SELECT MAX(id) AS id FROM alerta_reglas_personalizadas WHERE creada_por = ?1').bind(yo.id).first();
  await auditar(env, yo.id, 'ALTA_REGLA', 'PERS_' + nueva.id + ' ' + nombre);
  return okJson({ id: nueva.id });
}

// ---------- Modelo (solo lectura) ----------
async function adminModelo(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT modelo_id, modelo_version, origen_prediccion, MAX(fecha_generacion) AS ultima_generacion,
                           MIN(ventana_inicio) AS desde, MAX(ventana_inicio) AS hasta, COUNT(*) AS predicciones,
                           COUNT(DISTINCT cliente_id || '|' || servicio_id || '|' || canal_id || '|' || producto_id) AS series
                    FROM core_metricas_esperadas WHERE estado_prediccion = 'ACTIVA'
                    GROUP BY modelo_id, modelo_version, origen_prediccion ORDER BY ultima_generacion DESC`),
    // Por separado: así SQLite usa el índice y lee una sola fila en cada una
    env.DB.prepare('SELECT MIN(ventana_inicio) AS v FROM core_metricas_observadas'),
    env.DB.prepare('SELECT MAX(ventana_inicio) AS v FROM core_metricas_observadas'),
    env.DB.prepare('SELECT ahora FROM alerta_parametros WHERE id = 1'),
  ]);
  return okJson({
    modelos: r[0].results,
    observadas_desde: (r[1].results[0] || {}).v, observadas_hasta: (r[2].results[0] || {}).v,
    reloj: (r[3].results[0] || {}).ahora || null,
  });
}

// ---------- Auditoría ----------
async function adminAuditoria(env, url) {
  const q = url.searchParams;
  const dia = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t || '') ? t : null);
  // Días de Argentina (UTC-3): de las 03:00 UTC de "desde" a las 03:00 UTC del día siguiente a "hasta"
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const desde = dia(q.get('desde')) || new Date(Date.now() - 3 * 3600e3 - 6 * 864e5).toISOString().slice(0, 10);
  const hasta = dia(q.get('hasta')) || hoy;
  const ini = desde + 'T03:00:00.000Z';
  const fin = new Date(Date.parse(hasta + 'T03:00:00.000Z') + 864e5).toISOString();
  const usuario = aId(q.get('usuario'));
  const accion = /^[A-Z_]{2,40}$/.test(q.get('accion') || '') ? q.get('accion') : null;
  const r = await env.DB.prepare(`SELECT a.id, a.fecha, a.accion, a.detalle, a.usuario_id, u.nombre, u.usuario
                                  FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
                                  WHERE a.fecha >= ?1 AND a.fecha < ?2 AND (?3 IS NULL OR a.usuario_id = ?3) AND (?4 IS NULL OR a.accion = ?4)
                                  ORDER BY a.fecha DESC, a.id DESC LIMIT 301`).bind(ini, fin, usuario, accion).all();
  const filas = r.results;
  return okJson({ filas: filas.slice(0, 300), hay_mas: filas.length > 300, desde, hasta });
}

// ---------- Rutas ----------
// Devuelve una respuesta si la ruta es de administración, o null si no lo es.
async function rutasAdmin(env, request, ruta, url, yo) {
  const m = request.method;
  if (ruta === '/admin') {
    if (m !== 'GET') return null;
    if (!puede(yo, 'admin_panel')) return Response.redirect(new URL('/', request.url).toString(), 302);
    return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (!ruta.startsWith('/api/admin/')) return null;
  const sinPermiso = () => jsonError('Tu perfil no tiene permiso para esta sección.', 403);
  const p = ruta.slice('/api/admin'.length);
  let x;
  // Usuarios y equipos
  if (p === '/usuarios' || p.startsWith('/usuarios/') || p === '/equipos' || p.startsWith('/equipos/')) {
    if (!puede(yo, p.startsWith('/equipos') ? 'admin_equipos' : 'admin_usuarios')) return sinPermiso();
    if (m === 'GET' && (p === '/usuarios' || p === '/equipos')) return await adminListarPersonas(env);
    if (m === 'POST' && p === '/usuarios') return await adminCrearUsuario(env, request, yo);
    if (m === 'POST' && (x = p.match(/^\/usuarios\/(\d+)$/))) return await adminEditarUsuario(env, request, yo, Number(x[1]));
    if (m === 'POST' && (x = p.match(/^\/usuarios\/(\d+)\/resetear-clave$/))) return await adminResetearClave(env, yo, Number(x[1]));
    if (m === 'POST' && (x = p.match(/^\/usuarios\/(\d+)\/desbloquear$/))) return await adminDesbloquear(env, yo, Number(x[1]));
    if (m === 'POST' && p === '/equipos') return await adminGuardarEquipo(env, request, yo, null);
    if (m === 'POST' && (x = p.match(/^\/equipos\/(\d+)$/))) return await adminGuardarEquipo(env, request, yo, Number(x[1]));
  }
  if (p === '/reglas' || p.startsWith('/reglas/')) {
    if (!puede(yo, 'admin_reglas')) return sinPermiso();
    if (m === 'GET' && p === '/reglas') return await adminListarReglas(env);
    if (m === 'POST' && (x = p.match(/^\/reglas\/base\/([A-Z_]{2,40})$/))) return await adminActivarReglaBase(env, request, yo, x[1]);
    if (m === 'POST' && p === '/reglas') return await adminGuardarRegla(env, request, yo, null);
    if (m === 'POST' && (x = p.match(/^\/reglas\/(\d+)$/))) return await adminGuardarRegla(env, request, yo, Number(x[1]));
  }
  if (p === '/modelo') {
    if (!puede(yo, 'admin_modelo')) return sinPermiso();
    if (m === 'GET') return await adminModelo(env);
  }
  if (p === '/auditoria') {
    if (!puede(yo, 'admin_auditoria')) return sinPermiso();
    if (m === 'GET') return await adminAuditoria(env, url);
  }
  if (p === '/feriados' || p.startsWith('/feriados/')) {
    if (!puede(yo, 'admin_umbrales')) return sinPermiso();
    const r = await rutasFeriados(env, request, p, url, yo);
    if (r) return r;
  }
  if (p === '/umbrales' || p.startsWith('/umbrales/')) {
    if (!puede(yo, 'admin_umbrales')) return sinPermiso();
    const r = await rutasUmbrales(env, request, p, url, yo);
    if (r) return r;
  }
  if (p === '/derivacion' || p.startsWith('/derivacion/')) {
    if (!puede(yo, 'admin_derivacion')) return sinPermiso();
    const r = await rutasDerivacion(env, request, p, yo);
    if (r) return r;
  }
  return jsonError('Ruta no encontrada: ' + ruta, 404);
}
