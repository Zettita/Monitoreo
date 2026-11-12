// =====================================================================
// Worker API de solo lectura para Power BI - DEMO DE MONITOREO (D1)
//
// Endpoints (todos devuelven {"columns": [...], "rows": [[...], ...]}):
//   GET /api/alertas      alertas_historico + regla + campos calculados
//   GET /api/incidentes   v_incidentes
//   GET /api/comparacion  v_comparacion (observado vs esperado por ventana)
//   GET /api/estado       una fila: "datos al", alertas activas, última ventana
//   GET /api/prealertas   v_prealertas (pre-alertas por tendencia de las últimas 48 h)
//   GET /                 público, sin datos (sirve para el "test connection"
//                         del servicio de Power BI)
//
// Filtros opcionales en alertas, incidentes, comparacion y prealertas:
//   ?desde=2026-10-05            inclusivo, en UTC (también 2026-10-05T15:00:00Z)
//   ?hasta=2026-10-06            exclusivo, en UTC
//   ?ambiente=PROD
//
// Seguridad: header  Authorization: Bearer <API_TOKEN>
//
// wrangler.toml:
//   name = "api-alertas"
//   main = "worker_api_powerbi.js"
//   compatibility_date = "2026-10-01"
//
//   [[d1_databases]]
//   binding = "DB"
//   database_name = "<NOMBRE_DB>"
//   database_id = "<ID_DE_LA_BASE>"
//
//   [vars]
//   TZ_OFFSET_HORAS = "-3"     # huso de las fechas de los DATOS (ventanas, alertas, incidentes)
//   TZ_OFFSET_RELOJ = "-3"     # huso de la hora REAL del servidor ("datos al", generado_en, recepción)
//   Con datos reales en UTC, los dos van en -3. Con datos de muestra ya en hora
//   local, TZ_OFFSET_HORAS = "0" y TZ_OFFSET_RELOJ = "-3".
//
//   Secreto:  npx wrangler secret put API_TOKEN
//
// El formato columns/rows hace que Power BI arme la tabla con sus columnas
// aunque el resultado venga vacío.
// =====================================================================

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const FECHA_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?Z?)?$/;
const AMBIENTES = new Set(["DESA", "TEST", "QA", "PROD"]);

function offsetHoras(valor, porDefecto = -3) {
  const n = parseInt(valor ?? String(porDefecto), 10);
  return Number.isFinite(n) && n >= -14 && n <= 14 ? n : porDefecto;
}

// Convierte una fecha ISO UTC a texto local "YYYY-MM-DD HH:MM:SS" (Power BI la toma como datetime)
const local = (expr, off) => `strftime('%Y-%m-%d %H:%M:%S', ${expr}, '${off} hours')`;

const ORDEN_SEVERIDAD = (col) =>
  `CASE ${col} WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 WHEN 'BAJA' THEN 4 END`;

const CLAVE_SERIE = (t) =>
  `${t}.ambiente || '|' || ${t}.cliente_id || '|' || ${t}.servicio_id || '|' || ${t}.producto_id || '|' || ` +
  `${t}.canal_id || '|' || ${t}.moneda_id || '|' || ${t}.duracion_ventana_minutos`;

const AHORA_SQL = `(SELECT COALESCE(ahora, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) FROM alerta_parametros WHERE id = 1)`;

// Arma "SELECT expr AS alias, ..." a partir de una lista [alias, expr]
const select = (cols) => cols.map(([alias, expr]) => `${expr} AS ${alias}`).join(",\n  ");

function filtros(url) {
  const desde = url.searchParams.get("desde");
  const hasta = url.searchParams.get("hasta");
  const ambiente = url.searchParams.get("ambiente");
  if (desde && !FECHA_RE.test(desde)) throw new ErrorParametro("desde inválido");
  if (hasta && !FECHA_RE.test(hasta)) throw new ErrorParametro("hasta inválido");
  if (ambiente && !AMBIENTES.has(ambiente)) throw new ErrorParametro("ambiente inválido");
  return [desde || null, hasta || null, ambiente || null];
}

// Condición estándar de filtros (?1 desde, ?2 hasta, ?3 ambiente)
const WHERE_FILTROS = (colFecha, colAmbiente) => `
      (?1 IS NULL OR julianday(${colFecha}) >= julianday(?1))
  AND (?2 IS NULL OR julianday(${colFecha}) <  julianday(?2))
  AND (?3 IS NULL OR ${colAmbiente} = ?3)`;

class ErrorParametro extends Error {}

