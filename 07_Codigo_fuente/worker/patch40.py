# Parche 40: plantillas de correo y ajustes a "Template correo alerta" (pedido de Ale, 16/11).
#
#   Ajustes al parche 39 (todavía no publicado):
#   - El botón y el diálogo se llaman "Template correo alerta «<problema> · <cliente>»"; sin el texto explicativo del diálogo.
#   - "Confirmar envío" pide a quién se envió (Para y CC editables, precargados con lo que se escribió al armar el correo,
#     no con una sugerencia): queda en la conversación con los destinatarios reales.
#   Plantillas (punto 2):
#   - Administración > "Plantillas de correo" (solo Administrador): nombre, sector al que se escala, tipos de alerta (ninguno = todas),
#     para alertas abiertas, resueltas o las dos, asunto y texto con variables ({cliente}, {problema}, {desde}…) y ejemplo en vivo.
#     Los destinatarios no van en la plantilla: los pone quien envía.
#   - En el diálogo del correo, "Plantilla" muestra las que sirven para esa alerta (primero las de su tipo) y arma asunto y texto.
#   - Se guardan en alerta_parametros.plantillas_correo (JSON; script 18: una columna). Sin el script se usan las 6 de fábrica.
import json, os, re

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


def _entre(h, ini, fin, nuevo):
    i = h.index(ini); j = h.index(fin, i)
    assert h.count(ini) == 1
    return h[:i] + nuevo + h[j:]


# Se usa igual en el detalle de la alerta y en el ejemplo de Administración
RENDER_JS = r"""  // Plantillas de correo (parche 40): reemplaza {variables}; una línea con una variable vacía no se escribe
  function textoPlantilla(t, v) {
    var tiene = function (k) { return Object.prototype.hasOwnProperty.call(v, k); };
    return String(t || '').split('\n').filter(function (l) {
      return !(l.match(/\{([a-z_]+)\}/g) || []).some(function (x) { var k = x.slice(1, -1); return tiene(k) && !v[k]; });
    }).map(function (l) { return l.replace(/\{([a-z_]+)\}/g, function (m, k) { return tiene(k) ? v[k] : m; }); }).join('\n');
  }
  function asuntoPlantilla(t, v) {
    return String(t || '').replace(/\{([a-z_]+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : m; }).replace(/\s+/g, ' ').replace(/\s+([:,])/g, '$1').trim();
  }
"""

