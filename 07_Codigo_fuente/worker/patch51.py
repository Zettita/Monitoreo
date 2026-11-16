# Parche 51 (disponibilidad: gráfico de tendencia por cliente y arreglo del inicio de medición):
#   1. Gráfico lineal de tendencia en el desplegable de cada cliente (parte del pedido del parche 48 que había quedado sin hacer): la disponibilidad de
#      cada uno de los últimos 30 días, con el objetivo como línea punteada y un punto por día coloreado como el semáforo (verde / amarillo / rojo).
#      El servidor suma `tendencia` a cada cliente y al global de GET /api/tablero/periodo (una sola consulta nueva por el índice de ventana_inicio).
#      La tendencia siempre termina en el período que se está mirando (o en hoy, si es el actual).
#   2. Arreglo: "desde cuándo se mide" cada servicio salía de series_estado.primera_ventana_inicio, que solo recuerda las últimas 25 horas. Con datos
#      reales, la semana y el mes se medían solo desde ayer (y un mes entero de alertas se dividía por ~100 ventanas). Ahora sale de la primera
#      ventana recibida dentro del rango mirado (una consulta por servicio que se detiene en la primera fila). En la demo (todo en un día) da lo mismo.
#   Sin SQL nuevo. Prueba: pruebas/disponibilidadtest.mjs
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


SERVIDOR = r"""// Tendencia diaria de la disponibilidad (parche 51): ventanas con problema de cada día (fecha de Argentina), por servicio
const Q_DISPO_DIARIO = `
SELECT cliente_id, servicio_id, dia, SUM(sev = 1) AS graves, SUM(sev = 2) AS importantes, SUM(sev = 3) AS leves
FROM (
  SELECT cliente_id, servicio_id, date(ventana_inicio, '-3 hours') AS dia, ventana_inicio,
         MIN(CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END) AS sev
  FROM alertas_historico
  WHERE ventana_inicio >= ?1 AND ventana_inicio < ?2 AND severidad IN ('CRITICA', 'ALTA', 'MEDIA')
    AND tipo_alerta NOT IN ('DATO_TARDIO', 'DATO_INCONSISTENTE', 'SIN_PREDICCION')
  GROUP BY cliente_id, servicio_id, ventana_inicio
)
GROUP BY cliente_id, servicio_id, dia
`;
// Desde cuándo se mide cada servicio: la primera ventana recibida desde ?1 (por el índice de ventana_inicio; se detiene en la primera fila de cada servicio)
const Q_DISPO_PRIMERAS = `
SELECT s.cliente_id, s.servicio_id,
       (SELECT o.ventana_inicio FROM core_metricas_observadas o
         WHERE o.ventana_inicio >= ?1 AND o.cliente_id = s.cliente_id AND o.servicio_id = s.servicio_id
         ORDER BY o.ventana_inicio LIMIT 1) AS primera_ventana_inicio
FROM (SELECT DISTINCT cliente_id, servicio_id FROM series_estado) s
`;
const TENDENCIA_DIAS = 30;
"""

