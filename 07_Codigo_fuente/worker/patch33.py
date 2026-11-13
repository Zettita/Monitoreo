# Parche 33: el Analista puede ver cómo se resolvió una alerta (conversación, evidencia, causa y qué se hizo).
#   - Seguimiento > "Resueltas en las últimas 24 horas": botón "Ver detalle" en cada fila.
#   - Tablero > "Histórico de Alertas" (problemas resueltos): botón "Ver detalle" en cada fila.
#   - El botón solo aparece para quien tiene el detalle (Analista y Soporte; no Administrador ni Gerente).
#   - Q_INCIDENTES_30D suma alerta_id (una ventana cualquiera del problema: el detalle arma el grupo desde ella).
# Sin SQL en la base.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def seguimiento(h):
    h = _rep(h, "'<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Cómo se resolvió</th><th>Quién la tenía</th><th>Duró</th></tr></thead><tbody>'",
             "'<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Cómo se resolvió</th><th>Quién la tenía</th><th>Duró</th><th></th></tr></thead><tbody>'")
    h = _rep(h, "          '<td data-t=\"Duró\">' + esc(dur(m)) + '</td></tr>';",
             "          '<td data-t=\"Duró\">' + esc(dur(m)) + '</td>' +\n"
             "          '<td class=\"acc\">' + (puedo('detalle_alerta') ? '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>' : '') + '</td></tr>';")
    return h


def tablero(h):
    h = _rep(h, "'<thead><tr><th>Problema</th><th>Cliente y servicio</th><th>Inicio</th><th>Duración</th></tr></thead><tbody>'",
             "'<thead><tr><th>Problema</th><th>Cliente y servicio</th><th>Inicio</th><th>Duración</th>' + (puedo('detalle_alerta') ? '<th></th>' : '') + '</tr></thead><tbody>'")
    h = _rep(h, "Math.max(3, Math.round(90 * (r.duracion_minutos || 0) / max)) + 'px\"></div><span>' + minutos(r.duracion_minutos) + '</span></div></td></tr>';",
             "Math.max(3, Math.round(90 * (r.duracion_minutos || 0) / max)) + 'px\"></div><span>' + minutos(r.duracion_minutos) + '</span></div></td>' +\n"
             "          (puedo('detalle_alerta') ? '<td>' + (r.alerta_id ? '<a class=\"btn chico\" href=\"/alerta/' + esc(r.alerta_id) + '\">Ver detalle</a>' : '') + '</td>' : '') + '</tr>';")
    return h


def aplicar(s):
    s = _rep(s, "    COUNT(*) AS ventanas_afectadas,\n    ROUND((julianday(COALESCE(h.fecha_resolucion, p.ahora))",
             "    COUNT(*) AS ventanas_afectadas,\n    MIN(h.alerta_id) AS alerta_id,\n    ROUND((julianday(COALESCE(h.fecha_resolucion, p.ahora))")
    s = _html(s, 'SEGUIMIENTO_HTML', seguimiento)
    s = _html(s, 'HTML', tablero)
    return s
