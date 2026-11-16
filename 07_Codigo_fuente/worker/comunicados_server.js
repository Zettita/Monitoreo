// =====================================================================
// COMUNICAR INCIDENTE (parche 46): push a demanda a listas de difusión, con "Recibido" y respuestas.
//
//   Listas de difusión (Administrador): alerta_parametros.listas_difusion (JSON {listas:[{id, nombre, cliente_id|null, activa,
//     miembros:[{usuario_id, rol: INFORMADO|TECNICO|LIDER}]}]}). cliente_id = null: sirve para cualquier alerta.
//   GET/POST /api/admin/listas-difusion · POST /api/admin/listas-difusion/borrar
//   POST /api/alertas/<id>/comunicar          {listas:[ids], mensaje}   (Analista; Soporte en lo suyo o de su equipo)
//   GET  /api/comunicados                     los que me llegaron (página /comunicados)
//   GET  /api/comunicados/<id>                uno, con las respuestas y quién lo vio / dio Recibido (marca "visto")
//   POST /api/comunicados/<id>/recibido       técnicos (también desde el botón del aviso del celular)
//   POST /api/comunicados/<id>/responder      {texto}  técnicos y líderes; queda en la conversación de la alerta
//
// Roles: INFORMADO solo lee; TECNICO da Recibido y responde; LIDER responde sumando información. Si alguien está en varias
// listas elegidas, vale el rol que más puede (técnico > líder > informado). A quien comunica no le llega su propio aviso.
// Avisos: tipo COMUNICADO_<ROL>, con alerta_id = 'c' + id del comunicado (la campanita y el push llevan a /comunicado/<id>).
// En la conversación de la alerta: "Comunicó el incidente (comunicado N) a …" y "Respondió al comunicado N como …: texto".
// Perfil "Solo comunicados": usuarios.solo_comunicados = 1 con perfil = 'GERENTE' (la columna perfil tiene un CHECK que D1 no
// deja cambiar sin rehacer la tabla); al leer el usuario se lo trata como perfil COMUNICADOS.
// =====================================================================
const FALTA_SCRIPT_21 = 'Falta correr 21_comunicados_d1.txt en la consola de D1.';
const ROLES_LISTA = { INFORMADO: 'Informado', TECNICO: 'Técnico', LIDER: 'Líder' };
const ROL_PESO = { INFORMADO: 1, LIDER: 2, TECNICO: 3 };
const LISTAS_MAX = 40, MIEMBROS_MAX = 100, COMUNICADO_MAX_PERSONAS = 100;
const MARCA_COMUNICADO = 'Comunicó el incidente (comunicado ';
const marcaRespuesta = (id) => 'Respondió al comunicado ' + id + ' como ';
// Perfil guardado en la base para un perfil de Helios
const perfilGuardado = (p) => (p === 'COMUNICADOS' ? 'GERENTE' : p);
const SQL_PERFIL = "CASE WHEN solo_comunicados = 1 THEN 'COMUNICADOS' ELSE perfil END";
let SIN_COLUMNA_COMUNICADOS = false;   // sin el script 21: se lee el perfil como antes
async function conPerfil(fnNueva, fnVieja) {
  if (!SIN_COLUMNA_COMUNICADOS) {
    try { return await fnNueva(); } catch (e) { if (!/no such column/i.test(e.message)) throw e; SIN_COLUMNA_COMUNICADOS = true; }
  }
  return await fnVieja();
}

// ---------- Listas de difusión ----------
async function leerListas(env) {
  let fila;
  try { fila = await env.DB.prepare('SELECT listas_difusion AS l FROM alerta_parametros WHERE id = 1').first(); }
  catch (e) { if (/no such column/i.test(e.message)) return { listas: [], falta_script: true }; throw e; }
  let o = null;
  try { o = fila && fila.l ? JSON.parse(fila.l) : null; } catch (e) { o = null; }
  return { listas: o && Array.isArray(o.listas) ? o.listas : [] };
}

