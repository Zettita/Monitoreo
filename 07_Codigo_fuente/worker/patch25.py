# Parche 25: qué ve y qué hace cada perfil, Panorama por cliente, "Avisar" en pre-alertas
# y avisos del navegador.
#
#   Gerente:  tablero de lectura (Panorama por cliente, 24 h, histórico, tiempos, clientes).
#             Sin la lista de alertas abiertas ni pre-alertas, sin Seguimiento ni Mis alertas.
#   Analista: tablero completo, Seguimiento, deriva, resuelve (falsas alarmas), avisa pre-alertas
#             a Soporte y arma reglas de derivación. Ya no crea reglas de alerta.
#   Soporte:  solo Mis alertas (sus tickets). No entra al tablero ni ve el historial de alertas ajenas.
#   Admin:    empieza en Administración (usuarios, equipos, reglas de alerta, derivación, umbrales,
#             modelo, auditoría). Ve el tablero y el Seguimiento en modo lectura; ya no recibe alertas.
#
# Avisos del navegador (nivel 1): con la página abierta (aunque esté en otra pestaña) la campanita
# muestra un aviso del sistema. Se activa desde la campanita; sin tablas nuevas.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


# ---------------------------------------------------------------- servidor
PERMISOS = """const PERMISOS = {
  ver: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],
  tablero: ['ADMIN', 'GERENTE', 'ANALISTA'],           // tablero general (/): Soporte trabaja solo en "Mis alertas"
  alertas_abiertas: ['ADMIN', 'ANALISTA'],             // lista de alertas abiertas y pre-alertas del tablero (el gerente ve el Panorama)
  accion_alerta: ['ANALISTA', 'SOPORTE'],              // tomar y resolver
  procesar: ['ADMIN', 'ANALISTA'],                     // "Revisar alertas ahora"
  demo: ['ADMIN', 'ANALISTA'],                         // botones de la demo
  mis_alertas: ['SOPORTE'],                            // página "Mis alertas": solo Soporte recibe, toma y resuelve alertas
  seguimiento: ['ADMIN', 'ANALISTA'],                  // página "Seguimiento" (el administrador, en modo lectura)
  derivar: ['ANALISTA'],                               // asignar alertas a personas o equipos
  avisar_prealerta: ['ANALISTA'],                      // avisarle a Soporte de una pre-alerta
  avisos: ['ANALISTA', 'SOPORTE'],                     // campanita
  admin_panel: ['ADMIN', 'ANALISTA'],                  // entrar a /admin
  admin_usuarios: ['ADMIN'],                           // usuarios
  admin_equipos: ['ADMIN'],                            // equipos
  admin_reglas: ['ADMIN'],                             // reglas de alerta (del sistema y personalizadas)
  admin_derivacion: ['ADMIN', 'ANALISTA'],             // reglas de derivación automática
  admin_modelo: ['ADMIN', 'ANALISTA'],                 // estado del modelo (solo lectura)
  admin_auditoria: ['ADMIN'],                          // registro de auditoría
  admin_umbrales: ['ADMIN'],                           // umbrales por cliente (criticidad, cortes, bandas, gracia)
};"""

