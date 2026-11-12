# Paso 13 del build: etapa 1 de acceso (login, sesiones, perfiles y permisos)
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    # --- Servidor ---
    login_html = open(os.path.join(AQUI, 'login.html')).read()
    auth = open(os.path.join(AQUI, 'auth_server.js')).read()
    k = s.index('export default {')
    s = s[:k] + 'const LOGIN_HTML = ' + json.dumps(login_html, ensure_ascii=False) + ';\n\n' + auth.strip() + '\n\n' + s[k:]
    s = rep(s, """    const ruta = url.pathname.replace(/\\/+$/, '') || '/';
    try {
""", """    const ruta = url.pathname.replace(/\\/+$/, '') || '/';
    try {
      if (!env.DB) throw new Error('No se encontró la base D1: falta el binding "DB".');
      // Login y permisos: devuelve una respuesta (login, 401, 403...) o el usuario de la sesión
      const acceso = await controlarAcceso(env, request, ruta);
      if (acceso instanceof Response) return acceso;
      const yo = acceso.usuario;
""")
    s = rep(s, "        return Response.json(await procesarAlertas(env));\n",
               "        const r = await procesarAlertas(env);\n        await auditar(env, yo.id, 'PROCESAR', null);\n        return Response.json(r);\n")
    s = rep(s, "        return await accionAlerta(env, m[1], m[2], request);", "        return await accionAlerta(env, m[1], m[2], request, yo);")
    s = rep(s, """async function accionAlerta(env, alertaId, accion, request) {
  let cuerpo = {};
  try { cuerpo = await request.json(); } catch (e) { /* cuerpo vacío */ }
  const usuario = String(cuerpo.usuario || '').trim().slice(0, 80);
  if (!usuario) return Response.json({ ok: false, error: 'Falta el nombre de usuario.' }, { status: 400 });""",
"""async function accionAlerta(env, alertaId, accion, request, yo) {
  let cuerpo = {};
  try { cuerpo = await request.json(); } catch (e) { /* cuerpo vacío */ }
  const usuario = yo.nombre;   // el nombre sale de la sesión, no de lo que mande la página""")
    s = rep(s, """    return Response.json({ ok: false, error: 'La alerta no existe o ya cambió de estado. Actualicen la página.' }, { status: 409 });
  }
  return Response.json({ ok: true });""", """    return Response.json({ ok: false, error: 'La alerta no existe o ya cambió de estado. Actualicen la página.' }, { status: 409 });
  }
  await auditar(env, yo.id, accion === 'reconocer' ? 'TOMAR_ALERTA' : 'RESOLVER_ALERTA', alertaId);
  return Response.json({ ok: true });""")
    s = rep(s, "        if (request.method === 'POST' && ruta === '/api/demo/preparar') return Response.json(await demoPreparar(env));",
               "        if (request.method === 'POST' && ruta === '/api/demo/preparar') { const r = await demoPreparar(env); await auditar(env, yo.id, 'DEMO_PREPARAR', null); return Response.json(r); }")

    # --- Página ---
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])
    h = rep(h, '      <button class="btn primario" id="btn-procesar">Revisar alertas ahora</button>\n',
               '      <button class="btn primario" id="btn-procesar" hidden>Revisar alertas ahora</button>\n'
               '      <span class="yo" id="yo"></span>\n'
               '      <button class="btn" id="btn-clave">Cambiar contraseña</button>\n'
               '      <button class="btn" id="btn-salir">Salir</button>\n')
    h = rep(h, '<div class="toast" id="toast" role="status"></div>', '''<div class="toast" id="toast" role="status"></div>
<dialog id="dlg-clave">
  <form id="f-clave" method="dialog">
    <h2>Cambiar contraseña</h2>
    <p class="bajada" id="clave-motivo">Elegí una contraseña de al menos 10 caracteres.</p>
    <label>Contraseña actual<input type="password" id="c-actual" autocomplete="current-password" required></label>
    <label>Contraseña nueva<input type="password" id="c-nueva" autocomplete="new-password" required></label>
    <label>Repetir contraseña nueva<input type="password" id="c-nueva2" autocomplete="new-password" required></label>
    <p class="error-form" id="c-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" id="c-cancelar">Cancelar</button><button type="submit" class="btn primario" id="c-guardar">Guardar</button></div>
  </form>
</dialog>''')
    css = '''
/* Usuario de la sesión y cambio de contraseña */
.yo { font-size: 13.5px; color: var(--ink-2); padding-left: 6px; border-left: 1px solid var(--line); }
.yo b { color: var(--ink); font-weight: 600; }
#dlg-clave { border: 1px solid var(--line); border-radius: 12px; padding: 22px; width: min(400px, calc(100vw - 32px)); background: var(--panel); color: var(--ink); }
#dlg-clave::backdrop { background: rgba(10, 20, 25, .45); }
#dlg-clave h2 { margin: 0 0 4px; font-size: 19px; }
#dlg-clave label { display: block; font-size: 13.5px; font-weight: 600; margin-top: 12px; }
#dlg-clave input { display: block; width: 100%; margin-top: 5px; font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.error-form { margin: 12px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--critica-bg); color: var(--critica); font-size: 13.5px; }
.acc-dlg { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
'''
    h = rep(h, ".toast {", css.strip() + "\n.toast {")
    # pedir(): si la sesión venció, vuelve al login
    h = rep(h, """    return fetch(url, opciones).then(function (r) {
      return r.json().then(function (j) {""", """    return fetch(url, opciones).then(function (r) {
      if (r.status === 401) { location.href = '/login'; throw new Error('Tu sesión venció.'); }
      return r.json().then(function (j) {""")
    # usuario(): ya no se pregunta el nombre, sale de la sesión
    a = h.index("  function usuario() {")
    b = h.index("  }\n", h.index("return u;", a)) + 4
    h = h[:a] + "  function usuario() { return yo ? yo.nombre : null; }\n" + h[b:]
    # botones de alerta según perfil
    h = rep(h, "        var acc = g.sev === 'BAJA' ? '' :", "        var acc = g.sev === 'BAJA' || !puedo('accion_alerta') ? '' :")
    # el panel de demo solo para quien tiene permiso (se muestra al iniciar)
    h = rep(h, "  if (modoDemo) {\n    $('demo').hidden = false;\n    cargarDemo();\n", "  if (modoDemo) {\n")
    # arranque: primero el usuario, después los datos
    h = rep(h, """  // Sin actualización automática: los datos se cargan al abrir la página, con el botón
  // "Actualizar", con los botones de la demo y al tomar o resolver una alerta.
  cargar();
""", r"""  // ---- Sesión: usuario, perfil y permisos ----
  var PERFIL_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte' };
  var yo = null, permisos = [];
  function puedo(p) { return permisos.indexOf(p) >= 0; }
  function abrirClave(obligatorio) {
    var d = $('dlg-clave');
    $('f-clave').reset(); $('c-error').hidden = true;
    $('c-cancelar').hidden = !!obligatorio;
    $('clave-motivo').textContent = obligatorio ? 'Es tu primer ingreso: elegí una contraseña nueva de al menos 10 caracteres.' : 'Elegí una contraseña de al menos 10 caracteres.';
    d.dataset.obligatorio = obligatorio ? '1' : '';
    d.showModal();
  }
  $('dlg-clave').addEventListener('cancel', function (ev) { if (this.dataset.obligatorio) ev.preventDefault(); });
  $('c-cancelar').addEventListener('click', function () { $('dlg-clave').close(); });
  $('f-clave').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var err = $('c-error');
    if ($('c-nueva').value !== $('c-nueva2').value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; err.hidden = false; return; }
    var b = $('c-guardar'); b.disabled = true;
    pedir('/api/cambiar-clave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actual: $('c-actual').value, nueva: $('c-nueva').value }) })
      .then(function () {
        var obligatorio = !!$('dlg-clave').dataset.obligatorio;
        $('dlg-clave').close(); toast('Contraseña actualizada.');
        if (obligatorio) { yo.debe_cambiar = false; arrancarDatos(); }
      })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; })
      .then(function () { b.disabled = false; });
  });
  $('btn-clave').addEventListener('click', function () { abrirClave(false); });
  $('btn-salir').addEventListener('click', function () {
    pedir('/api/logout', { method: 'POST' }).catch(function () {}).then(function () { location.href = '/login'; });
  });
  function arrancarDatos() {
    if (modoDemo && puedo('demo')) { $('demo').hidden = false; cargarDemo(); }
    cargar();
  }
  // Sin actualización automática: los datos se cargan al abrir la página, con el botón
  // "Actualizar", con los botones de la demo y al tomar o resolver una alerta.
  pedir('/api/yo').then(function (r) {
    yo = r.usuario; permisos = r.permisos || [];
    $('yo').innerHTML = '<b>' + esc(yo.nombre) + '</b> · ' + esc(PERFIL_TXT[yo.perfil] || yo.perfil);
    $('btn-procesar').hidden = !puedo('procesar');
    if (yo.debe_cambiar) abrirClave(true); else arrancarDatos();
  }).catch(function (e) { toast(e.message, true); });
""")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
