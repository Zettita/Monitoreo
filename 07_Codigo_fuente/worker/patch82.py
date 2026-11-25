# Parche 82 (25/11): Demo oficial (sin SQL). Ver demo_oficial_server.js.
#   - Un modo de demo nuevo, para presentarle Helios a un cliente: un solo relato en tres actos (Gerente, Administrador, Analista) donde los incidentes clave
#     quedan abiertos para trabajarlos en vivo. Arranca el martes 27/10/2026 10:00 ARG; 14 escenas.
#   - Endpoints propios (/api/demo-oficial, /preparar y /siguiente) y página propia: el tablero con ?demo=oficial muestra solo el panel de la demo oficial;
#     el tablero con ?demo sigue mostrando solo el de siempre. Los dos modos no se pisan: la ventana de «preparada» de la demo de siempre pasa a ser de un día.
#   - /inicio?demo=oficial lleva al tablero de la demo oficial.
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch82: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
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
    h = _rep(h, "  var modoDemo = /[?&]demo(=|&|$)/.test(location.search);\n",
             "  var modoDemo = /[?&]demo(=|&|$)/.test(location.search);\n"
             "  // Demo oficial (parche 82): el tablero con ?demo=oficial usa sus propios endpoints y solo muestra su panel\n"
             "  var demoOficial = /[?&]demo=oficial(&|$)/.test(location.search), DEMO_API = demoOficial ? '/api/demo-oficial' : '/api/demo', PD = demoOficial ? 'Preparar demo oficial' : 'Preparar demo';\n")
    h = _rep(h, "      t.textContent = 'Modo demo';\n      s.textContent = 'Toquen \"Preparar demo\" para empezar desde cero (' + e.total + ' escenas).';",
             "      t.textContent = demoOficial ? 'Demo oficial' : 'Modo demo';\n      s.textContent = 'Toquen \"' + PD + '\" para empezar desde cero (' + e.total + ' escenas).';")
    h = _rep(h, "      s.textContent = 'Para repetirla, toquen \"Preparar demo\".';", "      s.textContent = 'Para repetirla, toquen \"' + PD + '\".';")
    h = _rep(h, "' · ' + e.siguiente.titulo;\n    s.textContent = e.siguiente.texto;",
             "' · ' + e.siguiente.titulo + (e.siguiente.acto ? ' · ' + e.siguiente.acto : '');\n    s.textContent = e.siguiente.texto;")
    h = _rep(h, "return pedir('/api/demo').then(pintarDemo)", "return pedir(DEMO_API).then(pintarDemo)")
    h = _rep(h, "  if (modoDemo) {\n    $('btn-demo-preparar').addEventListener('click', function () {",
             "  if (modoDemo) {\n    $('btn-demo-preparar').textContent = PD;\n    $('btn-demo-preparar').addEventListener('click', function () {")
    h = _rep(h, "pedir('/api/demo/preparar', { method: 'POST' })", "pedir(DEMO_API + '/preparar', { method: 'POST' })")
    h = _rep(h, "        .then(function () { b.disabled = false; b.textContent = 'Preparar demo'; });", "        .then(function () { b.disabled = false; b.textContent = PD; });")
    h = _rep(h, "pedir('/api/demo/siguiente', { method: 'POST' })", "pedir(DEMO_API + '/siguiente', { method: 'POST' })")
    return h


def aplicar(s):
    # La demo de siempre solo está «preparada» el día de su arranque: la oficial empieza un día después y no se confunden
    s = _rep(s, "ahora < ini + 2 * 864e5", "ahora < ini + 864e5")
    # El módulo, justo antes de la página de login (después de la demo de siempre)
    s = _rep(s, "\nconst LOGIN_HTML = ", '\n' + _leer('demo_oficial_server.js').strip() + '\n\nconst LOGIN_HTML = ')
    # Rutas propias
    s = _rep(s, "        if (request.method === 'POST' && ruta === '/api/demo/siguiente') return Response.json(await demoSiguiente(env));\n",
             "        if (request.method === 'POST' && ruta === '/api/demo/siguiente') return Response.json(await demoSiguiente(env));\n"
             "        // Demo oficial (parche 82): endpoints separados de la demo de siempre\n"
             "        if (request.method === 'GET' && ruta === '/api/demo-oficial') return Response.json(await demoOficialEstado(env), { headers: { 'cache-control': 'no-store' } });\n"
             "        if (request.method === 'POST' && ruta === '/api/demo-oficial/preparar') { const r = await demoOficialPreparar(env); await auditar(env, yo.id, 'DEMO_OFICIAL_PREPARAR', null); return Response.json(r); }\n"
             "        if (request.method === 'POST' && ruta === '/api/demo-oficial/siguiente') return Response.json(await demoOficialSiguiente(env));\n")
    # /inicio?demo=oficial
    s = _rep(s, "        const destino = url.searchParams.has('demo') && puede(yo, 'demo') ? '/?demo' : inicioDe(yo);",
             "        const destino = url.searchParams.has('demo') && puede(yo, 'demo') ? (url.searchParams.get('demo') === 'oficial' ? '/?demo=oficial' : '/?demo') : inicioDe(yo);")
    s = _html(s, 'HTML', tablero)
    return s
