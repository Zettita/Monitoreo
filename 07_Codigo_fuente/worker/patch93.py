# Parche 93 (27/11): en «Template correo», el ticket se genera al abrir el correo en Outlook (sin SQL). Solo la página del detalle de la alerta.
#   Igual que el parche 92 para «Comunicar incidente»: al marcar la casilla «Generar ticket ahora en [InvGate / Jira]» el ticket se creaba al instante.
#   Ahora marcarla solo deja la intención: al tocar «Abrir en Outlook web» u «Outlook de escritorio» se crea el ticket en la herramienta elegida, su número
#   entra en el asunto y en el texto y recién ahí se abre el correo y queda registrado en la alerta. «Copiar texto» no genera nada: copia lo que está en pantalla.
#   Si el ticket no se puede crear, el correo no se abre y se explica por qué en el mismo diálogo.
#   Outlook web se abre en una pestaña que se reserva en el mismo clic (para que el navegador no la bloquee mientras se crea el ticket) y se completa después.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch93: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def alerta(h):
    # La casilla dice cuándo se genera
    h = _rep(h, "h += '<label class=\"interruptor-chico\"><input type=\"checkbox\" id=\"m-ticket-generar\"> ' + (ts.length ? 'Generar otro en' : 'Generar ticket ahora en') + '</label>' +",
             "h += '<label class=\"interruptor-chico\"><input type=\"checkbox\" id=\"m-ticket-generar\"> ' + (ts.length ? 'Generar otro al abrir el correo en' : 'Generar ticket al abrir el correo en') + '</label>' +")
    # Marcar la casilla ya no crea nada
    viejo = (
        "  $('m-ticket').addEventListener('change', function (ev) {\n"
        "    if (ev.target.id !== 'm-ticket-generar' || !ev.target.checked) return;\n"
        "    var c = ev.target; c.disabled = true;\n"
        "    var editado = aplicada && ($('m-asunto').value !== aplicada.asunto || $('m-texto').value !== aplicada.texto);\n"
        "    crearTicket($('m-ticket-sis').value, resumenTicket(), descripcionTicket()).then(function (t) {\n"
        "      toast('Ticket ' + t.clave + ' generado: ya está en el correo.');\n"
        "      if (!editado) aplicarPlantilla(plantillasVis[Number($('m-plantilla').value)] || null);\n"
        "      else { var m = incluirTicket({ asunto: $('m-asunto').value, texto: $('m-texto').value }); $('m-asunto').value = m.asunto; $('m-texto').value = m.texto; }\n"
        "      pintarTicketCorreo(); cargar();\n"
        "    }).catch(function (e) { c.checked = false; c.disabled = false; errorForm('m-error', e.message); });\n"
        "  });\n")
    h = _rep(h, viejo, "  // El ticket del correo se genera recién al abrirlo en Outlook (parche 93): marcar la casilla no crea nada\n")
    # El aviso final suma el ticket que se generó
    h = _rep(h, "  var MAX_WEB = 7000, MAX_ESCRITORIO = 1800;\n", "  var MAX_WEB = 7000, MAX_ESCRITORIO = 1800, notaTicket = '';\n")
    h = _rep(h, "      toast(corto ? (copiado ? 'El texto es largo para el enlace: se abrió el correo sin el texto y el texto quedó copiado. Pegalo con Ctrl+V.' : 'El texto es largo para el enlace: se abrió el correo sin el texto. Copialo con \"Copiar texto\".')\n"
                "        : 'Se abrió el correo en Outlook. Cuando lo envíes, confirmalo en la conversación.');\n",
             "      toast((notaTicket ? notaTicket + ' ' : '') + (corto ? (copiado ? 'El texto es largo para el enlace: se abrió el correo sin el texto y el texto quedó copiado. Pegalo con Ctrl+V.' : 'El texto es largo para el enlace: se abrió el correo sin el texto. Copialo con \"Copiar texto\".')\n"
             "        : 'Se abrió el correo en Outlook. Cuando lo envíes, confirmalo en la conversación.'));\n"
             "      notaTicket = '';\n")
    # Al abrir el correo: primero el ticket (si se pidió), con su número en el asunto y el texto
    viejo = (
        "  $('m-web').addEventListener('click', function () {\n"
        "    var m = leerCorreo(); if (!m) return;\n"
        "    abrirEn(m, urlWeb, MAX_WEB, function (u) { window.open(u, '_blank', 'noopener'); });\n"
        "  });\n"
        "  $('m-escritorio').addEventListener('click', function () {\n"
        "    var m = leerCorreo(); if (!m) return;\n"
        "    abrirEn(m, urlEscritorio, MAX_ESCRITORIO, function (u) { var x = document.createElement('a'); x.href = u; document.body.appendChild(x); x.click(); x.remove(); });\n"
        "  });\n")
    nuevo = (
        "  // Si la casilla está marcada, el ticket se crea ahora, en la herramienta elegida, y su número va en el asunto y en el texto (parche 93).\n"
        "  // Si no se puede crear, el correo no se abre. «ventana» es la pestaña de Outlook web reservada en el mismo clic (el navegador no la bloquea).\n"
        "  function conTicketNuevo(m, reservar, seguir) {\n"
        "    var chk = $('m-ticket-generar'), sis = chk && chk.checked ? $('m-ticket-sis').value : '';\n"
        "    if (!sis) { seguir(m, null); return; }\n"
        "    var ventana = null;\n"
        "    if (reservar) { try { ventana = window.open('', '_blank'); if (ventana) ventana.opener = null; } catch (e) { ventana = null; } }\n"
        "    var bw = $('m-web'), be = $('m-escritorio'); bw.disabled = true; be.disabled = true; errorForm('m-error');\n"
        "    var editado = aplicada && ($('m-asunto').value !== aplicada.asunto || $('m-texto').value !== aplicada.texto);\n"
        "    crearTicket(sis, resumenTicket(), descripcionTicket()).then(function (t) {\n"
        "      if (!editado) aplicarPlantilla(plantillasVis[Number($('m-plantilla').value)] || null);\n"
        "      else { var x = incluirTicket({ asunto: $('m-asunto').value, texto: $('m-texto').value }); $('m-asunto').value = x.asunto; $('m-texto').value = x.texto; }\n"
        "      notaTicket = 'Ticket ' + t.clave + ' generado en ' + (SIS_TXT[t.sistema] || t.sistema) + '.';\n"
        "      pintarTicketCorreo();\n"
        "      var m2 = leerCorreo();\n"
        "      if (!m2) { if (ventana) ventana.close(); return; }\n"
        "      seguir(m2, ventana);\n"
        "    }).catch(function (e) { if (ventana) ventana.close(); errorForm('m-error', e.message); })\n"
        "      .then(function () { bw.disabled = false; be.disabled = false; });\n"
        "  }\n"
        "  $('m-web').addEventListener('click', function () {\n"
        "    var m = leerCorreo(); if (!m) return;\n"
        "    conTicketNuevo(m, true, function (m2, ventana) {\n"
        "      abrirEn(m2, urlWeb, MAX_WEB, function (u) { if (ventana) ventana.location.href = u; else window.open(u, '_blank', 'noopener'); });\n"
        "    });\n"
        "  });\n"
        "  $('m-escritorio').addEventListener('click', function () {\n"
        "    var m = leerCorreo(); if (!m) return;\n"
        "    conTicketNuevo(m, false, function (m2) {\n"
        "      abrirEn(m2, urlEscritorio, MAX_ESCRITORIO, function (u) { var x = document.createElement('a'); x.href = u; document.body.appendChild(x); x.click(); x.remove(); });\n"
        "    });\n"
        "  });\n")
    return _rep(h, viejo, nuevo)


def aplicar(s):
    return _html(s, 'ALERTA_HTML', alerta)