TEND_JS = r"""  // Tendencia diaria de disponibilidad (parche 51): una línea con el valor de cada día, el objetivo punteado y un punto por día con el color del semáforo
  function lineaDispoHtml(c) {
    var t = (c.tendencia || []).filter(function (p) { return p && p.disponibilidad != null; });
    if (t.length < 2) return '<div class="dd-linea"><h4>Tendencia diaria</h4><p class="dd-linea-res">Todavía no hay datos de varios días para mostrar la tendencia.</p></div>';
    var W = 420, H = 170, L = 54, R = 12, T = 14, B = 26, pw = W - L - R, ph = H - T - B, obj = c.objetivo, lo = obj;
    t.forEach(function (p) { if (p.disponibilidad < lo) lo = p.disponibilidad; });
    var span = Math.max(1 - lo, (1 - obj) * 2, 0.0005) * 1.15, ymin = 1 - span, dec = span < 0.02 ? 2 : span < 0.2 ? 1 : 0;
    function pc(v) { return (v * 100).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %'; }
    function dia(f) { return f.slice(8, 10) + '/' + f.slice(5, 7); }
    var d0 = Date.parse(t[0].fecha + 'T12:00:00Z'), n = Math.round((Date.parse(t[t.length - 1].fecha + 'T12:00:00Z') - d0) / 864e5) || 1;
    function px(f) { return L + pw * Math.round((Date.parse(f + 'T12:00:00Z') - d0) / 864e5) / n; }
    function py(v) { return T + ph * (1 - (v - ymin) / (1 - ymin)); }
    var base = T + ph, tramos = [], tr = null, prev = null;
    t.forEach(function (p) {
      var dd = Math.round((Date.parse(p.fecha + 'T12:00:00Z') - d0) / 864e5);
      if (!tr || dd - prev > 1) { tr = []; tramos.push(tr); }
      tr.push([px(p.fecha), py(p.disponibilidad)]); prev = dd;
    });
    function r1(x) { return Math.round(x * 10) / 10; }
    var lineas = tramos.map(function (q) { return 'M' + q.map(function (z) { return r1(z[0]) + ' ' + r1(z[1]); }).join(' L'); });
    var areas = tramos.filter(function (q) { return q.length > 1; }).map(function (q) {
      return '<path class="area" d="M' + q.map(function (z) { return r1(z[0]) + ' ' + r1(z[1]); }).join(' L') + ' L' + r1(q[q.length - 1][0]) + ' ' + base + ' L' + r1(q[0][0]) + ' ' + base + ' Z"/>';
    }).join('');
    var grilla = [1, (1 + ymin) / 2, ymin].map(function (v) {
      return '<line class="grilla" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(py(v)) + '" y2="' + r1(py(v)) + '"/><text class="ejeT" x="' + (L - 6) + '" y="' + r1(py(v) + 3.5) + '" text-anchor="end">' + pc(v) + '</text>';
    }).join('');
    var yo = py(obj);
    var objetivo = obj >= ymin && obj <= 1 ? '<line class="obj" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(yo) + '" y2="' + r1(yo) + '"/>' : '';
    var ejeX = [[0, 'start'], [Math.floor((t.length - 1) / 2), 'middle'], [t.length - 1, 'end']].map(function (z) {
      return '<text class="ejeT" x="' + r1(px(t[z[0]].fecha)) + '" y="' + (H - 6) + '" text-anchor="' + z[1] + '">' + dia(t[z[0]].fecha) + '</text>';
    }).join('');
    var puntos = t.map(function (p) {
      var tip = dia(p.fecha) + (p.hasta_ahora ? ' (hasta ahora)' : '') + ': ' + pctD(p.disponibilidad, obj) + ' de disponibilidad · ' + minD(p.minutos_perdidos) + ' sin servicio · ' + TXT_ESTADO_D[p.estado || 'rojo'];
      return '<circle class="p ' + esc(p.estado || 'rojo') + '" cx="' + r1(px(p.fecha)) + '" cy="' + r1(py(p.disponibilidad)) + '" r="3.2"/>' +
        '<circle class="h" cx="' + r1(px(p.fecha)) + '" cy="' + r1(py(p.disponibilidad)) + '" r="9"><title>' + esc(tip) + '</title></circle>';
    }).join('');
    var peor = t.reduce(function (m, p) { return p.disponibilidad < m.disponibilidad ? p : m; }, t[0]);
    var cumplio = t.filter(function (p) { return p.estado === 'verde'; }).length;
    var resumenTxt = 'Cumplió el objetivo ' + cumplio + ' de ' + t.length + (t.length === 1 ? ' día' : ' días') + ' · peor día: ' + dia(peor.fecha) + ' (' + pctD(peor.disponibilidad, obj) + ')';
    return '<div class="dd-linea"><h4>Tendencia diaria · ' + dia(t[0].fecha) + ' al ' + dia(t[t.length - 1].fecha) + ' <span class="dd-leyenda"><i></i>Objetivo ' + pctD(obj) + '</span></h4>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Disponibilidad por día de ' + esc(c.cliente_id) + '. ' + esc(resumenTxt) + '">' + grilla + objetivo + areas +
      lineas.map(function (d) { return '<path class="lin" d="' + d + '"/>'; }).join('') + puntos + ejeX + '</svg>' +
      '<p class="dd-linea-res">' + esc(resumenTxt) + '. Cada punto es un día: verde llega al objetivo, amarillo no llega pero está cerca, rojo está lejos.</p></div>';
  }
"""

