# Paso 22 del build: "Mis alertas" y "Seguimiento" solo en el menú del usuario (con su número), y un punto en el avatar si hay pendientes
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    # Fuera de la barra
    h = rep(h, '    <a class="btn" id="lnk-seg" href="/seguimiento" hidden title="Alertas abiertas y quién las tiene"><span class="largo">Seguimiento</span><span class="corto">Seguim.</span><span class="badge" id="badge-seg" hidden></span></a>\n', '')
    h = rep(h, '    <a class="btn" id="lnk-mis" href="/mis-alertas" hidden><span class="largo">Mis alertas</span><span class="corto">Mías</span><span class="badge" id="badge-mis" hidden></span></a>\n', '')
    # En el menú, con el número de pendientes
    h = rep(h, '<a role="menuitem" id="lnk-mis2" href="/mis-alertas" hidden>Mis alertas</a>',
               '<a role="menuitem" id="lnk-mis2" href="/mis-alertas" hidden>Mis alertas<span class="badge" id="badge-mis" hidden title="Pendientes de tomar o en curso"></span></a>')
    h = rep(h, '<a role="menuitem" id="lnk-seg2" href="/seguimiento" hidden>Seguimiento</a>',
               '<a role="menuitem" id="lnk-seg2" href="/seguimiento" hidden>Seguimiento<span class="badge" id="badge-seg" hidden title="Alertas sin asignar"></span></a>')
    # Punto en el avatar cuando hay algo pendiente
    h = rep(h, '<button class="avatar" id="btn-avatar" aria-haspopup="menu" aria-expanded="false" title="Mi cuenta"><span id="avatar-ini">·</span></button>',
               '<button class="avatar" id="btn-avatar" aria-haspopup="menu" aria-expanded="false" title="Mi cuenta"><span id="avatar-ini">·</span><span class="punto-avatar" id="punto-avatar" hidden></span></button>')
    h = rep(h, '/* En el celular el acceso a Seguimiento queda en el menú del usuario */\n@media (max-width: 560px) { #lnk-seg { display: none; } }',
               '/* Mis alertas y Seguimiento viven en el menú del usuario: el número va al lado y un punto en el avatar avisa que hay pendientes */\n'
               '.menu a[role="menuitem"] .badge { float: right; margin-left: 10px; }\n'
               '#btn-avatar { position: relative; }\n'
               '.punto-avatar { position: absolute; top: -1px; right: -1px; width: 11px; height: 11px; border-radius: 50%; background: var(--critica); box-shadow: 0 0 0 2px var(--panel); }\n'
               '.punto-avatar[hidden] { display: none; }')
    h = rep(h, "    $('lnk-mis').hidden = $('lnk-mis2').hidden = !puedo('mis_alertas');\n    $('lnk-seg').hidden = $('lnk-seg2').hidden = !puedo('seguimiento');",
               "    $('lnk-mis2').hidden = !puedo('mis_alertas');\n    $('lnk-seg2').hidden = !puedo('seguimiento');")
    h = rep(h, "    if (d.mis_pendientes != null) { $('badge-mis').textContent = d.mis_pendientes; $('badge-mis').hidden = !d.mis_pendientes; }",
               "    if (d.mis_pendientes != null) { $('badge-mis').textContent = d.mis_pendientes; $('badge-mis').hidden = !d.mis_pendientes; }\n"
               "    (function () {\n"
               "      var mis = puedo('mis_alertas') && d.mis_pendientes ? d.mis_pendientes : 0;\n"
               "      var seg = puedo('seguimiento') && !$('badge-seg').hidden ? Number($('badge-seg').textContent) : 0;\n"
               "      var txt = [mis ? mis + (mis === 1 ? ' alerta tuya' : ' alertas tuyas') : '', seg ? seg + ' sin asignar' : ''].filter(Boolean).join(' · ');\n"
               "      $('punto-avatar').hidden = !(mis || seg);\n"
               "      $('btn-avatar').title = (yo ? yo.nombre + ' · ' + (PERFIL_TXT[yo.perfil] || yo.perfil) : 'Mi cuenta') + (txt ? ' · ' + txt : '');\n"
               "    })();")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