AVISAR_PREALERTA = r"""
// ---------- "Avisar" de una pre-alerta (Analista → Soporte) ----------
// La pre-alerta no es una alerta (no se guarda en alertas_historico): se manda un aviso de la
// campanita a la persona o al equipo elegidos y queda en la auditoría.
const PREALERTA_FRASE = { cantidad_total: 'el tráfico viene bajando', tasa_aprobacion: 'las aprobaciones vienen bajando',
  tasa_rechazo: 'los rechazos vienen subiendo', tasa_error: 'los errores vienen subiendo', tiempo_respuesta_promedio: 'el servicio se está poniendo lento' };
const SERVICIO_TXT = { TRANSFERENCIAS: 'Transferencias', PAGO_SERVICIOS: 'Pago de servicios', RECARGA_CELULAR: 'Recarga de celular', RECARGA_TRANSPORTE: 'Recarga de transporte' };
const CANAL_TXT = { MOBILE: 'app', WEB: 'web', API: 'API' };
async function avisarPrealerta(env, request, yo) {
  const b = await leerCuerpo(request);
  const comentario = opcional(b.comentario, 1000);
  const t = (v) => (v == null ? '' : String(v).slice(0, 60));
  const p = await env.DB.prepare(`SELECT tipo_prealerta, metrica, cliente_id, servicio_id, canal_id FROM prealertas_estado
      WHERE activa = 1 AND tipo_prealerta = ?1 AND ambiente = ?2 AND cliente_id = ?3 AND servicio_id = ?4 AND producto_id = ?5 AND canal_id = ?6 AND moneda_id = ?7 LIMIT 1`)
    .bind(t(b.tipo_prealerta), t(b.ambiente), t(b.cliente_id), t(b.servicio_id), t(b.producto_id), t(b.canal_id), t(b.moneda_id)).first();
  if (!p) return jsonError('Esa pre-alerta ya no está activa. Actualizá la página.', 409);
  const usuario = b.usuario_id == null || b.usuario_id === '' ? null : aId(b.usuario_id);
  const equipo = b.equipo_id == null || b.equipo_id === '' ? null : aId(b.equipo_id);
  if (!usuario && !equipo) return jsonError('Elegí a quién avisarle: una persona, un equipo o los dos.', 400);
  let eqNombre = null;
  if (equipo) {
    const e = await env.DB.prepare('SELECT nombre FROM equipos WHERE id = ?1 AND activo = 1').bind(equipo).first();
    if (!e) return jsonError('El equipo no existe o está inactivo.', 400);
    eqNombre = e.nombre;
  }
  if (usuario) {
    const u = await env.DB.prepare('SELECT perfil FROM usuarios WHERE id = ?1 AND activo = 1').bind(usuario).first();
    if (!u || !PERFILES_RECIBEN.includes(u.perfil)) return jsonError('Esa persona no puede recibir avisos de alertas: solo personas de Soporte.', 400);
    if (equipo && !(await env.DB.prepare('SELECT 1 FROM equipo_miembros WHERE equipo_id = ?1 AND usuario_id = ?2').bind(equipo, usuario).first())) {
      return jsonError('Esa persona no es parte del equipo elegido.', 400);
    }
  }
  const ids = (usuario ? [usuario] : await miembrosActivos(env, equipo)).filter((x) => x !== yo.id);
  if (!ids.length) return jsonError('Ese equipo no tiene miembros activos para avisarles.', 400);
  const que = (PREALERTA_FRASE[p.metrica] || 'una métrica viene empeorando') + ' en ' + p.cliente_id + ', ' +
    (SERVICIO_TXT[p.servicio_id] || p.servicio_id) + ' por ' + (CANAL_TXT[p.canal_id] || p.canal_id);
  const texto = yo.nombre + (usuario ? ' te avisó' : ' le avisó a tu equipo ' + eqNombre) + ' de una pre-alerta: ' + que;
  await env.DB.batch(avisoStmts(env, ids, 'PREALERTA', null, texto, comentario).concat([
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
      .bind(yo.id, 'AVISAR_PREALERTA', p.tipo_prealerta + ' ' + p.cliente_id + ' ' + p.servicio_id + ' ' + p.canal_id + ' → ' + (eqNombre ? 'equipo ' + eqNombre : 'usuario ' + usuario)),
  ]));
  return okJson({ avisados: ids.length });
}
"""

HISTORIAL_SOPORTE = """  if (x[2] === 'historial') {
    if (m !== 'GET') return null;
    // Soporte solo ve el historial de lo que tiene o tuvo asignado (él o sus equipos) o en lo que intervino
    if (!puede(yo, 'tablero')) {
      const ok = await env.DB.prepare(`SELECT 1 FROM alertas_historico h WHERE h.alerta_id = ?1
          AND (h.asignado_usuario_id = ?2
               OR h.asignado_equipo_id IN (SELECT equipo_id FROM equipo_miembros WHERE usuario_id = ?2)
               OR h.asignado_equipo_id IN (SELECT id FROM equipos WHERE responsable_id = ?2)
               OR EXISTS (SELECT 1 FROM alerta_eventos e WHERE e.alerta_id = h.alerta_id AND e.usuario_id = ?2))`).bind(x[1], yo.id).first();
      if (!ok) return jsonError('Esa alerta no está asignada a vos ni a tu equipo.', 403);
    }
"""


