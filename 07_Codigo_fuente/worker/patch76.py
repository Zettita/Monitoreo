# Parche 76 (20/11): bot de Helios en Microsoft Teams (parte C de la sala de crisis en Teams). Sin SQL.
#   El asistente de IA responde dentro de Teams (chat de la sala o chat de a dos), con lo que cada persona puede ver en Helios.
#   - teams_bot_server.js: POST /api/teams/bot (lo llama Microsoft; sin sesión, se valida la firma del token), identificación por correo
#     (usuarios.correo, script 23), misma ruta del asistente de siempre (permisos, límites, auditoría, reglas de la sala) y respuesta por la
#     API de Bot Framework. Secretos TEAMS_BOT_APP_ID, TEAMS_BOT_SECRET y (si el bot es de un solo tenant) TEAMS_BOT_TENANT.
#   - Administración > Equipos: «Bot de Helios en Teams» con el estado, la dirección de mensajes para IT y «Probar conexión con Microsoft».
#   - «Chat en Teams»: el borrador del mensaje explica cómo sumar la app y mencionar al asistente.
#   - teams_app/: manifiesto e íconos del paquete de la app de Teams (armar_paquete.py).
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch76: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def servidor(s):
    s = _rep(s, '\nconst TRABAJADOR = {', '\n' + _leer('teams_bot_server.js').strip() + '\n\nconst TRABAJADOR = {')
    # Lo llama Microsoft: no tiene sesión, así que va antes del control de acceso (se valida la firma del token)
    s = _rep(s, "      // Login y permisos: devuelve una respuesta (login, 401, 403...) o el usuario de la sesión\n      const acceso = await controlarAcceso(env, request, ruta);",
             "      // Bot de Teams (parche 76): lo llama Microsoft con su propio token, sin sesión\n"
             "      if (ruta === BOT_RUTA && request.method === 'POST') return await botTeamsRuta(env, request, ctx);\n"
             "      // Login y permisos: devuelve una respuesta (login, 401, 403...) o el usuario de la sesión\n      const acceso = await controlarAcceso(env, request, ruta);")
    s = _rep(s, "    const r = await rutasTeams(env, request, p, yo);\n",
             "    const r = (await rutasTeamsBot(env, request, p, yo)) || (await rutasTeams(env, request, p, yo));\n")
    return s


SECCION_BOT = """
    <div class="panel" id="teams-bot-panel" style="margin-top:16px" hidden>
      <h3 style="margin:0 0 4px">Bot de Helios en Teams</h3>
      <p class="bajada" id="teams-bot-estado" style="margin:0 0 6px">Revisando…</p>
      <p class="bajada" style="margin:0 0 10px">Dirección de mensajes (se la pasamos a IT al registrar el bot): <b id="teams-bot-dir"></b></p>
      <button class="btn" id="btn-teams-bot-probar" hidden>Probar conexión con Microsoft</button>
    </div>"""

ADMIN_BOT_JS = r"""  // ---------- Bot de Helios en Teams (parche 76) ----------
  function cargarTeamsBot() {
    return pedir('/api/admin/teams/bot').then(function (d) {
      $('teams-bot-panel').hidden = false;
      $('teams-bot-dir').textContent = d.direccion;
      $('teams-bot-estado').textContent = d.configurado
        ? 'Secretos cargados' + (d.con_tenant ? ' (con tenant)' : ' (sin tenant: si el bot es de un solo tenant, falta cargar TEAMS_BOT_TENANT)') + '. Tocá «Probar conexión» para confirmar que Microsoft los acepta. Las personas le escriben en Teams: responde con lo que su perfil puede ver.'
        : 'Sin conectar. Cuando IT registre el bot en Teams, hay que cargar en Cloudflare los secretos del Worker: ' + d.falta.join(' y ') + ' (y TEAMS_BOT_TENANT si el bot es de un solo tenant).';
      $('btn-teams-bot-probar').hidden = !d.configurado;
    });
  }
  $('btn-teams-bot-probar').addEventListener('click', function () {
    var b = $('btn-teams-bot-probar'); b.disabled = true;
    pedir('/api/admin/teams/bot/probar', {}).then(function () { toast('Listo: Microsoft aceptó el App ID y el secreto.'); })
      .catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; });
  });
"""


def admin(h):
    if 'id="btn-teams-probar"' not in h:
        return h
    h = _rep(h, '      <button class="btn" id="btn-teams-probar" hidden>Mandar aviso de prueba</button>\n    </div>',
             '      <button class="btn" id="btn-teams-probar" hidden>Mandar aviso de prueba</button>\n    </div>' + SECCION_BOT)
    h = _rep(h, "      $('btn-teams-probar').hidden = !d.configurado;\n    });\n  }\n",
             "      $('btn-teams-probar').hidden = !d.configurado;\n      return cargarTeamsBot();\n    });\n  }\n")
    h = _rep(h, "  $('btn-teams-probar').addEventListener('click', function () {", ADMIN_BOT_JS + "  $('btn-teams-probar').addEventListener('click', function () {")
    h = _rep(h, "TEAMS_PRUEBA: 'Mandó un aviso de prueba a Teams'", "TEAMS_PRUEBA: 'Mandó un aviso de prueba a Teams', TEAMS_BOT_PRUEBA: 'Probó la conexión del bot de Teams'")
    return h


def sala(h):
    if "'&message=' + encodeURIComponent('Sala de crisis '" not in h:
        return h
    h = _rep(h, "'&message=' + encodeURIComponent('Sala de crisis ' + i.codigo + ' en Helios: ' + location.origin + '/incidente/' + i.id);",
             "'&message=' + encodeURIComponent('Sala de crisis ' + i.codigo + ' en Helios: ' + location.origin + '/incidente/' + i.id +\n"
             "        '\\nPara consultar al asistente: sumá la app ' + ((d.teams_chat || {}).bot || 'Gemma') + ' a este chat y escribí @' + ((d.teams_chat || {}).bot || 'Gemma') + ' ' + i.codigo + ' ¿qué reviso primero?');")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ADMIN_HTML', admin)
    s = _html(s, 'SALA_CRISIS_HTML', sala)
    return s
