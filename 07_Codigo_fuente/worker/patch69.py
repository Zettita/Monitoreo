# Parche 69 (20/11): sala de crisis, etapa 1 del AICIM (plan: 05_Documentacion/plan_sala_crisis_etapa1.md; script 24).
#   Incidentes mayores que agrupan alertas, con tareas, línea de tiempo y guía de diagnóstico (componentes, dependencias y
#   antecedentes). El Analista abre y dirige; Soporte actualiza sus tareas; Gerente y Administrador leen.
#   Servidor: sala_crisis_server.js (rutas /api/incidentes...). Página: sala_crisis.html (/incidentes y /incidente/<id>).
#   El asistente suma herramientas de solo lectura de la sala y propone asignar tarea, comunicar o escalar (no ejecuta).
#   Teams queda para la etapa 2.
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    c = s.count(a)
    if c != n:
        raise SystemExit('patch69: se esperaban %d y hay %d de: %r' % (n, c, a[:100]))
    return s.replace(a, b)


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML', 'COMUNICADOS_HTML']


def _get(s, nombre):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    return json.loads(s[i + len('const %s = ' % nombre):j])


# ---------- Menú del usuario: "Sala de crisis" en todas las páginas (antes de "Comunicados") ----------
def menu_sala(h):
    m = re.search(r'\n(\s*)<a role="menuitem" href="/comunicados" id="lnk-com"', h)
    if m and 'id="lnk-sala"' not in h:
        h = h[:m.start()] + '\n' + m.group(1) + '<a role="menuitem" href="/incidentes" id="lnk-sala" hidden>Sala de crisis</a>' + h[m.start():]
    # Administración tiene un menú más corto (sin "Comunicados" ni "Administración"): va después de "Seguimiento"
    m = re.search(r'\n(\s*)<a role="menuitem" href="/seguimiento" id="lnk-seg" hidden>Seguimiento</a>', h)
    if m and 'id="lnk-sala"' not in h:
        h = h[:m.end()] + '\n' + m.group(1) + '<a role="menuitem" href="/incidentes" id="lnk-sala" hidden>Sala de crisis</a>' + h[m.end():]
    h = re.sub(r"\$\('lnk-admin'\)\.hidden = !puedo\('admin_panel'\);", "$('lnk-admin').hidden = !puedo('admin_panel'); if ($('lnk-sala')) $('lnk-sala').hidden = !puedo('sala_crisis');", h)
    if "$('lnk-sala').hidden" not in h and "$('lnk-seg').hidden = !puedo('seguimiento');" in h:
        h = h.replace("$('lnk-seg').hidden = !puedo('seguimiento');", "$('lnk-seg').hidden = !puedo('seguimiento'); if ($('lnk-sala')) $('lnk-sala').hidden = !puedo('sala_crisis');", 1)
    return h


# ---------- Página de la sala, armada desde Mis alertas (barra, tema, campanita, push y asistente) ----------
def pagina_sala(mis):
    src = _leer('sala_crisis.html')
    css = re.search(r'<style id="sc-css">\n(.*?)</style>', src, re.S).group(1)
    main = src[src.index('<!-- MAIN -->\n') + len('<!-- MAIN -->\n'):src.index('<!-- FIN MAIN -->')]
    js = re.search(r'<script id="sc-js">\n(.*?)</script>', src, re.S).group(1)
    h = re.sub(r'<title>.*?</title>', '<title>Helios · Sala de crisis</title>', mis, count=1)
    k = h.index('</style>'); h = h[:k] + css + h[k:]
    a = h.index('<main class="wrap">'); b = h.index('<div class="toast" id="toast"')
    h = h[:a] + main + '\n' + h[b:]
    marca = "var yo = null, permisos = [], datos = null, grupos = {};"
    k = h.index(marca); i = h.rindex('<script>', 0, k); j = h.index('</script>', k)
    h = h[:i] + '<script>\n' + js + h[j:]
    assert h.count('id="toast"') == 1 and marca not in h and 'id="lnk-sala"' in h and 'window.ASIS_INCIDENTE = ID' in h and h.count('var SALA = window.ASIS_INCIDENTE') == 1
    return h


