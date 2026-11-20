# Parche 70: la sala de crisis en Teams (etapa 2 del AICIM, partes A y B). Sin SQL.
#
#   A · teams_sala_server.js: cada POST de la sala (y "Comunicar incidente") manda al canal de Teams las novedades nuevas de la
#       línea de tiempo, como tarjeta con "Abrir sala en Helios". Secreto TEAMS_WEBHOOK (dirección del flujo de Workflows).
#       Sin el secreto no hace nada. Administración > Equipos: "Avisos en Teams" con el estado y un aviso de prueba
#       (solo Administrador, auditoría TEAMS_PRUEBA).
#   B · Botón "Chat en Teams" en la sala: chat grupal de Teams con quienes están en la sala (por su correo).
#   La parte C (bot de Helios en Teams) necesita el registro en Azure: queda para otro parche.
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


FETCH_VIEJO = """    const desde = request.method === 'POST' ? await ultimoAvisoId(env) : null;
    const respuesta = await TRABAJADOR.atender(request, env, ctx);
    if (desde != null) {
      const envio = enviarPush(env, desde, new URL(request.url).origin).catch((e) => console.error('Push: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    return respuesta;"""
FETCH_NUEVO = """    const desde = request.method === 'POST' ? await ultimoAvisoId(env) : null;
    // Teams (parche 70): novedades de las salas de crisis al canal, solo con el secreto TEAMS_WEBHOOK
    const desdeTeams = await teamsMarca(env, request, new URL(request.url).pathname.replace(/\\/+$/, ''));
    const respuesta = await TRABAJADOR.atender(request, env, ctx);
    if (desde != null) {
      const envio = enviarPush(env, desde, new URL(request.url).origin).catch((e) => console.error('Push: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    if (desdeTeams != null && respuesta.status < 400) {
      const envio = enviarTeamsSala(env, desdeTeams, new URL(request.url).origin).catch((e) => console.error('Teams: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    return respuesta;"""

RUTA_VIEJA = """  if (p === '/eventos' || p.startsWith('/eventos/')) {   // eventos comerciales (parche 29)"""
RUTA_NUEVA = """  if (p === '/teams' || p.startsWith('/teams/')) {   // avisos de las salas en Teams (parche 70)
    if (!puede(yo, 'admin_usuarios')) return sinPermiso();
    const r = await rutasTeams(env, request, p, yo);
    if (r) return r;
  }
""" + RUTA_VIEJA


def servidor(s):
    s = _rep(s, '\nconst TRABAJADOR = {', '\n' + _leer('teams_sala_server.js').strip() + '\n\nconst TRABAJADOR = {')
    s = _rep(s, FETCH_VIEJO, FETCH_NUEVO)
    s = _rep(s, RUTA_VIEJA, RUTA_NUEVA)
    # B: quiénes están en la sala, para el chat de Teams
    s = _rep(s, "    ahora: (r[5].results[0] || {}).ahora || null,\n",
             "    ahora: (r[5].results[0] || {}).ahora || null,\n    teams_chat: await teamsChatSala(env, yo, inc, r[1].results),\n")
    return s


# ---------- Página de la sala: botón "Chat en Teams" ----------
CHAT_JS = """    if (i.estado === 'CERRADO') acc = '<p class="sc-vacio">Cerrado el ' + esc(fecha(i.cerrado)) + '. Causa raíz: ' + esc(i.causa_raiz || '') + '</p>';
    acc += chatTeams(i);"""

