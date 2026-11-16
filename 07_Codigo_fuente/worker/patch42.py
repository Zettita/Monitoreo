# Parche 42 (dashboard gerencial, parte 1): el Gerente y el Administrador ven lo activo y el detalle, en solo lectura.
#
#   Pedido de Hugo: un dueño no podía transferir y le preguntó a un gerente que no tenía acceso a estas vistas; el gerente tuvo que
#   preguntarle a alguien de abajo y nadie sabía si ya había alguien trabajándolo. Ahora el Gerente ve las alertas activas con su
#   estado y quién las tiene, las pre-alertas y el detalle completo (conversación, evidencia, ventanas), sin ningún botón de acción.
#   - Permisos: alertas_abiertas suma Gerente; detalle_alerta suma Gerente y Administrador (el Administrador ya veía la lista y
#     Seguimiento, pero no podía abrir el detalle). El servidor no cambia lo que pueden hacer: tomar, derivar, comentar, adjuntar,
#     resolver, devolver y el correo siguen cerrados para ellos (botonesDe devuelve todo en false y rolEnAlerta no les da "trabaja").
#   - Tablero: la lista y las pre-alertas aparecen para el Gerente; "Detalle" para quien tiene el detalle.
#   - Seguimiento: "Ver detalle" también para el Administrador (lectura).
#   - Detalle: "Volver" lleva al tablero cuando la persona no tiene Seguimiento ni Mis alertas, y muestra "Solo lectura".
#   - Tiempo casi real: el tablero se actualiza solo cada 2 minutos, solo con la pestaña visible: consulta un marcador de 1 fila
#     (GET /api/tablero/version = alerta_parametros.tablero_revision) y recarga todo únicamente si hubo una revisión nueva.
#   - Asistente: el Gerente puede preguntar "¿Qué incidentes están activos y quién los está trabajando?" (pregunta sugerida) y
#     el asistente puede usar la lista de alertas abiertas con su perfil (solo lectura, como siempre).
#   Sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


POLLING_JS = """  // Actualización automática (parche 42): cada 2 minutos, solo con la pestaña visible. Consulta un marcador de 1 fila
  // (la revisión del tablero) y recarga todo solo si hubo una revisión nueva: casi no cuesta lecturas.
  (function () {
    var pidiendo = false;
    function mirar() {
      if (document.hidden || pidiendo || !datos || !datos.parametros) return;
      pidiendo = true;
      pedir('/api/tablero/version').then(function (v) {
        if (v && v.revision && v.revision !== datos.parametros.revision) return cargar();
      }).catch(function () {}).then(function () { pidiendo = false; });
    }
    setInterval(mirar, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) mirar(); });
  })();

"""


def tablero(h):
    h = _rep(h, "      ? 'Las alertas en curso, por prioridad (gravedad y criticidad del servicio). Tomá una para avisarle al resto del equipo que la estás mirando.'",
             "      ? 'Las alertas en curso, por prioridad (gravedad y criticidad del servicio), con su estado y quién las tiene. Se actualiza sola cada 2 minutos.'")
    h = _rep(h, "          if (puedo('derivar')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Detalle</a>';",
             "          if (puedo('detalle_alerta')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Detalle</a>';")
    h = _rep(h, "    // El gerente ve el panorama, las 24 h y el histórico: la lista de alertas y pre-alertas es para quien las trabaja\n",
             "    // Desde el parche 42 el gerente también ve la lista de alertas y las pre-alertas (solo lectura, sin botones de acción)\n")
    h = _rep(h, "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n", POLLING_JS + "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n")
    return h


def seguimiento(h):
    return _rep(h, "          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>';\n        }\n",
                "          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n        }\n"
                "        if (puedo('detalle_alerta')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>';\n")


def alerta(h):
    h = _rep(h, "    var bandeja = puedo('mis_alertas') ? '/mis-alertas' : '/seguimiento';",
             "    var bandeja = puedo('mis_alertas') ? '/mis-alertas' : puedo('seguimiento') ? '/seguimiento' : '/';")
    h = _rep(h, "esc(info.estado[0]) + '</span>';", "esc(info.estado[0]) + '</span>' + (p.lectura ? '<span class=\"estado-chip\" title=\"Tu perfil ve la alerta sin poder cambiarla\">Solo lectura</span>' : '');")
    return h


