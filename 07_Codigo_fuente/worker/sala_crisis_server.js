// =====================================================================
// SALA DE CRISIS (parche 69, script 24): incidentes mayores que agrupan alertas, con tareas, línea de tiempo y guía de diagnóstico.
// Plan y decisiones: 05_Documentacion/plan_sala_crisis_etapa1.md
//
//   GET  /incidentes · /incidente/<id>                páginas
//   GET  /api/incidentes                             lista (abiertos y cerrados de los últimos 30 días) y contador
//   GET  /api/incidentes/candidatas                  alertas abiertas que se pueden sumar (Analista)
//   GET  /api/incidentes/<id>                        la sala: incidente, alertas, tareas, línea de tiempo, guía, opciones
//   POST /api/incidentes                             {alertas:[alerta_id], titulo?, descripcion?}         abrir (Analista)
//   POST /api/incidentes/<id>/alertas                {alertas:[alerta_id]}                                sumar (Analista)
//   POST /api/incidentes/<id>/tareas                 {titulo, detalle?, responsable_usuario_id?, equipo_id?, componente_id?, vence?, propuesta_por_asistente?}
//   POST /api/incidentes/<id>/tareas/<t>             {estado, resultado?}   Analista: cualquiera; Soporte: las suyas o de su equipo
//   POST /api/incidentes/<id>/notas                  {texto}                Analista o quien tiene una tarea en la sala
//   POST /api/incidentes/<id>/estado                 {estado, causa_raiz?, componente_causa_id?, resumen_cierre?}   (Analista)
//   POST /api/incidentes/<id>/escalar                {usuario_id?, equipo_id?, motivo}   tarea de escalamiento + aviso (Analista)
//
// Quién: el Analista abre y dirige; Soporte ve solo las salas donde tiene una tarea (suya o de su equipo) y actualiza esas
// tareas; Gerente y Administrador leen todas. Todo pasa por estas rutas: cada acción deja su renglón en
// incidente_linea_tiempo y en auditoria en el mismo batch. Avisos: tipo TAREA_INCIDENTE / INCIDENTE con alerta_id = 'i' + id
// (la campanita y el push llevan a /incidente/<id>). Sin el script 24 las rutas responden 503 con el aviso de qué falta.
// =====================================================================
const FALTA_SCRIPT_24 = 'Falta correr 24_sala_crisis_d1.txt en la consola de D1.';
const IM_ESTADOS = ['ABIERTO', 'MITIGADO', 'RESUELTO', 'CERRADO'];
const IM_ESTADO_TXT = { ABIERTO: 'Abierto', MITIGADO: 'Mitigado', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' };
const TAREA_ESTADOS = ['PENDIENTE', 'EN_CURSO', 'HECHA', 'CANCELADA'];
const TAREA_ESTADO_TXT = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', HECHA: 'Hecha', CANCELADA: 'Cancelada' };
const IM_MAX_ALERTAS = 20, IM_MAX_TAREAS = 60, IM_MAX_LINEA = 200;
const imCodigo = (id) => 'IM-' + id;
const textoLargo = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const lineaSQL = (env, inc, yo, tipo, txt, ref) => env.DB.prepare(`INSERT INTO incidente_linea_tiempo (incidente_id, fecha, usuario_id, tipo, texto, referencia) VALUES (?1, ${AHORA_SIM}, ?2, ?3, ?4, ?5)`)
  .bind(inc, yo ? yo.id : null, tipo, String(txt).slice(0, 1000), ref == null ? null : String(ref));
const auditoriaSQL = (env, yo, accion, detalle) => env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
  .bind(yo.id, accion, String(detalle).slice(0, 500));
const avisoIncidenteSQL = (env, uid, tipo, inc, texto, detalle) => env.DB.prepare(AVISO_SQL).bind(uid, tipo, 'i' + inc, String(texto).slice(0, 200), detalle == null ? null : String(detalle).slice(0, 300));
const fraseAlerta = (a) => (PUSH_FRASE[a.tipo_alerta] || a.tipo_alerta) + ' · ' + a.cliente_id + ', ' + (PUSH_SERVICIO[a.servicio_id] || a.servicio_id) + ' por ' + (PUSH_CANAL[a.canal_id] || a.canal_id);

// ---------- Quién ve y quién hace qué ----------
async function rolEnIncidente(env, yo, id, inc) {
  inc = inc || await env.DB.prepare('SELECT * FROM incidentes_mayores WHERE id = ?1').bind(id).first();
  if (!inc) return { error: jsonError('Ese incidente no existe.', 404) };
  const eq = await misEquipos(env, yo.id);
  const equipos = eq.miembro.concat(eq.lidero);
  const mias = (await env.DB.prepare(`SELECT id FROM incidente_tareas WHERE incidente_id = ?1 AND (responsable_usuario_id = ?2
      OR (responsable_usuario_id IS NULL AND equipo_id IN (SELECT value FROM json_each(?3))))`).bind(id, yo.id, JSON.stringify(equipos)).all()).results.map((x) => x.id);
  const dirige = puede(yo, 'sala_crisis_dirigir');
  const lectura = yo.perfil === 'GERENTE' || yo.perfil === 'ADMIN';
  if (!dirige && !lectura && !mias.length) return { error: jsonError('Esa sala de crisis no tiene tareas para tu usuario ni para tu equipo.', 403) };
  return { inc, dirige, lectura, mias, equipos, abierto: inc.estado !== 'CERRADO' };
}

// ---------- Lista ----------
async function listarIncidentes(env, yo) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT i.id, i.titulo, i.estado, i.severidad, i.cliente_id, i.servicio_id, i.inicio, i.abierto, i.mitigado, i.resuelto, i.cerrado, i.origen,
        u.nombre AS responsable, (SELECT COUNT(*) FROM incidente_alertas a WHERE a.incidente_id = i.id) AS alertas,
        (SELECT COUNT(*) FROM incidente_tareas t WHERE t.incidente_id = i.id AND t.estado IN ('PENDIENTE', 'EN_CURSO')) AS tareas_pendientes
      FROM incidentes_mayores i LEFT JOIN usuarios u ON u.id = i.responsable_usuario_id
      WHERE i.estado <> 'CERRADO' OR i.cerrado >= strftime('%Y-%m-%dT%H:%M:%SZ', ${AHORA_SIM}, '-30 days')
      ORDER BY CASE WHEN i.estado = 'CERRADO' THEN 1 ELSE 0 END, i.abierto DESC LIMIT 60`),
    env.DB.prepare(`SELECT DISTINCT t.incidente_id AS id FROM incidente_tareas t WHERE t.responsable_usuario_id = ?1
      OR (t.responsable_usuario_id IS NULL AND t.equipo_id IN (SELECT m.equipo_id FROM equipo_miembros m WHERE m.usuario_id = ?1))`).bind(yo.id),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM incidente_tareas t WHERE t.estado IN ('PENDIENTE', 'EN_CURSO') AND (t.responsable_usuario_id = ?1
      OR (t.responsable_usuario_id IS NULL AND t.equipo_id IN (SELECT m.equipo_id FROM equipo_miembros m WHERE m.usuario_id = ?1)))`).bind(yo.id),
  ]);
  const conTarea = new Set(r[1].results.map((x) => x.id));
  const todos = puede(yo, 'sala_crisis_dirigir') || yo.perfil === 'GERENTE' || yo.perfil === 'ADMIN';
  const incidentes = r[0].results.filter((i) => todos || conTarea.has(i.id));
  return okJson({ incidentes, abiertos: incidentes.filter((i) => i.estado !== 'CERRADO').length, mis_tareas_pendientes: r[2].results[0].n,
    puede_abrir: puede(yo, 'sala_crisis_dirigir') });
}
async function contadorIncidentes(env, yo) {
  const todos = puede(yo, 'sala_crisis_dirigir') || yo.perfil === 'GERENTE' || yo.perfil === 'ADMIN';
  const q = todos ? env.DB.prepare("SELECT COUNT(*) AS n FROM incidentes_mayores WHERE estado <> 'CERRADO'")
    : env.DB.prepare(`SELECT COUNT(*) AS n FROM incidente_tareas t JOIN incidentes_mayores i ON i.id = t.incidente_id AND i.estado <> 'CERRADO'
        WHERE t.estado IN ('PENDIENTE', 'EN_CURSO') AND (t.responsable_usuario_id = ?1
          OR (t.responsable_usuario_id IS NULL AND t.equipo_id IN (SELECT m.equipo_id FROM equipo_miembros m WHERE m.usuario_id = ?1)))`).bind(yo.id);
  return okJson({ n: (await q.first()).n, que: todos ? 'abiertos' : 'mis_tareas' });
}

