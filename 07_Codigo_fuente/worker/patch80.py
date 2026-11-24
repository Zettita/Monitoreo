# Parche 80 (24/11): la sala de crisis para quien tiene la alerta asignada, y «Mis alertas/tareas» (sin SQL).
#   - Soporte que tiene asignada (a su usuario o a un equipo suyo) una alerta de una sala de crisis ENTRA a la sala aunque no tenga tareas: es la persona a
#     cargo de esa alerta. La ve en solo lectura (sala_crisis_server.js: rolEnIncidente / alertaPropiaEnSala; la lista de salas también la incluye).
#   - La línea de tiempo de la sala dice quién es el responsable de cada alerta: al sumarla («Responsable de la alerta: Soporte 2») y cada vez que se
#     deriva, se toma, se devuelve o se resuelve (lineasPorAsignacion, en asignacion_server.js). Los renglones nuevos también van al canal de Teams.
#   - «Mis alertas» pasa a «Mis alertas/tareas»: además de las alertas, la página muestra las tareas de las salas de crisis que tiene la persona o su
#     equipo (pendientes y en curso, y las hechas en las últimas 24 horas) con el enlace a la sala. El número del menú también cuenta las tareas pendientes.
#     GET /api/mis-alertas suma `tareas`.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch80: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


SECCIONES = """  <section class="bloque-mis" id="b-tareas">
    <h2>Tareas de salas de crisis</h2>
    <div class="casos" id="c-tareas"></div>
  </section>
  <section class="bloque-mis" id="b-tareas-hechas">
    <h2>Tareas hechas en las últimas 24 horas</h2>
    <div class="casos" id="c-tareas-hechas"></div>
  </section>
"""

TARJETA_TAREA = r"""  // Tareas de las salas de crisis (parche 80)
  function tarjetaTarea(t) {
    var hecha = t.estado === 'HECHA';
    var chip = hecha ? '<span class="sev BAJA">Hecha</span>' : t.estado === 'EN_CURSO' ? '<span class="sev ALTA">En curso</span>' : '<span class="sev MEDIA">Pendiente</span>';
    var quien = t.sin_tomar ? 'Del equipo <b>' + esc(t.equipo || '') + '</b>, todavía sin persona responsable' : 'Asignada a <b>' + esc(t.persona || '') + '</b>' + (t.equipo ? ' · equipo <b>' + esc(t.equipo) + '</b>' : '');
    var sub = [t.cliente_id, t.servicio_id ? (SERVICIO[t.servicio_id] || String(t.servicio_id).toLowerCase().replace(/_/g, ' ')) : ''].filter(Boolean).join(' · ');
    return '<article class="caso ' + (hecha ? 'resuelto' : 'ALTA') + '">' +
      '<div class="caso-cab">' + chip + '<a class="caso-titulo" href="/incidente/' + t.incidente_id + '">' + esc(t.titulo) + '</a></div>' +
      '<div class="caso-sub">' + esc(t.codigo) + ' · ' + esc(t.sala) + (sub ? ' · ' + esc(sub) : '') + '</div>' +
      '<p class="caso-asig">' + quien + (t.creada_por ? ' · la pidió <b>' + esc(t.creada_por) + '</b>' : '') + ' · ' + (hecha ? 'hecha ' + esc(hace(t.terminada || t.actualizada)) : 'desde ' + esc(hace(t.creada))) + '</p>' +
      (t.detalle ? '<p class="caso-nota">' + esc(t.detalle) + '</p>' : '') +
      (hecha && t.resultado ? '<p class="caso-nota">Resultado: “' + esc(t.resultado) + '”</p>' : '') +
      '<div class="caso-acc"><a class="btn ' + (hecha ? '' : 'primario ') + 'chico" href="/incidente/' + t.incidente_id + '">Abrir la sala</a></div></article>';
  }
  function listaTareas(id, ts, vacio) { $(id).innerHTML = ts.length ? ts.map(tarjetaTarea).join('') : '<div class="vacio-caja">' + esc(vacio) + '</div>'; }

  function pintar(d) {"""


