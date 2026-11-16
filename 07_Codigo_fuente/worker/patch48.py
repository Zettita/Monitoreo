# Parche 48 (dashboard gerencial, ajustes pedidos después de ver el tablero):
#   1. Alertas abiertas: filtro por estado (Todas / Sin asignar / Asignada sin tomar / En curso / Devuelta, con cuántas hay de cada una),
#      para ver cuáles se están trabajando y cuáles no. Se combina con el filtro por cliente o tipo de falla del gráfico.
#   2. "Disponibilidad y resumen del período" sube: va debajo de "Estado por cliente" y arriba de "Últimas 24 horas". Se sacan los cuatro
#      recuadros (problemas del período, graves, siguen abiertos, tardó en resolverse); queda la disponibilidad y la distribución de fallas.
#   3. Semáforo: las barras de cada cliente y servicio ya no cambian de color por cuánto margen usaron sino por estado: verde = cumple,
#      amarillo = no cumple pero está cerca de volver al objetivo, rojo = no cumple y está lejos. "Cerca" = usó hasta el 150 % del margen de
#      errores del mes (editable en "Cómo se mide la disponibilidad", campo "Amarillo hasta"; se guarda en el mismo JSON, sin script nuevo).
#   4. Resumen de clientes en barras horizontales (verde / amarillo / rojo, con porcentaje y cantidad de clientes): los clientes de cada grupo
#      aparecen recién al tocar la barra, para que con muchos clientes no haya que desplazarse sin fin.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS_TABLERO = """/* Ajustes del tablero gerencial (parche 48) */
.dd-chip.verde { background: var(--ok-bg); color: var(--ok-txt); }
.dd-chip.amarillo { background: var(--media-bg); color: var(--media-txt); }
.dd-chip.rojo { background: var(--critica-bg); color: var(--critica-txt); }
.dd-barra i.verde { background: var(--ok); }
.dd-barra i.amarillo { background: var(--media); }
.dd-barra i.rojo { background: var(--critica); }
.dd-resumen { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); padding: 12px 14px; margin-bottom: 12px; }
.dd-resumen h3 { margin: 0 0 6px; font-size: 15px; }
.dd-rbarra { display: grid; grid-template-columns: minmax(150px, 260px) minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; width: 100%; text-align: left;
  border: 0; background: transparent; color: var(--ink); font: inherit; padding: 6px; border-radius: 6px; cursor: pointer; }
.dd-rbarra:hover:not(:disabled) { background: var(--track); }
.dd-rbarra[aria-pressed="true"] { background: var(--track); box-shadow: inset 0 0 0 2px var(--accent); }
.dd-rbarra:disabled { cursor: default; opacity: .6; }
.dd-rbarra:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.dd-rnom { font-size: 13.5px; }
.dd-rpista { display: block; height: 12px; border-radius: 6px; background: var(--track); overflow: hidden; }
.dd-rpista i { display: block; height: 100%; border-radius: 6px; }
.dd-rpista i.verde { background: var(--ok); }
.dd-rpista i.amarillo { background: var(--media); }
.dd-rpista i.rojo { background: var(--critica); }
.dd-rnum { font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dd-rnum b { color: var(--ink); }
.dd-ayuda { margin: 6px 6px 0; font-size: 12.5px; color: var(--ink-3); }
.dd-grupo { margin-bottom: 12px; }
.dd-grupo-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 14px; }
.act-estados { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; }
.act-etq { font-size: 13px; color: var(--ink-2); }
.act-estados .fallas-seg button b { margin-left: 4px; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .dd-rbarra { grid-template-columns: minmax(0, 1fr) auto; }
  .dd-rbarra .dd-rpista { grid-column: 1 / -1; grid-row: 2; }
}
"""

JS_ESTADOS = r"""  var ESTADOS_ACT = [['sin', 'Sin asignar'], ['asignada', 'Asignada sin tomar'], ['curso', 'En curso'], ['devuelta', 'Devuelta']];
  var activosEstado = null;
  function estadoClave(g) {
    if (g.sev === 'BAJA') return 'info';
    if (!g.abiertas.length) return 'curso';
    if (g.asig) return 'asignada';
    if (devolucion(g)) return 'devuelta';
    return 'sin';
  }
  function filtrarEstado(a) { return activosEstado === null ? a : a.filter(function (g) { return estadoClave(g) === activosEstado; }); }
  function estadosHtml(todas) {
    var n = {}, total = 0;
    todas.forEach(function (g) { if (g.sev !== 'BAJA') { var k = estadoClave(g); n[k] = (n[k] || 0) + 1; total++; } });
    return '<div class="act-estados"><span class="act-etq">Estado:</span><div class="fallas-seg" role="group" aria-label="Filtrar por estado">' +
      [[null, 'Todas']].concat(ESTADOS_ACT).map(function (o) {
        return '<button type="button" data-act-estado="' + (o[0] || '') + '" aria-pressed="' + (o[0] === activosEstado) + '">' + o[1] + ' <b>' + (o[0] === null ? total : (n[o[0]] || 0)) + '</b></button>';
      }).join('') + '</div></div>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-act-estado]'); if (!b) return;
    activosEstado = b.getAttribute('data-act-estado') || null;
    if (ultimoCasos) pintarCasos(ultimoCasos[0], ultimoCasos[1]);
  });
