
// =====================================================================
// MODO DEMO (botones "Preparar demo" y "Siguiente escena")
//
// Simula, ventana por ventana, lo que mandarían los clientes. No usa tablas
// de demo: inserta en core_metricas_observadas y mueve el reloj simulado
// (alerta_parametros.ahora). Los valores "normales" salen de la predicción
// vigente de cada serie (core_metricas_esperadas).
//
// La demo arranca en DEMO_INICIO, que tiene que coincidir con la carga baseline
// (carga_baseline_demo_consola.txt): historia hasta el sábado 24/10, modelo
// para domingo 25 y lunes 26, y datos normales hasta el lunes 26 a las 10:00 ARG.
//
//   GET  /api/demo            estado: escena siguiente, total, inicio
//   POST /api/demo/preparar   borra las alertas y las observadas desde DEMO_INICIO
//                             (solo las de la demo) y pone el reloj en DEMO_INICIO
//   POST /api/demo/siguiente  inserta la ventana de la escena, mueve el reloj
//                             y corre el proceso de alertas
// =====================================================================

const S = (cliente, servicio, canal) => ({ cliente, servicio, canal });
const CLI001_TRF_MOB = S('CLI_001', 'TRANSFERENCIAS', 'MOBILE');
const CLI001_TRF_WEB = S('CLI_001', 'TRANSFERENCIAS', 'WEB');
const CLI002_PAG_WEB = S('CLI_002', 'PAGO_SERVICIOS', 'WEB');
const CLI002_PAG_MOB = S('CLI_002', 'PAGO_SERVICIOS', 'MOBILE');
const CLI003_RC_MOB = S('CLI_003', 'RECARGA_CELULAR', 'MOBILE');
const CLI003_RT_API = S('CLI_003', 'RECARGA_TRANSPORTE', 'API');
const CLI004_TRF_API = S('CLI_004', 'TRANSFERENCIAS', 'API');
const CLI004_RC_WEB = S('CLI_004', 'RECARGA_CELULAR', 'WEB');
const CLI005_PAG_MOB = S('CLI_005', 'PAGO_SERVICIOS', 'MOBILE');
const CLI005_RT_MOB = S('CLI_005', 'RECARGA_TRANSPORTE', 'MOBILE');
const CLI006_TRF_MOB = S('CLI_006', 'TRANSFERENCIAS', 'MOBILE');
const CLI006_PAG_API = S('CLI_006', 'PAGO_SERVICIOS', 'API');
const CLI007_RC_MOB = S('CLI_007', 'RECARGA_CELULAR', 'MOBILE');
const CLI008_TRF_MOB = S('CLI_008', 'TRANSFERENCIAS', 'MOBILE');

