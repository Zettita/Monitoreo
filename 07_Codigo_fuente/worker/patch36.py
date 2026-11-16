# Parche 36: "Distribución de fallas" (pedido del líder que vio la demo): qué porcentaje de los problemas corresponde
# a cada cliente, a cada tipo de falla o a cada causa, en un período (hoy, 7 días o 30 días).
#   - Tablero (Analista, Gerente —el "directivo"— y Administrador): todos los clientes.
#   - Mis alertas (Soporte): solo los problemas asignados a su usuario o a sus equipos.
#   - Forma: lista ordenada con barra de un solo color, porcentaje y cantidad (se lee más rápido que una torta y el
#     color no cambia de significado al cambiar de período). Hover con el detalle (graves, abiertos, minutos).
#   - Datos: Q_INCIDENTES_30D suma causa_resolucion; /api/mis-alertas suma "incidentes" (30 días, por el índice de
#     ventana_inicio, solo lo de la persona). Sin SQL en la base (las columnas ya existen desde el script 13).
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _css(h, css):
    i = h.index('</style>')
    return h[:i] + css + h[i:]


CSS = """/* Distribución de fallas (parche 36) */
.fallas { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 14px 16px; }
.fallas-filtros { display: flex; gap: 8px 14px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.fallas-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.fallas-seg button { border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 13px; padding: 5px 11px; cursor: pointer; }
.fallas-seg button + button { border-left: 1px solid var(--line); }
.fallas-seg button[aria-pressed="true"] { background: var(--accent); color: var(--sobre-accent, #fff); }
.fallas-seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.fallas-total { margin: 0 0 10px; font-size: 13.5px; color: var(--ink-2); }
.fallas-total b { color: var(--ink); font-size: 20px; margin-right: 4px; }
.fallas-lista { list-style: none; margin: 0; padding: 0; }
.fallas-lista li { display: grid; grid-template-columns: minmax(90px, 220px) minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 6px 4px; border-radius: 6px; }
.fallas-lista li:hover, .fallas-lista li:focus-within { background: var(--track); }
.fallas-lista .nom { font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fallas-lista .fbar { height: 8px; border-radius: 4px; background: var(--track); overflow: hidden; }
.fallas-lista .fbar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); min-width: 2px; }
.fallas-lista .num { font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.fallas-lista .num b { color: var(--ink); }
.fallas-lista li.otros .fbar i { background: var(--ink-3); }
.fallas-vacio { color: var(--ink-3); font-size: 14px; padding: 8px 0; }
.fallas-nota { margin: 10px 0 0; font-size: 12.5px; color: var(--ink-3); }
@media (max-width: 560px) {
  .fallas-lista li { grid-template-columns: minmax(0, 1fr) auto; }
  .fallas-lista .fbar { grid-column: 1 / -1; grid-row: 2; }
}
"""