// ---------- Guía de diagnóstico: componentes del servicio, de qué dependen, qué revisar y antecedentes ----------
async function guiaDiagnostico(env, inc) {
  if (!inc.servicio_id) return { componentes: [], antecedentes: [], causas_alertas: [] };
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT d1.depende_de_componente_id AS id, c1.nombre, c1.tipo, c1.descripcion, c1.area_responsable, c1.que_revisar, c1.equipo_id,
        d2.depende_de_componente_id AS sub_id, c2.nombre AS sub_nombre, c2.tipo AS sub_tipo, c2.area_responsable AS sub_area, c2.que_revisar AS sub_que_revisar
      FROM componente_dependencias d1 JOIN componentes_infraestructura c1 ON c1.id = d1.depende_de_componente_id AND c1.activo = 1
      LEFT JOIN componente_dependencias d2 ON d2.componente_id = d1.depende_de_componente_id AND d2.servicio_id IS NULL AND (d2.cliente_id IS NULL OR d2.cliente_id = ?2)
      LEFT JOIN componentes_infraestructura c2 ON c2.id = d2.depende_de_componente_id AND c2.activo = 1
      WHERE d1.servicio_id = ?1 AND (d1.cliente_id IS NULL OR d1.cliente_id = ?2) ORDER BY d1.id, d2.id LIMIT 60`).bind(inc.servicio_id, inc.cliente_id),
    env.DB.prepare(`SELECT ia.alerta_id FROM incidente_alertas ia WHERE ia.incidente_id = ?1 LIMIT 1`).bind(inc.id),
  ]);
  const comps = new Map();
  for (const x of r[0].results) {
    if (!comps.has(x.id)) comps.set(x.id, { id: x.id, nombre: x.nombre, tipo: x.tipo, descripcion: x.descripcion, area: x.area_responsable, que_revisar: x.que_revisar, depende_de: [] });
    if (x.sub_id && x.sub_nombre) {
      comps.get(x.id).depende_de.push({ id: x.sub_id, nombre: x.sub_nombre, tipo: x.sub_tipo, area: x.sub_area, que_revisar: x.sub_que_revisar });
    }
  }
  const ids = new Set();
  for (const c of comps.values()) { ids.add(c.id); for (const d of c.depende_de) ids.add(d.id); }
  const listaIds = JSON.stringify([...ids]);
  const r2 = await env.DB.batch([
    env.DB.prepare(`SELECT i.id, i.titulo, i.cliente_id, i.servicio_id, i.inicio, i.mitigado, i.cerrado, i.causa_raiz, i.resumen_cierre, c.nombre AS componente
      FROM incidentes_mayores i LEFT JOIN componentes_infraestructura c ON c.id = i.componente_causa_id
      WHERE i.estado = 'CERRADO' AND i.id <> ?1 AND (i.servicio_id = ?2 OR i.componente_causa_id IN (SELECT value FROM json_each(?3)))
      ORDER BY CASE WHEN i.cliente_id = ?4 THEN 0 ELSE 1 END, CASE WHEN i.servicio_id = ?2 THEN 0 ELSE 1 END, i.cerrado DESC LIMIT 3`)
      .bind(inc.id, inc.servicio_id, listaIds, inc.cliente_id),
    env.DB.prepare(`SELECT causa_resolucion AS causa, COUNT(DISTINCT tipo_alerta || canal_id) AS veces, MAX(fecha_resolucion) AS ultima
      FROM alertas_historico WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%SZ', ${AHORA_SIM}, '-30 days') AND servicio_id = ?1 AND causa_resolucion IS NOT NULL
      GROUP BY causa_resolucion ORDER BY veces DESC, ultima DESC LIMIT 3`).bind(inc.servicio_id),
  ]);
  return { componentes: [...comps.values()], antecedentes: r2[0].results, causas_alertas: r2[1].results };
}

// ---------- La sala ----------
async function verIncidente(env, yo, id) {
  const rol = await rolEnIncidente(env, yo, id);
  if (rol.error) return rol.error;
  const inc = rol.inc;
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT ia.alerta_id, ia.tipo_alerta, ia.cliente_id, ia.servicio_id, ia.canal_id, ia.sumada, h.estado, h.severidad_maxima,
        h.asignado_usuario_id, ua.nombre AS asignado_a, e.nombre AS asignado_equipo
      FROM incidente_alertas ia LEFT JOIN alertas_historico h ON h.alerta_id = ia.alerta_id
      LEFT JOIN usuarios ua ON ua.id = h.asignado_usuario_id LEFT JOIN equipos e ON e.id = h.asignado_equipo_id
      WHERE ia.incidente_id = ?1 ORDER BY ia.sumada LIMIT ${IM_MAX_ALERTAS}`).bind(id),
    env.DB.prepare(`SELECT t.id, t.titulo, t.detalle, t.responsable_usuario_id, u.nombre AS responsable, t.equipo_id, e.nombre AS equipo, t.componente_id, c.nombre AS componente,
        t.estado, t.resultado, t.creada, t.vence, t.actualizada, t.terminada, t.propuesta_por_asistente, uc.nombre AS creada_por
      FROM incidente_tareas t LEFT JOIN usuarios u ON u.id = t.responsable_usuario_id LEFT JOIN equipos e ON e.id = t.equipo_id
      LEFT JOIN componentes_infraestructura c ON c.id = t.componente_id LEFT JOIN usuarios uc ON uc.id = t.creada_por
      WHERE t.incidente_id = ?1 ORDER BY CASE t.estado WHEN 'EN_CURSO' THEN 0 WHEN 'PENDIENTE' THEN 1 WHEN 'HECHA' THEN 2 ELSE 3 END, t.id LIMIT ${IM_MAX_TAREAS}`).bind(id),
    env.DB.prepare(`SELECT l.id, l.fecha, l.tipo, l.texto, l.referencia, u.nombre AS usuario FROM incidente_linea_tiempo l LEFT JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.incidente_id = ?1 ORDER BY l.fecha DESC, l.id DESC LIMIT ${IM_MAX_LINEA}`).bind(id),
    env.DB.prepare('SELECT nombre FROM usuarios WHERE id = ?1').bind(inc.responsable_usuario_id || 0),
    env.DB.prepare('SELECT id, nombre FROM componentes_infraestructura WHERE activo = 1 ORDER BY nombre'),
    env.DB.prepare('SELECT ' + AHORA_SIM + ' AS ahora'),
  ]);
  let opciones = null;
  if (rol.dirige && rol.abierto) {
    const o = await env.DB.batch([
      env.DB.prepare("SELECT id, nombre, perfil FROM usuarios WHERE activo = 1 AND perfil IN ('SOPORTE', 'ANALISTA') ORDER BY CASE perfil WHEN 'SOPORTE' THEN 0 ELSE 1 END, nombre COLLATE NOCASE"),
      env.DB.prepare('SELECT id, nombre FROM equipos WHERE activo = 1 ORDER BY nombre COLLATE NOCASE'),
    ]);
    opciones = { personas: o[0].results, equipos: o[1].results };
  }
  const tareas = r[1].results.map((t) => Object.assign(t, { mia: rol.mias.includes(t.id) }));
  return okJson({
    incidente: Object.assign({}, inc, { codigo: imCodigo(inc.id), responsable: (r[3].results[0] || {}).nombre || null }),
    alertas: r[0].results, tareas, linea: r[2].results, guia: await guiaDiagnostico(env, inc), componentes: r[4].results, opciones,
    ahora: (r[5].results[0] || {}).ahora || null,
    puedo: { dirigir: rol.dirige && rol.abierto, notas: rol.abierto && !rol.lectura && (rol.dirige || rol.mias.length > 0), lectura: rol.lectura },
  });
}

