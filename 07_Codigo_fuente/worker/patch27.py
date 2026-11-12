# Parche 27: diálogo de umbrales (Administración > Umbrales) más claro para quien lo usa.
#
#   - Cada campo dice qué hace en palabras simples (antes: "Gracia", "Importante desde", "Tráfico").
#   - Cada grupo explica para qué sirve y qué pasa si se sube o se baja el valor.
#   - Al lado de cada campo, un ejemplo "En la práctica" que se actualiza mientras se escribe, con los
#     números que espera el modelo para ese cliente (por ejemplo: "si se esperan 1.200 operaciones,
#     es Importante con 900 o menos").
#   - Solo cambia la página: mismos campos, mismos valores guardados, sin SQL nuevo.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _campo(k, nombre, ayuda, unidad, numerico=True, decimal=True):
    if numerico:
        ctl = '<input type="text" inputmode="%s" id="um-%s" autocomplete="off"><em>%s</em>' % ('decimal' if decimal else 'numeric', k, unidad)
    else:
        ctl = '<select id="um-%s"></select><em></em>' % k
    return ('      <div class="fu"><label class="fu-nombre" for="um-%s">%s<small>%s</small></label>'
            '<span class="fu-control">%s</span><small class="reco" data-reco="%s"></small></div>\n') % (k, nombre, ayuda, ctl, k)


GRUPOS = (
    '    <fieldset class="grupo">\n'
    '      <legend>Importancia para el negocio</legend>\n'
    '      <p class="bajada">No cambian cuándo se abre una alerta: deciden en qué orden se atienden y cómo se mide el día en el tablero.</p>\n'
    + _campo('criticidad', 'Criticidad del servicio', 'Qué tan grave es para el negocio que este servicio falle. Junto con la gravedad de la alerta da la prioridad (P1 a P4)', '', numerico=False)
    + _campo('objetivo_disponibilidad', 'Objetivo de disponibilidad', 'Qué parte del día se espera que el servicio funcione sin problemas. Se compara en las barras de 24 horas del tablero', '%')
    + '    </fieldset>\n'
    '    <fieldset class="grupo">\n'
    '      <legend>Gravedad de la alerta: Leve, Importante o Grave</legend>\n'
    '      <p class="bajada">Cuando algo sale de lo normal se abre una alerta. Estos valores deciden qué tan grave es según cuánto se alejó de lo esperado. Si no llega al valor de Importante, es Leve.</p>\n'
    + _campo('corte_pct_alta', 'Importante si se aleja', 'Cantidad de operaciones, importe y tiempo de respuesta: diferencia con lo esperado, en %', '%')
    + _campo('corte_pct_critica', 'Grave si se aleja', 'Cantidad de operaciones, importe y tiempo de respuesta: diferencia con lo esperado, en %', '%')
    + _campo('corte_tasa_alta', 'Importante si la tasa cambia', 'Aprobaciones, rechazos y errores, en puntos: de 95 % a 90 % son 5 puntos', 'pts')
    + _campo('corte_tasa_critica', 'Grave si la tasa cambia', 'Aprobaciones, rechazos y errores, en puntos: de 95 % a 80 % son 15 puntos', 'pts')
    + '    </fieldset>\n'
    '    <fieldset class="grupo">\n'
    '      <legend>Sensibilidad: cuánto margen se tolera</legend>\n'
    '      <p class="bajada">Para cada 15 minutos el modelo calcula lo normal y un margen alrededor (un mínimo y un máximo). La alerta se abre cuando el dato sale de ese margen. '
    '<b>100 %</b> usa el margen tal como lo calcula el modelo; <b>150 %</b> lo hace más amplio (avisa menos, solo lo más notorio); <b>80 %</b> lo achica (avisa antes, pero puede dar falsas alarmas).</p>\n'
    + _campo('banda_volumen', 'Cantidad de operaciones', 'Avisa si entran muchas menos o muchas más operaciones de lo normal', '%')
    + _campo('banda_tasas', 'Aprobaciones, rechazos y errores', 'Avisa si cambia la proporción de operaciones aprobadas, rechazadas o con error', '%')
    + _campo('banda_importe', 'Importe operado', 'Avisa si se mueve mucho menos o mucho más dinero de lo normal', '%')
    + _campo('banda_latencia', 'Tiempo de respuesta', 'Avisa si el sistema tarda más de lo normal en responder', '%')
    + '    </fieldset>\n'
    '    <fieldset class="grupo">\n'
    '      <legend>Llegada de datos y feriados</legend>\n'
    + _campo('volumen_minimo', 'Mínimo de operaciones para mirar las tasas', 'Si en 15 minutos hay menos operaciones, no se evalúan aprobaciones, rechazos ni errores', 'ops', decimal=False)
    + _campo('gracia_minutos', 'Tiempo de espera de los datos', 'Minutos que se espera cada dato después de que termina su ventana de 15 minutos, antes de avisar', 'min', decimal=False)
    + _campo('silenciar_feriados', 'Silenciar alertas en feriados', 'Ese día no se generan alertas ni pre-alertas para este servicio', '', numerico=False)
    + '    </fieldset>\n'
)

