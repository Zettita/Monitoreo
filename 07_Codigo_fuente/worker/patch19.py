# Paso 19 del build: tablero liviano (cache de series y pre-alertas, incidentes acotados con índice, sin consultas que no se usan)
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    nuevo = r'''// =====================================================================
// TABLERO LIVIANO
// Cargar el tablero no recalcula nada pesado:
//   - Series (barras de 24 h) y pre-alertas se calculan UNA vez por revisión de
//     alertas y quedan en series_estado y prealertas_estado. La revisión (cron,
//     botón o escena de la demo) marca tablero_cache.revision; la primera carga
//     del tablero después de eso recalcula y guarda (~8.000 filas); las demás
//     cargas leen unas pocas decenas de filas.
//   - Incidentes: solo los últimos 30 días, por el índice de ventana_inicio.
//   - KPIs, MTTR y clientes se calculan en la página a partir de los incidentes.
// =====================================================================
const MARCAR_TABLERO = `UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;
const Q_SERIES_CALCULO = `
INSERT INTO series_estado (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, ventanas, ultima_ventana_fin, primera_ventana_inicio)
SELECT
    o.ambiente, o.cliente_id, o.servicio_id, o.producto_id, o.canal_id, o.moneda_id,
    COUNT(*),
    strftime('%Y-%m-%dT%H:%M:%SZ', MAX(o.ventana_fin)),
    strftime('%Y-%m-%dT%H:%M:%SZ', MIN(o.ventana_inicio))
FROM core_metricas_observadas o
WHERE o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-25 hours')
                           FROM alerta_parametros WHERE id = 1)
  AND julianday(o.ventana_fin) <= (SELECT julianday(COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
-- el "+" evita que SQLite recorra toda la tabla por el índice de series para ahorrarse ordenar
GROUP BY +o.ambiente, +o.cliente_id, +o.servicio_id, +o.producto_id, +o.canal_id, +o.moneda_id
`;
const Q_PREALERTAS_CALCULO = `
INSERT INTO prealertas_estado (
    tipo_prealerta, tipo_previsto, severidad, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id,
    metrica, inicio, ultima_ventana, ventanas, valor_observado, valor_esperado, umbral,
    margen_consumido, margen_consumido_max, minutos_estimados, activa, resultado, minutos_anticipacion)
SELECT
    tipo_prealerta, tipo_previsto, severidad, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id,
    metrica, inicio, ultima_ventana, ventanas, valor_observado, valor_esperado, umbral,
    margen_consumido, margen_consumido_max, minutos_estimados, activa, resultado, minutos_anticipacion
FROM v_prealertas
`;
const Q_SERIES_CACHE = `SELECT ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, ventanas, ultima_ventana_fin, primera_ventana_inicio
FROM series_estado ORDER BY cliente_id, servicio_id, canal_id`;
const Q_PREALERTAS_CACHE = `SELECT * FROM prealertas_estado ORDER BY inicio DESC`;
// Incidentes de los últimos 30 días (mismo resultado que v_incidentes filtrada por inicio),
// leyendo solo esas filas por el índice de ventana_inicio. El NOT EXISTS descarta los
// incidentes que empezaron antes del corte, igual que la vista.
const Q_INCIDENTES_30D = `
SELECT
    h.tipo_alerta,
    CASE MIN(CASE h.severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END)
        WHEN 1 THEN 'CRITICA' WHEN 2 THEN 'ALTA' WHEN 3 THEN 'MEDIA' ELSE 'BAJA' END AS severidad_maxima,
    CASE WHEN h.fecha_resolucion IS NULL THEN 'ABIERTO' ELSE 'RESUELTO' END AS estado_incidente,
    h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id,
    MIN(h.ventana_inicio) AS inicio,
    MAX(h.ventana_fin) AS ultima_ventana_afectada,
    h.fecha_resolucion,
    MAX(h.motivo_resolucion) AS motivo_resolucion,
    COUNT(*) AS ventanas_afectadas,
    ROUND((julianday(COALESCE(h.fecha_resolucion, p.ahora)) - julianday(MIN(h.ventana_inicio))) * 1440, 1) AS duracion_minutos
FROM alertas_historico h
CROSS JOIN (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora,
                   strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-30 days') AS desde
            FROM alerta_parametros WHERE id = 1) p
WHERE h.ventana_inicio >= p.desde
GROUP BY h.tipo_alerta, h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id, h.duracion_ventana_minutos, h.fecha_resolucion
HAVING NOT EXISTS (
    SELECT 1 FROM alertas_historico x
    WHERE x.ambiente = h.ambiente AND x.cliente_id = h.cliente_id AND x.servicio_id = h.servicio_id
      AND x.producto_id = h.producto_id AND x.canal_id = h.canal_id AND x.moneda_id = h.moneda_id
      AND x.duracion_ventana_minutos = h.duracion_ventana_minutos AND x.tipo_alerta = h.tipo_alerta
      AND x.ventana_inicio < p.desde AND x.fecha_resolucion IS h.fecha_resolucion)
ORDER BY (estado_incidente = 'ABIERTO') DESC, duracion_minutos DESC
`;

// Recalcula series y pre-alertas si hubo una revisión desde el último cálculo
async function actualizarCacheTablero(env) {
  const c = await env.DB.prepare('SELECT revision, calculado FROM tablero_cache WHERE id = 1').first();
  if (!c) throw new Error('Falta la tabla tablero_cache: corran cache_d1_tablas.txt en la consola de D1.');
  if (c.calculado === c.revision) return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM series_estado'),
    env.DB.prepare(Q_SERIES_CALCULO),
    env.DB.prepare('DELETE FROM prealertas_estado'),
    env.DB.prepare(Q_PREALERTAS_CALCULO),
    env.DB.prepare('UPDATE tablero_cache SET calculado = ?1 WHERE id = 1').bind(c.revision),
  ]);
  return true;
}

// Todos los datos del dashboard en un solo viaje a la base (más el recálculo, si hace falta)
async function datosDashboard(env) {
  if (!env.DB) throw new Error('No se encontró la base D1: falta el binding "DB".');
  try {
    const recalculado = await actualizarCacheTablero(env);
    const r = await env.DB.batch([
      env.DB.prepare(Q_ABIERTAS_ASIGNACION),
      env.DB.prepare(Q_INCIDENTES_30D),
      env.DB.prepare(Q_PARAMETROS),
      env.DB.prepare(Q_PREALERTAS_CACHE),
      env.DB.prepare(Q_SERIES_CACHE),
      env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
      env.DB.prepare(Q_EVENTOS_ABIERTAS),
    ]);
    return {
      ok: true,
      abiertas: r[0].results,
      incidentes: r[1].results,
      parametros: r[2].results[0] || {},
      prealertas: r[3].results,
      series: r[4].results,
      reglas_personalizadas: r[5].results,
      eventos: r[6].results,
      cache_recalculado: recalculado,
      filas_leidas: r.reduce((t, x) => t + ((x.meta && x.meta.rows_read) || 0), 0),
    };
  } catch (err) {
    throw new Error('Error al leer los datos del dashboard: ' + explicar(err));
  }
}'''
    i = s.index('// Todos los datos del dashboard en un solo viaje a la base\nasync function datosDashboard(env) {')
    j = s.index('\n}\n', i) + 2
    s = s[:i] + nuevo + s[j:]
    # La revisión de alertas y "Preparar demo" marcan el cache como desactualizado
    s = rep(s, """      env.DB.prepare(CERRAR_DESAPARECIDAS),
    ]);
    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];""", """      env.DB.prepare(CERRAR_DESAPARECIDAS),
      env.DB.prepare(MARCAR_TABLERO),
    ]);
    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];""")
    s = rep(s, """    env.DB.prepare('UPDATE alerta_reglas SET activa = 1'),
  ]);
  return { ...(await demoEstado(env)), alertas_borradas: res[0].meta.changes, observadas_borradas: res[1].meta.changes };""",
               """    env.DB.prepare('UPDATE alerta_reglas SET activa = 1'),
    env.DB.prepare(MARCAR_TABLERO),
  ]);
  return { ...(await demoEstado(env)), alertas_borradas: res[0].meta.changes, observadas_borradas: res[3].meta.changes };""")
    # Página: el tiempo medio de resolución (7 días) se calcula con los incidentes que ya trae
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    h = rep(h, "    var k = d.kpis || {};\n", """    // Tiempo medio de resolución de los últimos 7 días, con los incidentes resueltos que ya trae el tablero
    var k = (function () {
      var desde = ahoraMs(d) - 7 * 864e5;
      var res = (d.incidentes || []).filter(function (i) { return i.estado_incidente === 'RESUELTO' && aFecha(i.inicio).getTime() >= desde; });
      return { mttr_minutos_7d: res.length ? Math.round(10 * res.reduce(function (t, i) { return t + (i.duracion_minutos || 0); }, 0) / res.length) / 10 : null };
    })();
""")
    h = rep(h, """    if (!(d.abiertas || []).length && !(d.incidentes || []).length && (d.vivo || []).length)
      avisos.push('Hay alertas calculadas que todavía no se guardaron. Tocá "Revisar alertas ahora".');
""", "")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