async function adminListas(env, request, yo, borrar) {
  const o = await leerListas(env);
  if (request.method === 'GET') {
    const r = await env.DB.batch([
      env.DB.prepare(`SELECT id, nombre, ${SIN_COLUMNA_COMUNICADOS || o.falta_script ? 'perfil' : SQL_PERFIL} AS perfil FROM usuarios WHERE activo = 1 AND perfil <> 'ADMIN' ORDER BY nombre COLLATE NOCASE`),
      env.DB.prepare('SELECT DISTINCT cliente_id FROM series_estado ORDER BY cliente_id'),
    ]);
    return okJson({ listas: o.listas, usuarios: r[0].results, clientes: r[1].results.map((x) => x.cliente_id), falta_script: !!o.falta_script });
  }
  if (o.falta_script) return jsonError(FALTA_SCRIPT_21, 503);
  const b = await leerCuerpo(request), lista = o.listas;
  const id = b.id == null || b.id === '' ? null : aId(b.id);
  let x = id ? lista.find((l) => l.id === id) : null;
  if (id && !x) return jsonError('Esa lista no existe.', 404);
  let accion, nombre;
  if (borrar) {
    if (!x) return jsonError('Esa lista no existe.', 404);
    lista.splice(lista.indexOf(x), 1); accion = 'BORRAR_LISTA_DIFUSION'; nombre = x.nombre;
  } else {
    nombre = opcional(b.nombre, 80);
    if (!nombre || nombre.length < 2) return jsonError('Escribí el nombre de la lista (al menos 2 letras).', 400);
    const cliente = opcional(b.cliente_id, 40);
    if (cliente && !/^[A-Za-z0-9_.-]+$/.test(cliente)) return jsonError('El cliente no es válido.', 400);
    const vistos = new Set(), miembros = [];
    for (const m of Array.isArray(b.miembros) ? b.miembros : []) {
      const u = aId(m && m.usuario_id), rol = m && ROLES_LISTA[m.rol] ? m.rol : null;
      if (!u || !rol || vistos.has(u)) continue;
      vistos.add(u); miembros.push({ usuario_id: u, rol });
    }
    if (!miembros.length) return jsonError('Sumá al menos una persona a la lista.', 400);
    if (miembros.length > MIEMBROS_MAX) return jsonError('Una lista puede tener hasta ' + MIEMBROS_MAX + ' personas.', 400);
    const ids = miembros.map((m) => m.usuario_id);
    const ok = await env.DB.prepare(`SELECT COUNT(*) AS n FROM usuarios WHERE perfil <> 'ADMIN' AND id IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(ids)).first();
    if (!ok || ok.n !== ids.length) return jsonError('Hay personas que no se pueden sumar (no existen o son administradores).', 400);
    if (lista.some((l) => l.id !== id && l.nombre.toLowerCase() === nombre.toLowerCase())) return jsonError('Ya hay una lista con ese nombre.', 409);
    const datos = { nombre, cliente_id: cliente || null, activa: b.activa === 0 || b.activa === false || b.activa === '0' ? 0 : 1, miembros };
    if (x) { Object.assign(x, datos); accion = 'EDITAR_LISTA_DIFUSION'; }
    else {
      if (lista.length >= LISTAS_MAX) return jsonError('Ya hay ' + LISTAS_MAX + ' listas: borrá alguna antes de crear otra.', 409);
      x = Object.assign({ id: Math.max(0, ...lista.map((l) => l.id)) + 1 }, datos); lista.push(x); accion = 'ALTA_LISTA_DIFUSION';
    }
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE alerta_parametros SET listas_difusion = ?1 WHERE id = 1').bind(JSON.stringify({ listas: lista })),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, accion, nombre + (borrar ? '' : ' (' + x.miembros.length + ' personas)')),
  ]);
  return okJson({ id: x ? x.id : null });
}

// Listas para una alerta: las generales y las de su cliente (primero las del cliente), con cuántos hay de cada rol
async function listasParaAlerta(env, clienteId) {
  const o = await leerListas(env);
  if (o.falta_script) return null;
  return o.listas.filter((l) => l.activa && (!l.cliente_id || l.cliente_id === clienteId))
    .sort((a, b) => (b.cliente_id ? 1 : 0) - (a.cliente_id ? 1 : 0) || a.nombre.localeCompare(b.nombre))
    .map((l) => ({ id: l.id, nombre: l.nombre, cliente_id: l.cliente_id, por_rol: l.miembros.reduce((t, m) => { t[m.rol] = (t[m.rol] || 0) + 1; return t; }, {}), personas: l.miembros.length }));
}

// Comunicados de un problema, con cuántos lo vieron y dieron Recibido (para la conversación del detalle)
async function comunicadosDeAlerta(env, alertaId) {
  try {
    const r = await env.DB.prepare(`SELECT c.id, c.mensaje, c.listas, c.enviado, u.nombre AS enviado_por_nombre,
        COUNT(d.usuario_id) AS personas, SUM(d.visto IS NOT NULL) AS vistos,
        SUM(d.rol = 'TECNICO') AS tecnicos, SUM(d.rol = 'TECNICO' AND d.recibido IS NOT NULL) AS recibidos
      FROM comunicados_incidente c LEFT JOIN usuarios u ON u.id = c.enviado_por LEFT JOIN comunicado_destinatarios d ON d.comunicado_id = c.id
      WHERE c.alerta_id IN (${GRUPO_IDS}) GROUP BY c.id ORDER BY c.id`).bind(alertaId).all();
    return r.results;
  } catch (e) { if (/no such table/i.test(e.message)) return null; throw e; }
}

async function comunicarIncidente(env, request, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede comunicar el incidente.', 403);
  const b = await leerCuerpo(request);
  const mensaje = String(b.mensaje || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 2000);
  if (mensaje.length < 10) return jsonError('Escribí el mensaje del comunicado.', 400);
  const o = await leerListas(env);
  if (o.falta_script) return jsonError(FALTA_SCRIPT_21, 503);
  const idsListas = Array.from(new Set((Array.isArray(b.listas) ? b.listas : []).map(aId).filter(Boolean)));
  const elegidas = o.listas.filter((l) => l.activa && idsListas.includes(l.id) && (!l.cliente_id || l.cliente_id === rol.a.cliente_id));
  if (!elegidas.length || elegidas.length !== idsListas.length) return jsonError('Elegí al menos una lista de difusión que sirva para esta alerta.', 400);
  // Cada persona una vez, con el rol que más puede
  const porUsuario = new Map();
  for (const l of elegidas) for (const m of l.miembros) {
    if (m.usuario_id === yo.id) continue;
    const ant = porUsuario.get(m.usuario_id);
    if (!ant || ROL_PESO[m.rol] > ROL_PESO[ant]) porUsuario.set(m.usuario_id, m.rol);
  }
  const activos = porUsuario.size ? (await env.DB.prepare(`SELECT id FROM usuarios WHERE activo = 1 AND id IN (SELECT value FROM json_each(?1))`)
    .bind(JSON.stringify([...porUsuario.keys()])).all()).results.map((x) => x.id) : [];
  const destinos = activos.map((id) => ({ id, rol: porUsuario.get(id) })).slice(0, COMUNICADO_MAX_PERSONAS);
  if (!destinos.length) return jsonError('Las listas elegidas no tienen a nadie activo (además de quien comunica).', 400);
  const nombres = elegidas.map((l) => l.nombre);
  const a = await env.DB.prepare(`SELECT tipo_alerta, cliente_id, servicio_id, canal_id, severidad_maxima, severidad FROM alertas_historico WHERE alerta_id = ?1`).bind(alertaId).first();
  const titulo = (PUSH_FRASE[a.tipo_alerta] || a.tipo_alerta) + ' · ' + a.cliente_id + ', ' + (PUSH_SERVICIO[a.servicio_id] || a.servicio_id) + ' por ' + (PUSH_CANAL[a.canal_id] || a.canal_id);
  const c = await env.DB.prepare(`INSERT INTO comunicados_incidente (alerta_id, mensaje, listas, enviado_por, enviado) VALUES (?1, ?2, ?3, ?4, ${AHORA_SIM}) RETURNING id`)
    .bind(alertaId, mensaje, nombres.join(' · '), yo.id).first();
  const cid = c.id;
  try {
    await env.DB.batch([
      ...destinos.map((d) => env.DB.prepare('INSERT INTO comunicado_destinatarios (comunicado_id, usuario_id, rol) VALUES (?1, ?2, ?3)').bind(cid, d.id, d.rol)),
      ...destinos.map((d) => env.DB.prepare(`INSERT INTO avisos (usuario_id, fecha, tipo, alerta_id, texto, detalle) VALUES (?1, ${AHORA_SIM}, ?2, ?3, ?4, ?5)`)
        .bind(d.id, 'COMUNICADO_' + d.rol, 'c' + cid, 'Incidente: ' + titulo, mensaje.slice(0, 300))),
      eventoComentario(env, yo, alertaId, MARCA_COMUNICADO + cid + ') a ' + nombres.join(', ') + ' (' + destinos.length + (destinos.length === 1 ? ' persona' : ' personas') + ')' + CORREO_SEPARADOR + mensaje),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
        .bind(yo.id, 'COMUNICAR_INCIDENTE', a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + '): comunicado ' + cid + ' a ' + nombres.join(', ') + ' (' + destinos.length + ')'),
    ]);
  } catch (e) {
    await env.DB.prepare('DELETE FROM comunicados_incidente WHERE id = ?1').bind(cid).run().catch(() => {});
    throw e;
  }
  return okJson({ comunicado: { id: cid, personas: destinos.length, por_rol: destinos.reduce((t, d) => { t[d.rol] = (t[d.rol] || 0) + 1; return t; }, {}) } });
}

// ---------- Para quien lo recibe ----------
async function comunicadoPara(env, yo, id) {
  const c = await env.DB.prepare(`SELECT c.id, c.alerta_id, c.mensaje, c.listas, c.enviado, c.enviado_por, u.nombre AS enviado_por_nombre,
      h.tipo_alerta, h.cliente_id, h.servicio_id, h.canal_id, h.severidad_maxima, h.severidad, h.estado, h.valor_observado,
      d.rol AS mi_rol, d.visto AS mi_visto, d.recibido AS mi_recibido
    FROM comunicados_incidente c LEFT JOIN usuarios u ON u.id = c.enviado_por
    LEFT JOIN alertas_historico h ON h.alerta_id = c.alerta_id
    LEFT JOIN comunicado_destinatarios d ON d.comunicado_id = c.id AND d.usuario_id = ?2
    WHERE c.id = ?1`).bind(id, yo.id).first();
  if (!c) return { error: jsonError('El comunicado no existe.', 404) };
  // Lo ve quien lo recibió, quien lo mandó y quien puede ver el detalle de la alerta
  let puedeAlerta = false;
  if (!c.mi_rol && c.enviado_por !== yo.id) {
    const r = puede(yo, 'detalle_alerta') && c.alerta_id ? await rolEnAlerta(env, yo, c.alerta_id) : { error: true };
    if (r.error) return { error: jsonError('Ese comunicado no te llegó.', 403) };
    puedeAlerta = true;
  } else puedeAlerta = puede(yo, 'detalle_alerta');
  return { c, puedeAlerta };
}

async function verComunicado(env, yo, id) {
  const x = await comunicadoPara(env, yo, id);
  if (x.error) return x.error;
  const c = x.c;
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT d.rol, d.visto, d.recibido, u.nombre FROM comunicado_destinatarios d JOIN usuarios u ON u.id = d.usuario_id WHERE d.comunicado_id = ?1 ORDER BY u.nombre COLLATE NOCASE`).bind(id),
    env.DB.prepare(`SELECT e.id, e.fecha, e.comentario, u.nombre AS usuario_nombre FROM alerta_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
                    WHERE e.alerta_id = ?1 AND e.accion = 'COMENTAR' AND substr(e.comentario, 1, length(?2)) = ?2 ORDER BY e.id`).bind(c.alerta_id, marcaRespuesta(id)),
  ].concat(c.mi_rol && !c.mi_visto ? [env.DB.prepare(`UPDATE comunicado_destinatarios SET visto = ${AHORA_SIM} WHERE comunicado_id = ?1 AND usuario_id = ?2`).bind(id, yo.id)] : []));
  const dest = r[0].results, resp = r[1].results, tickets = (await ticketsDeAlerta(env, c.alerta_id)) || [];
  const pre = marcaRespuesta(id);
  return okJson({
    comunicado: {
      id: c.id, mensaje: c.mensaje, listas: c.listas, enviado: c.enviado, enviado_por_nombre: c.enviado_por_nombre,
      alerta: { problema: c.tipo_alerta === 'VOLUMEN_BAJO' && c.valor_observado === 0 ? 'No está entrando tráfico' : PUSH_FRASE[c.tipo_alerta] || c.tipo_alerta,
        cliente_id: c.cliente_id, servicio: (PUSH_SERVICIO[c.servicio_id] || c.servicio_id) + ' por ' + (PUSH_CANAL[c.canal_id] || c.canal_id),
        gravedad: c.severidad_maxima || c.severidad, resuelta: c.estado === 'RESUELTA', id: x.puedeAlerta ? c.alerta_id : null },
      tickets: tickets.map((t) => ({ clave: t.clave, sistema: (TICKETS_SISTEMAS[t.sistema] || {}).nombre || t.sistema, url: t.url, estado: t.estado, simulado: t.simulado })),
      mi_rol: c.mi_rol || null, mi_recibido: c.mi_recibido || null,
      puedo: { recibido: c.mi_rol === 'TECNICO' && !c.mi_recibido, responder: c.mi_rol === 'TECNICO' || c.mi_rol === 'LIDER' },
      destinatarios: dest.map((d) => ({ nombre: d.nombre, rol: d.rol, visto: !!d.visto, recibido: d.recibido })),
      respuestas: resp.map((e) => {
        const t = e.comentario.slice(pre.length), k = t.indexOf(': ');
        return { fecha: e.fecha, usuario_nombre: e.usuario_nombre, rol: /^l[ií]der/i.test(t) ? 'LIDER' : 'TECNICO', texto: k >= 0 ? t.slice(k + 2) : t };
      }),
    },
  });
}

