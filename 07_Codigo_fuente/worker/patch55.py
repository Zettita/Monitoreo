# Parche 55 (17/11): marca "Abierta hace más de 24 h" en la lista de alertas abiertas del tablero (en Seguimiento va en seguimiento.html).
# Sale de la caída del incidente de 231 horas que apareció en la reunión con Hugo (12/11): un incidente que sigue abierto días
# pasa desapercibido. Solo la página; sin SQL. (Además: el asistente pasa a Gemma, con botones Derivar armados por el servidor.)
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS = ".vieja { display: inline-block; margin-top: 3px; padding: 0 6px; border-radius: 3px; border: 1px solid var(--critica); background: var(--critica-bg); color: var(--critica-txt, var(--critica)); font-size: 11.5px; font-weight: 700; line-height: 18px; }\n"
FUNC = """  // Abierta hace más de 24 h (parche 55)
  function viejaTxt(d, iso) {
    var m = Math.max(0, Math.round((ahoraMs(d) - aFecha(iso).getTime()) / 60000));
    return m < 1440 ? '' : '<br><span class="vieja" title="Lleva más de 24 horas abierta. Conviene revisar si sigue siendo un problema o si hay que cerrarla.">Abierta hace ' + (m >= 2880 ? Math.floor(m / 1440) + ' días' : Math.floor(m / 60) + ' h') + '</span>';
  }
"""


def tablero(h):
    h = _rep(h, ".prio { display: inline-block;", CSS + ".prio { display: inline-block;")
    h = _rep(h, "  function ahoraMs(d) {", FUNC + "  function ahoraMs(d) {")
    h = _rep(h, "'</td><td>' + diaHora(g.desde) + '</td><td class=\"num\">' + g.n", "'</td><td>' + diaHora(g.desde) + viejaTxt(d, g.desde) + '</td><td class=\"num\">' + g.n")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
