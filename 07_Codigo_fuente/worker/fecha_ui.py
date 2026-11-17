# Campo de fecha único de Helios (parche 56, compartido desde el 58): se escribe como dd/mm/aaaa y se formatea mientras se escribe, y un ícono abre el
# calendario del navegador. Lo usan el tablero (disponibilidad, comparación, histórico y clientes) y Administración (auditoría, feriados y eventos).
#   CSS          estilos del campo (.fecha-wrap, .fecha-txt, .fecha-cal, .fecha-nat)
#   JS           ayudas de la página: fFormato, fEstado, fPoner, fLimites, fEnganchar y el calendario (necesitan la función $ de la página)
#   ctrl()       solo el campo, para meter en una etiqueta propia  ·  campo_fecha()  etiqueta arriba + campo

ICONO_CAL = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
             '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>')


def ctrl(id_, extra=''):
    # El campo de texto con su ícono de calendario; "extra" son atributos del input de texto (por ejemplo required)
    return ('<span class="fecha-wrap">'
            '<input type="text" class="fecha-txt" id="%s" inputmode="numeric" autocomplete="off" placeholder="dd/mm/aaaa" maxlength="10"%s>'
            '<button type="button" class="fecha-cal" data-cal="%s" aria-label="Elegir la fecha en el calendario" title="Elegir en el calendario">%s</button>'
            '<input type="date" class="fecha-nat" id="%s-cal" tabindex="-1" aria-hidden="true"></span>') % (id_, (' ' + extra) if extra else '', id_, ICONO_CAL, id_)


def campo_fecha(id_, rotulo):
    # Etiqueta arriba y el campo abajo (disponibilidad y comparación)
    return '<div class="per-campo"><label for="%s">%s</label>%s</div>' % (id_, rotulo, ctrl(id_))


CSS = """.per-campo label { font: inherit; }
.fecha-wrap { position: relative; display: inline-flex; align-items: center; }
.fecha-txt { font: inherit; font-size: 15px; font-weight: 400; color: var(--ink); background: var(--input-bg); border: 1px solid var(--line-input); border-radius: 3px; padding: 6px 40px 6px 12px; min-height: 40px; width: 170px; font-variant-numeric: tabular-nums; text-align: left; }
.fecha-txt::placeholder { color: var(--ink-3); }
.fecha-txt:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.fecha-txt.mal, .fecha-txt.error { border-color: var(--critica); }
.fecha-cal { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); display: inline-flex; border: 0; background: transparent; color: var(--ink-2); padding: 5px; border-radius: 3px; cursor: pointer; }
.fecha-cal:hover { background: var(--btn-bg); color: var(--accent); }
.fecha-cal:focus-visible { outline: 2px solid var(--accent); }
.fecha-nat { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; pointer-events: none; }
@media (max-width: 560px) {
  .fecha-txt { width: 100%; }
  .fecha-wrap { display: flex; }
}
"""

