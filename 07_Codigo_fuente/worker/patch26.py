# Parche 26: avisos push e instalar Helios como app.
#
#   - Los avisos de la campanita llegan al celular o a la PC aunque Helios esté cerrado (Web Push:
#     Android y PC con Chrome, Edge o Firefox; iPhone con Helios agregado a la pantalla de inicio).
#   - Logo nuevo: el caballo de ajedrez del logo "Helios System" (iconos.py) en los íconos y en la barra superior.
#   - Helios se puede instalar ("Agregar a pantalla de inicio" / "Instalar"): manifiesto, íconos y
#     service worker (/sw.js) públicos.
#   - Tabla nueva suscripciones_push (script 10). Secreto nuevo del Worker: VAPID_JWK (ver
#     generar_clave_push.mjs). Sin el secreto todo sigue como antes (avisos con la página abierta).
#   - Después de cada pedido POST que crea avisos se envía el push a los dispositivos de esas personas
#     (y también en el cron, si se vuelve a prender). El contenido va cifrado (RFC 8291).
import base64, json, os

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


MANIFIESTO = {
    'name': 'Helios · Monitoreo de alertas', 'short_name': 'Helios', 'lang': 'es-AR', 'dir': 'ltr',
    'description': 'Alertas de la operación: tablero, Mis alertas y avisos.',
    'start_url': '/inicio', 'scope': '/', 'display': 'standalone',
    'background_color': '#0F766E', 'theme_color': '#0F766E',
    'icons': [
        {'src': '/icono-192.png', 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/icono-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
        {'src': '/icono-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
    ],
}

CABEZA = ('<meta name="viewport" content="width=device-width, initial-scale=1">\n'
          '<meta name="theme-color" content="#0F766E">\n'
          '<meta name="apple-mobile-web-app-title" content="Helios">\n'
          '<meta name="apple-mobile-web-app-capable" content="yes">\n'
          '<link rel="manifest" href="/manifest.webmanifest">\n'
          '<link rel="icon" type="image/png" href="/icono-192.png">\n'
          '<link rel="apple-touch-icon" href="/apple-touch-icon.png">')


def servidor(s):
    iconos = {}
    for n in ['icono-192', 'icono-512', 'apple-touch-icon', 'icono-insignia']:
        iconos[n] = base64.b64encode(open(os.path.join(AQUI, 'iconos', n + '.png'), 'rb').read()).decode()
    constantes = ('// Instalar Helios como app (parche 26): manifiesto, service worker e íconos (PNG en base64, generados con iconos.py)\n'
                  'const MANIFIESTO = ' + json.dumps(json.dumps(MANIFIESTO, ensure_ascii=False), ensure_ascii=False) + ';\n'
                  'const SW_JS = ' + json.dumps(_leer('sw.js'), ensure_ascii=False) + ';\n'
                  'const ICONOS_B64 = ' + json.dumps(iconos) + ';\n\n')
    k = s.index('export default {')
    s = s[:k] + constantes + _leer('push_server.js').strip() + '\n\n' + s[k:]

    # Archivos públicos y "dejar de recibir" antes de pedir sesión
    s = _rep(s, "  const u = await usuarioDeSesion(env, request);\n  if (!u) {",
             "  const publico = await archivosPublicos(env, request, ruta);\n  if (publico) return publico;\n\n"
             "  const u = await usuarioDeSesion(env, request);\n  if (!u) {")
    # Rutas con sesión
    s = _rep(s, "      const avisosR = await rutasAvisos(env, request, ruta, yo);\n      if (avisosR) return avisosR;\n",
             "      const avisosR = await rutasAvisos(env, request, ruta, yo);\n      if (avisosR) return avisosR;\n"
             "      // Avisos push en el dispositivo (/api/push/...)\n"
             "      const pushR = await rutasPush(env, request, ruta, yo);\n      if (pushR) return pushR;\n")

    # El fetch de siempre pasa a llamarse "atender"; el nuevo fetch manda los push al terminar
    s = _rep(s, 'export default {', 'const TRABAJADOR = {')
    s = _rep(s, "  async fetch(request, env, ctx) {\n    const url = new URL(request.url);",
             """  // Pedidos web: atiende el pedido y, si creó avisos, los manda como push a los dispositivos suscriptos
  async fetch(request, env, ctx) {
    const desde = request.method === 'POST' ? await ultimoAvisoId(env) : null;
    const respuesta = await TRABAJADOR.atender(request, env, ctx);
    if (desde != null) {
      const envio = enviarPush(env, desde, new URL(request.url).origin).catch((e) => console.error('Push: ' + e.message));
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(envio); else await envio;
    }
    return respuesta;
  },

  async atender(request, env, ctx) {
    const url = new URL(request.url);""")
    s = _rep(s, """      const r = await procesarAlertas(env);
      console.log(`Alertas: ${r.registradas_o_actualizadas}""",
             """      const desde = await ultimoAvisoId(env);
      const r = await procesarAlertas(env);
      if (desde != null) await enviarPush(env, desde, 'https://helios.invalid');
      console.log(`Alertas: ${r.registradas_o_actualizadas}""")
    s = s.rstrip()
    assert s.endswith('};'), s[-80:]
    return s + '\n\nexport default TRABAJADOR;\n'


# ---------------------------------------------------------------- páginas
PUSH_JS = r"""  // Avisos push (parche 26): llegan aunque Helios esté cerrado. Android y PC (Chrome, Edge, Firefox);
  // en iPhone, solo con Helios agregado a la pantalla de inicio. Sin push, quedan los avisos con la página abierta.
  var SW_OK = 'serviceWorker' in navigator && window.isSecureContext;
  var PUSH_OK = SW_OK && 'PushManager' in window;
  var ES_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var INSTALADA = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var pushClave = null, pushSub = null, registroSW = null;
  var pushListo = !PUSH_OK;   // hasta saber si este equipo ya está suscripto no se ofrece "Activar"
  function aBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); var b = atob(s + '==='.slice((s.length + 3) % 4)), k = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) k[i] = b.charCodeAt(i); return k; }
  function pushActivo() { return !!(pushClave && pushSub && NOTIF_OK && Notification.permission === 'granted'); }
  function iniciarPush() {
    if (!SW_OK) return;
    // El service worker se registra siempre: además permite instalar Helios como app
    registroSW = navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; });
    registroSW.catch(function () {});
    if (!PUSH_OK) { pushListo = true; return; }
    pedir('/api/push/clave').then(function (r) {
      pushClave = r.clave;
      if (!pushClave) return;
      return registroSW.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          // Suscripción hecha con otra clave del servidor (se cambió VAPID_JWK): ya no sirve, se rehace
          if (sub && !mismaClave(sub)) return sub.unsubscribe().catch(function () {}).then(function () { return null; });
          return sub;
        }).then(function (sub) {
          if (sub) { pushSub = sub; return sincronizar(sub); }
          // Ya había permiso pero el navegador perdió la suscripción (por ejemplo, porque borra los datos del sitio
          // al cerrarse, o porque se cerró sesión): se rehace sola, salvo que la persona haya tocado "Desactivar"
          if (NOTIF_OK && Notification.permission === 'granted' && leer('helios_push_apagado') !== '1') return suscribir(reg, false);
        });
      });
    }).catch(function () {}).then(function () { pushListo = true; pintarNotif(); });
  }
  function mismaClave(sub) {
    try {
      var k = sub.options && sub.options.applicationServerKey; if (!k) return true;
      var a = new Uint8Array(k), b = aBytes(pushClave);
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    } catch (e) { return true; }
  }
  // Le recuerda al servidor este dispositivo (una vez por día alcanza; al cambiar de persona la suscripción es otra)
  function sincronizar(sub, forzar) {
    var marca = sub.endpoint.slice(-24) + '|' + new Date().toISOString().slice(0, 10);
    if (!forzar && leer('helios_push_sync') === marca) return Promise.resolve();
    return fetch('/api/push/suscribir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ suscripcion: sub.toJSON() }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || 'Error ' + r.status); guardar('helios_push_sync', marca); }); });
  }
  function suscribir(reg, conPrueba) {
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(pushClave) }).then(function (sub) {
      return sincronizar(sub, true).catch(function (e) { sub.unsubscribe(); throw e; }).then(function () {
        pushSub = sub; guardar('helios_push_apagado', '0');
        if (conPrueba) return reg.showNotification('Helios', { body: 'Listo: te vamos a avisar en este dispositivo aunque cierres Helios.', icon: '/icono-192.png', badge: '/icono-insignia.png', tag: 'helios-prueba' });
      });
    });
  }
  function activarPush() {
    var pr = Notification.requestPermission();
    return (pr && pr.then ? pr : Promise.resolve(Notification.permission)).then(function (p) {
      if (p !== 'granted') return;
      return registroSW.then(function (reg) { return suscribir(reg, true); });
    }).catch(function (e) { aviso('No se pudieron activar los avisos: ' + e.message); });
  }
  function desactivarPush() {
    guardar('helios_push_apagado', '1');
    var sub = pushSub; pushSub = null;
    if (!sub) return Promise.resolve();
    return fetch('/api/push/desuscribir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
      .catch(function () {}).then(function () { return sub.unsubscribe(); }).catch(function () {});
  }
  // Al cerrar sesión, este dispositivo deja de recibir los avisos de esta persona
  document.addEventListener('click', function (ev) {
    if (!pushSub || !ev.target.closest || !ev.target.closest('#btn-salir')) return;
    var sub = pushSub; pushSub = null;
    fetch('/api/push/desuscribir', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(function () {});
    sub.unsubscribe().catch(function () {});
  }, true);
"""

PINTAR_VIEJO = """  function pintarNotif() {
    var c = el('avisos-notif'); if (!c) return;
    if (!NOTIF_OK) { c.hidden = true; return; }
    c.hidden = false;"""
PINTAR_NUEVO = """  function pintarNotif() {
    var c = el('avisos-notif'); if (!c) return;
    if (!pushListo) { c.hidden = false; c.innerHTML = '<span>Revisando los avisos de este equipo…</span>'; return; }
    if (pushActivo()) {
      c.hidden = false;
      c.innerHTML = '<span>Avisos en este dispositivo: <b>activados</b>. Te llegan aunque cierres Helios.</span><button type="button" data-notif="0">Desactivar</button>';
      return;
    }
    if (pushClave && NOTIF_OK && Notification.permission !== 'denied') {
      c.hidden = false;
      c.innerHTML = '<span>Recibí un aviso en este ' + (/Android|iPhone|iPad/.test(navigator.userAgent) ? 'celular' : 'equipo') + ' cuando te llegue algo nuevo, aunque Helios esté cerrado.</span><button type="button" data-notif="1">Activar</button>';
      return;
    }
    if (ES_IOS && !INSTALADA) {
      c.hidden = false;
      c.innerHTML = '<span>Para recibir avisos en el iPhone: tocá <b>Compartir</b> → <b>Agregar a inicio</b>, abrí Helios desde ese ícono y activalos acá.</span>';
      return;
    }
    if (!NOTIF_OK) { c.hidden = true; return; }
    c.hidden = false;"""


# Logo de la barra superior: el caballo (icono-insignia.png como máscara) sobre el color principal del tema
MARCA_CSS = """<style>
/* Logo Helios (parche 26): caballo de ajedrez */
.logo, .barra .logo { width: 28px; height: 28px; border-radius: 6px; background: var(--accent); position: relative; flex: none; display: inline-block; }
.logo::after, .barra .logo::after { content: ""; position: absolute; inset: 3px; border: 0; border-radius: 0; background: var(--sobre-accent);
  -webkit-mask: url(/icono-insignia.png) center / contain no-repeat; mask: url(/icono-insignia.png) center / contain no-repeat; }
</style>
</head>"""


def marca(h):
    h = _rep(h, '<meta name="viewport" content="width=device-width, initial-scale=1">', CABEZA)
    return _rep(h, '</head>', MARCA_CSS)


def campanita(h):
    h = marca(h)
    # Con push activo no se repiten los avisos de la página abierta (nivel 1)
    h = _rep(h, "  function notifActivas() { return NOTIF_OK && Notification.permission === 'granted' && leer('helios_notif') === '1'; }",
             "  function notifActivas() { return !pushActivo() && NOTIF_OK && Notification.permission === 'granted' && leer('helios_notif') === '1'; }")
    h = _rep(h, "  var TITULO_AVISO = {", PUSH_JS + "  var TITULO_AVISO = {")
    h = _rep(h, PINTAR_VIEJO, PINTAR_NUEVO)
    h = _rep(h, """    var b = ev.target.closest('button[data-notif]'); if (!b) return;
    if (b.getAttribute('data-notif') === '0') { guardar('helios_notif', '0'); pintarNotif(); return; }""",
             """    var b = ev.target.closest('button[data-notif]'); if (!b) return;
    if (pushClave && PUSH_OK) {
      b.disabled = true;
      (b.getAttribute('data-notif') === '0' ? desactivarPush() : activarPush()).then(pintarNotif);
      return;
    }
    if (b.getAttribute('data-notif') === '0') { guardar('helios_notif', '0'); pintarNotif(); return; }""")
    h = _rep(h, "  contar();\n  // Con los avisos del navegador activados", "  iniciarPush();\n  contar();\n  // Con los avisos del navegador activados")
    return h


def login(h):
    h = marca(h)
    h = _rep(h, '<div class="marca"><b>Helios</b>', '<div class="marca"><span class="logo" aria-hidden="true"></span><b>Helios</b>')
    return _rep(h, MARCA_CSS, MARCA_CSS.replace('</style>', '.caja .marca { align-items: center; }\n</style>'))


def aplicar(s):
    s = servidor(s)
    for n in ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML']:
        s = _html(s, n, campanita)
    s = _html(s, 'LOGIN_HTML', login)
    return s
