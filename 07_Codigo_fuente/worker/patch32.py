# Parche 32: el recuadro "Urgente" de arriba del tablero decía "Sin asignar" cuando la alerta estaba asignada pero
# nadie la había tomado (solo miraba si estaba tomada). Ahora muestra el estado real, igual que la lista de alertas:
#   - "En curso: <persona>"                          tomada
#   - "Asignada a <persona>, sin tomar"            asignada a una persona (con o sin equipo)
#   - "Asignada al equipo <equipo>, sin tomar"     asignada solo a un equipo
#   - "Devuelta al analista"                        la devolvieron y nadie la volvió a derivar
#   - "Sin asignar"                                 nadie la tiene
#   - nada                                          el perfil no ve las alertas (Gerente): antes le decía "Sin asignar" siempre
# Solo la página del tablero; sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


ESTADO_JS = r"""      // Estado real del problema más urgente (parche 32): tomada, asignada sin tomar, devuelta o sin asignar
      var quien = (function (g) {
        var al = g.alertas || [];
        if (!al.length) return '';   // el perfil no ve las alertas abiertas (Gerente)
        if (g.reconocida) return 'En curso: ' + esc(g.quien || 'el equipo');
        var asig = al.filter(function (a) { return a.asignado_usuario_id != null || a.asignado_equipo_id != null; })
          .sort(function (x, y) { return (x.asignado_en || '') < (y.asignado_en || '') ? 1 : -1; })[0];
        if (asig && asig.asignado_nombre) return 'Asignada a ' + esc(asig.asignado_nombre) + (asig.equipo_nombre ? ' (equipo ' + esc(asig.equipo_nombre) + ')' : '') + ', sin tomar';
        if (asig && asig.equipo_nombre) return 'Asignada al equipo ' + esc(asig.equipo_nombre) + ', sin tomar';
        var ids = al.map(function (a) { return a.alerta_id; });
        var ev = ((d && d.eventos) || []).filter(function (e) { return ids.indexOf(e.alerta_id) >= 0; });
        if (ev.length && ev[ev.length - 1].accion === 'DEVOLVER') return 'Devuelta al analista';
        return 'Sin asignar';
      })(problemas[0]);
"""


def tablero(h):
    h = _rep(h, "      var quien = problemas[0].reconocida ? 'Tomado por ' + esc(problemas[0].quien || 'el equipo') : 'Sin asignar';\n", ESTADO_JS)
    h = _rep(h, "' (hace ' + corto(c.dur) + ') | ' + quien;", "' (hace ' + corto(c.dur) + ')' + (quien ? ' | ' + quien : '');")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