# ---------- Detalle de la alerta: en qué sala está, "Abrir sala de crisis" y comunicar con el mensaje del asistente ----------
def alerta(h):
    h = _rep(h, '    <p class="bajada" id="sub"></p>\n  </div>\n  <div class="det-acc" id="acciones"></div>',
             '    <p class="bajada" id="sub"></p>\n    <p class="sala-aviso" id="sala-aviso" hidden></p>\n  </div>\n  <div class="det-acc" id="acciones"></div>')
    k = h.index('</style>')
    h = h[:k] + ('/* Sala de crisis (parche 69) */\n.sala-aviso { margin: 6px 0 0; padding: 7px 11px; border-radius: 4px; background: var(--critica-bg); color: var(--critica-txt); font-size: 14px; }\n'
                 '.sala-aviso a { color: inherit; font-weight: 700; }\n') + h[k:]
    h = _rep(h, "    $('acciones').innerHTML = acc;\n    $('f-comentar').hidden = !p.comentar;",
             "    var salas = d.incidentes_mayores || [], salaAbierta = salas.filter(function (x) { return x.estado !== 'CERRADO'; })[0];\n"
             "    if (d.puede_abrir_sala && !salaAbierta) acc += '<button class=\"btn\" data-acc=\"sala\">Abrir sala de crisis</button>';\n"
             "    $('acciones').innerHTML = acc;\n"
             "    $('sala-aviso').hidden = !salas.length;\n"
             "    $('sala-aviso').innerHTML = salas.map(function (x) { return (x.estado === 'CERRADO' ? 'Fue parte de la sala de crisis ' : 'Es parte de la sala de crisis ') + '<a href=\"/incidente/' + x.id + '\">' + esc(x.codigo + ' · ' + x.titulo) + '</a>' + (x.estado === 'CERRADO' ? ' (cerrada)' : ''); }).join('<br>');\n"
             "    $('f-comentar').hidden = !p.comentar;")
    h = _rep(h, "    } else if (acc === 'comunicar') abrirComunicar();",
             "    } else if (acc === 'sala') {\n"
             "      b.disabled = true;\n"
             "      pedir('/api/incidentes', { alertas: [ID] }).then(function (r) { location.href = '/incidente/' + r.incidente.id; })\n"
             "        .catch(function (e) { b.disabled = false; toast(e.message, true); });\n"
             "    } else if (acc === 'comunicar') abrirComunicar();")
    h = _rep(h, "    k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado;\n    $('dlg-comunicar').showModal();",
             "    k_aplicado = mensajeComunicado(); $('k-mensaje').value = k_aplicado;\n"
             "    // Mensaje que armó el asistente en la sala de crisis (parche 69): va primero; los datos de la alerta quedan abajo\n"
             "    var deSala = null; try { deSala = sessionStorage.getItem('helios_comunicar_msg'); sessionStorage.removeItem('helios_comunicar_msg'); } catch (e) { deSala = null; }\n"
             "    if (deSala) $('k-mensaje').value = deSala + '\\n\\n' + k_aplicado;\n"
             "    $('dlg-comunicar').showModal();")
    h = _rep(h, "      if (d && /[?&]resolver\\b/.test(location.search) && d.puedo.resolver) abrirResolver();",
             "      if (d && /[?&]resolver\\b/.test(location.search) && d.puedo.resolver) abrirResolver();\n"
             "      if (d && /[?&]comunicar\\b/.test(location.search) && d.puedo.comunicar) { history.replaceState(null, '', location.pathname); abrirComunicar(); }")
    return h


# ---------- Campanita: los avisos de la sala llevan a /incidente/<id> ----------
def destino_avisos(h):
    if 'function destinoDe(a) { ' in h:
        h = _rep(h, 'function destinoDe(a) { ', "function destinoDe(a) { if (/^i\\d+$/.test(a.alerta_id || '')) return '/incidente/' + a.alerta_id.slice(1); ")
    return h


