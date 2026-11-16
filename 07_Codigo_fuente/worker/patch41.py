# Parche 41: tickets a demanda en InvGate o Jira desde la alerta (pedido de Ale, 16/11).
#
#   - Detalle de la alerta: botón "Generar ticket" (Analista; Soporte en lo suyo o de su equipo): se elige InvGate o Jira,
#     resumen y descripción armados con los datos de la alerta (editables). Uno por herramienta y por problema.
#   - "Template correo alerta": casilla "Generar ticket ahora en [InvGate / Jira]" (lo genera en el momento) y, si la alerta
#     ya tiene ticket, el número se suma solo al asunto ([INV-1001] …) y al texto (variable {ticket} o una línea "Ticket: …").
#   - El ticket se ve en "Datos de la alerta" (con enlace si la herramienta lo devuelve) y en la conversación.
#   - Integración: tickets_integracion.js (crearTicketInvgate / crearTicketJira, rutasTicketsIntegracion para webhooks y
#     novedadTicket para cambios de estado), a completar por el equipo de integración. Modo por herramienta con las variables
#     TICKETS_INVGATE / TICKETS_JIRA = 'real'; si no, simulado (INV-1001, HEL-101, marcado "simulado").
#   - Tabla tickets_alerta (script 19). "Preparar demo" borra también los tickets (solo en Helios).
import json, os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


CSS = """/* Tickets (parche 41) */
.hilo li.ticket::before { background: var(--ink-3); }
.tag-sim { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; font-size: 11.5px; background: var(--track); color: var(--ink-3); font-weight: 600; vertical-align: 1px; }
.det-datos dd a { color: var(--link, var(--accent)); }
.ticket-correo { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; font-size: 14px; }
.ticket-correo select { width: auto; flex: 0 1 auto; border: 1px solid var(--line-input, var(--line)); background: var(--input-bg, var(--panel)); color: var(--ink); border-radius: 4px; padding: 5px 8px; font-size: 14px; }
.ticket-correo .ok { background: var(--ok-bg); color: var(--ok-txt); padding: 2px 9px; border-radius: 999px; font-weight: 600; font-size: 13px; }
#t-descripcion { min-height: 200px; font-size: 13.5px; }
/* El botón "Template correo alerta «…»" es largo: en el celular baja de renglón (corrige el parche 40) */
.det-acc .btn[data-acc="correo"] { white-space: normal; max-width: 100%; text-align: left; height: auto; line-height: 1.3; }
"""

DIALOGO = """<!-- Generar ticket (parche 41) -->
<dialog id="dlg-ticket">
  <form id="f-ticket" method="dialog">
    <h2 id="t-titulo">Generar ticket</h2>
    <div class="campo"><span>Herramienta</span><div class="opciones" id="t-sistemas"></div></div>
    <p class="nota-gris" id="t-nota"></p>
    <label class="campo"><span>Resumen</span><input id="t-resumen" type="text" maxlength="250" autocomplete="off"></label>
    <label class="campo"><span>Descripción</span><textarea id="t-descripcion" maxlength="8000"></textarea></label>
    <p class="error-form" id="t-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="t-guardar">Generar ticket</button></div>
  </form>
</dialog>

"""

CAMPO_CORREO = '    <div class="campo" id="m-ticket-campo"><span>Ticket</span><div class="ticket-correo" id="m-ticket"></div></div>\n'

