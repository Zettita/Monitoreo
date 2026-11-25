# Parche 83 (25/11): Demo oficial en UNA sola escena (sin SQL). Ver demo_oficial_escena_server.js.
#   - Pedido de Uriel y su compañera: con 14 escenas había que dar muchas vueltas entre perfiles. Ahora la demo oficial es una escena que carga de una vez
#     4 horas de datos (16 ventanas de 15 minutos) y deja incidentes en todos los estados: sin asignar, asignada sin tomar, en curso, devuelta, a un equipo,
#     resueltas a mano (con causa) y solas, pre-alertas confirmadas / no cumplida / activa y un cliente nuevo.
#   - La carga se hace en pasos cortos (6 + 6 + 4 ventanas y las asignaciones) para no pasar las 50 consultas que D1 permite por pedido; la página los encadena sola.
#   - Reemplaza el módulo del parche 82 (demo_oficial_server.js queda en el repositorio como el punto de partida del 82).
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch83: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def tablero(h):
    # Textos del panel de la demo oficial (una sola escena, un botón «Cargar escena»)
    h = _rep(h, "      s.textContent = 'Toquen \"' + PD + '\" para empezar desde cero (' + e.total + ' escenas).';",
             "      s.textContent = 'Toquen \"' + PD + '\" para empezar desde cero (' + (e.total === 1 ? '1 escena' : e.total + ' escenas') + ').';")
    h = _rep(h, "      t.textContent = 'Demo terminada (' + e.total + ' escenas)';",
             "      t.textContent = demoOficial ? 'Demo oficial cargada' : 'Demo terminada (' + e.total + ' escenas)';")
    h = _rep(h, "    t.textContent = 'Próxima: escena ' + e.siguiente.numero + ' de ' + e.total + ' · ventana ' + hora(e.siguiente.ventana_inicio) + ' · ' + e.siguiente.titulo + (e.siguiente.acto ? ' · ' + e.siguiente.acto : '');",
             "    t.textContent = demoOficial ? 'Escena única · ' + e.siguiente.titulo : 'Próxima: escena ' + e.siguiente.numero + ' de ' + e.total + ' · ventana ' + hora(e.siguiente.ventana_inicio) + ' · ' + e.siguiente.titulo + (e.siguiente.acto ? ' · ' + e.siguiente.acto : '');")
    h = _rep(h, "    s.textContent = e.siguiente.texto;\n    sig.disabled = false;",
             "    s.textContent = e.siguiente.texto;\n    if (demoOficial) sig.textContent = 'Cargar escena ▶';\n    sig.disabled = false;")
    h = _rep(h, "        toast('Demo lista: ' + r.total + ' escenas. Empieza en la ventana de las ' + hora(r.inicio) + '.');",
             "        toast(demoOficial ? 'Demo oficial lista: toquen \"Cargar escena\".' : 'Demo lista: ' + r.total + ' escenas. Empieza en la ventana de las ' + hora(r.inicio) + '.');")
    # La escena se carga en varios pasos cortos (cada uno es un pedido) y la página los sigue sola hasta terminar
    h = _rep(h, "      pedir(DEMO_API + '/siguiente', { method: 'POST' }).then(function (r) {\n"
                "        toast('Escena ' + r.escena + ': ' + r.titulo + ' · ' + r.proceso.registradas_o_actualizadas + ' alertas registradas, ' + r.proceso.resueltas + ' resueltas.');\n"
                "        return cargar();\n"
                "      }).catch(function (e) { toast(e.message, true); })\n"
                "        .then(function () { b.textContent = 'Siguiente escena ▶'; return cargarDemo(); });",
             "      function paso() {\n"
             "        return pedir(DEMO_API + '/siguiente', { method: 'POST' }).then(function (r) {\n"
             "          if (r.listo === false) { b.textContent = 'Cargando… ' + r.avance + ' %'; return paso(); }\n"
             "          toast(r.mensaje || ('Escena ' + r.escena + ': ' + r.titulo + ' · ' + r.proceso.registradas_o_actualizadas + ' alertas registradas, ' + r.proceso.resueltas + ' resueltas.'));\n"
             "          return cargar();\n"
             "        });\n"
             "      }\n"
             "      paso().catch(function (e) { toast(e.message, true); })\n"
             "        .then(function () { b.textContent = demoOficial ? 'Cargar escena ▶' : 'Siguiente escena ▶'; return cargarDemo(); });")
    return h


def aplicar(s):
    # El módulo de la demo oficial: de las 14 escenas del parche 82 a la escena única
    i = s.index('// =====================================================================\n// DEMO OFICIAL (parche 82). Sin SQL.')
    j = s.index('\n\nconst LOGIN_HTML = ')
    assert i < j
    s = s[:i] + _leer('demo_oficial_escena_server.js').strip() + s[j:]
    # El paso necesita saber quién presenta (las derivaciones quedan hechas por esa persona)
    s = _rep(s, "return Response.json(await demoOficialSiguiente(env));", "return Response.json(await demoOficialSiguiente(env, yo));")
    s = _html(s, 'HTML', tablero)
    return s