def servidor(s):
    i = s.index('const PERMISOS = {'); j = s.index('};', i) + 2
    s = s[:i] + PERMISOS + s[j:]
    s = _rep(s, "const puede = (u, permiso) => !!u && (PERMISOS[permiso] || []).includes(u.perfil);\n",
             "const puede = (u, permiso) => !!u && (PERMISOS[permiso] || []).includes(u.perfil);\n"
             "// Página de inicio de cada perfil: Administración, Mis alertas o el tablero\n"
             "const inicioDe = (u) => (u.perfil === 'ADMIN' ? '/admin' : u.perfil === 'SOPORTE' ? '/mis-alertas' : '/');\n")
    s = _rep(s, "// Solo estos perfiles reciben alertas (las toman y las resuelven). El analista deriva; el gerente mira.",
             "// Solo Soporte recibe alertas (las toma y las resuelve). El analista deriva; el gerente y el administrador miran.")
    s = _rep(s, """const SQL_PERFILES_RECIBEN = "perfil IN ('ADMIN', 'SOPORTE')";""", """const SQL_PERFILES_RECIBEN = "perfil = 'SOPORTE'";""")
    s = _rep(s, "permisos: Object.keys(PERMISOS).filter((p) => puede(u, p)) }, { headers",
             "permisos: Object.keys(PERMISOS).filter((p) => puede(u, p)), inicio: inicioDe(u) }, { headers")
    s = _rep(s, "solo Soporte o Administrador.'", "solo personas de Soporte.'", 2)
    s = _rep(s, "las personas destino son Soporte o Administrador).", "las personas destino son de Soporte).")
    s = _rep(s, "'Solo un analista, un administrador o el responsable del equipo pueden derivar esta alerta.'",
             "'Solo un analista o el responsable del equipo pueden derivar esta alerta.'")
    s = _rep(s, "const esAnalista = (u) => u.perfil === 'ADMIN' || u.perfil === 'ANALISTA';", "const esAnalista = (u) => u.perfil === 'ANALISTA';")
    s = _rep(s, "const puedeTomar = yo.perfil === 'ADMIN' || esMia ||", "const puedeTomar = esMia ||")
    s = _rep(s, "  if (yo.perfil === 'GERENTE') return jsonError('Tu perfil es de solo lectura.', 403);\n",
             "  if (yo.perfil === 'GERENTE' || yo.perfil === 'ADMIN') return jsonError('Con tu perfil las alertas se ven en modo lectura: las derivan los analistas y las trabaja Soporte.', 403);\n")
    s = _rep(s, """  if (x[2] === 'historial') {
    if (m !== 'GET') return null;
""", HISTORIAL_SOPORTE)
    s = _rep(s, """const r = await env.DB.prepare("SELECT id FROM usuarios WHERE activo = 1 AND perfil IN ('ADMIN', 'ANALISTA')").all();""",
             """const r = await env.DB.prepare("SELECT id FROM usuarios WHERE activo = 1 AND perfil = 'ANALISTA'").all();""")
    s = _rep(s, "  const habilitado = yo.perfil !== 'GERENTE';", "  const habilitado = puede(yo, 'avisos');")
    s = _rep(s, "    return Response.json(await datosMisAlertas(env, yo), { headers: { 'cache-control': 'no-store' } });",
             "    const d = await datosMisAlertas(env, yo);\n"
             "    d.mis_pendientes = await contarMisAlertas(env, yo);   // para tomar o en curso\n"
             "    return Response.json(d, { headers: { 'cache-control': 'no-store' } });")
    # Rutas principales: tablero solo para quien puede verlo; /inicio lleva a la página de cada perfil
    old = """      if (request.method === 'GET' && ruta === '/') {
        return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && ruta === '/api/dashboard') {
"""
    new = """      if (request.method === 'GET' && ruta === '/inicio') {
        const destino = url.searchParams.has('demo') && puede(yo, 'demo') ? '/?demo' : inicioDe(yo);
        return Response.redirect(new URL(destino, request.url).toString(), 302);
      }
      if (request.method === 'GET' && ruta === '/') {
        // Soporte no ve el tablero general (salvo para cambiar la contraseña temporal, que se hace en esta página)
        if (!puede(yo, 'tablero') && !yo.debe_cambiar) return Response.redirect(new URL(inicioDe(yo), request.url).toString(), 302);
        return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (request.method === 'POST' && ruta === '/api/prealertas/avisar') {
        if (!puede(yo, 'avisar_prealerta')) return jsonError('Tu perfil no puede avisar pre-alertas.', 403);
        return await avisarPrealerta(env, request, yo);
      }
      if (request.method === 'GET' && ruta === '/api/dashboard') {
        if (!puede(yo, 'tablero')) return jsonError('Tu perfil trabaja desde "Mis alertas": el tablero general no está disponible.', 403);
"""
    s = _rep(s, old, new)
    k = s.index('export default {')
    s = s[:k] + AVISAR_PREALERTA.strip() + '\n\n' + s[k:]
    return s


