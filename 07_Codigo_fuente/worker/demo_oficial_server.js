
// =====================================================================
// DEMO OFICIAL (parche 82). Sin SQL.
//
// Una demo pensada para presentarle Helios a un cliente: a diferencia de la demo de 22 escenas (que termina con todo normalizado y las alertas
// cerradas), acá los incidentes clave **quedan abiertos** para trabajarlos en vivo: derivar, tomar, resolver, abrir la sala de crisis, preparar el correo,
// preguntarle al agente, ver los avisos en el celular y el canal de Teams. Es un solo relato en tres actos, para mostrar con tres perfiles:
//   Acto 1 · Gerente        el dashboard: estado por cliente, disponibilidad, incidentes activos, distribución de fallas.
//   Acto 2 · Administrador  lo parametrizable: umbrales y ancho de banda por cliente, reglas, plantillas de correo (escena 12: una métrica en el borde; al ensanchar
//                           la banda, la alerta se cierra sola con la ventana siguiente: con el reloj de la demo detenido, la última ventana solo se cierra con otra).
//   Acto 3 · Analista       pre-alertas (escenas 4 y 7), avisos push, el agente, el correo, la sala de crisis y Teams (escena 9).
//
// Funciona igual que la demo de siempre (inserta ventanas de 15 minutos en core_metricas_observadas y mueve el reloj simulado), pero con su propio
// arranque (martes 27/10/2026 10:00 ARG, un día después de la demo de siempre), sus propias escenas y sus propios endpoints, así los dos modos no se pisan
// ni se ven juntos en la pantalla:
//   GET  /api/demo-oficial             estado: escena siguiente, total, inicio
//   POST /api/demo-oficial/preparar    deja todo en cero (como «Preparar demo») y pone el reloj en el arranque de la demo oficial
//   POST /api/demo-oficial/siguiente   inserta la ventana de la escena, mueve el reloj y corre el proceso de alertas
// La página es el tablero con ?demo=oficial (la demo de siempre sigue en ?demo). Permiso: el mismo de la demo (Administrador y Analista).
// =====================================================================
const DEMO_OFICIAL_INICIO = '2026-10-27T13:00:00Z';   // martes 27/10/2026 10:00 ARG

// Lo que queda abierto a partir de cada escena (sigue llegando igual en las ventanas siguientes, así la alerta no se cierra sola)
const DO_RECHAZO = [CLI004_TRF_API, 'RECHAZO_ALTO'];
const DO_LATENCIA = [CLI003_RT_API, 'LATENCIA_ALTA'];
const DO_GATEWAY = [[CLI006_PAG_API, 'SIN_EXITOS'], [CLI002_PAG_WEB, 'ERROR_ALTO'], [CLI005_PAG_MOB, 'ERROR_ALTO']];
const DO_SILENCIO = [CLI007_RC_MOB, 'FALTANTE'];
const DO_BORDE = [CLI001_TRF_WEB, 'RAMPA_RECHAZO', 1.25];   // rechazos un 25 % por encima del límite del modelo: con la banda de fábrica alerta, con una banda 40 % más ancha no

