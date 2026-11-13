# Parche 30: avisos en un canal de Microsoft Teams.
#
#   - teams_server.js: después de cada pedido que creó avisos (y en el cron), manda UN mensaje al canal con los
#     hechos nuevos (grave sin asignar, asignada, pre-alerta avisada, devuelta, resuelta), como tarjeta adaptable.
#   - El canal se conecta con un flujo de Workflows de Teams; su dirección va en el secreto TEAMS_WEBHOOK.
#     Sin el secreto no hace nada ni consulta la base.
#   - Administración > Equipos: recuadro "Avisos en Teams" con el estado y "Mandar aviso de prueba" (solo Administrador,
#     queda en auditoría como TEAMS_PRUEBA).
#   - Sin SQL nuevo. No cambia nada de lo que ya existía.
import json, os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


FETCH_VIEJO = """    const desde = request.method === 'POST' ? await ultimoAvisoId(env) : null;
    const respuesta = await TRABAJADOR.atender(request, env, ctx);
    if (desde != null) {
      const envio = enviarPush(env, desde, new URL(request.url).origin).catch((e) => console.error('Push: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    return respuesta;"""
FETCH_NUEVO = """    const desde = request.method === 'POST' ? await ultimoAvisoId(env) : null;
    // Teams (parche 30): con el secreto TEAMS_WEBHOOK, el mismo punto de partida (o se pide si no hay push)
    const desdeTeams = request.method === 'POST' && teamsUrl(env) ? (desde != null ? desde : await teamsUltimoAviso(env)) : null;
    const respuesta = await TRABAJADOR.atender(request, env, ctx);
    if (desde != null) {
      const envio = enviarPush(env, desde, new URL(request.url).origin).catch((e) => console.error('Push: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    if (desdeTeams != null) {
      const envio = enviarTeams(env, desdeTeams, new URL(request.url).origin).catch((e) => console.error('Teams: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    return respuesta;"""

CRON_VIEJO = """      const desde = await ultimoAvisoId(env);
      const r = await procesarAlertas(env);
      if (desde != null) await enviarPush(env, desde, 'https://helios.invalid');"""
CRON_NUEVO = """      const desde = await ultimoAvisoId(env);
      const desdeTeams = teamsUrl(env) ? (desde != null ? desde : await teamsUltimoAviso(env)) : null;
      const r = await procesarAlertas(env);
      if (desde != null) await enviarPush(env, desde, 'https://helios.invalid');
      if (desdeTeams != null) await enviarTeams(env, desdeTeams, env.HELIOS_URL || 'https://helios.invalid').catch((e) => console.error('Teams: ' + e.message));"""

RUTA_VIEJA = """  if (p === '/eventos' || p.startsWith('/eventos/')) {   // eventos comerciales (parche 29)"""
RUTA_NUEVA = """  if (p === '/teams' || p.startsWith('/teams/')) {   // avisos en Teams (parche 30)
    if (!puede(yo, 'admin_equipos')) return sinPermiso();
    const r = await rutasTeams(env, request, p, yo);
    if (r) return r;
  }
""" + RUTA_VIEJA

SECCION = """
    <div class="panel" id="teams-panel" style="margin-top:16px">
      <h3 style="margin:0 0 4px">Avisos en Teams</h3>
      <p class="bajada" id="teams-estado" style="margin:0 0 10px">Revisando…</p>
      <button class="btn" id="btn-teams-probar" hidden>Mandar aviso de prueba</button>
    </div>"""

JS = r"""  // ---------- Avisos en Teams (parche 30) ----------
  function cargarTeams() {
    return pedir('/api/admin/teams').then(function (d) {
      $('teams-estado').textContent = d.configurado
        ? 'Conectado: cada alerta grave sin asignar, asignada, devuelta o resuelta, y cada pre-alerta avisada a Soporte, llega como mensaje al canal de Teams. Los comentarios no se mandan.'
        : d.cargado
          ? 'La dirección cargada en el secreto TEAMS_WEBHOOK no es de un flujo de Workflows de Teams. Revisala en Cloudflare.'
          : 'Sin conectar. En el canal de Teams, creá un flujo de Workflows "Publicar en un canal cuando se recibe una solicitud de webhook", copiá la dirección que te da y cargala en Cloudflare como secreto TEAMS_WEBHOOK del Worker.';
      $('btn-teams-probar').hidden = !d.configurado;
    });
  }
  $('btn-teams-probar').addEventListener('click', function () {
    var b = $('btn-teams-probar'); b.disabled = true;
    pedir('/api/admin/teams/probar', {}).then(function () { toast('Listo: mirá el canal de Teams.'); })
      .catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; });
  });
"""


def aplicar(s):
    s = _rep(s, '\nconst TRABAJADOR = {', '\n' + _leer('teams_server.js').strip() + '\n\nconst TRABAJADOR = {')
    s = _rep(s, FETCH_VIEJO, FETCH_NUEVO)
    s = _rep(s, CRON_VIEJO, CRON_NUEVO)
    s = _rep(s, RUTA_VIEJA, RUTA_NUEVA)

    def admin(h):
        h = _rep(h, '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-equipos"></table></div></div>',
                 '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-equipos"></table></div></div>' + SECCION)
        h = _rep(h, "var p = id === 'usuarios' || id === 'equipos' ? cargarPersonas() :",
                 "var p = id === 'usuarios' ? cargarPersonas() : id === 'equipos' ? cargarPersonas().then(cargarTeams) :")
        h = _rep(h, '  // ---------- Usuarios y equipos ----------', JS + '  // ---------- Usuarios y equipos ----------')
        h = _rep(h, "ALTA_EVENTO: 'Agregó un evento comercial'", "ALTA_EVENTO: 'Agregó un evento comercial', TEAMS_PRUEBA: 'Mandó un aviso de prueba a Teams'")
        return h
    return _html(s, 'ADMIN_HTML', admin)
