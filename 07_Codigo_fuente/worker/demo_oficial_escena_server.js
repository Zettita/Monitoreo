// =====================================================================
// DEMO OFICIAL, UNA SOLA ESCENA (parche 83). Sin SQL. Reemplaza al módulo del parche 82 (14 escenas).
//
// Pedido de Uriel y su compañera: con 14 escenas había que dar muchas vueltas entre perfiles. Ahora hay UNA escena que deja, de un pantallazo,
// una mañana entera de operación (martes 27/10/2026, de 10:00 a 14:00) con incidentes en todos los estados, para recorrer los tres perfiles sin avanzar:
//   Gerente        el dashboard: estado por cliente, disponibilidad, incidentes activos, distribución de fallas (incluida la causa de lo resuelto a mano).
//   Administrador  lo parametrizable: umbrales y ancho de banda por cliente, reglas, plantillas de correo.
//   Analista       pre-alertas (una activa para avisar), Seguimiento con alertas sin asignar, asignadas, en curso y devueltas, el agente, el correo y, en vivo,
//                  la sala de crisis y Teams con la caída del gateway (las tres alertas quedan sin sala: se abre en la demo).
//
// Qué queda armado (los incidentes siguen abiertos hasta el final):
//   Sin asignar ........ CLI_006 sin éxitos (grave, el gateway), CLI_005 errores, CLI_001 rechazos en el borde del límite, CLI_008 cliente nuevo (informativa)
//   Asignada sin tomar . CLI_004 rechazo alto (demorada), CLI_002 errores (al equipo, si hay un equipo con gente de Soporte)
//   En curso ........... CLI_003 latencia alta
//   Devuelta ........... CLI_007 dejó de enviar (Soporte la devolvió con el motivo)
//   Resueltas a mano ... CLI_002 tickets chicos y CLI_001 importe alto, con causa y qué se hizo (alimentan «Distribución de fallas» por causa)
//   Resueltas solas .... CLI_001 volumen bajo, dato tardío de CLI_003 e informe inconsistente de CLI_005
//   Pre-alertas ........ confirmadas (CLI_004 y CLI_003), no se cumplió (CLI_005) y una activa (CLI_004 recarga de celular), lista para «Avisar a Soporte»
//
// Cómo se carga: 16 ventanas de 15 minutos de una vez, en pasos cortos (6 + 6 + 4 ventanas y, al final, las asignaciones) para no pasar las 50 consultas
// que D1 permite por pedido. Cada paso es un POST a /api/demo-oficial/siguiente; la página los encadena sola con «Cargando… N %». El estado sale del reloj
// simulado (alerta_parametros.ahora), así que, si un paso falla, tocar «Cargar escena» retoma donde quedó.
//   GET  /api/demo-oficial             estado: preparada, ventanas cargadas, escena siguiente
//   POST /api/demo-oficial/preparar    deja todo en cero (como «Preparar demo») y pone el reloj en el arranque (martes 27/10/2026 10:00 ARG)
//   POST /api/demo-oficial/siguiente   un paso de la carga (devuelve listo: false mientras falten pasos)
// Las asignaciones y las resoluciones a mano se arman con personas de Soporte reales (soporte1 y soporte2 si existen, si no las primeras activas); sin nadie
// de Soporte, quedan sin asignar y las resueltas a mano las resuelve quien presenta. Permiso: el mismo de la demo (Administrador y Analista).
// =====================================================================
const DEMO_OFICIAL_INICIO = '2026-10-27T13:00:00Z';   // martes 27/10/2026 10:00 ARG
const DO_MIN = 15 * 60e3;
const DO_VENTANAS = 16;                               // 10:00 a 14:00
const DO_PASOS = [6, 12, 16];                         // ventanas cargadas al terminar cada paso
const DO_SEMBRADO_MIN = 6;                            // el reloj queda a las 14:06 cuando están las asignaciones (14:05 = recién cargadas las ventanas)

const DO_ESCENA = {
  titulo: 'Una mañana de operación con incidentes en todos los estados',
  acto: 'Gerente · Administrador · Analista',
  texto: 'Carga de una vez 4 horas de datos (de 10:00 a 14:00): el gateway de pagos caído, un rechazo asignado, una latencia en curso, un silencio devuelto, dos resueltas a mano, pre-alertas y un cliente nuevo. Después se recorren los tres perfiles sin avanzar.',
};