# ---------------------------------------------------------------- Detalle de la alerta
NUEVO_ARMADO = RENDER_JS + r"""  // Valores de las variables para esta alerta
  function valoresCorreo() {
    var u = info.ult, p = info.prim, a = info.a, res = info.resuelta, r = d.resolucion;
    var fin = res ? aFecha(u.fecha_resolucion) : aFecha(d.ahora), mins = Math.max(0, Math.round((fin - aFecha(p.ventana_inicio)) / 60000));
    var ultCom = null, sev = SEV_TXT[info.sev] || info.sev;
    d.eventos.forEach(function (e) { if (e.comentario && e.accion !== 'RESOLVER' && !esMarcaSistema(e.comentario)) ultCom = e; });
    var resol = '';
    if (res) {
      resol = r ? [r.causa ? 'causa: ' + r.causa : '', r.acciones && r.acciones.length ? 'se hizo: ' + r.acciones.join(', ').toLowerCase() : '', r.comentario || ''].filter(Boolean).join('; ')
        : (u.comentario || MOTIVO[u.motivo_resolucion] || '');
      if (resol) resol = resol.charAt(0).toUpperCase() + resol.slice(1);
    }
    return {
      alerta: tituloCorreo(), problema: frase(u.tipo_alerta, u), cliente: u.cliente_id, servicio: servicio(u), ambiente: u.ambiente,
      desde: fechaCorreo(p.ventana_inicio), duracion: minutosTxt(mins), gravedad: sev, prioridad: 'P' + info.prio,
      etiqueta: res ? 'Resuelta' : 'P' + info.prio + ' · ' + sev,
      medicion: valor(u.metrica, u.valor_observado) + ', cuando se esperaba ' + valor(u.metrica, u.valor_esperado) + ' (' + hora(u.ventana_inicio) + ' a ' + hora(u.ventana_fin) + ')',
      estado: res ? 'Resuelta el ' + fechaCorreo(u.fecha_resolucion) : info.estado[0] + (a.asignado_nombre ? ', a cargo de ' + a.asignado_nombre : '') + (a.equipo_nombre ? ' (equipo ' + a.equipo_nombre + ')' : ''),
      responsable: res ? (u.resuelta_por || '') : (a.asignado_nombre || ''), equipo: res ? '' : (a.equipo_nombre || ''),
      ultima_novedad: ultCom ? ultCom.comentario.replace(/\s+/g, ' ').slice(0, 300) : '', resolucion: resol,
      enlace: location.origin + '/alerta/' + ID, firma: yo.nombre
    };
  }
  function tituloCorreo() { return frase(info.ult.tipo_alerta, info.ult) + ' · ' + info.ult.cliente_id; }
  // Plantillas que sirven para esta alerta: primero las de su tipo, después las generales
  function plantillasDeAlerta() {
    var t = info.ult.tipo_alerta, res = info.resuelta;
    return (d.plantillas_correo || []).filter(function (p) {
      return (p.cuando === 'TODAS' || (p.cuando === 'RESUELTA') === res) && (!p.tipos.length || p.tipos.indexOf(t) >= 0);
    }).sort(function (x, y) {
      return (y.tipos.length ? 1 : 0) - (x.tipos.length ? 1 : 0) || (x.sector || '').localeCompare(y.sector || '') || x.nombre.localeCompare(y.nombre);
    });
  }
  var plantillasVis = [], aplicada = null;
  function aplicarPlantilla(p) {
    var v = valoresCorreo();
    aplicada = p ? { asunto: asuntoPlantilla(p.asunto, v), texto: textoPlantilla(p.cuerpo, v), nombre: p.nombre } : { asunto: tituloCorreo(), texto: '', nombre: '' };
    $('m-asunto').value = aplicada.asunto; $('m-texto').value = aplicada.texto;
  }
  function abrirCorreo() {
    $('f-correo').reset(); errorForm('m-error');
    $('m-titulo').textContent = 'Template correo alerta «' + tituloCorreo() + '»';
    plantillasVis = plantillasDeAlerta();
    $('m-plantilla').innerHTML = plantillasVis.length ? plantillasVis.map(function (p, i) {
      return '<option value="' + i + '">' + esc((p.sector ? p.sector + ' · ' : '') + p.nombre) + '</option>';
    }).join('') : '<option value="">No hay plantillas para este tipo de alerta</option>';
    $('m-plantilla').disabled = !plantillasVis.length;
    aplicarPlantilla(plantillasVis[0] || null);
    $('m-plantilla').setAttribute('data-ant', $('m-plantilla').value);
    $('dlg-correo').showModal(); $('m-para').focus();
  }
  $('m-plantilla').addEventListener('change', function () {
    var s = this, editado = aplicada && ($('m-asunto').value !== aplicada.asunto || $('m-texto').value !== aplicada.texto);
    if (editado && !confirm('Se van a reemplazar el asunto y el texto por los de la plantilla elegida. ¿Seguir?')) { s.value = s.getAttribute('data-ant'); return; }
    s.setAttribute('data-ant', s.value);
    aplicarPlantilla(plantillasVis[Number(s.value)] || null);
  });
"""

LI_NUEVOS = r"""  function destinatariosDe(cab) {
    cab = cab.replace(/^(sin|con) cambios\s*/, '');
    var para = (cab.match(/(?:^|\s)para (.+?)(?=\s\(copia a |\scon la plantilla "|$)/) || [])[1] || '';
    var cc = (cab.match(/\(copia a ([^)]+)\)/) || [])[1] || '';
    return { para: para, cc: cc, texto: cab };
  }
  function liCorreo(e, conf) {
    var x = partesCorreo(e.comentario, COR_MARCA), estado;
    if (conf) {
      var t = tipoEnvio(conf.comentario), dc = destinatariosDe(partesCorreo(conf.comentario, t === 'NO_ENVIADO' ? ENV_NO : ENV_SIN).cab);
      estado = '<span class="tag-env ' + (t === 'NO_ENVIADO' ? 'no' : 'env') + '">' + esc(ENV_TXT[t]) + '</span><small class="gris">' +
        esc((dc.para ? 'a ' + dc.para + (dc.cc ? ' (copia a ' + dc.cc + ')' : '') + ' · ' : '') + (conf.usuario_nombre || '') + ', ' + diaHora(conf.fecha)) + '</small>';
    } else {
      estado = '<span class="tag-env pend">Falta confirmar si se envió</span>' + (d.puedo.correo ? '<button type="button" class="btn chico" data-envio="' + e.id + '">Confirmar envío</button>' : '');
    }
    return '<li class="correo"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> preparó un correo<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja"><b>' + esc(x.asunto) + '</b>' + (x.cab ? '<span class="dest">' + esc(x.cab) + '</span>' : '') +
      (x.texto ? '<details><summary>Ver el texto armado</summary><pre class="correo-texto">' + esc(x.texto) + '</pre></details>' : '') + '</div>' +
      '<div class="correo-estado">' + estado + '</div></li>';
  }
  function liEnvio(e) {
    var t = tipoEnvio(e.comentario), x = partesCorreo(e.comentario, t === 'NO_ENVIADO' ? ENV_NO : ENV_SIN), dc = destinatariosDe(x.cab);
    var txt = t === 'NO_ENVIADO' ? 'indicó que el correo no se envió' : t === 'CON_CAMBIOS' ? 'confirmó que el correo se envió con cambios' : 'confirmó que el correo se envió sin cambios';
    return '<li class="correo"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> ' + esc(txt) + '<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja">«' + esc(x.asunto) + '»' + (dc.para ? '<span class="dest">para ' + esc(dc.para) + (dc.cc ? ' (copia a ' + esc(dc.cc) + ')' : '') + '</span>' : '') +
      (x.texto ? '<details><summary>Ver el texto que se envió</summary><pre class="correo-texto">' + esc(x.texto) + '</pre></details>' : '') + '</div></li>';
  }
"""

