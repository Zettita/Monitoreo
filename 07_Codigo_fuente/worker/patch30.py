# Parche 30: ticketera. Detalle de cada alerta, evidencia adjunta y resolución con causa.
#
#   - Página nueva /alerta/<id> (Soporte y Analista): conversación completa con la evidencia intercalada, datos de la
#     alerta, ventanas con problema, y las acciones de siempre (tomar, derivar, reasignar, devolver, resolver).
#     Se arma a partir de Mis alertas ya terminada, así hereda barra, tema, campanita, avisos push y asistente.
#   - Evidencia: archivos en R2 (binding EVIDENCIA), con sus datos como customMetadata (nada en D1). Sin el binding todo sigue igual.
#   - Resolver con causa: "¿Qué lo causó?" (una) y "¿Qué se hizo?" (una o más), con un clic, más el detalle opcional.
#     Se guarda en alertas_historico (causa_resolucion, acciones_resolucion). Las opciones las edita el Administrador (Administración > Reglas de alerta).
#   - Mis alertas, Seguimiento y el tablero: "Ver detalle", y "Resolver" abre el detalle con el diálogo nuevo.
#     Los avisos (campanita y push) de una alerta llevan directo a su detalle.
#   - Sin tablas nuevas: el script 13 agrega 2 columnas a alertas_historico y 1 a alerta_parametros (las opciones, en JSON).
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


# ---------- Página de detalle, armada desde Mis alertas ----------
def pagina_detalle(mis):
    src = _leer('alerta.html')
    css = re.search(r'<style id="detalle-css">\n(.*?)</style>', src, re.S).group(1)
    main = src[src.index('<!-- MAIN -->\n') + len('<!-- MAIN -->\n'):src.index('<!-- FIN MAIN -->')]
    js = re.search(r'<script id="detalle-js">\n(.*?)</script>', src, re.S).group(1)
    h = mis
    h = re.sub(r'<title>.*?</title>', '<title>Helios · Alerta</title>', h, count=1)
    h = _css(h, css)
    a = h.index('<main class="wrap">'); b = h.index('<div class="toast" id="toast"')
    h = h[:a] + main + '\n' + h[b:]
    # El script propio de Mis alertas se reemplaza por el del detalle (los demás: campanita, tema, asistente, quedan)
    marca = "var yo = null, permisos = [], datos = null, grupos = {};"
    k = h.index(marca); i = h.rindex('<script>', 0, k); j = h.index('</script>', k)
    h = h[:i] + '<script>\n' + js + h[j:]
    assert h.count('id="toast"') == 1 and 'datos = null, grupos' not in h
    return h


# ---------- Servidor ----------
RESOLVER_VIEJO = """  if (accion === 'resolver') {
    if (!(analista || esMia)) return prohibido(yo.perfil === 'SOPORTE' ? 'Para resolverla primero tiene que estar asignada a vos.' : null);
    if (!comentario || comentario.length < 3) return jsonError('Contá qué se hizo para resolverla.', 400);
    await env.DB.batch([
      env.DB.prepare(`UPDATE alertas_historico SET estado = 'RESUELTA', motivo_resolucion = 'MANUAL', fecha_resolucion = ${AHORA_SIM}, resuelta_por = ?2, comentario = ?3,
                        asignado_usuario_id = COALESCE(asignado_usuario_id, ?4)
                      WHERE ${GRUPO_ABIERTO}`).bind(alertaId, yo.nombre, comentario, yo.id),
      evento('RESOLVER', null, null, comentario),
      auditoria('RESOLVER_ALERTA', desc),
    ].concat(avisar([a.asignado_usuario_id, a.asignado_por], 'RESUELTA', yo.nombre + ' resolvió una alerta', comentario)));
    return okJson({});
  }"""
RESOLVER_NUEVO = """  if (accion === 'resolver') {
    if (!(analista || esMia)) return prohibido(yo.perfil === 'SOPORTE' ? 'Para resolverla primero tiene que estar asignada a vos.' : null);
    // Causa y "qué se hizo" del catálogo (parche 30); el texto libre es opcional si se eligieron las dos cosas
    const res = await datosResolucion(env, b, comentario);
    if (res.error) return jsonError(res.error, 400);
    const textoRes = res.texto;
    try {
      await env.DB.batch([
        env.DB.prepare(`UPDATE alertas_historico SET estado = 'RESUELTA', motivo_resolucion = 'MANUAL', fecha_resolucion = ${AHORA_SIM}, resuelta_por = ?2, comentario = ?3,
                          asignado_usuario_id = COALESCE(asignado_usuario_id, ?4), causa_resolucion = ?5, acciones_resolucion = ?6
                        WHERE ${GRUPO_ABIERTO}`).bind(alertaId, yo.nombre, textoRes, yo.id, res.causa, res.acciones),
        evento('RESOLVER', null, null, textoRes),
        auditoria('RESOLVER_ALERTA', desc + (res.causa ? ': ' + res.causa : '')),
      ].concat(avisar([a.asignado_usuario_id, a.asignado_por], 'RESUELTA', yo.nombre + ' resolvió una alerta', textoRes)));
    } catch (e) {
      if (/no such column/i.test(e.message)) return jsonError(FALTA_SCRIPT_13, 500);
      throw e;
    }
    return okJson({});
  }"""


