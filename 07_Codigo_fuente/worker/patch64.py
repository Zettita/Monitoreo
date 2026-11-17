# Parche 64 (17/11): quinta tanda de ajustes de Ale.
#   Detalle de la alerta: sin "Todavía no hay movimientos…", sin la ayuda del mensaje del comunicado ni el aviso de "Modo
#   simulado" del ticket; los títulos de Comunicar, Generar ticket y del correo dicen solo "problema · cliente"; el botón del
#   correo dice "Template correo"; en Comunicar, Equipos y Personas son dos desplegables que muestran lo elegido.
#   Disponibilidad: estados "Cumple / En riesgo / No cumple" (sin "cerca" ni "lejos") y "Desvío vs. objetivo: −5,09 puntos".
#   Histórico: cliente y servicio en columnas separadas y filtro por servicio.
#   Operaciones: "Por cliente / Por tipo de falla" solo cambia "Problemas activos" (la lista de abajo no se vuelve a dibujar);
#   "Alertas por estado" y "Problemas activos" en dos tarjetas; la leyenda de estados más compacta.
#   Distribución de fallas: tortas (con su leyenda) en lugar de barras, en el tablero y en Mis alertas.
#   Pre-alertas: "Efectividad de los avisos" con un anillo de acierto y la lista con el resultado de cada aviso en etiquetas.
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
        raise SystemExit('patch64: se esperaban %d y hay %d de: %r' % (n, c, viejo[:100]))
    return h.replace(viejo, nuevo)


def _entre(h, ini, fin, nuevo):
    if h.count(ini) != 1:
        raise SystemExit('patch64: el inicio no es único: %r' % ini[:80])
    i = h.index(ini); j = h.index(fin, i)
    return h[:i] + nuevo + h[j:]


CSS_ALERTA = """<style>/* Comunicar: desplegables de equipos y personas (parche 64) */
.k-desp { border: 1px solid var(--line-input); border-radius: 3px; background: var(--input-bg); }
.k-desp > summary { list-style: none; cursor: pointer; min-height: 40px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; font-size: 14px; color: var(--ink); }
.k-desp > summary::-webkit-details-marker { display: none; }
.k-desp > summary::after { content: "▾"; color: var(--ink-3); }
.k-desp[open] > summary::after { content: "▴"; }
.k-desp > summary.vacio { color: var(--ink-3); }
.k-desp .listas-com { border-top: 1px solid var(--line); padding: 6px 10px; max-height: 260px; overflow: auto; }
</style>
</head>"""