// Cada escena es una ventana de 15 minutos. "eventos" dice qué serie se
// aparta de lo normal y cómo (m = margen consumido para las rampas: 0 es lo
// esperado y 1 el umbral).
const DEMO_ESCENAS = [
  { titulo: 'Arranca la guardia', texto: 'Todas las series envían su ventana dentro de lo esperado.', eventos: [] },
  { titulo: 'La app de CLI_001 se queda muda', texto: 'Transferencias Mobile cae al 45 % de lo habitual.', eventos: [[CLI001_TRF_MOB, 'VOLUMEN_BAJO']] },
  { titulo: 'CLI_001 se recupera solo', texto: 'La ventana llega normal y la alerta se cierra sola.', eventos: [] },
  { titulo: 'Promo de recarga de transporte', texto: 'CLI_005 recibe 60 % más de recargas que lo normal (dura 30 min).', eventos: [[CLI005_RT_MOB, 'VOLUMEN_ALTO']] },
  { titulo: 'Suben los rechazos de CLI_004', texto: 'Todavía dentro de la banda: ningún aviso. La promo sigue.', eventos: [[CLI005_RT_MOB, 'VOLUMEN_ALTO'], [CLI004_TRF_API, 'RAMPA_RECHAZO', 0.45]] },
  { titulo: 'Pre-alerta en CLI_004', texto: 'Los rechazos usan el 80 % del margen y vienen subiendo: el sistema avisa antes de la alerta.', eventos: [[CLI004_TRF_API, 'RAMPA_RECHAZO', 0.8]] },
  { titulo: 'Se confirma: rechazo alto en CLI_004', texto: 'El antifraude rechaza de más. La pre-alerta queda confirmada. Dura una hora.', eventos: [[CLI004_TRF_API, 'RECHAZO_ALTO']] },
  { titulo: 'Falla el gateway de CLI_002', texto: 'Errores técnicos en Pago de servicios Web (dura 30 min).', eventos: [[CLI004_TRF_API, 'RECHAZO_ALTO'], [CLI002_PAG_WEB, 'ERROR_ALTO']] },
  { titulo: 'CLI_006 aprueba menos', texto: 'Suben un poco rechazos y errores a la vez y la aprobación cae bajo el mínimo. En CLI_005 Recarga transporte los errores empiezan a subir.', eventos: [[CLI004_TRF_API, 'RECHAZO_ALTO'], [CLI002_PAG_WEB, 'ERROR_ALTO'], [CLI006_TRF_MOB, 'APROBACION_BAJA'], [CLI005_RT_MOB, 'RAMPA_ERROR', 0.45]] },
  { titulo: 'Transferencias fuera de lo común', texto: 'CLI_001 Web con importe muy superior al habitual. Pre-alerta: los errores de CLI_005 vienen subiendo.', eventos: [[CLI004_TRF_API, 'RECHAZO_ALTO'], [CLI001_TRF_WEB, 'IMPORTE_ALTO'], [CLI005_RT_MOB, 'RAMPA_ERROR', 0.8]] },
  { titulo: 'Tickets más chicos', texto: 'CLI_002 Mobile con importe muy por debajo. CLI_005 se normaliza (su pre-alerta queda en observación y después no se cumple) y la latencia de CLI_003 empieza a subir. Se cierra el antifraude de CLI_004.', eventos: [[CLI002_PAG_MOB, 'IMPORTE_BAJO'], [CLI003_RT_API, 'RAMPA_LATENCIA', 0.45]] },
  { titulo: 'Pre-alerta: recargas lentas', texto: 'La latencia de CLI_003 viene subiendo y ya usa el 80 % del margen.', eventos: [[CLI003_RT_API, 'RAMPA_LATENCIA', 0.8]] },
  { titulo: 'Se confirma: latencia alta en CLI_003', texto: 'El proveedor tarda casi el doble. Dura una hora.', eventos: [[CLI003_RT_API, 'LATENCIA_ALTA']] },
  { titulo: 'Caída total en CLI_006', texto: 'Ningún pago de servicios por API se aprueba (dura 30 min).', eventos: [[CLI003_RT_API, 'LATENCIA_ALTA'], [CLI006_PAG_API, 'SIN_EXITOS']] },
  { titulo: 'El dato llega tarde', texto: 'El collector de CLI_003 Recarga celular manda la ventana 12 minutos tarde.', eventos: [[CLI003_RT_API, 'LATENCIA_ALTA'], [CLI006_PAG_API, 'SIN_EXITOS'], [CLI003_RC_MOB, 'DATO_TARDIO']], tardio: true },
  { titulo: 'Un bug informa mal la tasa', texto: 'CLI_005 Pago de servicios informa una aprobación que no coincide con sus cantidades.', eventos: [[CLI003_RT_API, 'LATENCIA_ALTA'], [CLI005_PAG_MOB, 'DATO_INCONSISTENTE']] },
  { titulo: 'Llega un cliente nuevo', texto: 'CLI_008 manda su primera ventana: no tiene historia para comparar.', eventos: [[CLI008_TRF_MOB, 'NUEVO']] },
  { titulo: 'CLI_007 deja de enviar', texto: 'Pasada la gracia no llegó su ventana: el silencio también es una alerta.', eventos: [[CLI007_RC_MOB, 'FALTANTE']] },
  { titulo: 'Cierre de la guardia', texto: 'Todo vuelve a la normalidad y se cierran las alertas pendientes.', eventos: [] },
];

// Lunes 26/10/2026 10:00 ARG (13:00 UTC): primera ventana de la demo
const DEMO_INICIO = '2026-10-26T13:00:00Z';
const Q_DEMO_RELOJ = 'SELECT ahora FROM alerta_parametros WHERE id = 1';

const Q_DEMO_ESPERADAS = `
SELECT * FROM core_metricas_esperadas
WHERE estado_prediccion = 'ACTIVA'
  AND julianday(ventana_inicio) = julianday(?1)
ORDER BY cliente_id, servicio_id, canal_id, julianday(fecha_generacion) DESC
`;

const INSERT_OBSERVADA = `
INSERT OR REPLACE INTO core_metricas_observadas (
    metrica_id, recepcion_id, lote_id, collector_id,
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_total, cantidad_exitos, cantidad_rechazos, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error,
    importe_total, importe_promedio, tiempo_respuesta_promedio, tiempo_respuesta_maximo,
    ultimo_evento_exitoso, origen_dato, schema_version, fecha_recepcion
) VALUES (?1, ?2, ?3, 'COLLECTOR-LOCAL-001', ?4, ?5, 15, ?6, ?7, ?8, ?9, ?10, ?11,
          ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, 'API', '1.0', ?24)
`;