def servidor(s):
    s = _rep(s, "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // asistente de IA (responde según los permisos de cada perfil)\n",
             "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // asistente de IA (responde según los permisos de cada perfil)\n"
             "  sala_crisis: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // ver salas de crisis (Soporte, solo donde tiene tareas) (parche 69)\n"
             "  sala_crisis_dirigir: ['ANALISTA'],                 // abrir y dirigir una sala: alertas, tareas, estado, escalar\n"
             "  sala_crisis_tarea: ['ANALISTA', 'SOPORTE'],        // actualizar las tareas propias y dejar notas\n")
    pagina = pagina_sala(_get(s, 'MIS_ALERTAS_HTML'))
    s = _rep(s, "async function rutasComunicados(env, request, ruta, yo) {",
             _leer('sala_crisis_server.js') + 'const SALA_CRISIS_HTML = ' + json.dumps(pagina, ensure_ascii=False) + ';\n\n'
             + "async function rutasComunicados(env, request, ruta, yo) {")
    s = _rep(s, "      const comunicadosR = await rutasComunicados(env, request, ruta, yo);\n",
             "      // Sala de crisis (parche 69): controla sus propios permisos\n"
             "      const salaR = await rutasSalaCrisis(env, request, ruta, yo);\n"
             "      if (salaR) return salaR;\n"
             "      const comunicadosR = await rutasComunicados(env, request, ruta, yo);\n")
    # Un comunicado de una alerta que está en una sala abierta queda también en la línea de tiempo de la sala
    s = _rep(s, "  return okJson({ comunicado: { id: cid, personas: destinos.length, por_rol:",
             "  await lineaPorComunicado(env, yo, alertaId, cid, nombres, destinos.length);\n"
             "  return okJson({ comunicado: { id: cid, personas: destinos.length, por_rol:")
    # Detalle de la alerta: en qué salas está y si se puede abrir una
    s = _rep(s, "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),\n",
             "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),\n"
             "    incidentes_mayores: await incidentesDeAlerta(env, alertaId), puede_abrir_sala: puede(yo, 'sala_crisis_dirigir') && rol.abierta,\n")
    # Preparar demo: borra las salas abiertas en Helios (los antecedentes importados quedan)
    s = _rep(s, "  await env.DB.batch([env.DB.prepare('DELETE FROM comunicado_destinatarios'), env.DB.prepare('DELETE FROM comunicados_incidente')]).catch(() => {});\n",
             "  await env.DB.batch([env.DB.prepare('DELETE FROM comunicado_destinatarios'), env.DB.prepare('DELETE FROM comunicados_incidente')]).catch(() => {});\n"
             "  await env.DB.batch([\n"
             "    env.DB.prepare(\"DELETE FROM incidente_alertas WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidente_tareas WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidente_linea_tiempo WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidentes_mayores WHERE origen = 'HELIOS'\"),\n"
             "  ]).catch(() => {});\n")
    # Push: los avisos de la sala abren la sala
    s = _rep(s, "function avisoPush(a) {\n",
             "function avisoPush(a) {\n"
             "  if (/^i\\d+$/.test(a.alerta_id || '')) {\n"
             "    const id = Number(a.alerta_id.slice(1));\n"
             "    return { titulo: 'Helios · ' + a.texto, cuerpo: String(a.detalle || '').slice(0, 450), url: '/incidente/' + id, tag: 'helios-incidente-' + id + '-' + a.id };\n"
             "  }\n")
    return asistente(s)


