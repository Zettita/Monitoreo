# Parche 50 (disponibilidad más clara en el tablero):
#   1. El texto largo de abajo de la disponibilidad ("Se mide en ventanas de 15 minutos… El objetivo y la forma de medir…") se reemplaza por una línea
#      corta: lo que cuenta cada gravedad (Grave = 100 % · Importante = 50 % · Leve = 0 %, con los valores configurados).
#   2. El semáforo y la barra ahora comparan la disponibilidad del período que se está mirando (día, semana o mes) con el objetivo: antes se comparaba
#      el tiempo sin servicio contra el margen de TODO el mes, así que un día con 96 % de disponibilidad salía en verde ("Cumple") aunque el objetivo
#      fuera 99,9 %. Ahora: verde = llega al objetivo; amarillo = no llega pero tuvo hasta 1,5 veces el tiempo sin servicio que permite el objetivo
#      (editable en "Cómo se mide la disponibilidad"); rojo = más. Para un mes completo da lo mismo que antes.
#   3. La barra tiene una marca que indica lo que permite el objetivo, y el texto dice cuántos minutos estuvo sin servicio contra cuántos permite.
#   Sin SQL nuevo. Prueba: pruebas/disponibilidadtest.mjs
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS_TABLERO = """/* Disponibilidad más clara (parche 50) */
.dd-barra { position: relative; }
.dd-barra u { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); opacity: .7; text-decoration: none; }
"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    # ---- 2 y 3. Barra con la marca de lo que permite el objetivo; la barra llega hasta el límite del amarillo ----
    h = _rep(h, "  function barraUso(c, estado) { return '<span class=\"dd-barra\" aria-hidden=\"true\"><i class=\"' + (estado || '') + '\" style=\"width:' + Math.max(c > 0 ? 3 : 0, Math.min(100, Math.round(c * 100))) + '%\"></i></span>'; }",
             "  var dispoAm = 1.5;\n"
             "  // La barra llega hasta el límite del amarillo; la marca indica lo que permite el objetivo (verde hasta la marca, amarillo hasta el final, rojo cuando se llena)\n"
             "  function barraUso(c, estado) {\n"
             "    var tope = Math.max(1.0001, dispoAm), w = Math.max(c > 0 ? 3 : 0, Math.min(100, Math.round(c / tope * 100)));\n"
             "    return '<span class=\"dd-barra\" aria-hidden=\"true\" title=\"La marca indica lo que permite el objetivo\"><i class=\"' + (estado || '') + '\" style=\"width:' + w + '%\"></i><u style=\"left:' + Math.round(1000 / tope) / 10 + '%\"></u></span>';\n"
             "  }")
    h = _rep(h, "    return 'Usó ' + minD(x.minutos_perdidos) + ' de los ' + minD(x.minutos_permitidos) + ' que permite el mes (' + (x.consumo > 9.99 ? 'más de 1.000' : Math.round(x.consumo * 100).toLocaleString('es-AR')) + ' %)';",
             "    return 'Estuvo ' + minD(x.minutos_perdidos) + ' sin servicio; el objetivo permite hasta ' + minD(x.minutos_permitidos);")
    h = _rep(h, "var pg = cfg.pesos_gravedad || {}, am = cfg.umbral_amarillo || 1.5;", "var pg = cfg.pesos_gravedad || {}, am = cfg.umbral_amarillo || 1.5;\n    dispoAm = am;")
    h = _rep(h, "' Objetivo del mes: <b>' + pctD(g.objetivo) + '</b>'", "' Objetivo: <b>' + pctD(g.objetivo) + '</b> de disponibilidad'")
    h = _rep(h, "<p>Objetivo del mes para ' + esc(c.cliente_id) + ': <b>'", "<p>Objetivo para ' + esc(c.cliente_id) + ': <b>'")
    h = _rep(h, "Verde: usó hasta el 100 % del margen de errores del mes. Amarillo: hasta el ' + Math.round(am * 100).toLocaleString('es-AR') + ' %. Rojo: más.</p></div>';",
             "Verde: llega al objetivo. Amarillo: no llega, pero el tiempo sin servicio es hasta ' + (Math.round(am * 100) / 100).toLocaleString('es-AR') + ' veces lo que permite el objetivo. Rojo: más que eso.</p></div>';")
    # ---- 1. Texto corto ----
    i = h.index("'<p class=\"dd-nota\">Se mide en ventanas"); j = h.index("</p></div>';", i) + len("</p></div>';")
    h = h[:i] + ("'<p class=\"dd-nota\">Cuenta como sin servicio: alerta Grave = ' + porcent(pg.CRITICA != null ? pg.CRITICA : 1) + ' · Importante = ' + porcent(pg.ALTA != null ? pg.ALTA : 0.5)"
                 " + ' · Leve = ' + porcent(pg.MEDIA != null ? pg.MEDIA : 0) + '.</p></div>';") + h[j:]
    return h


def admin(h):
    h = _rep(h, "Verde: usó hasta el 100 % del margen de errores del mes (cumple). Amarillo: no cumple pero está cerca de volver. Rojo: no cumple y está lejos.",
             "Verde: llega al objetivo. Amarillo: no llega, pero está cerca. Rojo: no llega y está lejos.")
    h = _rep(h, "Amarillo hasta (% del margen del mes)", "Amarillo hasta (% del tiempo sin servicio que permite el objetivo)")
    h = _rep(h, "'Verde hasta el 100 % del margen · amarillo hasta el ' + nTxt(Math.round(c.am * 100)) + ' % · rojo más', 'Verde: cumple el objetivo del mes. Amarillo: no cumple pero está cerca de volver. Rojo: no cumple y está lejos'",
             "'Verde si llega al objetivo · amarillo hasta el ' + nTxt(Math.round(c.am * 100)) + ' % de lo que permite · rojo más', 'Verde: llega al objetivo. Amarillo: no llega pero está cerca. Rojo: no llega y está lejos'")
    h = _rep(h, "verde mientras use hasta ' + minutosTxt(mins) + ' (el margen), amarillo hasta '",
             "verde si el tiempo sin servicio no pasa de ' + minutosTxt(mins) + ' por mes (lo que permite el objetivo), amarillo hasta '")
    return h


def aplicar(s):
    # ---- Servidor: el margen es el del período medido (antes, el de todo el mes) ----
    s = _rep(s, "minutos_permitidos: Math.round((1 - objetivo) * minutosMes * 10) / 10,", "minutos_permitidos: Math.round((1 - objetivo) * medidos * 10) / 10,")
    s = _rep(s, "consumo: (1 - objetivo) * minutosMes > 0 ? perdidos / ((1 - objetivo) * minutosMes) : (perdidos > 0 ? 99 : 0) });",
             "consumo: (1 - objetivo) * medidos > 0 ? perdidos / ((1 - objetivo) * medidos) : (perdidos > 0 ? 99 : 0) });")
    s = _rep(s, "const perdidosEq = pp / pw, permitido = (1 - objetivo) * minutosMes;", "const perdidosEq = pp / pw, permitido = (1 - objetivo) * (pm / pw);")
    s = _rep(s, "    // Cumple mientras no se gaste todo el margen de errores del mes (si el mes no terminó, \"hasta ahora\")",
             "    // Cumple si la disponibilidad del período medido llega al objetivo (consumo = tiempo sin servicio / el que permite el objetivo en ese mismo período)")
    s = _rep(s, "minutosMes: minutos del mes calendario del período (margen de errores)", "minutosMes: ya no se usa (el margen se calcula sobre lo medido del período)")
    s = _rep(s, "// Semáforo: verde = cumple (usó hasta todo el margen de errores del mes); amarillo = no cumple pero está cerca (hasta umbral_amarillo veces el margen); rojo = más",
             "// Semáforo: verde = llega al objetivo; amarillo = no llega pero tuvo hasta umbral_amarillo veces el tiempo sin servicio que permite el objetivo; rojo = más")
    s = _rep(s, "El límite del amarillo tiene que estar entre 100 % y 1.000 % del margen del mes.", "El límite del amarillo tiene que estar entre 100 % y 1.000 % de lo que permite el objetivo.")
    s = _rep(s, "' % del margen';", "' % de lo permitido';")
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
