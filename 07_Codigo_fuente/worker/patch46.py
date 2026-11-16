# Parche 46: comunicar el incidente por push a listas de difusión, con "Recibido" y respuestas (pedido de Ale, 16/11).
#
#   - Perfil nuevo "Solo comunicados" (gente que solo se tiene que enterar, por ejemplo atención al cliente): entra a /comunicados
#     y no ve nada más de Helios. Se guarda como usuarios.solo_comunicados = 1 con perfil = 'GERENTE' (la columna perfil tiene un
#     CHECK que D1 no deja cambiar sin rehacer la tabla de usuarios); al leer el usuario se lo trata como perfil COMUNICADOS.
#   - Listas de difusión (Administración > "Listas de difusión", solo Administrador): generales o de un cliente, cada persona con
#     su rol: informado (solo lee), técnico (Recibido y responde), líder (responde sumando información).
#   - Detalle de la alerta: "Comunicar incidente" (Analista; Soporte en lo suyo o de su equipo): se eligen listas (primero las del
#     cliente), el mensaje viene armado e incluye el ticket (y se puede generar en el momento). Llega como push y en la campanita.
#   - El aviso del celular trae "Recibido" (técnicos, con un toque) y "Responder"; la página /comunicado/<id> muestra el mensaje,
#     los datos, las respuestas y quién lo vio. Las respuestas y el resumen ("Recibido: 2 de 3 técnicos") vuelven a la conversación.
#   - La campanita y el push ahora también para Gerente y "Solo comunicados" (solo les llegan comunicados).
#   - Corrige el push de los avisos de una alerta: ahora sí abre el detalle de la alerta (la consulta no traía alerta_id).
#   - Script 21: columnas usuarios.solo_comunicados y alerta_parametros.listas_difusion, tablas comunicados_incidente y
#     comunicado_destinatarios (26 tablas). Sin el script todo anda igual, sin comunicados.
import json, os, re

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _get(s, nombre):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    return json.loads(s[i + len('const %s = ' % nombre):j])


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _css(h, css):
    i = h.index('</style>')
    return h[:i] + css + h[i:]


PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML']


# ---------- Comunes a todas las páginas: nombre del perfil, menú y campanita ----------
def comunes(h):
    h = h.replace("SOPORTE: 'Soporte' };", "SOPORTE: 'Soporte', COMUNICADOS: 'Solo comunicados' };")
    # Enlace "Comunicados" en el menú del usuario, antes de "Administración" (está en todas las páginas)
    m = re.search(r'\n(\s*)<a role="menuitem"[^>]*id="lnk-admin"', h)
    if m and 'id="lnk-com"' not in h:
        h = h[:m.start()] + '\n' + m.group(1) + '<a role="menuitem" href="/comunicados" id="lnk-com" hidden>Comunicados</a>' + h[m.start():]
    h = h.replace("$('lnk-admin').hidden = !puedo('admin_panel');", "$('lnk-admin').hidden = !puedo('admin_panel'); if ($('lnk-com')) $('lnk-com').hidden = !puedo('comunicados');")
    if 'function destinoDe(a) { ' in h:
        h = _rep(h, 'function destinoDe(a) { ', "function destinoDe(a) { if (/^COMUNICADO_/.test(a.tipo) && /^c\\d+$/.test(a.alerta_id || '')) return '/comunicado/' + a.alerta_id.slice(1); ")
    return h


# ---------- Página de comunicados, armada desde Mis alertas (barra, tema, campanita, push) ----------
def pagina_comunicados(mis):
    src = _leer('comunicados.html')
    css = re.search(r'<style id="com-css">\n(.*?)</style>', src, re.S).group(1)
    main = src[src.index('<!-- MAIN -->\n') + len('<!-- MAIN -->\n'):src.index('<!-- FIN MAIN -->')]
    js = re.search(r'<script id="com-js">\n(.*?)</script>', src, re.S).group(1)
    h = re.sub(r'<title>.*?</title>', '<title>Helios · Comunicados</title>', mis, count=1)
    h = _css(h, css)
    a = h.index('<main class="wrap">'); b = h.index('<div class="toast" id="toast"')
    h = h[:a] + main + '\n' + h[b:]
    marca = "var yo = null, permisos = [], datos = null, grupos = {};"
    k = h.index(marca); i = h.rindex('<script>', 0, k); j = h.index('</script>', k)
    h = h[:i] + '<script>\n' + js + h[j:]
    assert h.count('id="toast"') == 1 and 'datos = null, grupos' not in h and 'id="lnk-com"' in h
    return h


