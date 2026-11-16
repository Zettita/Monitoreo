# Parche 39: preparar un correo desde la alerta (Outlook web o de escritorio) y confirmar después si se envió.
#
#   - Detalle de la alerta: botón "Preparar correo" (Analista; Soporte en lo suyo o de su equipo; abierta o resuelta).
#     El diálogo arma el asunto y el texto con los datos de la alerta (qué pasa, cliente, servicio, desde cuándo, gravedad,
#     prioridad, última medición, estado y quién la tiene, última novedad, enlace) y deja completar Para, CC, asunto y texto.
#     "Abrir en Outlook web" (outlook.office.com, Microsoft 365) o "Outlook de escritorio" (enlace mailto) abren un correo nuevo
#     ya cargado; "Copiar texto" por si el enlace no abre. Helios no envía correos ni se conecta a Microsoft 365.
#   - Al abrirlo queda en la conversación "preparó un correo" (asunto, destinatarios y el texto armado) con
#     "Falta confirmar si se envió" y el botón "Confirmar envío": se envió tal cual, se envió con cambios (con el texto final)
#     o no se envió. Todo como comentarios en alerta_eventos (correo_server.js) y en la auditoría.
#   - Sin SQL nuevo.
import json, os

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


CSS = """/* Correo desde la alerta (parche 39) */
.hilo li.correo::before { background: var(--morado, var(--accent)); }
.leyenda-hilo i.cor { background: var(--morado, var(--accent)); }
.correo-texto { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 13px; margin: 6px 0 0; max-height: 280px; overflow: auto; padding: 8px 10px; background: var(--track); border-radius: 4px; }
.burbuja details summary { cursor: pointer; color: var(--link, var(--accent)); font-size: 13px; margin-top: 4px; }
.burbuja .dest { display: block; color: var(--ink-3); font-size: 12.5px; overflow-wrap: anywhere; }
.correo-estado { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; font-size: 13px; }
.correo-estado .tag-env { padding: 2px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.correo-estado .pend { background: var(--media-bg); color: var(--media-txt); }
.correo-estado .env { background: var(--ok-bg); color: var(--ok-txt); }
.correo-estado .no { background: var(--track); color: var(--ink-2); }
#dlg-correo { width: min(720px, calc(100vw - 32px)); }
#m-texto { min-height: 260px; font-size: 13.5px; }
#e-texto { min-height: 200px; font-size: 13.5px; }
.acc-dlg.correo-acc { flex-wrap: wrap; }
"""

DIALOGOS = """<!-- Preparar correo (parche 39) -->
<dialog id="dlg-correo">
  <form id="f-correo" method="dialog">
    <h2>Preparar correo</h2>
    <p class="bajada">Helios arma el borrador con los datos de la alerta. Revisalo, completalo y abrilo en Outlook para enviarlo desde ahí. Después, confirmá en la conversación si se envió.</p>
    <label class="campo"><span>Para</span><input id="m-para" type="text" autocomplete="off" placeholder="nombre@empresa.com; otra@empresa.com"></label>
    <label class="campo"><span>CC <small class="gris">(opcional)</small></span><input id="m-cc" type="text" autocomplete="off"></label>
    <label class="campo"><span>Asunto</span><input id="m-asunto" type="text" maxlength="200"></label>
    <label class="campo"><span>Texto</span><textarea id="m-texto" maxlength="6000"></textarea><small class="ayuda">Completá lo que está entre corchetes antes de enviarlo.</small></label>
    <p class="error-form" id="m-error" hidden></p>
    <div class="acc-dlg correo-acc"><button type="button" class="btn" id="m-copiar">Copiar texto</button><span style="flex:1"></span><button type="button" class="btn" data-cerrar>Cancelar</button><button type="button" class="btn" id="m-escritorio">Outlook de escritorio</button><button type="button" class="btn primario" id="m-web">Abrir en Outlook web</button></div>
  </form>
</dialog>

<!-- Confirmar el envío de un correo (parche 39) -->
<dialog id="dlg-envio">
  <form id="f-envio" method="dialog">
    <h2>¿Se envió el correo?</h2>
    <p class="bajada" id="e-asunto"></p>
    <div class="opciones" id="e-opciones">
      <label class="opcion"><input type="radio" name="e-res" value="SIN_CAMBIOS"><span>Se envió tal cual</span></label>
      <label class="opcion"><input type="radio" name="e-res" value="CON_CAMBIOS"><span>Se envió con cambios</span></label>
      <label class="opcion"><input type="radio" name="e-res" value="NO_ENVIADO"><span>No se envió</span></label>
    </div>
    <label class="campo grupo-res" id="e-texto-campo" hidden><span>Texto que se envió</span><textarea id="e-texto" maxlength="6000"></textarea><small class="ayuda">Pegá el texto final o corregí el que armó Helios.</small></label>
    <p class="error-form" id="e-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="e-guardar">Guardar</button></div>
  </form>
</dialog>

"""

