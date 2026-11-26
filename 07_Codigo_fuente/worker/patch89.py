# Parche 89 (26/11): botones de las listas de alertas alineados y «¿Qué está pasando?» en todas las filas (sin SQL). Solo páginas.
#   Uriel vio en el tablero (Operaciones > Alertas abiertas) que el botón «Detalle» caía en lugares distintos según la fila (los botones iban pegados a la
#   derecha: si una alerta no tenía «Historial» todo se corría) y que a varias alertas les faltaba «¿Qué está pasando?» (el panel del asistente solo lo agregaba
#   donde había un botón con `data-id`; el Gerente, que solo tiene «Detalle», no lo recibía en las filas sin historial).
#   - Cada acción tiene su lugar fijo (`.sl`, un ancho por tipo de botón) y, si la fila no la tiene, queda el hueco: Detalle, Historial y «¿Qué está pasando?»
#     (y Derivar, Resolver, etc. para el Analista) quedan en las mismas columnas en todas las filas.
#   - «¿Qué está pasando?» se dibuja desde la propia lista en todas las alertas con acciones (si el perfil tiene el asistente) y el panel no lo duplica.
#   - En Seguimiento, igual: mismos lugares fijos para Derivar, Comentar, Resolver, Ver detalle, Historial y «¿Qué está pasando?».
#   - En el celular los huecos vacíos se ocultan y los botones se acomodan en renglones.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch89: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS_SLOTS = r'''/* Lugares fijos de los botones de cada fila (parche 89): el mismo botón cae en la misma columna en todas las filas */
.sl { display: block; flex: none; }
.sl-der { width: 74px; } .sl-tom { width: 56px; } .sl-res { width: 66px; } .sl-com { width: 82px; } .sl-det { width: 58px; } .sl-detl { width: 84px; } .sl-his { width: 66px; } .sl-exp { width: 136px; }
.acc-fila { gap: 4px; }
#t-abiertas tbody td:nth-child(3) { white-space: normal; min-width: 150px; }
.sl .btn, .sl .asis-explicar { display: block; box-sizing: border-box; width: 100%; margin: 0; text-align: center; white-space: nowrap; }
@media (max-width: 760px) {
  .acc-fila { flex-wrap: wrap; justify-content: flex-start; }
  .sl:empty { display: none; }
  .sl { width: auto !important; }
  .sl .btn, .sl .asis-explicar { width: auto; }
}
'''


def tablero(h):
    h = _rep(h, ".acc-fila { display: flex; gap: 6px; justify-content: flex-end; white-space: nowrap; }\n",
             ".acc-fila { display: flex; gap: 6px; justify-content: flex-start; white-space: nowrap; }\n" + CSS_SLOTS)
    viejo = (
        "        var r = g.ult, s = g.asig, acc = '';\n"
        "        if (g.sev !== 'BAJA') {\n"
        "          if (puedo('derivar')) acc += '<button class=\"btn chico\" data-acc-t=\"derivar\" data-id=\"' + g.id + '\">' + (s ? 'Reasignar' : 'Derivar') + '</button>';\n"
        "          if (puedo('derivar') && puedo('mis_alertas') && g.abiertas.length) acc += '<button class=\"btn chico\" data-acc-t=\"tomar\" data-id=\"' + g.id + '\">Tomar</button>';\n"
        "          if (puedo('derivar') || (s && yo && s.asignado_usuario_id === yo.id)) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n"
        "          if (puedo('detalle_alerta')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Detalle</a>';\n"
        "        }\n"
        "        if (g.eventos.length) acc += '<button class=\"btn chico enlace\" data-acc-t=\"historial\" data-id=\"' + g.id + '\">Historial</button>';\n")
    nuevo = (
        "        var r = g.ult, s = g.asig, acc = '';\n"
        "        // Cada botón tiene su lugar fijo (parche 89): si la fila no lo tiene, queda el hueco y los demás no se corren\n"
        "        var sl = function (k, html) { return '<span class=\"sl sl-' + k + '\">' + (html || '') + '</span>'; };\n"
        "        var botonHistorial = g.eventos.length ? '<button class=\"btn chico enlace\" data-acc-t=\"historial\" data-id=\"' + g.id + '\">Historial</button>' : '';\n"
        "        if (g.sev !== 'BAJA') {\n"
        "          if (puedo('derivar')) acc += sl('der', '<button class=\"btn chico\" data-acc-t=\"derivar\" data-id=\"' + g.id + '\">' + (s ? 'Reasignar' : 'Derivar') + '</button>');\n"
        "          if (puedo('derivar') && puedo('mis_alertas')) acc += sl('tom', g.abiertas.length ? '<button class=\"btn chico\" data-acc-t=\"tomar\" data-id=\"' + g.id + '\">Tomar</button>' : '');\n"
        "          if (puedo('derivar') || (s && yo && s.asignado_usuario_id === yo.id)) acc += sl('res', '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>');\n"
        "          if (puedo('detalle_alerta')) acc += sl('det', '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Detalle</a>');\n"
        "          acc += sl('his', botonHistorial);\n"
        "          if (puedo('asistente')) acc += sl('exp', '<button type=\"button\" class=\"asis-explicar\" data-asis-alerta=\"' + g.id + '\">¿Qué está pasando?</button>');\n"
        "        } else if (g.eventos.length) acc += sl('his', botonHistorial);\n")
    return _rep(h, viejo, nuevo)


def seguimiento(h):
    h = _rep(h, "td.acc { text-align: right; white-space: nowrap; }\n",
             "td.acc { white-space: nowrap; }\n.acc-fila { display: flex; gap: 6px; justify-content: flex-start; white-space: nowrap; }\n" + CSS_SLOTS)
    viejo = (
        "        var m = minutosDesde(g.cambio), e = ESTADO[g.estado], acc = '';\n"
        "        if (acciones) {\n"
        "          acc += '<button class=\"btn chico\" data-acc=\"derivar\" data-id=\"' + g.id + '\">' + (g.asig ? 'Reasignar' : 'Derivar') + '</button>';\n"
        "          acc += '<button class=\"btn chico\" data-acc=\"comentar\" data-id=\"' + g.id + '\">Comentar</button>';\n"
        "          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n"
        "        }\n"
        "        if (puedo('detalle_alerta')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>';\n"
        "        if (g.eventos.length) acc += '<button class=\"btn chico enlace\" data-acc=\"historial\" data-id=\"' + g.id + '\">Historial</button>';\n")
    nuevo = (
        "        var m = minutosDesde(g.cambio), e = ESTADO[g.estado], acc = '';\n"
        "        // Cada botón tiene su lugar fijo (parche 89): si la fila no lo tiene, queda el hueco y los demás no se corren\n"
        "        var sl = function (k, html) { return '<span class=\"sl sl-' + k + '\">' + (html || '') + '</span>'; };\n"
        "        if (acciones) {\n"
        "          acc += sl('der', '<button class=\"btn chico\" data-acc=\"derivar\" data-id=\"' + g.id + '\">' + (g.asig ? 'Reasignar' : 'Derivar') + '</button>');\n"
        "          acc += sl('com', '<button class=\"btn chico\" data-acc=\"comentar\" data-id=\"' + g.id + '\">Comentar</button>');\n"
        "          acc += sl('res', '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>');\n"
        "        }\n"
        "        if (puedo('detalle_alerta')) acc += sl('detl', '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>');\n"
        "        acc += sl('his', g.eventos.length ? '<button class=\"btn chico enlace\" data-acc=\"historial\" data-id=\"' + g.id + '\">Historial</button>' : '');\n"
        "        if (puedo('asistente')) acc += sl('exp', '<button type=\"button\" class=\"asis-explicar\" data-asis-alerta=\"' + g.id + '\">¿Qué está pasando?</button>');\n")
    h = _rep(h, viejo, nuevo)
    return _rep(h, "'<td class=\"acc\">' + acc + '</td></tr>'", "'<td class=\"acc\"><div class=\"acc-fila\">' + acc + '</div></td></tr>'")


def aplicar(s):
    s = _html(s, 'HTML', tablero)
    return _html(s, 'SEGUIMIENTO_HTML', seguimiento)
