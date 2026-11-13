import json, sys
src = sys.argv[1]; out = sys.argv[2]
s = open(src).read()
demo = open('demo_server.js').read()

# 1) Comentario de rutas
s = s.replace("//   POST /api/alertas/<id>/resolver      resuelve una alerta a mano\n",
"//   POST /api/alertas/<id>/resolver      resuelve una alerta a mano\n"
"//   GET  /?demo                          dashboard con el panel de demo\n"
"//   GET  /api/demo                       estado de la demo\n"
"//   POST /api/demo/preparar              deja la base lista para la demo\n"
"//   POST /api/demo/siguiente             ingesta la ventana de la próxima escena\n", 1)

# 2) HTML
i = s.index('const HTML = '); j = s.index(';\n', i)
html = json.loads(s[i+len('const HTML = '):j])
css = """
/* Panel de demo (solo con ?demo en la URL) */
.demo { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin: 14px 0 0; padding: 12px 16px; border: 1px dashed var(--pre); background: var(--pre-bg); border-radius: 8px; }
.demo[hidden] { display: none; }
.demo-txt { display: flex; flex-direction: column; gap: 3px; font-size: 14px; min-width: 0; flex: 1 1 320px; }
.demo-txt b { font-size: 15px; }
.demo-txt span { color: var(--ink-2); }
.demo-btns { display: flex; gap: 8px; flex-wrap: wrap; }
"""
assert '.toast {' in html
html = html.replace('.toast {', css.strip() + '\n.toast {', 1)
panel = """  <p class="aviso" id="aviso" hidden></p>
  <section class="demo" id="demo" hidden aria-live="polite">
    <div class="demo-txt"><b id="demo-titulo">Modo demo</b><span id="demo-sub">Cargando…</span></div>
    <div class="demo-btns">
      <button class="btn" id="btn-demo-preparar">Preparar demo</button>
      <button class="btn primario" id="btn-demo-siguiente">Siguiente escena ▶</button>
    </div>
  </section>"""
assert '  <p class="aviso" id="aviso" hidden></p>' in html
html = html.replace('  <p class="aviso" id="aviso" hidden></p>', panel, 1)
js = """
  // ---- Modo demo: aparece abriendo la página con ?demo ----
  var modoDemo = /[?&]demo(=|&|$)/.test(location.search);
  function pintarDemo(e) {
    var t = $('demo-titulo'), s = $('demo-sub'), sig = $('btn-demo-siguiente');
    if (!e.preparada) {
      t.textContent = 'Modo demo';
      s.textContent = 'Toquen "Preparar demo" para empezar desde cero (' + e.total + ' escenas).';
      sig.disabled = true; return;
    }
    if (!e.siguiente) {
      t.textContent = 'Demo terminada (' + e.total + ' escenas)';
      s.textContent = 'Para repetirla, toquen "Preparar demo".';
      sig.disabled = true; return;
    }
    t.textContent = 'Próxima: escena ' + e.siguiente.numero + ' de ' + e.total + ' · ventana ' + hora(e.siguiente.ventana_inicio) + ' · ' + e.siguiente.titulo;
    s.textContent = e.siguiente.texto;
    sig.disabled = false;
  }
  function cargarDemo() {
    return pedir('/api/demo').then(pintarDemo).catch(function (e) { $('demo-sub').textContent = e.message; });
  }
  if (modoDemo) {
    $('demo').hidden = false;
    cargarDemo();
    $('btn-demo-preparar').addEventListener('click', function () {
      if (!window.confirm('Se borran las alertas y las métricas recientes para empezar la demo desde cero. ¿Seguimos?')) return;
      var b = this; b.disabled = true; b.textContent = 'Preparando…';
      pedir('/api/demo/preparar', { method: 'POST' }).then(function (r) {
        toast('Demo lista: ' + r.total + ' escenas. Empieza en la ventana de las ' + hora(r.inicio) + '.');
        pintarDemo(r); return cargar();
      }).catch(function (e) { toast(e.message, true); })
        .then(function () { b.disabled = false; b.textContent = 'Preparar demo'; });
    });
    $('btn-demo-siguiente').addEventListener('click', function () {
      var b = this; b.disabled = true; b.textContent = 'Enviando ventana…';
      pedir('/api/demo/siguiente', { method: 'POST' }).then(function (r) {
        toast('Escena ' + r.escena + ': ' + r.titulo + ' · ' + r.proceso.registradas_o_actualizadas + ' alertas registradas, ' + r.proceso.resueltas + ' resueltas.');
        return cargar();
      }).catch(function (e) { toast(e.message, true); })
        .then(function () { b.textContent = 'Siguiente escena ▶'; return cargarDemo(); });
    });
  }

  // Actualización automática"""
assert '\n  // Actualización automática' in html
html = html.replace('\n  // Actualización automática', js, 1)
s = s[:i] + 'const HTML = ' + json.dumps(html, ensure_ascii=False) + s[j:]

# 3) Código del modo demo antes del export
k = s.index('export default {')
s = s[:k] + demo.strip() + '\n\n' + s[k:]

