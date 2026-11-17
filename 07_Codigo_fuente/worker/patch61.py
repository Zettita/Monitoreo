# Parche 61 (17/11): pestaña Disponibilidad, pedido de Ale.
#   - Arriba, 3 tarjetas en lugar de la tarjeta grande con la barra: disponibilidad real contra el objetivo (con la diferencia en
#     puntos y la comparación con el período anterior), tiempo sin servicio contra el que permite el objetivo, y servicios y
#     clientes que cumplen.
#   - Abajo, lado a lado: "Cumplimiento del objetivo" en barras verticales (cumplen / cerca / lejos) y la evolución de la
#     disponibilidad general. Al tocar una barra, las tarjetas y la línea se recalculan solo con ese grupo de clientes (misma
#     cuenta que el servidor: promedio de los servicios ponderado por criticidad y minutos medidos) y aparece la lista del grupo.
#   - Distribución de fallas: los 3 cortes (cliente, tipo de falla, causa) a la vez, uno al lado del otro, en el tablero y en
#     Mis alertas. En "Por causa" solo las causas cargadas al resolver; lo abierto, lo que se normalizó solo y lo resuelto sin
#     causa va en una línea aparte ("Sin causa: …").
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
        raise SystemExit('patch61: se esperaban %d y hay %d de: %r' % (n, c, viejo[:90]))
    return h.replace(viejo, nuevo)


def _entre(h, ini, fin, nuevo):
    i = h.index(ini); j = h.index(fin, i)
    if h.count(ini) != 1:
        raise SystemExit('patch61: el inicio no es único: %r' % ini[:80])
    return h[:i] + nuevo + h[j:]


CSS_FALLAS = """<style>/* Distribución de fallas en 3 columnas (parche 61) */
.fallas-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 22px; }
.fallas-col { min-width: 0; }
.fallas-col h4 { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: var(--ink); }
.fallas-pie { margin: 8px 0 0; font-size: 12.5px; color: var(--ink-3); }
@media (max-width: 900px) { .fallas-cols { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>"""

CSS_DISPO = """<style>/* Disponibilidad: tarjetas y barras verticales (parche 61) */
.dk-fila { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.dk { border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: 4px; background: var(--panel); padding: 12px 16px; display: grid; gap: 4px; align-content: start; }
.dk.verde { border-left-color: var(--ok); } .dk.amarillo { border-left-color: var(--media); } .dk.rojo { border-left-color: var(--critica); }
.dk-rot { font-size: 13px; color: var(--ink-2); font-weight: 600; }
.dk-val { font-size: 28px; line-height: 1.15; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.dk-sub { font-size: 13px; color: var(--ink-2); line-height: 1.6; }
.dk-dif.menos { color: var(--critica-txt); font-weight: 600; } .dk-dif.mas { color: var(--ok-txt); font-weight: 600; }
.dk-grupo { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 0 0 10px; font-size: 14px; color: var(--ink-2); }
.dv-fila { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 12px; margin-bottom: 12px; }
.dv-panel { border: 1px solid var(--line); border-radius: 4px; background: var(--panel); padding: 14px 16px; min-width: 0; }
.dv-panel h3 { margin: 0 0 10px; font-size: 16px; font-weight: 600; }
.dv-barras { display: flex; gap: 14px; align-items: stretch; height: 230px; }
.dv-col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; border: 1px solid transparent; background: transparent; cursor: pointer; font: inherit; color: var(--ink); padding: 6px 4px; border-radius: 4px; }
.dv-col:hover:not(:disabled) { background: var(--track); }
.dv-col[aria-pressed="true"] { background: var(--track); border-color: var(--accent); }
.dv-col.apagada { opacity: .45; }
.dv-col:disabled { cursor: default; opacity: .55; }
.dv-col:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.dv-num { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dv-pista { flex: 1; width: 60%; max-width: 96px; display: flex; align-items: flex-end; border-bottom: 1px solid var(--line); }
.dv-pista i { display: block; width: 100%; border-radius: 3px 3px 0 0; }
.dv-pista i.verde { background: var(--ok); } .dv-pista i.amarillo { background: var(--media); } .dv-pista i.rojo { background: var(--critica); }
.dv-rot { font-size: 13px; color: var(--ink-2); text-align: center; line-height: 1.25; min-height: 33px; }
.dv-linea-panel .dd-linea { margin: 0; }
.dv-linea-panel .dd-linea h4 { font-weight: 500; color: var(--ink-2); }
@media (max-width: 900px) { .dv-fila { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 700px) { .dk-fila { grid-template-columns: minmax(0, 1fr); } .dv-barras { height: 190px; } }
</style>
</head>"""