UM_RECOS = r'''function umRecos() {
    var rec = umReco && umReco.recomendado, m = (umReco && umReco.modelo) || {};
    var hay = !!m.ventanas;
    var ent = function (x) { return nTxt(Math.round(x)); };
    var pct = function (x) { return (Math.round(x * 1000) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 }); };
    // Ejemplos: lo que espera el modelo para este alcance o, si no hay, números redondos
    var vol = hay && m.vol_esp > 0 ? m.vol_esp : 1000, aprob = hay && m.aprob_esp != null ? m.aprob_esp : 0.95;
    var lat = hay && m.lat_esp > 0 ? m.lat_esp : 800;
    var PRIO = { ALTA: [1, 2, 3], MEDIA: [2, 3, 4], BAJA: [3, 3, 4] };
    document.querySelectorAll('#f-umbral .reco').forEach(function (el) {
      var k = el.getAttribute('data-reco'), v = umEfectivo(k), p = '', r = '';
      var num = typeof v === 'number' && isFinite(v);
      if (rec && rec[k] != null && !UCAMPOS[k].sel) r = 'Recomendado: <b>' + nTxt(aPantalla(k, rec[k])) + '</b>';
      if (k === 'criticidad' && PRIO[v]) p = 'Grave = <b>P' + PRIO[v][0] + '</b>, Importante = <b>P' + PRIO[v][1] + '</b>, Leve = <b>P' + PRIO[v][2] + '</b>. P1 se atiende primero.';
      if (k === 'objetivo_disponibilidad') {
        r = 'Lo define el negocio';
        if (num && v > 0 && v <= 1) {
          var vent = Math.floor(96 * (1 - v) + 1e-9);
          p = vent ? 'Se toleran hasta ' + vent + ' ventanas de 15 minutos con problemas por día (' + (vent * 15 >= 60 ? nTxt(Math.round(vent * 15 / 6) / 10) + ' h' : vent * 15 + ' min') + ').' : 'No se tolera ninguna ventana con problemas.';
        }
      }
      if ((k === 'corte_pct_alta' || k === 'corte_pct_critica') && num && v > 0) {
        var nom = k === 'corte_pct_alta' ? 'Importante' : 'Grave';
        p = 'Si se esperan ' + ent(vol) + ' operaciones, es ' + nom + ' con ' + ent(vol * (1 - Math.min(v, 1))) + ' o menos, o con ' + ent(vol * (1 + v)) + ' o más. Si el tiempo de respuesta esperado es ' + ent(lat) + ' ms, desde ' + ent(lat * (1 + v)) + ' ms.';
      }
      if ((k === 'corte_tasa_alta' || k === 'corte_tasa_critica') && num && v > 0) {
        p = 'Si se espera ' + uno(aprob * 100) + ' % de aprobación, es ' + (k === 'corte_tasa_alta' ? 'Importante' : 'Grave') + ' con ' + uno(Math.max(0, aprob - v) * 100) + ' % o menos.';
      }
      if (k.indexOf('banda_') === 0 && num && v > 0) {
        if (k === 'banda_volumen' && m.vol_abajo != null) p = 'Avisa con ' + pct(m.vol_abajo * v) + ' % menos o ' + pct(m.vol_arriba * v) + ' % más operaciones de lo esperado.';
        if (k === 'banda_tasas' && m.aprob_abajo != null) p = 'Avisa si la aprobación baja ' + pct(m.aprob_abajo * v) + ' puntos, o si los rechazos suben ' + pct(m.rech_arriba * v) + ' o los errores ' + pct(m.err_arriba * v) + ' puntos.';
        if (k === 'banda_importe' && m.imp_abajo != null) p = 'Avisa con ' + pct(m.imp_abajo * v) + ' % menos o ' + pct(m.imp_arriba * v) + ' % más de importe.';
        if (k === 'banda_latencia' && m.lat_arriba != null) p = 'Avisa si tarda ' + pct(m.lat_arriba * v) + ' % más de lo esperado.';
        if (!p) p = v === 1 ? 'Usa el margen tal como lo calcula el modelo.' : v > 1 ? 'Margen ' + nTxt(Math.round((v - 1) * 100)) + ' % más amplio que el del modelo: avisa menos.' : 'Margen ' + nTxt(Math.round((1 - v) * 100)) + ' % más angosto que el del modelo: avisa antes.';
      }
      if (k === 'volumen_minimo' && num) {
        p = 'Con pocas operaciones un solo rechazo mueve mucho la tasa (1 de 10 ya es 10 %).' + (v > 0 ? ' Por debajo de ' + nTxt(v) + ' operaciones solo se mira la cantidad.' : '');
        if (hay && m.vol_esp_min != null) r += (r ? '. ' : '') + 'En el horario más tranquilo se esperan ' + ent(m.vol_esp_min) + ' operaciones';
      }
      if (k === 'gracia_minutos' && num) {
        p = 'Si un dato no llegó ' + nTxt(v) + ' min después de terminar su ventana: alerta "Dejaron de llegar datos". Si llega más tarde: "Dato tardío".';
        if (umReco && umReco.demora_p95 != null) r += (r ? '. ' : '') + 'Hoy los datos llegan con hasta ' + nTxt(umReco.demora_p95) + ' min de demora';
      }
      if (k === 'silenciar_feriados') r = 'Para servicios que en feriados casi no operan (por ejemplo, préstamos). Los feriados se ven abajo, en esta misma pestaña';
      el.innerHTML = (p ? '<span class="practica"><b>En la práctica:</b> ' + p + '</span>' : '') + (r ? '<span>' + r + '.</span>' : '');
    });
  }
  '''

