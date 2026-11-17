# Parche 58: un solo tema y un solo campo de fecha en todo Helios.
#   - Campo de fecha único (el de Disponibilidad, que se escribe como dd/mm/aaaa y tiene calendario): ahora también en el Histórico de alertas y en
#     "Clientes con más problemas" del tablero, y en Administración (auditoría, feriados y eventos comerciales). Código compartido en fecha_ui.py.
#   - Unificación del tema (estilo Atlassian con acento verde azulado): esquinas de 4 px en cajas y 3 px en campos y etiquetas, títulos con el mismo
#     grosor, rótulos de campos del mismo tamaño y etiquetas de estado como lozenges. Se aplica a todas las páginas con un bloque de CSS al final.
#   Solo páginas; sin SQL.
import json

import fecha_ui


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


# ---------------------------------------------------------------- tema: bloque final para todas las páginas
NORMA_CSS = """/* Un solo tema (parche 58): esquinas de 4 px en cajas y de 3 px en campos y etiquetas, como el resto del estilo Atlassian */
.menu [role="menuitem"], .menu a[role="menuitem"], .menu button[role="menuitem"] { border-radius: 3px; }
select, textarea, .filtros select, .filtros input, .campo input[type=text], .campo select, .campo textarea, .dlg .campo select, .dlg .campo textarea,
#dlg-clave input, .asis-acc textarea, .asis-pie textarea { border-radius: 3px; }
.fallas, .fallas-lista li, .activos, .filtro, .caso, .caso-nota, .toast, .com-card, .com-det, .com-aviso-push, .panel-det, .archivo-ficha, .redactar,
.como-decide, .dispo-ejemplo, .modelo-dice, .lista-check, .clave-temp code, .ejemplo-pl, .eq, .act-fila, .resumen-seg button, .resumen-mis a, .vacio-caja,
.listas-com label, .per-kpi, .error-form, .error, .aviso, .demo, .frase-regla, details.detalle, .pronostico, .ficha, .explica, .panel { border-radius: 4px; }
.fallas-seg { border-radius: 3px; }
.com-dest li, .tag-env, .det-resol .tag, .estado-chip, .estado-com, .rol, .tag-sim, .ticket-correo .ok { border-radius: 3px; }
dialog, dialog.dlg { border-radius: 4px; }
/* Títulos y rótulos con el mismo peso y tamaño en todas las pantallas */
.bloque > h2, .dos > div > h2, .bloque-seg > h2, .bloque-mis > h2, .cab-seccion h2, .titulo-filtro h2 { font-size: 20px; font-weight: 600; }
.panel-det h2 { font-size: 16px; font-weight: 600; }
dialog h2, dialog.dlg h2, #dlg-clave h2 { font-weight: 600; }
.filtros label, .filtros-seg label, .campo > span, .dlg label.campo { font-size: 14px; }
/* Filtros y formularios: selectores y campos de la misma altura que el campo de fecha, y botones de las barras de filtros iguales */
.filtros select, .filtros-seg select, .campo select, .dlg .campo select, .campo input:not([type=checkbox]):not([type=radio]):not([type=file]):not(.fecha-nat):not(.fecha-txt) {
  min-height: 40px; font-size: 15px; border-radius: 3px; border: 1px solid var(--line-input); background-color: var(--input-bg); color: var(--ink); padding: 6px 10px; }
.filtros .btn, .filtros-seg .btn { min-height: 40px; padding: 6px 16px; }
a.btn.chico, td .btn.chico { white-space: nowrap; }
"""


# ---------------------------------------------------------------- tablero: filtros de fecha del histórico y de clientes
def _filtro(k):
    return ('<div class="filtro-fechas" data-filtro="%s"><label>Desde %s</label><label>Hasta %s</label></div>'
            % (k, fecha_ui.ctrl(k + '-desde'), fecha_ui.ctrl(k + '-hasta')))


def _viejo(k):
    return ('<div class="filtro-fechas" data-filtro="%s"><label>Desde <input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-lado="desde"></label>'
            '<label>Hasta <input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-lado="hasta"></label></div>' % k)