// ---------- Alertas: validar un grupo para sumarlo ----------
async function alertasParaIncidente(env, ids, incidenteId) {
  const out = [];
  for (const aid of ids) {
    const a = await env.DB.prepare(`SELECT alerta_id, tipo_alerta, cliente_id, servicio_id, canal_id, estado, severidad_maxima,
        (SELECT MIN(ventana_inicio) FROM alertas_historico WHERE alerta_id IN (${GRUPO_IDS})) AS desde
      FROM alertas_historico WHERE alerta_id = ?1`).bind(aid).first();
    if (!a) return { error: jsonError('Una de las alertas elegidas no existe.', 404) };
    if (a.estado === 'RESUELTA') return { error: jsonError('La alerta «' + fraseAlerta(a) + '» ya está resuelta: solo se suman alertas abiertas.', 409) };
    if (a.severidad_maxima === 'BAJA') return { error: jsonError('Los avisos informativos no se suman a una sala de crisis.', 400) };
    const otro = await env.DB.prepare(`SELECT ia.incidente_id FROM incidente_alertas ia JOIN incidentes_mayores im ON im.id = ia.incidente_id AND im.estado <> 'CERRADO'
      WHERE ia.alerta_id IN (${GRUPO_IDS}) LIMIT 1`).bind(aid).first();
    if (otro) return { error: jsonError(otro.incidente_id === incidenteId ? 'La alerta «' + fraseAlerta(a) + '» ya está en esta sala.'
      : 'La alerta «' + fraseAlerta(a) + '» ya está en la sala ' + imCodigo(otro.incidente_id) + '.', 409) };
    out.push(a);
  }
  return { alertas: out };
}
const idsAlertas = (v) => Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x || '')).filter((x) => /^[0-9a-f]{32}$/.test(x))));

