# Parche 29: contexto externo para el asistente de IA.
#
#   - Herramienta nueva del asistente "contexto_externo" (todos los perfiles): calendario (feriados, fines de semana
#     largos, cobro de sueldos, aguinaldo, eventos comerciales), incidentes y mantenimientos de proveedores y noticias
#     de Argentina de las últimas 48 h. Proveedores y noticias se guardan una hora en contexto_externo.
#   - Pregunta sugerida en todos los perfiles: "¿Hay algo de afuera que pueda afectar hoy o mañana?".
#   - Regla 6 de las instrucciones: sigue limitado a Helios, pero lo de afuera que afecta la operación se responde
#     solo con esa herramienta y citando la fuente.
#   - Administración > Umbrales: sección "Eventos comerciales" (alta y baja; solo Administrador; queda en auditoría).
#   - En el panel del asistente, los enlaces https se pueden tocar (se abren en otra pestaña).
#   - Necesita las tablas contexto_externo y eventos_comerciales (script 12). No cambia nada de lo que ya existía.
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


REGLA6_VIEJA = ("'6. Solo hablás de Helios: la operación de los clientes, alertas, pre-alertas, incidentes, equipos y cómo usar la plataforma. "
                "Si la pregunta es de otro tema (deportes, famosos, política, noticias, cultura general, chistes), contestá solo: "
                "\"Solo puedo ayudarte con la operación y las alertas de Helios.\" Nunca respondas de memoria cosas del mundo: tu conocimiento puede estar viejo o equivocado.',")
REGLA6_NUEVA = ("'6. Solo hablás de Helios: la operación de los clientes, alertas, pre-alertas, incidentes, equipos y cómo usar la plataforma. "
                "También de lo de afuera que puede afectar la operación (feriados, fines de semana largos, cobro de sueldos, aguinaldo, eventos comerciales, "
                "caídas o mantenimientos de proveedores, noticias de paros, cortes o problemas bancarios), pero solo con los datos de la herramienta contexto_externo: "
                "citá de dónde sale cada cosa (calendario de Helios, el proveedor o el medio) y su fecha, aclará que las noticias no están verificadas por Helios, "
                "y si podés, cruzalo con las alertas y los servicios del cliente. Si contexto_externo no trae nada, decí que no encontraste nada. "
                "Si la pregunta es de otro tema (deportes, famosos, política, cultura general, chistes), contestá solo: "
                "\"Solo puedo ayudarte con la operación y las alertas de Helios.\" Nunca respondas de memoria cosas del mundo: tu conocimiento puede estar viejo o equivocado.',")

SECCION = '''
    <div class="cab-seccion" style="margin-top:30px">
      <div><h2>Eventos comerciales</h2><p class="bajada">Black Friday, CyberMonday, Hot Sale, una promo de un cliente… Días en los que se espera más (o menos) tráfico. El asistente los tiene en cuenta cuando le preguntan qué puede afectar la operación.</p></div>
      <button class="btn primario" id="btn-ev-nuevo">Agregar evento</button>
    </div>
    <div class="panel"><div class="tabla-scroll"><table class="resp" id="t-eventos"></table></div></div>'''

DIALOGO = '''
<!-- Diálogo: evento comercial (parche 29) -->
<dialog id="dlg-evento">
  <form id="f-evento" method="dialog">
    <h2>Agregar evento comercial</h2>
    <p class="bajada">Un día o varios con movimiento distinto al habitual. Si es de un solo cliente o servicio, completalo; si no, vale para todos.</p>
    <label class="campo"><span>Nombre</span><input type="text" id="ev-nombre" maxlength="100" required autocomplete="off" placeholder="Ej.: Hot Sale 2027"></label>
    <div class="fila-campos dos">
      <label class="campo"><span>Desde</span><input type="text" id="ev-desde" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" required autocomplete="off"></label>
      <label class="campo"><span>Hasta</span><input type="text" id="ev-hasta" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA (vacío = un día)" autocomplete="off"></label>
    </div>
    <div class="fila-campos dos">
      <label class="campo"><span>Cliente (opcional)</span><input type="text" id="ev-cliente" maxlength="40" autocomplete="off" placeholder="Todos"></label>
      <label class="campo"><span>Servicio (opcional)</span><input type="text" id="ev-servicio" maxlength="40" autocomplete="off" placeholder="Todos"></label>
    </div>
    <label class="campo"><span>Qué se espera</span><select id="ev-efecto"><option value="MAS_TRAFICO">Más tráfico de lo normal</option><option value="MENOS_TRAFICO">Menos tráfico de lo normal</option></select></label>
    <label class="campo"><span>Nota (opcional)</span><input type="text" id="ev-nota" maxlength="200" autocomplete="off" placeholder="Ej.: promo de recargas con 20 % de reintegro"></label>
    <p class="error-form" id="ev-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="ev-guardar">Agregar</button></div>
  </form>
</dialog>
'''

