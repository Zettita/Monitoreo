# Parche 66 (18/11): la ventana "Comparar con otro período" con el mismo estilo que la pestaña Disponibilidad (parche 61).
#   - Antes (parche 56) cada período se mostraba como una tarjeta grande con una barra de gasto del margen, que la pantalla principal ya no tiene.
#   - Ahora, para el período actual y para el comparado, las mismas tres tarjetas de la pantalla principal: Disponibilidad real (con el desvío contra
#     el objetivo; la del período actual suma la diferencia contra el comparado), Tiempo sin servicio y Servicios que cumplen el objetivo.
#   - Abajo, lado a lado como en la principal: "Cumplimiento del objetivo" en barras verticales (cumplen / cerca / lejos) con una barra por período
#     (el actual sólido y el comparado rayado) y "Disponibilidad general" con las dos líneas superpuestas. Sigue el aviso de la diferencia y la
#     tabla por cliente.
#   Solo página; sin SQL.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _entre(h, ini, fin, nuevo):
    assert h.count(ini) == 1, ('patch66: el inicio no es único', ini[:70], h.count(ini))
    i = h.index(ini); j = h.index(fin, i)
    return h[:i] + nuevo + h[j:]


def _r(h, viejo, nuevo, n=1):
    assert h.count(viejo) == n, ('patch66: se esperaban %d y hay %d de' % (n, h.count(viejo)), viejo[:80])
    return h.replace(viejo, nuevo)


CSS = """/* Ventana de comparación con el estilo de Disponibilidad (parche 66) */
.cmp-barras { display: flex; gap: 14px; align-items: stretch; height: 230px; }
.cmp-grupo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.cmp-pares { flex: 1; display: flex; align-items: stretch; justify-content: center; gap: 8px; border-bottom: 1px solid var(--line); }
.cmp-b { width: 42%; max-width: 60px; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.cmp-b b { height: 28px; font-size: 18px; line-height: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.cmp-b i { display: block; width: 100%; border-radius: 3px 3px 0 0; }
.cmp-b i.verde { background-color: var(--ok); } .cmp-b i.amarillo { background-color: var(--media); } .cmp-b i.rojo { background-color: var(--critica); }
.cmp-b.b i { background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, .55) 0 3px, transparent 3px 7px); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12); }
.cmp-b.b b { color: var(--ink-2); }
.cmp-mues { display: inline-block; width: 18px; height: 12px; border-radius: 2px; background: var(--ink-3); vertical-align: -1px; margin-right: 6px; }
.cmp-mues.b { background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, .7) 0 3px, transparent 3px 7px); }
.cmp-sec { margin-top: 22px; }
@media (max-width: 700px) { .cmp-barras { height: 190px; } }
"""

JS = r"""  // ---- Comparación con el estilo de la pantalla principal (parche 66) ----
  function resumenComp(r) {   // lo que muestran las tres tarjetas de Disponibilidad, para un período
    var dsp = r.disponibilidad, g = dsp && dsp.global; if (!g) return null;
    var svcs = []; dsp.clientes.forEach(function (c) { svcs = svcs.concat(c.servicios || []); });
    var por = { verde: 0, amarillo: 0, rojo: 0 }; dsp.clientes.forEach(function (c) { por[c.estado || 'rojo']++; });
    return { g: g, por: por, sCumplen: svcs.filter(function (s) { return s.cumple; }).length, sTotal: svcs.length,
      cCumplen: dsp.clientes.filter(function (c) { return c.cumple; }).length, cTotal: dsp.clientes.length };
  }
  function kpiComp(cls, rot, val, sub) { return '<div class="dk ' + cls + '"><span class="dk-rot">' + rot + '</span><b class="dk-val">' + val + '</b><span class="dk-sub">' + sub + '</span></div>'; }
  function kpisComp(r, otro) {   // "otro": el período contra el que se compara (solo para el actual)
    var x = resumenComp(r);
    if (!x) return '<div class="dk-fila">' + kpiComp('', 'Disponibilidad real', '—', 'No hay datos medidos en este período') + '</div>';
    var g = x.g, dif = Math.round((g.disponibilidad - g.objetivo) * 10000) / 100, cmp = '', o = otro && otro.disponibilidad && otro.disponibilidad.global;
    if (o) { var d2 = Math.round((g.disponibilidad - o.disponibilidad) * 10000) / 100; cmp = d2 === 0 ? 'Igual que el comparado' : (d2 > 0 ? '▲ ' : '▼ ') + fmtPuntos(d2) + ' vs. el comparado'; }
    var difTxt = dif === 0 ? 'Justo en el objetivo' : 'Desvío vs. objetivo: ' + (dif > 0 ? '+' : '−') + fmtPuntos(dif);
    return '<div class="dk-fila">' +
      kpiComp(g.estado, 'Disponibilidad real', pctD(g.disponibilidad, g.objetivo), chipEstado(g) + ' Objetivo ' + pctD(g.objetivo) + '<br><span class="dk-dif ' + (dif >= 0 ? 'mas' : 'menos') + '">' + difTxt + '</span>' + (cmp ? ' · ' + cmp : '')) +
      kpiComp('', 'Tiempo sin servicio', minD(g.minutos_perdidos), 'El objetivo permite hasta ' + minD(g.minutos_permitidos) + (r.parcial ? '<br>Período en curso' : '')) +
      kpiComp('', 'Servicios que cumplen el objetivo', x.sCumplen + ' de ' + x.sTotal, 'Clientes que cumplen: ' + x.cCumplen + ' de ' + x.cTotal) + '</div>';
  }
  function barrasComp(xa, xb) {   // una barra por período en cada grupo: el actual sólido y el comparado rayado
    var max = Math.max(1, xa.por.verde, xa.por.amarillo, xa.por.rojo, xb.por.verde, xb.por.amarillo, xb.por.rojo);
    function barra(k, n, cual) {
      var f = n ? Math.max(0.04, n / max) : 0;
      return '<span class="cmp-b ' + cual + '" title="' + (cual === 'a' ? 'Actual' : 'Comparado') + ': ' + n + (n === 1 ? ' cliente' : ' clientes') + '"><b>' + n + '</b><i class="' + k + '" style="height:calc((100% - 28px) * ' + f.toFixed(3) + ')"></i></span>';
    }
    return '<div class="cmp-barras" role="group" aria-label="Clientes según su disponibilidad, en el período actual y en el comparado">' +
      GRUPOS_D.map(function (o) { var k = o[0]; return '<div class="cmp-grupo"><div class="cmp-pares">' + barra(k, xa.por[k], 'a') + barra(k, xb.por[k], 'b') + '</div><span class="dv-rot">' + o[1] + '</span></div>'; }).join('') + '</div>' +
      '<div class="cmp-ley"><span><span class="cmp-mues a"></span>Período actual</span><span><span class="cmp-mues b"></span>Comparado (rayado)</span></div>';
  }
  function anchoGrafComp() {   // el gráfico ocupa el panel de la derecha (3/5 del ancho) o todo el ancho en pantallas chicas
    var cont = $('cmp-resultado').clientWidth || 760;
    return Math.round(Math.max(300, Math.min(1100, window.innerWidth > 900 ? (cont - 12) * 0.6 - 36 : cont - 36)));
  }
"""

