# Parche 52 (disponibilidad: la tendencia pasa a ser por ventana, acumulada del período):
#   El gráfico del parche 51 pedía varios días de datos (y en la demo todo pasa en uno). Ahora la línea muestra cómo evoluciona la disponibilidad del
#   período que se está mirando: cada punto es la disponibilidad acumulada desde el inicio del período hasta ese momento, y el último punto es el
#   número grande de arriba. El paso se adapta a lo que hay medido: una ventana de 15 minutos (todo "Día", o hasta día y medio de datos), una hora
#   ("Semana" o hasta ~8 días de datos) y un día (más datos). Los pasos empiezan en el primer momento medido.
#   - Servidor: `dispoTendencia` calcula los puntos con la misma cuenta que `dispoCalcular` (el último punto coincide con la disponibilidad del
#     período); GET /api/tablero/periodo trae `tendencia: { inicio_utc, paso_minutos, pt: [[disponibilidad, estado] | null, …] }` por cliente y global
#     (estado: 0 verde, 1 amarillo, 2 rojo; null = todavía no se medía). Reemplaza a la tendencia diaria de 30 días del parche 51.
#   - Página: línea con el objetivo punteado, un punto por paso (con muchos puntos solo se marcan los cambios de color y el último), tooltip al pasar el
#     mouse por cualquier momento, y una frase con desde cuándo está en el estado actual ("Está en rojo desde las 10:45").
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


SERVIDOR = r"""// Evolución de la disponibilidad (parche 52): ventanas con problema del período, una fila por ventana (para acumularlas paso a paso)
const Q_DISPO_PUNTOS = `
SELECT cliente_id, servicio_id, ventana_inicio, MIN(CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END) AS sev
FROM alertas_historico
WHERE ventana_inicio >= ?1 AND ventana_inicio < ?2 AND severidad IN ('CRITICA', 'ALTA', 'MEDIA')
  AND tipo_alerta NOT IN ('DATO_TARDIO', 'DATO_INCONSISTENTE', 'SIN_PREDICCION')
GROUP BY cliente_id, servicio_id, ventana_inicio
`;
// Disponibilidad acumulada desde el inicio del período, paso a paso (cada paso termina en inicio + n × paso). Es la misma cuenta que dispoCalcular
// con "hasta" en el final de cada paso: el último punto da la disponibilidad del período. pt[k] = [disponibilidad, 0 verde / 1 amarillo / 2 rojo] o null.
function dispoTendencia(cfg, umbrales, series, filas, desdeISO, hastaISO, ahoraMs, pasoMin) {
  const d0 = Date.parse(desdeISO), d1 = Date.parse(hastaISO), VENT = 15 * 60e3, paso = pasoMin * 60e3, pg = cfg.pesos_gravedad;
  const svcs = new Map();
  const dame = (cli, srv) => {
    const k = cli + '|' + srv;
    if (!svcs.has(k)) svcs.set(k, { cli, srv, primera: Infinity, malas: [], g: 0, i: 0, l: 0 });
    return svcs.get(k);
  };
  for (const s of series) { const x = dame(s.cliente_id, s.servicio_id), p = Date.parse(s.primera_ventana_inicio); if (!isNaN(p)) x.primera = Math.min(x.primera, p); }
  for (const f of filas) { const x = dame(f.cliente_id, f.servicio_id); if (x.primera === Infinity) x.primera = d0; x.malas.push([Date.parse(f.ventana_inicio), f.sev]); }
  const lista = [];
  for (const x of svcs.values()) {
    if (x.primera === Infinity) continue;
    const criticidad = dispoValor(umbrales, x.cli, x.srv, 'criticidad', 'MEDIA');
    lista.push(Object.assign(x, { peso: cfg.pesos_criticidad[criticidad] != null ? cfg.pesos_criticidad[criticidad] : 1 }));
  }
  // Los pasos empiezan en el primer momento medido (no en el inicio del período): así un mes con un solo día de datos no trae miles de pasos vacíos
  const primeraMin = lista.reduce((m, x) => Math.min(m, x.primera), Infinity);
  const t0 = lista.length ? d0 + Math.floor(Math.max(0, primeraMin - d0) / paso) * paso : d0;
  const n = Math.max(0, Math.min(Math.ceil((Math.min(d1, ahoraMs) - t0) / paso), Math.round((d1 - t0) / paso)));
  for (const x of lista) {
    x.bins = new Map();
    for (const [t, sev] of x.malas) {
      const k = Math.max(0, Math.floor((t - t0) / paso));
      if (k >= n) continue;
      if (!x.bins.has(k)) x.bins.set(k, [0, 0, 0]);
      x.bins.get(k)[sev - 1]++;
    }
  }
  const cod = (e) => (e === 'verde' ? 0 : e === 'amarillo' ? 1 : 2);
  const punto = (pp, pm, pw, objetivo) => {
    if (!pm) return null;
    const perdidosEq = pp / pw, permitido = (1 - objetivo) * (pm / pw), consumo = permitido > 0 ? perdidosEq / permitido : (perdidosEq > 0 ? 99 : 0);
    return [Math.round((1 - pp / pm) * 1e6) / 1e6, cod(dispoEstado(consumo, cfg.umbral_amarillo))];
  };
  const clientes = new Map();
  for (const x of lista) if (!clientes.has(x.cli)) clientes.set(x.cli, { obj: dispoValor(umbrales, x.cli, '*', 'objetivo_mensual', DISPO_OBJETIVO_FABRICA), pt: [] });
  const objGlobal = dispoValor(umbrales, '*', '*', 'objetivo_mensual', DISPO_OBJETIVO_FABRICA), global = [];
  for (let k = 0; k < n; k++) {
    const fin = Math.min(t0 + (k + 1) * paso, d1, ahoraMs), por = new Map();
    let gp = 0, gm = 0, gw = 0;
    for (const x of lista) {
      const b = x.bins.get(k);
      if (b) { x.g += b[0]; x.i += b[1]; x.l += b[2]; }
      const medidas = Math.floor((fin - Math.max(d0, x.primera)) / VENT);
      if (medidas <= 0) continue;
      const perdidos = Math.min(x.g * pg.CRITICA + x.i * pg.ALTA + x.l * pg.MEDIA, medidas) * 15, medidos = medidas * 15;
      const c = por.get(x.cli) || [0, 0, 0]; c[0] += x.peso * perdidos; c[1] += x.peso * medidos; c[2] += x.peso; por.set(x.cli, c);
      gp += x.peso * perdidos; gm += x.peso * medidos; gw += x.peso;
    }
    for (const [cli, c] of clientes) { const v = por.get(cli); c.pt.push(v ? punto(v[0], v[1], v[2], c.obj) : null); }
    global.push(punto(gp, gm, gw, objGlobal));
  }
  const out = (pt) => ({ inicio_utc: new Date(t0).toISOString(), paso_minutos: pasoMin, pt });
  return { global: out(global), clientes: new Map([...clientes].map(([cli, c]) => [cli, out(c.pt)])) };
}
"""