CHAT_FN = """  // ---------- Chat en Teams (parche 70) ----------
  function chatTeams(i) {
    var t = d.teams_chat || { correos: [] };
    if (!t.correos.length) {
      var por = t.falta_script ? 'Falta cargar el correo de las personas.' : t.sin_correo && t.sin_correo.length ? 'Sin correo cargado: ' + t.sin_correo.join(', ') + '.' : 'Todavía no hay otras personas en la sala.';
      return '<button class="btn" disabled title="' + esc(por) + '">Chat en Teams</button>';
    }
    var url = 'https://teams.microsoft.com/l/chat/0/0?users=' + t.correos.map(encodeURIComponent).join(',') +
      '&topicName=' + encodeURIComponent((i.codigo + ' · ' + i.titulo).slice(0, 60)) +
      '&message=' + encodeURIComponent('Sala de crisis ' + i.codigo + ' en Helios: ' + location.origin + '/incidente/' + i.id);
    var quienes = 'Abre un chat de Teams con ' + t.nombres.join(', ') + (t.sin_correo && t.sin_correo.length ? '. Sin correo cargado: ' + t.sin_correo.join(', ') : '') + '.';
    return '<a class="btn" id="btn-chat-teams" target="_blank" rel="noopener" href="' + esc(url) + '" title="' + esc(quienes) + '">Chat en Teams</a>';
  }

  // ---------- La sala ----------"""


def sala(h):
    h = _rep(h, "    if (i.estado === 'CERRADO') acc = '<p class=\"sc-vacio\">Cerrado el ' + esc(fecha(i.cerrado)) + '. Causa raíz: ' + esc(i.causa_raiz || '') + '</p>';", CHAT_JS)
    h = _rep(h, '  // ---------- La sala ----------', CHAT_FN)
    return h


# ---------- Administración > Equipos: "Avisos en Teams" (solo Administrador) ----------
SECCION = """
    <div class="panel" id="teams-panel" style="margin-top:16px" hidden>
      <h3 style="margin:0 0 4px">Avisos en Teams</h3>
      <p class="bajada" id="teams-estado" style="margin:0 0 10px">Revisando…</p>
      <button class="btn" id="btn-teams-probar" hidden>Mandar aviso de prueba</button>
    </div>"""

ADMIN_JS = r"""  // ---------- Avisos en Teams (parche 70) ----------
  function cargarTeams() {
    if (!puedo('admin_usuarios')) return Promise.resolve();
    return pedir('/api/admin/teams').then(function (d) {
      $('teams-panel').hidden = false;
      $('teams-estado').textContent = d.configurado
        ? 'Conectado: las novedades de las salas de crisis (apertura, tareas, escalamientos, estado, comunicados y cierre) llegan al canal de Teams.'
        : d.cargado
          ? 'La dirección cargada en el secreto TEAMS_WEBHOOK no es de un flujo de Workflows de Teams. Revisala en Cloudflare.'
          : 'Sin conectar. En el canal de Teams, creá un flujo de Workflows "Publicar en un canal cuando se recibe una solicitud de webhook" y cargá la dirección que da como secreto TEAMS_WEBHOOK del Worker.';
      $('btn-teams-probar').hidden = !d.configurado;
    });
  }
  $('btn-teams-probar').addEventListener('click', function () {
    var b = $('btn-teams-probar'); b.disabled = true;
    pedir('/api/admin/teams/probar', {}).then(function () { toast('Listo: mirá el canal de Teams.'); })
      .catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; });
  });

"""


def admin(h):
    h = _rep(h, '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-equipos"></table></div></div>',
             '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-equipos"></table></div></div>' + SECCION)
    h = _rep(h, "var p = id === 'usuarios' || id === 'equipos' ? cargarPersonas() :",
             "var p = id === 'usuarios' ? cargarPersonas() : id === 'equipos' ? cargarPersonas().then(cargarTeams) :")
    h = _rep(h, '  // ---------- Usuarios y equipos ----------', ADMIN_JS + '  // ---------- Usuarios y equipos ----------')
    h = _rep(h, "ALTA_EVENTO: 'Agregó un evento comercial'", "ALTA_EVENTO: 'Agregó un evento comercial', TEAMS_PRUEBA: 'Mandó un aviso de prueba a Teams'")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'SALA_CRISIS_HTML', sala)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