CSS_TABLERO = """<style>/* Operaciones: dos tarjetas (parche 64) */
.activos { border: 0; background: transparent; padding: 0; }
.act-grid { gap: 14px; }
.act-panel { border: 1px solid var(--line); border-radius: 4px; background: var(--panel); padding: 14px 16px; }
.dona-wrap { justify-content: flex-start; }
.dona-ley { flex: 0 1 260px; max-width: 260px; min-width: 200px; }
/* Pre-alertas: efectividad de los avisos (parche 64) */
.pre-res { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid var(--line); margin-bottom: 10px; }
.pre-anillo { --p: 0; width: 104px; height: 104px; border-radius: 50%; flex: none; display: grid; place-content: center; text-align: center;
  background: radial-gradient(closest-side, var(--panel) 76%, transparent 77% 100%), conic-gradient(var(--ok) calc(var(--p) * 1%), var(--track) 0); }
.pre-anillo b { font-size: 22px; font-weight: 600; color: var(--ink); line-height: 1.1; }
.pre-anillo span { font-size: 11.5px; color: var(--ink-2); }
.pre-datos { flex: 1; min-width: 200px; display: grid; gap: 8px; }
.pre-datos h3 { margin: 0; font-size: 15px; font-weight: 600; }
.pre-fila { display: flex; flex-wrap: wrap; gap: 6px; }
.pre-fila span { font-size: 13px; padding: 3px 9px; border-radius: 3px; background: var(--track); color: var(--ink-2); }
.pre-fila span b { color: var(--ink); margin-right: 3px; }
.pre-fila span.ok { background: var(--ok-bg); color: var(--ok-txt); } .pre-fila span.ok b { color: inherit; }
.pre-fila span.obs { background: var(--pre-bg); color: var(--pre-txt); } .pre-fila span.obs b { color: inherit; }
.pre-datos p { margin: 0; font-size: 13.5px; color: var(--ink-2); }
.pre-vacio { margin: 0; color: var(--ink-3); font-size: 14px; }
.pre-hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.pre-hist li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 8px 10px; border-left: 3px solid var(--line); background: var(--track); border-radius: 3px; }
.pre-hist li.CONFIRMADA { border-left-color: var(--ok); } .pre-hist li.EN_OBSERVACION { border-left-color: var(--pre); } .pre-hist li.NO_SE_CUMPLIO { border-left-color: var(--ink-3); }
.pre-hist li b { font-size: 13.5px; font-weight: 600; color: var(--ink); display: block; }
.pre-hist li .sub { font-size: 12.5px; color: var(--ink-2); }
.pre-hist .pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
.pre-hist .pill.CONFIRMADA { background: var(--ok-bg); color: var(--ok-txt); }
.pre-hist .pill.EN_OBSERVACION { background: var(--pre-bg); color: var(--pre-txt); }
.pre-hist .pill.NO_SE_CUMPLIO { background: var(--panel); color: var(--ink-2); border: 1px solid var(--line); }
</style>
</head>"""

CSS_TORTAS = """<style>/* Distribución de fallas en tortas (parche 64) */
.torta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
.torta svg { width: 128px; height: 128px; flex: none; }
.torta-ley { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 150px; display: grid; gap: 5px; }
.torta-ley li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; gap: 7px; align-items: center; font-size: 13px; color: var(--ink); }
.torta-ley i { width: 12px; height: 12px; border-radius: 3px; }
.torta-ley .nom { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.torta-ley b { font-variant-numeric: tabular-nums; }
.torta-ley .c { color: var(--ink-3); font-variant-numeric: tabular-nums; min-width: 1.6em; text-align: right; }
</style>
</head>"""

TORTA = r"""  var PALETA_FALLAS = ['#0F766E', '#2563EB', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];
  function lista(filas, total) {
    // Torta: una porción por fila (las que sobran van juntas en "Otros", en gris)
    var R = 25, C = 2 * Math.PI * R, acc = 0;
    var tip = function (x) {
      return x.nombre + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + ' (' + pct(x.n, total) + ')' + (x.graves ? ', ' + x.graves + (x.graves === 1 ? ' grave' : ' graves') : '') +
        (x.abiertos ? ', ' + x.abiertos + (x.abiertos === 1 ? ' abierto' : ' abiertos') : '') + '. Duraron ' + minTxt(x.minutos) + ' en total.';
    };
    filas.forEach(function (x, i) { x.col = x.otros ? '#94A3B8' : PALETA_FALLAS[i % PALETA_FALLAS.length]; });
    var segs = filas.map(function (x) {
      var largo = C * x.n / total;
      var seg = '<circle r="' + R + '" cx="50" cy="50" fill="none" stroke="' + x.col + '" stroke-width="' + (2 * R) + '" stroke-dasharray="' + largo.toFixed(3) + ' ' + (C - largo).toFixed(3) +
        '" stroke-dashoffset="' + (-acc).toFixed(3) + '" transform="rotate(-90 50 50)"><title>' + esc(tip(x)) + '</title></circle>';
      acc += largo; return seg;
    }).join('');
    return '<div class="torta"><svg viewBox="0 0 100 100" role="img" aria-label="' + esc(filas.map(function (x) { return x.nombre + ' ' + pct(x.n, total); }).join(', ')) + '">' + segs + '</svg>' +
      '<ul class="torta-ley">' + filas.map(function (x) {
        return '<li title="' + esc(tip(x)) + '"><i style="background:' + x.col + '"></i><span class="nom">' + esc(x.nombre) + '</span><b>' + pct(x.n, total) + '</b><span class="c">' + x.n + '</span></li>';
      }).join('') + '</ul></div>';
  }
"""