def mis_alertas(h):
    h = _rep(h, '  <section class="bloque-mis" id="b-resueltas">', SECCIONES + '  <section class="bloque-mis" id="b-resueltas">')
    h = _rep(h, '  function pintar(d) {', TARJETA_TAREA)
    h = _rep(h, "    var n = tomar.length, c = curso.length;\n",
             "    var tareas = d.tareas || [], tPend = tareas.filter(function (t) { return t.estado !== 'HECHA'; }), tHechas = tareas.filter(function (t) { return t.estado === 'HECHA'; });\n"
             "    listaTareas('c-tareas', tPend, 'No tenés tareas pendientes en salas de crisis.');\n"
             "    listaTareas('c-tareas-hechas', tHechas, 'Todavía no hiciste tareas en las últimas 24 horas.');\n"
             "    var n = tomar.length, c = curso.length;\n")
    h = _rep(h, "    $('bajada').textContent = (n + c === 0 ? 'No tenés nada pendiente.' :",
             "    $('bajada').textContent = (n + c + tPend.length === 0 ? 'No tenés nada pendiente.' :")
    h = _rep(h, "(c ? (n ? '' : 'Tenés ') + c + ' en curso' : '') + '.') +",
             "(c ? (n ? '' : 'Tenés ') + c + ' en curso' : '') + (n + c ? '.' : '') + (tPend.length ? (n + c ? ' Además, tenés ' : 'Tenés ') + tPend.length + (tPend.length === 1 ? ' tarea pendiente en salas de crisis.' : ' tareas pendientes en salas de crisis.') : '')) +")
    h = _rep(h, "[['b-curso', c, 'en curso'], ['b-tomar', n, 'para tomar'], ['b-resueltas', res.length, 'resueltas (24 h)']]",
             "[['b-curso', c, 'en curso'], ['b-tomar', n, 'para tomar'], ['b-tareas', tPend.length, 'tareas pendientes'], ['b-resueltas', res.length, 'resueltas (24 h)'], ['b-tareas-hechas', tHechas.length, 'tareas hechas (24 h)']]")
    h = _rep(h, "    document.title = (n + c ? '(' + (n + c) + ') ' : '') + 'Helios · Mis alertas';",
             "    document.title = (n + c + tPend.length ? '(' + (n + c + tPend.length) + ') ' : '') + 'Helios · Mis alertas/tareas';")
    return h


def nombres(h):
    for a, b in [('>Mis alertas</a>', '>Mis alertas/tareas</a>'), ('>Mis alertas<span', '>Mis alertas/tareas<span'), ('<h1>Mis alertas</h1>', '<h1>Mis alertas/tareas</h1>'),
                 ('<title>Helios · Mis alertas</title>', '<title>Helios · Mis alertas/tareas</title>'), ("? 'Mis alertas' : 'el tablero'", "? 'Mis alertas/tareas' : 'el tablero'")]:
        h = h.replace(a, b)
    return h


def aplicar(s):
    # Resolver (el bloque lo escribe el parche 30): la línea de tiempo de la sala dice quién la resolvió
    s = _rep(s, "        auditoria('RESOLVER_ALERTA', desc + (res.causa ? ': ' + res.causa : '')),\n",
             "        auditoria('RESOLVER_ALERTA', desc + (res.causa ? ': ' + res.causa : '')),\n"
             "        ...(await lineasPorAsignacion(env, yo, alertaId, 'Resolvió la alerta «' + fraseAlerta(a) + '».' + (res.causa ? ' Causa: ' + res.causa.slice(0, 150) + '.' : ''))),\n")
    # La ruta suma las tareas de las salas de crisis
    s = _rep(s, "    d.mis_pendientes = await contarMisAlertas(env, yo);   // para tomar o en curso\n",
             "    d.mis_pendientes = await contarMisAlertas(env, yo);   // para tomar o en curso (y tareas pendientes)\n"
             "    d.tareas = await tareasDeMisSalas(env, yo);   // tareas de salas de crisis (parche 80)\n")
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    for n in ('MIS_ALERTAS_HTML', 'ADMIN_HTML', 'SEGUIMIENTO_HTML', 'SALA_CRISIS_HTML', 'COMUNICADOS_HTML', 'ALERTA_HTML'):
        s = _html(s, n, nombres)
    return s