# ---------- Asistente: herramientas de la sala, propuestas y preguntas sugeridas dentro de la sala ----------
def asistente(s):
    s = _rep(s, "async function rutasAsistente(env, request, ruta, yo) {",
             _leer('sala_crisis_asistente.js') + "\nasync function rutasAsistente(env, request, ruta, yo) {")
    s = _rep(s, "async function asistValidarAccion(env, yo, a) {\n",
             "async function asistValidarAccion(env, yo, a) {\n  if (a && SALA_ACCIONES[a.tipo]) return await asistValidarAccionSala(env, yo, a);   // propuestas de la sala de crisis (parche 69)\n")
    # Fuera de una sala, el asistente queda igual que antes: las herramientas y propuestas de la sala se ofrecen solo adentro
    s = _rep(s, "  const disponibles = asistDisponibles(yo);\n  const schemas = asistSchemas(disponibles, yo);",
             "  const enSala = !!entrada.incidente_id;\n  const disponibles = asistDisponibles(yo).filter((n) => enSala || !ASIST_HERRAMIENTAS[n].soloSala);\n  const schemas = asistSchemas(disponibles, yo, enSala);")
    s = _rep(s, "function asistSchemas(nombres, yo) {", "function asistSchemas(nombres, yo, enSala) {")
    s = _rep(s, "  const acc = Object.keys(ASIST_ACCIONES).filter((k) => ASIST_ACCIONES[k].ok(yo));",
             "  const acc = Object.keys(ASIST_ACCIONES).filter((k) => ASIST_ACCIONES[k].ok(yo) && (enSala || !ASIST_ACCIONES[k].soloSala));")
    s = _rep(s, "description: 'Propone una acción sobre una alerta para que la persona la confirme con un botón.",
             "description: 'Propone una acción sobre una alerta' + (enSala ? ' o la sala de crisis' : '') + ' para que la persona la confirme con un botón.")
    s = _rep(s, "    parameters: { type: 'object', required: ['tipo', 'alerta_id', 'motivo'], properties: {\n      tipo: { type: 'string', enum: acc }, alerta_id: { type: 'string', description: 'alerta_id de la alerta' },\n",
             "    parameters: { type: 'object', required: enSala ? ['tipo', 'motivo'] : ['tipo', 'alerta_id', 'motivo'], properties: {\n      tipo: { type: 'string', enum: acc }, alerta_id: { type: 'string', description: 'alerta_id de la alerta' },\n"
             "      ...(enSala ? { incidente_id: { type: 'integer', description: 'Sala de crisis: número del incidente (asignar_tarea, escalar, comunicar)' },\n"
             "        titulo_tarea: { type: 'string', description: 'Solo para asignar_tarea: qué hay que hacer' }, componente_id: { type: 'integer', description: 'Solo para asignar_tarea: componente a revisar' } } : {}),\n")
    s = _rep(s, "      if (!acciones.some((x) => x.tipo === p.tipo && x.alerta_id === p.alerta_id)) acciones.push(p);",
             "      if (!acciones.some((x) => x.tipo === p.tipo && (x.clave || x.alerta_id) === (p.clave || p.alerta_id))) acciones.push(p);")
    s = _rep(s, "  const mensajes = [{ role: 'system', content: asistSistema(yo, ahora, disponibles) }];",
             "  const mensajes = [{ role: 'system', content: asistSistema(yo, ahora, disponibles) + (entrada.incidente_id ? '\\n' + ASIST_REGLA_SALA.replace('{ID}', entrada.incidente_id) : '') }];")
    s = _rep(s, "  if (entrada.alerta_id) directas.push(['detalle_alerta', { alerta_id: entrada.alerta_id }]);\n",
             "  if (entrada.alerta_id) directas.push(['detalle_alerta', { alerta_id: entrada.alerta_id }]);\n"
             "  if (entrada.incidente_id && !entrada.sugerencia) directas.push(['estado_incidente', { incidente_id: entrada.incidente_id }]);   // pregunta libre dentro de la sala\n")
    # Ruta: incidente_id (validado con la regla de la sala) y las preguntas sugeridas de la sala
    s = _rep(s, "      sugerencias: (ASIST_SUGERENCIAS[yo.perfil] || []).map((s) => ({ id: s.id, texto: s.texto })), restantes: uso ? uso.restantes : 0,",
             "      sugerencias: (ASIST_SUGERENCIAS[yo.perfil] || []).map((s) => ({ id: s.id, texto: s.texto })), restantes: uso ? uso.restantes : 0,\n"
             "      sugerencias_sala: puede(yo, 'sala_crisis') ? SALA_SUGERENCIAS.map((s) => ({ id: s.id, texto: s.texto })) : [],")
    s = _rep(s, "    const sugerencia = b.sugerencia ? (ASIST_SUGERENCIAS[yo.perfil] || []).find((s) => s.id === String(b.sugerencia)) : null;\n",
             "    // Dentro de una sala de crisis (parche 69): se valida con la misma regla de la sala y se usan sus preguntas sugeridas\n"
             "    const incidenteId = b.incidente_id == null || b.incidente_id === '' ? null : aId(b.incidente_id);\n"
             "    if (b.incidente_id != null && b.incidente_id !== '' && !incidenteId) return jsonError('Sala inválida.', 400);\n"
             "    if (incidenteId) {\n"
             "      if (!puede(yo, 'sala_crisis')) return jsonError('Tu perfil no tiene acceso a la sala de crisis.', 403);\n"
             "      let rolSala;\n"
             "      try { rolSala = await rolEnIncidente(env, yo, incidenteId); } catch (e) { if (/no such table/i.test(e.message)) return jsonError(FALTA_SCRIPT_24, 503); throw e; }\n"
             "      if (rolSala.error) return rolSala.error;\n"
             "    }\n"
             "    const salaSug = b.sugerencia && /^sala_/.test(String(b.sugerencia)) ? SALA_SUGERENCIAS.find((s) => s.id === String(b.sugerencia)) : null;\n"
             "    if (salaSug && !incidenteId) return jsonError('Esa pregunta es de una sala de crisis.', 400);\n"
             "    const sugerencia = salaSug ? Object.assign({}, salaSug, { args: Object.fromEntries(salaSug.herramientas.map((n) => [n, { incidente_id: incidenteId }])),\n"
             "        proponer: salaSug.proponer ? (d) => salaSug.proponer(d, incidenteId) : null })\n"
             "      : b.sugerencia ? (ASIST_SUGERENCIAS[yo.perfil] || []).find((s) => s.id === String(b.sugerencia)) : null;\n")
    s = _rep(s, "(alertaId ? '[alerta ' + alertaId.slice(0, 8) + '] ' : '') + pregunta.slice(0, 300)),",
             "(alertaId ? '[alerta ' + alertaId.slice(0, 8) + '] ' : '') + (incidenteId ? '[' + imCodigo(incidenteId) + '] ' : '') + pregunta.slice(0, 300)),")
    s = _rep(s, "{ pregunta, historia: sugerencia || alertaId ? [] : asistHistoria(b.historia), sugerencia, alerta_id: alertaId }",
             "{ pregunta, historia: sugerencia || alertaId ? [] : asistHistoria(b.historia), sugerencia, alerta_id: alertaId, incidente_id: incidenteId }")
    return s