async function misComunicados(env, yo) {
  try {
    const r = await env.DB.prepare(`SELECT c.id, c.mensaje, c.enviado, u.nombre AS enviado_por_nombre, h.tipo_alerta, h.cliente_id, h.valor_observado,
        d.rol, d.visto, d.recibido
      FROM comunicado_destinatarios d JOIN comunicados_incidente c ON c.id = d.comunicado_id
      LEFT JOIN usuarios u ON u.id = c.enviado_por LEFT JOIN alertas_historico h ON h.alerta_id = c.alerta_id
      WHERE d.usuario_id = ?1 ORDER BY d.comunicado_id DESC LIMIT 50`).bind(yo.id).all();
    return okJson({ comunicados: r.results.map((x) => ({
      id: x.id, mensaje: x.mensaje, enviado: x.enviado, enviado_por_nombre: x.enviado_por_nombre, rol: x.rol, visto: !!x.visto, recibido: x.recibido,
      problema: x.tipo_alerta === 'VOLUMEN_BAJO' && x.valor_observado === 0 ? 'No está entrando tráfico' : PUSH_FRASE[x.tipo_alerta] || x.tipo_alerta, cliente_id: x.cliente_id })) });
  } catch (e) { if (/no such table/i.test(e.message)) return okJson({ comunicados: [] }); throw e; }
}