# El gráfico, igual en las dos páginas. Se llama con los datos ya cargados: no consulta nada.
JS = r"""
// Distribución de fallas (parche 36): % de problemas por cliente, tipo de falla o causa, en un período
(function () {
  var MAX_FILAS = 7;   // más filas se juntan en "Otros"
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ms(iso) { if (!iso) return NaN; var s = String(iso).replace(' ', 'T'); return new Date(s + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')).getTime(); }
  function minTxt(m) { m = Math.round(m || 0); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); }
  function pct(n, t) { var p = t ? 100 * n / t : 0; return (p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10).toLocaleString('es-AR') + ' %'; }
  var CORTES = [['cliente', 'Cliente'], ['tipo', 'Tipo de falla'], ['causa', 'Causa']];
  var PERIODOS = [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días']];
  function causaDe(i) {
    if (i.causa_resolucion) return i.causa_resolucion;
    if (i.estado_incidente === 'ABIERTO' || !i.fecha_resolucion) return 'Todavía abierto';
    if (i.motivo_resolucion === 'NORMALIZADA' || i.motivo_resolucion === 'CONDICION_DESAPARECIDA') return 'Se normalizó solo';
    return 'Resuelto sin causa cargada';
  }
  function desdeMs(periodo, ahora) {
    if (periodo === 'hoy') { var a = new Date(ahora - 3 * 36e5).toISOString().slice(0, 10); return ms(a + 'T03:00:00Z'); }   // 00:00 de Argentina
    return ahora - Number(periodo) * 864e5;
  }
  function pintar(el) {
    var st = el._estado, d = el._datos, ahora = ms(d.ahora) || Date.now(), desde = desdeMs(st.periodo, ahora);
    var xs = (d.incidentes || []).filter(function (i) { return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION' && ms(i.inicio) >= desde; });
    var g = {};
    xs.forEach(function (i) {
      var k = st.corte === 'cliente' ? i.cliente_id : st.corte === 'tipo' ? el._tipo(i.tipo_alerta) : causaDe(i);
      var x = g[k] || (g[k] = { nombre: k, n: 0, graves: 0, abiertos: 0, minutos: 0 });
      x.n++; x.minutos += i.duracion_minutos || 0;
      if (i.severidad_maxima === 'CRITICA') x.graves++;
      if (i.estado_incidente === 'ABIERTO' || !i.fecha_resolucion) x.abiertos++;
    });
    var filas = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.n - a.n || b.minutos - a.minutos || (a.nombre < b.nombre ? -1 : 1); });
    if (filas.length > MAX_FILAS) {
      var resto = filas.splice(MAX_FILAS - 1);
      filas.push(resto.reduce(function (o, x) { o.n += x.n; o.graves += x.graves; o.abiertos += x.abiertos; o.minutos += x.minutos; return o; },
        { nombre: 'Otros (' + resto.length + ')', n: 0, graves: 0, abiertos: 0, minutos: 0, otros: true }));
    }
    var total = xs.length, graves = xs.filter(function (i) { return i.severidad_maxima === 'CRITICA'; }).length;
    var abiertos = xs.filter(function (i) { return i.estado_incidente === 'ABIERTO' || !i.fecha_resolucion; }).length;
    var max = filas.reduce(function (m, x) { return Math.max(m, x.n); }, 0);
    var seg = function (opciones, actual, clave, rotulo) {
      return '<div class="fallas-seg" role="group" aria-label="' + rotulo + '">' + opciones.map(function (o) {
        return '<button type="button" data-' + clave + '="' + o[0] + '" aria-pressed="' + (o[0] === actual) + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    };
    el.innerHTML = '<div class="fallas-filtros">' + seg(CORTES, st.corte, 'corte', 'Ver por') + seg(PERIODOS, st.periodo, 'periodo', 'Período') + '</div>' +
      (total ? '<p class="fallas-total"><b>' + total + '</b>' + (total === 1 ? 'problema' : 'problemas') + (graves ? ' · ' + graves + (graves === 1 ? ' grave' : ' graves') : '') +
        (abiertos ? ' · ' + abiertos + (abiertos === 1 ? ' sigue abierto' : ' siguen abiertos') : '') + '</p>' +
        '<ul class="fallas-lista">' + filas.map(function (x) {
          var tip = x.nombre + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + ' (' + pct(x.n, total) + ')' + (x.graves ? ', ' + x.graves + (x.graves === 1 ? ' grave' : ' graves') : '') +
            (x.abiertos ? ', ' + x.abiertos + (x.abiertos === 1 ? ' abierto' : ' abiertos') : '') + '. Duraron ' + minTxt(x.minutos) + ' en total.';
          return '<li class="' + (x.otros ? 'otros' : '') + '" title="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '"><span class="nom">' + esc(x.nombre) + '</span>' +
            '<span class="fbar" aria-hidden="true"><i style="width:' + (max ? Math.max(2, Math.round(100 * x.n / max)) : 0) + '%"></i></span>' +
            '<span class="num"><b>' + pct(x.n, total) + '</b> · ' + x.n + '</span></li>';
        }).join('') + '</ul>'
        : '<p class="fallas-vacio">No hubo problemas en este período.</p>') +
      (el._nota ? '<p class="fallas-nota">' + el._nota + '</p>' : '');
  }
  window.HeliosFallas = function (el, datos, nombreTipo, nota) {
    if (!el) return;
    el._datos = datos; el._tipo = nombreTipo || function (t) { return t; }; el._nota = nota || '';
    if (!el._estado) {
      el._estado = { corte: 'cliente', periodo: '30' };
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        if (b.dataset.corte) el._estado.corte = b.dataset.corte;
        if (b.dataset.periodo) el._estado.periodo = b.dataset.periodo;
        pintar(el);
      });
    }
    pintar(el);
  };
})();
"""

NOTA_TABLERO = 'Cada problema es una alerta de un servicio y canal, de principio a fin (las ventanas seguidas cuentan una vez). No incluye avisos informativos. Pasá el mouse por una fila para ver el detalle.'
NOTA_MIS = 'Solo los problemas asignados a tu usuario o a tus equipos. Cada problema cuenta una vez, aunque haya durado varias ventanas.'