CSS = '''.fu .reco .practica { display: block; color: var(--ink-2); margin-bottom: 2px; }
.fu .reco .practica b { color: var(--ink); font-weight: 600; }
.grupo > p.bajada b { color: var(--ink); }
'''


def admin(h):
    # Campos con nombres y ayudas nuevas
    a = h.index('    <fieldset class="grupo">\n      <legend>Impacto en el negocio</legend>')
    b = h.index('    <p class="error-form" id="um-error" hidden></p>')
    assert h.count('<legend>Impacto en el negocio</legend>') == 1 and a < b
    h = h[:a] + GRUPOS + h[b:]
    # Ejemplos en vivo
    a = h.index('function umRecos() {'); b = h.index('function umModelo() {')
    h = h[:a] + UM_RECOS + h[b:]
    # También al cambiar criticidad o feriados
    h = _rep(h, "document.querySelectorAll('#f-umbral input').forEach(function (el) { el.addEventListener('input', umRecos); });",
             "document.querySelectorAll('#f-umbral input').forEach(function (el) { el.addEventListener('input', umRecos); });\n"
             "  ['um-criticidad', 'um-silenciar_feriados'].forEach(function (id) { $(id).addEventListener('change', umRecos); });")
    h = _rep(h, '.reco { display: block;', CSS + '.reco { display: block;')
    return h


def aplicar(s):
    return _html(s, 'ADMIN_HTML', admin)