// ---------------------------------------------------------------------
// Definición de endpoints
// ---------------------------------------------------------------------
function endpoints(off, offReloj) {
  return {
    // -------------------------------------------------------------------
    alertas: {
      usaFiltros: true,
      columnas: [
        ["alerta_id", "h.alerta_id"],
        ["tipo_alerta", "h.tipo_alerta"],
        ["grupo", "r.grupo"],
        ["descripcion_regla", "r.descripcion"],
        ["clave_serie", CLAVE_SERIE("h")],
        ["ambiente", "h.ambiente"],
        ["cliente_id", "h.cliente_id"],
        ["servicio_id", "h.servicio_id"],
        ["producto_id", "h.producto_id"],
        ["canal_id", "h.canal_id"],
        ["moneda_id", "h.moneda_id"],
        ["duracion_ventana_minutos", "h.duracion_ventana_minutos"],
        ["ventana_inicio", local("h.ventana_inicio", off)],
        ["ventana_fin", local("h.ventana_fin", off)],
        ["metrica", "h.metrica"],
        ["severidad", "h.severidad"],
        ["severidad_orden", ORDEN_SEVERIDAD("h.severidad")],
        ["severidad_maxima", "h.severidad_maxima"],
        ["severidad_maxima_orden", ORDEN_SEVERIDAD("h.severidad_maxima")],
        ["valor_observado", "h.valor_observado"],
        ["valor_esperado", "h.valor_esperado"],
        ["umbral", "h.umbral"],
        ["desvio", "h.desvio"],
        ["estado", "h.estado"],
        ["estado_orden", "CASE h.estado WHEN 'ABIERTA' THEN 1 WHEN 'RECONOCIDA' THEN 2 ELSE 3 END"],
        ["activa", "CASE WHEN h.estado <> 'RESUELTA' THEN 1 ELSE 0 END"],
        ["primera_deteccion", local("h.primera_deteccion", off)],
        ["ultima_deteccion", local("h.ultima_deteccion", off)],
        ["cantidad_detecciones", "h.cantidad_detecciones"],
        ["cantidad_reaperturas", "h.cantidad_reaperturas"],
        ["fecha_reconocimiento", local("h.fecha_reconocimiento", off)],
        ["reconocida_por", "h.reconocida_por"],
        ["fecha_resolucion", local("h.fecha_resolucion", off)],
        ["motivo_resolucion", "h.motivo_resolucion"],
        ["resuelta_por", "h.resuelta_por"],
        ["comentario", "h.comentario"],
        // 1 = activa y su ventana todavía está dentro del horizonte que mira el proceso (24 h).
        // Una activa con vigente = 0 quedó "colgada": el proceso ya no la puede cerrar sola.
        ["vigente",
          `CASE WHEN h.estado <> 'RESUELTA' AND julianday(h.ventana_fin) >= julianday(${AHORA_SQL}) - (SELECT horizonte_horas FROM alerta_parametros WHERE id = 1) / 24.0 THEN 1 ELSE 0 END`],
        // Minutos desde la primera detección hasta la resolución (o hasta "ahora" si sigue activa)
        ["minutos_abierta",
          `MAX(0, ROUND((julianday(COALESCE(h.fecha_resolucion, ${AHORA_SQL})) - julianday(h.primera_deteccion)) * 1440, 1))`],
        // Minutos desde que empezó el problema (inicio de la ventana) hasta la resolución o "ahora"
        ["minutos_resolucion",
          `MAX(0, ROUND((julianday(COALESCE(h.fecha_resolucion, ${AHORA_SQL})) - julianday(h.ventana_inicio)) * 1440, 1))`],
        ["metrica_id", "h.metrica_id"],
        ["prediccion_id", "h.prediccion_id"],
      ],
      desde: `
FROM alertas_historico h
LEFT JOIN alerta_reglas r
       ON r.regla = CASE WHEN h.tipo_alerta IN ('IMPORTE_ALTO', 'IMPORTE_BAJO')
                         THEN 'IMPORTE_FUERA_DE_BANDA' ELSE h.tipo_alerta END
WHERE ${WHERE_FILTROS("h.ventana_inicio", "h.ambiente")}
ORDER BY estado_orden, severidad_orden, h.ventana_inicio DESC`,
    },

    // -------------------------------------------------------------------
    incidentes: {
      usaFiltros: true,
      columnas: [
        ["tipo_alerta", "i.tipo_alerta"],
        ["clave_serie", CLAVE_SERIE("i")],
        ["ambiente", "i.ambiente"],
        ["cliente_id", "i.cliente_id"],
        ["servicio_id", "i.servicio_id"],
        ["producto_id", "i.producto_id"],
        ["canal_id", "i.canal_id"],
        ["moneda_id", "i.moneda_id"],
        ["duracion_ventana_minutos", "i.duracion_ventana_minutos"],
        ["estado_incidente", "i.estado_incidente"],
        ["severidad_maxima", "i.severidad_maxima"],
        ["severidad_maxima_orden", ORDEN_SEVERIDAD("i.severidad_maxima")],
        ["inicio", local("i.inicio", off)],
        ["ultima_ventana_afectada", local("i.ultima_ventana_afectada", off)],
        ["primera_deteccion", local("i.primera_deteccion", off)],
        ["fecha_resolucion", local("i.fecha_resolucion", off)],
        ["motivo_resolucion", "i.motivo_resolucion"],
        ["ventanas_afectadas", "i.ventanas_afectadas"],
        ["duracion_minutos", "i.duracion_minutos"],
      ],
      desde: `
FROM v_incidentes i
WHERE ${WHERE_FILTROS("i.inicio", "i.ambiente")}
ORDER BY i.inicio DESC`,
    },

    // -------------------------------------------------------------------
    comparacion: {
      usaFiltros: true,
      columnas: [
        ["metrica_id", "c.metrica_id"],
        ["prediccion_id", "c.prediccion_id"],
        ["clave_serie", CLAVE_SERIE("c")],
        ["ambiente", "c.ambiente"],
        ["cliente_id", "c.cliente_id"],
        ["servicio_id", "c.servicio_id"],
        ["producto_id", "c.producto_id"],
        ["canal_id", "c.canal_id"],
        ["moneda_id", "c.moneda_id"],
        ["duracion_ventana_minutos", "c.duracion_ventana_minutos"],
        ["ventana_inicio", local("c.ventana_inicio", off)],
        ["ventana_fin", local("c.ventana_fin", off)],
        ["cantidad_total", "c.cantidad_total"],
        ["cantidad_exitos", "c.cantidad_exitos"],
        ["cantidad_rechazos", "c.cantidad_rechazos"],
        ["cantidad_errores", "c.cantidad_errores"],
        ["tasa_aprobacion", "ROUND(c.tasa_aprobacion_calc, 6)"],
        ["tasa_rechazo", "ROUND(c.tasa_rechazo_calc, 6)"],
        ["tasa_error", "ROUND(c.tasa_error_calc, 6)"],
        ["importe_total", "c.importe_total"],
        ["tiempo_respuesta_promedio", "c.tiempo_respuesta_promedio"],
        ["tiempo_respuesta_maximo_obs", "c.tiempo_respuesta_maximo_obs"],
        ["origen_dato", "c.origen_dato"],
        ["fecha_recepcion", local("c.fecha_recepcion", off)],
        ["cantidad_total_esperada", "c.cantidad_total_esperada"],
        ["cantidad_total_minima", "c.cantidad_total_minima"],
        ["cantidad_total_maxima", "c.cantidad_total_maxima"],
        ["tasa_aprobacion_esperada", "c.tasa_aprobacion_esperada"],
        ["tasa_aprobacion_minima", "c.tasa_aprobacion_minima"],
        ["tasa_rechazo_esperada", "c.tasa_rechazo_esperada"],
        ["tasa_rechazo_maxima", "c.tasa_rechazo_maxima"],
        ["tasa_error_esperada", "c.tasa_error_esperada"],
        ["tasa_error_maxima", "c.tasa_error_maxima"],
        ["importe_total_esperado", "c.importe_total_esperado"],
        ["importe_total_minimo", "c.importe_total_minimo"],
        ["importe_total_maximo", "c.importe_total_maximo"],
        ["tiempo_respuesta_esperado", "c.tiempo_respuesta_esperado"],
        ["tiempo_respuesta_maximo_esp", "c.tiempo_respuesta_maximo_esp"],
        ["modelo_id", "c.modelo_id"],
        ["modelo_version", "c.modelo_version"],
      ],
      desde: `
FROM v_comparacion c
WHERE ${WHERE_FILTROS("c.ventana_inicio", "c.ambiente")}
ORDER BY c.ventana_inicio`,
    },

    // -------------------------------------------------------------------
    // Pre-alertas: métricas dentro de la banda que vienen empeorando.
    // La vista ya mira solo las últimas 48 h; los filtros aplican sobre el inicio.
    prealertas: {
      usaFiltros: true,
      columnas: [
        ["tipo_prealerta", "p.tipo_prealerta"],
        ["tipo_previsto", "p.tipo_previsto"],
        ["descripcion",
          `CASE p.tipo_prealerta WHEN 'RIESGO_VOLUMEN_BAJO' THEN 'Riesgo de volumen bajo' WHEN 'RIESGO_APROBACION_BAJA' THEN 'Riesgo de aprobación baja' WHEN 'RIESGO_RECHAZO_ALTO' THEN 'Riesgo de rechazo alto' WHEN 'RIESGO_ERROR_ALTO' THEN 'Riesgo de error alto' WHEN 'RIESGO_LATENCIA_ALTA' THEN 'Riesgo de latencia alta' ELSE p.tipo_prealerta END`],
        ["clave_serie", CLAVE_SERIE("p")],
        ["ambiente", "p.ambiente"],
        ["cliente_id", "p.cliente_id"],
        ["servicio_id", "p.servicio_id"],
        ["producto_id", "p.producto_id"],
        ["canal_id", "p.canal_id"],
        ["moneda_id", "p.moneda_id"],
        ["duracion_ventana_minutos", "p.duracion_ventana_minutos"],
        ["metrica", "p.metrica"],
        ["inicio", local("p.inicio", off)],
        ["ultima_ventana", local("p.ultima_ventana", off)],
        ["ventanas", "p.ventanas"],
        ["severidad", "p.severidad"],
        ["severidad_orden", ORDEN_SEVERIDAD("p.severidad")],
        ["valor_observado", "p.valor_observado"],
        ["valor_esperado", "p.valor_esperado"],
        ["umbral", "p.umbral"],
        // 0 = en lo esperado, 1 = en el umbral (ahí salta la alerta)
        ["margen_consumido", "p.margen_consumido"],
        ["margen_consumido_max", "p.margen_consumido_max"],
        ["minutos_estimados", "p.minutos_estimados"],
        ["activa", "p.activa"],
        // CONFIRMADA (llegó la alerta prevista), NO_SE_CUMPLIO o EN_OBSERVACION
        ["resultado", "p.resultado"],
        ["resultado_orden", "CASE p.resultado WHEN 'EN_OBSERVACION' THEN 1 WHEN 'CONFIRMADA' THEN 2 ELSE 3 END"],
        ["alerta_real_ventana_fin", local("p.alerta_real_ventana_fin", off)],
        ["minutos_anticipacion", "p.minutos_anticipacion"],
      ],
      desde: `
FROM v_prealertas p
WHERE ${WHERE_FILTROS("p.inicio", "p.ambiente")}
ORDER BY p.activa DESC, p.inicio DESC`,
    },

    // -------------------------------------------------------------------
    estado: {
      usaFiltros: false,
      columnas: [
        // Reloj real (UTC verdadero) -> offReloj; reloj simulado (mismo huso que los datos) -> off
        ["datos_al",
          `(SELECT CASE WHEN ahora IS NULL THEN ${local("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", offReloj)} ELSE ${local("ahora", off)} END FROM alerta_parametros WHERE id = 1)`],
        ["reloj_simulado", "(SELECT CASE WHEN ahora IS NULL THEN 0 ELSE 1 END FROM alerta_parametros WHERE id = 1)"],
        ["generado_en", local("strftime('%Y-%m-%dT%H:%M:%SZ', 'now')", offReloj)],
        ["alertas_activas", "(SELECT COUNT(*) FROM alertas_historico WHERE estado <> 'RESUELTA')"],
        ["criticas_activas", "(SELECT COUNT(*) FROM alertas_historico WHERE estado <> 'RESUELTA' AND severidad = 'CRITICA')"],
        ["ultima_ventana_recibida", local("(SELECT MAX(ventana_fin) FROM core_metricas_observadas)", off)],
        ["ultima_recepcion", local("(SELECT MAX(fecha_recepcion) FROM core_metricas_observadas)", offReloj)],
      ],
      desde: "",
    },
  };
}