DLG_ENVIO_DEST = """    <div id="e-dest">
      <label class="campo grupo-res"><span>Para <small class="gris">(a quién se envió)</small></span><input id="e-para" type="text" autocomplete="off" placeholder="nombre@empresa.com; otra@empresa.com"></label>
      <label class="campo"><span>CC <small class="gris">(opcional)</small></span><input id="e-cc" type="text" autocomplete="off"></label>
    </div>
"""


def detalle(h):
    # Botón y título con la alerta; sin texto explicativo
    h = _rep(h, "    if (p.correo) acc += '<button class=\"btn\" data-acc=\"correo\">Preparar correo</button>';",
             "    if (p.correo) acc += '<button class=\"btn\" data-acc=\"correo\">Template correo alerta «' + esc(frase(u.tipo_alerta, u) + ' · ' + u.cliente_id) + '»</button>';")
    h = _entre(h, '    <h2>Preparar correo</h2>\n', '    <label class="campo"><span>Para</span><input id="m-para"',
               '    <h2 id="m-titulo">Template correo alerta</h2>\n'
               '    <label class="campo"><span>Plantilla</span><select id="m-plantilla"></select></label>\n')
    # Plantillas en vez del borrador fijo
    h = _entre(h, '  // Borrador con los datos de la alerta\n', '  function listaCorreos(v)', NUEVO_ARMADO)
    h = _rep(h, "    pedir('/api/alertas/' + ID + '/correo', { para: m.para, cc: m.cc, asunto: m.asunto, texto: m.texto })",
             "    pedir('/api/alertas/' + ID + '/correo', { para: m.para, cc: m.cc, asunto: m.asunto, texto: m.texto, plantilla: aplicada && aplicada.nombre ? aplicada.nombre : '' })")
    # Conversación con los destinatarios reales
    h = _entre(h, '  function liCorreo(e, conf) {', '  // En el correo, fecha completa', LI_NUEVOS)
    h = _rep(h, "    if (c.indexOf(ENV_SIN) === 0) return / con cambios/.test(c.split(COR_SEP)[0]) ? 'CON_CAMBIOS' : 'SIN_CAMBIOS';",
             "    if (c.indexOf(ENV_SIN) === 0) { var l = c.split(COR_SEP)[0]; return l.slice(l.indexOf('»') + 1).indexOf(' con cambios') === 0 ? 'CON_CAMBIOS' : 'SIN_CAMBIOS'; }")
    # Confirmar envío: a quién se envió
    h = _rep(h, '    </div>\n    <label class="campo grupo-res" id="e-texto-campo" hidden>', '    </div>\n' + DLG_ENVIO_DEST + '    <label class="campo grupo-res" id="e-texto-campo" hidden>')
    h = _rep(h, "    $('e-asunto').textContent = '«' + x.asunto + '»' + (x.cab ? ' ' + x.cab : '');",
             "    $('e-asunto').textContent = '«' + x.asunto + '»';\n"
             "    var dd = destinatariosDe(x.cab); $('e-para').value = dd.para.split(', ').filter(Boolean).join('; '); $('e-cc').value = dd.cc.split(', ').filter(Boolean).join('; '); $('e-dest').hidden = false;")
    h = _rep(h, "    $('e-texto-campo').hidden = v !== 'CON_CAMBIOS';",
             "    $('e-texto-campo').hidden = v !== 'CON_CAMBIOS';\n    $('e-dest').hidden = v === 'NO_ENVIADO';")
    h = _rep(h, "    var b = $('e-guardar'); b.disabled = true;\n    pedir('/api/alertas/' + ID + '/correo/envio', { evento_id: envioDe.id, resultado: v, texto: v === 'CON_CAMBIOS' ? txt : '' })",
             "    var para = listaCorreos($('e-para').value), cc = listaCorreos($('e-cc').value);\n"
             "    if (v !== 'NO_ENVIADO') {\n"
             "      var malos = para.concat(cc).filter(function (x) { return !COR_OK.test(x); });\n"
             "      if (malos.length) { errorForm('e-error', 'Revisá estas direcciones: ' + malos.join(', ') + '.'); return; }\n"
             "      if (!para.length) { errorForm('e-error', 'Escribí a quién se envió.'); return; }\n"
             "    }\n"
             "    var b = $('e-guardar'); b.disabled = true;\n"
             "    pedir('/api/alertas/' + ID + '/correo/envio', { evento_id: envioDe.id, resultado: v, texto: v === 'CON_CAMBIOS' ? txt : '', para: v === 'NO_ENVIADO' ? [] : para, cc: v === 'NO_ENVIADO' ? [] : cc })")
    return h