JS = r'''  // Eventos comerciales (parche 29)
  function fechaIso(v) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; }
  function fechaCorta(f) { return f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4); }
  function cargarEventos() {
    return pedir('/api/admin/eventos').then(function (d) {
      $('t-eventos').innerHTML = d.eventos.length ? '<thead><tr><th>Evento</th><th>Cuándo</th><th>Para</th><th>Qué se espera</th><th></th></tr></thead><tbody>' +
        d.eventos.map(function (e) {
          return '<tr><td><b>' + esc(e.nombre) + '</b>' + (e.nota ? '<br><small>' + esc(e.nota) + '</small>' : '') + '</td>' +
            '<td data-t="Cuándo">' + (e.fecha_desde === e.fecha_hasta ? fechaCorta(e.fecha_desde) : fechaCorta(e.fecha_desde) + ' al ' + fechaCorta(e.fecha_hasta)) + '</td>' +
            '<td data-t="Para">' + esc([e.cliente_id, e.servicio_id].filter(Boolean).join(' · ') || 'Todos') + '</td>' +
            '<td data-t="Qué se espera"><span class="chip">' + (e.efecto_esperado === 'MENOS_TRAFICO' ? 'Menos tráfico' : 'Más tráfico') + '</span></td>' +
            '<td class="acc"><button class="btn chico" data-quitar-evento="' + e.id + '">Quitar</button></td></tr>';
        }).join('') + '</tbody>' : '<tbody><tr><td class="vacio">No hay eventos cargados. Tocá "Agregar evento".</td></tr></tbody>';
    });
  }
  ['ev-desde', 'ev-hasta'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      var n = this.value.replace(/\D/g, '').slice(0, 8);
      this.value = n.length > 4 ? n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4) : n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
    });
  });
  $('btn-ev-nuevo').addEventListener('click', function () { $('f-evento').reset(); errorForm('ev-error'); $('dlg-evento').showModal(); $('ev-nombre').focus(); });
  $('f-evento').addEventListener('submit', function (ev) {
    ev.preventDefault(); errorForm('ev-error');
    var desde = fechaIso($('ev-desde').value), hasta = $('ev-hasta').value.trim() ? fechaIso($('ev-hasta').value) : desde;
    if (!desde || !hasta) { errorForm('ev-error', 'Las fechas tienen que ser DD/MM/AAAA.'); return; }
    var b = $('ev-guardar'); b.disabled = true;
    pedir('/api/admin/eventos', { nombre: $('ev-nombre').value.trim(), fecha_desde: desde, fecha_hasta: hasta, cliente_id: $('ev-cliente').value.trim(),
      servicio_id: $('ev-servicio').value.trim(), efecto_esperado: $('ev-efecto').value, nota: $('ev-nota').value.trim() })
      .then(function () { $('dlg-evento').close(); toast('Evento agregado.'); return cargarEventos(); })
      .catch(function (e) { errorForm('ev-error', e.message); }).then(function () { b.disabled = false; });
  });
  $('t-eventos').addEventListener('click', function (ev) {
    var q = ev.target.closest('[data-quitar-evento]'); if (!q) return;
    if (!confirm('¿Quitar este evento?')) return;
    q.disabled = true;
    pedir('/api/admin/eventos/borrar', { id: Number(q.getAttribute('data-quitar-evento')) }).then(function () { toast('Evento quitado.'); return cargarEventos(); })
      .catch(function (e) { q.disabled = false; toast(e.message, true); });
  });
'''

RUTA_VIEJA = """  if (p === '/feriados' || p.startsWith('/feriados/')) {
    if (!puede(yo, 'admin_umbrales')) return sinPermiso();
    const r = await rutasFeriados(env, request, p, url, yo);
    if (r) return r;
  }
"""
RUTA_NUEVA = RUTA_VIEJA + """  if (p === '/eventos' || p.startsWith('/eventos/')) {   // eventos comerciales (parche 29)
    if (!puede(yo, 'admin_umbrales')) return sinPermiso();
    const r = await rutasEventos(env, request, p, url, yo);
    if (r) return r;
  }
"""


def aplicar(s):
    s = _rep(s, '\nconst TRABAJADOR = {', '\n' + _leer('contexto_server.js').strip() + '\n\nconst TRABAJADOR = {')
    s = _rep(s, REGLA6_VIEJA, REGLA6_NUEVA)
    s = _rep(s, RUTA_VIEJA, RUTA_NUEVA)

    def admin(h):
        h = _rep(h, '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-feriados"></table></div></div>',
                 '<div class="panel"><div class="tabla-scroll"><table class="resp" id="t-feriados"></table></div></div>' + SECCION)
        h = _rep(h, '</form>\n</dialog>\n\n<div class="toast"', '</form>\n</dialog>\n' + DIALOGO + '\n<div class="toast"')
        h = _rep(h, '  function pintarUmbrales() {', JS + '  function pintarUmbrales() {')
        h = _rep(h, 'return cargarFeriados(); });', 'return cargarFeriados().then(cargarEventos); });')
        h = _rep(h, "BORRAR_FERIADO: 'Quitó un feriado'", "BORRAR_FERIADO: 'Quitó un feriado', ALTA_EVENTO: 'Agregó un evento comercial', BORRAR_EVENTO: 'Quitó un evento comercial'")
        return h
    s = _html(s, 'ADMIN_HTML', admin)

    # Panel del asistente: enlaces https que se pueden tocar (el texto ya viene escapado; solo se enlaza https://)
    enlace = ("l = l.replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>');\n"
              "      l = l.replace(/\\[([^\\]]{1,80})\\]\\((https:\\/\\/[^\\s)<>]+)\\)|(https:\\/\\/[^\\s<>]*[^\\s<>.,;:)])/g, function (t, txt, u1, u2) { "
              "var u = u1 || u2, d = txt || u.replace(/^https:\\/\\/(www\\.)?/, '').split('/')[0]; "
              "return '<a href=\"' + u + '\" target=\"_blank\" rel=\"noopener noreferrer\">' + d + '</a>'; });")
    for n in ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML']:
        s = _html(s, n, lambda h: _rep(h, "l = l.replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>');", enlace))
    return s