JS = r"""  // ---------- Correo desde la alerta (parche 39) ----------
  var COR_MARCA = 'Preparó un correo «', COR_SEP = '\n---\n';
  var ENV_SIN = 'Envió el correo «', ENV_NO = 'No envió el correo «';
  var COR_OK = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
  var correoEnCurso = null;
  function esMarcaSistema(c) {
    return !c || c.indexOf(d.marca_adjunto) === 0 || c.indexOf('Borró el archivo «') === 0 || c.indexOf(COR_MARCA) === 0 || c.indexOf(ENV_SIN) === 0 || c.indexOf(ENV_NO) === 0;
  }
  // Partes de un comentario de correo: asunto, cabecera (para / copia) y texto
  function partesCorreo(c, marca) {
    var r = c.slice(marca.length), k = r.indexOf('»'), resto = r.slice(k + 1), s = resto.indexOf(COR_SEP);
    return { asunto: r.slice(0, k), cab: (s >= 0 ? resto.slice(0, s) : resto).trim(), texto: s >= 0 ? resto.slice(s + COR_SEP.length) : '' };
  }
  function tipoEnvio(c) {
    if (!c) return null;
    if (c.indexOf(ENV_NO) === 0) return 'NO_ENVIADO';
    if (c.indexOf(ENV_SIN) === 0) return / con cambios/.test(c.split(COR_SEP)[0]) ? 'CON_CAMBIOS' : 'SIN_CAMBIOS';
    return null;
  }
  // Cada confirmación es del primer correo de ese asunto que todavía no tenía (en el orden en que se guardaron)
  function parearCorreos() {
    var cola = {}, par = {};
    d.eventos.slice().sort(function (x, y) { return x.id - y.id; }).forEach(function (e) {
      if (e.accion !== 'COMENTAR' || !e.comentario) return;
      if (e.comentario.indexOf(COR_MARCA) === 0) { var a = partesCorreo(e.comentario, COR_MARCA).asunto; (cola[a] = cola[a] || []).push(e.id); return; }
      var t = tipoEnvio(e.comentario); if (!t) return;
      var asu = partesCorreo(e.comentario, t === 'NO_ENVIADO' ? ENV_NO : ENV_SIN).asunto, q = cola[asu];
      if (q && q.length) par[q.shift()] = e;
    });
    return par;
  }
  var ENV_TXT = { SIN_CAMBIOS: 'Enviado sin cambios', CON_CAMBIOS: 'Enviado con cambios', NO_ENVIADO: 'No se envió' };
  function liCorreo(e, conf) {
    var x = partesCorreo(e.comentario, COR_MARCA), estado;
    if (conf) {
      var t = tipoEnvio(conf.comentario);
      estado = '<span class="tag-env ' + (t === 'NO_ENVIADO' ? 'no' : 'env') + '">' + esc(ENV_TXT[t]) + '</span><small class="gris">' + esc((conf.usuario_nombre || '') + ', ' + diaHora(conf.fecha)) + '</small>';
    } else {
      estado = '<span class="tag-env pend">Falta confirmar si se envió</span>' + (d.puedo.correo ? '<button type="button" class="btn chico" data-envio="' + e.id + '">Confirmar envío</button>' : '');
    }
    return '<li class="correo"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> preparó un correo<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja"><b>' + esc(x.asunto) + '</b>' + (x.cab ? '<span class="dest">' + esc(x.cab) + '</span>' : '') +
      (x.texto ? '<details><summary>Ver el texto armado</summary><pre class="correo-texto">' + esc(x.texto) + '</pre></details>' : '') + '</div>' +
      '<div class="correo-estado">' + estado + '</div></li>';
  }
  function liEnvio(e) {
    var t = tipoEnvio(e.comentario), x = partesCorreo(e.comentario, t === 'NO_ENVIADO' ? ENV_NO : ENV_SIN);
    var txt = t === 'NO_ENVIADO' ? 'indicó que el correo no se envió' : t === 'CON_CAMBIOS' ? 'confirmó que el correo se envió con cambios' : 'confirmó que el correo se envió sin cambios';
    return '<li class="correo"><div class="quien"><b>' + esc(e.usuario_nombre || '') + '</b> ' + esc(txt) + '<time>' + esc(diaHora(e.fecha)) + '</time></div>' +
      '<div class="burbuja">«' + esc(x.asunto) + '»' + (x.texto ? '<details><summary>Ver el texto que se envió</summary><pre class="correo-texto">' + esc(x.texto) + '</pre></details>' : '') + '</div></li>';
  }

  // En el correo, fecha completa (se puede leer otro día): 26/10/2026 11:45
  function fechaCorreo(iso) {
    var x = aFecha(iso); if (!x || isNaN(x)) return '';
    return x.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ }) + ' ' + hora(iso);
  }
  // Borrador con los datos de la alerta
  function correoArmado() {
    var u = info.ult, p = info.prim, a = info.a, res = info.resuelta;
    var fin = res ? aFecha(u.fecha_resolucion) : aFecha(d.ahora), mins = Math.max(0, Math.round((fin - aFecha(p.ventana_inicio)) / 60000));
    var problema = frase(u.tipo_alerta, u), ultCom = null;
    d.eventos.forEach(function (e) { if (e.comentario && e.accion !== 'RESOLVER' && !esMarcaSistema(e.comentario)) ultCom = e; });
    var asunto = (res ? '[Resuelta] ' : '[P' + info.prio + ' · ' + (SEV_TXT[info.sev] || info.sev) + '] ') + u.cliente_id + ' · ' + servicio(u) + ': ' + problema;
    var L = ['Hola,', '',
      res ? 'Les compartimos el cierre de un problema que detectó Helios, el monitoreo de transacciones:' : 'Les escribimos por un problema que detectó Helios, el monitoreo de transacciones:', '',
      '- Qué pasa: ' + problema,
      '- Cliente: ' + u.cliente_id,
      '- Servicio: ' + servicio(u) + ' (ambiente ' + u.ambiente + ')',
      '- Desde: ' + fechaCorreo(p.ventana_inicio) + ' (hora de Argentina)',
      '- ' + (res ? 'Duró: ' : 'Lleva: ') + minutosTxt(mins),
      '- Gravedad: ' + (SEV_TXT[info.sev] || info.sev) + (res ? '' : ', prioridad P' + info.prio),
      '- Última medición (' + hora(u.ventana_inicio) + ' a ' + hora(u.ventana_fin) + '): ' + valor(u.metrica, u.valor_observado) + ', cuando se esperaba ' + valor(u.metrica, u.valor_esperado)];
    if (res) {
      var r = d.resolucion;
      L.push('- Resuelta: ' + fechaCorreo(u.fecha_resolucion) + (r && r.causa ? '. Causa: ' + r.causa : '') + (r && r.acciones && r.acciones.length ? '. Se hizo: ' + r.acciones.join(', ').toLowerCase() : ''));
    } else {
      L.push('- Estado: ' + info.estado[0] + (a.asignado_nombre ? ', a cargo de ' + a.asignado_nombre : '') + (a.equipo_nombre ? ' (equipo ' + a.equipo_nombre + ')' : ''));
    }
    if (ultCom) L.push('- Última novedad: ' + ultCom.comentario.replace(/\s+/g, ' ').slice(0, 300));
    L.push('', res ? '[Completar: qué se hizo y si hace falta algo más de su lado]' : '[Completar: qué necesitamos de ustedes y próximos pasos]', '',
      'Ver la alerta en Helios (para usuarios de Helios): ' + location.origin + '/alerta/' + ID, '', 'Saludos,', yo.nombre);
    return { asunto: asunto, texto: L.join('\n') };
  }
  function abrirCorreo() {
    $('f-correo').reset(); errorForm('m-error');
    var m = correoArmado();
    $('m-asunto').value = m.asunto; $('m-texto').value = m.texto;
    $('dlg-correo').showModal(); $('m-para').focus();
  }
  function listaCorreos(v) { return v.split(/[;,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function leerCorreo() {
    errorForm('m-error');
    var m = { para: listaCorreos($('m-para').value), cc: listaCorreos($('m-cc').value), asunto: $('m-asunto').value.replace(/\s+/g, ' ').trim(), texto: $('m-texto').value.trim() };
    var malos = m.para.concat(m.cc).filter(function (x) { return !COR_OK.test(x); });
    if (malos.length) { errorForm('m-error', 'Revisá estas direcciones: ' + malos.join(', ') + '.'); return null; }
    if (m.asunto.length < 3) { errorForm('m-error', 'Escribí el asunto.'); return null; }
    return m;
  }
  var enc = encodeURIComponent, crlf = function (t) { return t.replace(/\r?\n/g, '\r\n'); };
  function urlWeb(m, conTexto) {
    var q = [];
    if (m.para.length) q.push('to=' + enc(m.para.join(';')));
    if (m.cc.length) q.push('cc=' + enc(m.cc.join(';')));
    q.push('subject=' + enc(m.asunto));
    if (conTexto) q.push('body=' + enc(crlf(m.texto)));
    return 'https://outlook.office.com/mail/deeplink/compose?' + q.join('&');
  }
  function urlEscritorio(m, conTexto) {
    var q = [];
    if (m.cc.length) q.push('cc=' + m.cc.map(enc).join(','));
    q.push('subject=' + enc(m.asunto));
    if (conTexto) q.push('body=' + enc(crlf(m.texto)));
    return 'mailto:' + m.para.map(enc).join(',') + '?' + q.join('&');
  }
  function copiarTexto(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return copiarViejo(t); });
    return Promise.resolve(copiarViejo(t));
  }
  function copiarViejo(t) {
    var x = document.createElement('textarea'); x.value = t; x.setAttribute('readonly', ''); x.style.position = 'fixed'; x.style.opacity = '0';
    $('dlg-correo').appendChild(x); x.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} x.remove(); return ok;
  }
  // Deja registro en la alerta (no espera: el correo ya se abrió)
  function registrarCorreo(m) {
    $('dlg-correo').close();
    pedir('/api/alertas/' + ID + '/correo', { para: m.para, cc: m.cc, asunto: m.asunto, texto: m.texto })
      .then(function () { return cargar(); })
      .catch(function (e) { toast('El correo se abrió, pero no quedó registrado en la alerta: ' + e.message, true); });
  }
  // Los enlaces muy largos no abren (sobre todo en Outlook de escritorio): ahí se abre sin el texto y el texto queda copiado
  var MAX_WEB = 7000, MAX_ESCRITORIO = 1800;
  function abrirEn(m, armar, max, abrir) {
    var url = armar(m, true), corto = url.length > max;
    if (corto) url = armar(m, false);
    var listo = corto ? copiarTexto(m.texto) : Promise.resolve(false);
    abrir(url);
    listo.then(function (copiado) {
      toast(corto ? (copiado ? 'El texto es largo para el enlace: se abrió el correo sin el texto y el texto quedó copiado. Pegalo con Ctrl+V.' : 'El texto es largo para el enlace: se abrió el correo sin el texto. Copialo con "Copiar texto".')
        : 'Se abrió el correo en Outlook. Cuando lo envíes, confirmalo en la conversación.');
    });
    registrarCorreo(m);
  }
  $('m-web').addEventListener('click', function () {
    var m = leerCorreo(); if (!m) return;
    abrirEn(m, urlWeb, MAX_WEB, function (u) { window.open(u, '_blank', 'noopener'); });
  });
  $('m-escritorio').addEventListener('click', function () {
    var m = leerCorreo(); if (!m) return;
    abrirEn(m, urlEscritorio, MAX_ESCRITORIO, function (u) { var x = document.createElement('a'); x.href = u; document.body.appendChild(x); x.click(); x.remove(); });
  });
  $('m-copiar').addEventListener('click', function () {
    copiarTexto($('m-texto').value).then(function (ok) { toast(ok ? 'Texto copiado.' : 'No se pudo copiar: seleccioná el texto y copialo a mano.', !ok); });
  });

  // Confirmar el envío
  var envioDe = null;
  $('hilo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-envio]'); if (!b) return;
    var id = Number(b.getAttribute('data-envio'));
    var e = d.eventos.filter(function (x) { return x.id === id; })[0]; if (!e) return;
    envioDe = e; var x = partesCorreo(e.comentario, COR_MARCA);
    $('f-envio').reset(); errorForm('e-error'); $('e-texto-campo').hidden = true;
    $('e-asunto').textContent = '«' + x.asunto + '»' + (x.cab ? ' ' + x.cab : '');
    $('e-texto').value = x.texto;
    $('dlg-envio').showModal();
  });
  $('e-opciones').addEventListener('change', function () {
    var v = (document.querySelector('input[name="e-res"]:checked') || {}).value;
    $('e-texto-campo').hidden = v !== 'CON_CAMBIOS';
    if (v === 'CON_CAMBIOS') $('e-texto').focus();
  });
  $('f-envio').addEventListener('submit', function (ev) {
    ev.preventDefault(); errorForm('e-error');
    var v = (document.querySelector('input[name="e-res"]:checked') || {}).value;
    if (!v) { errorForm('e-error', 'Elegí qué pasó con el correo.'); return; }
    var txt = $('e-texto').value.trim();
    if (v === 'CON_CAMBIOS' && txt.length < 3) { errorForm('e-error', 'Pegá el texto que se envió.'); return; }
    var b = $('e-guardar'); b.disabled = true;
    pedir('/api/alertas/' + ID + '/correo/envio', { evento_id: envioDe.id, resultado: v, texto: v === 'CON_CAMBIOS' ? txt : '' })
      .then(function () { $('dlg-envio').close(); toast('Listo: quedó registrado en la conversación.'); return cargar(); })
      .catch(function (e) { errorForm('e-error', e.message); }).then(function () { b.disabled = false; });
  });

"""


