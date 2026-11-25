# Parche 86 (25/11): menú del usuario igual en todas las páginas y pestaña inicial del tablero tras ingresar (sin SQL). Solo páginas.
#   - Menú: cada página armaba el suyo y no coincidían (el tablero no tenía «Tablero»; Administración no tenía «Comunicados» ni «Administración»;
#     Seguimiento no tenía «Seguimiento»; «Cambiar contraseña» solo estaba en el tablero). menu_comun.js se agrega al final de las 8 páginas con menú:
#     las mismas entradas y en el mismo orden (Tablero, Mis alertas/tareas, Seguimiento, Mis tareas, Sala de crisis, Comunicados, Administración,
#     Cambiar contraseña, Tema y Salir), mostrando solo las que el perfil puede usar, con la página actual marcada.
#   - Pestaña inicial: el tablero recuerda la pestaña elegida (sessionStorage) y esa memoria sobrevivía a un cambio de usuario en la misma pestaña del
#     navegador: después de mirar Disponibilidad como Gerente, el Analista abría en Disponibilidad en lugar de Operaciones. Ahora el login borra esa memoria
#     (y la del período elegido), así cada ingreso arranca en la primera pestaña del perfil.
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
PAGINAS = ['HTML', 'ADMIN_HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'SALA_CRISIS_HTML', 'MIS_TAREAS_HTML', 'COMUNICADOS_HTML', 'ALERTA_HTML']


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch86: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def aplicar(s):
    js = open(os.path.join(AQUI, 'menu_comun.js'), encoding='utf-8').read().strip()

    def con_menu(h):
        assert 'id="menu-usuario"' in h
        i = h.rindex('</body>')
        return h[:i] + '<script>\n' + js + '\n</script>\n' + h[i:]

    for p in PAGINAS:
        s = _html(s, p, con_menu)

    def login(h):
        return _rep(h, ".then(function () { location.href = '/inicio' + location.search; })",
                    ".then(function () {\n      // Cada ingreso arranca en la primera pestaña del perfil: se borra lo que recordaba el navegador del usuario anterior\n"
                    "      try { sessionStorage.removeItem('helios_pestana'); sessionStorage.removeItem('helios_periodo'); } catch (e) { /* sin almacenamiento: no pasa nada */ }\n"
                    "      location.href = '/inicio' + location.search;\n    })")
    return _html(s, 'LOGIN_HTML', login)
