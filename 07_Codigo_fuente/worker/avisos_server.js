// =====================================================================
// DERIVACIÓN AUTOMÁTICA Y CAMPANITA (etapa 4)
//
// Reglas de derivación (tabla reglas_derivacion): "cuándo" (cliente, servicio,
// canal, tipo de alerta, severidad mínima; vacío = cualquiera) y "a quién"
// (equipo, persona o los dos). Después de cada revisión de alertas se aplican a
// las alertas SIN ASIGNAR; si coinciden varias gana la de menor número de
// prioridad. Nunca pisan una derivación a mano y no tocan las alertas devueltas
// (esas quedan para el analista).
//
// Avisos (tabla avisos): un registro por persona. La página consulta solo el
// contador cada 2 minutos (con la pestaña visible) y la lista al abrir la campanita.
// PENDIENTE AL MIGRAR: borrar avisos viejos (por ejemplo, leídos de más de 30 días).
// =====================================================================

const AVISO_SQL = `INSERT INTO avisos (usuario_id, fecha, tipo, alerta_id, texto, detalle)
  VALUES (?1, (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1), ?2, ?3, ?4, ?5)`;
function avisoStmts(env, ids, tipo, alertaId, texto, detalle) {
  return Array.from(new Set(ids.filter((x) => x != null))).map((uid) =>
    env.DB.prepare(AVISO_SQL).bind(uid, tipo, alertaId, String(texto).slice(0, 300), detalle == null ? null : String(detalle).slice(0, 500)));
}
async function miembrosActivos(env, equipoId) {
  if (equipoId == null) return [];
  const r = await env.DB.prepare('SELECT u.id FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 WHERE m.equipo_id = ?1').bind(equipoId).all();
  return r.results.map((x) => x.id);
}
async function analistasActivos(env) {
  const r = await env.DB.prepare("SELECT id FROM usuarios WHERE activo = 1 AND perfil IN ('ADMIN', 'ANALISTA')").all();
  return r.results.map((x) => x.id);
}

// Alertas abiertas con persona asignada, antes de la revisión (para avisar si se cierran solas).
// "rep" es la primera ventana del problema: no cambia mientras siga abierto.
const Q_ASIGNADAS_ABIERTAS = `
SELECT alerta_id AS rep, MIN(ventana_inicio) AS desde, asignado_usuario_id
FROM alertas_historico
WHERE estado IN ('ABIERTA', 'RECONOCIDA') AND asignado_usuario_id IS NOT NULL
GROUP BY tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos`;

// Problemas abiertos sin asignar, con la regla de derivación que les corresponde (si hay)
const Q_SIN_ASIGNAR = `
WITH g AS (
    SELECT tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos,
           MIN(ventana_inicio) AS desde,
           MIN(CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END) AS sev_n,
           MAX(EXISTS (SELECT 1 FROM alerta_eventos e WHERE e.alerta_id = h.alerta_id AND e.accion = 'DEVOLVER')) AS devuelta
    FROM alertas_historico h
    WHERE estado = 'ABIERTA' AND asignado_usuario_id IS NULL AND asignado_equipo_id IS NULL
    GROUP BY tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos
),
g2 AS (
    SELECT g.*,
           (SELECT x.alerta_id FROM alertas_historico x
             WHERE (x.tipo_alerta, x.ambiente, x.cliente_id, x.servicio_id, x.producto_id, x.canal_id, x.moneda_id, x.duracion_ventana_minutos)
                 = (g.tipo_alerta, g.ambiente, g.cliente_id, g.servicio_id, g.producto_id, g.canal_id, g.moneda_id, g.duracion_ventana_minutos)
               AND x.ventana_inicio = g.desde) AS rep
    FROM g
)
SELECT g.rep, g.sev_n, g.devuelta,
       (SELECT r.id FROM reglas_derivacion r
         WHERE r.activa = 1
           AND (r.cliente_id  IS NULL OR r.cliente_id  = g.cliente_id)
           AND (r.servicio_id IS NULL OR r.servicio_id = g.servicio_id)
           AND (r.canal_id    IS NULL OR r.canal_id    = g.canal_id)
           AND (r.tipo_alerta IS NULL OR r.tipo_alerta = g.tipo_alerta)
           AND (r.severidad_minima IS NULL OR g.sev_n <= CASE r.severidad_minima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END)
           AND (r.usuario_id IS NULL OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = r.usuario_id AND u.activo = 1 AND u.${SQL_PERFILES_RECIBEN}))
           AND (r.equipo_id  IS NULL OR EXISTS (SELECT 1 FROM equipos q WHERE q.id = r.equipo_id AND q.activo = 1))
         ORDER BY r.prioridad, r.id LIMIT 1) AS regla_id,
       EXISTS (SELECT 1 FROM avisos a WHERE a.alerta_id = g.rep AND a.tipo = 'GRAVE_SIN_ASIGNAR') AS ya_avisada
FROM g2 g
WHERE g.sev_n < 4`;

