# Parche 67 (18/11): remate del tema único después de los parches 59 a 65 de Ale.
#   Se midió de nuevo en el navegador (tablero con sus tres pestañas, Seguimiento, Administración con sus diálogos y el detalle de la alerta con los suyos)
#   y quedaban campos sin el tamaño común (40 px de alto, letra de 15 px, esquinas de 3 px): el diálogo de Umbrales (36 px y letra de 14), el
#   selector de año de feriados, dos campos de Reglas de alerta y los filtros nuevos del Histórico (letra de 14). Se unifican todos los selectores y
#   campos de texto de las páginas con un solo bloque de CSS (el login queda como está), y los títulos de tarjeta de Operaciones ("Problemas activos", "Efectividad de los avisos") pasan a 16 px como los demás.
#   Solo páginas; sin SQL.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


# ":not(#_)" sube la especificidad para ganarle a las reglas sueltas de cada pantalla (por ejemplo ".fu-control input" de Umbrales)
CSS = """/* Todos los selectores y campos de texto con el mismo tamaño (parche 67) */
select:not(#_), input[type=text]:not(#_), input[type=search]:not(#_), input[type=email]:not(#_), input[type=password]:not(#_), input[type=number]:not(#_), input:not([type]):not(#_) {
  min-height: 40px; font-size: 15px; border-radius: 3px; }
.activos-cab h3, .pre-datos h3 { font-size: 16px; }
"""


def _agregar(h):
    i = h.index('</style>'); return h[:i] + CSS + h[i:]


def aplicar(s):
    for nombre in ('HTML', 'ADMIN_HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'COMUNICADOS_HTML', 'ALERTA_HTML'):
        s = _html(s, nombre, _agregar)
    return s