# ---------------------------------------------------------------- campanita (las 4 páginas)
NOTIF_JS = r"""  // Avisos del navegador: con la página abierta (aunque esté en otra pestaña o ventana) muestra un aviso del sistema.
  // Se activan desde la campanita y se recuerdan en este navegador. Con el navegador cerrado no llegan.
  var NOTIF_OK = 'Notification' in window;
  var TITULO_AVISO = { ASIGNADA: 'Te asignaron una alerta', COMENTARIO: 'Comentaron una alerta', DEVUELTA: 'Devolvieron una alerta',
    RESUELTA: 'Se resolvió una alerta', GRAVE_SIN_ASIGNAR: 'Alerta grave sin asignar', PREALERTA: 'Pre-alerta' };
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function notifActivas() { return NOTIF_OK && Notification.permission === 'granted' && leer('helios_notif') === '1'; }
  function destinoDe(a) { return A_MIS[a.tipo] ? (a.tipo === 'DEVUELTA' && bandeja === '/mis-alertas' ? '/' : bandeja) : '/'; }
  function pintarNotif() {
    var c = el('avisos-notif'); if (!c) return;
    if (!NOTIF_OK) { c.hidden = true; return; }
    c.hidden = false;
    if (Notification.permission === 'denied') {
      c.innerHTML = '<span>Los avisos del navegador están bloqueados para este sitio. Para recibirlos, habilitalos desde el candado de la barra de direcciones.</span>';
      return;
    }
    c.innerHTML = notifActivas()
      ? '<span>Avisos del navegador: <b>activados</b></span><button type="button" data-notif="0">Desactivar</button>'
      : '<span>Recibí un aviso del navegador cuando te llegue algo nuevo, aunque estés en otra pestaña.</span><button type="button" data-notif="1">Activar</button>';
  }
  function notificar(desde) {
    if (!notifActivas()) return;
    desde = Math.max(desde || 0, Number(leer('helios_notif_ultimo')) || 0);   // otra pestaña ya pudo haberlo mostrado
    pedir('/api/avisos').then(function (r) {
      var nuevos = r.avisos.filter(function (a) { return !a.leido && a.id > desde; });
      if (!nuevos.length) return;
      guardar('helios_notif_ultimo', String(nuevos[0].id));
      nuevos.slice(0, 3).forEach(function (a) {
        var alerta = a.tipo_alerta ? (a.regla_nombre || FRASE[a.tipo_alerta] || a.tipo_alerta) + ' · ' + a.cliente_id + ', ' + (SERV[a.servicio_id] || a.servicio_id) + ' por ' + (CAN[a.canal_id] || a.canal_id) : '';
        try {
          var n = new Notification('Helios · ' + (TITULO_AVISO[a.tipo] || 'Aviso nuevo'), { body: a.texto + (alerta ? '\n' + alerta : '') + (a.detalle ? '\n“' + a.detalle + '”' : ''), tag: 'helios-aviso-' + a.id });
          n.onclick = function () { window.focus(); n.close(); location.href = destinoDe(a); };
        } catch (e) { /* algunos celulares no permiten avisos sin instalar el sitio */ }
      });
    }).catch(function () {});
  }
  el('panel-avisos').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-notif]'); if (!b) return;
    if (b.getAttribute('data-notif') === '0') { guardar('helios_notif', '0'); pintarNotif(); return; }
    var listo = function (p) {
      if (p === 'granted') {
        guardar('helios_notif', '1'); guardar('helios_notif_ultimo', String(ultimo || 0));
        try { new Notification('Helios', { body: 'Listo: te vamos a avisar por acá cuando tengas algo nuevo.' }); } catch (e) {}
      }
      pintarNotif();
    };
    var pr = Notification.requestPermission(listo);
    if (pr && pr.then) pr.then(listo);
  });
  contar();
  // Con los avisos del navegador activados consulta también con la pestaña en segundo plano
  setInterval(function () { if (!document.hidden || notifActivas()) contar(); }, CADA_MS);"""

NOTIF_CSS = """.lista-avisos .PREALERTA .punto-aviso { background: var(--pre); }
.lista-avisos q { quotes: none; }   /* las comillas ya van en el texto (antes salían dobles) */
.avisos-notif { display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid var(--line); background: var(--track); font-size: 12.5px; line-height: 1.35; color: var(--ink-2); }
.avisos-notif[hidden] { display: none; }
.avisos-notif button { flex: none; border: 0; border-radius: 3px; padding: 3px 10px; font: inherit; font-weight: 600; cursor: pointer; background: var(--accent); color: var(--sobre-accent); }
.avisos-notif button[data-notif="0"] { background: var(--btn-bg); color: var(--btn-ink); }"""


