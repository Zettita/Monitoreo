# Parche 91 (26/11): franjas de «Urgente» y «Pre-alerta» arriba del tablero, y botones del correo con nombres profesionales (sin SQL). Solo páginas.
#   Uriel pidió, tras mirar tres opciones, la 3: cada aviso de arriba (la alerta más urgente y la primera pre-alerta) pasa a ser una franja con
#   fondo translúcido del color del aviso, un ícono, el título, el detalle y un botón: «Ver detalle» (abre la alerta, si el perfil puede verla) y
#   «Ver pre-alerta» (va a Operaciones > Pre-Alertas). Hasta ahora eran dos renglones de texto.
#   Además, en «Confirmar envío» del correo los botones pasan de «Se envió tal cual / Se envió con cambios / No se envió» a «Se envió / Se envió con cambios /
#   No se envió», y en la conversación el estado dice «Enviado» (lo guardado en la base no cambia).
#   (El asistente para Gerente y Administrador y los botones de la sala de crisis están en asistente_server.js y sala_crisis.html.)
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch91: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS_FRANJAS = r'''
/* Franjas de «Urgente» y «Pre-alerta» (parche 91): fondo translúcido del color del aviso, ícono, texto y botón */
.portada .relato.franjas { display: flex; flex-direction: column; gap: 8px; max-width: 760px; margin-top: 18px; font-size: 14px; }
.franja { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 4px; border: 1px solid var(--critica); background: var(--critica-bg); }
.franja svg { flex: none; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.franja .f-txt { flex: 1; min-width: 0; }
.franja .f-tit { display: block; font-size: 14.5px; font-weight: 600; line-height: 1.3; }
.franja .f-tit strong { font-weight: 700; color: inherit; }
.franja .f-det { display: block; margin-top: 2px; font-size: 13px; line-height: 1.35; color: var(--ink-2); }
.franja .btn { flex: none; white-space: nowrap; text-decoration: none; background: var(--panel); color: var(--ink); }
.franja.urg { color: var(--critica-txt); }
.franja.pre { color: var(--media-txt); border-color: var(--media); background: var(--media-bg); }
@supports (background: color-mix(in srgb, red 10%, transparent)) {
  .franja.urg { background: color-mix(in srgb, var(--critica) 8%, transparent); border-color: color-mix(in srgb, var(--critica) 32%, transparent); }
  .franja.pre { background: color-mix(in srgb, var(--media) 12%, transparent); border-color: color-mix(in srgb, var(--media) 45%, transparent); }
}
@media (max-width: 560px) {
  .franja { flex-wrap: wrap; }
  .franja .f-txt { flex-basis: calc(100% - 34px); }
  .franja .btn { margin-left: 32px; }
}
'''

ICONO_URG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>'
ICONO_PRE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>'


def tablero(h):
    # La caja del texto pasa de párrafo a bloque (adentro van las franjas)
    h = _rep(h, '<p class="relato" id="relato"></p>', '<div class="relato" id="relato"></div>')
    h = _rep(h, ".portada .relato strong { color: var(--ink); font-weight: 600; }\n",
             ".portada .relato strong { color: var(--ink); font-weight: 600; }\n" + CSS_FRANJAS)
    # Urgente
    h = _rep(h,
        "      relato = 'Urgente: <strong>' + esc(c.serie.cliente_id) + '</strong> | ' + esc(servicioCorto(c.serie)) + ' ' +\n"
        "        esc(CORTA[c.principal.tipo] || frase(c.principal.tipo, c.principal.ult).toLowerCase()) + ' desde ' + hora(c.inicio) + ' (hace ' + corto(c.dur) + ')' + (quien ? ' | ' + quien : '');\n",
        "      var verDetalle = puedo('detalle_alerta') && c.alertas && c.alertas.length && c.alertas[0].alerta_id\n"
        "        ? '<a class=\"btn chico\" href=\"/alerta/' + esc(c.alertas[0].alerta_id) + '\">Ver detalle</a>' : '';\n"
        "      relato = franjaPortada('urg', '" + ICONO_URG + "',\n"
        "        'Urgente: <strong>' + esc(c.serie.cliente_id) + '</strong> | ' + esc(servicioCorto(c.serie)) + ' ' + esc(CORTA[c.principal.tipo] || frase(c.principal.tipo, c.principal.ult).toLowerCase()),\n"
        "        'Desde ' + hora(c.inicio) + ' (hace ' + corto(c.dur) + ')' + (quien ? ' | ' + quien : ''), verDetalle);\n")
    # Pre-alerta
    h = _rep(h,
        "      relato += (relato ? '<br>' : '') + '⚠️ Pre-alerta: <strong>' + esc(a.cliente_id) + '</strong> | ' + esc(servicioCorto(a)) + ' ' +\n"
        "        esc((TENDENCIA[a.metrica] || '').toLowerCase()) + ' | alerta en ~' + a.minutos_estimados + 'm';\n",
        "      relato += franjaPortada('pre', '" + ICONO_PRE + "',\n"
        "        'Pre-alerta: <strong>' + esc(a.cliente_id) + '</strong> | ' + esc(servicioCorto(a)) + ' ' + esc((TENDENCIA[a.metrica] || '').toLowerCase()),\n"
        "        'Podría pasar a alerta en unos ' + a.minutos_estimados + ' minutos', puedo('alertas_abiertas') ? '<button type=\"button\" class=\"btn chico\" data-ir-pre=\"1\">Ver pre-alerta</button>' : '');\n")
    h = _rep(h, "    $('relato').innerHTML = relato;\n",
             "    $('relato').className = 'relato' + (relato.indexOf('class=\"franja ') >= 0 ? ' franjas' : '');\n    $('relato').innerHTML = relato;\n")
    # La función que arma una franja, y el clic de «Ver pre-alerta» (va a Operaciones > Pre-Alertas)
    h = _rep(h, "  // ---- Portada ----\n  function pintarPortada(d, casos, activas) {\n",
             "  // ---- Portada ----\n"
             "  // Una franja de aviso (parche 91): ícono, título, detalle y, si hay, un botón\n"
             "  function franjaPortada(clase, icono, titulo, detalle, boton) {\n"
             "    return '<div class=\"franja ' + clase + '\">' + icono + '<div class=\"f-txt\"><span class=\"f-tit\">' + titulo + '</span><span class=\"f-det\">' + detalle + '</span></div>' + (boton || '') + '</div>';\n"
             "  }\n"
             "  function pintarPortada(d, casos, activas) {\n")
    h = _rep(h, "  $('pestanas').addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-tab]'); if (b) irPestana(b.getAttribute('data-tab')); });\n",
             "  $('pestanas').addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-tab]'); if (b) irPestana(b.getAttribute('data-tab')); });\n"
             "  $('relato').addEventListener('click', function (ev) {\n"
             "    if (!(ev.target.closest && ev.target.closest('[data-ir-pre]'))) return;\n"
             "    irPestana('op');\n"
             "    var sec = $('pronosticos') && $('pronosticos').parentNode && $('pronosticos').parentNode.parentNode;\n"
             "    if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });\n"
             "  });\n")
    return h


def alerta(h):
    h = _rep(h, '<span>Se envió tal cual</span>', '<span>Se envió</span>')
    h = _rep(h, "SIN_CAMBIOS: 'Enviado sin cambios'", "SIN_CAMBIOS: 'Enviado'")
    return _rep(h, "'confirmó que el correo se envió sin cambios'", "'confirmó que el correo se envió'", 1)


def aplicar(s):
    s = _html(s, 'HTML', tablero)
    return _html(s, 'ALERTA_HTML', alerta)
