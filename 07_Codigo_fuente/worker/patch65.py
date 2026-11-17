# Parche 65 (17/11): sexta tanda de ajustes de Ale.
#   Operaciones: "Problemas activos" se divide en dos gráficos, "Por cliente" y "Por tipo de falla", al lado de "Alertas por
#   estado" (tres gráficos en la misma línea; sin el selector Por cliente / Por tipo de falla). Tocar una barra de cualquiera
#   de los dos filtra la lista de abajo.
#   Distribución de fallas: en lugar de las tortas del parche 64, cada fila es su propia barra (el fondo se llena según el %),
#   con el nombre a la izquierda y el porcentaje y la cantidad alineados a la derecha. En el tablero y en Mis alertas.
# Solo páginas. Sin SQL.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _r(h, viejo, nuevo, n=1):
    c = h.count(viejo)
    if c != n:
        raise SystemExit('patch65: se esperaban %d y hay %d de: %r' % (n, c, viejo[:100]))
    return h.replace(viejo, nuevo)


def _entre(h, ini, fin, nuevo):
    if h.count(ini) != 1:
        raise SystemExit('patch65: el inicio no es único: %r' % ini[:80])
    i = h.index(ini); j = h.index(fin, i)
    return h[:i] + nuevo + h[j:]


# ---------- Distribución de fallas: filas que son barras ----------
FILAS = r"""  function lista(filas, total) {
    // Cada fila es su propia barra: el fondo se llena según el porcentaje; nombre a la izquierda, % y cantidad a la derecha
    var max = filas.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    var tip = function (x) {
      return x.nombre + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + ' (' + pct(x.n, total) + ')' + (x.graves ? ', ' + x.graves + (x.graves === 1 ? ' grave' : ' graves') : '') +
        (x.abiertos ? ', ' + x.abiertos + (x.abiertos === 1 ? ' abierto' : ' abiertos') : '') + '. Duraron ' + minTxt(x.minutos) + ' en total.';
    };
    return '<ul class="fl-filas">' + filas.map(function (x) {
      return '<li' + (x.otros ? ' class="otros"' : '') + ' title="' + esc(tip(x)) + '" aria-label="' + esc(tip(x)) + '">' +
        '<span class="fl-fondo" style="width:' + Math.max(3, Math.round(100 * x.n / max)) + '%" aria-hidden="true"></span>' +
        '<span class="nom">' + esc(x.nombre) + '</span><b>' + pct(x.n, total) + '</b><span class="c">' + x.n + '</span></li>';
    }).join('') + '</ul>';
  }
"""

CSS_FILAS = """<style>/* Distribución de fallas: filas que son barras (parche 65) */
.fl-filas { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.fl-filas li { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto 2.4em; gap: 10px; align-items: center;
  min-height: 32px; padding: 0 10px; border-radius: 3px; background: var(--track); overflow: hidden; font-size: 13.5px; color: var(--ink); }
.fl-fondo { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); opacity: .22; border-radius: 3px 0 0 3px; }
.fl-filas li:first-child .fl-fondo { opacity: .34; }
.fl-filas li.otros .fl-fondo { background: var(--ink-3); opacity: .32; }
.fl-filas .nom, .fl-filas b, .fl-filas .c { position: relative; }
.fl-filas .nom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-filas b { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
.fl-filas .c { color: var(--ink-2); font-variant-numeric: tabular-nums; text-align: right; font-size: 12.5px; }
</style>
</head>"""


def _fallas(h):
    h = _r(h, "  var PALETA_FALLAS = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];\n", '')
    h = _entre(h, '  function lista(filas, total) {', '  function pintar(el) {', FILAS)
    i = h.index('<style>/* Distribución de fallas en tortas (parche 64) */'); j = h.index('</style>\n', i) + len('</style>\n')
    h = h[:i] + h[j:]   # el CSS de las tortas ya no se usa
    h = _r(h, '</head>', CSS_FILAS)
    return h


# ---------- Operaciones: tres gráficos en la misma línea ----------
ACTIVOS = r"""  function claveActivo(g, corte) { return corte === 'tipo' ? g.ult.tipo_alerta : g.ult.cliente_id; }
  function nombreActivo(k, corte) { return corte === 'tipo' ? frase(k) : k; }
"""