def servidor(s):
    s = _rep(s, "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],",
             "  detalle_alerta: ['ANALISTA', 'SOPORTE'],             // página de detalle de una alerta (conversación, evidencia, resolución)\n"
             "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],")
    s = _rep(s, RESOLVER_VIEJO, RESOLVER_NUEVO)
    pagina = pagina_detalle(_get(s, 'MIS_ALERTAS_HTML'))
    bloque = _leer('ticketera_server.js') + '\nconst ALERTA_HTML = ' + json.dumps(pagina, ensure_ascii=False) + ';\n\n'
    s = _rep(s, '// Rutas de asignación. Devuelve una respuesta o null si la ruta no es de acá.\nasync function rutasAsignacion(',
             bloque + '// Rutas de asignación. Devuelve una respuesta o null si la ruta no es de acá.\nasync function rutasAsignacion(')
    s = _rep(s, '      // Asignación de alertas y "Mis alertas": controla sus propios permisos\n',
             '      // Ticketera: detalle de una alerta, evidencia y catálogo de resolución (controla sus propios permisos)\n'
             '      const ticketeraR = await rutasTicketera(env, request, ruta, yo);\n'
             '      if (ticketeraR) return ticketeraR;\n'
             '      // Asignación de alertas y "Mis alertas": controla sus propios permisos\n')
    # Push: los avisos de una alerta llevan a su detalle
    s = _rep(s, "  const url = PUSH_A_BANDEJA[a.tipo] ? (a.tipo === 'DEVUELTA' && bandeja === '/mis-alertas' ? '/' : bandeja) : '/';",
             "  const url = PUSH_A_BANDEJA[a.tipo] && a.alerta_id && /^[0-9a-f]{32}$/.test(a.alerta_id) ? '/alerta/' + a.alerta_id\n"
             "    : PUSH_A_BANDEJA[a.tipo] ? (a.tipo === 'DEVUELTA' && bandeja === '/mis-alertas' ? '/' : bandeja) : '/';")
    return s


# ---------- Páginas existentes ----------
def campanita(h):
    return _rep(h, "function destinoDe(a) { return A_MIS[a.tipo] ?",
                "function destinoDe(a) { if (A_MIS[a.tipo] && a.alerta_id && /^[0-9a-f]{32}$/.test(a.alerta_id)) return '/alerta/' + a.alerta_id; return A_MIS[a.tipo] ?")


def mis_alertas(h):
    h = _rep(h, "'<span class=\"sev ' + esc(g.sev) + '\">' + esc(SEV_TXT[g.sev]) + '</span><b>' + esc(frase(r.tipo_alerta, r)) + '</b></div>'",
             "'<span class=\"sev ' + esc(g.sev) + '\">' + esc(SEV_TXT[g.sev]) + '</span><a class=\"caso-titulo\" href=\"/alerta/' + g.id + '\">' + esc(frase(r.tipo_alerta, r)) + '</a></div>'")
    h = _rep(h, "acc = '<button class=\"btn primario chico\" data-acc=\"resolver\" data-id=\"' + g.id + '\">Resolver</button>'",
             "acc = '<a class=\"btn primario chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>'")
    h = _rep(h, "(acc ? '<div class=\"caso-acc\">' + acc + '</div>' : '') +",
             "'<div class=\"caso-acc\">' + acc + '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a></div>' +")
    h = _css(h, ".caso-titulo { color: var(--ink); font-weight: 700; text-decoration: none; }\n.caso-titulo:hover { color: var(--accent); text-decoration: underline; }\n")
    return h


def seguimiento(h):
    h = _rep(h, "          acc += '<button class=\"btn chico\" data-acc=\"resolver\" data-id=\"' + g.id + '\">Resolver</button>';\n",
             "          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n"
             "          acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Ver detalle</a>';\n")
    return h


def tablero(h):
    return _rep(h, "acc += '<button class=\"btn chico\" data-acc-t=\"resolver\" data-id=\"' + g.id + '\">Resolver</button>';",
                "acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '?resolver\">Resolver</a>';\n"
                "          if (puedo('derivar')) acc += '<a class=\"btn chico\" href=\"/alerta/' + g.id + '\">Detalle</a>';")