CSS_TABLERO = """/* Pestañas, rótulos y etiquetas del tablero con el tema común (parche 58) */
.filtro-fechas .fecha-wrap { vertical-align: middle; }
.dd-chip { border-radius: 3px; text-transform: uppercase; font-size: 12px; letter-spacing: .01em; padding: 2px 6px; line-height: 16px; }
.dd-global, .dd-resumen, .dd-cli, .dd-rbarra, .cmp-card, .cmp-per, .cmp-dif, .cmp-nota { border-radius: 4px; }
.dd-global, .dd-resumen, .dd-cli, .cmp-card, .cmp-per { box-shadow: var(--shadow); }
.dd-barra, .dd-barra i, .dd-rpista, .dd-rpista i { border-radius: 4px; }
.pestanas button { border-radius: 3px 3px 0 0; }
.dd-resumen h3, .cmp-sec, .per-sub { font-size: 16px; font-weight: 600; }
"""


def tablero(h):
    for k in ('hist', 'cli'):
        h = _rep(h, _viejo(k), _filtro(k))
    # estilos viejos de los campos (chicos, centrados, sin calendario): el campo ahora es el de todo Helios
    h = _rep(h, ".filtro-fechas { display: inline-flex; gap: 10px; align-items: center; font-size: 13px; color: var(--ink-2); flex-wrap: wrap; }\n",
             ".filtro-fechas { display: inline-flex; gap: 12px; align-items: center; font-size: 14px; font-weight: 600; color: var(--ink-2); flex-wrap: wrap; }\n")
    h = _rep(h, ".filtro-fechas input.error { border-color: var(--critica); outline: 1px solid var(--critica); }\n", "")
    h = _rep(h, ".filtro-fechas input { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; width: 8.2em; text-align: center; font-variant-numeric: tabular-nums; }\n", "")
    h = _rep(h, ".titulo-filtro.chico .filtro-fechas { font-size: 12px; gap: 8px; }\n", "")
    # cómo se muestran y se aplican: mismo código que Disponibilidad (fecha completa y válida; calendario; vuelve a la última buena)
    h = _rep(h, """    var g = document.querySelector('.filtro-fechas[data-filtro="' + k + '"]');
    if (g) Array.prototype.forEach.call(g.querySelectorAll('input'), function (inp) {
      inp.value = aDMA(filtros[k][inp.getAttribute('data-lado')]); inp.classList.remove('error');
      inp.title = 'Entre el ' + aDMA(min) + ' y el ' + aDMA(hoy);
    });
    return filtros[k];
""", """    fLimites(k + '-desde', min, hoy); fLimites(k + '-hasta', min, hoy);
    ['desde', 'hasta'].forEach(function (lado) { var id = k + '-' + lado; if (document.activeElement !== $(id)) fPoner(id, filtros[k][lado]); });
    return filtros[k];
""")
    a = h.index("  // Mientras se escribe, agrega las barras: 26102026 -> 26/10/2026\n")
    fin = "    pintarPasado(datos);\n  }\n"
    b = h.index(fin, h.index("  function aplicarFecha(inp) {", a)) + len(fin)
    h = h[:a] + """  // Los filtros de fecha del histórico y de clientes usan el mismo campo que Disponibilidad (parche 58)
  function aplicarLado(k, lado) {
    var e = fEstado(k + '-' + lado), r = filtros[k]; if (e.estado !== 'ok' || !r || !datos) return;
    r[lado] = e.iso;
    if (r.desde > r.hasta) { if (lado === 'desde') r.hasta = r.desde; else r.desde = r.hasta; fPoner(k + '-desde', r.desde); fPoner(k + '-hasta', r.hasta); }
    pintarPasado(datos);
  }
  function avisoFecha(msg) { if (msg) toast(msg, true); }
  ['hist', 'cli'].forEach(function (k) {
    ['desde', 'hasta'].forEach(function (lado) { fEnganchar(k + '-' + lado, function () { aplicarLado(k, lado); }, avisoFecha); });
  });
""" + h[b:]
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    return h