# ---------- Panel del asistente (en todas las páginas): contexto de la sala y propuestas de la sala ----------
def panel(h):
    if 'var ACC_TXT = {' not in h:
        return h
    h = _rep(h, "var ACC_TXT = { derivar: 'Derivar', tomar: 'Tomar', comentar: 'Comentar', devolver: 'Devolver', resolver: 'Resolver' };\n  var ACC_OBLIG = { devolver: 1, resolver: 1 };",
             "var ACC_TXT = { derivar: 'Derivar', tomar: 'Tomar', comentar: 'Comentar', devolver: 'Devolver', resolver: 'Resolver', asignar_tarea: 'Asignar tarea', escalar: 'Escalar', comunicar: 'Comunicar' };\n"
             "  var ACC_OBLIG = { devolver: 1, resolver: 1, escalar: 1, comunicar: 1 };\n"
             "  var SALA = window.ASIS_INCIDENTE || null;   // dentro de una sala de crisis (parche 69): número del incidente")
    h = _rep(h, "if (r.sugerencias.length) {\n        var s = agregar('asis-sug', r.sugerencias.map(",
             "var sugs = SALA ? (r.sugerencias_sala || []) : r.sugerencias;\n"
             "      if (sugs.length) {\n        var s = agregar('asis-sug', sugs.map(")
    h = _rep(h, "if (!cuerpo.sugerencia && !cuerpo.alerta_id) cuerpo.historia = historia.slice(-6);",
             "if (!cuerpo.sugerencia && !cuerpo.alerta_id) cuerpo.historia = historia.slice(-6);\n    if (SALA && !cuerpo.alerta_id) cuerpo.incidente_id = SALA;")
    h = _rep(h, "'<div class=\"q\">' + escA(p.alerta) + (p.motivo ? '<br>' + escA(p.motivo) : '') + '</div>' +",
             "'<div class=\"q\">' + escA(p.alerta) + (p.motivo ? '<br>' + escA(p.motivo) : '') + '</div>' +\n"
             "      (p.tipo === 'comunicar' ? '<div class=\"q\">Se abre «Comunicar incidente» con este mensaje para elegir a quién le llega.</div>' : '') +")
    h = _rep(h, "      var cuerpo = { comentario: comentario || null };\n      if (p.tipo === 'derivar') { cuerpo.usuario_id = p.usuario_id; cuerpo.equipo_id = p.equipo_id; }\n"
                "      // La acción va por la ruta de siempre: con sus permisos, historial y auditoría\n      api('/api/alertas/' + p.alerta_id + '/' + p.tipo, cuerpo).then(",
             "      var cuerpo = { comentario: comentario || null };\n      if (p.tipo === 'derivar') { cuerpo.usuario_id = p.usuario_id; cuerpo.equipo_id = p.equipo_id; }\n"
             "      // Sala de crisis: comunicar abre el diálogo de la alerta con el mensaje; tarea y escalamiento van por las rutas de la sala\n"
             "      if (p.tipo === 'comunicar') {\n"
             "        try { sessionStorage.setItem('helios_comunicar_msg', comentario); } catch (e) { /* sin almacenamiento: se abre igual */ }\n"
             "        location.href = '/alerta/' + p.alerta_id + '?comunicar'; return;\n"
             "      }\n"
             "      var url = '/api/alertas/' + p.alerta_id + '/' + p.tipo;\n"
             "      if (p.tipo === 'asignar_tarea') { url = '/api/incidentes/' + p.incidente_id + '/tareas'; cuerpo = { titulo: p.tarea, detalle: comentario || null, responsable_usuario_id: p.usuario_id, equipo_id: p.equipo_id, componente_id: p.componente_id || null, propuesta_por_asistente: 1 }; }\n"
             "      if (p.tipo === 'escalar') { url = '/api/incidentes/' + p.incidente_id + '/escalar'; cuerpo = { motivo: comentario, usuario_id: p.usuario_id, equipo_id: p.equipo_id }; }\n"
             "      // La acción va por la ruta de siempre: con sus permisos, historial y auditoría\n      api(url, cuerpo).then(")
    return h