def tablero(h):
    h = _css(h, CSS)
    h = _rep(h, '  <section class="bloque">\n    <div class="titulo-filtro"><h2>Histórico de Alertas</h2>',
             '  <section class="bloque" id="b-fallas">\n    <div class="titulo-filtro"><h2>Distribución de fallas</h2></div>\n'
             '    <p class="bajada">Qué parte de los problemas corresponde a cada cliente, tipo de falla o causa.</p>\n'
             '    <div class="fallas" id="fallas"></div>\n  </section>\n\n'
             '  <section class="bloque">\n    <div class="titulo-filtro"><h2>Histórico de Alertas</h2>')
    h = _rep(h, '    pintarPasado(d);\n    pintarDetalle(d);\n',
             '    pintarPasado(d);\n    if (window.HeliosFallas) window.HeliosFallas(document.getElementById(\'fallas\'), d, function (t) { return frase(t); }, ' + json.dumps(NOTA_TABLERO, ensure_ascii=False) + ');\n    pintarDetalle(d);\n')
    i = h.rindex('</body>')
    return h[:i] + '<script>' + JS + '</script>\n' + h[i:]


def mis_alertas(h):
    h = _css(h, CSS)
    a = h.index('</main>')
    h = h[:a] + ('  <section class="bloque-mis" id="b-fallas">\n    <h2>Distribución de fallas</h2>\n'
                 '    <p class="bajada">Qué parte de tus problemas corresponde a cada cliente, tipo de falla o causa.</p>\n'
                 '    <div class="fallas" id="fallas"></div>\n  </section>\n') + h[a:]
    h = _rep(h, "    document.title = (n + c ? '(' + (n + c) + ') ' : '') + 'Helios · Mis alertas';\n",
             "    document.title = (n + c ? '(' + (n + c) + ') ' : '') + 'Helios · Mis alertas';\n"
             "    if (window.HeliosFallas) window.HeliosFallas(document.getElementById('fallas'), d, function (t) { return frase(t); }, " + json.dumps(NOTA_MIS, ensure_ascii=False) + ");\n")
    i = h.rindex('</body>')
    return h[:i] + '<script>' + JS + '</script>\n' + h[i:]


Q_MIS = """
    // Problemas de los últimos 30 días asignados a mí o a mis equipos (parche 36: "Distribución de fallas")
    env.DB.prepare(`SELECT h.tipo_alerta, h.cliente_id, h.servicio_id, h.canal_id,
                      CASE MIN(CASE h.severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END)
                        WHEN 1 THEN 'CRITICA' WHEN 2 THEN 'ALTA' WHEN 3 THEN 'MEDIA' ELSE 'BAJA' END AS severidad_maxima,
                      CASE WHEN h.fecha_resolucion IS NULL THEN 'ABIERTO' ELSE 'RESUELTO' END AS estado_incidente,
                      MIN(h.ventana_inicio) AS inicio, h.fecha_resolucion, MAX(h.motivo_resolucion) AS motivo_resolucion,
                      MAX(h.causa_resolucion) AS causa_resolucion,
                      ROUND((julianday(COALESCE(h.fecha_resolucion, p.ahora)) - julianday(MIN(h.ventana_inicio))) * 1440, 1) AS duracion_minutos
                    FROM alertas_historico h
                    CROSS JOIN (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora,
                                       strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-30 days') AS desde
                                FROM alerta_parametros WHERE id = 1) p
                    WHERE h.ventana_inicio >= p.desde AND h.severidad <> 'BAJA'
                      AND (h.asignado_usuario_id = ?1 OR h.asignado_equipo_id IN (${lista}))
                    GROUP BY h.tipo_alerta, h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id,
                             h.duracion_ventana_minutos, h.fecha_resolucion
                    LIMIT 500`).bind(yo.id),
"""


def aplicar(s):
    # Causa en los incidentes del tablero
    s = _rep(s, "    MAX(h.motivo_resolucion) AS motivo_resolucion,\n    COUNT(*) AS ventanas_afectadas,",
             "    MAX(h.motivo_resolucion) AS motivo_resolucion,\n    MAX(h.causa_resolucion) AS causa_resolucion,\n    COUNT(*) AS ventanas_afectadas,")
    # Incidentes propios en Mis alertas
    s = _rep(s, "    env.DB.prepare(Q_UMBRALES_TABLERO),\n  ]);\n  return {\n    umbrales: r[7].results,\n",
             "    env.DB.prepare(Q_UMBRALES_TABLERO)," + Q_MIS + "  ]);\n  return {\n    umbrales: r[7].results, incidentes: r[8].results,\n")
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    return s
