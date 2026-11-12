// =====================================================================
// ASIGNACIÓN DE ALERTAS (etapa 3)
//
// Una "alerta" del tablero son todas las ventanas abiertas del mismo problema
// (mismo tipo_alerta en la misma serie). Cada acción se aplica a todo el grupo.
//
// Estados:  ABIERTA sin asignar ──Derivar──▶ ABIERTA asignada (a persona y/o equipo)
//           ──Tomar──▶ RECONOCIDA (en curso, asignado_usuario_id = quien la tomó)
//           ──Resolver──▶ RESUELTA        ──Devolver──▶ ABIERTA sin asignar
//
// Quién puede:
//   Derivar ...... Administrador y Analista (cualquier alerta, a persona o equipo de
//                  soporte; las personas destino son Soporte o Administrador).
//                  El responsable de un equipo puede reasignar las alertas de su
//                  equipo a un miembro o dejarlas para todo el equipo.
//   Tomar ........ Administrador (cualquiera sin tomar). Soporte: solo lo asignado a
//                  él o a un equipo suyo sin persona asignada. El Analista no toma: deriva.
//   Comentar ..... quien la tiene, su equipo, el responsable del equipo, Admin y Analista.
//   Devolver ..... quien la tiene asignada (o su equipo, si no tiene persona). Vuelve
//                  "Sin asignar" a la bandeja del analista, con el motivo.
//   Resolver ..... Administrador y Analista, o la persona que la tiene asignada.
// Cada acción queda en alerta_eventos (historial de la alerta) y en auditoria.
// Las ventanas nuevas de un problema ya asignado heredan la asignación (HEREDAR_ASIGNACION).
// =====================================================================

const SERIE_GRUPO = `(tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos)`;
// Filas abiertas del mismo problema que la alerta ?1
const GRUPO_ABIERTO = `estado IN ('ABIERTA', 'RECONOCIDA')
  AND ${SERIE_GRUPO} = (SELECT tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos
                        FROM alertas_historico WHERE alerta_id = ?1)`;
const AHORA_SIM = `(SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)`;

// Ventanas nuevas de un problema ya asignado: copian la asignación de las anteriores
const HEREDAR_ASIGNACION = `
UPDATE alertas_historico
SET (asignado_usuario_id, asignado_equipo_id, asignado_en, asignado_por, estado, reconocida_por, fecha_reconocimiento) = (
        SELECT h.asignado_usuario_id, h.asignado_equipo_id, h.asignado_en, h.asignado_por, h.estado, h.reconocida_por, h.fecha_reconocimiento
        FROM alertas_historico h
        WHERE h.estado IN ('ABIERTA', 'RECONOCIDA')
          AND h.tipo_alerta = alertas_historico.tipo_alerta AND h.ambiente = alertas_historico.ambiente
          AND h.cliente_id = alertas_historico.cliente_id AND h.servicio_id = alertas_historico.servicio_id
          AND h.producto_id = alertas_historico.producto_id AND h.canal_id = alertas_historico.canal_id
          AND h.moneda_id = alertas_historico.moneda_id AND h.duracion_ventana_minutos = alertas_historico.duracion_ventana_minutos
          AND (h.asignado_usuario_id IS NOT NULL OR h.asignado_equipo_id IS NOT NULL)
        ORDER BY h.asignado_en DESC
        LIMIT 1)
WHERE estado = 'ABIERTA'
  AND asignado_usuario_id IS NULL AND asignado_equipo_id IS NULL
  AND EXISTS (
        SELECT 1 FROM alertas_historico h
        WHERE h.estado IN ('ABIERTA', 'RECONOCIDA')
          AND h.tipo_alerta = alertas_historico.tipo_alerta AND h.ambiente = alertas_historico.ambiente
          AND h.cliente_id = alertas_historico.cliente_id AND h.servicio_id = alertas_historico.servicio_id
          AND h.producto_id = alertas_historico.producto_id AND h.canal_id = alertas_historico.canal_id
          AND h.moneda_id = alertas_historico.moneda_id AND h.duracion_ventana_minutos = alertas_historico.duracion_ventana_minutos
          AND (h.asignado_usuario_id IS NOT NULL OR h.asignado_equipo_id IS NOT NULL))
`;