// ---------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET") return json({ error: "Método no permitido" }, 405);

    // Raíz pública: no expone datos
    if (url.pathname === "/" || url.pathname === "") {
      return json({ servicio: "api-alertas", endpoints: ["/api/alertas", "/api/incidentes", "/api/comparacion", "/api/estado", "/api/prealertas"] });
    }

    // Autenticación
    if (!env.API_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.API_TOKEN}`) {
      return json({ error: "No autorizado" }, 401);
    }

    const nombre = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
    const ep = endpoints(offsetHoras(env.TZ_OFFSET_HORAS), offsetHoras(env.TZ_OFFSET_RELOJ))[nombre];
    if (!ep) return json({ error: "Endpoint inexistente" }, 404);

    try {
      const sql = `SELECT\n  ${select(ep.columnas)}\n${ep.desde}`;
      let stmt = env.DB.prepare(sql);
      if (ep.usaFiltros) stmt = stmt.bind(...filtros(url));

      // raw() devuelve arrays de valores en el mismo orden que las columnas
      const rows = await stmt.raw();
      return json({ columns: ep.columnas.map(([alias]) => alias), rows });
    } catch (err) {
      if (err instanceof ErrorParametro) return json({ error: err.message }, 400);
      console.error(err);
      return json({ error: "Error consultando la base" }, 500);
    }
  },
};
