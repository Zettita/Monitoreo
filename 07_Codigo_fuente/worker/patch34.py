# Parche 34: se saca el botón "Revisar alertas ahora" (decidido el 14/11).
#   - Hoy cada revisión recorre las últimas 24 h (~6.500 filas): un botón al alcance de cualquier Analista o Administrador
#     multiplica las lecturas sin hacer falta (cada escena de la demo ya revisa sola y, en producción, revisa el cron o la
#     llegada de datos). Revisar solo la ventana nueva es la etapa 3 (revisión incremental), pendiente.
#   - Se borra el botón del tablero y su código. La ruta manual (POST /api/procesar, GET /procesar) deja de existir en
#     Cloudflare: solo queda si el Worker tiene PERMITIR_REVISION_MANUAL = '1', que usan las pruebas de la PC.
#   - El permiso 'procesar' queda solo para esa ruta de pruebas. Sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def tablero(h):
    h = _rep(h, '<button class="btn primario" id="btn-procesar" hidden><span class="largo">Revisar alertas ahora</span><span class="corto">Revisar</span></button>\n', '')
    h = _rep(h, "    $('btn-procesar').hidden = !puedo('procesar');\n", '')
    a = h.index("  $('btn-procesar').addEventListener('click', function () {\n")
    b = h.index("      .then(function () { b.disabled = false; b.innerHTML = html0; });\n  });\n", a) + len("      .then(function () { b.disabled = false; b.innerHTML = html0; });\n  });\n")
    h = h[:a] + h[b:]
    assert 'btn-procesar' not in h and '/api/procesar' not in h
    return h


def aplicar(s):
    s = _html(s, 'HTML', tablero)
    s = _rep(s, "      if ((request.method === 'POST' && ruta === '/api/procesar') || (request.method === 'GET' && ruta === '/procesar')) {",
             "      // Revisión manual: ya no hay botón (parche 34). La ruta solo existe para las pruebas de la PC (PERMITIR_REVISION_MANUAL = '1');\n"
             "      // en Cloudflare las revisiones las hacen las escenas de la demo y el cron (o, más adelante, la llegada de datos).\n"
             "      if (env.PERMITIR_REVISION_MANUAL === '1' && request.method === 'POST' && ruta === '/api/procesar') {")
    s = _rep(s, "//   POST /api/procesar   o  GET /procesar ejecuta el proceso en el momento",
             "//   POST /api/procesar   ejecuta el proceso en el momento (solo con PERMITIR_REVISION_MANUAL = '1': pruebas de la PC)")
    return s