"""

JS_DISPO = r"""  // ---- Disponibilidad (parches 45 y 48): semáforo por cliente y servicio, y resumen de clientes por estado ----
  function pctD(v, obj) {
    var p = v * 100, t = Math.round(p * 100) / 100;
    if (obj != null && (t >= obj * 100 - 1e-9) !== (v >= obj - 1e-12)) t = Math.floor(p * 1000) / 1000;   // que el redondeo no esconda si cumple o no
    return t.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' %';
  }
  function minD(m) { return (Math.round(m * 10) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' min'; }
  function barraUso(c, estado) { return '<span class="dd-barra" aria-hidden="true"><i class="' + (estado || '') + '" style="width:' + Math.max(c > 0 ? 3 : 0, Math.min(100, Math.round(c * 100))) + '%"></i></span>'; }
  var TXT_ESTADO_D = { verde: 'Cumple', amarillo: 'No cumple · cerca', rojo: 'No cumple · lejos' };
  function chipEstado(x) { var e = x.estado || (x.cumple ? 'verde' : 'rojo'); return '<span class="dd-chip ' + e + '">' + TXT_ESTADO_D[e] + '</span>'; }
  function usoTxt(x) {
    return 'Usó ' + minD(x.minutos_perdidos) + ' de los ' + minD(x.minutos_permitidos) + ' que permite el mes (' + (x.consumo > 9.99 ? 'más de 1.000' : Math.round(x.consumo * 100).toLocaleString('es-AR')) + ' %)';
  }
  var dispoGrupo = null;
  var GRUPOS_D = [['verde', 'Cumplen el objetivo'], ['amarillo', 'No cumplen, pero están cerca'], ['rojo', 'No cumplen y están lejos']];
  function clienteDispoHtml(c) {
    return '<details class="dd-cli"><summary><span class="dd-nom">' + esc(c.cliente_id) + '</span><span class="dd-pct">' + pctD(c.disponibilidad, c.objetivo) + '</span>' +
      chipEstado(c) + barraUso(c.consumo, c.estado) + '<span class="dd-uso">' + usoTxt(c) + '</span></summary>' +
      '<div class="dd-detalle"><p>Objetivo del mes para ' + esc(c.cliente_id) + ': <b>' + pctD(c.objetivo) + '</b>. Cada servicio cuenta según su criticidad.</p>' +
      '<div class="tabla-scroll"><table class="dd-tabla"><thead><tr><th>Servicio</th><th>Criticidad</th><th class="n">Disponibilidad</th><th class="n">Objetivo</th><th class="n">Ventanas con problema</th><th class="n">Sin servicio</th></tr></thead><tbody>' +
      c.servicios.map(function (s) {
        var vent = [s.graves ? s.graves + (s.graves === 1 ? ' grave' : ' graves') : '', s.importantes ? s.importantes + (s.importantes === 1 ? ' importante' : ' importantes') : '', s.leves ? s.leves + (s.leves === 1 ? ' leve' : ' leves') : ''].filter(Boolean).join(', ') || 'ninguna';
        return '<tr><td>' + esc(SERV_CORTO[s.servicio_id] || s.servicio_id) + '</td><td>' + esc({ ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }[s.criticidad] || s.criticidad) + '</td><td class="n">' + pctD(s.disponibilidad, s.objetivo) + ' ' + chipEstado(s) + '</td>' +
          '<td class="n">' + pctD(s.objetivo) + '</td><td class="n">' + vent + '</td><td class="n">' + minD(s.minutos_perdidos) + '</td></tr>';
      }).join('') + '</tbody></table></div></div></details>';
  }
  function pintarDispo(r) {
    var el = $('per-dispo'); if (!el) return;
    var dsp = r.disponibilidad;
    if (!dsp || !dsp.global) { el.innerHTML = '<p class="vacio">Todavía no hay datos para medir la disponibilidad en este período.</p>'; return; }
    var g = dsp.global, ant = r.disponibilidad_anterior, cfg = r.config_disponibilidad || {};
    var cmp = '';
    if (ant && ant.global) {
      var dif = Math.round((g.disponibilidad - ant.global.disponibilidad) * 10000) / 100;
      cmp = dif === 0 ? 'Igual que ' + esc(ant.titulo) + '.' : (dif > 0 ? '▲ Mejoró ' : '▼ Empeoró ') + Math.abs(dif).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (Math.abs(dif) === 1 ? ' punto' : ' puntos') + ' respecto de ' + esc(ant.titulo) + ' (' + pctD(ant.global.disponibilidad, g.objetivo) + ').';
    } else if (ant) cmp = 'No hay datos de ' + esc(ant.titulo) + ' para comparar.';
    var pg = cfg.pesos_gravedad || {}, am = cfg.umbral_amarillo || 1.5;
    var porcent = function (v) { return (Math.round(v * 1000) / 10).toLocaleString('es-AR') + ' %'; };
    var n = dsp.clientes.length, por = { verde: [], amarillo: [], rojo: [] };
    dsp.clientes.forEach(function (c) { (por[c.estado] || por.rojo).push(c); });
    if (dispoGrupo && !por[dispoGrupo].length) dispoGrupo = null;
    var htmlResumen = '<div class="dd-resumen" role="group" aria-label="Clientes según su disponibilidad"><h3>Clientes según su disponibilidad</h3>' +
      GRUPOS_D.map(function (o) {
        var k = o[0], cant = por[k].length, p = n ? 100 * cant / n : 0;
        return '<button type="button" class="dd-rbarra" data-dd-grupo="' + k + '" aria-pressed="' + (dispoGrupo === k) + '"' + (cant ? '' : ' disabled') + '>' +
          '<span class="dd-rnom">' + o[1] + '</span><span class="dd-rpista" aria-hidden="true"><i class="' + k + '" style="width:' + (cant ? Math.max(2, Math.round(p)) : 0) + '%"></i></span>' +
          '<span class="dd-rnum"><b>' + Math.round(p).toLocaleString('es-AR') + ' %</b> · ' + cant + (cant === 1 ? ' cliente' : ' clientes') + '</span></button>';
      }).join('') +
      '<p class="dd-ayuda">Tocá una barra para ver los clientes de ese grupo. Verde: usó hasta el 100 % del margen de errores del mes. Amarillo: hasta el ' + Math.round(am * 100).toLocaleString('es-AR') + ' %. Rojo: más.</p></div>';
    var etiqueta = dispoGrupo ? GRUPOS_D.filter(function (o) { return o[0] === dispoGrupo; })[0][1] : '';
    var htmlLista = dispoGrupo ? '<div class="dd-grupo"><div class="dd-grupo-cab"><b>' + etiqueta + ' (' + por[dispoGrupo].length + ')</b><button type="button" class="btn chico" data-dd-grupo="' + dispoGrupo + '">Cerrar</button></div>' +
      por[dispoGrupo].map(clienteDispoHtml).join('') + '</div>' : '';
    el.innerHTML = '<div class="dispo">' +
      '<div class="dd-global"><div class="dd-grande"><b>' + pctD(g.disponibilidad, g.objetivo) + '</b><span>disponibilidad · ' + esc(r.titulo) + (r.parcial ? ' (hasta ahora)' : '') + '</span></div>' +
      '<div class="dd-lineas"><p>' + chipEstado(g) + ' Objetivo del mes: <b>' + pctD(g.objetivo) + '</b>' + (g.servicios_medidos ? ' · ' + g.servicios_medidos + (g.servicios_medidos === 1 ? ' servicio medido' : ' servicios medidos') : '') + '</p>' +
      barraUso(g.consumo, g.estado) + '<p>' + usoTxt(g) + '.</p>' + (cmp ? '<p>' + cmp + '</p>' : '') + '</div></div>' +
      htmlResumen + htmlLista +
      '<p class="dd-nota">Se mide en ventanas de 15 minutos de cada servicio: una ventana con una alerta Grave cuenta como no disponible (' + porcent(pg.CRITICA != null ? pg.CRITICA : 1) + '), una Importante cuenta ' + porcent(pg.ALTA != null ? pg.ALTA : 0.5) + ' y una Leve ' + porcent(pg.MEDIA != null ? pg.MEDIA : 0) +
      '. No se cuentan los datos tardíos ni los clientes sin historia. La barra muestra qué parte del margen de errores del mes se usó (un día o una semana se comparan contra el margen del mes). ' +
      (puedo('admin_umbrales') ? 'El objetivo y la forma de medir se cambian en Administración > Umbrales.' : 'El objetivo y la forma de medir los define el Administrador.') + '</p></div>';
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-dd-grupo]'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-dd-grupo'); dispoGrupo = dispoGrupo === k ? null : k;
    if (resumen) pintarDispo(resumen);
  });

