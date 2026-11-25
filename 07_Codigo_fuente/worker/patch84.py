# Parche 84 (25/11): las tarjetas de «Estado por cliente» ya no se rompen con textos largos (sin SQL). Solo la página del tablero.
#   - Problema: en cada línea de la tarjeta, el detalle de la derecha («Tendencia al alza en la tasa de rechazo», «Menos aprobaciones, más errores, sin
#     aprobaciones», «Sin historia para comparar»…) ocupaba hasta 160 px de los ~200 que tiene la línea, y el nombre del servicio quedaba en una columna de
#     40 px y se partía letra por letra («Recarga / de / celular · / web»).
#   - Arreglo: si el detalle es largo (más de 14 caracteres) la línea pasa a dos renglones: arriba el punto y el nombre del servicio con todo el ancho,
#     abajo el detalle alineado bajo el nombre. Los detalles cortos («Bien», «Lentitud», «Más rechazos») siguen a la derecha, como antes.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch84: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def tablero(h):
    # Estilos: la línea con detalle largo en dos renglones
    h = _rep(h, ".pano-cli li.st-PRE .pano-det { color: var(--pre-txt); }\n",
             ".pano-cli li.st-PRE .pano-det { color: var(--pre-txt); }\n"
             "/* Detalle largo: dos renglones (el nombre del servicio con todo el ancho y el detalle debajo) */\n"
             ".pano-cli li.largo { grid-template-columns: 10px minmax(0, 1fr); row-gap: 2px; align-items: start; }\n"
             ".pano-cli li.largo .pano-punto { margin-top: 4px; }\n"
             ".pano-cli li.largo .pano-det { grid-column: 2; max-width: none; text-align: left; }\n")
    # La línea lleva la clase «largo» cuando el detalle pasa de 14 caracteres
    h = _rep(h, "return '<li class=\"st-' + x.st + '\" title=\"' + esc(nom + ': ' + det) + '\">",
             "return '<li class=\"st-' + x.st + (det.length > 14 ? ' largo' : '') + '\" title=\"' + esc(nom + ': ' + det) + '\">")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
