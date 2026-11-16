// =====================================================================
// TICKETS A DEMANDA (parche 41): generar un ticket en InvGate o Jira desde la alerta. No sale solo: lo pide una persona.
//
//   POST /api/alertas/<id>/ticket     {sistema: 'INVGATE'|'JIRA', resumen, descripcion}   (Analista; Soporte en lo suyo o de su equipo)
//   (el detalle de la alerta trae tickets y tickets_sistemas)
//
// Se guarda en la tabla tickets_alerta (script 19), con el alerta_id con que se generó: el detalle encuentra los tickets
// de todas las ventanas del problema (GRUPO_IDS). Uno por herramienta y por problema.
// Cómo se crea en cada herramienta: tickets_integracion.js (crearTicketInvgate / crearTicketJira). Modo por herramienta:
// variable TICKETS_INVGATE / TICKETS_JIRA = 'real'; si no, SIMULADO (clave inventada INV-1001 / HEL-101, marcada "simulado").
// En la conversación queda "Generó el ticket <clave> en <herramienta>" (comentario con marca) y en la auditoría GENERAR_TICKET.
// =====================================================================
const TICKETS_SISTEMAS = {
  INVGATE: { nombre: 'InvGate', prefijo: 'INV', primero: 1001, crear: (env, d) => crearTicketInvgate(env, d), variable: 'TICKETS_INVGATE' },
  JIRA: { nombre: 'Jira', prefijo: 'HEL', primero: 101, crear: (env, d) => crearTicketJira(env, d), variable: 'TICKETS_JIRA' },
};
const MARCA_TICKET = 'Generó el ticket ';
const FALTA_SCRIPT_19 = 'Para generar tickets falta correr 19_tickets_d1.txt en la consola de D1.';
const ticketModo = (env, sis) => (String(env[TICKETS_SISTEMAS[sis].variable] || '').toLowerCase() === 'real' ? 'real' : 'simulado');
const ticketTexto = (t) => t.clave + ' (' + TICKETS_SISTEMAS[t.sistema].nombre + ')';

// fetch con tiempo máximo, para la integración
async function pedidoConTiempo(url, op, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms || 8000);
  try { return await fetch(url, Object.assign({}, op, { signal: c.signal })); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'La herramienta de tickets no respondió a tiempo.' : 'No se pudo conectar con la herramienta de tickets.'); }
  finally { clearTimeout(t); }
}

// Tickets de un problema (null si falta el script 19)
async function ticketsDeAlerta(env, alertaId) {
  try {
    return (await env.DB.prepare(`SELECT t.id, t.sistema, t.clave, t.url, t.estado, t.simulado, t.resumen, t.creado, t.actualizado, u.nombre AS creado_por_nombre
                                  FROM tickets_alerta t LEFT JOIN usuarios u ON u.id = t.creado_por
                                  WHERE t.alerta_id IN (${GRUPO_IDS}) ORDER BY t.id`).bind(alertaId).all()).results;
  } catch (e) { if (/no such table/i.test(e.message)) return null; throw e; }
}
const ticketsSistemas = (env) => Object.keys(TICKETS_SISTEMAS).map((k) => ({ id: k, nombre: TICKETS_SISTEMAS[k].nombre, modo: ticketModo(env, k) }));

