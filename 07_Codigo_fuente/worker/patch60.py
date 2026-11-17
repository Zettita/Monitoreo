# Parche 60 (17/11): pedido de Ale después de mirar todo con los perfiles. Textos y detalles.
#   - Se sacan los textos explicativos que pidió (tablero, Disponibilidad, Distribución de fallas, Administración, Mis alertas,
#     asistente, Resolver alerta).
#   - "Operación ahora" pasa a "Operaciones"; "De mis equipos" pasa a "Equipos".
#   - Pre-alertas con frases más profesionales y el resumen de 48 h en tarjetas.
#   - Asistente: el botón dice la acción ("Derivar", "Tomar"…) en lugar de "Hacerlo: derivar".
#   - Analista: la pestaña Disponibilidad va última y el tablero arranca en Operaciones.
#   - Menú del usuario: "Mis alertas" también en Comunicados y en el detalle de la alerta (Soporte puede ir y volver).
#   - Soporte ya no reasigna alertas (ni el responsable del equipo): derivar y reasignar quedan para el Analista.
#   - Auditoría: la columna "Fecha y hora" no se parte en dos renglones.
# Solo cambia páginas y una regla del servidor. Sin SQL.
import re


def _r(s, viejo, nuevo, n=1):
    c = s.count(viejo)
    if (n is None and c == 0) or (n is not None and c != n):
        raise SystemExit('patch60: se esperaban %s y hay %d de: %r' % (n, c, viejo[:90]))
    return s.replace(viejo, nuevo)


def _re(s, patron, nuevo, n=1):
    s2, c = re.subn(patron, nuevo, s, flags=re.S)
    if (n is None and c == 0) or (n is not None and c != n):
        raise SystemExit('patch60: se esperaban %s y hay %d de la expresión: %r' % (n, c, patron[:90]))
    return s2


# <p class="bajada">…</p> que empiezan con este texto (dentro de las páginas, con las comillas escapadas)
BAJADAS = [
    'Elegí desde qué día y hasta qué día mirar',
    'Qué parte de los problemas del período',
    'Cómo está ahora cada servicio de cada cliente',
    'Quién puede entrar y con qué perfil',
    'Grupos de personas a los que',
    'Avisos propios: qué métrica mirar',
    'Cada vez que se revisan las alertas, las que están sin asignar',
    'Cómo se evalúan las alertas de todos los clientes',
    'Modelos para \\"Template correo alerta\\"',
    'Solo lectura. Muestra contra qué perfil',
    'Quién hizo qué y cuándo',
    'Asignadas a tu usuario o a tus equipos, todavía sin tomar',
    'Alertas tomadas por tu usuario',
    'Sos responsable de estos equipos',
    'Qué parte de tus problemas',
]

TENDENCIAS = [
    ("'El tráfico viene bajando'", "'Tendencia a la baja en el volumen de operaciones'"),
    ("'Las aprobaciones vienen bajando'", "'Tendencia a la baja en la tasa de aprobación'"),
    ("'Los rechazos vienen subiendo'", "'Tendencia al alza en la tasa de rechazo'"),
    ("'Los errores vienen subiendo'", "'Tendencia al alza en la tasa de error'"),
    ("'El servicio se está poniendo lento'", "'Tendencia al alza en el tiempo de respuesta'"),
]

PRE_CSS = ('<style>.balance{margin:0 0 10px}.pre-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px}'
           '.pre-kpi{border:1px solid var(--line);border-radius:4px;padding:10px 12px;background:var(--panel)}'
           '.pre-kpi b{display:block;font-size:22px;font-weight:600;color:var(--ink)}.pre-kpi span{font-size:13px;color:var(--ink-2)}</style>')