// Columnas de alerta con los nombres de a quién está asignada
const COLUMNAS_ALERTA = `h.alerta_id, h.tipo_alerta, h.severidad, h.severidad_maxima, h.estado,
    h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id,
    h.ventana_inicio, h.metrica, h.valor_observado, h.valor_esperado, h.desvio, h.primera_deteccion,
    h.reconocida_por, h.fecha_reconocimiento, h.fecha_resolucion, h.motivo_resolucion, h.resuelta_por,
    h.asignado_usuario_id, h.asignado_equipo_id, h.asignado_en,
    ua.nombre AS asignado_nombre, eq.nombre AS equipo_nombre, ap.nombre AS asignado_por_nombre`;
const JOIN_NOMBRES = `LEFT JOIN usuarios ua ON ua.id = h.asignado_usuario_id
    LEFT JOIN equipos eq ON eq.id = h.asignado_equipo_id
    LEFT JOIN usuarios ap ON ap.id = h.asignado_por`;

// Eventos (historial) de las alertas abiertas, para el tablero
const Q_EVENTOS_ABIERTAS = `
SELECT e.id, e.fecha, e.alerta_id, e.accion, e.comentario, u.nombre AS usuario_nombre,
       ud.nombre AS destino_nombre, ed.nombre AS equipo_destino_nombre
FROM alertas_historico h
JOIN alerta_eventos e ON e.alerta_id = h.alerta_id
LEFT JOIN usuarios u ON u.id = e.usuario_id
LEFT JOIN usuarios ud ON ud.id = e.usuario_destino_id
LEFT JOIN equipos ed ON ed.id = e.equipo_destino_id
WHERE h.estado IN ('ABIERTA', 'RECONOCIDA')
ORDER BY e.fecha, e.id`;
const Q_ABIERTAS_ASIGNACION = `
SELECT ${COLUMNAS_ALERTA},
    ROUND((p.ahora_jd - julianday(h.primera_deteccion)) * 1440) AS minutos_abierta
FROM alertas_historico h
${JOIN_NOMBRES}
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd FROM alerta_parametros WHERE id = 1) p
WHERE h.estado IN ('ABIERTA', 'RECONOCIDA')
ORDER BY CASE h.severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END, h.ventana_inicio DESC`;

async function misEquipos(env, uid) {
  const r = await env.DB.batch([
    env.DB.prepare('SELECT m.equipo_id AS id FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1 WHERE m.usuario_id = ?1').bind(uid),
    env.DB.prepare('SELECT id FROM equipos WHERE responsable_id = ?1 AND activo = 1').bind(uid),
  ]);
  return { miembro: r[0].results.map((x) => x.id), lidero: r[1].results.map((x) => x.id) };
}
const esAnalista = (u) => u.perfil === 'ADMIN' || u.perfil === 'ANALISTA';