# ---------------------------------------------------------------- Administración
ADMIN_SECCION = """  <!-- PLANTILLAS DE CORREO (parche 40) -->
  <section id="s-plantillas" hidden>
    <div class="cab-seccion">
      <div><h2>Plantillas de correo</h2><p class="bajada">Modelos para "Template correo alerta" en el detalle de cada alerta, según el tipo de incidente y el sector al que se escala. Las variables entre llaves se completan con los datos de la alerta. Los destinatarios los pone quien envía el correo.</p></div>
      <button class="btn primario" id="btn-nueva-plantilla">Nueva plantilla</button>
    </div>
    <p class="aviso-plant" id="plant-aviso" hidden></p>
    <div class="panel"><div class="tabla-scroll"><table class="resp" id="t-plantillas"></table></div></div>
  </section>

"""
ADMIN_DIALOGO = """<!-- Diálogo: plantilla de correo (parche 40) -->
<dialog id="dlg-plantilla" class="ancho">
  <form id="f-plantilla" method="dialog">
    <h2 id="pl-titulo">Nueva plantilla</h2>
    <div class="fila-campos dos">
      <label class="campo"><span>Nombre</span><input type="text" id="pl-nombre" maxlength="80" autocomplete="off" placeholder="Ej.: Escalar a proveedor o gateway"></label>
      <label class="campo"><span>Sector al que se escala</span><input type="text" id="pl-sector" maxlength="40" autocomplete="off" list="pl-sectores" placeholder="Ej.: Mesa de ayuda, Proveedor, Cliente"><datalist id="pl-sectores"></datalist></label>
    </div>
    <label class="campo"><span>Para qué alertas</span><select id="pl-cuando">
      <option value="TODAS">Abiertas y resueltas</option><option value="ABIERTA">Solo abiertas</option><option value="RESUELTA">Solo resueltas (correo de cierre)</option>
    </select></label>
    <div class="campo"><span>Tipos de alerta <small class="gris">(si no se marca ninguno, sirve para todas)</small></span><div class="opciones-pl" id="pl-tipos"></div></div>
    <label class="campo"><span>Asunto</span><input type="text" id="pl-asunto" maxlength="200" autocomplete="off"></label>
    <label class="campo"><span>Texto</span><textarea id="pl-cuerpo" maxlength="6000"></textarea></label>
    <div class="campo"><span>Variables <small class="gris">(tocá una para agregarla donde está el cursor)</small></span><div class="vars-pl" id="pl-vars"></div></div>
    <div class="ejemplo-pl"><b>Ejemplo con una alerta de muestra</b><p class="ej-asunto" id="pl-ej-asunto"></p><pre id="pl-ej-texto"></pre></div>
    <label class="campo"><span>Estado</span><span class="interruptor"><input type="checkbox" id="pl-activa"><i></i><span id="pl-activa-txt">Activa</span></span></label>
    <p class="error-form" id="pl-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="pl-guardar">Guardar</button></div>
  </form>
</dialog>

"""
ADMIN_CSS = """/* Plantillas de correo (parche 40) */
.aviso-plant { background: var(--media-bg); color: var(--media-txt); border-radius: 4px; padding: 8px 12px; font-size: 13.5px; margin: 0 0 12px; }
.opciones-pl, .vars-pl { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.opciones-pl label { position: relative; }
.opciones-pl input { position: absolute; opacity: 0; pointer-events: none; }
.opciones-pl span { display: inline-block; padding: 5px 10px; border: 1px solid var(--line-input, var(--line)); border-radius: 999px; font-size: 13px; cursor: pointer; background: var(--panel); color: var(--ink); user-select: none; }
.opciones-pl input:checked + span { background: var(--accent); border-color: var(--accent); color: var(--sobre-accent, #fff); }
.opciones-pl input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
.vars-pl button { border: 1px dashed var(--line-input, var(--line)); background: var(--track); color: var(--ink-2); border-radius: 4px; padding: 3px 8px; font: 12.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; cursor: pointer; }
.vars-pl button:hover { border-color: var(--accent); color: var(--ink); }
#pl-cuerpo { min-height: 220px; font-size: 13.5px; }
.ejemplo-pl { background: var(--track); border-radius: 6px; padding: 10px 12px; margin: 4px 0 12px; font-size: 13px; }
.ejemplo-pl .ej-asunto { margin: 6px 0; font-weight: 600; overflow-wrap: anywhere; }
.ejemplo-pl pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; margin: 0; max-height: 260px; overflow: auto; }
"""
ADMIN_JS = RENDER_JS + r"""  var PLANT = null, plEditando = null, plCampo = null;
  var TIPOS_ALERTA = [['VOLUMEN_BAJO', 'Entra menos tráfico'], ['VOLUMEN_ALTO', 'Entra mucho más tráfico'], ['APROBACION_BAJA', 'Se aprueban menos'],
    ['RECHAZO_ALTO', 'Suben los rechazos'], ['ERROR_ALTO', 'Suben los errores técnicos'], ['LATENCIA_ALTA', 'Responde lento'],
    ['SIN_EXITOS', 'No se aprueba nada'], ['IMPORTE_BAJO', 'Menos dinero'], ['IMPORTE_ALTO', 'Más dinero'], ['VENTANA_FALTANTE', 'Dejaron de llegar datos'],
    ['DATO_TARDIO', 'Datos con demora'], ['DATO_INCONSISTENTE', 'Datos que no cierran'], ['SIN_PREDICCION', 'Cliente nuevo']];
  var PL_TIPO_TXT = {}; TIPOS_ALERTA.forEach(function (t) { PL_TIPO_TXT[t[0]] = t[1]; });
  var CUANDO_TXT = { TODAS: 'Abiertas y resueltas', ABIERTA: 'Solo abiertas', RESUELTA: 'Solo resueltas' };
  var VARIABLES = [['alerta', 'Problema · cliente'], ['problema', 'Qué pasa'], ['cliente', 'Cliente'], ['servicio', 'Servicio y canal'], ['ambiente', 'Ambiente'],
    ['desde', 'Desde cuándo'], ['duracion', 'Cuánto lleva o duró'], ['gravedad', 'Gravedad'], ['prioridad', 'Prioridad'], ['etiqueta', 'Prioridad y gravedad, o "Resuelta"'],
    ['medicion', 'Última medición'], ['estado', 'Estado y quién la tiene'], ['responsable', 'Quién la tiene'], ['equipo', 'Equipo'],
    ['ultima_novedad', 'Último comentario'], ['resolucion', 'Cómo se resolvió'], ['enlace', 'Enlace a la alerta'], ['firma', 'Nombre de quien envía']];
  function ejemploPl(cuando) {
    var res = cuando === 'RESUELTA';
    return { alerta: 'Suben los rechazos · CLI_004', problema: 'Suben los rechazos', cliente: 'CLI_004', servicio: 'Transferencias por app', ambiente: 'PROD',
      desde: '26/10/2026 11:30', duracion: res ? '1 h 10 min' : '45 min', gravedad: 'Importante', prioridad: 'P2', etiqueta: res ? 'Resuelta' : 'P2 · Importante',
      medicion: '18,4 %, cuando se esperaba 6,1 % (12:00 a 12:15)',
      estado: res ? 'Resuelta el 26/10/2026 12:40' : 'En curso, a cargo de Sol Porte (equipo Mesa)', responsable: 'Sol Porte', equipo: res ? '' : 'Mesa',
      ultima_novedad: 'Revisen el conector del gateway', resolucion: res ? 'Causa: Proveedor o gateway; se hizo: se escaló' : '',
      enlace: location.origin + '/alerta/…', firma: (yo && yo.nombre) || 'Ana Lista' };
  }
  function cargarPlantillas() {
    return pedir('/api/admin/plantillas-correo').then(function (d) { PLANT = d; pintarPlantillas(); });
  }
  function pintarPlantillas() {
    $('plant-aviso').hidden = !PLANT.falta_script;
    $('plant-aviso').textContent = PLANT.falta_script ? 'Se muestran las plantillas de fábrica. Para crear o cambiar plantillas falta correr 18_plantillas_correo_d1.txt en la consola de D1.' : '';
    var ps = PLANT.plantillas.slice().sort(function (x, y) { return (x.sector || '').localeCompare(y.sector || '') || x.nombre.localeCompare(y.nombre); });
    $('t-plantillas').innerHTML = ps.length ? '<thead><tr><th>Plantilla</th><th>Sector</th><th>Tipos de alerta</th><th>Para qué alertas</th><th>Estado</th><th></th></tr></thead><tbody>' +
      ps.map(function (p) {
        return '<tr' + (p.activa ? '' : ' class="inactivo"') + '><td><b>' + esc(p.nombre) + '</b><br><small>' + esc(p.asunto) + '</small></td>' +
          '<td data-t="Sector">' + esc(p.sector || '—') + '</td>' +
          '<td data-t="Tipos de alerta">' + esc(p.tipos && p.tipos.length ? p.tipos.map(function (t) { return PL_TIPO_TXT[t] || t; }).join(', ') : 'Todas') + '</td>' +
          '<td data-t="Para qué alertas">' + esc(CUANDO_TXT[p.cuando] || p.cuando) + '</td>' +
          '<td data-t="Estado">' + (p.activa ? 'Activa' : 'Apagada') + '</td>' +
          '<td class="acc"><button class="btn chico" data-pl-editar="' + p.id + '">Editar</button><button class="btn chico" data-pl-copiar="' + p.id + '">Duplicar</button><button class="btn chico" data-pl-borrar="' + p.id + '">Borrar</button></td></tr>';
      }).join('') + '</tbody>' : '<tbody><tr><td class="vacio">No hay plantillas. Creá una con "Nueva plantilla".</td></tr></tbody>';
  }
  function ejemploPlantilla() {
    var v = ejemploPl($('pl-cuando').value);
    $('pl-ej-asunto').textContent = 'Asunto: ' + asuntoPlantilla($('pl-asunto').value, v);
    $('pl-ej-texto').textContent = textoPlantilla($('pl-cuerpo').value, v);
  }
  function abrirPlantilla(p, copia) {
    plEditando = p && !copia ? p : null;
    $('f-plantilla').reset(); $('pl-error').hidden = true;
    $('pl-titulo').textContent = plEditando ? 'Editar plantilla' : copia ? 'Duplicar plantilla' : 'Nueva plantilla';
    var sectores = {}; PLANT.plantillas.forEach(function (x) { if (x.sector) sectores[x.sector] = 1; });
    $('pl-sectores').innerHTML = Object.keys(sectores).sort().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');
    var tipos = p ? p.tipos || [] : [];
    $('pl-tipos').innerHTML = TIPOS_ALERTA.map(function (t) {
      return '<label><input type="checkbox" value="' + t[0] + '"' + (tipos.indexOf(t[0]) >= 0 ? ' checked' : '') + '><span>' + esc(t[1]) + '</span></label>';
    }).join('');
    $('pl-nombre').value = p ? (copia ? p.nombre + ' (copia)' : p.nombre) : '';
    $('pl-sector').value = p ? p.sector || '' : '';
    $('pl-cuando').value = p ? p.cuando : 'ABIERTA';
    $('pl-asunto').value = p ? p.asunto : '[{etiqueta}] {cliente} · {servicio}: {problema}';
    $('pl-cuerpo').value = p ? p.cuerpo : 'Hola,\n\n{problema} en {servicio} desde el {desde} (hora de Argentina).\n\n- Última medición: {medicion}\n- Estado: {estado}\n\n[Completar]\n\nSaludos,\n{firma}';
    $('pl-activa').checked = p ? !!p.activa : true; $('pl-activa-txt').textContent = $('pl-activa').checked ? 'Activa' : 'Apagada';
    plCampo = $('pl-cuerpo');
    ejemploPlantilla();
    $('dlg-plantilla').showModal(); $('pl-nombre').focus();
  }
  $('pl-vars').innerHTML = VARIABLES.map(function (v) { return '<button type="button" data-pl-var="' + v[0] + '" title="' + esc(v[1]) + '">{' + v[0] + '}</button>'; }).join('');
  ['pl-asunto', 'pl-cuerpo'].forEach(function (id) {
    $(id).addEventListener('focus', function () { plCampo = this; });
    $(id).addEventListener('input', ejemploPlantilla);
  });
  $('pl-cuando').addEventListener('change', ejemploPlantilla);
  $('pl-activa').addEventListener('change', function () { $('pl-activa-txt').textContent = this.checked ? 'Activa' : 'Apagada'; });
  $('pl-vars').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-pl-var]'); if (!b) return;
    var c = plCampo || $('pl-cuerpo'), t = '{' + b.getAttribute('data-pl-var') + '}';
    var i = c.selectionStart == null ? c.value.length : c.selectionStart, j = c.selectionEnd == null ? i : c.selectionEnd;
    c.value = c.value.slice(0, i) + t + c.value.slice(j); c.focus(); c.selectionStart = c.selectionEnd = i + t.length;
    ejemploPlantilla();
  });
  $('btn-nueva-plantilla').addEventListener('click', function () { if (PLANT) abrirPlantilla(null); });
  $('t-plantillas').addEventListener('click', function (ev) {
    var e = ev.target.closest('[data-pl-editar]'), c = ev.target.closest('[data-pl-copiar]'), b = ev.target.closest('[data-pl-borrar]');
    var el = e || c || b; if (!el) return;
    var id = Number(el.getAttribute(e ? 'data-pl-editar' : c ? 'data-pl-copiar' : 'data-pl-borrar'));
    var p = PLANT.plantillas.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (b) {
      if (!confirm('¿Borrar la plantilla "' + p.nombre + '"? No se puede deshacer.')) return;
      pedir('/api/admin/plantillas-correo/borrar', { id: id }).then(function () { toast('Plantilla borrada.'); return cargarPlantillas(); }).catch(function (x) { toast(x.message, true); });
    } else abrirPlantilla(p, !!c);
  });
  $('f-plantilla').addEventListener('submit', function (ev) {
    ev.preventDefault(); $('pl-error').hidden = true;
    var datos = {
      id: plEditando ? plEditando.id : null, nombre: $('pl-nombre').value.trim(), sector: $('pl-sector').value.trim(), cuando: $('pl-cuando').value,
      tipos: Array.prototype.map.call(document.querySelectorAll('#pl-tipos input:checked'), function (x) { return x.value; }),
      asunto: $('pl-asunto').value.trim(), cuerpo: $('pl-cuerpo').value, activa: $('pl-activa').checked ? 1 : 0
    };
    var b = $('pl-guardar'); b.disabled = true;
    pedir('/api/admin/plantillas-correo', datos).then(function () { $('dlg-plantilla').close(); toast(plEditando ? 'Plantilla guardada.' : 'Plantilla creada.'); return cargarPlantillas(); })
      .catch(function (x) { $('pl-error').textContent = x.message; $('pl-error').hidden = false; }).then(function () { b.disabled = false; });
  });
"""