FILTRAR = r"""  function filtrarActivos(a) {
    if (activosFiltro !== null && !a.some(function (g) { return claveActivo(g, activosFiltro.c) === activosFiltro.k; })) activosFiltro = null;   // ya no hay de eso: se quita solo
    return activosFiltro === null ? a : a.filter(function (g) { return claveActivo(g, activosFiltro.c) === activosFiltro.k; });
  }
  var ultimoActivos = null;
  function barrasActivos(reales, corte) {
    var por = {};
    reales.forEach(function (g) {
      var k = claveActivo(g, corte), x = por[k] || (por[k] = { k: k, n: 0, CRITICA: 0, ALTA: 0, MEDIA: 0 });
      x.n++; x[g.sev]++;
    });
    var filas = Object.keys(por).map(function (k) { return por[k]; })
      .sort(function (x, y) { return y.CRITICA - x.CRITICA || y.n - x.n || (x.k < y.k ? -1 : 1); });
    if (!filas.length) return '<p class="activos-total">No hay alertas en este estado.</p>';
    var max = filas.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    return filas.map(function (x) {
      var partes = SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return x[s[0]] + ' ' + (x[s[0]] === 1 ? s[1] : s[2]); });
      var nom = nombreActivo(x.k, corte), on = activosFiltro !== null && activosFiltro.c === corte && activosFiltro.k === x.k;
      var tip = nom + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + (partes.length ? ' (' + partes.join(', ') + ')' : '');
      return '<button type="button" class="act-fila" data-act-fila="' + esc(x.k) + '" data-act-corte-fila="' + corte + '" aria-pressed="' + on + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<span class="nom">' + esc(nom) + '</span>' +
        '<span class="num">' + (partes.length ? partes.join(', ') : x.n) + '</span>' +
        '<span class="act-pista" aria-hidden="true"><span class="act-barra" style="width:' + Math.max(8, Math.round(100 * x.n / max)) + '%">' +
          SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return '<i class="' + s[0] + '" style="flex:' + x[s[0]] + '"></i>'; }).join('') + '</span></span></button>';
    }).join('');
  }
  function pintarActivos(a, vis, todas) {
    var el = $('activos'); if (!el) return;
    ultimoActivos = [a, vis, todas];
    todas = todas || a;
    var reales = a.filter(function (g) { return g.sev !== 'BAJA'; });
    var todasReales = todas.filter(function (g) { return g.sev !== 'BAJA'; });
    el.hidden = !todasReales.length;
    if (!todasReales.length) return;
    var leyenda = '<ul class="act-leyenda" aria-label="Qué significa cada color">' + SEV_ACT.filter(function (s) { return reales.some(function (g) { return g.sev === s[0]; }); })
      .map(function (s) { return '<li><i class="' + s[0] + '"></i>' + s[1].charAt(0).toUpperCase() + s[1].slice(1) + '</li>'; }).join('') + '</ul>';
    el.innerHTML = '<div class="act-grid">' +
      '<div class="act-panel"><h3>Alertas por estado</h3>' + estadosHtml(todas) + '</div>' +
      '<div class="act-panel"><h3>Problemas por cliente</h3>' + barrasActivos(reales, 'cliente') + leyenda + '</div>' +
      '<div class="act-panel"><h3>Problemas por tipo de falla</h3>' + barrasActivos(reales, 'tipo') + leyenda + '</div></div>' +
      (activosFiltro !== null ? '<div class="act-filtro">Mostrando solo <b>' + esc(nombreActivo(activosFiltro.k, activosFiltro.c)) + '</b> en la lista de abajo <button type="button" class="btn chico" data-act-quitar="1">Quitar filtro</button></div>' : '');
  }
"""

CLICK_VIEJO = """    if (c) {
      activosCorte = c.getAttribute('data-act-corte');
      if (activosFiltro === null && ultimoActivos) { pintarActivos.apply(null, ultimoActivos); return; }   // la lista de abajo no cambia
      activosFiltro = null;
    }
    if (f) { var k = f.getAttribute('data-act-fila'); activosFiltro = activosFiltro === k ? null : k; }"""
CLICK_NUEVO = """    if (f) {
      var k = f.getAttribute('data-act-fila'), cc = f.getAttribute('data-act-corte-fila');
      activosFiltro = activosFiltro !== null && activosFiltro.c === cc && activosFiltro.k === k ? null : { c: cc, k: k };
    }"""

CSS_ACT = """<style>/* Operaciones: tres gráficos en la misma línea (parche 65) */
.act-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.act-fila { grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; padding: 6px 8px; }
.act-fila .act-pista { grid-column: 1 / -1; grid-row: 2; }
.act-fila .num { font-size: 12.5px; }
.act-grid .act-panel { display: flex; flex-direction: column; }
.act-grid .act-panel .act-leyenda { margin-top: auto; padding-top: 10px; }
.act-grid .dona-wrap { justify-content: center; }
.act-filtro { margin: 10px 2px 0; }
@media (max-width: 1100px) { .act-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .act-grid .act-panel:first-child { grid-column: 1 / -1; } }
@media (max-width: 700px) { .act-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>"""


def _tablero(h):
    h = _r(h, "  var activosCorte = 'cliente', activosFiltro = null, ultimoCasos = null;", "  var activosFiltro = null, ultimoCasos = null;")
    h = _entre(h, '  function claveActivo(g) {', '  var ESTADOS_ACT = ', ACTIVOS)
    h = _entre(h, '  function filtrarActivos(a) {', '    document.addEventListener(\'click\', function (ev) {\n    var c = ev.target.closest', FILTRAR)
    h = _r(h, "var c = ev.target.closest && ev.target.closest('[data-act-corte]'), f = ", "var f = ")
    h = _r(h, "if (!c && !f && !q) return;", "if (!f && !q) return;")
    h = _r(h, CLICK_VIEJO, CLICK_NUEVO)
    h = _r(h, '</head>', CSS_ACT)
    return _fallas(h)


def aplicar(s):
    s = _html(s, 'HTML', _tablero)
    s = _html(s, 'MIS_ALERTAS_HTML', _fallas)
    return s