async function asignadasAbiertas(env) {
  return (await env.DB.prepare(Q_ASIGNADAS_ABIERTAS).all()).results;
}

// Después de cada revisión: derivación automática y avisos de lo que cambió solo
async function derivarYAvisar(env, antes) {
  const pasos = [];
  let derivadas = 0;
  const cand = (await env.DB.prepare(Q_SIN_ASIGNAR).all()).results;
  const ids = Array.from(new Set(cand.map((c) => c.regla_id).filter((x) => x != null)));
  const reglas = {};
  if (ids.length) {
    const r = await env.DB.prepare(`SELECT r.id, r.nombre, r.equipo_id, r.usuario_id, e.nombre AS equipo_nombre
                                    FROM reglas_derivacion r LEFT JOIN equipos e ON e.id = r.equipo_id WHERE r.id IN (${ids.join(',')})`).all();
    for (const x of r.results) reglas[x.id] = x;
  }
  let analistas = null;
  for (const c of cand) {
    const regla = c.regla_id != null && !c.devuelta ? reglas[c.regla_id] : null;
    if (regla) {
      derivadas++;
      const txt = 'Derivada automáticamente por la regla «' + regla.nombre + '»';
      pasos.push(env.DB.prepare(`UPDATE alertas_historico SET asignado_usuario_id = ?2, asignado_equipo_id = ?3, asignado_por = NULL, asignado_en = ${AHORA_SIM}
                                 WHERE ${GRUPO_ABIERTO} AND asignado_usuario_id IS NULL AND asignado_equipo_id IS NULL`).bind(c.rep, regla.usuario_id, regla.equipo_id));
      pasos.push(env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, usuario_destino_id, equipo_destino_id, comentario)
                                 VALUES (${AHORA_SIM}, ?1, NULL, 'DERIVAR', ?2, ?3, ?4)`).bind(c.rep, regla.usuario_id, regla.equipo_id, txt));
      const quienes = regla.usuario_id != null ? [regla.usuario_id] : await miembrosActivos(env, regla.equipo_id);
      pasos.push(...avisoStmts(env, quienes, 'ASIGNADA', c.rep,
        regla.usuario_id != null ? 'Se te asignó una alerta (regla «' + regla.nombre + '»)' : 'Se asignó una alerta a tu equipo ' + regla.equipo_nombre + ' (regla «' + regla.nombre + '»)', null));
    } else if (c.sev_n === 1 && !c.ya_avisada && !c.devuelta) {
      // Grave y sin dueño: aviso a analistas y administradores (una sola vez por problema)
      if (!analistas) analistas = await analistasActivos(env);
      pasos.push(...avisoStmts(env, analistas, 'GRAVE_SIN_ASIGNAR', c.rep, 'Hay una alerta grave sin asignar', null));
    }
  }
  // Alertas con dueño que se cerraron solas en esta revisión
  let cerradas = 0;
  if (antes && antes.length) {
    const r = await env.DB.prepare(`SELECT alerta_id, motivo_resolucion FROM alertas_historico
                                    WHERE estado = 'RESUELTA' AND resuelta_por = 'SISTEMA' AND alerta_id IN (${antes.map((_, i) => '?' + (i + 1)).join(',')})`)
      .bind(...antes.map((x) => x.rep)).all();
    const motivo = {};
    for (const x of r.results) motivo[x.alerta_id] = x.motivo_resolucion;
    for (const x of antes) {
      if (!motivo[x.rep]) continue;
      cerradas++;
      pasos.push(...avisoStmts(env, [x.asignado_usuario_id], 'RESUELTA', x.rep,
        motivo[x.rep] === 'NORMALIZADA' ? 'Una alerta tuya se normalizó sola' : 'Una alerta tuya dejó de detectarse y se cerró', null));
    }
  }
  if (pasos.length) await env.DB.batch(pasos);
  return { derivadas_automaticamente: derivadas, avisos_de_cierre: cerradas };
}

// ---------- Rutas de la campanita ----------
async function rutasAvisos(env, request, ruta, yo) {
  if (!ruta.startsWith('/api/avisos')) return null;
  const m = request.method;
  const habilitado = yo.perfil !== 'GERENTE';
  if (m === 'GET' && ruta === '/api/avisos/contador') {
    if (!habilitado) return okJson({ habilitado: false, no_leidos: 0 });
    const r = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(id) AS ultimo FROM avisos WHERE usuario_id = ?1 AND leido = 0').bind(yo.id).first();
    // A dónde llevan los avisos de asignación: la bandeja de quien trabaja alertas o el seguimiento del analista
    return okJson({ habilitado: true, no_leidos: r.n, ultimo_id: r.ultimo, bandeja: puede(yo, 'mis_alertas') ? '/mis-alertas' : '/seguimiento' });
  }
  if (m === 'GET' && ruta === '/api/avisos') {
    const r = await env.DB.prepare(`
      SELECT a.id, a.fecha, a.tipo, a.alerta_id, a.texto, a.detalle, a.leido,
             h.tipo_alerta, h.cliente_id, h.servicio_id, h.canal_id, h.valor_observado, h.estado AS estado_alerta, rp.nombre AS regla_nombre,
             (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1) AS ahora
      FROM avisos a
      LEFT JOIN alertas_historico h ON h.alerta_id = a.alerta_id
      LEFT JOIN alerta_reglas_personalizadas rp ON 'PERS_' || rp.id = h.tipo_alerta
      WHERE a.usuario_id = ?1
      ORDER BY a.id DESC LIMIT 30`).bind(yo.id).all();
    return okJson({ avisos: r.results });
  }
  let x;
  if (m === 'POST' && (x = ruta.match(/^\/api\/avisos\/(\d+)\/leido$/))) {
    await env.DB.prepare('UPDATE avisos SET leido = 1 WHERE id = ?1 AND usuario_id = ?2').bind(Number(x[1]), yo.id).run();
    return okJson({});
  }
  if (m === 'POST' && ruta === '/api/avisos/leer-todos') {
    await env.DB.prepare('UPDATE avisos SET leido = 1 WHERE usuario_id = ?1 AND leido = 0').bind(yo.id).run();
    return okJson({});
  }
  return jsonError('Ruta no encontrada: ' + ruta, 404);
}

// ---------- Reglas de derivación (panel de administración) ----------
async function listarDerivacion(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT r.*, e.nombre AS equipo_nombre, e.activo AS equipo_activo, u.nombre AS usuario_nombre, u.activo AS usuario_activo, c.nombre AS creada_por_nombre
                    FROM reglas_derivacion r LEFT JOIN equipos e ON e.id = r.equipo_id LEFT JOIN usuarios u ON u.id = r.usuario_id LEFT JOIN usuarios c ON c.id = r.creada_por
                    ORDER BY r.prioridad, r.id`),
    env.DB.prepare(`SELECT DISTINCT cliente_id, servicio_id, canal_id FROM core_metricas_esperadas
                    WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')
                    ORDER BY cliente_id, servicio_id, canal_id`),
    env.DB.prepare('SELECT id, nombre FROM equipos WHERE activo = 1 ORDER BY nombre'),
    env.DB.prepare(`SELECT id, nombre, perfil FROM usuarios WHERE activo = 1 AND ${SQL_PERFILES_RECIBEN} ORDER BY nombre`),
    env.DB.prepare('SELECT m.equipo_id, m.usuario_id FROM equipo_miembros m'),
    env.DB.prepare('SELECT id, nombre, activa FROM alerta_reglas_personalizadas ORDER BY id'),
  ]);
  return okJson({ reglas: r[0].results, series: r[1].results, equipos: r[2].results, usuarios: r[3].results, miembros: r[4].results, personalizadas: r[5].results });
}