async function abrirIncidente(env, request, yo) {
  const b = await leerCuerpo(request);
  const ids = idsAlertas(b.alertas);
  if (!ids.length) return jsonError('Elegí al menos una alerta abierta para abrir la sala de crisis.', 400);
  if (ids.length > IM_MAX_ALERTAS) return jsonError('Una sala de crisis agrupa hasta ' + IM_MAX_ALERTAS + ' alertas.', 400);
  const v = await alertasParaIncidente(env, ids, null);
  if (v.error) return v.error;
  const als = v.alertas, p = als[0];
  const severidad = als.some((a) => a.severidad_maxima === 'CRITICA') ? 'CRITICA' : 'ALTA';
  const clientes = new Set(als.map((a) => a.cliente_id)), servicios = new Set(als.map((a) => a.cliente_id + '|' + a.servicio_id));
  const titulo = opcional(b.titulo, 120) || ((PUSH_FRASE[p.tipo_alerta] || p.tipo_alerta) + ' en ' + (clientes.size === 1 ? p.cliente_id : 'varios clientes'));
  if (titulo.length < 4) return jsonError('Escribí un título para la sala de crisis.', 400);
  const descripcion = textoLargo(b.descripcion, 2000) || null;
  const inicio = als.map((a) => a.desde).filter(Boolean).sort()[0] || null;
  const inc = await env.DB.prepare(`INSERT INTO incidentes_mayores (titulo, descripcion, estado, severidad, cliente_id, servicio_id, responsable_usuario_id, abierto_por,
      inicio, abierto, origen, actualizado) VALUES (?1, ?2, 'ABIERTO', ?3, ?4, ?5, ?6, ?6, COALESCE(?7, ${AHORA_SIM}), ${AHORA_SIM}, 'HELIOS', ${AHORA_SIM}) RETURNING id`)
    .bind(titulo, descripcion, severidad, clientes.size === 1 ? p.cliente_id : null, servicios.size === 1 ? p.servicio_id : null, yo.id, inicio).first();
  const id = inc.id;
  try {
    await env.DB.batch([
      lineaSQL(env, id, yo, 'APERTURA', 'Abrió la sala de crisis ' + imCodigo(id) + ': ' + titulo + '.'),
      ...sumarAlertasSQL(env, id, yo, als),
      auditoriaSQL(env, yo, 'ABRIR_INCIDENTE_MAYOR', imCodigo(id) + ' ' + titulo + ' (' + als.length + (als.length === 1 ? ' alerta' : ' alertas') + ')'),
    ]);
  } catch (e) {
    await env.DB.batch([env.DB.prepare('DELETE FROM incidente_alertas WHERE incidente_id = ?1').bind(id), env.DB.prepare('DELETE FROM incidente_linea_tiempo WHERE incidente_id = ?1').bind(id),
      env.DB.prepare('DELETE FROM incidentes_mayores WHERE id = ?1').bind(id)]).catch(() => {});
    throw e;
  }
  return okJson({ incidente: { id, codigo: imCodigo(id), titulo } });
}
function sumarAlertasSQL(env, id, yo, als) {
  const out = [];
  for (const a of als) {
    out.push(env.DB.prepare(`INSERT INTO incidente_alertas (incidente_id, alerta_id, tipo_alerta, cliente_id, servicio_id, canal_id, sumada_por, sumada)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ${AHORA_SIM})`).bind(id, a.alerta_id, a.tipo_alerta, a.cliente_id, a.servicio_id, a.canal_id, yo.id));
    out.push(lineaSQL(env, id, yo, 'ALERTA_SUMADA', 'Sumó la alerta: ' + fraseAlerta(a) + '.', a.alerta_id));
    out.push(eventoComentario(env, yo, a.alerta_id, 'Sumó la alerta a la sala de crisis ' + imCodigo(id) + '.'));
  }
  return out;
}
async function sumarAlertas(env, request, yo, rol) {
  const b = await leerCuerpo(request);
  const ids = idsAlertas(b.alertas);
  if (!ids.length) return jsonError('Elegí al menos una alerta abierta.', 400);
  const ya = (await env.DB.prepare('SELECT COUNT(*) AS n FROM incidente_alertas WHERE incidente_id = ?1').bind(rol.inc.id).first()).n;
  if (ya + ids.length > IM_MAX_ALERTAS) return jsonError('Una sala de crisis agrupa hasta ' + IM_MAX_ALERTAS + ' alertas.', 400);
  const v = await alertasParaIncidente(env, ids, rol.inc.id);
  if (v.error) return v.error;
  const sev = v.alertas.some((a) => a.severidad_maxima === 'CRITICA') ? 'CRITICA' : null;
  await env.DB.batch([
    ...sumarAlertasSQL(env, rol.inc.id, yo, v.alertas),
    env.DB.prepare(`UPDATE incidentes_mayores SET severidad = COALESCE(?2, severidad), actualizado = ${AHORA_SIM} WHERE id = ?1`).bind(rol.inc.id, sev),
    auditoriaSQL(env, yo, 'SUMAR_ALERTA_INCIDENTE', imCodigo(rol.inc.id) + ': ' + v.alertas.map(fraseAlerta).join('; ')),
  ]);
  return okJson({ sumadas: v.alertas.length });
}