# 4) Rutas
old = "      return Response.json({ ok: false, error: 'Ruta no encontrada: ' + ruta }, { status: 404 });"
new = """      // Modo demo
      if (ruta.startsWith('/api/demo')) {
        if (!env.DB) throw new Error('No se encontró la base D1: falta el binding "DB".');
        if (request.method === 'GET' && ruta === '/api/demo') return Response.json(await demoEstado(env), { headers: { 'cache-control': 'no-store' } });
        if (request.method === 'POST' && ruta === '/api/demo/preparar') return Response.json(await demoPreparar(env));
        if (request.method === 'POST' && ruta === '/api/demo/siguiente') return Response.json(await demoSiguiente(env));
      }
""" + old
assert old in s
s = s.replace(old, new, 1)

# 5) Barras por cliente: la última barra es la de los últimos datos que ya debían llegar
#    (ahora menos la gracia), no la media hora que recién empieza y todavía está vacía
old_q = "SELECT ahora, horizonte_horas,\n"
assert old_q in s
s = s.replace(old_q, "SELECT ahora, horizonte_horas, gracia_minutos,\n", 1)
i = s.index('const HTML = '); j = s.index(';\n', i)
html = json.loads(s[i+len('const HTML = '):j])
old = "var fin = Math.ceil(ahoraMs(d) / 1800e3) * 1800e3, N = 48"
assert old in html
html = html.replace(old, "var gracia = ((d.parametros || {}).gracia_minutos || 5) * 60e3;\n    // Termina en la media hora de los últimos datos que ya tenían que llegar (ahora menos la gracia)\n    var fin = Math.ceil((ahoraMs(d) - gracia) / 1800e3) * 1800e3, N = 48", 1)
s = s[:i] + 'const HTML = ' + json.dumps(html, ensure_ascii=False) + s[j:]

# 6) Cron: con reloj simulado (modo demo) no hay nada nuevo que procesar, así que
#    no se ejecuta el proceso (evita leer todas las tablas cada 15 minutos)
old_c = """  async scheduled(controller, env, ctx) {
    try {
      const r = await procesarAlertas(env);"""
assert old_c in s
s = s.replace(old_c, """  async scheduled(controller, env, ctx) {
    try {
      // Con el reloj simulado (alerta_parametros.ahora) el tiempo no avanza solo:
      // las alertas se procesan desde el botón de la demo. El cron no hace nada.
      const reloj = await env.DB.prepare('SELECT ahora FROM alerta_parametros WHERE id = 1').first();
      if (reloj && reloj.ahora) {
        console.log('Reloj simulado en ' + reloj.ahora + ': el cron no procesa (modo demo).');
        return;
      }
      const r = await procesarAlertas(env);""", 1)

# 7) Dashboard: con reloj simulado los datos solo cambian con los botones de la demo,
#    así que no se recarga solo cada 5 minutos (cada recarga lee las tablas de D1)
i = s.index('const HTML = '); j = s.index(';\n', i)
html = json.loads(s[i+len('const HTML = '):j])
old1 = "  function cargar() {\n    return pedir('/api/dashboard').then(pintar).catch("
assert old1 in html
html = html.replace(old1, "  var relojSimulado = false;   // con reloj simulado no hay recarga automática\n  function cargar() {\n    return pedir('/api/dashboard').then(function (d) { relojSimulado = !!(d && d.parametros && d.parametros.ahora); return pintar(d); }).catch(", 1)
old2 = "setInterval(function () { if (!document.hidden) cargarYMarcar(); }, 300000);"
assert old2 in html
html = html.replace(old2, "setInterval(function () { if (!document.hidden && !relojSimulado) cargarYMarcar(); }, 300000);", 1)
old3 = "if (!document.hidden && Date.now() - ultimaCarga > 300000) cargarYMarcar();"
assert old3 in html
html = html.replace(old3, "if (!document.hidden && !relojSimulado && Date.now() - ultimaCarga > 300000) cargarYMarcar();", 1)
s = s[:i] + 'const HTML = ' + json.dumps(html, ensure_ascii=False) + s[j:]
import patch9
s = patch9.aplicar(s)
import patch10
s = patch10.aplicar(s)
import patch11
s = patch11.aplicar(s)
s = patch11.quitar_extras(s)
import patch12
s = patch12.aplicar(s)
import patch13
s = patch13.aplicar(s)
import patch14
s = patch14.aplicar(s)
import patch15
s = patch15.aplicar(s)
import patch16
s = patch16.aplicar(s)
import patch17
s = patch17.aplicar(s)
import patch18
s = patch18.aplicar(s)
import patch19
s = patch19.aplicar(s)
import patch20
s = patch20.aplicar(s)
import patch21
s = patch21.aplicar(s)
import patch22
s = patch22.aplicar(s)
import patch23
s = patch23.aplicar(s)
import patch24
s = patch24.aplicar(s)
import patch25
s = patch25.aplicar(s)
import patch26
s = patch26.aplicar(s)
import patch27
s = patch27.aplicar(s)
import patch28
s = patch28.aplicar(s)
import patch29
s = patch29.aplicar(s)
import patch30
s = patch30.aplicar(s)
import patch31
s = patch31.aplicar(s)
import patch32
s = patch32.aplicar(s)
import patch33
s = patch33.aplicar(s)
import patch34
s = patch34.aplicar(s)
open(out, 'w', encoding='utf-8', newline='\n').write(s)   # LF, igual que el Worker publicado
print('ok', len(s))