async function generarTicket(env, request, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede generar un ticket.', 403);
  const b = await leerCuerpo(request);
  const sis = TICKETS_SISTEMAS[b.sistema] ? b.sistema : null;
  if (!sis) return jsonError('Elegí en qué herramienta generar el ticket.', 400);
  const resumen = String(b.resumen || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);
  const descripcion = String(b.descripcion || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 8000);
  if (resumen.length < 5) return jsonError('Escribí el resumen del ticket.', 400);
  const ya = await ticketsDeAlerta(env, alertaId);
  if (ya === null) return jsonError(FALTA_SCRIPT_19, 503);
  const previo = ya.find((t) => t.sistema === sis);
  if (previo) return jsonError('Esta alerta ya tiene el ticket ' + previo.clave + ' en ' + TICKETS_SISTEMAS[sis].nombre + '.', 409);
  // Datos para la herramienta (lo que recibe tickets_integracion.js)
  const a = await env.DB.prepare(`SELECT h.tipo_alerta, h.severidad_maxima, h.severidad, h.cliente_id, h.servicio_id, h.canal_id, h.ambiente,
      (SELECT MIN(ventana_inicio) FROM alertas_historico WHERE alerta_id IN (${GRUPO_IDS})) AS desde
    FROM alertas_historico h WHERE h.alerta_id = ?1`).bind(alertaId).first();
  const prioridad = /^P[1-4]$/.test(b.prioridad) ? b.prioridad : null;
  const datos = {
    resumen, descripcion, prioridad, gravedad: a.severidad_maxima || a.severidad, tipo_alerta: a.tipo_alerta,
    cliente_id: a.cliente_id, servicio_id: a.servicio_id, canal_id: a.canal_id, ambiente: a.ambiente, desde: a.desde,
    enlace: new URL('/alerta/' + alertaId, request.url).toString(), alerta_id: alertaId,
    solicitante: { id: yo.id, nombre: yo.nombre, usuario: yo.usuario },
  };
  const modo = ticketModo(env, sis), def = TICKETS_SISTEMAS[sis];
  let res;
  if (modo === 'real') {
    try { res = await def.crear(env, datos); } catch (e) { return jsonError(e.message || ('No se pudo generar el ticket en ' + def.nombre + '.'), 502); }
    if (!res || !res.clave) return jsonError(def.nombre + ' no devolvió el número del ticket.', 502);
  } else {
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets_alerta WHERE sistema = ?1 AND simulado = 1`).bind(sis).first();
    res = { clave: def.prefijo + '-' + (def.primero + ((n && n.n) || 0)), url: null, estado: 'Abierto' };
  }
  const clave = String(res.clave).slice(0, 60), url = /^https:\/\//.test(res.url || '') ? String(res.url).slice(0, 500) : null;
  const txt = MARCA_TICKET + clave + ' en ' + def.nombre + (modo === 'real' ? '' : ' (simulado)');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tickets_alerta (alerta_id, sistema, clave, url, estado, simulado, resumen, descripcion, creado_por, creado)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ${AHORA_SIM})`)
      .bind(alertaId, sis, clave, url, String(res.estado || 'Abierto').slice(0, 40), modo === 'real' ? 0 : 1, resumen, descripcion || null, yo.id),
    eventoComentario(env, yo, alertaId, txt),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
      .bind(yo.id, 'GENERAR_TICKET', a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + '): ' + clave + ' en ' + def.nombre + (modo === 'real' ? '' : ' (simulado)')),
  ].concat(avisoStmts(env, (await aQuienesAvisar(env, rol.a)).filter((x) => x !== yo.id), 'COMENTARIO', alertaId, yo.nombre + ' generó un ticket para una alerta', clave + ' en ' + def.nombre)));
  return okJson({ ticket: { sistema: sis, clave, url, estado: res.estado || 'Abierto', simulado: modo === 'real' ? 0 : 1 } });
}

// Para la integración: un cambio en el ticket (estado y/o comentario) desde InvGate o Jira. Lo deja en la conversación.
async function novedadTicket(env, sistema, clave, nov) {
  const t = await env.DB.prepare('SELECT id, alerta_id, estado FROM tickets_alerta WHERE sistema = ?1 AND clave = ?2').bind(sistema, clave).first();
  if (!t) return false;
  const estado = nov && nov.estado ? String(nov.estado).slice(0, 40) : t.estado;
  const comentario = nov && nov.comentario ? String(nov.comentario).slice(0, 1000) : '';
  const txt = 'Novedad del ticket ' + clave + ' en ' + TICKETS_SISTEMAS[sistema].nombre + (estado !== t.estado ? ': pasó a "' + estado + '"' : '') + (comentario ? (estado !== t.estado ? '. ' : ': ') + comentario : '');
  await env.DB.batch([
    env.DB.prepare(`UPDATE tickets_alerta SET estado = ?2, actualizado = ${AHORA_SIM} WHERE id = ?1`).bind(t.id, estado),
    env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, comentario) VALUES (${AHORA_SIM}, ?1, NULL, 'COMENTAR', ?2)`).bind(t.alerta_id, txt),
  ]);
  return true;
}