// ---------- Tareas ----------
async function destinoTarea(env, b) {
  const uid = b.responsable_usuario_id == null || b.responsable_usuario_id === '' ? null : aId(b.responsable_usuario_id);
  const eid = b.equipo_id == null || b.equipo_id === '' ? null : aId(b.equipo_id);
  if (!uid && !eid) return { error: jsonError('Elegí a quién se asigna: una persona, un equipo o los dos.', 400) };
  if (uid) {
    const u = await env.DB.prepare("SELECT id, nombre FROM usuarios WHERE id = ?1 AND activo = 1 AND perfil IN ('SOPORTE', 'ANALISTA')").bind(uid).first();
    if (!u) return { error: jsonError('Las tareas se asignan a personas activas de Soporte o a un analista.', 400) };
  }
  if (eid) {
    const e = await env.DB.prepare('SELECT id FROM equipos WHERE id = ?1 AND activo = 1').bind(eid).first();
    if (!e) return { error: jsonError('Ese equipo no existe o está desactivado.', 400) };
  }
  return { uid, eid };
}
async function crearTarea(env, request, yo, rol, escalar) {
  const b = await leerCuerpo(request);
  const motivo = escalar ? opcional(b.motivo, 300) : null;
  if (escalar && (!motivo || motivo.length < 5)) return jsonError('Escribí por qué se escala (al menos 5 letras).', 400);
  const titulo = escalar ? 'Escalamiento: ' + motivo.slice(0, 140) : opcional(b.titulo, 160);
  if (!titulo || titulo.length < 4) return jsonError('Escribí qué hay que hacer (al menos 4 letras).', 400);
  const detalle = textoLargo(escalar ? b.motivo : b.detalle, 1500) || null;
  const d = await destinoTarea(env, b);
  if (d.error) return d.error;
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM incidente_tareas WHERE incidente_id = ?1').bind(rol.inc.id).first()).n;
  if (n >= IM_MAX_TAREAS) return jsonError('La sala ya tiene ' + IM_MAX_TAREAS + ' tareas.', 400);
  const comp = b.componente_id == null || b.componente_id === '' ? null : aId(b.componente_id);
  if (comp && !(await env.DB.prepare('SELECT 1 FROM componentes_infraestructura WHERE id = ?1').bind(comp).first())) return jsonError('Ese componente no existe.', 400);
  const vence = opcional(b.vence, 30);
  if (vence && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(vence)) return jsonError('La hora límite no es válida.', 400);
  const t = await env.DB.prepare(`INSERT INTO incidente_tareas (incidente_id, titulo, detalle, responsable_usuario_id, equipo_id, componente_id, estado, creada_por, creada, vence,
      actualizada, propuesta_por_asistente) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'PENDIENTE', ?7, ${AHORA_SIM}, ?8, ${AHORA_SIM}, ?9) RETURNING id`)
    .bind(rol.inc.id, titulo, detalle, d.uid, d.eid, comp, yo.id, vence, b.propuesta_por_asistente ? 1 : 0).first();
  const nombres = await env.DB.batch([env.DB.prepare('SELECT nombre FROM usuarios WHERE id = ?1').bind(d.uid || 0), env.DB.prepare('SELECT nombre FROM equipos WHERE id = ?1').bind(d.eid || 0)]);
  const quien = [(nombres[0].results[0] || {}).nombre, (nombres[1].results[0] || {}).nombre ? 'equipo ' + nombres[1].results[0].nombre : null].filter(Boolean).join(' · ');
  const destinos = new Set(d.uid ? [d.uid] : await miembrosActivos(env, d.eid));
  destinos.delete(yo.id);
  const cod = imCodigo(rol.inc.id);
  await env.DB.batch([
    lineaSQL(env, rol.inc.id, yo, escalar ? 'ESCALAMIENTO' : 'TAREA', (escalar ? 'Escaló a ' + quien + ': ' + motivo : 'Asignó la tarea «' + titulo + '» a ' + quien) + '.', t.id),
    ...[...destinos].map((u) => avisoIncidenteSQL(env, u, 'TAREA_INCIDENTE', rol.inc.id, (escalar ? 'Escalamiento en ' : 'Tarea nueva en ') + cod + ': ' + titulo, rol.inc.titulo)),
    auditoriaSQL(env, yo, escalar ? 'ESCALAR_INCIDENTE' : 'CREAR_TAREA_INCIDENTE', cod + ': ' + titulo + ' → ' + quien + (b.propuesta_por_asistente ? ' (propuesta del asistente)' : '')),
  ]);
  return okJson({ tarea: { id: t.id, titulo, responsable: quien } });
}
async function actualizarTarea(env, request, yo, rol, tid) {
  const t = await env.DB.prepare('SELECT * FROM incidente_tareas WHERE id = ?1 AND incidente_id = ?2').bind(tid, rol.inc.id).first();
  if (!t) return jsonError('Esa tarea no existe en esta sala.', 404);
  if (!rol.dirige && !rol.mias.includes(tid)) return jsonError('Solo quien dirige la sala o quien tiene la tarea puede actualizarla.', 403);
  const b = await leerCuerpo(request);
  const estado = String(b.estado || '');
  if (!TAREA_ESTADOS.includes(estado)) return jsonError('El estado de la tarea no es válido.', 400);
  if (estado === 'CANCELADA' && !rol.dirige) return jsonError('Solo quien dirige la sala puede cancelar una tarea.', 403);
  if (t.estado === estado) return jsonError('La tarea ya está en ese estado.', 409);
  const resultado = textoLargo(b.resultado, 1500) || null;
  if (estado === 'HECHA' && (!resultado || resultado.length < 3)) return jsonError('Contá qué se encontró o qué se hizo para marcarla como hecha.', 400);
  const terminada = estado === 'HECHA' || estado === 'CANCELADA';
  const cod = imCodigo(rol.inc.id);
  const pasos = [
    env.DB.prepare(`UPDATE incidente_tareas SET estado = ?2, resultado = COALESCE(?3, resultado), actualizada = ${AHORA_SIM},
      terminada = CASE WHEN ?4 = 1 THEN ${AHORA_SIM} ELSE NULL END WHERE id = ?1`).bind(tid, estado, resultado, terminada ? 1 : 0),
    lineaSQL(env, rol.inc.id, yo, 'TAREA', 'Tarea «' + t.titulo + '»: ' + TAREA_ESTADO_TXT[estado].toLowerCase() + (resultado ? '. ' + resultado : '.'), tid),
    auditoriaSQL(env, yo, 'ACTUALIZAR_TAREA_INCIDENTE', cod + ': «' + t.titulo + '» → ' + estado),
  ];
  if (estado === 'HECHA' && rol.inc.responsable_usuario_id && rol.inc.responsable_usuario_id !== yo.id) {
    pasos.push(avisoIncidenteSQL(env, rol.inc.responsable_usuario_id, 'INCIDENTE', rol.inc.id, 'Tarea hecha en ' + cod + ': ' + t.titulo, resultado));
  }
  await env.DB.batch(pasos);
  return okJson({});
}
async function notaIncidente(env, request, yo, rol) {
  if (rol.lectura || (!rol.dirige && !rol.mias.length)) return jsonError('Con tu perfil la sala se ve en modo lectura.', 403);
  const b = await leerCuerpo(request);
  const txt = textoLargo(b.texto, 1500);
  if (txt.length < 2) return jsonError('Escribí la nota.', 400);
  await env.DB.batch([lineaSQL(env, rol.inc.id, yo, 'NOTA', txt), auditoriaSQL(env, yo, 'NOTA_INCIDENTE', imCodigo(rol.inc.id) + ': ' + txt.slice(0, 200))]);
  return okJson({});
}