# ---------- Demo: escenas 20 a 22 (sala de crisis) ----------
# Las escenas traen los datos (el gateway de pagos se cae en tres clientes, sigue caído y se recupera); las acciones de la
# sala las hace quien presenta desde la pantalla, como derivar o resolver. Las 19 escenas de antes no cambian.
ESCENAS_SALA = """  { titulo: 'Cierre de la guardia', texto: 'Todo vuelve a la normalidad y se cierran las alertas pendientes.', eventos: [] },
  { titulo: 'Se cae el gateway de pagos', texto: 'Ningún pago de servicios por API se aprueba en CLI_006 y suben los errores en CLI_002 y CLI_005: es el mismo gateway. Como Analista: tocá «Abrir sala de crisis» en la alerta grave de CLI_006 (o en Sala de crisis) y sumá las otras dos.',
    eventos: [[CLI006_PAG_API, 'SIN_EXITOS'], [CLI002_PAG_WEB, 'ERROR_ALTO'], [CLI005_PAG_MOB, 'ERROR_ALTO']] },
  { titulo: 'La sala de crisis trabaja', texto: 'El gateway sigue caído. En la sala, preguntale al asistente «¿Qué reviso primero?»: propone las tareas con la guía de diagnóstico y el Analista las confirma; a Soporte le llega el aviso y las actualiza desde la sala.',
    eventos: [[CLI006_PAG_API, 'SIN_EXITOS'], [CLI002_PAG_WEB, 'ERROR_ALTO'], [CLI005_PAG_MOB, 'ERROR_ALTO']] },
  { titulo: 'Servicio restablecido', texto: 'Los pagos vuelven a aprobarse y las alertas se cierran solas. En la sala: «Servicio restablecido (mitigado)», «Comunicar» a los equipos y «Cerrar con causa raíz» (queda como antecedente para la próxima).', eventos: [] },
];"""


def demo(s):
    return _rep(s, "  { titulo: 'Cierre de la guardia', texto: 'Todo vuelve a la normalidad y se cierran las alertas pendientes.', eventos: [] },\n];", ESCENAS_SALA)


def aplicar(s):
    s = demo(s)
    for n in PAGINAS:
        s = _html(s, n, destino_avisos)
        s = _html(s, n, panel)
        s = _html(s, n, menu_sala)
    s = _html(s, 'ALERTA_HTML', alerta)
    s = servidor(s)   # al final: la página de la sala sale de Mis alertas ya con el menú, la campanita y el asistente nuevos
    return s