JS = r"""  // ---------- Tickets (parche 41) ----------
  var SIS_TXT = {};
  function sistemasLibres() { var ya = (d.tickets || []).map(function (t) { return t.sistema; }); return (d.tickets_sistemas || []).filter(function (x) { return ya.indexOf(x.id) < 0; }); }
  function ticketsTxt() { return (d.tickets || []).map(function (t) { return t.clave + ' (' + (SIS_TXT[t.sistema] || t.sistema) + ')'; }).join(', '); }
  // Suma el ticket al asunto y al texto si la plantilla no lo trae
  function incluirTicket(m) {
    var ts = d.tickets || []; if (!ts.length) return m;
    var falta = ts.filter(function (t) { return m.asunto.indexOf(t.clave) < 0; }).map(function (t) { return t.clave; });
    if (falta.length) m.asunto = '[' + falta.join(', ') + '] ' + m.asunto;
    if (ts.some(function (t) { return m.texto.indexOf(t.clave) < 0; })) {
      var l = m.texto.split('\n'), linea = 'Ticket: ' + ticketsTxt();
      m.texto = m.texto ? l[0] + '\n\n' + linea + (l.length > 1 ? '\n' + l.slice(1).join('\n') : '') : linea;
    }
    return m;
  }
  function descripcionTicket() {
    var v = valoresCorreo();
    return ['Qué pasa: ' + v.problema, 'Cliente: ' + v.cliente, 'Servicio: ' + v.servicio + ' (ambiente ' + v.ambiente + ')',
      'Desde: ' + v.desde + ' (hora de Argentina) · ' + (info.resuelta ? 'duró ' : 'lleva ') + v.duracion,
      'Gravedad: ' + v.gravedad + ', prioridad ' + v.prioridad, 'Última medición: ' + v.medicion, 'Estado: ' + v.estado,
      v.resolucion ? 'Cómo se resolvió: ' + v.resolucion : '', v.ultima_novedad ? 'Última novedad: ' + v.ultima_novedad : '',
      '', 'Alerta en Helios: ' + v.enlace].filter(function (x, i, a) { return x !== '' || (i > 0 && a[i - 1] !== ''); }).join('\n');
  }
  function resumenTicket() { var v = valoresCorreo(); return '[' + v.prioridad + ' · ' + v.gravedad + '] ' + v.cliente + ' · ' + v.servicio + ': ' + v.problema; }
  function notaSistema(id) {
    var x = (d.tickets_sistemas || []).filter(function (s) { return s.id === id; })[0];
    return x && x.modo !== 'real' ? 'Modo simulado: hasta que esté la integración con ' + x.nombre + ', Helios inventa el número del ticket (queda marcado como simulado).' : '';
  }
  function crearTicket(sistema, resumen, descripcion) {
    return pedir('/api/alertas/' + ID + '/ticket', { sistema: sistema, resumen: resumen, descripcion: descripcion, prioridad: 'P' + info.prio })
      .then(function (r) { d.tickets = (d.tickets || []).concat([r.ticket]); return r.ticket; });
  }
  function abrirTicket() {
    var libres = sistemasLibres();
    if (!libres.length) { toast('Esta alerta ya tiene ticket en todas las herramientas.', true); return; }
    $('f-ticket').reset(); errorForm('t-error');
    $('t-titulo').textContent = 'Generar ticket · ' + tituloCorreo();
    $('t-sistemas').innerHTML = libres.map(function (x, i) {
      return '<label class="opcion"><input type="radio" name="t-sis" value="' + x.id + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(x.nombre) + '</span></label>';
    }).join('');
    $('t-nota').textContent = notaSistema(libres[0].id);
    $('t-resumen').value = resumenTicket(); $('t-descripcion').value = descripcionTicket();
    $('dlg-ticket').showModal();
  }
  $('t-sistemas').addEventListener('change', function (ev) { $('t-nota').textContent = notaSistema(ev.target.value); });
  $('f-ticket').addEventListener('submit', function (ev) {
    ev.preventDefault(); errorForm('t-error');
    var sis = (document.querySelector('input[name="t-sis"]:checked') || {}).value;
    if (!sis) { errorForm('t-error', 'Elegí la herramienta.'); return; }
    var b = $('t-guardar'); b.disabled = true;
    crearTicket(sis, $('t-resumen').value.trim(), $('t-descripcion').value)
      .then(function (t) { $('dlg-ticket').close(); toast('Ticket ' + t.clave + ' generado en ' + (SIS_TXT[t.sistema] || t.sistema) + '.'); return cargar(); })
      .catch(function (e) { errorForm('t-error', e.message); }).then(function () { b.disabled = false; });
  });
  // En el correo: el ticket que ya tiene, o la casilla para generarlo en el momento
  function pintarTicketCorreo() {
    var ts = d.tickets || [], libres = sistemasLibres(), h = '';
    if (ts.length) h += '<span class="ok">' + esc(ticketsTxt()) + '</span><small class="gris">va en el asunto y en el texto</small>';
    if (libres.length && d.puedo.ticket) {
      h += '<label class="interruptor-chico"><input type="checkbox" id="m-ticket-generar"> ' + (ts.length ? 'Generar otro en' : 'Generar ticket ahora en') + '</label>' +
        '<select id="m-ticket-sis">' + libres.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nombre) + (x.modo === 'real' ? '' : ' (simulado)') + '</option>'; }).join('') + '</select>';
    }
    $('m-ticket').innerHTML = h || '<small class="gris">Sin ticket.</small>';
  }
  $('m-ticket').addEventListener('change', function (ev) {
    if (ev.target.id !== 'm-ticket-generar' || !ev.target.checked) return;
    var c = ev.target; c.disabled = true;
    var editado = aplicada && ($('m-asunto').value !== aplicada.asunto || $('m-texto').value !== aplicada.texto);
    crearTicket($('m-ticket-sis').value, resumenTicket(), descripcionTicket()).then(function (t) {
      toast('Ticket ' + t.clave + ' generado: ya está en el correo.');
      if (!editado) aplicarPlantilla(plantillasVis[Number($('m-plantilla').value)] || null);
      else { var m = incluirTicket({ asunto: $('m-asunto').value, texto: $('m-texto').value }); $('m-asunto').value = m.asunto; $('m-texto').value = m.texto; }
      pintarTicketCorreo(); cargar();
    }).catch(function (e) { c.checked = false; c.disabled = false; errorForm('m-error', e.message); });
  });
  function liTicket(e) {
    var clave = e.comentario.slice('Generó el ticket '.length).split(' en ')[0];
    var t = (d.tickets || []).filter(function (x) { return x.clave === clave; })[0];
    var link = t && t.url ? '<a href="' + esc(t.url) + '" target="_blank" rel="noopener">' + esc(clave) + '</a>' : '<b>' + esc(clave) + '</b>';
    return '<li class="ticket"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> generó un ticket<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja">' + link + ' en ' + esc(e.comentario.slice(e.comentario.indexOf(' en ') + 4).replace(' (simulado)', '')) + (/\(simulado\)$/.test(e.comentario) ? '<span class="tag-sim">simulado</span>' : '') +
      (t && t.estado ? ' · ' + esc(t.estado) : '') + '</div></li>';
  }
  function liNovedadTicket(e) {
    return '<li class="ticket"><div class="quien"><b>Ticket</b> novedad desde la herramienta<time>' + esc(diaHora(e.fecha)) + '</time></div><div class="burbuja">' + esc(e.comentario) + '</div></li>';
  }

"""