// ---------- Estado: Abierto → Mitigado → Resuelto → Cerrado (cerrar pide la causa raíz) ----------
async function estadoIncidente(env, request, yo, rol) {
  const b = await leerCuerpo(request);
  const estado = String(b.estado || ''), inc = rol.inc;
  if (!IM_ESTADOS.includes(estado)) return jsonError('El estado no es válido.', 400);
  if (estado === inc.estado) return jsonError('El incidente ya está ' + IM_ESTADO_TXT[estado].toLowerCase() + '.', 409);
  const cod = imCodigo(inc.id);
  let causa = null, comp = null, resumen = null;
  if (estado === 'CERRADO') {
    causa = textoLargo(b.causa_raiz, 1000);
    if (causa.length < 10) return jsonError('Para cerrar, escribí la causa raíz (al menos 10 letras).', 400);
    comp = b.componente_causa_id == null || b.componente_causa_id === '' ? null : aId(b.componente_causa_id);
    if (comp && !(await env.DB.prepare('SELECT 1 FROM componentes_infraestructura WHERE id = ?1').bind(comp).first())) return jsonError('Ese componente no existe.', 400);
    resumen = textoLargo(b.resumen_cierre, 2000) || null;
  }
  const col = { MITIGADO: 'mitigado', RESUELTO: 'resuelto', CERRADO: 'cerrado' }[estado];
  const vuelve = IM_ESTADOS.indexOf(estado) < IM_ESTADOS.indexOf(inc.estado);
  // A quién avisar: quien tiene una tarea abierta (o la gente de Soporte del equipo, si la tarea es del equipo)
  const abiertas = (await env.DB.prepare(`SELECT responsable_usuario_id AS u, equipo_id AS e FROM incidente_tareas WHERE incidente_id = ?1 AND estado IN ('PENDIENTE', 'EN_CURSO')`)
    .bind(inc.id).all()).results;
  const aAvisar = new Set();
  for (const x of abiertas) { if (x.u) aAvisar.add(x.u); else for (const u of await miembrosActivos(env, x.e)) aAvisar.add(u); }
  aAvisar.delete(yo.id);
  const pendientes = [...aAvisar];
  const texto = estado === 'CERRADO' ? 'Cerró ' + cod + '. Causa raíz: ' + causa + (resumen ? ' · ' + resumen : '')
    : (vuelve ? 'Volvió a ' : 'Pasó a ') + IM_ESTADO_TXT[estado].toLowerCase() + '.';
  await env.DB.batch([
    env.DB.prepare(`UPDATE incidentes_mayores SET estado = ?2, ${col ? col + ' = COALESCE(' + col + ', ' + AHORA_SIM + '),' : ''}
        causa_raiz = COALESCE(?3, causa_raiz), componente_causa_id = COALESCE(?4, componente_causa_id), resumen_cierre = COALESCE(?5, resumen_cierre),
        actualizado = ${AHORA_SIM} WHERE id = ?1`).bind(inc.id, estado, causa, comp, resumen),
    ...(estado === 'CERRADO' ? [env.DB.prepare(`UPDATE incidente_tareas SET estado = 'CANCELADA', actualizada = ${AHORA_SIM}, terminada = ${AHORA_SIM}
        WHERE incidente_id = ?1 AND estado IN ('PENDIENTE', 'EN_CURSO')`).bind(inc.id)] : []),
    lineaSQL(env, inc.id, yo, estado === 'CERRADO' ? 'CIERRE' : 'ESTADO', texto),
    ...pendientes.map((u) => avisoIncidenteSQL(env, u, 'INCIDENTE', inc.id, cod + ' ' + (estado === 'CERRADO' ? 'se cerró' : 'pasó a ' + IM_ESTADO_TXT[estado].toLowerCase()), inc.titulo)),
    auditoriaSQL(env, yo, estado === 'CERRADO' ? 'CERRAR_INCIDENTE_MAYOR' : 'CAMBIAR_ESTADO_INCIDENTE', cod + ': ' + inc.estado + ' → ' + estado + (causa ? ' · ' + causa.slice(0, 200) : '')),
  ]);
  return okJson({});
}