"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    h = _rep(h, "grid-template-columns: minmax(70px, 110px) 96px 84px minmax(110px, 1fr) minmax(0, 1.3fr);", "grid-template-columns: minmax(70px, 110px) 96px 150px minmax(110px, 1fr) minmax(0, 1.3fr);")
    # ---- 2. La sección sube, debajo de "Estado por cliente", y se sacan los cuatro recuadros ----
    i = h.index('  <section class="bloque" id="b-periodo">'); j = h.index('  </section>\n', i) + len('  </section>\n')
    sec = h[i:j]; h = h[:i] + h[j:]
    sec = _rep(sec, '    <div class="per-kpis" id="per-kpis"></div>\n', '')
    ancla = '  <section class="bloque">\n    <h2>Últimas 24 horas</h2>'
    h = _rep(h, ancla, sec + '\n' + ancla)
    a = "    var xs = (r.incidentes || []).filter(function (i) { return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION'; });\n"
    i = h.index(a); b = '    pintarDispo(r);\n'; j = h.index(b, i) + len(b)
    h = h[:i] + b + h[j:]
    h = _rep(h, "      $('per-kpis').innerHTML = '<p class=\"vacio\">No se pudo cargar el período: '", "      $('per-dispo').innerHTML = '<p class=\"vacio\">No se pudo cargar el período: '")
    # ---- 3 y 4. Semáforo y resumen de clientes ----
    i = h.index('  // ---- Disponibilidad (parche 45) ----\n'); j = h.index('  // ---- Resumen por período (parche 44)')
    h = h[:i] + JS_DISPO + h[j:]
    # ---- 1. Filtro por estado en las alertas abiertas ----
    h = _rep(h, "  function filtrarActivos(a) {\n", JS_ESTADOS + "  function filtrarActivos(a) {\n")
    h = _rep(h, "  function pintarActivos(a, vis) {\n    var el = $('activos'); if (!el) return;\n    var reales = a.filter(function (g) { return g.sev !== 'BAJA'; });\n    el.hidden = !reales.length;\n    if (!reales.length) return;\n",
             "  function pintarActivos(a, vis, todas) {\n    var el = $('activos'); if (!el) return;\n    todas = todas || a;\n"
             "    var reales = a.filter(function (g) { return g.sev !== 'BAJA'; });\n    var todasReales = todas.filter(function (g) { return g.sev !== 'BAJA'; });\n"
             "    el.hidden = !todasReales.length;\n    if (!todasReales.length) return;\n"
             "    if (!reales.length) { el.innerHTML = '<div class=\"activos-cab\"><h3>Incidentes activos ahora</h3></div>' + estadosHtml(todas) + '<p class=\"activos-total\">No hay alertas en este estado.</p>'; return; }\n")
    h = _rep(h, "      '<p class=\"activos-total\"><b>' + reales.length", "      estadosHtml(todas) + '<p class=\"activos-total\"><b>' + reales.length")
    h = _rep(h, "    var vis = filtrarActivos(a);\n    pintarActivos(a, vis);\n", "    var base = filtrarEstado(a);\n    var vis = filtrarActivos(base);\n    pintarActivos(base, vis, a);\n")
    h = _rep(h, "'<tr><td class=\"vacio\">Todo en orden: ningún servicio tiene problemas en este momento.</td></tr>'",
             "'<tr><td class=\"vacio\">' + (a.length ? 'Ninguna alerta coincide con el filtro elegido.' : 'Todo en orden: ningún servicio tiene problemas en este momento.') + '</td></tr>'")
    return h


