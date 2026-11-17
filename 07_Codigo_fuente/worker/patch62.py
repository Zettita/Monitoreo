# Parche 62 (17/11): Operaciones e Histórico, pedido de Ale.
#   Operaciones > Alertas abiertas (según el ejemplo que mandó): a la izquierda una dona "Alertas por estado" (sin asignar,
#   asignada sin tomar, en curso, devuelta; tocar un estado filtra la lista) y a la derecha "Problemas activos" con las barras
#   por cliente o por tipo de falla divididas por gravedad ("1 grave, 2 leves"). Sin el texto explicativo de arriba de la lista.
#   Histórico: la gravedad va en su propia columna (separada del problema); filtros por cliente, gravedad y problema que valen
#   para la lista, el tiempo de resolución y "Clientes con más problemas"; y "Clientes con más problemas" ya no tiene su propio
#   Desde / Hasta: usa el del Histórico.
# Solo página. Sin SQL.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _r(h, viejo, nuevo, n=1):
    c = h.count(viejo)
    if c != n:
        raise SystemExit('patch62: se esperaban %d y hay %d de: %r' % (n, c, viejo[:90]))
    return h.replace(viejo, nuevo)


def _entre(h, ini, fin, nuevo):
    if h.count(ini) != 1:
        raise SystemExit('patch62: el inicio no es único: %r' % ini[:80])
    i = h.index(ini); j = h.index(fin, i)
    return h[:i] + nuevo + h[j:]


CSS = """<style>/* Operaciones: dona por estado y problemas activos (parche 62) */
.act-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px 24px; }
.act-panel { min-width: 0; }
.act-panel > h3, .act-panel .activos-cab h3 { margin: 0 0 10px; font-size: 16px; font-weight: 600; }
.dona-wrap { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: center; }
.dona { width: 170px; height: 170px; flex: none; }
.dona-seg { cursor: pointer; transition: opacity .15s; }
.dona-seg.apagado { opacity: .25; }
.dona-n { font-size: 30px; font-weight: 600; fill: var(--ink); }
.dona-t { font-size: 12px; fill: var(--ink-2); }
.dona-ley { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; min-width: 180px; flex: 1; }
.dona-ley button { display: flex; align-items: center; gap: 8px; width: 100%; border: 1px solid transparent; background: transparent; color: var(--ink); font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 4px; cursor: pointer; text-align: left; }
.dona-ley button:hover:not(:disabled) { background: var(--track); }
.dona-ley button[aria-pressed="true"] { background: var(--track); border-color: var(--accent); }
.dona-ley button:disabled { opacity: .5; cursor: default; }
.dona-ley i { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.dona-ley b { margin-left: auto; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) { .act-grid { grid-template-columns: minmax(0, 1fr); } }
/* Histórico: filtros (parche 62) */
.hist-filtros { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: end; margin: 0 0 12px; }
.hist-filtros label { display: grid; gap: 4px; font-size: 13px; color: var(--ink-2); font-weight: 600; }
.hist-filtros select { min-width: 190px; height: 40px; padding: 0 10px; border: 1px solid var(--line-input); border-radius: 3px; background: var(--input-bg); color: var(--ink); font: inherit; font-size: 14px; font-weight: 400; }
</style>
</head>"""

ESTADOS = r"""var COLOR_EST = { sin: 'var(--alta)', asignada: 'var(--pre)', curso: 'var(--accent)', devuelta: 'var(--morado-txt)' };
  function estadosHtml(todas) {
    var n = {}, total = 0;
    todas.forEach(function (g) { if (g.sev !== 'BAJA') { var k = estadoClave(g); n[k] = (n[k] || 0) + 1; total++; } });
    var R = 54, C = 2 * Math.PI * R, acc = 0;
    var arcos = ESTADOS_ACT.filter(function (o) { return n[o[0]]; }).map(function (o) {
      var largo = C * n[o[0]] / total;
      var seg = '<circle class="dona-seg' + (activosEstado && activosEstado !== o[0] ? ' apagado' : '') + '" data-act-estado="' + o[0] + '" r="' + R + '" cx="70" cy="70" fill="none" stroke="' + COLOR_EST[o[0]] +
        '" stroke-width="24" stroke-dasharray="' + largo.toFixed(2) + ' ' + (C - largo).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + o[1] + ': ' + n[o[0]] + '</title></circle>';
      acc += largo; return seg;
    }).join('');
    var centro = activosEstado ? (n[activosEstado] || 0) : total;
    return '<div class="dona-wrap"><svg class="dona" viewBox="0 0 140 140" role="img" aria-label="Alertas por estado: ' + ESTADOS_ACT.map(function (o) { return o[1] + ' ' + (n[o[0]] || 0); }).join(', ') + '">' +
      (total ? arcos : '<circle r="' + R + '" cx="70" cy="70" fill="none" stroke="var(--track)" stroke-width="24"/>') +
      '<text x="70" y="70" text-anchor="middle" class="dona-n">' + centro + '</text><text x="70" y="88" text-anchor="middle" class="dona-t">' + (activosEstado ? 'de ' + total : (total === 1 ? 'alerta' : 'alertas')) + '</text></svg>' +
      '<ul class="dona-ley">' + ESTADOS_ACT.map(function (o) {
        return '<li><button type="button" data-act-estado="' + o[0] + '" aria-pressed="' + (activosEstado === o[0]) + '"' + (n[o[0]] ? '' : ' disabled') + '><i style="background:' + COLOR_EST[o[0]] + '"></i><span>' + o[1] + '</span><b>' + (n[o[0]] || 0) + '</b></button></li>';
      }).join('') + (activosEstado ? '<li><button type="button" data-act-estado="">Ver todas</button></li>' : '') + '</ul></div>';
  }
  """

