# Parche 81 (24/11): «Mis tareas» para el Analista y «Mis alertas/tareas» con alertas y tareas bien separadas (sin SQL).
#   - El Analista no recibe alertas pero sí puede tener tareas en una sala de crisis, y hoy solo las veía entrando a la sala. Página nueva «Mis tareas»
#     (/mis-tareas, permiso mis_tareas = Analista; mis_tareas_server.js): las mismas tarjetas que Soporte ve en «Mis alertas/tareas» (pendientes, en curso y
#     hechas en 24 h, con «Abrir la sala»). Se arma a partir de «Mis alertas/tareas» con las alertas ocultas. Enlace «Mis tareas» en el menú del Analista.
#   - «Mis alertas/tareas» (Soporte) tenía «Resueltas en las últimas 24 horas» (alertas) y «Tareas hechas en las últimas 24 horas» una al lado de la otra:
#     ahora la página tiene dos grupos con título propio, «Alertas» y «Tareas de salas de crisis», cada uno con sus títulos específicos («Alertas resueltas…»
#     / «Tareas hechas…»), y el resumen de arriba también va en dos filas («Alertas: en curso, para tomar, resueltas» · «Tareas: pendientes, hechas»).
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch81: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _get(s, nombre):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    return json.loads(s[i + len('const %s = ' % nombre):j])


PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML', 'COMUNICADOS_HTML', 'SALA_CRISIS_HTML']

CSS = """
/* Mis alertas/tareas: dos grupos, alertas y tareas de salas de crisis (parche 81) */
.grupo-mis { margin: 48px 0 -12px; padding: 0 0 8px; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); border-bottom: 2px solid var(--accent); }
.res-rot { align-self: center; font-size: 12.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2); margin: 0 2px 0 6px; }
.res-rot:first-child { margin-left: 0; }
"""

SECCIONES_80 = """  <section class="bloque-mis" id="b-tareas">
    <h2>Tareas de salas de crisis</h2>
    <div class="casos" id="c-tareas"></div>
  </section>
  <section class="bloque-mis" id="b-tareas-hechas">
    <h2>Tareas hechas en las últimas 24 horas</h2>
    <div class="casos" id="c-tareas-hechas"></div>
  </section>
"""

GRUPO_TAREAS = """  <h2 class="grupo-mis" id="g-tareas">Tareas de salas de crisis</h2>
  <section class="bloque-mis" id="b-tareas">
    <h2>Tareas pendientes</h2>
    <div class="casos" id="c-tareas"></div>
  </section>
  <section class="bloque-mis" id="b-tareas-hechas">
    <h2>Tareas hechas en las últimas 24 horas</h2>
    <div class="casos" id="c-tareas-hechas"></div>
  </section>
"""

BAJADA = """    var soloT = !!window.SOLO_TAREAS, partes = [];
    if (!soloT && n + c) partes.push('Alertas: ' + [n ? n + ' para tomar' : '', c ? c + ' en curso' : ''].filter(Boolean).join(' y '));
    if (tPend.length) partes.push('Tareas: ' + tPend.length + (tPend.length === 1 ? ' pendiente' : ' pendientes') + ' en salas de crisis');
    $('bajada').textContent = (partes.length ? partes.join(' · ') + '.' : soloT ? 'No tenés tareas pendientes en salas de crisis.' : 'No tenés nada pendiente.') +
      (d.reloj_simulado ? ' (Reloj de demostración: ' + hora(d.ahora) + ')' : '');
"""

CHIPS = """    function chips(xs) { return xs.map(function (x) { return '<a href="#' + x[0] + '"' + (x[1] ? ' class="hay"' : '') + '><b>' + x[1] + '</b>' + x[2] + '</a>'; }).join(''); }
    $('resumen').innerHTML = (soloT ? '' : '<span class="res-rot">Alertas</span>' + chips([['b-curso', c, 'en curso'], ['b-tomar', n, 'para tomar'], ['b-resueltas', res.length, 'resueltas (24 h)']]))
      + '<span class="res-rot">Tareas</span>' + chips([['b-tareas', tPend.length, 'pendientes'], ['b-tareas-hechas', tHechas.length, 'hechas (24 h)']]);
"""


def _entre(h, ini, fin, nuevo):
    i = h.index(ini)
    j = h.index(fin, i) + len(fin)
    return h[:i] + nuevo + h[j:]


