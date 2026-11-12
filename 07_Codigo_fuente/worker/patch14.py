# Paso 14 del build: barra superior de ancho completo, menú de usuario y mejor uso del espacio
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])

    # --- Barra superior fuera del contenedor central ---
    a = h.index('<div class="wrap">\n  <header class="top">')
    b = h.index('  </header>\n', a) + len('  </header>\n')
    h = h[:a] + '''<header class="barra">
  <div class="marca"><span class="logo" aria-hidden="true"></span><b>Helios</b><span class="sub">Monitoreo de operaciones</span></div>
  <div class="derecha">
    <span class="reloj" id="reloj">Cargando…</span>
    <button class="btn" id="btn-actualizar">Actualizar</button>
    <button class="btn primario" id="btn-procesar" hidden><span class="largo">Revisar alertas ahora</span><span class="corto">Revisar</span></button>
    <div class="usuario">
      <button class="avatar" id="btn-avatar" aria-haspopup="menu" aria-expanded="false" title="Mi cuenta"><span id="avatar-ini">·</span></button>
      <div class="menu" id="menu-usuario" role="menu" hidden>
        <div class="menu-cab"><span class="avatar grande" aria-hidden="true"><span id="avatar-ini2">·</span></span><div><b id="menu-nombre"></b><span id="menu-perfil"></span></div></div>
        <button role="menuitem" id="btn-clave">Cambiar contraseña</button>
        <button role="menuitem" id="btn-salir">Salir</button>
      </div>
    </div>
  </div>
</header>
<div class="wrap">
''' + h[b:]

    # --- Pre-alertas: tarjetas y balance lado a lado ---
    h = rep(h, '''      <h2>Pre-Alertas</h2>
      
      <div id="pronosticos"></div>
      <div class="panel">
        <p class="balance" id="balance"></p>
        <ul class="historial" id="historial"></ul>
      </div>''', '''      <h2>Pre-Alertas</h2>
      <div class="pre-grid">
        <div id="pronosticos"></div>
        <div class="panel">
          <p class="balance" id="balance"></p>
          <ul class="historial" id="historial"></ul>
        </div>
      </div>''')

    css = '''
/* Barra superior: marca a la izquierda, acciones y usuario a la derecha */
.barra { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 10px 24px; background: var(--panel); border-bottom: 1px solid var(--line); box-shadow: var(--shadow); }
.barra .marca { display: flex; align-items: center; gap: 10px; min-width: 0; }
.barra .marca b { font-weight: 800; font-stretch: 112%; font-size: 18px; letter-spacing: -.01em; }
.barra .marca .sub { color: var(--ink-2); font-size: 14px; white-space: nowrap; }
.barra .logo { width: 26px; height: 26px; border-radius: 7px; background: var(--accent); position: relative; flex: none; }
.barra .logo::after { content: ""; position: absolute; inset: 7px; border-radius: 50%; border: 2.5px solid var(--sobre-accent); }
.barra .derecha { display: flex; align-items: center; gap: 10px; }
.barra .reloj { white-space: nowrap; }
.barra .btn { white-space: nowrap; }
.barra .corto { display: none; }
.usuario { position: relative; margin-left: 6px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; display: grid; place-items: center;
  background: var(--accent); color: var(--sobre-accent); font-weight: 700; font-size: 14px; letter-spacing: .02em; }
.avatar:hover, .avatar[aria-expanded="true"] { box-shadow: 0 0 0 3px var(--track); }
.avatar.grande { width: 40px; height: 40px; cursor: default; flex: none; }
.menu { position: absolute; right: 0; top: calc(100% + 8px); min-width: 230px; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(10, 25, 30, .14); padding: 6px; z-index: 30; }
.menu[hidden] { display: none; }
.menu-cab { display: flex; gap: 10px; align-items: center; padding: 8px 8px 10px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
.menu-cab b { display: block; font-size: 14.5px; }
.menu-cab span#menu-perfil { display: block; font-size: 12.5px; color: var(--ink-3); }
.menu button[role="menuitem"] { display: block; width: 100%; text-align: left; border: 0; background: transparent; color: var(--ink);
  padding: 8px 10px; border-radius: 7px; font-size: 14px; cursor: pointer; }
.menu button[role="menuitem"]:hover, .menu button[role="menuitem"]:focus-visible { background: var(--track); }
/* Contenido: más ancho en pantallas grandes */
.wrap { max-width: 1440px; }
.portada { grid-template-columns: minmax(0, 1fr) 360px; }
.pre-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; margin-top: 12px; }
.pre-grid #pronosticos .pronostico:last-child { margin-bottom: 0; }
.pre-grid #pronosticos .vacio { margin: 0; }
@media (max-width: 980px) {
  .pre-grid { grid-template-columns: 1fr; }
  .barra .marca .sub { display: none; }
}
@media (max-width: 640px) {
  .barra { padding: 8px 16px; gap: 8px; }
  .barra .reloj { display: none; }
  .barra .derecha { gap: 6px; }
  .barra .largo { display: none; }
  .barra .corto { display: inline; }
  .barra .btn { padding-left: 10px; padding-right: 10px; }
}
'''
    h = rep(h, ".toast {", css.strip() + "\n.toast {")

    # --- JS: avatar con iniciales y menú desplegable ---
    h = rep(h, "    $('yo').innerHTML = '<b>' + esc(yo.nombre) + '</b> · ' + esc(PERFIL_TXT[yo.perfil] || yo.perfil);",
"""    var ini = yo.nombre.split(/\\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?';
    $('avatar-ini').textContent = ini; $('avatar-ini2').textContent = ini;
    $('menu-nombre').textContent = yo.nombre; $('menu-perfil').textContent = PERFIL_TXT[yo.perfil] || yo.perfil;
    $('btn-avatar').title = yo.nombre + ' · ' + (PERFIL_TXT[yo.perfil] || yo.perfil);""")
    h = rep(h, "  $('btn-clave').addEventListener('click', function () { abrirClave(false); });",
"""  function menu(abrir) {
    var m = $('menu-usuario'), b = $('btn-avatar');
    if (abrir === undefined) abrir = m.hidden;
    m.hidden = !abrir; b.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (abrir) m.querySelector('[role="menuitem"]').focus();
  }
  $('btn-avatar').addEventListener('click', function (ev) { ev.stopPropagation(); menu(); });
  document.addEventListener('click', function (ev) { if (!ev.target.closest('.usuario')) menu(false); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('menu-usuario').hidden) { menu(false); $('btn-avatar').focus(); } });
  $('btn-clave').addEventListener('click', function () { menu(false); abrirClave(false); });""")
    h = rep(h, "    var b = this; b.disabled = true; b.textContent = 'Revisando…';", "    var b = this, html0 = b.innerHTML; b.disabled = true; b.textContent = 'Revisando…';")
    h = rep(h, "      .then(function () { b.disabled = false; b.textContent = 'Revisar alertas ahora'; });", "      .then(function () { b.disabled = false; b.innerHTML = html0; });")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