CAT_HTML = """    <div class="cab-seccion">
      <div><h2>Al resolver: causas y qué se hizo</h2><p class="bajada">Las opciones que se eligen con un clic al resolver una alerta. Sirven para contar después por qué pasan los problemas y cómo se resuelven. Desactivar una opción la saca del diálogo, pero las alertas ya resueltas la conservan.</p></div>
    </div>
    <div class="catalogo-res">
      <div class="panel"><h3>¿Qué lo causó?</h3><ul class="lista-cat" id="cat-CAUSA"></ul>
        <form class="agregar-cat" data-tipo="CAUSA"><input maxlength="80" placeholder="Nueva causa" aria-label="Nueva causa"><button class="btn chico">Agregar</button></form></div>
      <div class="panel"><h3>¿Qué se hizo?</h3><ul class="lista-cat" id="cat-ACCION"></ul>
        <form class="agregar-cat" data-tipo="ACCION"><input maxlength="80" placeholder="Nueva acción" aria-label="Nueva acción"><button class="btn chico">Agregar</button></form></div>
    </div>
"""
CAT_CSS = """/* Catálogo de resolución (parche 30) */
.catalogo-res { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.catalogo-res .panel { padding: 14px 16px; }
.catalogo-res h3 { margin: 0 0 8px; font-size: 15px; }
.lista-cat { list-style: none; margin: 0; padding: 0; }
.lista-cat li { display: flex; gap: 6px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.lista-cat li span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.lista-cat li small { display: block; color: var(--ink-3); font-size: 12px; }
.lista-cat li.inactiva span { opacity: .55; }
.agregar-cat { display: flex; gap: 6px; margin-top: 10px; }
.agregar-cat input { flex: 1; min-width: 0; border: 1px solid var(--line-input, var(--line)); background: var(--input-bg, var(--panel)); color: var(--ink); border-radius: 4px; padding: 6px 9px; font-size: 14px; }
"""
CAT_JS = """  // Causas y acciones para resolver (parche 30)
  var CAT = [];
  function cargarCatalogo() {
    return pedir('/api/admin/catalogo-resolucion').then(function (d) { CAT = d.items; pintarCatalogo(); })
      .catch(function (e) { $('cat-CAUSA').innerHTML = '<li class="gris">' + esc(e.message) + '</li>'; });
  }
  function pintarCatalogo() {
    ['CAUSA', 'ACCION'].forEach(function (t) {
      var xs = CAT.filter(function (x) { return x.tipo === t; });
      $('cat-' + t).innerHTML = xs.length ? xs.map(function (x) {
        return '<li class="' + (x.activo ? '' : 'inactiva') + '"><span>' + esc(x.nombre) + '<small>' + (x.usos ? 'Elegida ' + x.usos + (x.usos === 1 ? ' vez' : ' veces') : 'Todavía no se usó') + (x.activo ? '' : ' · desactivada') + '</small></span>' +
          '<button class="btn chico" data-cat-renombrar="' + x.id + '">Renombrar</button><button class="btn chico" data-cat-activo="' + x.id + '">' + (x.activo ? 'Desactivar' : 'Activar') + '</button></li>';
      }).join('') : '<li class="gris">Sin opciones.</li>';
    });
  }
  function guardarCat(datos, ok) {
    return pedir('/api/admin/catalogo-resolucion', datos).then(function () { toast(ok); return cargarCatalogo(); }).then(function () { return true; })
      .catch(function (e) { toast(e.message, true); return false; });
  }
  document.querySelectorAll('.agregar-cat').forEach(function (f) {
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); var i = f.querySelector('input'), n = i.value.trim(); if (!n) return;
      guardarCat({ tipo: f.getAttribute('data-tipo'), nombre: n }, 'Opción agregada.').then(function (bien) { if (bien) i.value = ''; });
    });
  });
  document.addEventListener('click', function (ev) {
    var r = ev.target.closest('[data-cat-renombrar]'), a = ev.target.closest('[data-cat-activo]'); if (!r && !a) return;
    var id = (r || a).getAttribute(r ? 'data-cat-renombrar' : 'data-cat-activo');
    var x = CAT.filter(function (c) { return String(c.id) === id; })[0]; if (!x) return;
    if (r) {
      var n = prompt('Nuevo nombre para "' + x.nombre + '":', x.nombre);
      if (n && n.trim() && n.trim() !== x.nombre) guardarCat({ id: x.id, nombre: n.trim(), activo: x.activo }, 'Nombre cambiado. Las alertas ya resueltas conservan el nombre anterior.');
    } else guardarCat({ id: x.id, nombre: x.nombre, activo: x.activo ? 0 : 1 }, x.activo ? 'Desactivada: ya no aparece al resolver.' : 'Activada: vuelve a aparecer al resolver.');
  });
"""


def admin(h):
    h = _rep(h, '    <div class="panel"><div class="tabla-scroll"><table class="resp" id="t-reglas-base"></table></div></div>\n  </section>\n',
             '    <div class="panel"><div class="tabla-scroll"><table class="resp" id="t-reglas-base"></table></div></div>\n' + CAT_HTML + '  </section>\n')
    h = _rep(h, "    return pedir('/api/admin/reglas').then(function (d) { reglas = d; pintarReglas(); });",
             "    return pedir('/api/admin/reglas').then(function (d) { reglas = d; pintarReglas(); return cargarCatalogo(); });")
    h = _rep(h, '  function cargarReglas() {', CAT_JS + '  function cargarReglas() {')
    h = _css(h, CAT_CSS)
    return h


def aplicar(s):
    for n in ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML']:
        s = _html(s, n, campanita)
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    s = _html(s, 'SEGUIMIENTO_HTML', seguimiento)
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'ADMIN_HTML', admin)
    s = servidor(s)   # al final: la página de detalle sale de Mis alertas ya terminada
    return s
