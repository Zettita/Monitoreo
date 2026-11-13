# Parche 35: leyenda de colores en la conversación del detalle de una alerta.
# El color de cada punto dice qué tipo de movimiento es (no quién lo hizo): gris = derivar, tomar, devolver, reasignar
# o borrar un archivo; verde azulado = comentario; azul = archivo adjunto; verde = resolución. Usa los mismos colores
# que los puntos (variables del tema), así se ve bien en claro y en oscuro. Solo la página de detalle; sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


LEYENDA = ('<ul class="leyenda-hilo" aria-label="Qué significa cada color">'
           '<li><i class="mov"></i>Movimiento</li><li><i class="com"></i>Comentario</li>'
           '<li><i class="arc"></i>Archivo</li><li><i class="res"></i>Resolución</li></ul>')
CSS = """/* Leyenda de la conversación (parche 35) */
.cab-hilo { display: flex; justify-content: space-between; align-items: baseline; gap: 8px 14px; flex-wrap: wrap; margin-bottom: 10px; }
.cab-hilo h2 { margin: 0; }
.leyenda-hilo { list-style: none; margin: 0; padding: 0; display: flex; gap: 4px 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--ink-3); }
.leyenda-hilo li { display: inline-flex; align-items: center; gap: 5px; }
.leyenda-hilo i { width: 9px; height: 9px; border-radius: 50%; background: var(--line); flex: none; }
.leyenda-hilo i.com { background: var(--accent); }
.leyenda-hilo i.arc { background: var(--pre, var(--accent)); }
.leyenda-hilo i.res { background: var(--ok, var(--accent)); }
"""


def alerta(h):
    h = _rep(h, '        <h2>Conversación</h2>\n', '        <div class="cab-hilo"><h2>Conversación</h2>' + LEYENDA + '</div>\n')
    i = h.index('</style>')
    return h[:i] + CSS + h[i:]


def aplicar(s):
    return _html(s, 'ALERTA_HTML', alerta)
