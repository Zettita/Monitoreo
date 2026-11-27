# Parche 92 (27/11): en «Comunicar incidente», el ticket se genera al confirmar (sin SQL). Solo la página del detalle de la alerta.
#   Uriel vio que al marcar la casilla «Generar ticket ahora en [InvGate / Jira]» el ticket se creaba en el momento, antes de tocar «Comunicar».
#   Ahora marcar la casilla solo deja la intención: al tocar «Comunicar» se crea el ticket en la herramienta elegida y, con su número ya en el mensaje,
#   se manda el comunicado. Si no se puede crear el ticket, no se manda nada y se explica por qué; si el ticket se crea pero el comunicado falla,
#   el ticket queda (y aparece como «va en el mensaje»), así que reintentar no lo duplica.
#   La casilla del correo («Template correo») sigue como estaba.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch92: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre)
    j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def alerta(h):
    # La casilla dice que el ticket sale al comunicar
    h = _rep(h, "h += '<label><input type=\"checkbox\" id=\"k-ticket-generar\"> ' + (ts.length ? 'Generar otro en' : 'Generar ticket ahora en') + '</label>' +",
             "h += '<label><input type=\"checkbox\" id=\"k-ticket-generar\"> ' + (ts.length ? 'Generar otro al comunicar en' : 'Generar ticket al comunicar en') + '</label>' +")
    # Marcar la casilla ya no crea nada
    viejo = (
        "  $('k-ticket').addEventListener('change', function (ev) {\n"
        "    if (ev.target.id !== 'k-ticket-generar' || !ev.target.checked) return;\n"
        "    var c = ev.target; c.disabled = true;\n"
        "    var editado = $('k-mensaje').value !== k_aplicado;\n"
        "    crearTicket($('k-ticket-sis').value, resumenTicket(), descripcionTicket()).then(function (t) {\n"
        "      toast('Ticket ' + t.clave + ' generado: ya está en el mensaje.');\n"
        "      if (!editado) { k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado; }\n"
        "      else $('k-mensaje').value += '\\nTicket: ' + ticketsTxt();\n"
        "      pintarTicketComunicado(); cargar();\n"
        "    }).catch(function (e) { c.checked = false; c.disabled = false; errorForm('k-error', e.message); });\n"
        "  });\n")
    h = _rep(h, viejo, "  // El ticket de «Comunicar incidente» se genera recién al confirmar (parche 92): marcar la casilla no crea nada\n")
    # Al confirmar: primero el ticket (si se pidió), con su número en el mensaje, y después el comunicado
    viejo = (
        "    var b = $('k-enviar'); b.disabled = true;\n"
        "    pedir('/api/alertas/' + ID + '/comunicar', { listas: ids, personas: pids, mensaje: $('k-mensaje').value })\n"
        "      .then(function (r) { $('dlg-comunicar').close(); toast('Incidente comunicado: le llegó a ' + (r.comunicado.personas === 1 ? '1 persona' : r.comunicado.personas + ' personas') + '.'); return cargar(); })\n"
        "      .catch(function (e) { errorForm('k-error', e.message); }).then(function () { b.disabled = false; });\n")
    nuevo = (
        "    var b = $('k-enviar'); b.disabled = true;\n"
        "    // Si la casilla está marcada, el ticket se crea ahora, en la herramienta elegida, y su número viaja en el mensaje (parche 92)\n"
        "    var chk = $('k-ticket-generar'), sisTicket = chk && chk.checked ? $('k-ticket-sis').value : '', nuevo = null;\n"
        "    (sisTicket ? crearTicket(sisTicket, resumenTicket(), descripcionTicket()) : Promise.resolve(null)).then(function (t) {\n"
        "      nuevo = t;\n"
        "      var msg = $('k-mensaje').value;\n"
        "      if (t) {\n"
        "        if (msg === k_aplicado) { k_aplicado = mensajeComunicado(); msg = k_aplicado; }\n"
        "        else msg += '\\nTicket: ' + t.clave + ' (' + (SIS_TXT[t.sistema] || t.sistema) + ')';\n"
        "        $('k-mensaje').value = msg; pintarTicketComunicado();   // si el envío falla, el ticket ya existe y no se vuelve a crear\n"
        "      }\n"
        "      return pedir('/api/alertas/' + ID + '/comunicar', { listas: ids, personas: pids, mensaje: msg });\n"
        "    }).then(function (r) {\n"
        "      $('dlg-comunicar').close();\n"
        "      toast('Incidente comunicado: le llegó a ' + (r.comunicado.personas === 1 ? '1 persona' : r.comunicado.personas + ' personas') + '.' + (nuevo ? ' Ticket ' + nuevo.clave + ' generado en ' + (SIS_TXT[nuevo.sistema] || nuevo.sistema) + '.' : ''));\n"
        "      return cargar();\n"
        "    }).catch(function (e) { errorForm('k-error', nuevo ? 'Se generó el ticket ' + nuevo.clave + ', pero el comunicado no se envió: ' + e.message : e.message); })\n"
        "      .then(function () { b.disabled = false; });\n")
    return _rep(h, viejo, nuevo)


def aplicar(s):
    return _html(s, 'ALERTA_HTML', alerta)