def admin(h):
    h = _rep(h, '    <div class="dispo-ejemplo" id="dp-ejemplo"></div>\n',
             '    <h3>Semáforo del tablero: cuándo un cliente pasa de amarillo a rojo</h3>\n'
             '    <p class="bajada">Verde: usó hasta el 100 % del margen de errores del mes (cumple). Amarillo: no cumple pero está cerca de volver. Rojo: no cumple y está lejos.</p>\n'
             '    <div class="dispo-pesos"><label class="campo"><span>Amarillo hasta (% del margen del mes)</span><input type="text" inputmode="decimal" id="dp-amarillo" autocomplete="off"></label></div>\n'
             '    <div class="dispo-ejemplo" id="dp-ejemplo"></div>\n')
    h = _rep(h, "  var DISPO_FAB = { pg: { CRITICA: 1, ALTA: 0.5, MEDIA: 0 }, pc: { ALTA: 3, MEDIA: 2, BAJA: 1 } };\n  function dispoCfg() { var d = (UMB && UMB.disponibilidad) || {}; return { pg: d.pesos_gravedad || DISPO_FAB.pg, pc: d.pesos_criticidad || DISPO_FAB.pc }; }",
             "  var DISPO_FAB = { pg: { CRITICA: 1, ALTA: 0.5, MEDIA: 0 }, pc: { ALTA: 3, MEDIA: 2, BAJA: 1 }, am: 1.5 };\n  function dispoCfg() { var d = (UMB && UMB.disponibilidad) || {}; return { pg: d.pesos_gravedad || DISPO_FAB.pg, pc: d.pesos_criticidad || DISPO_FAB.pc, am: d.umbral_amarillo || DISPO_FAB.am }; }")
    h = _rep(h, "los más críticos pesan más']\n    ];",
             "los más críticos pesan más'],\n      ['Semáforo del tablero', 'Verde hasta el 100 % del margen · amarillo hasta el ' + nTxt(Math.round(c.am * 100)) + ' % · rojo más', 'Verde: cumple el objetivo del mes. Amarillo: no cumple pero está cerca de volver. Rojo: no cumple y está lejos']\n    ];")
    h = _rep(h, "  function dpPoner(pg, pc) {\n", "  function dpPoner(pg, pc, am) {\n    $('dp-amarillo').value = String(Math.round(am * 1000) / 10).replace('.', ',');\n")
    h = _rep(h, "    $('dp-ejemplo').innerHTML = t;", "    var am = dpLeer('dp-amarillo') / 100;\n    if (am >= 1) t += ' <b>Semáforo:</b> verde mientras use hasta ' + minutosTxt(mins) + ' (el margen), amarillo hasta ' + minutosTxt(mins * am) + ' y rojo si pasa de ahí.';\n    $('dp-ejemplo').innerHTML = t;")
    h = _rep(h, "errorForm('dp-error'); dpPoner(c.pg, c.pc);", "errorForm('dp-error'); dpPoner(c.pg, c.pc, c.am);")
    h = _rep(h, "dpPoner(DISPO_FAB.pg, DISPO_FAB.pc); });", "dpPoner(DISPO_FAB.pg, DISPO_FAB.pc, DISPO_FAB.am); });")
    h = _rep(h, "    var pg = {}, pc = {};\n    ['CRITICA', 'ALTA', 'MEDIA'].forEach(function (k) { pg[k] = dpLeer('dp-' + k) / 100; });",
             "    var pg = {}, pc = {}, am = dpLeer('dp-amarillo') / 100;\n    ['CRITICA', 'ALTA', 'MEDIA'].forEach(function (k) { pg[k] = dpLeer('dp-' + k) / 100; });")
    h = _rep(h, "pc.ALTA, pc.MEDIA, pc.BAJA].some(function (n)", "pc.ALTA, pc.MEDIA, pc.BAJA, am].some(function (n)")
    h = _rep(h, "{ pesos_gravedad: pg, pesos_criticidad: pc })\n      .then(function () { $('dlg-dispo')", "{ pesos_gravedad: pg, pesos_criticidad: pc, umbral_amarillo: am })\n      .then(function () { $('dlg-dispo')")
    return h


