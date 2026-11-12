# Paso 16 del build: etapa 3 (asignación de alertas: derivar, tomar, comentar, devolver, resolver + "Mis alertas")
import json, os, re
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    leer = lambda n: open(os.path.join(AQUI, n)).read().strip()
    # Página "Mis alertas": usa los mismos estilos base que la de administración
    adm = leer('admin.html')
    estilos = adm[adm.index('<style>') + 7: adm.index('</style>')].strip()
    mis = leer('mis_alertas.html').replace('/*ESTILOS_BASE*/', estilos)
    seg = leer('seguimiento.html').replace('/*ESTILOS_BASE*/', estilos)   # página "Seguimiento" (analistas)
    # --- Servidor ---
    k = s.index('export default {')
    s = s[:k] + 'const MIS_ALERTAS_HTML = ' + json.dumps(mis + '\n', ensure_ascii=False) + ';\n\n' + 'const SEGUIMIENTO_HTML = ' + json.dumps(seg + '\n', ensure_ascii=False) + ';\n\n' + leer('asignacion_server.js') + '\n\n' + s[k:]
    s = rep(s, """      // Administración (/admin y /api/admin/...): controla sus propios permisos
""", """      // Asignación de alertas y "Mis alertas": controla sus propios permisos
      const asignacion = await rutasAsignacion(env, request, ruta, yo);
      if (asignacion) return asignacion;
      // Administración (/admin y /api/admin/...): controla sus propios permisos
""")
    s = rep(s, """        return Response.json(await datosDashboard(env), { headers: { 'cache-control': 'no-store' } });""",
               """        const d = await datosDashboard(env);
        if (puede(yo, 'mis_alertas')) d.mis_pendientes = await contarMisAlertas(env, yo);   // número del botón "Mis alertas"
        return Response.json(d, { headers: { 'cache-control': 'no-store' } });""")
    s = rep(s, """      env.DB.prepare(Q_ABIERTAS),
      env.DB.prepare(Q_POR_DIA),""", """      env.DB.prepare(Q_ABIERTAS_ASIGNACION),
      env.DB.prepare(Q_POR_DIA),""")
    s = rep(s, """      env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
    ]);""", """      env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
      env.DB.prepare(Q_EVENTOS_ABIERTAS),
    ]);""")
    s = rep(s, """      reglas_personalizadas: r[11].results,
""", """      reglas_personalizadas: r[11].results,
      eventos: r[12].results,
""")
    s = rep(s, """    const [registrar, personalizadas, normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(REGISTRAR_PERSONALIZADAS_SQL),
""", """    // Las ventanas nuevas de un problema ya asignado heredan la asignación antes de los cierres
    const [registrar, personalizadas, , normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(REGISTRAR_PERSONALIZADAS_SQL),
      env.DB.prepare(HEREDAR_ASIGNACION),
""")
    s = rep(s, "    env.DB.prepare('DELETE FROM alertas_historico'),\n",
               "    env.DB.prepare('DELETE FROM alertas_historico'),\n    env.DB.prepare('DELETE FROM alerta_eventos'),\n")
    s = rep(s, "//   GET  /admin, /api/admin/...          administración (ver ADMINISTRACIÓN)\n",
               "//   GET  /admin, /api/admin/...          administración (ver ADMINISTRACIÓN)\n"
               "//   GET  /mis-alertas, POST /api/alertas/<id>/(derivar|tomar|comentar|devolver|resolver)  asignación\n")

    # --- Página del tablero ---
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])
    h = rep(h, '    <button class="btn" id="btn-actualizar">Actualizar</button>\n',
               '    <a class="btn" id="lnk-mis" href="/mis-alertas" hidden><span class="largo">Mis alertas</span><span class="corto">Mías</span><span class="badge" id="badge-mis" hidden></span></a>\n'
               '    <button class="btn" id="btn-actualizar">Actualizar</button>\n')
    h = rep(h, '        <a role="menuitem" id="lnk-admin" href="/admin" hidden>Administración</a>\n',
               '        <a role="menuitem" id="lnk-mis2" href="/mis-alertas" hidden>Mis alertas</a>\n'
               '        <a role="menuitem" id="lnk-admin" href="/admin" hidden>Administración</a>\n')
    css = '''
/* Asignación de alertas */
a.btn { text-decoration: none; display: inline-flex; align-items: center; }
.dos > div, .dos-iguales > div { min-width: 0; }   /* las tablas anchas scrollean dentro de su panel */
.badge { display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; background: var(--critica); color: #fff; font-size: 11.5px; font-weight: 700; margin-left: 6px; vertical-align: 1px; }
.badge[hidden] { display: none; }
#t-abiertas td.asig { font-size: 13px; line-height: 1.35; min-width: 130px; max-width: 220px; }
#t-abiertas td.asig small { color: var(--ink-3); }
.est { display: inline-block; padding: 1px 8px; border-radius: 999px; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
.est-nueva { background: var(--critica-bg); color: var(--critica); }
.est-asig { background: var(--pre-bg); color: var(--pre); }
.est-curso { background: var(--ok-bg); color: var(--ok); }
.est-dev { background: var(--media-bg); color: var(--media); }
.est-info { background: var(--baja-bg); color: var(--baja); }
#t-abiertas td small { color: var(--ink-3); }
.btn.enlace { border-color: transparent; background: transparent; color: var(--accent); padding-left: 6px; padding-right: 6px; }
.btn.enlace:hover { text-decoration: underline; }
dialog.dlg { border: 1px solid var(--line); border-radius: 12px; padding: 22px; width: min(480px, calc(100vw - 32px)); background: var(--panel); color: var(--ink); }
dialog.dlg::backdrop { background: rgba(10, 20, 25, .45); }
dialog.dlg h2 { margin: 0 0 4px; font-size: 19px; }
dialog.dlg .sub-dlg { margin: 0; color: var(--ink-2); font-size: 14px; }
.dlg label.campo { display: block; font-size: 13.5px; font-weight: 600; margin-top: 14px; }
.dlg .campo select, .dlg .campo textarea { display: block; width: 100%; margin-top: 5px; font: inherit; font-weight: 400; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.dlg .campo textarea { min-height: 90px; resize: vertical; }
.dlg .ayuda { display: block; font-weight: 400; font-size: 12.5px; color: var(--ink-3); margin-top: 4px; }
.historial-t { list-style: none; margin: 14px 0 0; padding: 0 0 0 12px; border-left: 2px solid var(--line); max-height: 55vh; overflow-y: auto; }
.historial-t li { font-size: 13.5px; padding: 4px 0; color: var(--ink-2); }
.historial-t li b { color: var(--ink); font-weight: 600; }
.historial-t li q { display: block; color: var(--ink); }
.historial-t li time { color: var(--ink-3); font-size: 12px; margin-right: 6px; }
'''
    h = rep(h, ".toast {", css.strip() + "\n.toast {")
    h = rep(h, '<div class="toast" id="toast" role="status"></div>', '''<div class="toast" id="toast" role="status"></div>
<dialog class="dlg" id="dlg-derivar">
  <form id="f-derivar" method="dialog">
    <h2 id="d-titulo">Derivar alerta</h2>
    <p class="sub-dlg" id="d-alerta"></p>
    <label class="campo">Equipo<select id="d-equipo"></select></label>
    <label class="campo">Persona<select id="d-persona"></select><small class="ayuda" id="d-ayuda"></small></label>
    <label class="campo">Comentario <small style="font-weight:400;color:var(--ink-3)">(opcional)</small><textarea id="d-texto" maxlength="1000" placeholder="Ej.: revisar el conector del cliente"></textarea></label>
    <p class="error-form" id="d-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="d-guardar">Derivar</button></div>
  </form>
</dialog>
<dialog class="dlg" id="dlg-resolver">
  <form id="f-resolver" method="dialog">
    <h2>Resolver alerta</h2>
    <p class="sub-dlg" id="v-alerta"></p>
    <label class="campo">¿Qué se hizo?<textarea id="v-texto" maxlength="1000" required></textarea><small class="ayuda">Obligatorio: queda en el historial de la alerta.</small></label>
    <p class="error-form" id="v-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="v-guardar">Marcar como resuelta</button></div>
  </form>
</dialog>
<dialog class="dlg" id="dlg-historial">
  <h2>Historial de la alerta</h2>
  <p class="sub-dlg" id="h-alerta"></p>
  <ol class="historial-t" id="h-lista"></ol>
  <div class="acc-dlg"><button class="btn primario" data-cerrar>Cerrar</button></div>
</dialog>''')
    # Tabla de alertas abiertas: columna de asignación y nuevas acciones
    a0 = h.index("    var grupos = {}, a = [];\n    (d.abiertas || []).forEach(function (r) {")
    a1 = h.index("'<tr><td class=\"vacio\">Todo en orden: ningún servicio tiene problemas en este momento.</td></tr>';", a0)
    a1 = h.index('\n', a1) + 1
    h = h[:a0] + r"""    var grupos = {}, a = [];
    casosTablero = {};
    (d.abiertas || []).forEach(function (r) {
      var k = clave(r) + '|' + r.tipo_alerta, g = grupos[k];
      if (!g) { g = grupos[k] = { id: r.alerta_id, ult: r, desde: r.ventana_inicio, n: 0, sev: r.severidad, ids: [], abiertas: [], quien: null, asig: null }; a.push(g); }
      g.n++; g.ids.push(r.alerta_id);
      if (r.estado === 'ABIERTA') g.abiertas.push(r.alerta_id); else if (r.reconocida_por) g.quien = r.reconocida_por;
      if (r.asignado_en && (r.asignado_usuario_id != null || r.asignado_equipo_id != null) && (!g.asig || r.asignado_en > g.asig.asignado_en)) g.asig = r;
      if (r.ventana_inicio < g.desde) g.desde = r.ventana_inicio;
      if (r.ventana_inicio > g.ult.ventana_inicio) g.ult = r;
      if (SEV_N[r.severidad] < SEV_N[g.sev]) g.sev = r.severidad;
    });
    a.forEach(function (g) {
      g.eventos = (d.eventos || []).filter(function (e) { return g.ids.indexOf(e.alerta_id) >= 0; });
      casosTablero[g.id] = g;
    });
    a.sort(function (x, y) { return SEV_N[x.sev] - SEV_N[y.sev] || (x.desde < y.desde ? -1 : 1); });
    $('t-abiertas').innerHTML = a.length ? '<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Inicio</th><th class="num">Ventanas</th><th class="num">Observado</th><th class="num">Esperado</th><th>Estado</th><th>Asignación</th><th></th></tr></thead><tbody>' +
      a.map(function (g) {
        var r = g.ult, s = g.asig, acc = '';
        if (g.sev !== 'BAJA') {
          if (puedo('derivar')) acc += '<button class="btn chico" data-acc-t="derivar" data-id="' + g.id + '">' + (s ? 'Reasignar' : 'Derivar') + '</button>';
          if (puedo('derivar') && g.abiertas.length) acc += '<button class="btn chico" data-acc-t="tomar" data-id="' + g.id + '">Tomar</button>';
          if (puedo('derivar') || (s && yo && s.asignado_usuario_id === yo.id)) acc += '<button class="btn chico" data-acc-t="resolver" data-id="' + g.id + '">Resolver</button>';
        }
        if (g.eventos.length) acc += '<button class="btn chico enlace" data-acc-t="historial" data-id="' + g.id + '">Historial</button>';
        return '<tr><td>' + sev(g.sev) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) +
          '</td><td>' + diaHora(g.desde) + '</td><td class="num">' + g.n + '</td><td class="num" title="Última ventana: ' + hora(r.ventana_inicio) + '">' + valor(r.metrica, r.valor_observado) +
          '</td><td class="num">' + valor(r.metrica, r.valor_esperado) + '</td><td>' + estadoChip(g) + '</td><td class="asig">' + asignacionTxt(g) + '</td><td><div class="acc-fila">' + acc + '</div></td></tr>';
      }).join('') + '</tbody>' : '<tr><td class="vacio">Todo en orden: ningún servicio tiene problemas en este momento.</td></tr>';
""" + h[a1:]
    h = rep(h, "  // ---- Qué está pasando ahora ----\n", r"""  // ---- Asignación de alertas ----
  var casosTablero = {}, asignablesCache = null, casoActual = null;
  // Estado de la alerta (qué etapa del circuito) y asignación (quién la tiene)
  function devolucion(g) {
    var ult = g.eventos[g.eventos.length - 1];
    return !g.asig && ult && ult.accion === 'DEVOLVER' ? ult : null;
  }
  function estadoChip(g) {
    var s = g.asig, tomada = !g.abiertas.length;
    if (g.sev === 'BAJA') return '<span class="est est-info">Informativa</span>';
    if (tomada) return '<span class="est est-curso">En curso</span>';
    if (s) return '<span class="est est-asig">Asignada</span><br><small>sin tomar</small>';
    if (devolucion(g)) return '<span class="est est-dev">Devuelta</span>';
    return '<span class="est est-nueva">Sin asignar</span>';
  }
  function asignacionTxt(g) {
    var s = g.asig, dev = devolucion(g);
    if (s && s.asignado_usuario_id != null) return '<b>' + esc(s.asignado_nombre) + '</b>' + (s.equipo_nombre ? '<br><small>Equipo ' + esc(s.equipo_nombre) + '</small>' : '');
    if (s && s.asignado_equipo_id != null) return 'Equipo <b>' + esc(s.equipo_nombre) + '</b><br><small>la toma el primero</small>';
    if (!g.abiertas.length && g.quien) return '<b>' + esc(g.quien) + '</b>';
    if (dev) return '<small>Devuelta por ' + esc(dev.usuario_nombre) + (dev.comentario ? ': “' + esc(dev.comentario) + '”' : '') + '</small>';
    return '<span style="color:var(--ink-3)">—</span>';
  }
  function resumenCaso(g) { return frase(g.ult.tipo_alerta, g.ult) + ' · ' + g.ult.cliente_id + ', ' + servicio(g.ult); }
  var ACC_EV = { DERIVAR: 'derivó', TOMAR: 'la tomó', COMENTAR: 'comentó', DEVOLVER: 'la devolvió', RESOLVER: 'la resolvió' };
  function abrirHistorial(g) {
    $('h-alerta').textContent = resumenCaso(g);
    $('h-lista').innerHTML = g.eventos.map(function (e) {
      var dest = e.accion === 'DERIVAR' ? ' a ' + [e.destino_nombre, e.equipo_destino_nombre ? 'equipo ' + e.equipo_destino_nombre : ''].filter(Boolean).join(', ') : '';
      return '<li><time>' + esc(diaHora(e.fecha)) + '</time><b>' + esc(e.usuario_nombre || 'Sistema') + '</b> ' + esc((ACC_EV[e.accion] || e.accion) + dest) +
        (e.comentario ? '<q>“' + esc(e.comentario) + '”</q>' : '') + '</li>';
    }).join('');
    $('dlg-historial').showModal();
  }
  function personasDe(eq) {
    var c = asignablesCache, ids = eq ? c.miembros.filter(function (m) { return m.equipo_id === eq; }).map(function (m) { return m.usuario_id; }) : null;
    return c.usuarios.filter(function (u) { return !ids || ids.indexOf(u.id) >= 0; });
  }
  var PERFIL_CORTO = { ADMIN: 'Administrador', ANALISTA: 'Analista', SOPORTE: 'Soporte' };
  function pintarPersonas(sel) {
    var eq = $('d-equipo').value ? Number($('d-equipo').value) : null, ps = personasDe(eq);
    $('d-persona').innerHTML = (eq ? '<option value="">Cualquiera del equipo (la toma el primero)</option>' : '<option value="">Elegí una persona</option>') +
      ps.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nombre) + ' · ' + esc(PERFIL_CORTO[u.perfil] || u.perfil) + '</option>'; }).join('');
    $('d-persona').value = sel && ps.some(function (u) { return u.id === sel; }) ? String(sel) : '';
    $('d-ayuda').textContent = eq ? (ps.length ? 'Si no elegís a nadie, le aparece a todo el equipo en "Mis alertas".' : 'Este equipo no tiene miembros activos.') : 'Sin equipo, la alerta va directo a esta persona.';
  }
  function abrirDerivar(g) {
    casoActual = g;
    var cargarA = asignablesCache ? Promise.resolve() : pedir('/api/asignables').then(function (r) { asignablesCache = r; });
    cargarA.then(function () {
      $('f-derivar').reset(); $('d-error').hidden = true;
      $('d-titulo').textContent = g.asig ? 'Reasignar alerta' : 'Derivar alerta';
      $('d-guardar').textContent = g.asig ? 'Reasignar' : 'Derivar';
      $('d-alerta').textContent = resumenCaso(g);
      $('d-equipo').innerHTML = '<option value="">Sin equipo</option>' + asignablesCache.equipos.map(function (e) { return '<option value="' + e.id + '">' + esc(e.nombre) + '</option>'; }).join('');
      $('d-equipo').value = g.asig && g.asig.asignado_equipo_id != null ? String(g.asig.asignado_equipo_id) : '';
      pintarPersonas(g.asig ? g.asig.asignado_usuario_id : null);
      $('dlg-derivar').showModal();
    }).catch(function (e) { toast(e.message, true); });
  }
  $('d-equipo').addEventListener('change', function () { pintarPersonas(Number($('d-persona').value) || null); });
  $('f-derivar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var eq = $('d-equipo').value ? Number($('d-equipo').value) : null, pe = $('d-persona').value ? Number($('d-persona').value) : null;
    var err = $('d-error');
    if (!eq && !pe) { err.textContent = 'Elegí un equipo, una persona o los dos.'; err.hidden = false; return; }
    var b = $('d-guardar'); b.disabled = true;
    pedir('/api/alertas/' + casoActual.id + '/derivar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ equipo_id: eq, usuario_id: pe, comentario: $('d-texto').value.trim() || null }) })
      .then(function () { $('dlg-derivar').close(); toast('Alerta derivada: la ve en "Mis alertas".'); return cargar(); })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; }).then(function () { b.disabled = false; });
  });
  $('f-resolver').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var b = $('v-guardar'), err = $('v-error'); b.disabled = true;
    pedir('/api/alertas/' + casoActual.id + '/resolver', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comentario: $('v-texto').value.trim() }) })
      .then(function () { $('dlg-resolver').close(); toast('Alerta resuelta.'); return cargar(); })
      .catch(function (e) { err.textContent = e.message; err.hidden = false; }).then(function () { b.disabled = false; });
  });
  document.addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-cerrar]'); if (c) { c.closest('dialog').close(); return; }
    var b = ev.target.closest('button[data-acc-t]'); if (!b) return;
    var g = casosTablero[b.getAttribute('data-id')], acc = b.getAttribute('data-acc-t');
    if (!g) return;
    if (acc === 'historial') abrirHistorial(g);
    else if (acc === 'derivar') abrirDerivar(g);
    else if (acc === 'resolver') { casoActual = g; $('f-resolver').reset(); $('v-error').hidden = true; $('v-alerta').textContent = resumenCaso(g); $('dlg-resolver').showModal(); }
    else if (acc === 'tomar') {
      b.disabled = true;
      pedir('/api/alertas/' + g.id + '/tomar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
        .then(function () { toast('La tomaste: la ves en "Mis alertas".'); return cargar(); })
        .catch(function (e) { b.disabled = false; toast(e.message, true); });
    }
  });

  // ---- Qué está pasando ahora ----
""")
    # Se quita el manejador viejo de "Tomar" / "Marcar como resuelto"
    a0 = h.index("  document.addEventListener('click', function (ev) {\n    var b = ev.target.closest('button[data-accion]');")
    a1 = h.index("  $('btn-actualizar').addEventListener('click'", a0)
    h = h[:a0] + h[a1:]
    # Número del botón "Mis alertas"
    h = rep(h, """      CORTA[t] = /^.[a-záéíóúñ]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
    });
""", """      CORTA[t] = /^.[a-záéíóúñ]/.test(n) ? n.charAt(0).toLowerCase() + n.slice(1) : n;
    });
    if (d.mis_pendientes != null) { $('badge-mis').textContent = d.mis_pendientes; $('badge-mis').hidden = !d.mis_pendientes; }
""")
    h = rep(h, "    $('lnk-admin').hidden = !puedo('admin_panel');\n",
               "    $('lnk-admin').hidden = !puedo('admin_panel');\n    $('lnk-mis').hidden = $('lnk-mis2').hidden = !puedo('mis_alertas');\n")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