def campanita(h):
    h = _rep(h, '.lista-avisos .GRAVE_SIN_ASIGNAR .punto-aviso { background: var(--critica); }',
             '.lista-avisos .GRAVE_SIN_ASIGNAR .punto-aviso { background: var(--critica); }\n' + NOTIF_CSS)
    h = _rep(h, 'id="avisos-todos">Marcar todo como leído</button></div>',
             'id="avisos-todos">Marcar todo como leído</button></div>\n        <div class="avisos-notif" id="avisos-notif" hidden></div>')
    h = _rep(h, '// Campanita: consulta solo el contador cada 2 minutos (con la pestaña visible) y la lista al abrirla',
             '// Campanita: consulta solo el contador cada 2 minutos (con la pestaña visible, o siempre si están activados los avisos del navegador) y la lista al abrirla')
    h = _rep(h, 'var A_MIS = { ASIGNADA: 1, COMENTARIO: 1, RESUELTA: 1, DEVUELTA: 1 };', 'var A_MIS = { ASIGNADA: 1, COMENTARIO: 1, RESUELTA: 1, DEVUELTA: 1, PREALERTA: 1 };')
    old = "      if (ultimo != null && r.ultimo_id != null && r.ultimo_id > ultimo) aviso(r.no_leidos === 1 ? 'Tenés un aviso nuevo.' : 'Tenés ' + r.no_leidos + ' avisos sin leer.');\n"
    h = _rep(h, old, "      if (ultimo != null && r.ultimo_id != null && r.ultimo_id > ultimo) { aviso(r.no_leidos === 1 ? 'Tenés un aviso nuevo.' : 'Tenés ' + r.no_leidos + ' avisos sin leer.'); notificar(ultimo); }\n")
    h = _rep(h, "      el('campana').hidden = false;\n", "      el('campana').hidden = false; pintarNotif();\n")
    h = _rep(h, "  contar();\n  setInterval(function () { if (!document.hidden) contar(); }, CADA_MS);", NOTIF_JS)
    return h


# ---------------------------------------------------------------- tablero
PANORAMA_CSS = """/* Panorama: cómo está ahora cada servicio de cada cliente */
.panorama { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.pano-cli { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--ok); border-radius: 4px; padding: 10px 12px 6px; box-shadow: var(--shadow); }
.pano-cli.st-CRITICA { border-left-color: var(--critica); }
.pano-cli.st-ALTA { border-left-color: var(--alta); }
.pano-cli.st-MEDIA { border-left-color: var(--media); }
.pano-cli.st-PRE { border-left-color: var(--pre); }
.pano-cli.st-SD, .pano-cli.st-NUEVO { border-left-color: var(--track); }
.pano-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.pano-cab b { font-size: 15px; }
.pano-cab small { color: var(--ink-3); font-size: 12px; margin-left: 6px; }
.pano-est { display: inline-block; border-radius: 3px; padding: 0 5px; font-size: 11px; font-weight: 700; line-height: 17px; text-transform: uppercase; letter-spacing: .01em; white-space: nowrap; background: var(--ok-bg); color: var(--ok-txt); }
.pano-est.st-CRITICA { background: var(--critica-bg); color: var(--critica-txt); }
.pano-est.st-ALTA { background: var(--alta-bg); color: var(--alta-txt); }
.pano-est.st-MEDIA { background: var(--media-bg); color: var(--media-txt); }
.pano-est.st-PRE { background: var(--pre-bg); color: var(--pre-txt); }
.pano-est.st-SD, .pano-est.st-NUEVO { background: var(--baja-bg); color: var(--baja-txt); }
.pano-cli ul { list-style: none; margin: 0; padding: 0; }
.pano-cli li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 5px 0; font-size: 13px; border-top: 1px solid var(--line); }
.pano-cli li:first-child { border-top: 0; }
.pano-punto { width: 10px; height: 10px; border-radius: 50%; background: var(--ok-suave); }
.pano-cli li.st-CRITICA .pano-punto { background: var(--critica); }
.pano-cli li.st-ALTA .pano-punto { background: var(--alta); }
.pano-cli li.st-MEDIA .pano-punto { background: var(--media); }
.pano-cli li.st-PRE .pano-punto { background: var(--pre); }
.pano-cli li.st-SD .pano-punto, .pano-cli li.st-NUEVO .pano-punto { background: var(--track); }
.pano-srv { overflow-wrap: anywhere; }
.pano-det { color: var(--ink-2); font-size: 12.5px; line-height: 1.3; text-align: right; max-width: 160px; }
.pano-cli li.st-CRITICA .pano-det { color: var(--critica-txt); font-weight: 600; }
.pano-cli li.st-ALTA .pano-det { color: var(--alta-txt); font-weight: 600; }
.pano-cli li.st-MEDIA .pano-det { color: var(--media-txt); }
.pano-cli li.st-PRE .pano-det { color: var(--pre-txt); }
.acc-pre { display: flex; justify-content: flex-end; margin-top: 10px; }
#h-lista q { quotes: none; }
"""

