# Parche 77 (20/11): el bot de Teams recuerda la conversación (script 25).
#   Cada persona, en cada chat, tiene su memoria: los últimos 6 mensajes y la sala de la que venía hablando (hasta 2 horas después del
#   último mensaje; lo de más de 7 días se borra solo). Es por persona: lo que se le contestó a alguien no se usa con otro.
#   «Empezar de nuevo» la borra, y si se pregunta por otra sala se empieza de cero. Sin el script 25 el bot anda igual, sin memoria.
#   El servidor está en teams_bot_server.js (lo mete el parche 76); acá solo se suma el aviso en Administración > Equipos.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch77: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def admin(h):
    if 'id="btn-teams-bot-probar"' not in h:
        return h
    return _rep(h, "      $('btn-teams-bot-probar').hidden = !d.configurado;\n    });\n  }\n",
                "      $('btn-teams-bot-probar').hidden = !d.configurado;\n"
                "      $('teams-bot-estado').textContent += ' Se lo menciona como @' + d.nombre + ' (el nombre de la app en Teams).';\n"
                "      $('teams-bot-estado').textContent += d.memoria ? ' Recuerda lo conversado en cada chat (hasta 2 horas).' : ' Falta correr el script 25 para que recuerde lo conversado: sin él, cada mensaje es independiente.';\n"
                "    });\n  }\n")


def servidor(s):
    # La sala le pasa a la página el nombre del bot (para el borrador del chat: «escribí @Gemma IM-4 …»)
    return _rep(s, '    teams_chat: await teamsChatSala(env, yo, inc, r[1].results),\n',
                '    teams_chat: Object.assign(await teamsChatSala(env, yo, inc, r[1].results), { bot: botNombre(env, null) }),\n')


def aplicar(s):
    s = servidor(s)
    return _html(s, 'ADMIN_HTML', admin)