async function recibidoComunicado(env, yo, id) {
  const x = await comunicadoPara(env, yo, id);
  if (x.error) return x.error;
  if (x.c.mi_rol !== 'TECNICO') return jsonError('"Recibido" lo dan los técnicos del comunicado.', 403);
  if (x.c.mi_recibido) return okJson({ ya: true });
  await env.DB.batch([
    env.DB.prepare(`UPDATE comunicado_destinatarios SET recibido = ${AHORA_SIM}, visto = COALESCE(visto, ${AHORA_SIM}) WHERE comunicado_id = ?1 AND usuario_id = ?2`).bind(id, yo.id),
    env.DB.prepare(`UPDATE avisos SET leido = 1 WHERE usuario_id = ?1 AND alerta_id = ?2`).bind(yo.id, 'c' + id),
  ]);
  return okJson({});
}

async function responderComunicado(env, request, yo, id) {
  const x = await comunicadoPara(env, yo, id);
  if (x.error) return x.error;
  const c = x.c;
  if (c.mi_rol !== 'TECNICO' && c.mi_rol !== 'LIDER') return jsonError('Este comunicado es solo para leer.', 403);
  const b = await leerCuerpo(request);
  const txt = String(b.texto || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 1000);
  if (txt.length < 2) return jsonError('Escribí la respuesta.', 400);
  const comentario = marcaRespuesta(id) + (c.mi_rol === 'LIDER' ? 'líder' : 'técnico') + ': ' + txt;
  // Avisa a quien comunicó y a quien tiene la alerta (si no es quien responde)
  const a = await env.DB.prepare('SELECT asignado_usuario_id FROM alertas_historico WHERE alerta_id = ?1').bind(c.alerta_id).first();
  const quienes = [c.enviado_por, a && a.asignado_usuario_id].filter((u, i, l) => u && u !== yo.id && l.indexOf(u) === i);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, comentario) VALUES (${AHORA_SIM}, ?1, ?2, 'COMENTAR', ?3)`).bind(c.alerta_id, yo.id, comentario),
    ...(c.mi_rol === 'TECNICO' ? [env.DB.prepare(`UPDATE comunicado_destinatarios SET recibido = COALESCE(recibido, ${AHORA_SIM}), visto = COALESCE(visto, ${AHORA_SIM}) WHERE comunicado_id = ?1 AND usuario_id = ?2`).bind(id, yo.id)] : []),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'RESPONDER_COMUNICADO', 'comunicado ' + id + ': ' + txt.slice(0, 120)),
  ].concat(avisoStmts(env, quienes, 'COMENTARIO', c.alerta_id, yo.nombre + ' respondió al comunicado del incidente', txt.slice(0, 300))));
  return okJson({});
}

async function rutasComunicados(env, request, ruta, yo) {
  const m = request.method;
  let x = ruta.match(/^\/api\/alertas\/([0-9a-f]{32})\/comunicar$/);
  if (x) return m === 'POST' ? await comunicarIncidente(env, request, yo, x[1]) : null;
  if (ruta === '/api/admin/listas-difusion' || ruta === '/api/admin/listas-difusion/borrar') {
    if (!puede(yo, 'admin_listas')) return jsonError('Tu perfil no tiene permiso para esta acción.', 403);
    const borrar = ruta.endsWith('/borrar');
    if (m !== 'POST' && (borrar || m !== 'GET')) return null;
    return await adminListas(env, request, yo, borrar);
  }
  if (ruta === '/comunicados' || /^\/comunicado\/\d+$/.test(ruta)) {
    if (m !== 'GET') return null;
    if (!puede(yo, 'comunicados')) return Response.redirect(new URL(inicioDe(yo), request.url).toString(), 302);
    return new Response(COMUNICADOS_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (!ruta.startsWith('/api/comunicados')) return null;
  if (!puede(yo, 'comunicados')) return jsonError('Tu perfil no recibe comunicados.', 403);
  if (ruta === '/api/comunicados' && m === 'GET') return await misComunicados(env, yo);
  x = ruta.match(/^\/api\/comunicados\/(\d+)(?:\/(recibido|responder))?$/);
  if (!x) return null;
  const id = Number(x[1]);
  try {
    if (!x[2] && m === 'GET') return await verComunicado(env, yo, id);
    if (x[2] === 'recibido' && m === 'POST') return await recibidoComunicado(env, yo, id);
    if (x[2] === 'responder' && m === 'POST') return await responderComunicado(env, request, yo, id);
  } catch (e) { if (/no such table/i.test(e.message)) return jsonError(FALTA_SCRIPT_21, 503); throw e; }
  return null;
}