def pagina(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]   # en el primer bloque de estilos, como los parches anteriores
    h = _rep(h, '<dialog id="dlg-devolver">', DIALOGOS + '<dialog id="dlg-devolver">')
    h = _rep(h, "    $('acciones').innerHTML = acc;",
             "    if (p.correo) acc += '<button class=\"btn\" data-acc=\"correo\">Preparar correo</button>';\n    $('acciones').innerHTML = acc;")
    h = _rep(h, "    } else if (acc === 'resolver') abrirResolver();",
             "    } else if (acc === 'correo') abrirCorreo();\n    else if (acc === 'resolver') abrirResolver();")
    h = _rep(h, "  $('acciones').addEventListener('click'", JS + "  $('acciones').addEventListener('click'")
    # Conversación: el correo y su confirmación se muestran aparte
    h = _rep(h, "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Borró el archivo «') === 0) {",
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf(COR_MARCA) === 0) return liCorreo(e, parCorreos[e.id]);\n"
             "      if (e.accion === 'COMENTAR' && tipoEnvio(e.comentario)) return liEnvio(e);\n"
             "      if (e.accion === 'COMENTAR' && e.comentario && e.comentario.indexOf('Borró el archivo «') === 0) {")
    h = _rep(h, "    var libres = d.adjuntos.slice(), marca = d.marca_adjunto;",
             "    var libres = d.adjuntos.slice(), marca = d.marca_adjunto, parCorreos = parearCorreos();")
    h = _rep(h, '<li><i class="res"></i>Resolución</li>', '<li><i class="cor"></i>Correo</li><li><i class="res"></i>Resolución</li>')
    return h


def servidor(s):
    s = _rep(s, "    reasignar: ab && !rol.analista && rol.loLidero,\n  };",
             "    reasignar: ab && !rol.analista && rol.loLidero,\n    correo: rol.trabaja,   // preparar un correo y confirmar su envío (parche 39), también con la alerta resuelta\n  };")
    s = _rep(s, "async function rutasTicketera(env, request, ruta, yo) {", _leer('correo_server.js') + "async function rutasTicketera(env, request, ruta, yo) {")
    s = _rep(s, "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/(detalle|adjuntos)",
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo(\\/envio)?$/);\n"
             "  if (x) { if (m !== 'POST') return null; return x[2] ? await confirmarEnvioCorreo(env, request, yo, x[1]) : await registrarCorreo(env, request, yo, x[1]); }\n"
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/(detalle|adjuntos)")
    return s


def admin(h):
    return _rep(h, "    ASISTENTE: 'Consultó al asistente', ",
                "    ASISTENTE: 'Consultó al asistente', PREPARAR_CORREO: 'Preparó un correo', CONFIRMAR_CORREO: 'Confirmó el envío de un correo', ")


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ALERTA_HTML', pagina)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