FALLAS_PINTAR = r"""  function grupos(xs, clave) {
    var g = {};
    xs.forEach(function (i) {
      var k = clave(i);
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
    return filas;
  }
  function lista(filas, total) {
    var max = filas.reduce(function (m, x) { return Math.max(m, x.n); }, 0);
    return '<ul class="fallas-lista">' + filas.map(function (x) {
      var tip = x.nombre + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + ' (' + pct(x.n, total) + ')' + (x.graves ? ', ' + x.graves + (x.graves === 1 ? ' grave' : ' graves') : '') +
        (x.abiertos ? ', ' + x.abiertos + (x.abiertos === 1 ? ' abierto' : ' abiertos') : '') + '. Duraron ' + minTxt(x.minutos) + ' en total.';
      return '<li class="' + (x.otros ? 'otros' : '') + '" title="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '"><span class="nom">' + esc(x.nombre) + '</span>' +
        '<span class="fbar" aria-hidden="true"><i style="width:' + (max ? Math.max(2, Math.round(100 * x.n / max)) : 0) + '%"></i></span>' +
        '<span class="num"><b>' + pct(x.n, total) + '</b> · ' + x.n + '</span></li>';
    }).join('') + '</ul>';
  }
  function pintar(el) {
    var st = el._estado, d = el._datos, ahora = ms(d.ahora) || Date.now(), desde = desdeMs(st.periodo, ahora);
    var xs = (d.incidentes || []).filter(function (i) { return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION' && (d.periodo_fijo || ms(i.inicio) >= desde); });
    var abierto = function (i) { return i.estado_incidente === 'ABIERTO' || !i.fecha_resolucion; };
    var total = xs.length, graves = xs.filter(function (i) { return i.severidad_maxima === 'CRITICA'; }).length, abiertos = xs.filter(abierto).length;
    // Por causa: solo las causas cargadas al resolver. Lo demás no es una causa: se cuenta aparte.
    var conCausa = xs.filter(function (i) { return !!i.causa_resolucion; });
    var nAb = xs.filter(function (i) { return !i.causa_resolucion && abierto(i); }).length;
    var nNorm = xs.filter(function (i) { return !i.causa_resolucion && !abierto(i) && (i.motivo_resolucion === 'NORMALIZADA' || i.motivo_resolucion === 'CONDICION_DESAPARECIDA'); }).length;
    var nSin = total - conCausa.length - nAb - nNorm;
    var sinCausa = [nAb ? nAb + (nAb === 1 ? ' sigue abierto' : ' siguen abiertos') : '', nNorm ? nNorm + (nNorm === 1 ? ' se normalizó solo' : ' se normalizaron solos') : '',
      nSin ? nSin + (nSin === 1 ? ' resuelto sin causa cargada' : ' resueltos sin causa cargada') : ''].filter(Boolean).join(' · ');
    var seg = function (opciones, actual, clave, rotulo) {
      return '<div class="fallas-seg" role="group" aria-label="' + rotulo + '">' + opciones.map(function (o) {
        return '<button type="button" data-' + clave + '="' + o[0] + '" aria-pressed="' + (o[0] === actual) + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    };
    var col = function (titulo, cuerpo, pie) { return '<div class="fallas-col"><h4>' + titulo + '</h4>' + cuerpo + (pie ? '<p class="fallas-pie">' + pie + '</p>' : '') + '</div>'; };
    el.innerHTML = (d.periodo_fijo ? '' : '<div class="fallas-filtros">' + seg(PERIODOS, st.periodo, 'periodo', 'Período') + '</div>') +
      (total ? '<p class="fallas-total"><b>' + total + '</b>' + (total === 1 ? 'problema' : 'problemas') + (graves ? ' · ' + graves + (graves === 1 ? ' grave' : ' graves') : '') +
        (abiertos ? ' · ' + abiertos + (abiertos === 1 ? ' sigue abierto' : ' siguen abiertos') : '') + '</p>' +
        '<div class="fallas-cols">' +
          col('Por cliente', lista(grupos(xs, function (i) { return i.cliente_id; }), total)) +
          col('Por tipo de falla', lista(grupos(xs, function (i) { return el._tipo(i.tipo_alerta); }), total)) +
          col('Por causa', conCausa.length ? lista(grupos(conCausa, function (i) { return i.causa_resolucion; }), conCausa.length) : '<p class="fallas-vacio">Ningún problema del período tiene causa cargada.</p>',
            sinCausa ? 'Sin causa: ' + sinCausa + '.' : '') +
        '</div>'
        : '<p class="fallas-vacio">No hubo problemas en este período.</p>') +
      (el._nota ? '<p class="fallas-nota">' + el._nota + '</p>' : '');
  }
"""