CSS_TABLERO = """/* Tendencia diaria por cliente (parche 51) */
.dd-linea { margin: 6px 0 12px; }
.dd-linea h4 { margin: 0 0 4px; font-size: 13.5px; font-weight: 600; }
.dd-linea svg { display: block; width: 100%; max-width: 620px; height: auto; }
.dd-linea .ejeT { fill: var(--ink-3); font-size: 10.5px; }
.dd-linea .grilla { stroke: var(--line); stroke-width: 1; }
.dd-linea .obj { stroke: var(--ink-2); stroke-width: 1.2; stroke-dasharray: 4 3; }
.dd-linea .lin { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.dd-linea .area { fill: var(--accent); opacity: .12; stroke: none; }
.dd-linea circle.p { stroke: var(--panel); stroke-width: 1.5; }
.dd-linea circle.p.verde { fill: var(--ok); }
.dd-linea circle.p.amarillo { fill: var(--media); }
.dd-linea circle.p.rojo { fill: var(--critica); }
.dd-linea circle.h { fill: transparent; cursor: default; }
.dd-linea circle.h:hover { fill: var(--accent); fill-opacity: .15; }
.dd-linea-res { margin: 2px 0 0; font-size: 12.5px; color: var(--ink-3); }
.dd-leyenda { margin-left: 10px; font-weight: 400; font-size: 12.5px; color: var(--ink-3); white-space: nowrap; }
.dd-leyenda i { display: inline-block; width: 20px; border-top: 1.5px dashed var(--ink-2); vertical-align: middle; margin-right: 5px; }
"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    h = _rep(h, "  function clienteDispoHtml(c) {\n", TEND_JS + "  function clienteDispoHtml(c) {\n")
    h = _rep(h, ": <b>' + pctD(c.objetivo) + '</b>. Cada servicio cuenta según su criticidad.</p>' +", ": <b>' + pctD(c.objetivo) + '</b>. Cada servicio cuenta según su criticidad.</p>' + lineaDispoHtml(c) +")
    return h


def aplicar(s):
    s = _rep(s, "async function resumenPeriodo(env, url) {", SERVIDOR + "async function resumenPeriodo(env, url) {")
    # Rango de la tendencia (30 días que terminan en el período, o en hoy si es el actual) y desde cuándo se mide cada servicio
    s = _rep(s, "  const dsp = await dispoLeer(env);\n  const r = await env.DB.batch([\n    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),",
             "  const dsp = await dispoLeer(env);\n"
             "  const tHasta = lim.hasta < pFechaSuma(hoy, 1) ? lim.hasta : pFechaSuma(hoy, 1), tIni = pFechaSuma(tHasta, -TENDENCIA_DIAS);\n"
             "  const medirDesde = [tIni, lim.desde, antLim.desde].sort()[0] + 'T03:00:00';   // sin la Z: así entra la ventana de las 03:00:00.000\n"
             "  const r = await env.DB.batch([\n    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),")
    s = _rep(s, "    env.DB.prepare('SELECT cliente_id, servicio_id, primera_ventana_inicio FROM series_estado'),\n    env.DB.prepare('SELECT * FROM umbrales_config LIMIT 300'),\n  ]);\n",
             "    env.DB.prepare(Q_DISPO_PRIMERAS).bind(medirDesde),\n    env.DB.prepare('SELECT * FROM umbrales_config LIMIT 300'),\n    env.DB.prepare(Q_DISPO_DIARIO).bind(tIni + 'T03:00:00Z', tHasta + 'T03:00:00Z'),\n  ]);\n")
    s = _rep(s, "  return Response.json({\n    ok: true, tipo, fecha: f, titulo: pTitulo(tipo, lim),",
             "  // Tendencia diaria: la disponibilidad de cada día, calculada con la misma cuenta que el período\n"
             "  const malasDia = new Map(), tendCli = new Map(), tendGlobal = [];\n"
             "  for (const x of r[5].results) { if (!malasDia.has(x.dia)) malasDia.set(x.dia, []); malasDia.get(x.dia).push(x); }\n"
             "  for (let k = 0; k < TENDENCIA_DIAS; k++) {\n"
             "    const dia = pFechaSuma(tIni, k), dd = dia + 'T03:00:00Z', dh = pFechaSuma(dia, 1) + 'T03:00:00Z';\n"
             "    const rd = dispoCalcular(dsp.cfg, r[4].results, r[3].results, malasDia.get(dia) || [], dd, dh, ahoraMs, 0);\n"
             "    if (!rd.global) continue;\n"
             "    const punto = (x) => ({ fecha: dia, disponibilidad: Math.round(x.disponibilidad * 1e6) / 1e6, estado: x.estado, minutos_perdidos: x.minutos_perdidos, hasta_ahora: ahoraMs < Date.parse(dh) });\n"
             "    tendGlobal.push(punto(rd.global));\n"
             "    for (const c of rd.clientes) { if (!tendCli.has(c.cliente_id)) tendCli.set(c.cliente_id, []); tendCli.get(c.cliente_id).push(punto(c)); }\n"
             "  }\n"
             "  if (disponibilidad.global) { disponibilidad.global.tendencia = tendGlobal; for (const c of disponibilidad.clientes) c.tendencia = tendCli.get(c.cliente_id) || []; }\n"
             "  return Response.json({\n    ok: true, tipo, fecha: f, titulo: pTitulo(tipo, lim),")
    s = _html(s, 'HTML', tablero)
    return s