// Cantidad de alertas pendientes del usuario (para el número del botón "Mis alertas")
async function contarMisAlertas(env, yo) {
  const r = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT DISTINCT ${SERIE_GRUPO.slice(1, -1).split(',').map((c) => 'h.' + c.trim()).join(', ')}
      FROM alertas_historico h
      WHERE h.estado IN ('ABIERTA', 'RECONOCIDA') AND h.severidad <> 'BAJA'
        AND (h.asignado_usuario_id = ?1
             OR (h.asignado_usuario_id IS NULL AND h.estado = 'ABIERTA'
                 AND h.asignado_equipo_id IN (SELECT m.equipo_id FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1 WHERE m.usuario_id = ?1))))`)
    .bind(yo.id).first();
  return r ? r.n : 0;
}

// Datos de la página "Mis alertas"
async function datosMisAlertas(env, yo) {
  const eq = await misEquipos(env, yo.id);
  const ids = Array.from(new Set(eq.miembro.concat(eq.lidero)));
  const lista = ids.length ? ids.join(',') : '0';   // ids enteros de la base: seguros para armar el IN
  const r = await env.DB.batch([
    // Abiertas que me tocan: mías, de mis equipos o de equipos que lidero
    env.DB.prepare(`SELECT ${COLUMNAS_ALERTA} FROM alertas_historico h ${JOIN_NOMBRES}
                    WHERE h.estado IN ('ABIERTA', 'RECONOCIDA') AND h.severidad <> 'BAJA'
                      AND (h.asignado_usuario_id = ?1 OR h.asignado_equipo_id IN (${lista}))
                    ORDER BY h.ventana_inicio`).bind(yo.id),
    // Resueltas en las últimas 24 h (del reloj de la demo si está puesto) que tenía yo
    env.DB.prepare(`SELECT ${COLUMNAS_ALERTA} FROM alertas_historico h ${JOIN_NOMBRES}
                    WHERE h.estado = 'RESUELTA' AND h.asignado_usuario_id = ?1
                      AND h.fecha_resolucion >= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-1 day') FROM alerta_parametros WHERE id = 1)
                    ORDER BY h.fecha_resolucion DESC, h.ventana_inicio`).bind(yo.id),
    env.DB.prepare(`SELECT e.id, e.fecha, e.alerta_id, e.accion, e.comentario, u.nombre AS usuario_nombre, ud.nombre AS destino_nombre, ed.nombre AS equipo_destino_nombre
                    FROM alertas_historico h JOIN alerta_eventos e ON e.alerta_id = h.alerta_id
                    LEFT JOIN usuarios u ON u.id = e.usuario_id LEFT JOIN usuarios ud ON ud.id = e.usuario_destino_id LEFT JOIN equipos ed ON ed.id = e.equipo_destino_id
                    WHERE (h.asignado_usuario_id = ?1 OR h.asignado_equipo_id IN (${lista}))
                      AND (h.estado IN ('ABIERTA', 'RECONOCIDA')
                           OR h.fecha_resolucion >= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-1 day') FROM alerta_parametros WHERE id = 1))
                    ORDER BY e.fecha, e.id`).bind(yo.id),
    env.DB.prepare(`SELECT e.id, e.nombre, e.responsable_id FROM equipos e WHERE e.id IN (${lista}) ORDER BY e.nombre`),
    env.DB.prepare(`SELECT m.equipo_id, u.id, u.nombre, u.perfil FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1
                    WHERE m.equipo_id IN (${eq.lidero.length ? eq.lidero.join(',') : '0'}) ORDER BY u.nombre`),
    env.DB.prepare('SELECT strftime(\'%Y-%m-%dT%H:%M:%SZ\', COALESCE(ahora, \'now\')) AS ahora, ahora AS simulado FROM alerta_parametros WHERE id = 1'),
    env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
    env.DB.prepare(Q_UMBRALES_TABLERO),
  ]);
  return {
    umbrales: r[7].results,
    ok: true, abiertas: r[0].results, resueltas: r[1].results, eventos: r[2].results,
    equipos: r[3].results, miembros_lidero: r[4].results, mis_equipos: eq.miembro, lidero: eq.lidero,
    ahora: (r[5].results[0] || {}).ahora, reloj_simulado: !!(r[5].results[0] || {}).simulado, reglas_personalizadas: r[6].results,
  };
}

// Datos de la página "Seguimiento" (analistas, administrador y gerente): todas las alertas abiertas,
// quién las tiene, la carga de cada equipo y lo resuelto en las últimas 24 h. Lee pocas filas:
// las abiertas por el índice de estado y las resueltas por el índice de ventana_inicio.
async function datosSeguimiento(env) {
  const r = await env.DB.batch([
    env.DB.prepare(Q_ABIERTAS_ASIGNACION),
    env.DB.prepare(Q_EVENTOS_ABIERTAS),
    env.DB.prepare(`SELECT ${COLUMNAS_ALERTA}, h.comentario AS comentario_resolucion FROM alertas_historico h ${JOIN_NOMBRES}
                    WHERE h.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-3 days') FROM alerta_parametros WHERE id = 1)
                      AND h.estado = 'RESUELTA' AND h.severidad_maxima <> 'BAJA'
                      AND h.fecha_resolucion >= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-1 day') FROM alerta_parametros WHERE id = 1)
                    ORDER BY h.fecha_resolucion DESC`),
    env.DB.prepare('SELECT id, nombre, responsable_id FROM equipos WHERE activo = 1 ORDER BY nombre'),
    env.DB.prepare(`SELECT m.equipo_id, u.id, u.nombre FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1
                    JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 ORDER BY u.nombre`),
    env.DB.prepare('SELECT strftime(\'%Y-%m-%dT%H:%M:%SZ\', COALESCE(ahora, \'now\')) AS ahora, ahora AS simulado FROM alerta_parametros WHERE id = 1'),
    env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
    env.DB.prepare(Q_UMBRALES_TABLERO),
  ]);
  return {
    ok: true, abiertas: r[0].results, eventos: r[1].results, resueltas: r[2].results, equipos: r[3].results, miembros: r[4].results,
    ahora: (r[5].results[0] || {}).ahora, reloj_simulado: !!(r[5].results[0] || {}).simulado, reglas_personalizadas: r[6].results, umbrales: r[7].results,
  };
}

// Personas y equipos a los que se puede derivar
async function asignables(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT id, nombre, perfil FROM usuarios WHERE activo = 1 AND ${SQL_PERFILES_RECIBEN} ORDER BY nombre`),
    env.DB.prepare('SELECT id, nombre, responsable_id FROM equipos WHERE activo = 1 ORDER BY nombre'),
    env.DB.prepare('SELECT m.equipo_id, m.usuario_id FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1 JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1'),
  ]);
  return { ok: true, usuarios: r[0].results, equipos: r[1].results, miembros: r[2].results };
}