JS = r"""  // ---- Campos de fecha dd/mm/aaaa: se escriben con comodidad y recién se aplican con la fecha completa y válida ----
  var FECHA_LIM = {};
  function fTxt(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
  function fFormato(raw) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (m) raw = m[3] + m[2] + m[1];                                        // pegaron una fecha en formato aaaa-mm-dd
    raw = raw.replace(/(^|\D)(\d)(?=\D)/g, '$10$2');                         // "5/" pasa a "05/"
    var ds = raw.replace(/\D/g, ''), i = 0, dia = '', mes = '', anio = '';
    if (ds.length) { if (ds.charAt(0) > '3') { dia = '0' + ds.charAt(0); i = 1; } else { dia = ds.slice(0, 2); i = dia.length; } }   // "5" es el día 05
    if (dia.length === 2 && ds.length > i) { if (ds.charAt(i) > '1') { mes = '0' + ds.charAt(i); i += 1; } else { mes = ds.slice(i, i + 2); i += mes.length; } }   // "7" es el mes 07
    if (mes.length === 2) anio = ds.slice(i, i + 4);
    return dia + (mes ? '/' + mes : '') + (anio ? '/' + anio : '');
  }
  function fIsoDeTexto(txt) {   // dd/mm/aaaa completo y real -> aaaa-mm-dd; si no, vacío
    var D = (txt || '').replace(/\D/g, ''); if (D.length !== 8) return '';
    var dd = +D.slice(0, 2), mm = +D.slice(2, 4), aa = +D.slice(4, 8), f = new Date(Date.UTC(aa, mm - 1, dd, 12));
    return aa >= 1900 && f.getUTCFullYear() === aa && f.getUTCMonth() === mm - 1 && f.getUTCDate() === dd ? D.slice(4, 8) + '-' + D.slice(2, 4) + '-' + D.slice(0, 2) : '';
  }
  function fEstado(id) {
    var el = $(id), D = el.value.replace(/\D/g, ''), lim = FECHA_LIM[id] || {};
    if (!D.length) return { estado: 'vacia' };
    if (D.length < 8) return { estado: 'incompleta' };
    var iso = fIsoDeTexto(el.value);
    if (!iso) return { estado: 'invalida', msg: 'Esa fecha no existe. Escribila como día/mes/año, por ejemplo ' + fTxt(lim.max || '2026-01-31') + '.' };
    if (lim.min && iso < lim.min) return { estado: 'fuera', msg: 'Se puede mirar desde el ' + fTxt(lim.min) + ' en adelante.' };
    if (lim.max && iso > lim.max) return { estado: 'fuera', msg: 'La fecha no puede ser posterior a hoy (' + fTxt(lim.max) + ').' };
    return { estado: 'ok', iso: iso };
  }
  function fPoner(id, iso) {
    var el = $(id), n = $(id + '-cal');
    el.value = fTxt(iso); el.classList.remove('mal'); el.removeAttribute('aria-invalid'); el.setAttribute('data-ok', iso || '');
    if (n) n.value = iso || '';
  }
  function fLimites(id, min, max) { FECHA_LIM[id] = { min: min, max: max }; var n = $(id + '-cal'); if (n) { n.min = min; n.max = max; } }
  function fEnganchar(id, alCompletar, mostrar) {
    var el = $(id), n = $(id + '-cal');
    function listo(iso) { el.classList.remove('mal'); el.removeAttribute('aria-invalid'); el.setAttribute('data-ok', iso); if (n) n.value = iso; mostrar(''); alCompletar(); }
    el.addEventListener('input', function () {
      var t = fFormato(el.value); if (t !== el.value) el.value = t;
      var e = fEstado(id), mal = e.estado === 'invalida' || e.estado === 'fuera';
      el.classList.toggle('mal', mal); if (mal) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      if (e.estado === 'ok') listo(e.iso); else mostrar(mal ? e.msg : '');
    });
    el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } });
    el.addEventListener('blur', function () {      // si quedó a medias, vuelve a la última fecha buena y lo avisa
      var e = fEstado(id); if (e.estado === 'ok') return;
      var ok = el.getAttribute('data-ok');
      if (el.value) mostrar(e.msg || 'Escribí la fecha completa como día/mes/año, por ejemplo ' + fTxt((FECHA_LIM[id] || {}).max || '2026-01-31') + '.');
      fPoner(id, ok);
    });
  }
  // El ícono abre el calendario del navegador (arrancando en la fecha escrita) y lo elegido se escribe en el campo como si se hubiera tecleado
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-cal]'); if (!b) return;
    var id = b.getAttribute('data-cal'), n = $(id + '-cal'), el = $(id); if (!n || !el) return;
    var iso = fIsoDeTexto(el.value); if (iso) n.value = iso;
    try { n.showPicker(); } catch (e) { n.focus(); n.click(); }
  });
  document.addEventListener('change', function (ev) {
    var n = ev.target; if (!n.classList || !n.classList.contains('fecha-nat') || !n.value) return;
    var el = $(n.id.replace(/-cal$/, '')); if (!el) return;
    el.value = fTxt(n.value); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
"""