async function guardarDerivacion(env, request, yo, id) {
  const b = await leerCuerpo(request);
  const previo = id ? await env.DB.prepare('SELECT * FROM reglas_derivacion WHERE id = ?1').bind(id).first() : null;
  if (id && !previo) return jsonError('La regla no existe.', 404);
  const v = (k, max) => (b[k] === undefined && previo ? previo[k] : opcional(b[k], max));
  const n = (k) => (b[k] === undefined && previo ? previo[k] : (b[k] == null || b[k] === '' ? null : aId(b[k])));
  const nombre = v('nombre', 80), cliente = v('cliente_id', 40), servicio = v('servicio_id', 40), canal = v('canal_id', 40);
  const tipo = v('tipo_alerta', 40), sevMin = v('severidad_minima', 10);
  const equipo = n('equipo_id'), usuario = n('usuario_id');
  const activa = b.activa === undefined ? (previo ? previo.activa : 1) : (b.activa ? 1 : 0);
  if (!nombre || nombre.length < 3) return jsonError('Poné un nombre de al menos 3 caracteres.', 400);
  for (const t of [cliente, servicio, canal]) if (t && !/^[A-Za-z0-9_.-]{1,40}$/.test(t)) return jsonError('Condición inválida.', 400);
  if (tipo && !/^[A-Z0-9_]{2,40}$/.test(tipo)) return jsonError('Tipo de alerta inválido.', 400);
  if (sevMin && !['CRITICA', 'ALTA', 'MEDIA'].includes(sevMin)) return jsonError('Severidad inválida.', 400);
  if (!equipo && !usuario) return jsonError('Elegí a quién derivar: un equipo, una persona o los dos.', 400);
  if (equipo && !(await env.DB.prepare('SELECT 1 FROM equipos WHERE id = ?1 AND activo = 1').bind(equipo).first())) return jsonError('El equipo no existe o está inactivo.', 400);
  if (usuario) {
    const u = await env.DB.prepare('SELECT perfil FROM usuarios WHERE id = ?1 AND activo = 1').bind(usuario).first();
    if (!u || !PERFILES_RECIBEN.includes(u.perfil)) return jsonError('Esa persona no puede recibir alertas: solo Soporte o Administrador.', 400);
    if (equipo && !(await env.DB.prepare('SELECT 1 FROM equipo_miembros WHERE equipo_id = ?1 AND usuario_id = ?2').bind(equipo, usuario).first())) return jsonError('Esa persona no es parte del equipo elegido.', 400);
  }
  if (previo) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE reglas_derivacion SET nombre = ?1, cliente_id = ?2, servicio_id = ?3, canal_id = ?4, tipo_alerta = ?5, severidad_minima = ?6,
                      equipo_id = ?7, usuario_id = ?8, activa = ?9, actualizada = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10`)
        .bind(nombre, cliente, servicio, canal, tipo, sevMin, equipo, usuario, activa, id),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'EDITAR_DERIVACION', '#' + id + ' ' + nombre + (previo.activa !== activa ? (activa ? ' (activada)' : ' (desactivada)') : '')),
    ]);
    return okJson({ id });
  }
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO reglas_derivacion (nombre, prioridad, cliente_id, servicio_id, canal_id, tipo_alerta, severidad_minima, equipo_id, usuario_id, activa, creada_por)
                    VALUES (?1, (SELECT COALESCE(MAX(prioridad), 0) + 10 FROM reglas_derivacion), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(nombre, cliente, servicio, canal, tipo, sevMin, equipo, usuario, activa, yo.id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'ALTA_DERIVACION', nombre),
  ]);
  return okJson({});
}

// Subir o bajar una regla en la lista de prioridad (se renumera de 10 en 10)
async function moverDerivacion(env, request, yo, id) {
  const b = await leerCuerpo(request);
  const dir = Number(b.direccion) < 0 ? -1 : 1;
  const ids = (await env.DB.prepare('SELECT id FROM reglas_derivacion ORDER BY prioridad, id').all()).results.map((x) => x.id);
  const i = ids.indexOf(id);
  if (i < 0) return jsonError('La regla no existe.', 404);
  const j = i + dir;
  if (j < 0 || j >= ids.length) return okJson({});
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await env.DB.batch(ids.map((x, k) => env.DB.prepare('UPDATE reglas_derivacion SET prioridad = ?1 WHERE id = ?2').bind((k + 1) * 10, x))
    .concat([env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'MOVER_DERIVACION', '#' + id + (dir < 0 ? ' arriba' : ' abajo'))]));
  return okJson({});
}

async function rutasDerivacion(env, request, p, yo) {
  const m = request.method;
  let x;
  if (m === 'GET' && p === '/derivacion') return await listarDerivacion(env);
  if (m === 'POST' && p === '/derivacion') return await guardarDerivacion(env, request, yo, null);
  if (m === 'POST' && (x = p.match(/^\/derivacion\/(\d+)$/))) return await guardarDerivacion(env, request, yo, Number(x[1]));
  if (m === 'POST' && (x = p.match(/^\/derivacion\/(\d+)\/mover$/))) return await moverDerivacion(env, request, yo, Number(x[1]));
  return null;
}