DISPO_PINTAR = r"""function grupoResumen(cs, objetivo) {
    // Misma cuenta que el servidor (dispoCalcular): servicios ponderados por criticidad y por los minutos medidos
    var pp = 0, pm = 0, pw = 0, n = 0;
    cs.forEach(function (c) { (c.servicios || []).forEach(function (s) { pp += s.peso * s.minutos_perdidos; pm += s.peso * s.minutos_medidos; pw += s.peso; n++; }); });
    if (!pm) return null;
    var perd = pp / pw, perm = (1 - objetivo) * (pm / pw), consumo = perm > 0 ? perd / perm : (perd > 0 ? 99 : 0);
    return { disponibilidad: 1 - pp / pm, objetivo: objetivo, consumo: consumo, cumple: consumo <= 1 + 1e-12, estado: consumo <= 1 + 1e-12 ? 'verde' : consumo <= dispoAm + 1e-12 ? 'amarillo' : 'rojo',
      minutos_perdidos: Math.round(perd * 10) / 10, minutos_permitidos: Math.round(perm * 10) / 10, servicios_medidos: n };
  }
  function grupoTendencia(cs, obj) {
    // Línea del grupo: en cada paso, el promedio de sus clientes ponderado igual que arriba (el último punto da el número de la tarjeta)
    var paso = null, pts = {}, t0 = Infinity, t1 = -Infinity;
    cs.forEach(function (c) {
      var tn = c.tendencia; if (!tn || !tn.pt) return;
      if (paso == null) paso = tn.paso_minutos;
      if (tn.paso_minutos !== paso) return;
      var w = (c.servicios || []).reduce(function (a, s) { return a + s.peso * s.minutos_medidos; }, 0) || 1, ini = Date.parse(tn.inicio_utc);
      tn.pt.forEach(function (p, k) {
        if (!p) return;
        var t = ini + k * paso * 60000; t0 = Math.min(t0, t); t1 = Math.max(t1, t);
        var x = pts[t] || (pts[t] = { s: 0, w: 0 }); x.s += p[0] * w; x.w += w;
      });
    });
    if (paso == null || t0 === Infinity) return null;
    var arr = [];
    for (var t = t0; t <= t1; t += paso * 60000) {
      var x = pts[t]; if (!x) { arr.push(null); continue; }
      var d = x.s / x.w, cons = (1 - d) / Math.max(1e-9, 1 - obj);
      arr.push([d, cons <= 1 + 1e-12 ? 0 : cons <= dispoAm + 1e-12 ? 1 : 2]);
    }
    return { inicio_utc: new Date(t0).toISOString(), paso_minutos: paso, pt: arr };
  }
  function pintarDispo(r) {
    var el = $('per-dispo'); if (!el) return;
    var dsp = r.disponibilidad;
    if (!dsp || !dsp.global) { el.innerHTML = '<p class="vacio">Todavía no hay datos para medir la disponibilidad en este período.</p>'; return; }
    var g = dsp.global, ant = r.disponibilidad_anterior, cfg = r.config_disponibilidad || {};
    dispoAm = cfg.umbral_amarillo || 1.5; dispoCtx = { tipo: r.tipo, ahora: r.ahora };
    var por = { verde: [], amarillo: [], rojo: [] };
    dsp.clientes.forEach(function (c) { (por[c.estado] || por.rojo).push(c); });
    if (dispoGrupo && !por[dispoGrupo].length) dispoGrupo = null;
    var sel = dispoGrupo ? por[dispoGrupo] : dsp.clientes;
    var x = dispoGrupo ? (grupoResumen(sel, g.objetivo) || g) : g;
    var etiqueta = dispoGrupo ? GRUPOS_D.filter(function (o) { return o[0] === dispoGrupo; })[0][1] : '';
    var svcs = []; sel.forEach(function (c) { svcs = svcs.concat(c.servicios || []); });
    var sCumplen = svcs.filter(function (s) { return s.cumple; }).length, cCumplen = sel.filter(function (c) { return c.cumple; }).length;
    var pts = function (v) { return Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (Math.abs(v) === 1 ? ' punto' : ' puntos'); };
    var dif = Math.round((x.disponibilidad - x.objetivo) * 10000) / 100;
    var difTxt = dif === 0 ? 'en el objetivo' : (dif > 0 ? '+' : '−') + pts(dif) + (dif > 0 ? ' sobre el objetivo' : ' bajo el objetivo');
    var cmp = '';
    if (!dispoGrupo && ant && ant.global) {
      var d2 = Math.round((g.disponibilidad - ant.global.disponibilidad) * 10000) / 100;
      cmp = d2 === 0 ? 'Igual que ' + esc(ant.titulo) : (d2 > 0 ? '▲ ' : '▼ ') + pts(d2) + ' vs. ' + esc(ant.titulo);
    }
    var kpi = function (cls, rot, val, sub) { return '<div class="dk ' + cls + '"><span class="dk-rot">' + rot + '</span><b class="dk-val">' + val + '</b><span class="dk-sub">' + sub + '</span></div>'; };
    var cab = dispoGrupo ? '<div class="dk-grupo">Mostrando <b>' + etiqueta + '</b> (' + sel.length + (sel.length === 1 ? ' cliente' : ' clientes') + ')<button type="button" class="btn chico" data-dd-grupo="' + dispoGrupo + '">Ver todos</button></div>' : '';
    var kpis = '<div class="dk-fila">' +
      kpi(x.estado, 'Disponibilidad real', pctD(x.disponibilidad, x.objetivo),
        chipEstado(x) + ' Objetivo ' + pctD(x.objetivo) + '<br><span class="dk-dif ' + (dif >= 0 ? 'mas' : 'menos') + '">' + difTxt + '</span>' + (cmp ? ' · ' + cmp : '')) +
      kpi('', 'Tiempo sin servicio', minD(x.minutos_perdidos), 'El objetivo permite hasta ' + minD(x.minutos_permitidos) + (r.parcial ? '<br>Período en curso' : '')) +
      kpi('', 'Servicios que cumplen el objetivo', sCumplen + ' de ' + svcs.length, 'Clientes que cumplen: ' + cCumplen + ' de ' + sel.length) +
      '</div>';
    var maxN = Math.max(1, por.verde.length, por.amarillo.length, por.rojo.length);
    var barras = '<div class="dv-panel"><h3>Cumplimiento del objetivo</h3><div class="dv-barras" role="group" aria-label="Clientes según su disponibilidad">' +
      GRUPOS_D.map(function (o) {
        var k = o[0], n = por[k].length;
        return '<button type="button" class="dv-col' + (dispoGrupo && dispoGrupo !== k ? ' apagada' : '') + '" data-dd-grupo="' + k + '" aria-pressed="' + (dispoGrupo === k) + '"' + (n ? '' : ' disabled') +
          ' aria-label="' + o[1] + ': ' + n + (n === 1 ? ' cliente' : ' clientes') + '"><span class="dv-num">' + n + '</span>' +
          '<span class="dv-pista" aria-hidden="true"><i class="' + k + '" style="height:' + (n ? Math.max(4, Math.round(100 * n / maxN)) : 0) + '%"></i></span>' +
          '<span class="dv-rot">' + o[1] + '</span></button>';
      }).join('') + '</div></div>';
    var serie = dispoGrupo ? { cliente_id: etiqueta, objetivo: x.objetivo, tendencia: grupoTendencia(sel, x.objetivo) } : { cliente_id: 'todos los clientes', objetivo: g.objetivo, tendencia: g.tendencia };
    var linea = '<div class="dv-panel dv-linea-panel"><h3>' + (dispoGrupo ? 'Disponibilidad del grupo' : 'Disponibilidad general') + '</h3>' + lineaDispoHtml(serie, true) + '</div>';
    var htmlLista = dispoGrupo ? '<div class="dd-grupo"><div class="dd-grupo-cab"><b>' + etiqueta + ' (' + sel.length + ')</b></div>' + sel.map(clienteDispoHtml).join('') + '</div>' : '';
    el.innerHTML = '<div class="dispo">' + cab + kpis + '<div class="dv-fila">' + barras + linea + '</div>' + htmlLista + '</div>';
  }
  """