// Comunicado de una alerta que es parte de una sala abierta: queda en su línea de tiempo (lo llama comunicarIncidente)
async function lineaPorComunicado(env, yo, alertaId, cid, nombres, personas) {
  try {
    const r = await env.DB.prepare(`SELECT DISTINCT ia.incidente_id AS id FROM incidente_alertas ia JOIN incidentes_mayores im ON im.id = ia.incidente_id AND im.estado <> 'CERRADO'
      WHERE ia.alerta_id IN (${GRUPO_IDS})`).bind(alertaId).all();
    if (r.results.length) await env.DB.batch(r.results.map((x) => lineaSQL(env, x.id, yo, 'COMUNICADO',
      'Comunicó el incidente (comunicado ' + cid + ') a ' + nombres.join(', ') + ' (' + personas + (personas === 1 ? ' persona' : ' personas') + ').', 'c' + cid)));
  } catch (e) { if (!/no such table/i.test(e.message)) throw e; }
}
// Salas en las que está una alerta (para el detalle de la alerta)
async function incidentesDeAlerta(env, alertaId) {
  try {
    return (await env.DB.prepare(`SELECT DISTINCT im.id, im.titulo, im.estado FROM incidente_alertas ia JOIN incidentes_mayores im ON im.id = ia.incidente_id
      WHERE ia.alerta_id IN (${GRUPO_IDS}) ORDER BY im.id DESC LIMIT 5`).bind(alertaId).all()).results.map((x) => Object.assign(x, { codigo: imCodigo(x.id) }));
  } catch (e) { if (/no such table/i.test(e.message)) return []; throw e; }
}