def aplicar(s):
    # ---- Textos explicativos que se van ----
    for t in BAJADAS:
        s = _re(s, r'\s*<p class=\\"bajada\\"(?: id=\\"[a-z-]+\\")?>' + re.escape(t) + r'[^<]*</p>', '')
    s = _r(s, "'Usuarios, equipos, reglas de alerta, derivación automática, umbrales por cliente y registro de actividad.'", "''")
    s = _r(s, " <span class=\\\"dd-hint\\\">· tocá una barra para ver los clientes de cada grupo</span>", '')
    s = _r(s, "'El último día todavía no terminó: se mide hasta ahora.'", "''")
    s = _re(s, r"'<p class=\\\"dd-ayuda\\\">Verde: llega al objetivo\..*?Rojo: más que eso\.</p></div>'", "'</div>'")
    s = _re(s, r"'<p class=\\\"dd-nota\\\">Cuenta como sin servicio: .*?'\.</p></div>'", "'</div>'")
    s = _r(s, "'Cada problema es una alerta de un servicio y canal, de principio a fin (las ventanas seguidas cuentan una vez). No incluye avisos informativos. Pasá el mouse por una fila para ver el detalle.'", "''")
    s = _re(s, r'\\"Solo los problemas asignados a tu usuario o a tus equipos\..*?\\"', '\\\\"\\\\"')
    s = _r(s, "'. Tocá una barra para ver solo esos en la lista.</p>'", "'.</p>'")

    # ---- Asistente ----
    s = _r(s, "'Responde con lo que tu perfil puede ver · te quedan ' + n + ' preguntas esta hora'", "'Te quedan ' + n + ' preguntas esta hora'", None)
    s = _r(s, '<small id=\\"asis-sub\\">Responde con lo que tu perfil puede ver</small>', '<small id=\\"asis-sub\\"></small>', None)
    s = _r(s, "data-si>Hacerlo: ' + ACC_TXT[p.tipo] + '</button>",
           "data-si>' + ({ derivar: 'Derivar', tomar: 'Tomar', comentar: 'Comentar', devolver: 'Devolver', resolver: 'Resolver' }[p.tipo] || 'Hacerlo') + '</button>", None)

    # ---- Operaciones y pre-alertas ----
    s = _r(s, 'tabindex=\\"-1\\">Operación ahora<span', 'tabindex=\\"-1\\">Operaciones<span')
    for a, b in TENDENCIAS:
        s = _r(s, a, b, None)
    s = _r(s, 'Ninguna métrica viene empeorando en este momento.', 'Sin métricas con tendencia de deterioro en este momento.')
    s = _r(s, 'Podría pasar en unos ', 'Superaría el umbral en aprox. ', 2)
    s = _r(s, "'<div class=\\\"valores\\\">Ahora ' + valor(r.metrica, r.valor_observado) + '. Lo normal es ' + valor(r.metrica, r.valor_esperado) +\\n"
              "        ' y la alerta salta ' + (subir ? 'por encima de ' : 'por debajo de ') + valor(r.metrica, r.umbral) + '.</div>' +",
           "'<div class=\\\"valores\\\">Valor actual: <b>' + valor(r.metrica, r.valor_observado) + '</b> · Esperado: ' + valor(r.metrica, r.valor_esperado) +\\n"
           "        ' · Umbral de alerta: ' + (subir ? 'más de ' : 'menos de ') + valor(r.metrica, r.umbral) + '</div>' +")
    s = _re(s, r"\$\('balance'\)\.innerHTML = todas\.length\\n      \? 'En las últimas 48 horas avisamos .*?: 'Todavía no hubo avisos anticipados en las últimas 48 horas\.';",
            "$('balance').innerHTML = todas.length\\\\n      ? '<div class=\\\\\"pre-kpis\\\\\">' + [[todas.length, 'Avisos anticipados (48 h)'], [conf.length, 'Confirmados como alerta'],"
            " [conf.length ? minutos(ant) : '—', 'Anticipación promedio'], [noc.length, 'No confirmados']].map(function (k) {"
            " return '<div class=\\\\\"pre-kpi\\\\\"><b>' + k[0] + '</b><span>' + k[1] + '</span></div>'; }).join('') + '</div>'\\\\n"
            "      : 'Sin avisos anticipados en las últimas 48 horas.';")
    s = _r(s, '<p class=\\"balance\\" id=\\"balance\\"></p>', PRE_CSS.replace('"', '\\"') + '<div class=\\"balance\\" id=\\"balance\\"></div>')

    # ---- Resolver alerta ----
    s = _r(s, '<small>Elegí una.</small>', '')
    s = _r(s, '<small>Podés elegir más de una.</small>', '')
    s = _r(s, '<small class=\\"gris\\" id=\\"v-oblig\\">(opcional si elegiste la causa y qué se hizo)</small>', '<small class=\\"gris\\" id=\\"v-oblig\\"></small>')

    # ---- Mis alertas ----
    s = _r(s, '<h2>De mis equipos</h2>', '<h2>Equipos</h2>')

    # ---- Auditoría: la fecha en un renglón ----
    s = _r(s, "'<thead><tr><th>Fecha y hora</th>", "'<thead><tr><th style=\\\"white-space:nowrap;width:1%\\\">Fecha y hora</th>")
    s = _r(s, "return '<tr><td>' + esc(fechaHora(f.fecha)) + '</td>", "return '<tr><td style=\\\"white-space:nowrap\\\">' + esc(fechaHora(f.fecha)) + '</td>")

    # ---- Analista: Disponibilidad última y arranca en Operaciones ----
    s = _r(s, "    $('lnk-admin').hidden = !puedo('admin_panel'); if ($('lnk-com')) $('lnk-com').hidden = !puedo('comunicados');\\n    $('lnk-mis2')",
           "    $('lnk-admin').hidden = !puedo('admin_panel'); if ($('lnk-com')) $('lnk-com').hidden = !puedo('comunicados');\\n"
           "    if (yo.perfil === 'ANALISTA') { PESTANAS = ['op', 'hist', 'disp']; $('pestanas').appendChild($('tab-disp'));"
           " irPestana(PEST_GUARDADA || 'op'); }\\n    $('lnk-mis2')")
    s = _r(s, "if (PESTANAS.indexOf(k) < 0) k = 'disp';", "if (PESTANAS.indexOf(k) < 0) k = PESTANAS[0];")
    s = _r(s, "(function () { var ult = 'disp'; try { ult = sessionStorage.getItem('helios_pestana') || 'disp'; } catch (e) { /* nada */ } irPestana(ult); })();",
           "var PEST_GUARDADA = null; try { PEST_GUARDADA = sessionStorage.getItem('helios_pestana'); } catch (e) { /* nada */ } irPestana(PEST_GUARDADA || 'disp');")

    # ---- Menú: "Mis alertas" también en Comunicados y en el detalle de la alerta ----
    menu_viejo = ('<a role=\\"menuitem\\" href=\\"/\\" id=\\"lnk-tablero\\">Tablero</a>\\n'
                  '        <a role=\\"menuitem\\" href=\\"/seguimiento\\" id=\\"lnk-seg\\" hidden>Seguimiento</a>\\n'
                  '        <a role=\\"menuitem\\" href=\\"/comunicados\\" id=\\"lnk-com\\" hidden>Comunicados</a>')
    menu_nuevo = ('<a role=\\"menuitem\\" href=\\"/\\" id=\\"lnk-tablero\\">Tablero</a>\\n'
                  '        <a role=\\"menuitem\\" href=\\"/mis-alertas\\" id=\\"lnk-misal\\" hidden>Mis alertas</a>\\n'
                  '        <a role=\\"menuitem\\" href=\\"/seguimiento\\" id=\\"lnk-seg\\" hidden>Seguimiento</a>\\n'
                  '        <a role=\\"menuitem\\" href=\\"/comunicados\\" id=\\"lnk-com\\" hidden>Comunicados</a>')
    s = _r(s, menu_viejo, menu_nuevo, 3)   # Mis alertas (el enlace queda oculto: es esa página), Comunicados y detalle
    s = _r(s, "    $('lnk-seg').hidden = !puedo('seguimiento');\\n    if (!puedo('tablero')) { $('lnk-tablero').hidden = true; $('btn-tablero').style.display = 'none';",
           "    $('lnk-seg').hidden = !puedo('seguimiento'); $('lnk-misal').hidden = !puedo('mis_alertas');\\n    if (!puedo('tablero')) { $('lnk-tablero').hidden = true; $('btn-tablero').style.display = 'none';")
    s = _r(s, "    if (!puedo('tablero')) { $('lnk-tablero').hidden = true; $('lnk-marca').setAttribute('href', '/mis-alertas'); }\\n    if (!ID) {",
           "    if (!puedo('tablero')) { $('lnk-tablero').hidden = true; $('lnk-marca').setAttribute('href', '/mis-alertas'); }\\n"
           "    $('lnk-misal').hidden = !puedo('mis_alertas'); if ($('lnk-com')) $('lnk-com').hidden = !puedo('comunicados');\\n    if (!ID) {")

    # ---- Soporte no reasigna: derivar y reasignar quedan para el Analista ----
    s = _r(s, "      if (!loLidero) return prohibido('Solo un analista o el responsable del equipo pueden derivar esta alerta.');",
           "      return prohibido('Solo un analista puede derivar o reasignar una alerta.');")
    s = _r(s, "    reasignar: ab && !rol.analista && rol.loLidero,", "    reasignar: false,   // desde el parche 60 Soporte no reasigna")
    s = _r(s, "datos.lidero.indexOf(a.asignado_equipo_id) >= 0) acc +=", "datos.lidero.indexOf(a.asignado_equipo_id) >= 0 && false) acc +=")
    return s