PANORAMA_HTML = """  <section class="bloque" id="bloque-panorama">
    <h2>Estado por cliente</h2>
    <p class="bajada">Cómo está ahora cada servicio de cada cliente.</p>
    <div class="panorama" id="panorama"></div>
    <div class="leyenda">
      <span><i style="background:var(--ok-suave)"></i>Bien</span>
      <span><i style="background:var(--pre)"></i>Viene empeorando</span>
      <span><i style="background:var(--media)"></i>Problema leve</span>
      <span><i style="background:var(--alta)"></i>Importante</span>
      <span><i style="background:var(--critica)"></i>Grave</span>
      <span><i style="background:var(--track)"></i>Sin datos o sin historia</span>
    </div>
  </section>

"""

PANORAMA_JS = r"""  // ---- Panorama: cómo está ahora cada servicio de cada cliente ----
  var PANO_TXT = { CRITICA: 'Grave', ALTA: 'Importante', MEDIA: 'Leve', PRE: 'Viene empeorando', SD: 'Sin datos', NUEVO: 'Sin historia', OK: 'Bien' };
  var PANO_N = { CRITICA: 1, ALTA: 2, MEDIA: 3, PRE: 4, SD: 5, NUEVO: 6, OK: 7 };
  function pintarPanorama(d) {
    var series = {}, ahora = ahoraMs(d), gracia = ((d.parametros || {}).gracia_minutos || 5) * 60e3;
    function serie(r) { var k = clave(r); return series[k] || (series[k] = { r: r, st: 'OK', txt: [], visto: {}, ultima: null }); }
    function peor(x, st) { if (PANO_N[st] < PANO_N[x.st]) x.st = st; }
    (d.series || []).forEach(function (s) { serie(s).ultima = s.ultima_ventana_fin; });
    (d.abiertas || []).forEach(function (a) {
      var x = serie(a);
      if (a.severidad === 'BAJA') { peor(x, 'NUEVO'); return; }
      peor(x, a.severidad);
      if (!x.visto[a.tipo_alerta]) { x.visto[a.tipo_alerta] = 1; x.txt.push(CORTA[a.tipo_alerta] || frase(a.tipo_alerta, a).toLowerCase()); }
    });
    (d.prealertas || []).forEach(function (p) {
      if (p.activa !== 1) return;
      var x = serie(p); peor(x, 'PRE');
      if (x.st === 'PRE') x.txt.push((TENDENCIA[p.metrica] || 'viene empeorando').toLowerCase());
    });
    var cli = {};
    Object.keys(series).forEach(function (k) {
      var x = series[k];
      // Sin alertas pero sin datos recientes (más de media hora después de la gracia)
      if ((x.st === 'OK' || x.st === 'NUEVO') && x.ultima && ahora - aFecha(x.ultima).getTime() > gracia + 30 * 60e3) x.st = 'SD';
      var c = cli[x.r.cliente_id] || (cli[x.r.cliente_id] = { id: x.r.cliente_id, st: 'OK', s: [], mal: 0 });
      c.s.push(x); if (PANO_N[x.st] < PANO_N[c.st]) c.st = x.st;
      if (PANO_N[x.st] <= 3) c.mal++;
    });
    var ids = Object.keys(cli).sort();
    $('panorama').innerHTML = ids.length ? ids.map(function (id) {
      var c = cli[id];
      c.s.sort(function (a, b) { return servicio(a.r) < servicio(b.r) ? -1 : 1; });
      var sub = c.mal ? c.mal + ' de ' + c.s.length + ' con problemas' : c.s.length === 1 ? '1 servicio' : c.s.length + ' servicios';
      return '<div class="pano-cli st-' + c.st + '"><div class="pano-cab"><span><b>' + esc(id) + '</b><small>' + esc(sub) + '</small></span>' +
        '<span class="pano-est st-' + c.st + '">' + esc(PANO_TXT[c.st]) + '</span></div><ul>' +
        c.s.map(function (x) {
          var det = x.st === 'OK' ? 'Bien' : x.st === 'SD' ? 'Sin datos desde las ' + hora(x.ultima) : x.st === 'NUEVO' ? 'Sin historia para comparar'
            : x.txt.join(', ').replace(/^./, function (l) { return l.toUpperCase(); });
          var nom = (SERVICIO[x.r.servicio_id] || x.r.servicio_id) + ' · ' + (CANAL[x.r.canal_id] || x.r.canal_id);
          return '<li class="st-' + x.st + '" title="' + esc(nom + ': ' + det) + '"><span class="pano-punto"></span><span class="pano-srv">' + esc(nom) + '</span><span class="pano-det">' + esc(det) + '</span></li>';
        }).join('') + '</ul></div>';
    }).join('') : '<div class="panel vacio" style="grid-column:1/-1">Todavía no llegaron datos de ningún cliente.</div>';
  }

  // ---- Avisar a Soporte de una pre-alerta (analista) ----
  var prealertasActivas = [], preActual = null;
  function pintarPersonasPre() {
    var eq = $('p-equipo').value ? Number($('p-equipo').value) : null, ps = personasDe(eq);
    $('p-persona').innerHTML = (eq ? '<option value="">Todo el equipo</option>' : '<option value="">Elegí una persona</option>') +
      ps.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nombre) + '</option>'; }).join('');
  }
  function abrirAvisarPre(p) {
    preActual = p;
    var cargarA = asignablesCache ? Promise.resolve() : pedir('/api/asignables').then(function (r) { asignablesCache = r; });
    cargarA.then(function () {
      $('f-avisar').reset(); $('p-error').hidden = true;
      $('p-alerta').textContent = (TENDENCIA[p.metrica] || p.tipo_prealerta) + ' · ' + p.cliente_id + ', ' + servicio(p) + '. Podría pasar en unos ' + p.minutos_estimados + ' minutos.';
      $('p-equipo').innerHTML = '<option value="">Sin equipo</option>' + asignablesCache.equipos.map(function (e) { return '<option value="' + e.id + '">' + esc(e.nombre) + '</option>'; }).join('');
      pintarPersonasPre();
      $('dlg-avisar').showModal();
    }).catch(function (e) { toast(e.message, true); });
  }
  $('p-equipo').addEventListener('change', pintarPersonasPre);
  $('f-avisar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var eq = $('p-equipo').value ? Number($('p-equipo').value) : null, pe = $('p-persona').value ? Number($('p-persona').value) : null;
    var err = $('p-error');
    if (!eq && !pe) { err.textContent = 'Elegí un equipo, una persona o los dos.'; err.hidden = false; return; }
    var b = $('p-guardar'), p = preActual; b.disabled = true;
    pedir('/api/prealertas/avisar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      tipo_prealerta: p.tipo_prealerta, ambiente: p.ambiente, cliente_id: p.cliente_id, servicio_id: p.servicio_id, producto_id: p.producto_id,
      canal_id: p.canal_id, moneda_id: p.moneda_id, equipo_id: eq, usuario_id: pe, comentario: $('p-texto').value.trim() || null }) })
      .then(function (r) { $('dlg-avisar').close(); toast(r.avisados === 1 ? 'Aviso enviado: le llega en la campanita.' : 'Aviso enviado a ' + r.avisados + ' personas.'); })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; }).then(function () { b.disabled = false; });
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-avisar-pre]'); if (!b) return;
    var p = prealertasActivas[Number(b.getAttribute('data-avisar-pre'))]; if (p) abrirAvisarPre(p);
  });

"""