TEND_JS = r"""  // Evolución de la disponibilidad de un cliente (parche 52): línea acumulada desde el inicio del período, un punto por ventana (Día), hora (Semana) o día (Mes)
  var dispoCtx = { tipo: 'dia', ahora: null };
  function lineaDispoHtml(c) {
    var tn = c.tendencia, paso = tn ? tn.paso_minutos : 15, ahoraMsD = dispoCtx.ahora ? Date.parse(dispoCtx.ahora) : Date.now();
    var ESTADOS_T = ['verde', 'amarillo', 'rojo'];
    function dm(iso) { var d = aFecha(iso); return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ }); }
    var varios = false;   // ¿los puntos cruzan más de un día? Entonces las etiquetas llevan la fecha
    function etiqueta(iso) { return paso >= 1440 ? dm(iso) : varios ? dm(iso) + ' ' + hora(iso) : hora(iso); }
    var pts = [];
    if (tn && tn.pt) tn.pt.forEach(function (p, k) {
      if (!p) return;
      var fin = Date.parse(tn.inicio_utc) + (k + 1) * tn.paso_minutos * 60000, t = Math.min(fin, ahoraMsD);
      // con un punto por día se rotula con ese día (no con la medianoche siguiente)
      pts.push({ k: k, d: p[0], e: ESTADOS_T[p[1]], iso: new Date(paso >= 1440 ? fin - 60000 : t).toISOString(), parcial: fin > ahoraMsD });
    });
    if (pts.length) varios = dm(pts[0].iso) !== dm(pts[pts.length - 1].iso);
    var PASO = paso >= 1440 ? 'cada día' : paso >= 60 ? 'cada hora' : 'cada 15 minutos';
    if (pts.length < 2) return '<div class="dd-linea"><h4>Evolución de la disponibilidad</h4><p class="dd-linea-res">Todavía no hay suficientes ventanas medidas para mostrar la evolución.</p></div>';
    var W = 420, H = 170, L = 54, R = 12, T = 14, B = 26, pw = W - L - R, ph = H - T - B, obj = c.objetivo, lo = obj, i;
    pts.forEach(function (p) { if (p.d < lo) lo = p.d; });
    var span = Math.max(1 - lo, (1 - obj) * 2, 0.0005) * 1.15, ymin = 1 - span, dec = span < 0.02 ? 2 : span < 0.2 ? 1 : 0;
    function pc(v) { return (v * 100).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %'; }
    var k0 = pts[0].k, kN = pts[pts.length - 1].k, den = Math.max(1, kN - k0);
    function px(k) { return L + pw * (k - k0) / den; }
    function py(v) { return T + ph * (1 - (v - ymin) / (1 - ymin)); }
    function r1(x) { return Math.round(x * 10) / 10; }
    var base = T + ph, tramos = [], tr = null, prev = null;
    pts.forEach(function (p) { if (!tr || p.k - prev > 1) { tr = []; tramos.push(tr); } tr.push([px(p.k), py(p.d)]); prev = p.k; });
    var trazo = function (q) { return 'M' + q.map(function (z) { return r1(z[0]) + ' ' + r1(z[1]); }).join(' L'); };
    var areas = tramos.filter(function (q) { return q.length > 1; }).map(function (q) { return '<path class="area" d="' + trazo(q) + ' L' + r1(q[q.length - 1][0]) + ' ' + base + ' L' + r1(q[0][0]) + ' ' + base + ' Z"/>'; }).join('');
    var grilla = [1, (1 + ymin) / 2, ymin].map(function (v) {
      return '<line class="grilla" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(py(v)) + '" y2="' + r1(py(v)) + '"/><text class="ejeT" x="' + (L - 6) + '" y="' + r1(py(v) + 3.5) + '" text-anchor="end">' + pc(v) + '</text>';
    }).join('');
    var objetivo = obj >= ymin && obj <= 1 ? '<line class="obj" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(py(obj)) + '" y2="' + r1(py(obj)) + '"/>' : '';
    var ejeX = [[0, 'start'], [Math.floor((pts.length - 1) / 2), 'middle'], [pts.length - 1, 'end']].map(function (z) {
      return '<text class="ejeT" x="' + r1(px(pts[z[0]].k)) + '" y="' + (H - 6) + '" text-anchor="' + z[1] + '">' + etiqueta(pts[z[0]].iso) + '</text>';
    }).join('');
    // Con pocos puntos se marcan todos; con muchos, solo donde cambia el color y el último
    var denso = pts.length > 40, ancho = Math.max(2, pw / den);
    var puntos = '', zonas = '';
    pts.forEach(function (p, j) {
      var marca = !denso || j === 0 || j === pts.length - 1 || p.e !== pts[j - 1].e;
      if (marca) puntos += '<circle class="p ' + p.e + (j === pts.length - 1 ? ' ult' : '') + '" cx="' + r1(px(p.k)) + '" cy="' + r1(py(p.d)) + '" r="' + (j === pts.length - 1 ? 4 : denso ? 2.6 : 3.2) + '"/>';
      var tip = etiqueta(p.iso) + (p.parcial ? ' (hasta ahora)' : '') + ': ' + pctD(p.d, obj) + ' de disponibilidad acumulada · ' + TXT_ESTADO_D[p.e];
      zonas += '<rect class="h" x="' + r1(px(p.k) - ancho / 2) + '" y="' + T + '" width="' + r1(ancho) + '" height="' + ph + '"><title>' + esc(tip) + '</title></rect>';
    });
    var ult = pts[pts.length - 1], j = pts.length - 1;
    while (j > 0 && pts[j - 1].e === ult.e && pts[j].k - pts[j - 1].k === 1) j--;
    var estadoTxt = { verde: 'cumpliendo el objetivo', amarillo: 'por debajo del objetivo, pero cerca', rojo: 'por debajo del objetivo y lejos' }[ult.e];
    var frase = j === 0 && ult.e === 'verde' ? 'Cumple el objetivo durante todo el período medido' : 'Está ' + estadoTxt + (j === 0 ? ' desde que se empezó a medir' : ' desde ' + etiqueta(pts[j].iso));
    var resumenTxt = frase + ' (' + pctD(ult.d, obj) + ')';
    return '<div class="dd-linea"><h4>Evolución de la disponibilidad · ' + PASO + ' <span class="dd-leyenda"><i></i>Objetivo ' + pctD(obj) + '</span></h4>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de la disponibilidad de ' + esc(c.cliente_id) + '. ' + esc(resumenTxt) + '">' + grilla + objetivo + areas +
      tramos.map(function (q) { return '<path class="lin" d="' + trazo(q) + '"/>'; }).join('') + puntos + ejeX + zonas + '</svg>' +
      '<p class="dd-linea-res">' + esc(resumenTxt) + '. Cada punto es la disponibilidad acumulada desde el inicio del período; el último es el número de arriba.</p></div>';
  }
"""