# ---------- Detalle de la alerta: "Comunicar incidente" ----------
CSS_ALERTA = """/* Comunicar incidente (parche 46) */
.hilo li.comunicado::before { background: var(--media, var(--accent)); }
.leyenda-hilo i.cmi { background: var(--media, var(--accent)); }
.listas-com { display: grid; gap: 6px; margin-top: 6px; }
.listas-com label { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--line-input, var(--line)); border-radius: 6px; padding: 8px 10px; cursor: pointer; }
.listas-com label:has(input:checked) { border-color: var(--accent); background: var(--track); }
.listas-com input { margin-top: 3px; }
.listas-com small { display: block; color: var(--ink-3); font-size: 12.5px; }
#k-mensaje { min-height: 150px; font-size: 14px; }
.com-estado { margin-top: 6px; font-size: 13px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.com-estado a { color: var(--link, var(--accent)); }
"""
DIALOGO_ALERTA = """<!-- Comunicar incidente (parche 46) -->
<dialog id="dlg-comunicar">
  <form id="f-comunicar" method="dialog">
    <h2 id="k-titulo">Comunicar incidente</h2>
    <div class="campo"><span>Listas de difusión</span><div class="listas-com" id="k-listas"></div></div>
    <p class="nota-gris" id="k-resumen"></p>
    <div class="campo" id="k-ticket-campo"><span>Ticket</span><div class="ticket-correo" id="k-ticket"></div></div>
    <label class="campo"><span>Mensaje</span><textarea id="k-mensaje" maxlength="2000"></textarea><small class="ayuda">Llega como aviso al celular o a la PC (las primeras líneas) y completo en Helios.</small></label>
    <p class="error-form" id="k-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="k-enviar">Comunicar</button></div>
  </form>
</dialog>

"""
JS_ALERTA = r"""  // ---------- Comunicar incidente (parche 46) ----------
  var ROL_PL = { TECNICO: ['técnico', 'técnicos'], LIDER: ['líder', 'líderes'], INFORMADO: ['informado', 'informados'] };
  var k_aplicado = '';
  function rolesTxt(pr) {
    return ['TECNICO', 'LIDER', 'INFORMADO'].filter(function (r) { return pr && pr[r]; }).map(function (r) { return pr[r] + ' ' + ROL_PL[r][pr[r] === 1 ? 0 : 1]; }).join(', ');
  }
  function mensajeComunicado() {
    var v = valoresCorreo();
    var t = info.resuelta
      ? 'Se resolvió el incidente: {problema} en {servicio} de {cliente}.\nEmpezó el {desde} (hora de Argentina) y duró {duracion}.\nCómo se resolvió: {resolucion}\nTicket: {ticket}'
      : 'Tenemos un incidente: {problema} en {servicio} de {cliente} desde el {desde} (hora de Argentina).\nGravedad: {gravedad}, prioridad {prioridad}.\nTicket: {ticket}\nYa lo estamos revisando. Les vamos a ir avisando.';
    return textoPlantilla(t, v);
  }
  function resumenComunicar() {
    var ids = Array.prototype.map.call(document.querySelectorAll('#k-listas input:checked'), function (x) { return Number(x.value); });
    var ls = (d.listas_difusion || []).filter(function (l) { return ids.indexOf(l.id) >= 0; }), pr = {}, n = 0;
    ls.forEach(function (l) { n += l.personas; Object.keys(l.por_rol).forEach(function (r) { pr[r] = (pr[r] || 0) + l.por_rol[r]; }); });
    $('k-resumen').textContent = ls.length ? 'Le llega a ' + (n === 1 ? '1 persona' : 'hasta ' + n + ' personas') + ' (' + rolesTxt(pr) + '). Los técnicos dan "Recibido" y responden; los líderes responden; los informados solo leen.' : 'Elegí al menos una lista.';
  }
  function pintarTicketComunicado() {
    var ts = d.tickets || [], libres = sistemasLibres(), h = '';
    if (ts.length) h += '<span class="ok">' + esc(ticketsTxt()) + '</span><small class="gris">va en el mensaje</small>';
    if (libres.length && d.puedo.ticket) {
      h += '<label><input type="checkbox" id="k-ticket-generar"> ' + (ts.length ? 'Generar otro en' : 'Generar ticket ahora en') + '</label>' +
        '<select id="k-ticket-sis">' + libres.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nombre) + (x.modo === 'real' ? '' : ' (simulado)') + '</option>'; }).join('') + '</select>';
    }
    $('k-ticket').innerHTML = h || '<small class="gris">Sin ticket.</small>';
  }
  function abrirComunicar() {
    var ls = d.listas_difusion;
    if (ls === null || ls === undefined) { toast('Para comunicar incidentes falta correr el script 21 en la consola de D1.', true); return; }
    if (!ls.length) { toast('Todavía no hay listas de difusión para esta alerta: las arma el Administrador en Administración > Listas de difusión.', true); return; }
    $('f-comunicar').reset(); errorForm('k-error');
    $('k-titulo').textContent = 'Comunicar incidente · ' + tituloCorreo();
    $('k-listas').innerHTML = ls.map(function (l) {
      return '<label><input type="checkbox" value="' + l.id + '"' + (l.cliente_id ? ' checked' : '') + '><span><b>' + esc(l.nombre) + '</b><small>' +
        esc((l.cliente_id ? 'Lista de ' + l.cliente_id : 'General') + ' · ' + rolesTxt(l.por_rol)) + '</small></span></label>';
    }).join('');
    pintarTicketComunicado();
    k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado;
    resumenComunicar();
    $('dlg-comunicar').showModal();
  }
  $('k-listas').addEventListener('change', resumenComunicar);
  $('k-ticket').addEventListener('change', function (ev) {
    if (ev.target.id !== 'k-ticket-generar' || !ev.target.checked) return;
    var c = ev.target; c.disabled = true;
    var editado = $('k-mensaje').value !== k_aplicado;
    crearTicket($('k-ticket-sis').value, resumenTicket(), descripcionTicket()).then(function (t) {
      toast('Ticket ' + t.clave + ' generado: ya está en el mensaje.');
      if (!editado) { k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado; }
      else $('k-mensaje').value += '\nTicket: ' + ticketsTxt();
      pintarTicketComunicado(); cargar();
    }).catch(function (e) { c.checked = false; c.disabled = false; errorForm('k-error', e.message); });
  });
  $('f-comunicar').addEventListener('submit', function (ev) {
    ev.preventDefault(); errorForm('k-error');
    var ids = Array.prototype.map.call(document.querySelectorAll('#k-listas input:checked'), function (x) { return Number(x.value); });
    if (!ids.length) { errorForm('k-error', 'Elegí al menos una lista.'); return; }
    var b = $('k-enviar'); b.disabled = true;
    pedir('/api/alertas/' + ID + '/comunicar', { listas: ids, mensaje: $('k-mensaje').value })
      .then(function (r) { $('dlg-comunicar').close(); toast('Incidente comunicado: le llegó a ' + (r.comunicado.personas === 1 ? '1 persona' : r.comunicado.personas + ' personas') + '.'); return cargar(); })
      .catch(function (e) { errorForm('k-error', e.message); }).then(function () { b.disabled = false; });
  });
  function liComunicado(e) {
    var c = e.comentario, id = Number((c.match(/^Comunicó el incidente \(comunicado (\d+)\)/) || [])[1]);
    var cab = c.split('\n---\n')[0].replace(/^Comunicó el incidente \(comunicado \d+\) /, ''), msg = c.indexOf('\n---\n') >= 0 ? c.slice(c.indexOf('\n---\n') + 5) : '';
    var x = (d.comunicados || []).filter(function (k) { return k.id === id; })[0], est = '';
    if (x) est = '<div class="com-estado">' + (x.tecnicos ? '<span>Recibido: ' + (x.recibidos || 0) + ' de ' + x.tecnicos + ' ' + ROL_PL.TECNICO[x.tecnicos === 1 ? 0 : 1] + '</span>·' : '') +
      '<span>Lo vieron ' + (x.vistos || 0) + ' de ' + x.personas + '</span>·<a href="/comunicado/' + id + '">Ver el comunicado</a></div>';
    return '<li class="comunicado"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> comunicó el incidente<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja"><span class="dest">' + esc(cab) + '</span>' + (msg ? '<details><summary>Ver el mensaje</summary><pre class="correo-texto">' + esc(msg) + '</pre></details>' : '') + '</div>' + est + '</li>';
  }
  function liRespuestaComunicado(e) {
    var m = e.comentario.match(/^Respondió al comunicado (\d+) como (líder|técnico): ([\s\S]*)$/);
    if (!m) return null;
    return '<li class="comunicado"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> respondió al comunicado (' + esc(m[2]) + ')<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja">' + esc(m[3]) + ' <a href="/comunicado/' + m[1] + '" style="font-size:12.5px">Ver comunicado</a></div></li>';
  }

"""