const doRango = (desde, hasta, tipo, m) => { const o = {}; for (let w = desde; w <= hasta; w++) o[w] = [tipo, m]; return o; };

// Qué le pasa a cada serie en cada ventana (0 = 10:00 … 15 = 13:45 ARG). Lo que no figura llega dentro de lo esperado.
const DO_LINEA = [
  [CLI001_TRF_MOB, doRango(1, 1, 'VOLUMEN_BAJO')],                                   // 10:15: la app se queda muda; la ventana siguiente vuelve sola
  [CLI002_PAG_MOB, doRango(2, 5, 'IMPORTE_BAJO')],                                   // 10:30 a 11:30: tickets más chicos (se resuelve a mano al terminar el paso 1)
  [CLI005_RT_MOB, { 3: ['RAMPA_ERROR', 0.45], 4: ['RAMPA_ERROR', 0.8] }],           // pre-alerta que no se cumple (la ventana 5 vuelve a lo normal)
  [CLI004_TRF_API, { 5: ['RAMPA_RECHAZO', 0.45], 6: ['RAMPA_RECHAZO', 0.8], ...doRango(7, 15, 'RECHAZO_ALTO') }],   // pre-alerta que se confirma y alerta abierta
  [CLI003_RC_MOB, { 6: ['DATO_TARDIO'] }],                                           // el collector manda una ventana 12 minutos tarde
  [CLI003_RT_API, { 8: ['RAMPA_LATENCIA', 0.45], 9: ['RAMPA_LATENCIA', 0.8], ...doRango(10, 15, 'LATENCIA_ALTA') }],   // pre-alerta que se confirma y alerta abierta
  [CLI005_PAG_MOB, { 8: ['DATO_INCONSISTENTE'], ...doRango(12, 15, 'ERROR_ALTO') }], // informe inconsistente y, desde las 13:00, el gateway
  [CLI001_TRF_WEB, { ...doRango(9, 11, 'IMPORTE_ALTO'), 14: ['RAMPA_RECHAZO', 1.25], 15: ['RAMPA_RECHAZO', 1.25] }],   // importe alto (se resuelve a mano) y rechazos en el borde del límite
  [CLI007_RC_MOB, doRango(10, 15, 'FALTANTE')],                                      // deja de enviar desde las 12:30
  [CLI006_PAG_API, doRango(12, 15, 'SIN_EXITOS')],                                   // el gateway de pagos: ningún pago aprobado
  [CLI002_PAG_WEB, doRango(12, 15, 'ERROR_ALTO')],
  [CLI004_RC_WEB, { 14: ['RAMPA_RECHAZO', 0.45], 15: ['RAMPA_RECHAZO', 0.8] }],      // pre-alerta activa (todavía sin alerta)
  [CLI008_TRF_MOB, doRango(13, 15, 'NUEVO')],                                        // cliente nuevo, sin historia
];

// Las ventanas de un paso en un solo INSERT (una sentencia por ventana): cada fila es un arreglo de 24 valores en el orden de INSERT_OBSERVADA
const DO_INSERT_JSON = `
INSERT OR REPLACE INTO core_metricas_observadas (
    metrica_id, recepcion_id, lote_id, collector_id, ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_total, cantidad_exitos, cantidad_rechazos, cantidad_errores, tasa_aprobacion, tasa_rechazo, tasa_error,
    importe_total, importe_promedio, tiempo_respuesta_promedio, tiempo_respuesta_maximo,
    ultimo_evento_exitoso, origen_dato, schema_version, fecha_recepcion)
SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]'), 'COLLECTOR-LOCAL-001',
       json_extract(j.value, '$[3]'), json_extract(j.value, '$[4]'), 15,
       json_extract(j.value, '$[5]'), json_extract(j.value, '$[6]'), json_extract(j.value, '$[7]'), json_extract(j.value, '$[8]'), json_extract(j.value, '$[9]'), json_extract(j.value, '$[10]'),
       json_extract(j.value, '$[11]'), json_extract(j.value, '$[12]'), json_extract(j.value, '$[13]'), json_extract(j.value, '$[14]'),
       json_extract(j.value, '$[15]'), json_extract(j.value, '$[16]'), json_extract(j.value, '$[17]'),
       json_extract(j.value, '$[18]'), json_extract(j.value, '$[19]'), json_extract(j.value, '$[20]'), json_extract(j.value, '$[21]'),
       json_extract(j.value, '$[22]'), 'API', '1.0', json_extract(j.value, '$[23]')
FROM json_each(?1) j`;

