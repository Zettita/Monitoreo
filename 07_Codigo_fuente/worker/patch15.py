# Paso 15 del build: etapa 2 (administración: usuarios, equipos, reglas, modelo, auditoría)
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    leer = lambda n: open(os.path.join(AQUI, n)).read().strip()
    # --- Servidor ---
    k = s.index('export default {')
    s = s[:k] + leer('reglas_pers.js') + '\n\nconst ADMIN_HTML = ' + json.dumps(leer('admin.html') + '\n', ensure_ascii=False) + ';\n\n' + leer('admin_server.js') + '\n\n' + s[k:]
    s = rep(s, """      const yo = acceso.usuario;
""", """      const yo = acceso.usuario;
      // Administración (/admin y /api/admin/...): controla sus propios permisos
      const admin = await rutasAdmin(env, request, ruta, url, yo);
      if (admin) return admin;
""")
    s = rep(s, """    const [registrar, normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(CERRAR_NORMALIZADAS),
      env.DB.prepare(CERRAR_DESAPARECIDAS),
    ]);
    const pasos = [registrar, normalizadas, desaparecidas];
    return {
      ok: true,
      registradas_o_actualizadas: registrar.meta.changes,""", """    // Las reglas personalizadas se registran antes de los cierres, igual que las del sistema
    const [registrar, personalizadas, normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(REGISTRAR_PERSONALIZADAS_SQL),
      env.DB.prepare(CERRAR_NORMALIZADAS),
      env.DB.prepare(CERRAR_DESAPARECIDAS),
    ]);
    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];
    return {
      ok: true,
      registradas_o_actualizadas: registrar.meta.changes + personalizadas.meta.changes,""")
    s = rep(s, """      env.DB.prepare(Q_SERIES),
    ]);""", """      env.DB.prepare(Q_SERIES),
      env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
    ]);""")
    s = rep(s, """      series: r[10].results,
""", """      series: r[10].results,
      reglas_personalizadas: r[11].results,
""")
    s = rep(s, "//   POST /api/demo/siguiente             ingesta la ventana de la próxima escena\n",
               "//   POST /api/demo/siguiente             ingesta la ventana de la próxima escena\n"
               "//   GET  /login, /api/login, /api/setup  ingreso (ver ACCESO)\n"
               "//   GET  /admin, /api/admin/...          administración (ver ADMINISTRACIÓN)\n")

    # --- Página del tablero ---
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])
    h = rep(h, '        <button role="menuitem" id="btn-clave">Cambiar contraseña</button>\n',
               '        <a role="menuitem" id="lnk-admin" href="/admin" hidden>Administración</a>\n'
               '        <button role="menuitem" id="btn-clave">Cambiar contraseña</button>\n')
    h = rep(h, '.menu button[role="menuitem"]:hover, .menu button[role="menuitem"]:focus-visible { background: var(--track); }',
               '.menu button[role="menuitem"]:hover, .menu button[role="menuitem"]:focus-visible { background: var(--track); }\n'
               '.menu a[role="menuitem"] { display: block; padding: 8px 10px; border-radius: 7px; font-size: 14px; color: var(--ink); text-decoration: none; }\n'
               '.menu a[role="menuitem"]:hover, .menu a[role="menuitem"]:focus-visible { background: var(--track); }\n'
               '.menu a[role="menuitem"][hidden] { display: none; }')
    h = rep(h, "    if (abrir) m.querySelector('[role=\"menuitem\"]').focus();",
               "    if (abrir) m.querySelector('[role=\"menuitem\"]:not([hidden])').focus();")
    h = rep(h, "    $('btn-procesar').hidden = !puedo('procesar');\n",
               "    $('btn-procesar').hidden = !puedo('procesar');\n    $('lnk-admin').hidden = !puedo('admin_panel');\n")
    # Nombres de las reglas personalizadas (tipo_alerta PERS_<id>)
    h = rep(h, """  function pintar(d) {
    datos = d;
""", """  function pintar(d) {
    datos = d;
    (d.reglas_personalizadas || []).forEach(function (r) {
      var t = 'PERS_' + r.id, n = String(r.nombre || t);
      FRASE[t] = n;
      CORTA[t] = /^.[a-záéíóúñ]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
    });
""")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