// ---------- Alertas abiertas que se pueden sumar (una por grupo: tipo + serie), para abrir o sumar desde la página ----------
async function candidatasIncidente(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT MIN(alerta_id) AS alerta_id, tipo_alerta, cliente_id, servicio_id, canal_id, MIN(ventana_inicio) AS desde,
        MIN(CASE severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END) AS sev, MAX(asignado_usuario_id) AS asignado_usuario_id
      FROM alertas_historico WHERE estado IN ('ABIERTA', 'RECONOCIDA') AND severidad_maxima <> 'BAJA'
      GROUP BY tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos ORDER BY sev, desde LIMIT 100`),
    env.DB.prepare(`SELECT ia.incidente_id, ia.tipo_alerta, ia.cliente_id, ia.servicio_id, ia.canal_id FROM incidente_alertas ia
      JOIN incidentes_mayores im ON im.id = ia.incidente_id AND im.estado <> 'CERRADO'`),
  ]);
  const en = new Map(r[1].results.map((x) => [[x.tipo_alerta, x.cliente_id, x.servicio_id, x.canal_id].join('|'), x.incidente_id]));
  const SEV = ['', 'CRITICA', 'ALTA', 'MEDIA'];
  return okJson({ alertas: r[0].results.map((a) => ({ alerta_id: a.alerta_id, problema: PUSH_FRASE[a.tipo_alerta] || a.tipo_alerta, tipo_alerta: a.tipo_alerta,
    cliente_id: a.cliente_id, servicio: PUSH_SERVICIO[a.servicio_id] || a.servicio_id, canal: PUSH_CANAL[a.canal_id] || a.canal_id, desde: a.desde, severidad: SEV[a.sev],
    en_sala: en.has([a.tipo_alerta, a.cliente_id, a.servicio_id, a.canal_id].join('|')) ? imCodigo(en.get([a.tipo_alerta, a.cliente_id, a.servicio_id, a.canal_id].join('|'))) : null })) });
}

// ---------- Rutas ----------
async function rutasSalaCrisis(env, request, ruta, yo) {
  const m = request.method;
  if (ruta === '/incidentes' || /^\/incidente\/\d+$/.test(ruta)) {
    if (m !== 'GET') return null;
    if (!puede(yo, 'sala_crisis')) return Response.redirect(new URL(inicioDe(yo), request.url).toString(), 302);
    return new Response(SALA_CRISIS_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (!ruta.startsWith('/api/incidentes')) return null;
  if (!puede(yo, 'sala_crisis')) return jsonError('Tu perfil no tiene acceso a la sala de crisis.', 403);
  try {
    if (ruta === '/api/incidentes') {
      if (m === 'GET') return await listarIncidentes(env, yo);
      if (m !== 'POST') return null;
      if (!puede(yo, 'sala_crisis_dirigir')) return jsonError('Solo un analista puede abrir una sala de crisis.', 403);
      return await abrirIncidente(env, request, yo);
    }
    if (ruta === '/api/incidentes/contador' && m === 'GET') return await contadorIncidentes(env, yo);
    if (ruta === '/api/incidentes/candidatas' && m === 'GET') {
      if (!puede(yo, 'sala_crisis_dirigir')) return jsonError('Solo un analista puede abrir o sumar alertas a una sala.', 403);
      return await candidatasIncidente(env);
    }
    const x = ruta.match(/^\/api\/incidentes\/(\d+)(?:\/(alertas|tareas|notas|estado|escalar)(?:\/(\d+))?)?$/);
    if (!x) return null;
    const id = Number(x[1]), que = x[2], tid = x[3] ? Number(x[3]) : null;
    if (!que && m === 'GET') return await verIncidente(env, yo, id);
    if (m !== 'POST' || (tid && que !== 'tareas')) return null;
    const rol = await rolEnIncidente(env, yo, id);
    if (rol.error) return rol.error;
    if (!rol.abierto) return jsonError('El incidente está cerrado: ya no se puede cambiar.', 409);
    if (que === 'tareas' && tid) return await actualizarTarea(env, request, yo, rol, tid);
    if (que === 'notas') return await notaIncidente(env, request, yo, rol);
    if (!rol.dirige) return jsonError('Solo el analista que dirige la sala puede hacer esto.', 403);
    if (que === 'alertas') return await sumarAlertas(env, request, yo, rol);
    if (que === 'tareas') return await crearTarea(env, request, yo, rol, false);
    if (que === 'escalar') return await crearTarea(env, request, yo, rol, true);
    if (que === 'estado') return await estadoIncidente(env, request, yo, rol);
  } catch (e) { if (/no such table/i.test(e.message)) return jsonError(FALTA_SCRIPT_24, 503); throw e; }
  return null;
}
