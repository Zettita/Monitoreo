// Menú del usuario igual en todas las páginas (parche 86). Se agrega al final de cada página con menú (menos el login).
// Antes cada página armaba el suyo y no coincidían: el tablero no tenía «Tablero», Administración no tenía «Comunicados» ni «Administración», Seguimiento no tenía
// «Seguimiento», y «Cambiar contraseña» solo estaba en el tablero. Ahora, entrando desde donde sea, el menú tiene siempre las mismas entradas, en el mismo orden,
// y solo se esconden las que el perfil no puede usar (según los permisos de /api/yo). La entrada de la página donde se está queda marcada.
(function () {
  var menu = document.getElementById('menu-usuario');
  if (!menu) return;
  var ENTRADAS = [
    { href: '/', texto: 'Tablero', permiso: 'tablero' },
    { href: '/mis-alertas', texto: 'Mis alertas/tareas', permiso: 'mis_alertas' },
    { href: '/seguimiento', texto: 'Seguimiento', permiso: 'seguimiento' },
    { href: '/mis-tareas', texto: 'Mis tareas', permiso: 'mis_tareas' },
    { href: '/incidentes', texto: 'Sala de crisis', permiso: 'sala_crisis' },
    { href: '/comunicados', texto: 'Comunicados', permiso: 'comunicados' },
    { href: '/admin', texto: 'Administración', permiso: 'admin_panel' }
  ];
  var tema = menu.querySelector('.menu-tema');
  var salir = menu.querySelector('#btn-salir');
  var ancla = menu.querySelector('#btn-clave') || tema || salir;   // las entradas de navegación van antes de «Cambiar contraseña» (el tablero ya la trae)

  // Estilo de la entrada marcada y del diálogo de contraseña (con los colores del tema de cada página)
  var st = document.createElement('style');
  st.textContent = '.menu a[aria-current="page"] { font-weight: 600; color: var(--accent, #0F766E); }\n' +
    '#dlg-clave-comun { border: 0; border-radius: 4px; padding: 20px; width: min(92vw, 380px); background: var(--panel, #fff); color: var(--ink, #172B4D); box-shadow: 0 8px 12px rgba(9,30,66,.15), 0 0 1px rgba(9,30,66,.31); }\n' +
    '#dlg-clave-comun::backdrop { background: rgba(9, 30, 66, .54); }\n' +
    '#dlg-clave-comun h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }\n' +
    '#dlg-clave-comun p { margin: 0 0 12px; font-size: 14px; color: var(--ink-2, #44546F); }\n' +
    '#dlg-clave-comun label { display: block; margin: 0 0 10px; font-size: 14px; }\n' +
    '#dlg-clave-comun input { display: block; box-sizing: border-box; width: 100%; height: 40px; margin-top: 4px; padding: 0 10px; font: inherit; font-size: 15px; border: 1px solid var(--line-input, #8590A2); border-radius: 3px; background: var(--input-bg, #fff); color: inherit; }\n' +
    '#dlg-clave-comun .cc-error { color: var(--critica-txt, #AE2E24); font-size: 13.5px; margin: 0 0 10px; }\n' +
    '#dlg-clave-comun .cc-acc { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }\n' +
    '#dlg-clave-comun .cc-acc button { height: 36px; padding: 0 14px; border: 0; border-radius: 3px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; background: var(--btn-bg, rgba(9,30,66,.06)); color: var(--btn-ink, #172B4D); }\n' +
    '#dlg-clave-comun .cc-acc button.cc-prim { background: var(--accent, #0F766E); color: var(--sobre-accent, #fff); }';
  document.head.appendChild(st);

  // Las entradas de navegación, siempre las mismas y en el mismo orden (las que ya existen se mueven, así conservan sus números y sus eventos)
  var enlaces = ENTRADAS.map(function (e) {
    var a = menu.querySelector('a[href="' + e.href + '"]');
    if (!a) { a = document.createElement('a'); a.setAttribute('role', 'menuitem'); a.href = e.href; a.textContent = e.texto; a.hidden = true; }
    else if (a.firstChild && a.firstChild.nodeType === 3) a.firstChild.nodeValue = e.texto;    // mismo nombre en todas las páginas (conserva el contador)
    if (ancla) menu.insertBefore(a, ancla); else menu.appendChild(a);
    var aca = location.pathname === e.href || (e.href === '/incidentes' && /^\/incidente\//.test(location.pathname)) || (e.href === '/comunicados' && /^\/comunicado\//.test(location.pathname));
    if (aca) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    return a;
  });

  // «Cambiar contraseña» en todas las páginas (el tablero ya trae el suyo)
  if (!menu.querySelector('#btn-clave')) {
    var bc = document.createElement('button');
    bc.type = 'button'; bc.setAttribute('role', 'menuitem'); bc.id = 'btn-clave'; bc.textContent = 'Cambiar contraseña';
    if (ancla) menu.insertBefore(bc, ancla); else menu.appendChild(bc);
    bc.addEventListener('click', function () {
      menu.hidden = true;
      var av = document.getElementById('btn-avatar'); if (av) av.setAttribute('aria-expanded', 'false');
      abrirClaveComun();
    });
  }
  function abrirClaveComun() {
    var d = document.getElementById('dlg-clave-comun');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'dlg-clave-comun';
      d.innerHTML = '<form method="dialog"><h2>Cambiar contraseña</h2><p>Elegí una contraseña de al menos 10 caracteres.</p>' +
        '<label>Contraseña actual<input type="password" name="actual" autocomplete="current-password" required></label>' +
        '<label>Contraseña nueva<input type="password" name="nueva" autocomplete="new-password" required></label>' +
        '<label>Repetir contraseña nueva<input type="password" name="nueva2" autocomplete="new-password" required></label>' +
        '<p class="cc-error" hidden></p><div class="cc-acc"><button type="button" data-cancelar>Cancelar</button><button type="submit" class="cc-prim">Guardar</button></div></form>';
      document.body.appendChild(d);
      var f = d.querySelector('form'), err = d.querySelector('.cc-error');
      d.querySelector('[data-cancelar]').addEventListener('click', function () { d.close(); });
      f.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (f.nueva.value !== f.nueva2.value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; err.hidden = false; return; }
        var guardar = f.querySelector('.cc-prim'); guardar.disabled = true;
        fetch('/api/cambiar-clave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actual: f.actual.value, nueva: f.nueva.value }) })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo cambiar la contraseña.'); }); })
          .then(function () { err.hidden = true; d.close(); })
          .catch(function (e) { err.textContent = e.message; err.hidden = false; })
          .then(function () { guardar.disabled = false; });
      });
    }
    d.querySelector('form').reset(); d.querySelector('.cc-error').hidden = true;
    d.showModal();
  }

  // Qué entradas se muestran: las que el perfil puede usar (la misma regla de siempre, ahora igual en todas las páginas)
  fetch('/api/yo', { headers: { accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.permisos) return;
    ENTRADAS.forEach(function (e, i) { enlaces[i].hidden = j.permisos.indexOf(e.permiso) < 0; });
  }).catch(function () { /* sin red: quedan las que la página ya mostraba */ });
})();