ACTIVOS = r"""function pintarActivos(a, vis, todas) {
    var el = $('activos'); if (!el) return;
    todas = todas || a;
    var reales = a.filter(function (g) { return g.sev !== 'BAJA'; });
    var todasReales = todas.filter(function (g) { return g.sev !== 'BAJA'; });
    el.hidden = !todasReales.length;
    if (!todasReales.length) return;
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
    var derecha = !reales.length ? '<p class="activos-total">No hay alertas en este estado.</p>' :
      '<p class="activos-total"><b>' + reales.length + '</b>' + (reales.length === 1 ? 'problema activo' : 'problemas activos') + (graves ? ' · ' + graves + (graves === 1 ? ' grave' : ' graves') : '') + '</p>' +
      filas.map(function (x) {
        var partes = SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return x[s[0]] + ' ' + (x[s[0]] === 1 ? s[1] : s[2]); });
        var tip = nombreActivo(x.k) + ': ' + x.n + (x.n === 1 ? ' problema' : ' problemas') + (partes.length ? ' (' + partes.join(', ') + ')' : '');
        return '<button type="button" class="act-fila" data-act-fila="' + esc(x.k) + '" aria-pressed="' + (activosFiltro === x.k) + '" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
          '<span class="nom">' + esc(nombreActivo(x.k)) + '</span>' +
          '<span class="act-pista" aria-hidden="true"><span class="act-barra" style="width:' + Math.max(8, Math.round(100 * x.n / max)) + '%">' +
            SEV_ACT.filter(function (s) { return x[s[0]]; }).map(function (s) { return '<i class="' + s[0] + '" style="flex:' + x[s[0]] + '"></i>'; }).join('') + '</span></span>' +
          '<span class="num">' + (partes.length ? partes.join(', ') : x.n) + '</span></button>';
      }).join('') +
      '<ul class="act-leyenda" aria-label="Qué significa cada color">' + SEV_ACT.filter(function (s) { return reales.some(function (g) { return g.sev === s[0]; }); })
        .map(function (s) { return '<li><i class="' + s[0] + '"></i>' + s[1].charAt(0).toUpperCase() + s[1].slice(1) + '</li>'; }).join('') + '</ul>' +
      (activosFiltro !== null ? '<div class="act-filtro">Mostrando solo <b>' + esc(nombreActivo(activosFiltro)) + '</b> en la lista de abajo <button type="button" class="btn chico" data-act-quitar="1">Quitar filtro</button></div>' : '');
    el.innerHTML = '<div class="act-grid"><div class="act-panel"><h3>Alertas por estado</h3>' + estadosHtml(todas) + '</div>' +
      '<div class="act-panel"><div class="activos-cab"><h3>Problemas activos</h3><div class="fallas-seg" role="group" aria-label="Ver por">' + seg + '</div></div>' + derecha + '</div></div>';
  }
  """

FILTROS_HIST = ('<div class="hist-filtros" id="hist-filtros">'
                '<label>Cliente<select id="hf-cli"><option value="">Todos</option></select></label>'
                '<label>Gravedad<select id="hf-sev"><option value="">Todas</option><option value="CRITICA">Grave</option><option value="ALTA">Importante</option><option value="MEDIA">Leve</option></select></label>'
                '<label>Problema<select id="hf-tipo"><option value="">Todos</option></select></label></div>')