const DEMO_OFICIAL_ESCENAS = [
  { acto: 'Acto 1 · Gerente', titulo: 'Arranca la guardia',
    texto: 'Las 13 series envían dentro de lo esperado. Como Gerente: el tablero en verde, «Estado por cliente» y la disponibilidad al 100 %.', eventos: [] },
  { acto: 'Acto 1 · Gerente', titulo: 'La app de CLI_001 se queda muda',
    texto: 'Transferencias Mobile cae al 45 % de lo habitual. Aparece la primera alerta: mirá cómo cambia «Estado por cliente» y la disponibilidad de CLI_001.',
    eventos: [[CLI001_TRF_MOB, 'VOLUMEN_BAJO']] },
  { acto: 'Acto 1 · Gerente', titulo: 'CLI_001 se recupera solo',
    texto: 'La ventana llega normal y la alerta se cierra sola (queda en el histórico). En CLI_004 los rechazos empiezan a subir, todavía dentro de la banda: ningún aviso.',
    eventos: [[CLI004_TRF_API, 'RAMPA_RECHAZO', 0.45]] },
  { acto: 'Acto 3 · Analista', titulo: 'Pre-alerta en CLI_004',
    texto: 'Los rechazos usan el 80 % del margen y vienen subiendo: el sistema avisa antes de que haya alerta. Como Analista: «Pre-alertas» y «Avisar a Soporte» (le llega el aviso al celular).',
    eventos: [[CLI004_TRF_API, 'RAMPA_RECHAZO', 0.8]] },
  { acto: 'Acto 3 · Analista', titulo: 'Se confirma: rechazo alto en CLI_004',
    texto: 'El antifraude rechaza de más: la pre-alerta queda confirmada y se abre la alerta (queda abierta hasta que alguien la resuelva). Derivala a Soporte y mirá el aviso push.',
    eventos: [DO_RECHAZO] },
  { acto: 'Acto 3 · Analista', titulo: 'La latencia de CLI_003 empieza a subir',
    texto: 'Recarga de transporte por API tarda más de lo normal, todavía dentro de la banda. El rechazo de CLI_004 sigue abierto.',
    eventos: [DO_RECHAZO, [CLI003_RT_API, 'RAMPA_LATENCIA', 0.45]] },
  { acto: 'Acto 3 · Analista', titulo: 'Pre-alerta: recargas lentas',
    texto: 'La latencia de CLI_003 viene subiendo y ya usa el 80 % del margen: segunda pre-alerta. Preguntale al agente: «¿Qué pre-alertas conviene avisar a Soporte?».',
    eventos: [DO_RECHAZO, [CLI003_RT_API, 'RAMPA_LATENCIA', 0.8]] },
  { acto: 'Acto 3 · Analista', titulo: 'Se confirma: latencia alta en CLI_003',
    texto: 'El proveedor tarda casi el doble. Quedan dos alertas abiertas con sus pre-alertas confirmadas. Preguntale al agente: «Resumen del turno».',
    eventos: [DO_RECHAZO, DO_LATENCIA] },
  { acto: 'Acto 3 · Analista', titulo: 'Se cae el gateway de pagos',
    texto: 'Ningún pago de servicios por API se aprueba en CLI_006 y suben los errores en CLI_002 y CLI_005: es el mismo gateway. Como Analista: «Abrir sala de crisis» en la alerta grave de CLI_006, sumá las otras dos y tocá «Chat en Teams».',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY] },
  { acto: 'Acto 3 · Analista', titulo: 'El gateway sigue caído',
    texto: 'En la sala, preguntale al agente «¿Qué reviso primero?»: propone tareas con la guía de diagnóstico y el Analista las confirma. Preparar correo al proveedor con una plantilla y «Comunicar incidente» a los equipos. En Teams: @Gemma IM-4 ¿qué reviso primero?',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY] },
  { acto: 'Acto 1 · Gerente', titulo: 'CLI_007 deja de enviar',
    texto: 'Pasada la gracia no llegó la ventana de CLI_007: el silencio también es una alerta. Como Gerente: «Incidentes activos ahora» y quién está trabajando cada uno (todo en solo lectura).',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY, DO_SILENCIO] },
  { acto: 'Acto 2 · Administrador', titulo: 'Una métrica en el borde',
    texto: 'CLI_001 Transferencias Web: los rechazos pasan apenas el límite del modelo y se abre una alerta discutible. Como Administrador: Umbrales > CLI_001 > ancho de banda de las tasas a 140 %. El cambio rige desde la próxima ventana («Recalcular 24 h» lo aplica también a lo que ya pasó): tocá «Siguiente escena» y esa alerta se cierra sola.',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY, DO_SILENCIO, DO_BORDE] },
  { acto: 'Acto 1 · Gerente', titulo: 'Llega un cliente nuevo',
    texto: 'CLI_008 manda su primera ventana: no tiene historia para comparar (aparece como «cliente nuevo», sin alerta de gravedad). Si ya ajustaste la banda de CLI_001, su alerta en el borde se cerró sola con esta ventana.',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY, DO_SILENCIO, DO_BORDE, [CLI008_TRF_MOB, 'NUEVO']] },
  { acto: 'Acto 1 · Gerente', titulo: 'Estado final: incidentes en curso',
    texto: 'Sin cierre mágico: el gateway, el rechazo de CLI_004, la latencia de CLI_003 y el silencio de CLI_007 siguen abiertos. Cerrá con el dashboard del Gerente (Disponibilidad, Distribución de fallas) y resolvé alguno en vivo con su causa.',
    eventos: [DO_RECHAZO, DO_LATENCIA, ...DO_GATEWAY, DO_SILENCIO, DO_BORDE] },
];