const isoMs = (ms) => new Date(ms).toISOString();                    // 2026-10-24T16:30:00.000Z
const isoZ = (ms) => new Date(ms).toISOString().slice(0, 19) + 'Z';  // 2026-10-24T16:30:00Z
const sello = (ms) => isoZ(ms).replace(/[-:T]/g, '').slice(0, 12);   // 202610241630
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const mismaSerie = (e, s) => e.cliente_id === s.cliente && e.servicio_id === s.servicio && e.canal_id === s.canal;

// Arma la ventana observada de una serie: lo esperado, con el evento aplicado
function filaDemo(e, serie, evento, m, iniMs) {
  const finMs = iniMs + 15 * 60e3;
  let tot = Math.round(e.cantidad_total_esperada);
  let ap = e.tasa_aprobacion_esperada, re = e.tasa_rechazo_esperada, er = e.tasa_error_esperada;
  let imp = e.importe_total_esperado, lat = e.tiempo_respuesta_esperado;
  let recepcion = finMs + 40e3, desfaseTasa = 0, exacto = true;
  switch (evento) {
    case 'VOLUMEN_BAJO': tot = Math.round(tot * 0.45); break;
    case 'VOLUMEN_ALTO': tot = Math.round(tot * 1.6); break;
    case 'RECHAZO_ALTO': er = 0; re = (e.tasa_rechazo_maxima + (1 - e.tasa_aprobacion_minima)) / 2; ap = 1 - re; exacto = false; break;
    case 'ERROR_ALTO': re = 0; er = (e.tasa_error_maxima + (1 - e.tasa_aprobacion_minima)) / 2; ap = 1 - er; exacto = false; break;
    case 'RAMPA_RECHAZO': { const d = m * (e.tasa_rechazo_maxima - e.tasa_rechazo_esperada); re += d; er = Math.max(0, er - d); ap = 1 - re - er; exacto = false; break; }
    case 'RAMPA_ERROR': { const d = m * (e.tasa_error_maxima - e.tasa_error_esperada); er += d; re = Math.max(0, re - d); ap = 1 - re - er; exacto = false; break; }
    case 'APROBACION_BAJA': { ap = e.tasa_aprobacion_minima - 0.004; const resto = 1 - ap; re = Math.min(e.tasa_rechazo_maxima - 0.001, resto); er = resto - re; exacto = false; break; }
    case 'SIN_EXITOS': ap = 0; re = 0; er = 1; exacto = false; break;
    case 'IMPORTE_ALTO': imp = e.importe_total_maximo * 1.3; break;
    case 'IMPORTE_BAJO': imp = e.importe_total_minimo * 0.6; break;
    case 'LATENCIA_ALTA': lat = e.tiempo_respuesta_esperado * 1.8; break;
    case 'RAMPA_LATENCIA': lat = e.tiempo_respuesta_esperado + m * (e.tiempo_respuesta_maximo - e.tiempo_respuesta_esperado); break;
    case 'DATO_TARDIO': recepcion = finMs + 12 * 60e3; break;
    case 'DATO_INCONSISTENTE': desfaseTasa = -0.05; break;
    case 'NUEVO': tot = Math.round(tot * 0.33); imp = imp * 0.33; break;
  }
  // En las ventanas normales se redondea hacia abajo rechazos y errores, para
  // no consumir margen por redondeo (evita pre-alertas falsas con poco volumen)
  const rc = exacto ? Math.floor(tot * re) : Math.round(tot * re);
  let err = exacto ? Math.floor(tot * er) : Math.round(tot * er);
  let rech = rc, ex = tot - rech - err;
  if (!exacto) { ex = Math.round(tot * ap); err = tot - ex - rech; if (err < 0) { rech += err; err = 0; } }
  const n = (serie.n < 10 ? '0' : '') + serie.n;
  return [
    'MET-DEMO-' + sello(iniMs) + '-' + n, 'REC-DEMO-' + sello(finMs), 'LOTE-DEMO-' + sello(iniMs).slice(0, 8) + '-001',
    isoMs(iniMs), isoMs(finMs),
    serie.cliente, serie.servicio, e.producto_id, serie.canal, e.moneda_id, e.ambiente,
    tot, ex, rech, err,
    tot ? Math.min(1, Math.max(0, r6(ex / tot + desfaseTasa))) : null,
    tot ? r6(rech / tot) : null,
    tot ? r6(err / tot) : null,
    Math.round(imp * 100) / 100,
    tot ? Math.round(imp / tot * 100) / 100 : null,
    tot ? Math.round(lat * 10) / 10 : null,
    tot ? Math.round(lat * 2.2) : null,
    ex > 0 ? isoMs(finMs - 7e3) : null,
    isoMs(recepcion),
  ];
}

