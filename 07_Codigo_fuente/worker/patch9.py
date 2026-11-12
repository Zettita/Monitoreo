# Paso 9 del build: unificar "Qué está pasando ahora" con la tabla de alertas abiertas,
# y "Resueltos en las últimas 24 horas" con el detalle plegable
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])

    # --- A) Qué está pasando ahora: tabla de alertas abiertas con botones ---
    h = rep(h, '      <div id="casos"></div>\n',
        '      <details class="detalle detalle-ahora" id="det-abiertas" open>\n'
        '        <summary id="sum-abiertas">Ver las alertas abiertas, una por una</summary>\n'
        '        <div class="cuerpo"><div class="tabla-scroll"><table id="t-abiertas"></table></div></div>\n'
        '      </details>\n')
    a = h.index('  <details class="detalle" id="det-abiertas">')
    b = h.index('  <p class="nota" id="nota"></p>')
    h = h[:a] + h[b:]   # se quitan los dos plegables del final (quedan unificados arriba)

    a = h.index('  function pintarCasos(casos) {')
    b = h.index('  // ---- Qué podría pasar ----')
    h = h[:a] + '''  function pintarCasos(casos, d) {
    var reales = casos.filter(function (c) { return c.sev !== 'BAJA'; });
    $('bajada-ahora').textContent = reales.length
      ? 'Las alertas en curso, de la más grave a la más leve. Tomá una para avisarle al resto del equipo que la estás mirando.'
      : 'No hay problemas en curso.';
    // Una fila por alerta: mismas ventanas del mismo problema (tipo) en la misma serie
    var grupos = {}, a = [];
    (d.abiertas || []).forEach(function (r) {
      var k = clave(r) + '|' + r.tipo_alerta, g = grupos[k];
      if (!g) { g = grupos[k] = { ult: r, desde: r.ventana_inicio, n: 0, sev: r.severidad, ids: [], abiertas: [], quien: null }; a.push(g); }
      g.n++; g.ids.push(r.alerta_id);
      if (r.estado === 'ABIERTA') g.abiertas.push(r.alerta_id); else if (r.reconocida_por) g.quien = r.reconocida_por;
      if (r.ventana_inicio < g.desde) g.desde = r.ventana_inicio;
      if (r.ventana_inicio > g.ult.ventana_inicio) g.ult = r;
      if (SEV_N[r.severidad] < SEV_N[g.sev]) g.sev = r.severidad;
    });
    a.sort(function (x, y) { return SEV_N[x.sev] - SEV_N[y.sev] || (x.desde < y.desde ? -1 : 1); });
    $('sum-abiertas').textContent = a.length
      ? 'Ver las ' + a.length + (a.length === 1 ? ' alerta abierta' : ' alertas abiertas')
      : 'No hay alertas abiertas';
    $('t-abiertas').innerHTML = a.length ? '<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Inicio</th><th class="num">Ventanas</th><th class="num">Observado</th><th class="num">Esperado</th><th>Estado</th><th></th></tr></thead><tbody>' +
      a.map(function (g) {
        var r = g.ult;
        var acc = g.sev === 'BAJA' ? '' :
          (g.abiertas.length ? '<button class="btn chico" data-accion="reconocer" data-ids="' + esc(g.abiertas.join(',')) + '">Tomar</button>' : '') +
          '<button class="btn chico" data-accion="resolver" data-ids="' + esc(g.ids.join(',')) + '">Marcar como resuelto</button>';
        var estado = !g.abiertas.length ? 'Tomada por ' + esc(g.quien || '') : g.quien ? 'En parte tomada por ' + esc(g.quien) : 'Abierta';
        return '<tr><td>' + sev(g.sev) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) +
          '</td><td>' + diaHora(g.desde) + '</td><td class="num">' + g.n + '</td><td class="num" title="Última ventana: ' + hora(r.ventana_inicio) + '">' + valor(r.metrica, r.valor_observado) +
          '</td><td class="num">' + valor(r.metrica, r.valor_esperado) + '</td><td>' + estado + '</td><td><div class="acc-fila">' + acc + '</div></td></tr>';
      }).join('') + '</tbody>' : '<tr><td class="vacio">Todo en orden: ningún servicio tiene problemas en este momento.</td></tr>';
  }

''' + h[b:]
    h = rep(h, '    pintarCasos(casos);', '    pintarCasos(casos, d);')

    # --- B) Qué ya pasó: resueltos de las últimas 24 h como plegable con línea de color y tiempo ---
    a = h.index('    <div class="tres">\n      <div class="panel">\n        <h3>Resueltos en las últimas 24 horas</h3>')
    b = h.index('  </section>', a)
    h = h[:a] + '''    <details class="detalle detalle-pasado" id="det-resueltos">
      <summary id="sum-resueltos">Ver los problemas resueltos en las últimas 24 horas</summary>
      <div class="cuerpo"><div class="tabla-scroll"><table id="t-resueltos"></table></div></div>
    </details>
    <div class="dos-iguales">
      <div class="panel">
        <h3>Cuánto tarda en resolverse cada tipo de problema</h3>
        <div id="mttr"></div>
      </div>
      <div class="panel">
        <h3>Clientes con más problemas en 30 días</h3>
        <p class="vacio" style="margin:-6px 0 6px;font-size:12.5px"><span class="punto" style="margin:0 6px 0 0"></span>con problemas en este momento</p>
        <div class="tabla-scroll"><table id="t-clientes"></table></div>
      </div>
    </div>
''' + h[b:]
    a = h.index("    var max = Math.max.apply(null, res.map(function (r) { return r.duracion_minutos || 0; }).concat([1]));")
    b = h.index("    var m = (d.mttr || [])")
    h = h[:a] + '''    var max = Math.max.apply(null, res.map(function (r) { return r.duracion_minutos || 0; }).concat([1]));
    $('sum-resueltos').textContent = res.length
      ? 'Ver los ' + res.length + (res.length === 1 ? ' problema resuelto' : ' problemas resueltos') + ' en las últimas 24 horas'
      : 'No hubo problemas resueltos en las últimas 24 horas';
    $('t-resueltos').innerHTML = res.length ? '<thead><tr><th>Problema</th><th>Cliente y servicio</th><th>Inicio</th><th>Duración</th></tr></thead><tbody>' +
      res.map(function (r) {
        return '<tr><td>' + sev(r.severidad_maxima) + ' ' + esc(frase(r.tipo_alerta)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) +
          '</td><td>' + diaHora(r.inicio) + '</td><td><div class="dur"><div class="b ' + esc(r.severidad_maxima) + '" style="width:' +
          Math.max(3, Math.round(90 * (r.duracion_minutos || 0) / max)) + 'px"></div><span>' + minutos(r.duracion_minutos) + '</span></div></td></tr>';
      }).join('') + '</tbody>' : '<tr><td class="vacio">Nada para mostrar.</td></tr>';
''' + h[b:]

    # --- El detalle técnico ya no pinta las tablas que se unificaron ---
    a = h.index('  function pintarDetalle(d) {')
    b = h.index('  function pintar(d) {')
    h = h[:a] + '  function pintarDetalle(d) { /* unificado en "Qué está pasando ahora" y "Qué ya pasó" */ }\n\n' + h[b:]

    # La tabla necesita todo el ancho: "Qué está pasando ahora" arriba y "Qué podría pasar" debajo
    h = rep(h, '<div class="dos bloque" style="margin-top:34px">', '<div class="dos bloque apilado" style="margin-top:34px">')
    css = '''
.dos.apilado { grid-template-columns: 1fr; gap: 34px; }
/* Tablas unificadas */
details.detalle-ahora { margin-top: 0; }
details.detalle-pasado { margin: 0 0 20px; }
.acc-fila { display: flex; gap: 6px; justify-content: flex-end; white-space: nowrap; }
#t-abiertas td, #t-resueltos td { vertical-align: middle; }
#t-abiertas td:nth-child(3), #t-resueltos td:nth-child(3) { white-space: nowrap; }
.dos-iguales { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
@media (max-width: 980px) { .dos-iguales { grid-template-columns: 1fr; } }
'''
    h = rep(h, ".toast {", css.strip() + "\n.toast {")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
