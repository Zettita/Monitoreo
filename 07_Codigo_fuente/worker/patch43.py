# Parche 43 (dashboard gerencial, parte 2): gráfico de incidentes activos, con filtro de la lista.
#   - Arriba de "Alertas Abiertas": una barra por cliente (o por tipo de falla) con los problemas activos ahora, divididos por
#     gravedad (Grave, Importante, Leve). Los avisos informativos no se cuentan. Los números van en texto al lado de cada barra
#     (el amarillo de Leve tiene poco contraste: el color nunca es lo único que dice algo) y en el detalle al pasar el mouse.
#   - Tocar una barra filtra la lista de alertas de abajo; tocarla de nuevo, o "Quitar filtro", la saca. El gráfico y la lista
#     usan los mismos datos que ya trae el tablero: no hay consultas nuevas.
#   - Lo ven quienes ven la lista (Analista, Administrador y Gerente). Solo página; sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS = """/* Incidentes activos (parche 43) */
.activos { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 12px 14px; margin-bottom: 14px; }
.activos-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin-bottom: 6px; }
.activos-cab h3 { margin: 0; font-size: 15px; }
.activos-total { margin: 0 0 6px; font-size: 13.5px; color: var(--ink-2); }
.activos-total b { color: var(--ink); font-size: 20px; margin-right: 4px; }
.act-fila { display: grid; grid-template-columns: minmax(90px, 210px) minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; width: 100%; text-align: left;
  border: 0; background: transparent; color: var(--ink); font: inherit; padding: 6px 6px; border-radius: 6px; cursor: pointer; }