CSS_TABLERO = """/* Evolución de la disponibilidad por ventana (parche 52) */
.dd-linea circle.p.ult { stroke-width: 2; }
.dd-linea rect.h { fill: transparent; }
.dd-linea rect.h:hover { fill: var(--accent); fill-opacity: .1; }
"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    # La función del parche 51 (tendencia diaria) se reemplaza entera
    a = h.index("  // Tendencia diaria de disponibilidad (parche 51)"); b = h.index("  function clienteDispoHtml(c) {\n")
    h = h[:a] + TEND_JS + h[b:]
    h = _rep(h, "var pg = cfg.pesos_gravedad || {}, am = cfg.umbral_amarillo || 1.5;\n    dispoAm = am;", "var pg = cfg.pesos_gravedad || {}, am = cfg.umbral_amarillo || 1.5;\n    dispoAm = am; dispoCtx = { tipo: r.tipo, ahora: r.ahora };")
    return h


def aplicar(s):
    # ---- Servidor: se reemplaza la tendencia diaria de 30 días por la acumulada del período, por paso ----
    a = s.index("// Tendencia diaria de la disponibilidad (parche 51)"); b = s.index("const TENDENCIA_DIAS = 30;\n") + len("const TENDENCIA_DIAS = 30;\n")
    # Q_DISPO_PRIMERAS (arreglo del parche 51) se conserva: está entre las dos consultas nuevas
    bloque = s[a:b]
    i = bloque.index("// Desde cuándo se mide cada servicio"); j = bloque.index("const TENDENCIA_DIAS")
    primeras = bloque[i:j]
    s = s[:a] + primeras + SERVIDOR + s[b:]
    s = _rep(s, "  const tHasta = lim.hasta < pFechaSuma(hoy, 1) ? lim.hasta : pFechaSuma(hoy, 1), tIni = pFechaSuma(tHasta, -TENDENCIA_DIAS);\n"
                "  const medirDesde = [tIni, lim.desde, antLim.desde].sort()[0] + 'T03:00:00';   // sin la Z: así entra la ventana de las 03:00:00.000\n",
             "  const medirDesde = [lim.desde, antLim.desde].sort()[0] + 'T03:00:00';   // sin la Z: así entra la ventana de las 03:00:00.000\n")
    s = _rep(s, "    env.DB.prepare(Q_DISPO_DIARIO).bind(tIni + 'T03:00:00Z', tHasta + 'T03:00:00Z'),\n", "    env.DB.prepare(Q_DISPO_PUNTOS).bind(desdeISO, hastaISO),\n")
    a = s.index("  // Tendencia diaria: la disponibilidad de cada día, calculada con la misma cuenta que el período\n")
    b = s.index("  return Response.json({\n    ok: true, tipo, fecha: f, titulo: pTitulo(tipo, lim),")
    s = s[:a] + (
        "  // Evolución: disponibilidad acumulada del período, una ventana (Día), una hora (Semana) o un día (Mes) por punto\n"
        "  if (disponibilidad.global) {\n"
        "    // El paso se adapta a lo que hay medido: una ventana si hay hasta un día y medio de datos, una hora hasta ~8 días (o en Semana) y un día si hay más\n"
        "    const primeraMin = Math.min(Infinity, ...r[3].results.map((x) => Date.parse(x.primera_ventana_inicio)).filter((v) => !isNaN(v)));\n"
        "    const medidoDias = (Math.min(Date.parse(hastaISO), ahoraMs) - Math.max(Date.parse(desdeISO), primeraMin)) / 864e5;\n"
        "    const pasoMin = tipo === 'dia' || medidoDias <= 1.5 ? 15 : tipo === 'semana' || medidoDias <= 8 ? 60 : 1440;\n"
        "    const tend = dispoTendencia(dsp.cfg, r[4].results, r[3].results, r[5].results, desdeISO, hastaISO, ahoraMs, pasoMin);\n"
        "    disponibilidad.global.tendencia = tend.global;\n"
        "    for (const c of disponibilidad.clientes) c.tendencia = tend.clientes.get(c.cliente_id) || null;\n"
        "  }\n") + s[b:]
    s = _html(s, 'HTML', tablero)
    return s