def alerta(h):
    h = _css(h, CSS_ALERTA)
    h = _rep(h, '<dialog id="dlg-devolver">', DIALOGO_ALERTA + '<dialog id="dlg-devolver">')
    h = _rep(h, "    if (p.ticket && sistemasLibres().length) acc += '<button class=\"btn\" data-acc=\"ticket\">Generar ticket</button>';",
             "    if (p.comunicar) acc += '<button class=\"btn\" data-acc=\"comunicar\">Comunicar incidente</button>';\n"
             "    if (p.ticket && sistemasLibres().length) acc += '<button class=\"btn\" data-acc=\"ticket\">Generar ticket</button>';")
    h = _rep(h, "    } else if (acc === 'ticket') abrirTicket();", "    } else if (acc === 'comunicar') abrirComunicar();\n    else if (acc === 'ticket') abrirTicket();")
    h = _rep(h, "c.indexOf('Generó el ticket ') === 0;", "c.indexOf('Generó el ticket ') === 0 || c.indexOf('Comunicó el incidente (comunicado ') === 0;")
    h = _rep(h, "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Generó el ticket ') === 0) return liTicket(e);",
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Comunicó el incidente (comunicado ') === 0) return liComunicado(e);\n"
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Respondió al comunicado ') === 0 && liRespuestaComunicado(e)) return liRespuestaComunicado(e);\n"
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Generó el ticket ') === 0) return liTicket(e);")
    h = _rep(h, '<li><i class="tic"></i>Ticket</li>', '<li><i class="tic"></i>Ticket</li><li><i class="cmi"></i>Comunicado</li>')
    h = _rep(h, "  $('acciones').addEventListener('click'", JS_ALERTA + "  $('acciones').addEventListener('click'")
    return h


# ---------- Administración: perfil nuevo y listas de difusión ----------
ADMIN_SECCION = """  <!-- LISTAS DE DIFUSIÓN (parche 46) -->
  <section id="s-listas" hidden>
    <div class="cab-seccion">
      <div><h2>Listas de difusión</h2><p class="bajada">A quién le llega "Comunicar incidente". Cada persona tiene un rol: <b>informado</b> (solo lee), <b>técnico</b> (da "Recibido" y responde) o <b>líder</b> (responde sumando información). Una lista puede servir para cualquier alerta (general) o solo para las de un cliente: esas se proponen primero. Para recibir los avisos en el celular o la PC, cada persona entra una vez a Helios y los activa desde la campanita.</p></div>
      <button class="btn primario" id="btn-nueva-lista">Nueva lista</button>
    </div>
    <p class="aviso-plant" id="listas-aviso" hidden></p>
    <div class="panel"><div class="tabla-scroll"><table class="resp" id="t-listas"></table></div></div>
  </section>

"""
ADMIN_DIALOGO = """<!-- Diálogo: lista de difusión (parche 46) -->
<dialog id="dlg-lista" class="ancho">
  <form id="f-lista" method="dialog">
    <h2 id="li-titulo">Nueva lista</h2>
    <div class="fila-campos dos">
      <label class="campo"><span>Nombre</span><input type="text" id="li-nombre" maxlength="80" autocomplete="off" placeholder="Ej.: Atención al cliente, Guardia técnica, Negocio CLI_004"></label>
      <label class="campo"><span>Para qué alertas</span><select id="li-cliente"></select></label>
    </div>
    <div class="campo"><span>Personas y su rol <small class="gris" id="li-cuenta"></small></span>
      <input type="search" id="li-buscar" placeholder="Buscar por nombre" aria-label="Buscar persona" style="margin:6px 0">
      <div class="tabla-scroll" style="max-height:340px"><table class="resp" id="li-personas"></table></div>
      <small class="ayuda">Para sumar a alguien que hoy no usa Helios (por ejemplo, atención al cliente), primero creale un usuario con el perfil "Solo comunicados" en Usuarios.</small></div>
    <label class="campo"><span>Estado</span><span class="interruptor"><input type="checkbox" id="li-activa"><i></i><span id="li-activa-txt">Activa</span></span></label>
    <p class="error-form" id="li-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="li-guardar">Guardar</button></div>
  </form>
</dialog>

"""
ADMIN_JS = r"""  // ---------- Listas de difusión (parche 46) ----------
  var LISTAS = null, liEditando = null, liRoles = {};
  var ROL_LISTA = { INFORMADO: 'Informado', TECNICO: 'Técnico', LIDER: 'Líder' };
  var ROL_PLURAL = { INFORMADO: ['informado', 'informados'], TECNICO: ['técnico', 'técnicos'], LIDER: ['líder', 'líderes'] };
  function rolesListaTxt(ms) {
    var c = {}; ms.forEach(function (m) { c[m.rol] = (c[m.rol] || 0) + 1; });
    return ['TECNICO', 'LIDER', 'INFORMADO'].filter(function (r) { return c[r]; }).map(function (r) { return c[r] + ' ' + ROL_PLURAL[r][c[r] === 1 ? 0 : 1]; }).join(', ') || 'Sin personas';
  }
  function cargarListas() { return pedir('/api/admin/listas-difusion').then(function (d) { LISTAS = d; pintarListas(); }); }
  function pintarListas() {
    $('listas-aviso').hidden = !LISTAS.falta_script;
    $('listas-aviso').textContent = LISTAS.falta_script ? 'Para armar listas de difusión falta correr 21_comunicados_d1.txt en la consola de D1.' : '';
    var ls = LISTAS.listas.slice().sort(function (a, b) { return (a.cliente_id || '').localeCompare(b.cliente_id || '') || a.nombre.localeCompare(b.nombre); });
    $('t-listas').innerHTML = ls.length ? '<thead><tr><th>Lista</th><th>Para qué alertas</th><th>Personas</th><th>Estado</th><th></th></tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr' + (l.activa ? '' : ' class="inactivo"') + '><td><b>' + esc(l.nombre) + '</b></td><td data-t="Para qué alertas">' + esc(l.cliente_id ? 'Solo ' + l.cliente_id : 'Todas (general)') + '</td>' +
          '<td data-t="Personas">' + esc(rolesListaTxt(l.miembros)) + '</td><td data-t="Estado">' + (l.activa ? 'Activa' : 'Apagada') + '</td>' +
          '<td class="acc"><button class="btn chico" data-li-editar="' + l.id + '">Editar</button><button class="btn chico" data-li-borrar="' + l.id + '">Borrar</button></td></tr>';
      }).join('') + '</tbody>' : '<tbody><tr><td class="vacio">Todavía no hay listas. Creá una con "Nueva lista".</td></tr></tbody>';
  }
  function pintarPersonasLista() {
    var q = ($('li-buscar').value || '').toLowerCase();
    var us = LISTAS.usuarios.filter(function (u) { return !q || u.nombre.toLowerCase().indexOf(q) >= 0; });
    $('li-personas').innerHTML = '<thead><tr><th>Persona</th><th>Rol en la lista</th></tr></thead><tbody>' + us.map(function (u) {
      var r = liRoles[u.id] || '';
      return '<tr><td>' + esc(u.nombre) + ' <small class="gris">' + esc(PERFIL_TXT[u.perfil] || u.perfil) + '</small></td><td data-t="Rol"><select data-li-rol="' + u.id + '" aria-label="Rol de ' + esc(u.nombre) + '">' +
        '<option value="">— No está</option>' + ['INFORMADO', 'TECNICO', 'LIDER'].map(function (k) { return '<option value="' + k + '"' + (r === k ? ' selected' : '') + '>' + ROL_LISTA[k] + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody>';
    var ms = Object.keys(liRoles).map(function (k) { return { rol: liRoles[k] }; });
    $('li-cuenta').textContent = ms.length ? '(' + rolesListaTxt(ms) + ')' : '';
  }
  function abrirLista(l) {
    liEditando = l || null; liRoles = {};
    (l ? l.miembros : []).forEach(function (m) { liRoles[m.usuario_id] = m.rol; });
    $('f-lista').reset(); $('li-error').hidden = true;
    $('li-titulo').textContent = l ? 'Editar lista' : 'Nueva lista';
    $('li-cliente').innerHTML = '<option value="">Todas las alertas (general)</option>' + LISTAS.clientes.concat(l && l.cliente_id && LISTAS.clientes.indexOf(l.cliente_id) < 0 ? [l.cliente_id] : [])
      .map(function (c) { return '<option value="' + esc(c) + '">Solo las de ' + esc(c) + '</option>'; }).join('');
    $('li-nombre').value = l ? l.nombre : ''; $('li-cliente').value = l && l.cliente_id ? l.cliente_id : '';
    $('li-activa').checked = l ? !!l.activa : true; $('li-activa-txt').textContent = $('li-activa').checked ? 'Activa' : 'Apagada';
    pintarPersonasLista();
    $('dlg-lista').showModal(); $('li-nombre').focus();
  }
  $('btn-nueva-lista').addEventListener('click', function () { if (LISTAS) abrirLista(null); });
  $('li-buscar').addEventListener('input', pintarPersonasLista);
  $('li-activa').addEventListener('change', function () { $('li-activa-txt').textContent = this.checked ? 'Activa' : 'Apagada'; });
  $('li-personas').addEventListener('change', function (ev) {
    var s = ev.target.closest('[data-li-rol]'); if (!s) return;
    if (s.value) liRoles[s.getAttribute('data-li-rol')] = s.value; else delete liRoles[s.getAttribute('data-li-rol')];
    var ms = Object.keys(liRoles).map(function (k) { return { rol: liRoles[k] }; });
    $('li-cuenta').textContent = ms.length ? '(' + rolesListaTxt(ms) + ')' : '';
  });
  $('t-listas').addEventListener('click', function (ev) {
    var e = ev.target.closest('[data-li-editar]'), b = ev.target.closest('[data-li-borrar]'); if (!e && !b) return;
    var id = Number((e || b).getAttribute(e ? 'data-li-editar' : 'data-li-borrar'));
    var l = LISTAS.listas.filter(function (x) { return x.id === id; })[0]; if (!l) return;
    if (e) { abrirLista(l); return; }
    if (!confirm('¿Borrar la lista "' + l.nombre + '"? No se puede deshacer.')) return;
    pedir('/api/admin/listas-difusion/borrar', { id: id }).then(function () { toast('Lista borrada.'); return cargarListas(); }).catch(function (x) { toast(x.message, true); });
  });
  $('f-lista').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('li-error').hidden = true;
    var datos = { id: liEditando ? liEditando.id : null, nombre: $('li-nombre').value.trim(), cliente_id: $('li-cliente').value || null, activa: $('li-activa').checked ? 1 : 0,
      miembros: Object.keys(liRoles).map(function (k) { return { usuario_id: Number(k), rol: liRoles[k] }; }) };
    var b = $('li-guardar'); b.disabled = true;
    pedir('/api/admin/listas-difusion', datos).then(function () { $('dlg-lista').close(); toast(liEditando ? 'Lista guardada.' : 'Lista creada.'); return cargarListas(); })
      .catch(function (x) { $('li-error').textContent = x.message; $('li-error').hidden = false; }).then(function () { b.disabled = false; });
  });
"""


def admin(h):
    h = _rep(h, '      <option value="SOPORTE">Soporte: trabaja solo las alertas que le asignan</option>',
             '      <option value="SOPORTE">Soporte: trabaja solo las alertas que le asignan</option>\n      <option value="COMUNICADOS">Solo comunicados: recibe los avisos de incidentes y nada más</option>')
    h = _rep(h, "    { id: 'plantillas', txt: 'Plantillas de correo', permiso: 'admin_plantillas' },",
             "    { id: 'plantillas', txt: 'Plantillas de correo', permiso: 'admin_plantillas' },\n    { id: 'listas', txt: 'Listas de difusión', permiso: 'admin_listas' },")
    h = _rep(h, "id === 'plantillas' ? cargarPlantillas() :", "id === 'plantillas' ? cargarPlantillas() : id === 'listas' ? cargarListas() :")
    h = _rep(h, '  <section id="s-modelo" hidden>', ADMIN_SECCION + '  <section id="s-modelo" hidden>')
    h = _rep(h, '<dialog id="dlg-regla">', ADMIN_DIALOGO + '<dialog id="dlg-regla">')
    h = _rep(h, '  function cargarReglas() {', ADMIN_JS + '  function cargarReglas() {')
    h = _rep(h, "GENERAR_TICKET: 'Generó un ticket', ",
             "GENERAR_TICKET: 'Generó un ticket', COMUNICAR_INCIDENTE: 'Comunicó un incidente', RESPONDER_COMUNICADO: 'Respondió un comunicado', "
             "ALTA_LISTA_DIFUSION: 'Creó una lista de difusión', EDITAR_LISTA_DIFUSION: 'Cambió una lista de difusión', BORRAR_LISTA_DIFUSION: 'Borró una lista de difusión', ")
    return h


# ---------- Service worker: botones "Recibido" y "Responder" en el aviso ----------
def service_worker(h):
    h = _rep(h, "      body: a.cuerpo || '', tag: a.tag || 'helios', data: { url: a.url || '/inicio' },",
             "      body: a.cuerpo || '', tag: a.tag || 'helios', data: { url: a.url || '/inicio', comunicado: a.comunicado || null },\n"
             "      actions: a.acciones || [], requireInteraction: !!a.comunicado,")
    h = _rep(h, "  e.notification.close();\n  var url = new URL((e.notification.data && e.notification.data.url) || '/inicio', self.location.origin).href;\n",
             "  e.notification.close();\n"
             "  var dat = e.notification.data || {};\n"
             "  // Comunicado de incidente (parche 46): \"Recibido\" se registra sin abrir Helios; \"Responder\" abre el comunicado listo para escribir\n"
             "  if (e.action === 'recibido' && dat.comunicado) {\n"
             "    e.waitUntil(fetch('/api/comunicados/' + dat.comunicado + '/recibido', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' })\n"
             "      .then(function (r) { if (!r.ok) throw new Error('no'); }).catch(function () { return self.clients.openWindow('/comunicado/' + dat.comunicado); }));\n"
             "    return;\n"
             "  }\n"
             "  var url = new URL((dat.url || '/inicio') + (e.action === 'responder' ? '?responder' : ''), self.location.origin).href;\n")
    return h


# ---------- Servidor ----------
SESION_VIEJA = """  return await env.DB.prepare(`
    SELECT u.id, u.usuario, u.nombre, u.perfil, u.debe_cambiar
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token_hash = ?1 AND s.vence > ?2 AND u.activo = 1`).bind(await sha256(token), new Date().toISOString()).first();"""
SESION_NUEVA = """  const h = await sha256(token), ahora = new Date().toISOString();
  // Perfil "Solo comunicados" (parche 46): solo_comunicados = 1 se lee como perfil COMUNICADOS
  return await conPerfil(
    () => env.DB.prepare(`SELECT u.id, u.usuario, u.nombre, CASE WHEN u.solo_comunicados = 1 THEN 'COMUNICADOS' ELSE u.perfil END AS perfil, u.debe_cambiar
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?1 AND s.vence > ?2 AND u.activo = 1`).bind(h, ahora).first(),
    () => env.DB.prepare(`SELECT u.id, u.usuario, u.nombre, u.perfil, u.debe_cambiar
      FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?1 AND s.vence > ?2 AND u.activo = 1`).bind(h, ahora).first());"""


def servidor(s):
    s = _rep(s, "const PERFILES = ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'];", "const PERFILES = ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE', 'COMUNICADOS'];")
    s = _rep(s, "const PERFILES_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte' };",
             "const PERFILES_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte', COMUNICADOS: 'Solo comunicados' };")
    s = _rep(s, "  avisos: ['ANALISTA', 'SOPORTE'],                     // campanita",
             "  avisos: ['ANALISTA', 'SOPORTE', 'GERENTE', 'COMUNICADOS'],   // campanita (al Gerente y a \"Solo comunicados\" solo les llegan comunicados)\n"
             "  comunicados: ['GERENTE', 'ANALISTA', 'SOPORTE', 'COMUNICADOS'],   // recibir comunicados de incidentes (parche 46)\n"
             "  admin_listas: ['ADMIN'],                             // listas de difusión (parche 46)")
    s = _rep(s, "const inicioDe = (u) => (u.perfil === 'ADMIN' ? '/admin' : u.perfil === 'SOPORTE' ? '/mis-alertas' : '/');",
             "const inicioDe = (u) => (u.perfil === 'ADMIN' ? '/admin' : u.perfil === 'SOPORTE' ? '/mis-alertas' : u.perfil === 'COMUNICADOS' ? '/comunicados' : '/');")
    s = _rep(s, SESION_VIEJA, SESION_NUEVA)
    # Administración de usuarios
    s = _rep(s, """    env.DB.prepare(`SELECT id, usuario, nombre, perfil, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso
                    FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`),""",
             """    env.DB.prepare(`SELECT id, usuario, nombre, ${SIN_COLUMNA_COMUNICADOS ? 'perfil' : SQL_PERFIL} AS perfil, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso
                    FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`),""")
    s = _rep(s, "async function adminListarPersonas(env) {\n  const r = await env.DB.batch([",
             "async function adminListarPersonas(env) {\n  const r = await conPerfil(() => adminListarPersonasLote(env), () => adminListarPersonasLote(env));\n"
             "  const ahora = new Date().toISOString();\n"
             "  const usuarios = r[0].results.map((u) => Object.assign(u, { bloqueado: !!(u.bloqueado_hasta && u.bloqueado_hasta > ahora) }));\n"
             "  return okJson({ usuarios, equipos: r[1].results, miembros: r[2].results });\n}\n"
             "function adminListarPersonasLote(env) {\n  return env.DB.batch([")
    s = _rep(s, """    env.DB.prepare('SELECT equipo_id, usuario_id FROM equipo_miembros'),
  ]);
  const ahora = new Date().toISOString();
  const usuarios = r[0].results.map((u) => Object.assign(u, { bloqueado: !!(u.bloqueado_hasta && u.bloqueado_hasta > ahora) }));
  return okJson({ usuarios, equipos: r[1].results, miembros: r[2].results });
}""", """    env.DB.prepare('SELECT equipo_id, usuario_id FROM equipo_miembros'),
  ]);
}""")
    s = _rep(s, """    env.DB.prepare('INSERT INTO usuarios (usuario, nombre, perfil, hash, sal, iteraciones, debe_cambiar) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)')
      .bind(usuario, nombre, perfil, n.hash, n.sal, n.iteraciones),
  ];""", """    env.DB.prepare('INSERT INTO usuarios (usuario, nombre, perfil, hash, sal, iteraciones, debe_cambiar) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)')
      .bind(usuario, nombre, perfilGuardado(perfil), n.hash, n.sal, n.iteraciones),
  ];
  if (perfil === 'COMUNICADOS') pasos.push(env.DB.prepare('UPDATE usuarios SET solo_comunicados = 1 WHERE usuario = ?1').bind(usuario));""")
    s = _rep(s, "  await env.DB.batch(pasos);\n  return okJson({ usuario, clave_temporal: clave });",
             "  try { await env.DB.batch(pasos); }\n"
             "  catch (e) { if (/no such column/i.test(e.message)) return jsonError('Para crear usuarios \"Solo comunicados\" ' + FALTA_SCRIPT_21.charAt(0).toLowerCase() + FALTA_SCRIPT_21.slice(1), 503); throw e; }\n"
             "  return okJson({ usuario, clave_temporal: clave });")
    s = _rep(s, "  const u = await env.DB.prepare('SELECT id, usuario, nombre, perfil, activo FROM usuarios WHERE id = ?1').bind(id).first();\n  if (!u) return jsonError('El usuario no existe.', 404);\n  const nombre = b.nombre === undefined",
             "  const u = await conPerfil(() => env.DB.prepare(`SELECT id, usuario, nombre, ${SQL_PERFIL} AS perfil, activo FROM usuarios WHERE id = ?1`).bind(id).first(),\n"
             "    () => env.DB.prepare('SELECT id, usuario, nombre, perfil, activo FROM usuarios WHERE id = ?1').bind(id).first());\n"
             "  if (!u) return jsonError('El usuario no existe.', 404);\n  const nombre = b.nombre === undefined")
    s = _rep(s, "  pasos.unshift(env.DB.prepare('UPDATE usuarios SET nombre = ?1, perfil = ?2, activo = ?3 WHERE id = ?4').bind(nombre, perfil, activo, id));",
             "  pasos.unshift(env.DB.prepare('UPDATE usuarios SET nombre = ?1, perfil = ?2, activo = ?3 WHERE id = ?4').bind(nombre, perfilGuardado(perfil), activo, id));\n"
             "  if (perfil !== u.perfil && (perfil === 'COMUNICADOS' || u.perfil === 'COMUNICADOS')) pasos.splice(1, 0, env.DB.prepare('UPDATE usuarios SET solo_comunicados = ?2 WHERE id = ?1').bind(id, perfil === 'COMUNICADOS' ? 1 : 0));")
    s = _rep(s, "  await env.DB.batch(pasos);\n  return okJson({});\n}\n\nasync function adminResetearClave(",
             "  try { await env.DB.batch(pasos); }\n"
             "  catch (e) { if (/no such column/i.test(e.message)) return jsonError('Para el perfil \"Solo comunicados\" ' + FALTA_SCRIPT_21.charAt(0).toLowerCase() + FALTA_SCRIPT_21.slice(1), 503); throw e; }\n"
             "  return okJson({});\n}\n\nasync function adminResetearClave(")
    # Comunicados: módulo, página y rutas
    s = _rep(s, "    ticket: rol.trabaja,   // generar ticket en InvGate o Jira (parche 41)",
             "    ticket: rol.trabaja,   // generar ticket en InvGate o Jira (parche 41)\n    comunicar: rol.trabaja,   // comunicar el incidente a listas de difusión (parche 46)")
    s = _rep(s, "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),",
             "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),\n"
             "    listas_difusion: rol.trabaja ? await listasParaAlerta(env, rol.a.cliente_id) : [], comunicados: (await comunicadosDeAlerta(env, alertaId)) || [],")
    pagina = pagina_comunicados(_get(s, 'MIS_ALERTAS_HTML'))
    s = _rep(s, "async function rutasTicketera(env, request, ruta, yo) {",
             _leer('comunicados_server.js') + 'const COMUNICADOS_HTML = ' + json.dumps(pagina, ensure_ascii=False) + ';\n\n' + "async function rutasTicketera(env, request, ruta, yo) {")
    s = _rep(s, "      const ticketeraR = await rutasTicketera(env, request, ruta, yo);\n",
             "      // Comunicados de incidente (parche 46): controla sus propios permisos\n"
             "      const comunicadosR = await rutasComunicados(env, request, ruta, yo);\n"
             "      if (comunicadosR) return comunicadosR;\n"
             "      const ticketeraR = await rutasTicketera(env, request, ruta, yo);\n")
    # Push: comunicados con sus botones; los avisos de una alerta abren su detalle (faltaba alerta_id en la consulta)
    s = _rep(s, "SELECT a.id, a.tipo, a.texto, a.detalle, u.perfil,\n", "SELECT a.id, a.tipo, a.alerta_id, a.texto, a.detalle, u.perfil,\n")
    s = _rep(s, "function avisoPush(a) {\n",
             "function avisoPush(a) {\n"
             "  if (/^COMUNICADO_/.test(a.tipo) && /^c\\d+$/.test(a.alerta_id || '')) {\n"
             "    const id = Number(a.alerta_id.slice(1)), rol = a.tipo.slice(11);\n"
             "    return { titulo: 'Helios · ' + a.texto, cuerpo: String(a.detalle || '').slice(0, 450), url: '/comunicado/' + id, tag: 'helios-comunicado-' + id, comunicado: id,\n"
             "      acciones: rol === 'TECNICO' ? [{ action: 'recibido', title: 'Recibido' }, { action: 'responder', title: 'Responder' }] : rol === 'LIDER' ? [{ action: 'responder', title: 'Responder' }] : [] };\n"
             "  }\n")
    s = _rep(s, "  await env.DB.prepare('DELETE FROM tickets_alerta').run().catch(() => {});\n",
             "  await env.DB.prepare('DELETE FROM tickets_alerta').run().catch(() => {});\n"
             "  await env.DB.batch([env.DB.prepare('DELETE FROM comunicado_destinatarios'), env.DB.prepare('DELETE FROM comunicados_incidente')]).catch(() => {});\n")
    s = s.replace("const ASIST_PERFIL_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte' };",
                  "const ASIST_PERFIL_TXT = { ADMIN: 'Administrador', GERENTE: 'Gerente', ANALISTA: 'Analista', SOPORTE: 'Soporte', COMUNICADOS: 'Solo comunicados' };")
    return s


def aplicar(s):
    for n in PAGINAS:
        s = _html(s, n, comunes)
    s = _html(s, 'ALERTA_HTML', alerta)
    s = _html(s, 'ADMIN_HTML', admin)
    s = _html(s, 'SW_JS', service_worker)
    s = servidor(s)   # al final: la página de comunicados sale de Mis alertas ya con el menú y la campanita nuevos
    return s