def aplicar(s):
    # ---- Servidor: estado de cada cliente y servicio, y el límite del amarillo ----
    s = _rep(s, "pesos_criticidad: { ALTA: 3, MEDIA: 2, BAJA: 1 } };\n  let j = null;", "pesos_criticidad: { ALTA: 3, MEDIA: 2, BAJA: 1 }, umbral_amarillo: 1.5 };\n  let j = null;")
    s = _rep(s, "  return c;\n}\n// Lee la configuración;",
             "  if (j && Number.isFinite(Number(j.umbral_amarillo)) && Number(j.umbral_amarillo) >= 1 && Number(j.umbral_amarillo) <= 10) c.umbral_amarillo = Number(j.umbral_amarillo);\n  return c;\n}\n// Lee la configuración;")
    s = _rep(s, "// Disponibilidad de un período [desdeISO",
             "// Semáforo: verde = cumple (usó hasta todo el margen de errores del mes); amarillo = no cumple pero está cerca (hasta umbral_amarillo veces el margen); rojo = más\n"
             "function dispoEstado(consumo, umbralAmarillo) { return consumo <= 1 + 1e-12 ? 'verde' : consumo <= umbralAmarillo + 1e-12 ? 'amarillo' : 'rojo'; }\n"
             "// Disponibilidad de un período [desdeISO")
    s = _rep(s, "    lista[lista.length - 1].cumple = lista[lista.length - 1].consumo <= 1 + 1e-12;",
             "    lista[lista.length - 1].cumple = lista[lista.length - 1].consumo <= 1 + 1e-12;\n    lista[lista.length - 1].estado = dispoEstado(lista[lista.length - 1].consumo, cfg.umbral_amarillo);")
    s = _rep(s, "cumple: consumo <= 1 + 1e-12, minutos_perdidos", "cumple: consumo <= 1 + 1e-12, estado: dispoEstado(consumo, cfg.umbral_amarillo), minutos_perdidos")
    s = _rep(s, "  if (!d.instalado) return jsonError('Falta correr el script 20 (20_disponibilidad_d1.txt) en la consola de D1.', 409);\n",
             "  if (!d.instalado) return jsonError('Falta correr el script 20 (20_disponibilidad_d1.txt) en la consola de D1.', 409);\n"
             "  let am = b.umbral_amarillo;\n  if (am === undefined || am === null || am === '') am = d.cfg.umbral_amarillo;\n  am = Number(am);\n"
             "  if (!Number.isFinite(am) || am < 1 || am > 10) return jsonError('El límite del amarillo tiene que estar entre 100 % y 1.000 % del margen del mes.', 400);\n"
             "  am = Math.round(am * 1000) / 1000;\n")
    s = _rep(s, "JSON.stringify({ pesos_gravedad: pg, pesos_criticidad: pc })", "JSON.stringify({ pesos_gravedad: pg, pesos_criticidad: pc, umbral_amarillo: am })")
    s = _rep(s, "', Baja ' + pc.BAJA;", "', Baja ' + pc.BAJA + '; amarillo hasta ' + Math.round(am * 100) + ' % del margen';")
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
