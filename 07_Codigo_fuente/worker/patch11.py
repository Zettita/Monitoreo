# Paso 11 del build: textos más cortos y filtros de período en el histórico
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    # Incidentes de los últimos 30 días (para los filtros del histórico; la tabla es chica)
    s = rep(s, "WHERE julianday(i.inicio) >= p.ahora_jd - 7\nORDER BY (i.estado_incidente = 'ABIERTO') DESC, i.duracion_minutos DESC",
               "WHERE julianday(i.inicio) >= p.ahora_jd - 30\nORDER BY (i.estado_incidente = 'ABIERTO') DESC, i.duracion_minutos DESC")
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])

    # 1) y 2) Resumen superior
    h = rep(h, "titular = nCli === 1 ? 'Un cliente tiene problemas en este momento.' : nCli + ' clientes tienen problemas en este momento.';",
               "titular = nCli + (nCli === 1 ? ' cliente con problemas' : ' clientes con problemas');")
    a = h.index("      relato = 'Lo más urgente es <strong>'")
    b = h.index("    } else if (activas.length) {")
    h = h[:a] + '''      var quien = problemas[0].reconocida ? 'Tomado por ' + esc(problemas[0].quien || 'el equipo') : 'Sin asignar';
      relato = 'Urgente: <strong>' + esc(c.serie.cliente_id) + '</strong> | ' + esc(servicioCorto(c.serie)) + ' ' +
        esc(CORTA[c.principal.tipo] || frase(c.principal.tipo, c.principal.ult).toLowerCase()) + ' desde ' + hora(c.inicio) + ' (hace ' + corto(c.dur) + ') | ' + quien;
''' + h[b:]
    h = rep(h, """      relato += (relato ? ' ' : '') + 'Además, <strong>' + esc(a.cliente_id) + '</strong> viene empeorando en ' + esc(servicio(a)) +
        ' y podría generar una alerta en unos ' + a.minutos_estimados + ' minutos.';""",
               """      relato += (relato ? '<br>' : '') + '⚠️ Pre-alerta: <strong>' + esc(a.cliente_id) + '</strong> | ' + esc(servicioCorto(a)) + ' ' +
        esc((TENDENCIA[a.metrica] || '').toLowerCase()) + ' | alerta en ~' + a.minutos_estimados + 'm';""")
    h = rep(h, "  function minutos(m) {", """  // Versiones compactas para el resumen superior
  var SERV_CORTO = { TRANSFERENCIAS: 'Transferencias', PAGO_SERVICIOS: 'Pagos', RECARGA_CELULAR: 'Recarga', RECARGA_TRANSPORTE: 'Recarga transporte' };
  function servicioCorto(r) { return (SERV_CORTO[r.servicio_id] || r.servicio_id) + ' ' + (CANAL[r.canal_id] || r.canal_id); }
  function corto(m) {
    if (m == null || isNaN(m)) return '';
    m = Math.round(m);
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
  }
  function minutos(m) {""")

    # 3) Línea de tiempo
    h = rep(h, "<h2>Cómo estuvo cada cliente en las últimas 24 horas</h2>", "<h2>Últimas 24 horas</h2>")
    a = h.index('    <p class="bajada">Cada barrita es una ventana de 15 minutos.')
    b = h.index('</p>', a) + 4
    h = h[:a] + '    <p class="bajada">Ventanas de 15 minutos</p>' + h[b:]

    # 4) Alertas abiertas (sin el plegable), Pre-alertas e Histórico con filtro
    h = rep(h, "      <h2>Qué está pasando ahora</h2>", "      <h2>Alertas Abiertas</h2>")
    h = rep(h, """      <details class="detalle detalle-ahora" id="det-abiertas" open>
        <summary id="sum-abiertas">Ver las alertas abiertas, una por una</summary>
        <div class="cuerpo"><div class="tabla-scroll"><table id="t-abiertas"></table></div></div>
      </details>""", """      <div class="panel panel-tabla"><div class="tabla-scroll"><table id="t-abiertas"></table></div></div>""")
    a = h.index("    $('sum-abiertas').textContent = a.length")
    b = h.index("    $('t-abiertas').innerHTML", a)
    h = h[:a] + h[b:]
    h = rep(h, "      <h2>Qué podría pasar</h2>", "      <h2>Pre-Alertas</h2>")
    filtro = lambda nombre, defecto: ('<div class="filtro-fechas" data-filtro="' + nombre + '">'
        '<label>Desde <input type="date" data-lado="desde"></label>'
        '<label>Hasta <input type="date" data-lado="hasta"></label></div>')
    h = rep(h, "    <h2>Qué ya pasó</h2>", '    <div class="titulo-filtro"><h2>Histórico de Alertas</h2>' + filtro('hist', '24') + '</div>')

    # 5) Métricas
    h = rep(h, "<h3>Cuánto tarda en resolverse cada tipo de problema</h3>", "<h3>Tiempo de resolución por tipo</h3>")
    h = rep(h, "        <h3>Clientes con más problemas en 30 días</h3>", '        <div class="titulo-filtro chico"><h3>Clientes con más problemas</h3>' + filtro('cli', 'sem') + '</div>')

    # Histórico: todo se calcula en la página según el período elegido
    a = h.index("  function pintarPasado(d) {")
    b = h.index("  // ---- Detalle técnico ----")
    h = h[:a] + r"""  // Filtros del histórico: rango de fechas (días en hora de Argentina, ambos inclusive)
  var fmtISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function fechaArg(ms) { return fmtISO.format(new Date(ms)); }
  function corrDias(f, n) { var d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dm(f) { return f.slice(8, 10) + '/' + f.slice(5, 7); }
  var filtros = { hist: null, cli: null };
  var DIAS_DEFECTO = { hist: 1, cli: 29 };   // histórico: ayer y hoy; clientes: últimos 30 días
  function rango(d, k) {
    var hoy = fechaArg(ahoraMs(d)), min = corrDias(hoy, -29);
    if (!filtros[k]) filtros[k] = { desde: corrDias(hoy, -DIAS_DEFECTO[k]), hasta: hoy };
    var g = document.querySelector('.filtro-fechas[data-filtro="' + k + '"]');
    if (g) Array.prototype.forEach.call(g.querySelectorAll('input'), function (inp) {
      inp.min = min; inp.max = hoy; inp.value = filtros[k][inp.getAttribute('data-lado')];
    });
    return filtros[k];
  }
  function enRango(i, r) { var f = fechaArg(aFecha(i.inicio).getTime()); return f >= r.desde && f <= r.hasta; }
  function textoRango(r) { return r.desde === r.hasta ? 'el ' + dm(r.desde) : 'del ' + dm(r.desde) + ' al ' + dm(r.hasta); }
  function pintarPasado(d) {
    var rh = rango(d, 'hist'), txt = textoRango(rh);
    var res = (d.incidentes || []).filter(function (i) { return i.estado_incidente === 'RESUELTO' && enRango(i, rh); })
      .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
    $('bajada-pasado').textContent = res.length
      ? 'Se resolvieron ' + res.length + (res.length === 1 ? ' problema ' : ' problemas ') + txt + '.'
      : 'No hubo problemas resueltos ' + txt + '.';
    var max = Math.max.apply(null, res.map(function (r) { return r.duracion_minutos || 0; }).concat([1]));
    $('sum-resueltos').textContent = res.length
      ? 'Ver los ' + res.length + (res.length === 1 ? ' problema resuelto' : ' problemas resueltos') + ' ' + txt
      : 'No hubo problemas resueltos ' + txt;
    $('t-resueltos').innerHTML = res.length ? '<thead><tr><th>Problema</th><th>Cliente y servicio</th><th>Inicio</th><th>Duración</th></tr></thead><tbody>' +
      res.map(function (r) {
        return '<tr><td>' + sev(r.severidad_maxima) + ' ' + esc(frase(r.tipo_alerta)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) +
          '</td><td>' + diaHora(r.inicio) + '</td><td><div class="dur"><div class="b ' + esc(r.severidad_maxima) + '" style="width:' +
          Math.max(3, Math.round(90 * (r.duracion_minutos || 0) / max)) + 'px"></div><span>' + minutos(r.duracion_minutos) + '</span></div></td></tr>';
      }).join('') + '</tbody>' : '<tr><td class="vacio">Nada para mostrar.</td></tr>';
    // Tiempo de resolución por tipo, en el mismo período
    var por = {};
    res.forEach(function (r) {
      if (r.tipo_alerta === 'SIN_PREDICCION') return;
      var p = por[r.tipo_alerta] || (por[r.tipo_alerta] = { tipo: r.tipo_alerta, n: 0, total: 0 });
      p.n++; p.total += r.duracion_minutos || 0;
    });
    var m = Object.keys(por).map(function (k) { var p = por[k]; p.prom = p.total / p.n; return p; })
      .sort(function (a, b) { return b.prom - a.prom; });
    var mx = Math.max.apply(null, m.map(function (r) { return r.prom; }).concat([1]));
    $('mttr').innerHTML = m.length ? m.map(function (r) {
      var nom = CORTA[r.tipo] ? CORTA[r.tipo].charAt(0).toUpperCase() + CORTA[r.tipo].slice(1) : r.tipo;
      return '<div class="hbar" title="' + r.n + (r.n === 1 ? ' problema resuelto' : ' problemas resueltos') + '"><span>' + esc(nom) + '</span>' +
        '<div class="pista2"><div class="relleno" style="width:' + Math.max(2, 100 * r.prom / mx) + '%"></div></div><span class="v">' + minutos(r.prom) + '</span></div>';
    }).join('') : '<div class="vacio">No hay problemas resueltos ' + txt + '.</div>';
    // Clientes con más problemas, en su propio período
    var rc = rango(d, 'cli'), cli = {}, enCurso = {};
    (d.incidentes || []).forEach(function (i) {
      if (i.estado_incidente === 'ABIERTO') enCurso[i.cliente_id] = 1;
      if (!enRango(i, rc)) return;
      var c = cli[i.cliente_id] || (cli[i.cliente_id] = { id: i.cliente_id, n: 0, graves: 0, min: 0 });
      c.n++; if (i.severidad_maxima === 'CRITICA') c.graves++; c.min += i.duracion_minutos || 0;
    });
    var lc = Object.keys(cli).map(function (k) { return cli[k]; })
      .sort(function (a, b) { return b.graves - a.graves || b.n - a.n; }).slice(0, 10);
    $('t-clientes').innerHTML = lc.length ? '<thead><tr><th>Cliente</th><th class="num">Problemas</th><th class="num">Graves</th><th class="num">Horas afectadas</th></tr></thead><tbody>' +
      lc.map(function (r) {
        return '<tr><td>' + esc(r.id) + (enCurso[r.id] ? ' <span class="punto" title="Tiene problemas en este momento"></span>' : '') + '</td><td class="num">' + r.n + '</td><td class="num">' + r.graves + '</td><td class="num">' + num(r.min / 60, 1) + '</td></tr>';
      }).join('') + '</tbody>' : '<tr><td class="vacio">Sin problemas ' + textoRango(rc) + '.</td></tr>';
  }
  document.addEventListener('change', function (ev) {
    var inp = ev.target.closest('.filtro-fechas input[data-lado]');
    if (!inp || !inp.value) return;
    var k = inp.parentNode.parentNode.getAttribute('data-filtro'), r = filtros[k];
    if (!r) return;
    r[inp.getAttribute('data-lado')] = inp.value;
    if (r.desde > r.hasta) { if (inp.getAttribute('data-lado') === 'desde') r.hasta = r.desde; else r.desde = r.hasta; }
    if (datos) pintarPasado(datos);
  });

""" + h[b:]

    css = '''
/* Títulos con filtro de período */
.titulo-filtro { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.titulo-filtro h2, .titulo-filtro h3 { margin: 0; }
.titulo-filtro.chico { margin-bottom: 10px; }
.filtro-fechas { display: inline-flex; gap: 10px; align-items: center; font-size: 13px; color: var(--ink-2); flex-wrap: wrap; }
.filtro-fechas label { display: inline-flex; align-items: center; gap: 6px; }
.filtro-fechas input { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; color-scheme: light dark; }
.titulo-filtro.chico .filtro-fechas { font-size: 12px; gap: 8px; }
.filtro { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); }
.filtro button { border: 0; background: transparent; color: var(--ink-2); padding: 5px 11px; font-size: 13px; cursor: pointer; }
.filtro button + button { border-left: 1px solid var(--line); }
.filtro button.activo { background: var(--accent); color: var(--sobre-accent); font-weight: 600; }
.titulo-filtro.chico .filtro button { padding: 3px 8px; font-size: 12px; }
.panel-tabla { padding-top: 6px; }
'''
    h = rep(h, ".toast {", css.strip() + "\n.toast {")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s

def quitar_extras(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])
    # Sin el redondel de color al lado del título
    h = rep(h, '<h1 id="titular"><span class="semaforo"></span>', '<h1 id="titular">')
    h = rep(h, "$('titular').innerHTML = '<span class=\"semaforo\"></span>' + esc(titular);", "$('titular').innerHTML = esc(titular);")
    # Sin subtítulos en Alertas Abiertas, Pre-Alertas e Histórico (quedan ocultos para que el código siga funcionando)
    h = rep(h, '<p class="bajada" id="bajada-ahora">', '<p class="bajada" id="bajada-ahora" hidden>')
    h = rep(h, '<p class="bajada">Métricas que todavía están bien pero vienen empeorando. Avisamos antes de que se conviertan en alerta.</p>', '')
    h = rep(h, '<p class="bajada" id="bajada-pasado">', '<p class="bajada" id="bajada-pasado" hidden>')
    h = rep(h, '.toast {', 'h2 ~ .panel-tabla, h2 + #pronosticos, .titulo-filtro ~ details.detalle-pasado { margin-top: 12px; }\n.toast {')
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