async function demoOficialEstado(env) {
  const r = await env.DB.prepare(Q_DEMO_RELOJ).first();
  const ini = Date.parse(DEMO_OFICIAL_INICIO);
  const ahora = r && r.ahora ? Date.parse(r.ahora) : null;
  const preparada = ahora != null && ahora >= ini && ahora < ini + 864e5;
  const n = preparada ? Math.floor((ahora - ini) / (15 * 60e3)) : 0;
  const sig = DEMO_OFICIAL_ESCENAS[n];
  return {
    ok: true, oficial: true, preparada, inicio: DEMO_OFICIAL_INICIO, total: DEMO_OFICIAL_ESCENAS.length,
    escena: n,                       // escenas ya mostradas
    siguiente: sig ? { numero: n + 1, titulo: sig.titulo, texto: sig.texto, acto: sig.acto, ventana_inicio: isoZ(ini + n * 15 * 60e3) } : null,
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

async function demoOficialSiguiente(env) {
  const est = await demoOficialEstado(env);
  if (!est.preparada) throw new Error('Primero toquen "Preparar demo oficial".');
  if (!est.siguiente) throw new Error('La demo oficial ya terminó. Para repetirla toquen "Preparar demo oficial".');
  const escena = DEMO_OFICIAL_ESCENAS[est.escena];
  const iniMs = Date.parse(est.inicio) + est.escena * 15 * 60e3;
  const finMs = iniMs + 15 * 60e3;

  const esperadas = (await env.DB.prepare(Q_DEMO_PERFIL).bind(isoZ(iniMs)).all()).results;
  const vistas = new Set(), filas = [], detalle = [];
  let numero = 0;
  for (const e of esperadas) {
    const k = e.cliente_id + '|' + e.servicio_id + '|' + e.canal_id;
    if (vistas.has(k)) continue;
    vistas.add(k);
    const serie = { cliente: e.cliente_id, servicio: e.servicio_id, canal: e.canal_id, n: ++numero };
    const ev = escena.eventos.find(([s]) => mismaSerie(e, s));
    if (ev && ev[1] === 'FALTANTE') { detalle.push({ serie: k, evento: 'FALTANTE' }); continue; }
    const fila = filaDemo(e, serie, ev ? ev[1] : null, ev ? ev[2] : 0, iniMs);
    filas.push(fila);
    if (ev) detalle.push({ serie: k, evento: ev[1], esperado: Math.round(e.cantidad_total_esperada), llega: fila[11] });
  }
  // Serie nueva sin perfil (CLI_008): se basa en lo esperado de CLI_001 Mobile
  const nuevo = escena.eventos.find(([, t]) => t === 'NUEVO');
  if (nuevo) {
    const base = esperadas.find((e) => mismaSerie(e, CLI001_TRF_MOB)) || esperadas[0];
    if (base) {
      const s = { ...nuevo[0], n: ++numero };
      filas.push(filaDemo(base, s, 'NUEVO', 0, iniMs));
      detalle.push({ serie: s.cliente + '|' + s.servicio + '|' + s.canal, evento: 'NUEVO' });
    }
  }
  if (!filas.length) throw new Error('No hay perfil de comportamiento para la ventana ' + isoZ(iniMs) + ': falta cargar perfil_comportamiento_d1.txt.');

  const ahora = isoZ(finMs + 5 * 60e3);
  await env.DB.batch([
    ...filas.map((f) => env.DB.prepare(INSERT_OBSERVADA).bind(...f)),
    env.DB.prepare('UPDATE alerta_parametros SET ahora = ?1 WHERE id = 1').bind(ahora),
  ]);
  const proceso = await procesarAlertas(env);
  return {
    ok: true, oficial: true, escena: est.escena + 1, total: DEMO_OFICIAL_ESCENAS.length,
    titulo: escena.titulo, texto: escena.texto, acto: escena.acto, ventana_inicio: isoZ(iniMs), ahora,
    filas_insertadas: filas.length, eventos: detalle, proceso,
  };
}