JS_PINTAR = r"""  function pintarComparacion() {
    var a = resumen, b = comp.b, el = $('cmp-resultado'); if (!a || !b) { el.innerHTML = ''; return; }
    var xa = resumenComp(a), xb = resumenComp(b), na = diasEntre(a.desde, a.hasta), nb = diasEntre(b.desde, b.hasta), notas = [];
    if (na !== nb) notas.push('Los períodos tienen distinta duración (' + na + (na === 1 ? ' día' : ' días') + ' y ' + nb + (nb === 1 ? ' día' : ' días') + '). La disponibilidad es un porcentaje y se puede comparar, pero un período corto se mueve más con un solo problema.');
    if (b.desde <= a.hasta && b.hasta >= a.desde) notas.push('Los períodos se superponen: algunos días cuentan en los dos.');
    var dif = '';
    if (xa && xb) {
      var d = Math.round((xa.g.disponibilidad - xb.g.disponibilidad) * 10000) / 100;
      dif = '<div class="cmp-dif ' + (d > 0 ? 'mejor' : d < 0 ? 'peor' : '') + '">' + (d === 0 ? 'La disponibilidad es igual en los dos períodos.' : (d > 0 ? '▲ El período actual mejoró ' : '▼ El período actual empeoró ') + fmtPuntos(d) + ' respecto del comparado.') + '</div>';
    } else dif = '<div class="cmp-dif">No hay datos medidos en alguno de los períodos para comparar.</div>';
    var titA = rangoTxt(a.desde, a.hasta) + (a.parcial ? ' (hasta ahora)' : ''), titB = rangoTxt(b.desde, b.hasta) + (b.parcial ? ' (hasta ahora)' : '');
    el.innerHTML = notas.map(function (t) { return '<p class="cmp-nota">' + esc(t) + '</p>'; }).join('') + dif +
      '<h3 class="cmp-sec">Período actual · ' + esc(titA) + '</h3>' + kpisComp(a, b) +
      '<h3 class="cmp-sec">Comparado · ' + esc(titB) + '</h3>' + kpisComp(b, null) +
      '<div class="dv-fila"><div class="dv-panel"><h3>Cumplimiento del objetivo</h3>' +
      (xa && xb ? barrasComp(xa, xb) : '<p class="vacio">Faltan datos medidos en alguno de los dos períodos para comparar el cumplimiento.</p>') + '</div>' +
      '<div class="dv-panel dv-linea-panel"><h3>Disponibilidad general</h3>' + graficoComp(a, b) + '</div></div>' + tablaComp(a, b);
  }
"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    # las tarjetas grandes con la barra de gasto se reemplazan por las ayudas de la pantalla principal
    h = _entre(h, "  function tarjetaComp(clase, rot, r) {", "  function fmtPuntos(v) {", "")
    h = _entre(h, "  function pintarComparacion() {", "  $('btn-comparar').addEventListener('click', abrirComparar);", JS_PINTAR)
    h = _r(h, "  function fmtPuntos(v) {", JS + "  function fmtPuntos(v) {")
    h = _r(h, "Math.round(Math.max(300, Math.min(1200, $('cmp-resultado').clientWidth || 760)))", "anchoGrafComp()")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