BALANCE = r"""    var obs = todas.length - conf.length - noc.length, cerrados = conf.length + noc.length;
    var tasa = cerrados ? Math.round(100 * conf.length / cerrados) : null;
    $('balance').innerHTML = todas.length
      ? '<div class="pre-res"><div class="pre-anillo" style="--p:' + (tasa || 0) + '" role="img" aria-label="' + (tasa == null ? 'Todavía sin resultado' : tasa + ' % de los avisos se confirmaron') + '"><b>' + (tasa == null ? '—' : tasa + ' %') + '</b><span>de acierto</span></div>' +
        '<div class="pre-datos"><h3>Efectividad de los avisos · últimas 48 h</h3><div class="pre-fila"><span><b>' + todas.length + '</b>' + (todas.length === 1 ? 'aviso' : 'avisos') + '</span>' +
        '<span class="ok"><b>' + conf.length + '</b>' + (conf.length === 1 ? 'confirmado' : 'confirmados') + '</span><span><b>' + noc.length + '</b>' + (noc.length === 1 ? 'no confirmado' : 'no confirmados') + '</span>' +
        (obs ? '<span class="obs"><b>' + obs + '</b>en observación</span>' : '') + '</div>' +
        '<p>' + (conf.length ? 'Anticipación promedio: <b>' + minutos(ant) + '</b> antes de la alerta.' : 'Todavía no hay avisos confirmados.') + '</p></div></div>'
      : '<p class="pre-vacio">Sin avisos anticipados en las últimas 48 horas.</p>';
    var RES = { CONFIRMADA: function (r) { return 'Confirmada · ' + minutos(r.minutos_anticipacion) + ' antes'; }, NO_SE_CUMPLIO: function () { return 'No se confirmó'; }, EN_OBSERVACION: function () { return 'En observación'; } };
    $('historial').innerHTML = todas.slice(0, 6).map(function (r) {
      return '<li class="' + esc(r.resultado) + '"><div><b>' + esc(TENDENCIA[r.metrica] || r.tipo_prealerta) + '</b><span class="sub">' + esc(r.cliente_id) + ', ' + esc(servicio(r)) + ' · ' + diaHora(r.inicio) + '</span></div>' +
        '<span class="pill ' + esc(r.resultado) + '">' + esc((RES[r.resultado] || function () { return r.resultado; })(r)) + '</span></li>';
    }).join('');
"""