def mis_alertas(h):
    h = _rep(h, SECCIONES_80, '')
    h = _rep(h, '  <section class="bloque-mis" id="b-curso">', '  <h2 class="grupo-mis" id="g-alertas">Alertas</h2>\n  <section class="bloque-mis" id="b-curso">')
    h = _rep(h, '<h2>En curso</h2>', '<h2>Alertas en curso</h2>')
    h = _rep(h, '<h2>Para tomar</h2>', '<h2>Alertas para tomar</h2>')
    h = _rep(h, '<h2>Equipos</h2>', '<h2>Alertas de mis equipos</h2>')
    h = _rep(h, '<h2>Resueltas en las últimas 24 horas</h2>', '<h2>Alertas resueltas en las últimas 24 horas</h2>')
    h = _rep(h, '  <section class="bloque-mis" id="b-fallas">\n    <h2>Distribución de fallas</h2>', GRUPO_TAREAS + '  <section class="bloque-mis" id="b-fallas">\n    <h2>Distribución de fallas de mis alertas</h2>')
    h = _entre(h, "    $('bajada').textContent = (n + c + tPend.length === 0", "' (Reloj de demostración: ' + hora(d.ahora) + ')' : '');\n", BAJADA)
    h = _entre(h, "    $('resumen').innerHTML = [['b-curso', c, 'en curso']", ".join('');\n", CHIPS)
    i = h.index('</style>')
    return h[:i] + CSS + h[i:]


def menu(h):
    a = '<a role="menuitem" href="/incidentes" id="lnk-sala" hidden>Sala de crisis</a>'
    h = _rep(h, a, '<a role="menuitem" href="/mis-tareas" id="lnk-mistareas" hidden>Mis tareas</a>\n        ' + a)
    return _rep(h, "if ($('lnk-sala')) $('lnk-sala').hidden = !puedo('sala_crisis');",
                "if ($('lnk-sala')) $('lnk-sala').hidden = !puedo('sala_crisis'); if ($('lnk-mistareas')) $('lnk-mistareas').hidden = !puedo('mis_tareas');")


def pagina_tareas(mis):
    h = _rep(mis, '<title>Helios · Mis alertas/tareas</title>', '<title>Helios · Mis tareas</title>')
    h = _rep(h, '<h1>Mis alertas/tareas</h1>', '<h1>Mis tareas</h1>')
    h = _rep(h, "'Helios · Mis alertas/tareas'", "'Helios · Mis tareas'")
    # Las alertas no van: esta página es solo de tareas
    i = h.index('</style>')
    h = h[:i] + '#g-alertas, #b-curso, #b-tomar, #b-equipo, #b-resueltas, #b-fallas { display: none !important; }\n' + h[i:]
    h = _rep(h, 'var yo = null, permisos = [], datos = null, grupos = {};', 'window.SOLO_TAREAS = true;\n  var yo = null, permisos = [], datos = null, grupos = {};')
    h = _rep(h, "if (yo.debe_cambiar || !puedo('mis_alertas')) { location.href = '/'; return; }", "if (yo.debe_cambiar || !puedo('mis_tareas')) { location.href = '/'; return; }")
    h = _rep(h, "function cargar() { return pedir('/api/mis-alertas').then(pintar)", "function cargar() { return pedir('/api/mis-tareas').then(pintar)")
    return h


def aplicar(s):
    s = _rep(s, "  sala_crisis_tarea: ['ANALISTA', 'SOPORTE'],        // actualizar las tareas propias y dejar notas\n",
             "  sala_crisis_tarea: ['ANALISTA', 'SOPORTE'],        // actualizar las tareas propias y dejar notas\n"
             "  mis_tareas: ['ANALISTA'],                          // página «Mis tareas»: las tareas de salas de crisis del Analista (Soporte las ve en «Mis alertas/tareas») (parche 81)\n")
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    for n in PAGINAS:
        s = _html(s, n, menu)
    pagina = pagina_tareas(_get(s, 'MIS_ALERTAS_HTML'))
    s = _rep(s, "async function rutasComunicados(env, request, ruta, yo) {",
             _leer('mis_tareas_server.js') + 'const MIS_TAREAS_HTML = ' + json.dumps(pagina, ensure_ascii=False) + ';\n\n' + "async function rutasComunicados(env, request, ruta, yo) {")
    s = _rep(s, "      const salaR = await rutasSalaCrisis(env, request, ruta, yo);\n      if (salaR) return salaR;\n",
             "      const salaR = await rutasSalaCrisis(env, request, ruta, yo);\n      if (salaR) return salaR;\n"
             "      const misTareasR = await rutasMisTareas(env, request, ruta, yo);   // «Mis tareas» del Analista (parche 81)\n"
             "      if (misTareasR) return misTareasR;\n")
    return s
