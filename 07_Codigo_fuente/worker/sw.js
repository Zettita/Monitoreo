// Service worker de Helios (parche 26): el navegador lo mantiene aunque la página esté cerrada.
// Recibe los avisos push (ya vienen con el texto, cifrados) y los muestra como avisos del sistema.
// Al tocar un aviso abre Helios en la página que corresponde (o reusa una ventana abierta).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  var avisos = d.avisos && d.avisos.length ? d.avisos : [{ titulo: 'Helios', cuerpo: 'Tenés avisos nuevos.', url: '/inicio', tag: 'helios' }];
  e.waitUntil(Promise.all(avisos.map(function (a) {
    return self.registration.showNotification(a.titulo || 'Helios', {
      body: a.cuerpo || '', tag: a.tag || 'helios', data: { url: a.url || '/inicio' },
      icon: '/icono-192.png', badge: '/icono-insignia.png', lang: 'es-AR',
    });
  })));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || '/inicio', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ventanas) {
    for (var i = 0; i < ventanas.length; i++) {
      var v = ventanas[i];
      if (v.url.indexOf(self.location.origin) === 0 && 'focus' in v) {
        return v.focus().then(function (w) { return (w || v).navigate ? (w || v).navigate(url) : null; }).catch(function () { return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});

// Si el navegador renueva la suscripción, se la avisamos al servidor (necesita la sesión abierta)
self.addEventListener('pushsubscriptionchange', function (e) {
  var anterior = e.oldSubscription && e.oldSubscription.endpoint;
  e.waitUntil(fetch('/api/push/clave', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.clave) return;
    var s = j.clave.replace(/-/g, '+').replace(/_/g, '/'), b = atob(s + '==='.slice((s.length + 3) % 4)), k = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) k[i] = b.charCodeAt(i);
    return self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k }).then(function (nueva) {
      return fetch('/api/push/suscribir', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ suscripcion: nueva.toJSON(), anterior: anterior }) });
    });
  }).catch(function () {}));
});