def _alerta(h):
    h = _r(h, "$('hilo').innerHTML = '<li class=\"vacio\">Todavía no hay movimientos: nadie la derivó ni la comentó.</li>'; return;", "$('hilo').innerHTML = ''; return;")
    h = _r(h, "$('k-titulo').textContent = 'Comunicar incidente · ' + tituloCorreo();", "$('k-titulo').textContent = tituloCorreo();")
    h = _r(h, '<small class="ayuda">Llega como aviso al celular o a la PC (las primeras líneas) y completo en Helios.</small>', '')
    h = _r(h, "'Modo simulado: hasta que esté la integración con ' + x.nombre + ', Helios inventa el número del ticket (queda marcado como simulado).'", "''")
    h = _r(h, "$('t-titulo').textContent = 'Generar ticket · ' + tituloCorreo();", "$('t-titulo').textContent = tituloCorreo();")
    h = _r(h, "'<button class=\"btn\" data-acc=\"correo\">Template correo alerta «' + esc(frase(u.tipo_alerta, u) + ' · ' + u.cliente_id) + '»</button>'",
           "'<button class=\"btn\" data-acc=\"correo\">Template correo</button>'")
    h = _r(h, "$('m-titulo').textContent = 'Template correo alerta «' + tituloCorreo() + '»';", "$('m-titulo').textContent = tituloCorreo();")
    # Equipos y personas: dos desplegables que muestran lo elegido
    h = _r(h, '<div class="campo"><span>Equipos</span><div class="listas-com" id="k-listas"></div></div>',
           '<div class="campo"><span>Equipos</span><details class="k-desp"><summary id="k-listas-res"></summary><div class="listas-com" id="k-listas"></div></details></div>')
    h = _r(h, '<details class="k-personas"><summary>Sumar personas sueltas</summary><div class="listas-com" id="k-personas"></div></details>',
           '<details class="k-desp"><summary id="k-personas-res"></summary><div class="listas-com" id="k-personas"></div></details>')
    h = _r(h, "  $('f-comunicar').addEventListener('submit', function (ev) {",
           "  function resumenComunicar() {\n"
           "    [['k-listas', 'k-listas-res', 'Elegí uno o más equipos'], ['k-personas', 'k-personas-res', 'Ninguna']].forEach(function (o) {\n"
           "      var n = Array.prototype.map.call(document.querySelectorAll('#' + o[0] + ' input:checked'), function (x) { var b = x.parentNode.querySelector('b'); return b ? b.textContent : ''; });\n"
           "      var s = $(o[1]); s.textContent = n.length ? (n.length > 3 ? n.slice(0, 3).join(', ') + ' y ' + (n.length - 3) + ' más' : n.join(', ')) : o[2]; s.className = n.length ? '' : 'vacio';\n"
           "    });\n"
           "  }\n"
           "  $('f-comunicar').addEventListener('change', function (ev) { if (ev.target.type === 'checkbox') resumenComunicar(); });\n"
           "  $('f-comunicar').addEventListener('submit', function (ev) {")
    h = _r(h, "    pintarTicketComunicado();\n    k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado;",
           "    resumenComunicar();\n    pintarTicketComunicado();\n    k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado;")
    h = _r(h, '</head>', CSS_ALERTA)
    return h


def _fallas(h):
    h = _entre(h, '  function lista(filas, total) {', '  function pintar(el) {', TORTA)
    h = _r(h, '</head>', CSS_TORTAS)
    return h