def _fallas(h):
    h = _entre(h, '  function pintar(el) {', "      (el._nota ? '<p class=\"fallas-nota\">' + el._nota + '</p>' : '');\n  }\n", FALLAS_PINTAR)
    # el resto de la función vieja (desde la línea del _nota) quedó repetido: se saca
    viejo_fin = "      (el._nota ? '<p class=\"fallas-nota\">' + el._nota + '</p>' : '');\n  }\n"
    assert h.count(viejo_fin) == 2, h.count(viejo_fin)
    k = h.index(viejo_fin, h.index(viejo_fin) + 1)
    h = h[:k] + h[k + len(viejo_fin):]
    h = _r(h, '</head>', CSS_FALLAS)
    return h


def _dispo(h):
    h = _entre(h, 'function pintarDispo(r) {', "document.addEventListener('click', function (ev) {\n    var b = ev.target.closest && ev.target.closest('[data-dd-grupo]')", DISPO_PINTAR)
    # la línea de evolución se dibuja también a media pantalla (al lado de las barras)
    h = _r(h, 'function lineaDispoHtml(c) {', 'function lineaDispoHtml(c, mitad) {')
    h = _r(h, "var cont = $('per-dispo'), W = Math.round(Math.max(300, Math.min(1400, ((cont && cont.clientWidth) || 800) - 32))), ancha = W >= 640;",
           "var cont = $('per-dispo'), anchoCont = (cont && cont.clientWidth) || 800, W = Math.round(Math.max(300, Math.min(1400, (mitad && anchoCont > 900 ? anchoCont * 0.6 - 12 : anchoCont) - 32))), ancha = W >= 640;")
    h = _r(h, ". Cada punto es la disponibilidad acumulada desde el inicio del período; el último es el número de arriba.</p></div>';", ".</p></div>';")
    h = _r(h, '</head>', CSS_DISPO)
    return h


def aplicar(s):
    s = _html(s, 'HTML', lambda h: _dispo(_fallas(h)))
    s = _html(s, 'MIS_ALERTAS_HTML', _fallas)
    return s