// Hora de Argentina del martes 27/10/2026 como texto UTC (para los eventos y las asignaciones armadas a mano)
const doHora = (h, m) => isoZ(Date.parse('2026-10-27T00:00:00Z') + ((h + 3) * 60 + m) * 60e3);

async function demoOficialEstado(env) {
  const r = await env.DB.prepare(Q_DEMO_RELOJ).first();
  const ini = Date.parse(DEMO_OFICIAL_INICIO);
  const ahora = r && r.ahora ? Date.parse(r.ahora) : null;
  const preparada = ahora != null && ahora >= ini && ahora < ini + 864e5;
  const cargadas = preparada ? Math.min(DO_VENTANAS, Math.floor((ahora - ini) / DO_MIN)) : 0;
  const completa = preparada && ahora >= ini + DO_VENTANAS * DO_MIN + DO_SEMBRADO_MIN * 60e3;
  return {
    ok: true, oficial: true, preparada, inicio: DEMO_OFICIAL_INICIO, total: 1,
    escena: completa ? 1 : 0,                       // escenas ya mostradas
    ventanas_cargadas: cargadas, ventanas_total: DO_VENTANAS, completa,
    siguiente: !completa ? { numero: 1, titulo: DO_ESCENA.titulo, texto: DO_ESCENA.texto, acto: DO_ESCENA.acto, ventana_inicio: DEMO_OFICIAL_INICIO } : null,
  };
}

// Deja todo en cero igual que «Preparar demo» (alertas, avisos, salas, tickets, comunicados, memoria del bot, métricas de la demo) y pone el reloj en el arranque de la oficial
async function demoOficialPreparar(env) {
  const r = await demoPreparar(env);
  await env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1, horizonte_horas = 24 WHERE id = 1').bind(DEMO_OFICIAL_INICIO).run();
  await env.DB.prepare('UPDATE alerta_parametros SET revisado_hasta = NULL WHERE id = 1').run().catch(() => {});   // la primera revisión es completa (sin el script 15 no hay columna)
  await env.DB.prepare(MARCAR_TABLERO).run();
  return { ...(await demoOficialEstado(env)), alertas_borradas: r.alertas_borradas, observadas_borradas: r.observadas_borradas };
}

// Arma las ventanas [desde, hasta) como una sentencia por ventana
async function doVentanas(env, desde, hasta) {
  const ini = Date.parse(DEMO_OFICIAL_INICIO);
  const stmts = [];
  let filasTotal = 0;
  for (let w = desde; w < hasta; w++) {
    const iniMs = ini + w * DO_MIN;
    const esperadas = (await env.DB.prepare(Q_DEMO_PERFIL).bind(isoZ(iniMs)).all()).results;
    const vistas = new Set(), filas = [];
    let numero = 0;
    for (const e of esperadas) {
      const k = e.cliente_id + '|' + e.servicio_id + '|' + e.canal_id;
      if (vistas.has(k)) continue;
      vistas.add(k);
      const serie = { cliente: e.cliente_id, servicio: e.servicio_id, canal: e.canal_id, n: ++numero };
      const linea = DO_LINEA.find(([s]) => mismaSerie(e, s));
      const ev = linea ? linea[1][w] : null;
      if (ev && ev[0] === 'FALTANTE') continue;                 // no llega la ventana
      filas.push(filaDemo(e, serie, ev ? ev[0] : null, ev ? ev[1] : 0, iniMs));
    }
    // Serie nueva sin perfil (CLI_008): se basa en lo esperado de CLI_001 Mobile
    const nuevo = DO_LINEA.find(([, o]) => o[w] && o[w][0] === 'NUEVO');
    if (nuevo) {
      const base = esperadas.find((e) => mismaSerie(e, CLI001_TRF_MOB)) || esperadas[0];
      if (base) filas.push(filaDemo(base, { ...nuevo[0], n: ++numero }, 'NUEVO', 0, iniMs));
    }
    if (!filas.length) throw new Error('No hay perfil de comportamiento para la ventana ' + isoZ(iniMs) + ': falta cargar perfil_comportamiento_d1.txt.');
    stmts.push(env.DB.prepare(DO_INSERT_JSON).bind(JSON.stringify(filas)));
    filasTotal += filas.length;
  }
  return { stmts, filas: filasTotal };
}