# ---------------------------------------------------------------- Administración: auditoría, feriados y eventos
CSS_ADMIN = """/* Campos de fecha de Administración: los mismos que en el tablero (parche 58) */
.filtros input.fecha-txt { width: 170px; min-width: 170px; padding: 6px 40px 6px 12px; font-size: 15px; border-radius: 3px; border-color: var(--line-input); background: var(--input-bg); }
.campo .fecha-wrap { display: flex; }
.campo input.fecha-txt { width: 100%; min-height: 40px; padding: 6px 40px 6px 12px; font-size: 15px; border-radius: 3px; border-color: var(--line-input); }
"""

MASCARA_VIEJA = {
    'auditoria': """  ['a-desde', 'a-hasta'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var n = this.value.replace(/\\D/g, '').slice(0, 8);
      this.value = n.length > 4 ? n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4) : n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
      this.classList.remove('error');
    });
  });
""",
    'feriado': """  $('fer-fecha').addEventListener('input', function () {
    var n = this.value.replace(/\\D/g, '').slice(0, 8);
    this.value = n.length > 4 ? n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4) : n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
  });
""",
    'eventos': """  ['ev-desde', 'ev-hasta'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var n = this.value.replace(/\\D/g, '').slice(0, 8);
      this.value = n.length > 4 ? n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4) : n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
    });
  });
""",
}

MASCARA_NUEVA = {
    'auditoria': """  ['a-desde', 'a-hasta'].forEach(function (id) {
    $(id).addEventListener('input', function () { var t = fFormato(this.value); if (t !== this.value) this.value = t; this.classList.remove('error'); });
  });
""",
    'feriado': """  $('fer-fecha').addEventListener('input', function () { var t = fFormato(this.value); if (t !== this.value) this.value = t; });
""",
    'eventos': """  ['ev-desde', 'ev-hasta'].forEach(function (id) {
    $(id).addEventListener('input', function () { var t = fFormato(this.value); if (t !== this.value) this.value = t; });
  });
""",
}


def admin(h):
    h = _rep(h, '<label>Desde<input class="fecha" id="a-desde" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10"></label>', '<label>Desde' + fecha_ui.ctrl('a-desde') + '</label>')
    h = _rep(h, '<label>Hasta<input class="fecha" id="a-hasta" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10"></label>', '<label>Hasta' + fecha_ui.ctrl('a-hasta') + '</label>')
    h = _rep(h, '<input type="text" id="fer-fecha" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" required autocomplete="off">', fecha_ui.ctrl('fer-fecha', 'required'))
    h = _rep(h, '<input type="text" id="ev-desde" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" required autocomplete="off">', fecha_ui.ctrl('ev-desde', 'required'))
    h = _rep(h, '<label class="campo"><span>Hasta</span><input type="text" id="ev-hasta" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA (vacío = un día)" autocomplete="off"></label>',
             '<label class="campo"><span>Hasta (vacío = un día)</span>' + fecha_ui.ctrl('ev-hasta') + '</label>')
    for k in MASCARA_VIEJA:
        h = _rep(h, MASCARA_VIEJA[k], MASCARA_NUEVA[k])
    h = _rep(h, "  // ---------- Auditoría ----------\n", fecha_ui.JS + "\n  // ---------- Auditoría ----------\n")
    for a, b in (("'Revisá las fechas: tienen que ser DD/MM/AAAA.'", "'Revisá las fechas: tienen que ser dd/mm/aaaa.'"),
                 ("'La fecha tiene que ser DD/MM/AAAA.'", "'La fecha tiene que ser dd/mm/aaaa.'"),
                 ("'Las fechas tienen que ser DD/MM/AAAA.'", "'Las fechas tienen que ser dd/mm/aaaa.'")):
        h = _rep(h, a, b)
    i = h.index('</style>'); h = h[:i] + fecha_ui.CSS + CSS_ADMIN + h[i:]
    return h


def _norma(h):
    i = h.index('</style>'); return h[:i] + NORMA_CSS + h[i:]


def aplicar(s):
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'ADMIN_HTML', admin)
    for nombre in ('HTML', 'LOGIN_HTML', 'ADMIN_HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'COMUNICADOS_HTML', 'ALERTA_HTML'):
        s = _html(s, nombre, _norma)
    return s
