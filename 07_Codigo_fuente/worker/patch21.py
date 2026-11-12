# Paso 21 del build: "Seguimiento" para analistas (en el tablero: botón con pendientes de derivar) y el analista ya no toma alertas
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    s = rep(s, "//   GET  /mis-alertas, POST /api/alertas/<id>/(derivar|tomar|comentar|devolver|resolver)  asignación\n",
               "//   GET  /mis-alertas, POST /api/alertas/<id>/(derivar|tomar|comentar|devolver|resolver)  asignación\n"
               "//   GET  /seguimiento, /api/seguimiento    todas las alertas abiertas y quién las tiene (analistas)\n")
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    h = rep(h, '    <a class="btn" id="lnk-mis" href="/mis-alertas" hidden>',
               '    <a class="btn" id="lnk-seg" href="/seguimiento" hidden title="Alertas abiertas y quién las tiene"><span class="largo">Seguimiento</span><span class="corto">Seguim.</span><span class="badge" id="badge-seg" hidden></span></a>\n'
               '    <a class="btn" id="lnk-mis" href="/mis-alertas" hidden>')
    h = rep(h, '        <a role="menuitem" id="lnk-mis2" href="/mis-alertas" hidden>Mis alertas</a>',
               '        <a role="menuitem" id="lnk-mis2" href="/mis-alertas" hidden>Mis alertas</a>\n        <a role="menuitem" id="lnk-seg2" href="/seguimiento" hidden>Seguimiento</a>')
    h = rep(h, "    $('lnk-mis').hidden = $('lnk-mis2').hidden = !puedo('mis_alertas');",
               "    $('lnk-mis').hidden = $('lnk-mis2').hidden = !puedo('mis_alertas');\n    $('lnk-seg').hidden = $('lnk-seg2').hidden = !puedo('seguimiento');")
    # Número del botón Seguimiento: alertas (no informativas) que nadie tiene asignadas, incluidas las devueltas
    h = rep(h, "    if (d.mis_pendientes != null) {",
               """    (function () {
      var sin = {};
      (d.abiertas || []).forEach(function (r) {
        if (r.severidad === 'BAJA') return;
        var k = clave(r) + '|' + r.tipo_alerta;
        if (!(k in sin)) sin[k] = true;
        if (r.asignado_usuario_id != null || r.asignado_equipo_id != null) sin[k] = false;
      });
      var n = Object.keys(sin).filter(function (k) { return sin[k]; }).length;
      $('badge-seg').textContent = n; $('badge-seg').hidden = !n;
    })();
    if (d.mis_pendientes != null) {""")
    # Los botones ocultos (Mis alertas, Seguimiento) no se mostraban: .btn pisaba el atributo hidden
    h = rep(h, '.badge[hidden] { display: none; }', '.badge[hidden], .btn[hidden] { display: none; }\n/* En el celular el acceso a Seguimiento queda en el menú del usuario */\n@media (max-width: 560px) { #lnk-seg { display: none; } }')
    # El analista deriva; tomar queda para quien trabaja las alertas (Administrador)
    h = rep(h, "          if (puedo('derivar') && g.abiertas.length) acc +=", "          if (puedo('derivar') && puedo('mis_alertas') && g.abiertas.length) acc +=")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