def detalle(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    h = _rep(h, '<dialog id="dlg-devolver">', DIALOGO + '<dialog id="dlg-devolver">')
    h = _rep(h, '    <label class="campo"><span>Plantilla</span><select id="m-plantilla"></select></label>\n',
             '    <label class="campo"><span>Plantilla</span><select id="m-plantilla"></select></label>\n' + CAMPO_CORREO)
    h = _rep(h, "    if (p.correo) acc += '<button class=\"btn\" data-acc=\"correo\">Template correo alerta «'",
             "    if (p.ticket && sistemasLibres().length) acc += '<button class=\"btn\" data-acc=\"ticket\">Generar ticket</button>';\n"
             "    if (p.correo) acc += '<button class=\"btn\" data-acc=\"correo\">Template correo alerta «'")
    h = _rep(h, "    } else if (acc === 'correo') abrirCorreo();", "    } else if (acc === 'ticket') abrirTicket();\n    else if (acc === 'correo') abrirCorreo();")
    # Datos de la alerta: los tickets (con enlace si hay)
    h = _rep(h, "    $('datos').innerHTML = filas.map(function (f) { return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('');",
             "    $('datos').innerHTML = filas.map(function (f) { return '<dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd>'; }).join('') +\n"
             "      (d.tickets || []).map(function (t) {\n"
             "        return '<dt>Ticket</dt><dd>' + (t.url ? '<a href=\"' + esc(t.url) + '\" target=\"_blank\" rel=\"noopener\">' + esc(t.clave) + '</a>' : esc(t.clave)) + ' · ' + esc(SIS_TXT[t.sistema] || t.sistema) +\n"
             "          (t.estado ? ' · ' + esc(t.estado) : '') + (t.simulado ? '<span class=\"tag-sim\">simulado</span>' : '') + '</dd>';\n"
             "      }).join('');")
    # Variables del correo: {ticket}; el número va siempre en el asunto y el texto
    h = _rep(h, "      enlace: location.origin + '/alerta/' + ID, firma: yo.nombre\n    };",
             "      enlace: location.origin + '/alerta/' + ID, firma: yo.nombre, ticket: ticketsTxt()\n    };")
    h = _rep(h, "    aplicada = p ? { asunto: asuntoPlantilla(p.asunto, v), texto: textoPlantilla(p.cuerpo, v), nombre: p.nombre } : { asunto: tituloCorreo(), texto: '', nombre: '' };",
             "    aplicada = p ? { asunto: asuntoPlantilla(p.asunto, v), texto: textoPlantilla(p.cuerpo, v), nombre: p.nombre } : { asunto: tituloCorreo(), texto: '', nombre: '' };\n"
             "    incluirTicket(aplicada);")
    h = _rep(h, "    $('m-titulo').textContent = 'Template correo alerta «' + tituloCorreo() + '»';",
             "    $('m-titulo').textContent = 'Template correo alerta «' + tituloCorreo() + '»';\n    pintarTicketCorreo();")
    h = _rep(h, "c.indexOf(ENV_NO) === 0;", "c.indexOf(ENV_NO) === 0 || c.indexOf('Generó el ticket ') === 0;")
    # Conversación
    h = _rep(h, "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf(COR_MARCA) === 0) return liCorreo(e, parCorreos[e.id]);",
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Generó el ticket ') === 0) return liTicket(e);\n"
             "      if (e.accion === 'COMENTAR' && !e.usuario_id && e.comentario && e.comentario.indexOf('Novedad del ticket ') === 0) return liNovedadTicket(e);\n"
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf(COR_MARCA) === 0) return liCorreo(e, parCorreos[e.id]);")
    h = _rep(h, '<li><i class="cor"></i>Correo</li>', '<li><i class="cor"></i>Correo</li><li><i class="tic"></i>Ticket</li>')
    h = _rep(h, "  $('acciones').addEventListener('click'", JS + "  $('acciones').addEventListener('click'")
    # Nombres de las herramientas, al cargar el detalle
    h = _rep(h, "    info = resumir();", "    (d.tickets_sistemas || []).forEach(function (x) { SIS_TXT[x.id] = x.nombre; });\n    info = resumir();")
    h = h.replace('.leyenda-hilo i.cor {', '.leyenda-hilo i.tic { background: var(--ink-3); }\n.leyenda-hilo i.cor {', 1)
    return h


def admin(h):
    h = _rep(h, "['enlace', 'Enlace a la alerta'], ['firma', 'Nombre de quien envía']];",
             "['ticket', 'Ticket (número y herramienta)'], ['enlace', 'Enlace a la alerta'], ['firma', 'Nombre de quien envía']];")
    h = _rep(h, "enlace: location.origin + '/alerta/…', firma:", "ticket: 'INV-1001 (InvGate)', enlace: location.origin + '/alerta/…', firma:")
    h = _rep(h, "PREPARAR_CORREO: 'Preparó un correo', ", "PREPARAR_CORREO: 'Preparó un correo', GENERAR_TICKET: 'Generó un ticket', ")
    return h


def servidor(s):
    s = _rep(s, "    correo: rol.trabaja,", "    correo: rol.trabaja,\n    ticket: rol.trabaja,   // generar ticket en InvGate o Jira (parche 41)")
    s = _rep(s, "plantillas_correo: rol.trabaja ? await plantillasActivas(env) : [],",
             "plantillas_correo: rol.trabaja ? await plantillasActivas(env) : [], tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),")
    s = _rep(s, "async function rutasTicketera(env, request, ruta, yo) {",
             _leer('tickets_integracion.js') + _leer('tickets_server.js') + "async function rutasTicketera(env, request, ruta, yo) {")
    s = _rep(s, "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo(\\/envio)?$/);",
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/ticket$/);\n"
             "  if (x) return m === 'POST' ? await generarTicket(env, request, yo, x[1]) : null;\n"
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo(\\/envio)?$/);")
    # Rutas de la integración (webhooks): sin sesión de Helios; las protege la integración
    s = _rep(s, "  if (publico) return publico;\n",
             "  if (publico) return publico;\n"
             "  if (ruta.startsWith('/api/integraciones/')) { const integ = await rutasTicketsIntegracion(env, request, ruta); if (integ) return integ; }\n")
    # Preparar demo: también los tickets (solo en Helios; si falta el script 19, no pasa nada)
    s = _rep(s, "    env.DB.prepare(MARCAR_TABLERO),\n  ]);\n  return { ...(await demoEstado(env)), alertas_borradas",
             "    env.DB.prepare(MARCAR_TABLERO),\n  ]);\n"
             "  await env.DB.prepare('DELETE FROM tickets_alerta').run().catch(() => {});\n"
             "  return { ...(await demoEstado(env)), alertas_borradas")
    # Plantillas de fábrica: línea del ticket (si no hay, no se escribe)
    s = _rep(s, "- Cómo se resolvió: {resolucion}\\n- Última novedad: {ultima_novedad}\\n", "- Cómo se resolvió: {resolucion}\\n- Última novedad: {ultima_novedad}\\n- Ticket: {ticket}\\n")
    s = _rep(s, "- Gravedad: {gravedad}, prioridad {prioridad}\\n\\n[Completar: códigos de error", "- Gravedad: {gravedad}, prioridad {prioridad}\\n- Ticket: {ticket}\\n\\n[Completar: códigos de error")
    s = _rep(s, "- Última novedad: {ultima_novedad}\\n\\n[Completar: qué se probó", "- Última novedad: {ultima_novedad}\\n- Ticket: {ticket}\\n\\n[Completar: qué se probó")
    return s


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ALERTA_HTML', detalle)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
