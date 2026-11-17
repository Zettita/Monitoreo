# Parche 57 (dashboard gerencial): el tablero se agrupa en tres pestañas y cambia el orden de las secciones.
#   - Orden pedido por Uriel: primero Disponibilidad, después las tarjetas de "Estado por cliente" y después "Últimas 24 horas"; lo demás sigue como estaba.
#   - Pestañas (el resumen de arriba, con lo más urgente, queda fijo sobre las tres):
#       Disponibilidad   = "Disponibilidad y resumen del período" (con la distribución de fallas, que depende del mismo período)
#       Operación ahora  = Estado por cliente, Últimas 24 horas, Alertas abiertas y Pre-alertas (con el número de alertas abiertas en la pestaña)
#       Histórico        = Histórico de alertas, Tiempo de resolución por tipo y Clientes con más problemas
#     Recuerda la pestaña elegida mientras la pestaña del navegador siga abierta; se mueve con el teclado (flechas, Inicio y Fin).
#   Solo página; sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CSS = """/* Pestañas del tablero (parche 57) */
.pestanas { display: flex; gap: 4px; margin: 4px 0 22px; box-shadow: inset 0 -1px 0 var(--line); overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.pestanas button { position: relative; flex: 0 0 auto; border: 0; background: transparent; color: var(--ink-2); font: inherit; font-size: 16px; font-weight: 600; padding: 12px 20px; min-height: 48px; cursor: pointer; border-radius: 8px 8px 0 0; white-space: nowrap; }
.pestanas button:hover { background: var(--track); color: var(--ink); }
.pestanas button[aria-selected="true"] { color: var(--accent); }
.pestanas button[aria-selected="true"]::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3px; border-radius: 3px 3px 0 0; background: var(--accent); }
.pestanas button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tab-n { display: inline-block; min-width: 22px; padding: 1px 7px; margin-left: 8px; border-radius: 999px; background: var(--track); color: var(--ink); font-size: 13px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }
.tab-n:empty { display: none; }
.pestana-panel[hidden] { display: none; }
@media (max-width: 560px) { .pestanas { gap: 0; } .pestanas button { flex: 1 1 0; white-space: normal; padding: 8px 4px; font-size: 14.5px; line-height: 1.2; min-height: 52px; } .tab-n { margin-left: 5px; padding: 0 6px; min-width: 20px; } }
"""

NAV = ('  <nav class="pestanas" id="pestanas" role="tablist" aria-label="Secciones del tablero">\n'
       '    <button type="button" role="tab" id="tab-disp" data-tab="disp" aria-controls="panel-disp" aria-selected="true">Disponibilidad</button>\n'
       '    <button type="button" role="tab" id="tab-op" data-tab="op" aria-controls="panel-op" aria-selected="false" tabindex="-1">Operación ahora<span class="tab-n" id="tab-n-op" title="Alertas abiertas"></span></button>\n'
       '    <button type="button" role="tab" id="tab-hist" data-tab="hist" aria-controls="panel-hist" aria-selected="false" tabindex="-1">Histórico</button>\n'
       '  </nav>\n')

JS = r"""  // ---- Pestañas del tablero (parche 57): Disponibilidad · Operación ahora · Histórico ----
  var PESTANAS = ['disp', 'op', 'hist'];
  function irPestana(k, foco) {
    if (PESTANAS.indexOf(k) < 0) k = 'disp';
    PESTANAS.forEach(function (p) {
      var on = p === k;
      $('tab-' + p).setAttribute('aria-selected', on ? 'true' : 'false'); $('tab-' + p).tabIndex = on ? 0 : -1;
      $('panel-' + p).hidden = !on;
    });
    if (foco) $('tab-' + k).focus();
    try { sessionStorage.setItem('helios_pestana', k); } catch (e) { /* sin almacenamiento: no pasa nada */ }
  }
  function actualizarPestanas(casos) { $('tab-n-op').textContent = casos && casos.length ? String(casos.length) : ''; }
  $('pestanas').addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-tab]'); if (b) irPestana(b.getAttribute('data-tab')); });
  $('pestanas').addEventListener('keydown', function (ev) {
    var i = PESTANAS.indexOf(document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-tab') : '');
    if (i < 0) return;
    var n = ev.key === 'ArrowRight' ? (i + 1) % 3 : ev.key === 'ArrowLeft' ? (i + 2) % 3 : ev.key === 'Home' ? 0 : ev.key === 'End' ? 2 : -1;
    if (n < 0) return;
    ev.preventDefault(); irPestana(PESTANAS[n], true);
  });
  (function () { var ult = 'disp'; try { ult = sessionStorage.getItem('helios_pestana') || 'disp'; } catch (e) { /* nada */ } irPestana(ult); })();

"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    # ---- sacar los bloques de su lugar y volver a armarlos en tres paneles ----
    a_pan = h.index('  <section class="bloque" id="bloque-panorama">\n')
    a_per = h.index('  <section class="bloque" id="b-periodo">\n')
    a_dia = h.index('  <section class="bloque">\n    <h2>Últimas 24 horas</h2>')
    a_ale = h.index('  <div class="dos bloque apilado" id="bloque-alertas"')
    a_his = h.rindex('  <section class="bloque">\n', 0, h.index('<h2>Histórico de Alertas</h2>'))
    a_nota = h.index('  <p class="nota" id="nota"></p>')
    assert a_pan < a_per < a_dia < a_ale < a_his < a_nota
    panorama, periodo, dia, alertas, historico = h[a_pan:a_per], h[a_per:a_dia], h[a_dia:a_ale], h[a_ale:a_his], h[a_his:a_nota]
    nuevo = (NAV +
             '  <div class="pestana-panel" id="panel-disp" role="tabpanel" aria-labelledby="tab-disp">\n' + periodo + '  </div>\n\n'
             '  <div class="pestana-panel" id="panel-op" role="tabpanel" aria-labelledby="tab-op" hidden>\n' + panorama + dia + alertas.rstrip('\n') + '\n  </div>\n\n'
             '  <div class="pestana-panel" id="panel-hist" role="tabpanel" aria-labelledby="tab-hist" hidden>\n' + historico.rstrip('\n') + '\n  </div>\n\n')
    h = h[:a_pan] + nuevo + h[a_nota:]
    h = _rep(h, "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n", JS + "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n")
    h = _rep(h, "    pintarCasos(casos, d);\n", "    pintarCasos(casos, d);\n    actualizarPestanas(casos);\n")
    return h


def aplicar(s):
    return _html(s, 'HTML', tablero)