async function demoEstado(env) {
  const r = await env.DB.prepare(Q_DEMO_RELOJ).first();
  const ini = Date.parse(DEMO_INICIO);
  const ahora = r && r.ahora ? Date.parse(r.ahora) : null;
  const preparada = ahora != null && ahora >= ini && ahora < ini + 2 * 864e5;
  const n = preparada ? Math.floor((ahora - ini) / (15 * 60e3)) : 0;
  const sig = DEMO_ESCENAS[n];
  return {
    ok: true, preparada, inicio: DEMO_INICIO, total: DEMO_ESCENAS.length,
    escena: n,                       // escenas ya mostradas
    siguiente: sig ? { numero: n + 1, titulo: sig.titulo, texto: sig.texto, ventana_inicio: isoZ(ini + n * 15 * 60e3) } : null,
  };
}

async function demoPreparar(env) {
  const res = await env.DB.batch([
    env.DB.prepare('DELETE FROM alertas_historico'),
    // Compara el texto (sin la Z) para usar el índice por ventana_inicio
    env.DB.prepare('DELETE FROM core_metricas_observadas WHERE ventana_inicio >= ?1').bind(DEMO_INICIO.slice(0, 19)),
    env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1, horizonte_horas = 24 WHERE id = 1').bind(DEMO_INICIO),
    env.DB.prepare('UPDATE alerta_reglas SET activa = 1'),
  ]);
  return { ...(await demoEstado(env)), alertas_borradas: res[0].meta.changes, observadas_borradas: res[1].meta.changes };
}

async function demoSiguiente(env) {
  const est = await demoEstado(env);
  if (!est.preparada) throw new Error('Primero toquen "Preparar demo".');
  if (!est.siguiente) throw new Error('La demo ya terminó. Para repetirla toquen "Preparar demo".');
  const escena = DEMO_ESCENAS[est.escena];
  const iniMs = Date.parse(est.inicio) + est.escena * 15 * 60e3;
  const finMs = iniMs + 15 * 60e3;

  const esperadas = (await env.DB.prepare(Q_DEMO_ESPERADAS).bind(isoZ(iniMs)).all()).results;
  const vistas = new Set(), filas = [], detalle = [];
  let numero = 0;
  for (const e of esperadas) {
    const k = e.cliente_id + '|' + e.servicio_id + '|' + e.canal_id;
    if (vistas.has(k)) continue;             // una predicción por serie (la más reciente)
    vistas.add(k);
    const serie = { cliente: e.cliente_id, servicio: e.servicio_id, canal: e.canal_id, n: ++numero };
    const ev = escena.eventos.find(([s]) => mismaSerie(e, s));
    if (ev && ev[1] === 'FALTANTE') { detalle.push({ serie: k, evento: 'FALTANTE' }); continue; }
    const fila = filaDemo(e, serie, ev ? ev[1] : null, ev ? ev[2] : 0, iniMs);
    filas.push(fila);
    if (ev) detalle.push({ serie: k, evento: ev[1], esperado: Math.round(e.cantidad_total_esperada), llega: fila[11] });
  }
  // Serie nueva sin predicción (CLI_008): se basa en lo esperado de CLI_001 Mobile
  const nuevo = escena.eventos.find(([, t]) => t === 'NUEVO');
  if (nuevo) {
    const base = esperadas.find((e) => mismaSerie(e, CLI001_TRF_MOB)) || esperadas[0];
    if (base) {
      const s = { ...nuevo[0], n: ++numero };
      filas.push(filaDemo(base, s, 'NUEVO', 0, iniMs));
      detalle.push({ serie: s.cliente + '|' + s.servicio + '|' + s.canal, evento: 'NUEVO' });
    }
  }
  if (!filas.length) throw new Error('No hay predicciones para la ventana ' + isoZ(iniMs) + '.');

  const ahora = isoZ(finMs + (escena.tardio ? 14 : 5) * 60e3);
  await env.DB.batch([
    ...filas.map((f) => env.DB.prepare(INSERT_OBSERVADA).bind(...f)),
    env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1 WHERE id = 1').bind(ahora),
  ]);
  const proceso = await procesarAlertas(env);
  return {
    ok: true, escena: est.escena + 1, total: DEMO_ESCENAS.length,
    titulo: escena.titulo, texto: escena.texto, ventana_inicio: isoZ(iniMs), ahora,
    filas_insertadas: filas.length, eventos: detalle, proceso,
  };
}