def _tablero(h):
    # ---- Operaciones: dona + problemas activos ----
    h = _entre(h, 'function estadosHtml(todas) {', "  document.addEventListener('click', function (ev) {\n    var b = ev.target.closest && ev.target.closest('[data-act-estado]')", ESTADOS)
    h = _r(h, "    activosEstado = b.getAttribute('data-act-estado') || null;",
           "    var v = b.getAttribute('data-act-estado') || null; activosEstado = activosEstado === v ? null : v;")
    h = _entre(h, 'function pintarActivos(a, vis, todas) {', "  document.addEventListener('click', function (ev) {\n    var c = ev.target.closest && ev.target.closest('[data-act-corte]')", ACTIVOS)
    h = _r(h, "      ? 'Las alertas en curso, por prioridad (gravedad y criticidad del servicio), con su estado y quién las tiene. Se actualiza sola cada 2 minutos.'\n", "      ? ''\n")

    # ---- Histórico: Clientes con más problemas sin su propio período ----
    i = h.index('<div class="filtro-fechas" data-filtro="cli">'); j = h.index('</div></div>', i)
    h = h[:i] + h[j + len('</div>'):]
    h = _r(h, '<div class="titulo-filtro chico"><h3>Clientes con más problemas</h3></div>', '<h3>Clientes con más problemas</h3>')
    h = _r(h, "  ['hist', 'cli'].forEach(function (k) {", "  ['hist'].forEach(function (k) {")
    h = _r(h, "    // Clientes con más problemas, en su propio período\n    var rc = rango(d, 'cli'), cli = {}, enCurso = {};",
           "    // Clientes con más problemas: mismo período y filtros del histórico (parche 62)\n    var rc = rh, cli = {}, enCurso = {};")
    h = _r(h, "      if (!enRango(i, rc)) return;\n      var c = cli[i.cliente_id]", "      if (!enRango(i, rc) || !pasaHist(i)) return;\n      var c = cli[i.cliente_id]")

    # ---- Histórico: filtros por cliente, gravedad y problema ----
    h = _r(h, '    <p class="bajada" id="bajada-pasado" hidden>', '    ' + FILTROS_HIST + '\n    <p class="bajada" id="bajada-pasado" hidden>')
    h = _r(h, "  function pintarPasado(d) {\n    var rh = rango(d, 'hist'), txt = textoRango(rh);\n    var res = (d.incidentes || []).filter(function (i) { return i.estado_incidente === 'RESUELTO' && enRango(i, rh); })",
           "  function pasaHist(i) {\n"
           "    var c = $('hf-cli').value, s = $('hf-sev').value, t = $('hf-tipo').value;\n"
           "    return (!c || i.cliente_id === c) && (!s || i.severidad_maxima === s) && (!t || i.tipo_alerta === t);\n"
           "  }\n"
           "  function opcionesHist(d, rh) {\n"
           "    // Las listas muestran lo que hubo en el período (y lo ya elegido, aunque no haya)\n"
           "    var cl = {}, tp = {};\n"
           "    (d.incidentes || []).forEach(function (i) { if (i.tipo_alerta === 'SIN_PREDICCION' || !enRango(i, rh)) return; cl[i.cliente_id] = 1; tp[i.tipo_alerta] = 1; });\n"
           "    [['hf-cli', cl, function (k) { return k; }], ['hf-tipo', tp, function (k) { return frase(k); }]].forEach(function (o) {\n"
           "      var sel = $(o[0]), v = sel.value; if (v) o[1][v] = 1;\n"
           "      sel.innerHTML = '<option value=\"\">' + (o[0] === 'hf-cli' ? 'Todos' : 'Todos') + '</option>' + Object.keys(o[1]).sort(function (a, b) { return o[2](a) < o[2](b) ? -1 : 1; })\n"
           "        .map(function (k) { return '<option value=\"' + esc(k) + '\"' + (k === v ? ' selected' : '') + '>' + esc(o[2](k)) + '</option>'; }).join('');\n"
           "    });\n"
           "  }\n"
           "  ['hf-cli', 'hf-sev', 'hf-tipo'].forEach(function (id) { $(id).addEventListener('change', function () { if (datos) pintarPasado(datos); }); });\n"
           "  function pintarPasado(d) {\n    var rh = rango(d, 'hist'), txt = textoRango(rh);\n    opcionesHist(d, rh);\n"
           "    var res = (d.incidentes || []).filter(function (i) { return i.estado_incidente === 'RESUELTO' && enRango(i, rh) && pasaHist(i); })")
    # Problema y gravedad en columnas separadas
    h = _r(h, "'<thead><tr><th>Problema</th><th>Cliente y servicio</th>", "'<thead><tr><th>Gravedad</th><th>Problema</th><th>Cliente y servicio</th>")
    h = _r(h, "return '<tr><td>' + sev(r.severidad_maxima) + ' ' + esc(frase(r.tipo_alerta)) + '</td><td>' + esc(r.cliente_id)",
           "return '<tr><td>' + sev(r.severidad_maxima) + '</td><td>' + esc(frase(r.tipo_alerta)) + '</td><td>' + esc(r.cliente_id)")
    h = _r(h, '</head>', CSS)
    return h


def aplicar(s):
    return _html(s, 'HTML', _tablero)