def admin(h):
    i = h.index('</style>'); h = h[:i] + ADMIN_CSS + h[i:]
    h = _rep(h, "    { id: 'umbrales', txt: 'Umbrales', permiso: 'admin_umbrales' },",
             "    { id: 'umbrales', txt: 'Umbrales', permiso: 'admin_umbrales' },\n    { id: 'plantillas', txt: 'Plantillas de correo', permiso: 'admin_plantillas' },")
    h = _rep(h, "id === 'umbrales' ? cargarUmbrales() :", "id === 'umbrales' ? cargarUmbrales() : id === 'plantillas' ? cargarPlantillas() :")
    h = _rep(h, '  <section id="s-modelo" hidden>', ADMIN_SECCION + '  <section id="s-modelo" hidden>')
    h = _rep(h, '<dialog id="dlg-regla">', ADMIN_DIALOGO + '<dialog id="dlg-regla">')
    h = _rep(h, '  function cargarReglas() {', ADMIN_JS + '  function cargarReglas() {')
    h = _rep(h, "PREPARAR_CORREO: 'Preparó un correo', ",
             "PREPARAR_CORREO: 'Preparó un correo', ALTA_PLANTILLA_CORREO: 'Creó una plantilla de correo', EDITAR_PLANTILLA_CORREO: 'Cambió una plantilla de correo', BORRAR_PLANTILLA_CORREO: 'Borró una plantilla de correo', ")
    return h