// Las dos personas de Soporte de la escena: soporte1 y soporte2 si existen; si no, las primeras activas (con una sola, las dos son la misma)
async function doPersonas(env) {
  const u = (await env.DB.prepare(`SELECT id, usuario, nombre FROM usuarios WHERE activo = 1 AND perfil = 'SOPORTE'
    ORDER BY CASE WHEN usuario IN ('soporte1', 'soporte2') THEN 0 ELSE 1 END, usuario, id LIMIT 2`).all()).results;
  return { sop1: u[0] || null, sop2: u[1] || u[0] || null };
}

// Primera ventana abierta de un problema (la que representa a la alerta en el tablero y en Seguimiento)
const doGrupo = (env, tipo, s) => env.DB.prepare(`SELECT alerta_id FROM alertas_historico WHERE tipo_alerta = ?1 AND cliente_id = ?2 AND servicio_id = ?3 AND canal_id = ?4
    AND estado IN ('ABIERTA', 'RECONOCIDA') ORDER BY ventana_inicio LIMIT 1`).bind(tipo, s.cliente, s.servicio, s.canal).first();
const doEvento = (env, alertaId, fecha, quien, accion, uDest, eDest, texto) => env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, usuario_destino_id, equipo_destino_id, comentario)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(fecha, alertaId, quien, accion, uDest == null ? null : uDest, eDest == null ? null : eDest, texto == null ? null : texto);
const doAviso = (env, uid, fecha, tipo, alertaId, texto, detalle) => env.DB.prepare('INSERT INTO avisos (usuario_id, fecha, tipo, alerta_id, texto, detalle) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
  .bind(uid, fecha, tipo, alertaId, String(texto).slice(0, 300), detalle == null ? null : String(detalle).slice(0, 500));

// Dos alertas que Soporte resuelve a mano (con causa y qué se hizo): se arman justo al terminar el paso en que todavía están abiertas
const DO_RESUELTAS = {
  6: { tipo: 'IMPORTE_BAJO', serie: CLI002_PAG_MOB, a: 'sop2', derivada: [10, 55], tomada: [11, 0], resuelta: [11, 32],
       pedido: 'Los tickets de Pago de servicios Mobile vienen más chicos de lo habitual. Fijate si el cliente lanzó alguna promoción.',
       causa: 'Comportamiento esperado (promo, feriado, campaña)', accion: 'Se contactó al cliente',
       texto: 'El cliente confirmó una promoción con pagos de monto bajo hasta el mediodía.' },
  12: { tipo: 'IMPORTE_ALTO', serie: CLI001_TRF_WEB, a: 'sop1', derivada: [12, 40], tomada: [12, 45], resuelta: [13, 3],
        pedido: 'Importe de transferencias Web muy por encima de lo habitual.',
        causa: 'Falsa alarma', accion: 'No requirió acción',
        texto: 'Una empresa del cliente hizo un pago masivo programado. No hay nada que corregir.' },
};

async function doResolverAMano(env, yo, p, d) {
  const g = await doGrupo(env, d.tipo, d.serie);
  if (!g) return false;
  const quien = p[d.a];
  const actor = quien || yo;
  const fRes = doHora(...d.resuelta);
  const comentario = 'Causa: ' + d.causa + '. Se hizo: ' + d.accion + '. ' + d.texto;
  const stmts = [];
  if (quien) {
    stmts.push(doEvento(env, g.alerta_id, doHora(...d.derivada), yo.id, 'DERIVAR', quien.id, null, d.pedido));
    stmts.push(doEvento(env, g.alerta_id, doHora(...d.tomada), quien.id, 'TOMAR', null, null, null));
  }
  stmts.push(doEvento(env, g.alerta_id, fRes, actor.id, 'RESOLVER', null, null, comentario));
  stmts.push(env.DB.prepare(`UPDATE alertas_historico SET estado = 'RESUELTA', motivo_resolucion = 'MANUAL', fecha_resolucion = ?2, resuelta_por = ?3, comentario = ?4,
      causa_resolucion = ?5, acciones_resolucion = ?6, asignado_usuario_id = ?7, asignado_equipo_id = NULL, asignado_por = ?8, asignado_en = ?9, reconocida_por = ?3, fecha_reconocimiento = ?10
    WHERE ${GRUPO_ABIERTO}`).bind(g.alerta_id, fRes, actor.nombre, comentario, d.causa, d.accion, actor.id, yo.id, quien ? doHora(...d.derivada) : fRes, quien ? doHora(...d.tomada) : fRes));
  await env.DB.batch(stmts);
  return true;
}

// Último paso: deja las alertas abiertas en sus estados (sin asignar las que no se tocan)
async function doSembrar(env, yo, ini) {
  const p = await doPersonas(env);
  const equipo = await env.DB.prepare(`SELECT e.id, e.nombre FROM equipos e WHERE e.activo = 1 AND EXISTS (
      SELECT 1 FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 AND u.perfil = 'SOPORTE' WHERE m.equipo_id = e.id) ORDER BY e.id LIMIT 1`).first();
  const miembros = equipo ? (await env.DB.prepare('SELECT m.usuario_id FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 WHERE m.equipo_id = ?1').bind(equipo.id).all()).results.map((x) => x.usuario_id) : [];
  const stmts = [], estados = {};
  const asignar = (g, quienId, equipoId, fecha) => env.DB.prepare(`UPDATE alertas_historico SET asignado_usuario_id = ?2, asignado_equipo_id = ?3, asignado_por = ?4, asignado_en = ?5,
      estado = 'ABIERTA', reconocida_por = NULL, fecha_reconocimiento = NULL WHERE ${GRUPO_ABIERTO}`).bind(g.alerta_id, quienId, equipoId, yo.id, fecha);

  // Asignada a una persona y sin tomar desde hace más de 30 minutos (aparece demorada en Seguimiento)
  let g = p.sop1 && await doGrupo(env, 'RECHAZO_ALTO', CLI004_TRF_API);
  if (g) {
    const f = doHora(13, 20), txt = 'Los rechazos de Transferencias API pasaron el límite. Revisar si el antifraude cambió alguna regla.';
    stmts.push(asignar(g, p.sop1.id, null, f), doEvento(env, g.alerta_id, f, yo.id, 'DERIVAR', p.sop1.id, null, txt),
      doAviso(env, p.sop1.id, f, 'ASIGNADA', g.alerta_id, yo.nombre + ' te asignó una alerta', txt));
    estados.asignada_sin_tomar = 'RECHAZO_ALTO:CLI_004';
  }
  // En curso: derivada, tomada y con un comentario de quien la trabaja
  g = p.sop2 && await doGrupo(env, 'LATENCIA_ALTA', CLI003_RT_API);
  if (g) {
    const f1 = doHora(12, 55), f2 = doHora(13, 0);
    stmts.push(asignar(g, p.sop2.id, null, f1), doEvento(env, g.alerta_id, f1, yo.id, 'DERIVAR', p.sop2.id, null, 'La recarga de transporte por API tarda casi el doble. Hablar con el proveedor.'),
      env.DB.prepare(`UPDATE alertas_historico SET estado = 'RECONOCIDA', reconocida_por = ?2, fecha_reconocimiento = ?3 WHERE ${GRUPO_ABIERTO}`).bind(g.alerta_id, p.sop2.nombre, f2),
      doEvento(env, g.alerta_id, f2, p.sop2.id, 'TOMAR', null, null, null),
      doEvento(env, g.alerta_id, doHora(13, 35), p.sop2.id, 'COMENTAR', null, null, 'Le escribí al proveedor: están revisando un cambio de red de las 12:30.'));
    estados.en_curso = 'LATENCIA_ALTA:CLI_003';
  }
  // Devuelta: la derivaron y Soporte la devolvió con el motivo (queda sin asignar, con el último movimiento «devolvió»)
  g = p.sop1 && await doGrupo(env, 'VENTANA_FALTANTE', CLI007_RC_MOB);
  if (g) {
    const f1 = doHora(13, 0), f2 = doHora(13, 15), motivo = 'No es un problema de nuestra parte: el collector del cliente no responde. Hay que avisarle al cliente.';
    stmts.push(doEvento(env, g.alerta_id, f1, yo.id, 'DERIVAR', p.sop1.id, null, 'CLI_007 dejó de enviar datos desde las 12:30.'),
      doEvento(env, g.alerta_id, f2, p.sop1.id, 'DEVOLVER', null, null, motivo),
      doAviso(env, yo.id, f2, 'DEVUELTA', g.alerta_id, p.sop1.nombre + ' devolvió una alerta', motivo));
    estados.devuelta = 'VENTANA_FALTANTE:CLI_007';
  }
  // Asignada a un equipo (sin persona) y sin tomar
  g = equipo && await doGrupo(env, 'ERROR_ALTO', CLI002_PAG_WEB);
  if (g) {
    const f = doHora(13, 30), txt = 'Errores en Pago de servicios Web: parece el mismo gateway que CLI_006.';
    stmts.push(asignar(g, null, equipo.id, f), doEvento(env, g.alerta_id, f, yo.id, 'DERIVAR', null, equipo.id, txt),
      ...miembros.filter((x) => x !== yo.id).map((uid) => doAviso(env, uid, f, 'ASIGNADA', g.alerta_id, yo.nombre + ' asignó una alerta a tu equipo ' + equipo.nombre, txt)));
    estados.asignada_a_equipo = 'ERROR_ALTO:CLI_002';
  }
  // Se cierra el paso: las asignaciones y el reloj (14:06) como marca de «escena completa»
  stmts.push(env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'DEMO_OFICIAL_ESCENA', 'Escena cargada: ' + Object.keys(estados).length + ' estados armados'),
    env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1 WHERE id = 1').bind(isoZ(ini + DO_VENTANAS * DO_MIN + DO_SEMBRADO_MIN * 60e3)),
    env.DB.prepare(MARCAR_TABLERO));
  await env.DB.batch(stmts);
  return estados;
}