async function historialAlerta(env, alertaId) {
  const r = await env.DB.prepare(`
    SELECT e.id, e.fecha, e.accion, e.comentario, u.nombre AS usuario_nombre, ud.nombre AS destino_nombre, ed.nombre AS equipo_destino_nombre
    FROM alerta_eventos e
    LEFT JOIN usuarios u ON u.id = e.usuario_id LEFT JOIN usuarios ud ON ud.id = e.usuario_destino_id LEFT JOIN equipos ed ON ed.id = e.equipo_destino_id
    WHERE e.alerta_id IN (
      SELECT alerta_id FROM alertas_historico
      WHERE ${SERIE_GRUPO} = (SELECT tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos FROM alertas_historico WHERE alerta_id = ?1)
        AND COALESCE(fecha_resolucion, '') = (SELECT COALESCE(fecha_resolucion, '') FROM alertas_historico WHERE alerta_id = ?1))
    ORDER BY e.fecha, e.id`).bind(alertaId).all();
  return { ok: true, eventos: r.results };
}

// Acción sobre una alerta: derivar, tomar, comentar, devolver o resolver
async function accionAsignacion(env, request, yo, alertaId, accion) {
  const b = await leerCuerpo(request);
  const comentario = opcional(b.comentario, 1000);
  const a = await env.DB.prepare('SELECT alerta_id, estado, severidad, asignado_usuario_id, asignado_equipo_id, asignado_por, reconocida_por, tipo_alerta, cliente_id FROM alertas_historico WHERE alerta_id = ?1').bind(alertaId).first();
  if (!a) return jsonError('La alerta no existe.', 404);
  if (a.estado === 'RESUELTA') return jsonError('La alerta ya está resuelta. Actualizá la página.', 409);
  const eq = await misEquipos(env, yo.id);
  const esMia = a.asignado_usuario_id === yo.id;
  const deMiEquipo = a.asignado_equipo_id != null && eq.miembro.includes(a.asignado_equipo_id);
  const loLidero = a.asignado_equipo_id != null && eq.lidero.includes(a.asignado_equipo_id);
  const analista = esAnalista(yo);
  const prohibido = (msg) => jsonError(msg || 'No podés hacer esto con esta alerta.', 403);
  const evento = (accionEv, uDest, eDest, txt) => env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, usuario_destino_id, equipo_destino_id, comentario)
      VALUES (${AHORA_SIM}, ?1, ?2, ?3, ?4, ?5, ?6)`).bind(alertaId, yo.id, accionEv, uDest == null ? null : uDest, eDest == null ? null : eDest, txt == null ? null : txt);
  const auditoria = (acc, det) => env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, acc, det);
  const desc = a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + ')';
  // Avisos de la campanita para otras personas (nunca para quien hace la acción)
  const avisar = (ids, tipo, texto, detalle) => avisoStmts(env, ids.filter((x) => x != null && x !== yo.id), tipo, alertaId, texto, detalle);

  if (accion === 'derivar') {
    let usuario = b.usuario_id == null || b.usuario_id === '' ? null : aId(b.usuario_id);
    let equipo = b.equipo_id == null || b.equipo_id === '' ? null : aId(b.equipo_id);
    if (!usuario && !equipo) return jsonError('Elegí a quién derivarla: una persona, un equipo o los dos.', 400);
    if (!analista) {
      // Responsable de equipo: solo dentro de su equipo
      if (!loLidero) return prohibido('Solo un analista, un administrador o el responsable del equipo pueden derivar esta alerta.');
      equipo = a.asignado_equipo_id;
    }
    if (equipo && !(await env.DB.prepare('SELECT 1 FROM equipos WHERE id = ?1 AND activo = 1').bind(equipo).first())) return jsonError('El equipo no existe o está inactivo.', 400);
    if (usuario) {
      const u = await env.DB.prepare('SELECT perfil FROM usuarios WHERE id = ?1 AND activo = 1').bind(usuario).first();
      if (!u || !PERFILES_RECIBEN.includes(u.perfil)) return jsonError('Esa persona no puede recibir alertas: solo Soporte o Administrador.', 400);
      if (equipo && !(await env.DB.prepare('SELECT 1 FROM equipo_miembros WHERE equipo_id = ?1 AND usuario_id = ?2').bind(equipo, usuario).first())) {
        return jsonError('Esa persona no es parte del equipo elegido.', 400);
      }
    }
    const eqNombre = equipo ? (await env.DB.prepare('SELECT nombre FROM equipos WHERE id = ?1').bind(equipo).first()).nombre : null;
    const avisos = usuario
      ? avisar([usuario], 'ASIGNADA', yo.nombre + ' te asignó una alerta' + (eqNombre ? ' (equipo ' + eqNombre + ')' : ''), comentario)
      : avisar(await miembrosActivos(env, equipo), 'ASIGNADA', yo.nombre + ' asignó una alerta a tu equipo ' + eqNombre, comentario);
    await env.DB.batch([
      env.DB.prepare(`UPDATE alertas_historico SET asignado_usuario_id = ?2, asignado_equipo_id = ?3, asignado_por = ?4, asignado_en = ${AHORA_SIM},
                        estado = 'ABIERTA', reconocida_por = NULL, fecha_reconocimiento = NULL WHERE ${GRUPO_ABIERTO}`).bind(alertaId, usuario, equipo, yo.id),
      evento('DERIVAR', usuario, equipo, comentario),
      auditoria('DERIVAR_ALERTA', desc),
    ].concat(avisos));
    return okJson({});
  }
  if (accion === 'tomar') {
    if (a.estado === 'RECONOCIDA') return jsonError((a.asignado_usuario_id === yo.id ? 'Ya la tenés tomada vos.' : 'Ya la tomó ' + (a.reconocida_por || 'otra persona') + '.') + ' Actualizá la página.', 409);
    if (!PERFILES_RECIBEN.includes(yo.perfil)) return prohibido('Los analistas derivan las alertas: para que alguien la trabaje, derivala a una persona o equipo de soporte.');
    const puedeTomar = yo.perfil === 'ADMIN' || esMia || (a.asignado_usuario_id == null && deMiEquipo);
    if (!puedeTomar) return prohibido('Solo podés tomar alertas asignadas a vos o a tu equipo.');
    // Solo si nadie la tomó entretanto (la condición va en el mismo UPDATE)
    const r = await env.DB.prepare(`UPDATE alertas_historico SET estado = 'RECONOCIDA', asignado_usuario_id = ?2, reconocida_por = ?3, fecha_reconocimiento = ${AHORA_SIM},
                        asignado_en = COALESCE(asignado_en, ${AHORA_SIM}), asignado_por = COALESCE(asignado_por, ?2)
                      WHERE ${GRUPO_ABIERTO} AND estado = 'ABIERTA' AND (asignado_usuario_id IS NULL OR asignado_usuario_id = ?2)`).bind(alertaId, yo.id, yo.nombre).run();
    if (!r.meta.changes) return jsonError('Alguien la tomó recién. Actualizá la página.', 409);
    await env.DB.batch([evento('TOMAR', null, null, comentario), auditoria('TOMAR_ALERTA', desc)]);
    return okJson({});
  }
  if (accion === 'comentar') {
    if (!(analista || esMia || deMiEquipo || loLidero)) return prohibido();
    if (!comentario) return jsonError('Escribí el comentario.', 400);
    const quienes = a.asignado_usuario_id != null ? [a.asignado_usuario_id] : a.asignado_equipo_id != null ? await miembrosActivos(env, a.asignado_equipo_id) : [];
    if (a.asignado_por != null && !quienes.includes(a.asignado_por)) quienes.push(a.asignado_por);
    await env.DB.batch([evento('COMENTAR', null, null, comentario), auditoria('COMENTAR_ALERTA', desc)]
      .concat(avisar(quienes, 'COMENTARIO', yo.nombre + ' comentó una alerta', comentario)));
    return okJson({});
  }
  if (accion === 'devolver') {
    if (!(esMia || (a.asignado_usuario_id == null && deMiEquipo))) return prohibido('Solo puede devolverla quien la tiene asignada.');
    if (!comentario || comentario.length < 3) return jsonError('Contá por qué la devolvés: el analista lo va a leer para volver a derivarla.', 400);
    await env.DB.batch([
      env.DB.prepare(`UPDATE alertas_historico SET asignado_usuario_id = NULL, asignado_equipo_id = NULL, asignado_por = NULL, asignado_en = NULL,
                        estado = 'ABIERTA', reconocida_por = NULL, fecha_reconocimiento = NULL WHERE ${GRUPO_ABIERTO}`).bind(alertaId),
      evento('DEVOLVER', null, null, comentario),
      auditoria('DEVOLVER_ALERTA', desc),
    ].concat(avisar(a.asignado_por != null ? [a.asignado_por] : await analistasActivos(env), 'DEVUELTA', yo.nombre + ' devolvió una alerta', comentario)));
    return okJson({});
  }
  if (accion === 'resolver') {
    if (!(analista || esMia)) return prohibido(yo.perfil === 'SOPORTE' ? 'Para resolverla primero tiene que estar asignada a vos.' : null);
    if (!comentario || comentario.length < 3) return jsonError('Contá qué se hizo para resolverla.', 400);
    await env.DB.batch([
      env.DB.prepare(`UPDATE alertas_historico SET estado = 'RESUELTA', motivo_resolucion = 'MANUAL', fecha_resolucion = ${AHORA_SIM}, resuelta_por = ?2, comentario = ?3,
                        asignado_usuario_id = COALESCE(asignado_usuario_id, ?4)
                      WHERE ${GRUPO_ABIERTO}`).bind(alertaId, yo.nombre, comentario, yo.id),
      evento('RESOLVER', null, null, comentario),
      auditoria('RESOLVER_ALERTA', desc),
    ].concat(avisar([a.asignado_usuario_id, a.asignado_por], 'RESUELTA', yo.nombre + ' resolvió una alerta', comentario)));
    return okJson({});
  }
  return jsonError('Acción desconocida.', 400);
}

// Rutas de asignación. Devuelve una respuesta o null si la ruta no es de acá.
async function rutasAsignacion(env, request, ruta, yo) {
  const m = request.method;
  if (ruta === '/mis-alertas') {
    if (m !== 'GET') return null;
    if (!puede(yo, 'mis_alertas')) return Response.redirect(new URL('/', request.url).toString(), 302);
    return new Response(MIS_ALERTAS_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (ruta === '/api/mis-alertas' && m === 'GET') {
    if (!puede(yo, 'mis_alertas')) return jsonError('Tu perfil no tiene alertas asignadas.', 403);
    return Response.json(await datosMisAlertas(env, yo), { headers: { 'cache-control': 'no-store' } });
  }
  if (ruta === '/seguimiento') {
    if (m !== 'GET') return null;
    if (!puede(yo, 'seguimiento')) return Response.redirect(new URL('/', request.url).toString(), 302);
    return new Response(SEGUIMIENTO_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (ruta === '/api/seguimiento' && m === 'GET') {
    if (!puede(yo, 'seguimiento')) return jsonError('Tu perfil no tiene acceso al seguimiento.', 403);
    return Response.json(await datosSeguimiento(env), { headers: { 'cache-control': 'no-store' } });
  }
  if (ruta === '/api/asignables' && m === 'GET') {
    if (!puede(yo, 'mis_alertas') && !puede(yo, 'derivar')) return jsonError('Tu perfil no puede derivar alertas.', 403);
    return Response.json(await asignables(env), { headers: { 'cache-control': 'no-store' } });
  }
  const x = ruta.match(/^\/api\/alertas\/([0-9a-f]{32})\/(derivar|tomar|comentar|devolver|resolver|reconocer|historial)$/);
  if (!x) return null;
  if (x[2] === 'historial') {
    if (m !== 'GET') return null;
    return Response.json(await historialAlerta(env, x[1]), { headers: { 'cache-control': 'no-store' } });
  }
  if (m !== 'POST') return null;
  if (yo.perfil === 'GERENTE') return jsonError('Tu perfil es de solo lectura.', 403);
  return await accionAsignacion(env, request, yo, x[1], x[2] === 'reconocer' ? 'tomar' : x[2]);
}