# ---------------------------------------------------------------- Servidor
ENVIO_VIEJO = """  let comentario;
  if (resultado === 'SIN_CAMBIOS') comentario = MARCAS_ENVIO.SIN_CAMBIOS + asunto + '» sin cambios';
  else if (resultado === 'NO_ENVIADO') comentario = MARCAS_ENVIO.NO_ENVIADO + asunto + '»';
  else {
    const texto = correoTexto(b.texto);
    if (texto.length < 3) return jsonError('Pegá el texto que se envió.', 400);
    comentario = MARCAS_ENVIO.CON_CAMBIOS + asunto + '» con cambios' + CORREO_SEPARADOR + texto;
  }"""
ENVIO_NUEVO = """  // A quién se envió de verdad (parche 40): lo confirma la persona; puede ser distinto de lo que se escribió al armarlo
  let dest = '';
  if (resultado !== 'NO_ENVIADO') {
    const para = correoDestinos(b.para), cc = correoDestinos(b.cc);
    if (para.malos.length || cc.malos.length) return jsonError('Revisá estas direcciones: ' + para.malos.concat(cc.malos).join(', ') + '.', 400);
    if (!para.lista.length) return jsonError('Escribí a quién se envió.', 400);
    dest = ' para ' + para.lista.join(', ') + (cc.lista.length ? ' (copia a ' + cc.lista.join(', ') + ')' : '');
  }
  let comentario;
  if (resultado === 'SIN_CAMBIOS') comentario = MARCAS_ENVIO.SIN_CAMBIOS + asunto + '» sin cambios' + dest;
  else if (resultado === 'NO_ENVIADO') comentario = MARCAS_ENVIO.NO_ENVIADO + asunto + '»';
  else {
    const texto = correoTexto(b.texto);
    if (texto.length < 3) return jsonError('Pegá el texto que se envió.', 400);
    comentario = MARCAS_ENVIO.CON_CAMBIOS + asunto + '» con cambios' + dest + CORREO_SEPARADOR + texto;
  }"""