.act-fila:hover { background: var(--track); }
.act-fila:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.act-fila[aria-pressed="true"] { background: var(--track); box-shadow: inset 0 0 0 2px var(--accent); }
.act-fila .nom { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.act-pista { display: block; min-width: 0; }
.act-barra { display: flex; gap: 2px; height: 10px; }
.act-barra i { display: block; height: 100%; min-width: 6px; border-radius: 4px; }
.act-barra i.CRITICA { background: var(--critica); }
.act-barra i.ALTA { background: var(--alta); }
.act-barra i.MEDIA { background: var(--media); }
.act-fila .num { font-size: 13px; color: var(--ink-2); white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; }
.act-fila .num b { color: var(--ink); }
.act-leyenda { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 8px 6px 0; padding: 0; list-style: none; font-size: 12.5px; color: var(--ink-3); }
.act-leyenda li { display: inline-flex; align-items: center; gap: 5px; }
.act-leyenda i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.act-leyenda i.CRITICA { background: var(--critica); } .act-leyenda i.ALTA { background: var(--alta); } .act-leyenda i.MEDIA { background: var(--media); }
.act-filtro { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 6px 0; font-size: 13px; color: var(--ink-2); }
@media (max-width: 560px) {
  .act-fila { grid-template-columns: minmax(0, 1fr) auto; }
  .act-fila .act-pista { grid-column: 1 / -1; grid-row: 2; }
}
"""

JS = r"""  // ---- Incidentes activos (parche 43): gráfico de barras por cliente o por tipo de falla; tocar una barra filtra la lista ----
  var activosCorte = 'cliente', activosFiltro = null, ultimoCasos = null;
  var SEV_ACT = [['CRITICA', 'grave', 'graves'], ['ALTA', 'importante', 'importantes'], ['MEDIA', 'leve', 'leves']];
  function claveActivo(g) { return activosCorte === 'tipo' ? g.ult.tipo_alerta : g.ult.cliente_id; }
  function nombreActivo(k) { return activosCorte === 'tipo' ? frase(k) : k; }
  function filtrarActivos(a) {
    if (activosFiltro !== null && !a.some(function (g) { return claveActivo(g) === activosFiltro; })) activosFiltro = null;   // ya no hay de eso: se quita solo
    return activosFiltro === null ? a : a.filter(function (g) { return claveActivo(g) === activosFiltro; });
  }
  function pintarActivos(a, vis) {
    var el = $('activos'); if (!el) return;
    var reales = a.filter(function (g) { return g.sev !== 'BAJA'; });
    el.hidden = !reales.length;
    if (!reales.length) return;
    var por = {};
    reales.forEach(function (g) {
      var k = claveActivo(g), x = por[k] || (por[k] = { k: k, n: 0, CRITICA: 0, ALTA: 0, MEDIA: 0 });
      x.n++; x[g.sev]++;
    });
    var filas = Object.keys(por).map(function (k) { return por[k]; })
      .sort(function (x, y) { return y.CRITICA - x.CRITICA || y.n - x.n || (x.k < y.k ? -1 : 1); });
    var max = filas.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    var graves = reales.filter(function (g) { return g.sev === 'CRITICA'; }).length;
    var seg = [['cliente', 'Por cliente'], ['tipo', 'Por tipo de falla']].map(function (o) {
      return '<button type="button" data-act-corte="' + o[0] + '" aria-pressed="' + (o[0] === activosCorte) + '">' + o[1] + '</button>';
    }).join('');
    el.innerHTML = '<div class="activos-cab"><h3>Incidentes activos ahora</h3><div class="fallas-seg" role="group" aria-label="Ver por">' + seg + '</div></div>' +
      '<p class="activos-total"><b>' + reales.length + '</b>' + (reales.length === 1 ? 'problema activo' : 'problemas activos') + (graves ? ' · ' + graves + (graves === 1 ? ' grave' : ' graves') : '') + '. Tocá una barra para ver solo esos en la lista.</p>' +
      filas.map(function (x) {
        var partes = SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return x[s[0]] + ' ' + (x[s[0]] === 1 ? s[1] : s[2]); });
        var tip = nombreActivo(x.k) + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + (partes.length ? ' (' + partes.join(', ') + ')' : '');
        return '<button type="button" class="act-fila" data-act-fila="' + esc(x.k) + '" aria-pressed="' + (activosFiltro === x.k) + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
          '<span class="nom">' + esc(nombreActivo(x.k)) + '</span>' +
          '<span class="act-pista" aria-hidden="true"><span class="act-barra" style="width:' + Math.max(8, Math.round(100 * x.n / max)) + '%">' +
            SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return '<i class="' + s[0] + '" style="flex:' + x[s[0]] + '"></i>'; }).join('') + '</span></span>' +
          '<span class="num"><b>' + x.n + '</b>' + (partes.length ? ' · ' + partes.join(', ') : '') + '</span></button>';
      }).join('') +
      '<ul class="act-leyenda" aria-label="Qué significa cada color">' + SEV_ACT.filter(function (s) { return reales.some(function (g) { return g.sev === s[0]; }); })
        .map(function (s) { return '<li><i class="' + s[0] + '"></i>' + s[1].charAt(0).toUpperCase() + s[1].slice(1) + '</li>'; }).join('') + '</ul>' +
      (activosFiltro !== null ? '<div class="act-filtro">Mostrando solo <b>' + esc(nombreActivo(activosFiltro)) + '</b> en la lista de abajo <button type="button" class="btn chico" data-act-quitar="1">Quitar filtro</button></div>' : '');
  }
  document.addEventListener('click', function (ev) {
    var c = ev.target.closest && ev.target.closest('[data-act-corte]'), f = ev.target.closest && ev.target.closest('[data-act-fila]'), q = ev.target.closest && ev.target.closest('[data-act-quitar]');
    if (!c && !f && !q) return;
    if (c) { activosCorte = c.getAttribute('data-act-corte'); activosFiltro = null; }
    if (f) { var k = f.getAttribute('data-act-fila'); activosFiltro = activosFiltro === k ? null : k; }
    if (q) activosFiltro = null;
    if (ultimoCasos) pintarCasos(ultimoCasos[0], ultimoCasos[1]);
  });

"""


def tablero(h):
    h = _rep(h, '      <p class="bajada" id="bajada-ahora" hidden>Los problemas en curso, del más grave al más leve.</p>\n',
             '      <p class="bajada" id="bajada-ahora" hidden>Los problemas en curso, del más grave al más leve.</p>\n      <div class="activos" id="activos" hidden></div>\n')
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    # El gráfico y la lista filtrada salen de los mismos grupos que arma pintarCasos
    h = _rep(h, "  function pintarCasos(casos, d) {\n", JS + "  function pintarCasos(casos, d) {\n")
    h = _rep(h, "    $('t-abiertas').innerHTML = a.length ? '<thead>",
             "    ultimoCasos = [casos, d];\n    var vis = filtrarActivos(a);\n    pintarActivos(a, vis);\n    $('t-abiertas').innerHTML = vis.length ? '<thead>")
    h = _rep(h, "<th></th></tr></thead><tbody>' +\n      a.map(function (g) {\n        var r = g.ult, s = g.asig, acc = '';",
             "<th></th></tr></thead><tbody>' +\n      vis.map(function (g) {\n        var r = g.ult, s = g.asig, acc = '';")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