DLG_AVISAR = """<dialog class="dlg" id="dlg-avisar">
  <form id="f-avisar" method="dialog">
    <h2>Avisar de una pre-alerta</h2>
    <p class="sub-dlg" id="p-alerta"></p>
    <label class="campo">Equipo<select id="p-equipo"></select></label>
    <label class="campo">Persona<select id="p-persona"></select><small class="ayuda">Le llega un aviso en la campanita. La pre-alerta no se convierte en alerta.</small></label>
    <label class="campo">Comentario <small style="font-weight:400;color:var(--ink-3)">(opcional)</small><textarea id="p-texto" maxlength="1000" placeholder="Ej.: miren el conector de pagos antes de que salte la alerta"></textarea></label>
    <p class="error-form" id="p-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="p-guardar">Avisar</button></div>
  </form>
</dialog>
"""


def tablero(h):
    h = campanita(h)
    h = _rep(h, '.toast {', PANORAMA_CSS + '.toast {')
    h = _rep(h, '  <section class="bloque">\n    <h2>Últimas 24 horas</h2>', PANORAMA_HTML + '  <section class="bloque">\n    <h2>Últimas 24 horas</h2>')
    h = _rep(h, '<div class="dos bloque apilado" style="margin-top:34px">', '<div class="dos bloque apilado" id="bloque-alertas" style="margin-top:34px">')
    h = _rep(h, '<dialog class="dlg" id="dlg-resolver">', DLG_AVISAR + '<dialog class="dlg" id="dlg-resolver">')
    h = _rep(h, '  // ---- Asignación de alertas ----\n', '  // ---- Asignación de alertas ----\n', 1)
    # El panorama va después de que existan personasDe y asignablesCache: lo insertamos antes de "Umbrales del cliente"
    h = _rep(h, '  // ---- Umbrales del cliente (criticidad y objetivo): el más específico gana ----\n',
             PANORAMA_JS + '  // ---- Umbrales del cliente (criticidad y objetivo): el más específico gana ----\n')
    h = _rep(h, "    $('pronosticos').innerHTML = activas.length ? activas.map(function (r) {",
             "    prealertasActivas = activas;\n    $('pronosticos').innerHTML = activas.length ? activas.map(function (r, idx) {")
    h = _rep(h, """'<div class="extremos"><span>normal</span><span>' + pct + ' % del camino</span><span>alerta</span></div></div></div>';""",
             """'<div class="extremos"><span>normal</span><span>' + pct + ' % del camino</span><span>alerta</span></div></div>' +
        (puedo('avisar_prealerta') ? '<div class="acc-pre"><button class="btn chico" data-avisar-pre="' + idx + '">Avisar a Soporte</button></div>' : '') + '</div>';""")
    h = _rep(h, "    pintarPortada(d, casos, activas);\n", "    pintarPortada(d, casos, activas);\n    pintarPanorama(d);\n")
    # Sesión: qué secciones ve cada perfil y a dónde va quien no puede ver el tablero
    h = _rep(h, "  var yo = null, permisos = [];\n", "  var yo = null, permisos = [], inicio = '/';\n")
    h = _rep(h, "  function arrancarDatos() {\n", "  function arrancarDatos() {\n    if (!puedo('tablero')) { location.href = inicio; return; }   // Soporte: después de cambiar la contraseña va a Mis alertas\n")
    h = _rep(h, "    $('lnk-seg2').hidden = !puedo('seguimiento');\n",
             "    $('lnk-seg2').hidden = !puedo('seguimiento');\n"
             "    inicio = r.inicio || '/';\n"
             "    // El gerente ve el panorama, las 24 h y el histórico: la lista de alertas y pre-alertas es para quien las trabaja\n"
             "    if (!puedo('alertas_abiertas')) $('bloque-alertas').style.display = 'none';\n")
    return h