def servidor(s):
    s = _rep(s, "  admin_umbrales: ['ADMIN'],", "  admin_plantillas: ['ADMIN'],                         // plantillas de correo (parche 40)\n  admin_umbrales: ['ADMIN'],")
    s = _rep(s, ENVIO_VIEJO, ENVIO_NUEVO)
    s = _rep(s, "  const comentario = MARCA_CORREO + asunto + '»' + dest + copia + (texto ? CORREO_SEPARADOR + texto : '');",
             "  const plantilla = String(b.plantilla || '').replace(/[\\u0000-\\u001f\\u007f\"«»]/g, ' ').trim().slice(0, 80);\n"
             "  const comentario = MARCA_CORREO + asunto + '»' + dest + copia + (plantilla ? ' con la plantilla \"' + plantilla + '\"' : '') + (texto ? CORREO_SEPARADOR + texto : '');")
    s = _rep(s, "tipos_permitidos: Object.keys(ADJ_TIPOS), marca_adjunto: MARCA_ADJUNTO,",
             "tipos_permitidos: Object.keys(ADJ_TIPOS), marca_adjunto: MARCA_ADJUNTO, plantillas_correo: rol.trabaja ? await plantillasActivas(env) : [],")
    s = _rep(s, "async function rutasTicketera(env, request, ruta, yo) {", _leer('plantillas_server.js') + "async function rutasTicketera(env, request, ruta, yo) {")
    s = _rep(s, "  if (ruta === '/api/admin/catalogo-resolucion') {",
             "  if (ruta === '/api/admin/plantillas-correo' || ruta === '/api/admin/plantillas-correo/borrar') {\n"
             "    if (!puede(yo, 'admin_plantillas')) return jsonError('Tu perfil no tiene permiso para esta acción.', 403);\n"
             "    const borrar = ruta.endsWith('/borrar');\n"
             "    if (m !== 'POST' && (borrar || m !== 'GET')) return null;\n"
             "    return await adminPlantillas(env, request, yo, borrar);\n"
             "  }\n"
             "  if (ruta === '/api/admin/catalogo-resolucion') {")
    return s


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ALERTA_HTML', detalle)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