def _tablero(h):
    # Disponibilidad: estados más profesionales
    h = _r(h, "var TXT_ESTADO_D = { verde: 'Cumple', amarillo: 'No cumple · cerca', rojo: 'No cumple · lejos' };",
           "var TXT_ESTADO_D = { verde: 'Cumple', amarillo: 'En riesgo', rojo: 'No cumple' };")
    h = _r(h, "var GRUPOS_D = [['verde', 'Cumplen el objetivo'], ['amarillo', 'No cumplen, pero están cerca'], ['rojo', 'No cumplen y están lejos']];",
           "var GRUPOS_D = [['verde', 'Cumplen el objetivo'], ['amarillo', 'En riesgo'], ['rojo', 'No cumplen el objetivo']];")
    h = _r(h, "var estadoTxt = { verde: 'cumpliendo el objetivo', amarillo: 'por debajo del objetivo, pero cerca', rojo: 'por debajo del objetivo y lejos' }[ult.e];",
           "var estadoTxt = { verde: 'cumpliendo el objetivo', amarillo: 'en riesgo de no cumplir el objetivo', rojo: 'por debajo del objetivo' }[ult.e];")
    h = _r(h, "var difTxt = dif === 0 ? 'en el objetivo' : (dif > 0 ? '+' : '−') + pts(dif) + (dif > 0 ? ' sobre el objetivo' : ' bajo el objetivo');",
           "var difTxt = dif === 0 ? 'Justo en el objetivo' : 'Desvío vs. objetivo: ' + (dif > 0 ? '+' : '−') + pts(dif);")
    # Histórico: cliente y servicio separados, y filtro por servicio
    h = _r(h, "'<thead><tr><th>Gravedad</th><th>Problema</th><th>Cliente y servicio</th><th>Inicio</th><th>Duración</th>'",
           "'<thead><tr><th>Gravedad</th><th>Problema</th><th>Cliente</th><th>Servicio</th><th>Inicio</th><th>Duración</th>'")
    h = _r(h, "esc(r.cliente_id) + ', ' + esc(servicio(r)) +\n          '</td><td>' + diaHora(r.inicio)",
           "esc(r.cliente_id) + '</td><td>' + esc(servicio(r)) +\n          '</td><td>' + diaHora(r.inicio)")
    h = _r(h, '<label>Gravedad<select id="hf-sev">', '<label>Servicio<select id="hf-srv"><option value="">Todos</option></select></label><label>Gravedad<select id="hf-sev">')
    h = _r(h, "    var c = $('hf-cli').value, s = $('hf-sev').value, t = $('hf-tipo').value;\n    return (!c || i.cliente_id === c) &&",
           "    var c = $('hf-cli').value, s = $('hf-sev').value, t = $('hf-tipo').value, v = $('hf-srv').value;\n    return (!c || i.cliente_id === c) && (!v || i.servicio_id === v) &&")
    h = _r(h, "    var cl = {}, tp = {};\n    (d.incidentes || []).forEach(function (i) { if (i.tipo_alerta === 'SIN_PREDICCION' || !enRango(i, rh)) return; cl[i.cliente_id] = 1; tp[i.tipo_alerta] = 1; });\n"
              "    [['hf-cli', cl, function (k) { return k; }], ['hf-tipo', tp, function (k) { return frase(k); }]].forEach(function (o) {",
           "    var cl = {}, tp = {}, sv = {};\n    (d.incidentes || []).forEach(function (i) { if (i.tipo_alerta === 'SIN_PREDICCION' || !enRango(i, rh)) return; cl[i.cliente_id] = 1; tp[i.tipo_alerta] = 1; sv[i.servicio_id] = 1; });\n"
           "    [['hf-cli', cl, function (k) { return k; }], ['hf-srv', sv, function (k) { return SERVICIO[k] || k; }], ['hf-tipo', tp, function (k) { return frase(k); }]].forEach(function (o) {")
    h = _r(h, "sel.innerHTML = '<option value=\"\">' + (o[0] === 'hf-cli' ? 'Todos' : 'Todos') + '</option>'", "sel.innerHTML = '<option value=\"\">Todos</option>'")
    h = _r(h, "  ['hf-cli', 'hf-sev', 'hf-tipo'].forEach(function (id) {", "  ['hf-cli', 'hf-srv', 'hf-sev', 'hf-tipo'].forEach(function (id) {")
    # Operaciones: el corte (cliente / tipo de falla) solo vuelve a dibujar "Problemas activos"
    h = _r(h, "function pintarActivos(a, vis, todas) {\n    var el = $('activos'); if (!el) return;",
           "var ultimoActivos = null;\n  function pintarActivos(a, vis, todas) {\n    var el = $('activos'); if (!el) return;\n    ultimoActivos = [a, vis, todas];")
    h = _r(h, "    if (c) { activosCorte = c.getAttribute('data-act-corte'); activosFiltro = null; }",
           "    if (c) {\n      activosCorte = c.getAttribute('data-act-corte');\n"
           "      if (activosFiltro === null && ultimoActivos) { pintarActivos.apply(null, ultimoActivos); return; }   // la lista de abajo no cambia\n"
           "      activosFiltro = null;\n    }")
    # Pre-alertas
    h = _entre(h, "    $('balance').innerHTML = todas.length", "    return activas;", BALANCE)
    h = _r(h, '<ul class="historial" id="historial"></ul>', '<ul class="pre-hist" id="historial"></ul>')
    h = _r(h, '</head>', CSS_TABLERO)
    return _fallas(h)


def aplicar(s):
    s = _html(s, 'ALERTA_HTML', _alerta)
    s = _html(s, 'HTML', _tablero)
    s = _html(s, 'MIS_ALERTAS_HTML', _fallas)
    return s