def mis_alertas(h):
    h = campanita(h)
    h = _rep(h, '<a class="marca" href="/">', '<a class="marca" href="/" id="lnk-marca">')
    h = _rep(h, '<a class="btn" href="/">← Tablero</a>', '<a class="btn" href="/" id="btn-tablero">← Tablero</a>')
    h = _rep(h, '<a role="menuitem" href="/">Tablero</a>', '<a role="menuitem" href="/" id="lnk-tablero">Tablero</a>')
    h = _rep(h, "    $('lnk-seg').hidden = !puedo('seguimiento');\n",
             "    $('lnk-seg').hidden = !puedo('seguimiento');\n"
             "    // Soporte no ve el tablero general: su página es esta\n"
             "    if (!puedo('tablero')) { $('btn-tablero').style.display = 'none'; $('lnk-tablero').hidden = true; $('lnk-marca').setAttribute('href', '/mis-alertas'); }\n")
    return h


def admin(h):
    h = campanita(h)
    h = _rep(h, '<option value="SOPORTE">Soporte: resuelve las alertas que le asignan</option>',
             '<option value="SOPORTE">Soporte: trabaja solo las alertas que le asignan</option>')
    h = _rep(h, '<option value="ANALISTA">Analista: revisa, deriva y arma reglas</option>',
             '<option value="ANALISTA">Analista: revisa el tablero, deriva y arma reglas de derivación</option>')
    h = _rep(h, '<option value="GERENTE">Gerente: ve todo, sin acciones</option>',
             '<option value="GERENTE">Gerente: ve el estado de los clientes, sin acciones</option>')
    h = _rep(h, '<option value="ADMIN">Administrador: todo, incluido usuarios y equipos</option>',
             '<option value="ADMIN">Administrador: usuarios, equipos, reglas y umbrales (las alertas, solo lectura)</option>')
    h = _rep(h, "'Como ' + (PERFIL_TXT[yo.perfil] || yo.perfil).toLowerCase() + ' podés gestionar las reglas de alerta, la derivación automática y ver el estado del modelo.'",
             "'Como ' + (PERFIL_TXT[yo.perfil] || yo.perfil).toLowerCase() + ' podés gestionar la derivación automática y ver el estado del modelo.'")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    s = _html(s, 'SEGUIMIENTO_HTML', campanita)
    s = _html(s, 'ADMIN_HTML', admin)
    s = _html(s, 'LOGIN_HTML', lambda h: _rep(h, "location.href = '/' + location.search;", "location.href = '/inicio' + location.search;"))
    return s