def aplicar(s):
    # ---- Permisos ----
    s = _rep(s, "  alertas_abiertas: ['ADMIN', 'ANALISTA'],             // lista de alertas abiertas y pre-alertas del tablero (el gerente ve el Panorama)",
             "  alertas_abiertas: ['ADMIN', 'GERENTE', 'ANALISTA'],  // lista de alertas abiertas y pre-alertas del tablero (Gerente y Administrador, solo lectura)")
    s = _rep(s, "  detalle_alerta: ['ANALISTA', 'SOPORTE'],", "  detalle_alerta: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],")
    # ---- Detalle en solo lectura ----
    s = _rep(s, "    a, analista: esAnalista(yo), abierta: a.estado !== 'RESUELTA',",
             "    a, analista: esAnalista(yo), abierta: a.estado !== 'RESUELTA',\n    lectura: yo.perfil === 'GERENTE' || yo.perfil === 'ADMIN',   // ven cualquier alerta, sin poder cambiar nada")
    s = _rep(s, "  if (!rol.analista && !rol.esMia && !rol.deMiEquipo && !rol.loLidero) {\n    const intervino",
             "  if (!rol.lectura && !rol.analista && !rol.esMia && !rol.deMiEquipo && !rol.loLidero) {\n    const intervino")
    s = _rep(s, "  rol.trabaja = rol.analista || rol.esMia || rol.deMiEquipo || rol.loLidero;   // puede comentar y adjuntar",
             "  rol.trabaja = !rol.lectura && (rol.analista || rol.esMia || rol.deMiEquipo || rol.loLidero);   // puede comentar y adjuntar")
    s = _rep(s, "function botonesDe(rol, yo) {\n",
             "function botonesDe(rol, yo) {\n  if (rol.lectura) return { tomar: false, comentar: false, adjuntar: false, devolver: false, resolver: false, derivar: false, reasignar: false, correo: false, lectura: true };\n")
    # ---- Marcador de revisión (actualización automática) ----
    s = _rep(s, "SELECT ahora, horizonte_horas, gracia_minutos,\n", "SELECT ahora, horizonte_horas, gracia_minutos, tablero_revision AS revision,\n")
    s = _rep(s, "      if (request.method === 'GET' && ruta === '/api/dashboard') {",
             "      // Marcador liviano para la actualización automática del tablero (parche 42): 1 fila\n"
             "      if (request.method === 'GET' && ruta === '/api/tablero/version') {\n"
             "        if (!puede(yo, 'tablero')) return jsonError('Tu perfil no usa el tablero general.', 403);\n"
             "        const v = await env.DB.prepare('SELECT tablero_revision AS revision FROM alerta_parametros WHERE id = 1').first();\n"
             "        return Response.json({ ok: true, revision: v ? v.revision : null }, { headers: { 'cache-control': 'no-store' } });\n"
             "      }\n"
             "      if (request.method === 'GET' && ruta === '/api/dashboard') {")
    # ---- Asistente ----
    s = _rep(s, "  GERENTE: [\n    { id: 'operacion_hoy',",
             "  GERENTE: [\n    { id: 'activas_ahora', texto: '¿Qué incidentes están activos y quién los está trabajando?', herramientas: ['alertas_abiertas'], guia: ASIST_GUIA_ACTIVAS },\n    { id: 'operacion_hoy',")
    s = _rep(s, "  ADMIN: [\n    { id: 'ajustes',",
             "  ADMIN: [\n    { id: 'activas_ahora', texto: '¿Qué incidentes están activos y quién los está trabajando?', herramientas: ['alertas_abiertas'], guia: ASIST_GUIA_ACTIVAS },\n    { id: 'ajustes',")
    s = _rep(s, "// Preguntas sugeridas por perfil: se resuelven trayendo los datos directo",
             "// Gerente y Administrador (parche 42): lo activo, con su estado y quién lo tiene (lo que un gerente necesita cuando le preguntan)\n"
             "const ASIST_GUIA_ACTIVAS = 'Respuesta corta. Primero cuántos incidentes hay activos y cuántos son graves (si no hay ninguno, decí \"No hay incidentes activos.\" y nada más). Después, para cada uno (máximo 5, por prioridad), una frase: cliente, qué pasa, desde cuándo y su estado (sin asignar, asignada a alguien sin tomar o en curso con quién). Si hay alguno sin asignar o demorado, decilo primero: es lo que más importa. No propongas acciones: este perfil solo mira.';\n"
             "// Preguntas sugeridas por perfil: se resuelven trayendo los datos directo")
    s = _rep(s, "  [/umbral|falsa|ajust|banda|configur/i, 'ajustes_sugeridos'],",
             "  [/umbral|falsa|ajust|banda|configur/i, 'ajustes_sugeridos'],\n  [/activ|abiert|en curso|qui[eé]n .*(trabaj|tiene|mira|ve)/i, 'alertas_abiertas'],")
    # ---- Páginas ----
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'SEGUIMIENTO_HTML', seguimiento)
    s = _html(s, 'ALERTA_HTML', alerta)
    return s