async function demoOficialSiguiente(env, yo) {
  const est = await demoOficialEstado(env);
  if (!est.preparada) throw new Error('Primero toquen "Preparar demo oficial".');
  if (est.completa) throw new Error('La escena ya está cargada. Para repetirla toquen "Preparar demo oficial".');
  const ini = Date.parse(est.inicio);
  const cargadas = est.ventanas_cargadas;

  // Último paso: las asignaciones
  if (cargadas >= DO_VENTANAS) {
    const estados = await doSembrar(env, yo, ini);
    const n = await env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM (SELECT 1 FROM alertas_historico WHERE estado IN ('ABIERTA', 'RECONOCIDA') AND severidad <> 'BAJA' GROUP BY tipo_alerta, cliente_id, servicio_id, canal_id)) AS abiertas,
        (SELECT COUNT(*) FROM (SELECT 1 FROM alertas_historico WHERE estado = 'RESUELTA' GROUP BY tipo_alerta, cliente_id, servicio_id, canal_id)) AS resueltas,
        (SELECT COUNT(*) FROM prealertas_estado) AS prealertas`).first();
    return {
      ok: true, oficial: true, listo: true, escena: 1, total: 1, titulo: DO_ESCENA.titulo, texto: DO_ESCENA.texto, acto: DO_ESCENA.acto,
      ventana_inicio: DEMO_OFICIAL_INICIO, ahora: isoZ(ini + DO_VENTANAS * DO_MIN + DO_SEMBRADO_MIN * 60e3), estados, resumen: n,
      mensaje: 'Escena cargada: ' + n.abiertas + ' alertas abiertas, ' + n.resueltas + ' resueltas y ' + n.prealertas + ' pre-alertas.',
      proceso: { registradas_o_actualizadas: 0, resueltas: 0 },
    };
  }

  // Pasos de ventanas: 6 + 6 + 4
  const hasta = DO_PASOS.find((x) => x > cargadas);
  const { stmts, filas } = await doVentanas(env, cargadas, hasta);
  const ahora = isoZ(ini + hasta * DO_MIN + 5 * 60e3);
  await env.DB.batch([...stmts, env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1 WHERE id = 1').bind(ahora)]);
  const proceso = await procesarAlertas(env);
  // Todas las ventanas del paso se revisan juntas, así que figurarían detectadas al final del paso: se deja la hora a la que las habría visto una revisión
  // normal (el fin de su ventana más la gracia). Solo cambia lo que se muestra («hace N min», «desde las…»); el motor no usa esta columna.
  await env.DB.prepare(`UPDATE alertas_historico SET primera_deteccion = strftime('%Y-%m-%dT%H:%M:%SZ', ventana_fin, '+5 minutes')
    WHERE ventana_inicio >= ?1 AND primera_deteccion > strftime('%Y-%m-%dT%H:%M:%SZ', ventana_fin, '+5 minutes')`).bind(isoZ(ini + cargadas * DO_MIN)).run();
  const resuelta = DO_RESUELTAS[hasta];
  if (resuelta) await doResolverAMano(env, yo, await doPersonas(env), resuelta);
  return {
    ok: true, oficial: true, listo: false, avance: Math.round(hasta / DO_VENTANAS * 90), ventanas: hasta, ventanas_total: DO_VENTANAS,
    ahora, filas_insertadas: filas, proceso,
  };
}
