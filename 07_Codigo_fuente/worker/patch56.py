# Parche 56 (dashboard gerencial): período con Desde / Hasta, barras de clientes más altas y letras más grandes, y comparación en una ventana.
#   - El selector Día / Semana / Mes y las flechas ‹ › se reemplazan por dos campos de fecha (Desde y Hasta). Se aplica solo al elegir las dos fechas.
#     GET /api/tablero/periodo?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (días de Argentina, los dos incluidos; hasta 366 días; hasta se acomoda a hoy).
#     Sin fechas sigue valiendo ?tipo=dia|semana|mes&fecha= (lo usan las pruebas). El "período anterior" del rango es otro rango de la misma duración,
#     justo antes. El paso de la evolución se elige por la duración: hasta 1 día cada 15 minutos, hasta 8 días cada hora, más cada día (y lo medido manda).
#   - Las barras "Cumplen / No cumplen, pero están cerca / No cumplen y están lejos" son más altas, con una flecha que gira, borde y pista al pasar el mouse.
#   - Letras más grandes en toda la sección de disponibilidad.
#   - "Comparar con otro período": ventana con su propio Desde / Hasta (y atajos: período anterior, mismo período del mes o del año anterior), las dos
#     disponibilidades lado a lado, la diferencia, una tabla por cliente (quién mejoró y quién empeoró) y las dos líneas de evolución superpuestas.
#     GET /api/tablero/periodo?...&liviano=1 trae solo la disponibilidad del período (sin incidentes ni período anterior).
#   Sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


CABEZA = r"""async function resumenPeriodo(env, url) {
  const conRango = url.searchParams.has('desde') || url.searchParams.has('hasta');
  const tipo = conRango ? 'rango' : (url.searchParams.get('tipo') || 'mes');
  if (!['dia', 'semana', 'mes', 'rango'].includes(tipo)) return jsonError('Elegí día, semana o mes.', 400);
  const liviano = url.searchParams.get('liviano') === '1';   // solo la disponibilidad (para comparar): sin incidentes ni período anterior
  const par = await env.DB.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora, tablero_revision AS revision FROM alerta_parametros WHERE id = 1`).first();
  if (!par) throw new Error('Faltan los parámetros del tablero.');
  const ahoraMs = Date.parse(par.ahora);
  const hoy = new Date(ahoraMs - 3 * 3600e3).toISOString().slice(0, 10);
  const fechaOk = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '') && !isNaN(Date.parse(x + 'T12:00:00Z')) && new Date(x + 'T12:00:00Z').toISOString().slice(0, 10) === x;
  const minimo = pFechaSuma(hoy, -PERIODO_ATRAS_MAX_DIAS);
  let f, lim, ant = null, antLim;
  if (tipo === 'rango') {
    const d = url.searchParams.get('desde'); let h = url.searchParams.get('hasta');
    if (!fechaOk(d) || !fechaOk(h)) return jsonError('Elegí las dos fechas: desde y hasta.', 400);
    if (h > hoy) h = hoy;
    if (d > h) return jsonError('La fecha "Desde" tiene que ser anterior o igual a "Hasta".', 400);
    if (d < minimo) return jsonError('Se puede mirar hasta ' + PERIODO_ATRAS_MAX_DIAS + ' días atrás.', 400);
    const dias = Math.round((Date.parse(h + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 864e5) + 1;
    if (dias > PERIODO_RANGO_MAX_DIAS) return jsonError('El período puede tener hasta ' + PERIODO_RANGO_MAX_DIAS + ' días.', 400);
    f = h; lim = { desde: d, hasta: pFechaSuma(h, 1) };
    antLim = { desde: pFechaSuma(d, -dias), hasta: d };   // el período anterior es otro de la misma duración, justo antes
  } else {
    f = url.searchParams.get('fecha') || hoy;
    if (!fechaOk(f)) return jsonError('La fecha no es válida.', 400);
    if (f > hoy) f = hoy;
    if (f < minimo) return jsonError('Se puede mirar hasta ' + PERIODO_ATRAS_MAX_DIAS + ' días atrás.', 400);
    lim = pLimites(tipo, f);
    ant = pFechaDentroDelAnterior(tipo, lim); antLim = pLimites(tipo, ant);
  }
  const desdeISO = lim.desde + 'T03:00:00Z', hastaISO = lim.hasta + 'T03:00:00Z';
  const parcial = ahoraMs < Date.parse(hastaISO);
  const antDesde = antLim.desde + 'T03:00:00Z', antHasta = antLim.hasta + 'T03:00:00Z';
"""


def servidor(s):
    s = _rep(s, "const PERIODO_ATRAS_MAX_DIAS = 400;\n", "const PERIODO_ATRAS_MAX_DIAS = 400;\nconst PERIODO_RANGO_MAX_DIAS = 366;\n")
    s = _rep(s, "  if (tipo === 'dia') return may(PERIODO_DIAS[",
             "  if (tipo === 'rango') return a === z ? dm(a) + '/' + a.slice(0, 4) : a.slice(0, 4) === z.slice(0, 4) ? dm(a) + ' al ' + dm(z) + '/' + z.slice(0, 4) : dm(a) + '/' + a.slice(0, 4) + ' al ' + dm(z) + '/' + z.slice(0, 4);\n"
             "  if (tipo === 'dia') return may(PERIODO_DIAS[")
    a = s.index("async function resumenPeriodo(env, url) {")
    b = s.index("  const diasDelMes = (f) =>")
    s = s[:a] + CABEZA + s[b:]
    s = _rep(s, "    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),\n    env.DB.prepare(Q_DISPO_VENTANAS).bind(desdeISO, hastaISO),\n    env.DB.prepare(Q_DISPO_VENTANAS).bind(antDesde, antHasta),\n",
             "    liviano ? env.DB.prepare('SELECT 1 AS x WHERE 0') : env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),\n"
             "    env.DB.prepare(Q_DISPO_VENTANAS).bind(desdeISO, hastaISO),\n"
             "    liviano ? env.DB.prepare('SELECT 1 AS x WHERE 0') : env.DB.prepare(Q_DISPO_VENTANAS).bind(antDesde, antHasta),\n")
    s = _rep(s, "  const anterior = dispoCalcular(", "  const anterior = liviano ? null : dispoCalcular(")
    s = _rep(s, "    const pasoMin = tipo === 'dia' || medidoDias <= 1.5 ? 15 : tipo === 'semana' || medidoDias <= 8 ? 60 : 1440;\n",
             "    const diasPeriodo = (Date.parse(hastaISO) - Date.parse(desdeISO)) / 864e5;\n"
             "    const tipoPaso = tipo === 'rango' ? (diasPeriodo <= 1 ? 'dia' : diasPeriodo <= 8 ? 'semana' : 'mes') : tipo;\n"
             "    const pasoMin = tipoPaso === 'dia' || medidoDias <= 1.5 ? 15 : tipoPaso === 'semana' || medidoDias <= 8 ? 60 : 1440;\n")
    s = _rep(s, "    anterior: ant >= minimo ? ant : null, siguiente: lim.hasta <= hoy ? lim.hasta : null,\n",
             "    anterior: ant && ant >= minimo ? ant : null, siguiente: tipo !== 'rango' && lim.hasta <= hoy ? lim.hasta : null,\n"
             "    hoy, fecha_minima: minimo, dias: Math.round((Date.parse(hastaISO) - Date.parse(desdeISO)) / 864e5),\n")
    s = _rep(s, "    disponibilidad, disponibilidad_anterior: Object.assign({ titulo: pTitulo(tipo, antLim) }, anterior),\n",
             "    disponibilidad, disponibilidad_anterior: anterior ? Object.assign({ titulo: pTitulo(tipo, antLim) }, anterior) : null,\n")
    return s


# ---------------------------------------------------------------- página
CSS = """/* Período con Desde / Hasta, barras más altas, letras más grandes y comparación (parche 56) */
.per-barra { gap: 10px 16px; align-items: flex-end; }
.per-campo { display: grid; gap: 4px; font-size: 14px; font-weight: 600; color: var(--ink-2); }
.per-campo input[type="date"] { font: inherit; font-size: 15px; font-weight: 400; color: var(--ink); background: var(--input-bg); border: 1px solid var(--line-input); border-radius: 6px; padding: 6px 10px; min-height: 38px; color-scheme: light dark; }
.per-campo input[type="date"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.per-comparar { margin-left: auto; min-height: 38px; font-size: 14.5px; }
.per-parcial { font-size: 14px; flex-basis: 100%; }
.per-error { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: var(--critica-bg); color: var(--critica-txt); font-size: 14px; font-weight: 600; }
#b-periodo .bajada { font-size: 15px; }
.dd-global .dd-grande b { font-size: 44px; }
.dd-global .dd-grande span { font-size: 14.5px; }
.dd-lineas p { font-size: 15px; }
.dd-chip { font-size: 14px; padding: 2px 10px; }
.dd-barra { height: 12px; border-radius: 6px; }
.dd-barra i { border-radius: 6px; }
.dd-resumen { padding: 14px 16px; }
.dd-resumen h3 { margin: 0 0 10px; font-size: 17px; }
.dd-hint { font-size: 14px; font-weight: 400; color: var(--ink-3); }
.dd-rbarra { grid-template-columns: minmax(180px, 290px) minmax(0, 1fr) auto; gap: 6px 16px; padding: 12px 14px; margin-bottom: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.dd-rbarra:hover:not(:disabled) { background: var(--track); border-color: var(--accent); }
.dd-rnom { font-size: 16px; font-weight: 600; }
.dd-rpista { height: 24px; border-radius: 12px; }
.dd-rpista i { border-radius: 12px; }
.dd-rnum { font-size: 15.5px; }
.dd-rflecha { display: inline-block; margin-left: 10px; font-size: 22px; line-height: 1; color: var(--accent); transition: transform .15s; vertical-align: -2px; }
.dd-rbarra[aria-pressed="true"] .dd-rflecha { transform: rotate(90deg); }
.dd-rbarra:disabled .dd-rflecha { visibility: hidden; }
.dd-ayuda { font-size: 14px; }
.dd-cli > summary { grid-template-columns: minmax(80px, 120px) 112px 178px minmax(110px, 1fr) minmax(0, 1.3fr); font-size: 15px; }
.dd-nom, .dd-pct { font-size: 16px; }
.dd-uso { font-size: 14px; }
.dd-detalle p, .dd-tabla { font-size: 14.5px; }
.dd-nota { font-size: 14px; }
.dd-linea h4 { font-size: 15px; }
.dd-linea .ejeT { font-size: 11.5px; }
.dd-linea-res { font-size: 14px; }
@media (max-width: 700px) { .dd-cli > summary { grid-template-columns: minmax(0, 1fr) auto; } }
@media (max-width: 560px) {
  .dd-rbarra { grid-template-columns: minmax(0, 1fr) auto; }
  .dd-rbarra .dd-rpista { grid-column: 1 / -1; grid-row: 2; }
  .per-campo { flex: 1 1 140px; }
  .per-comparar { margin-left: 0; width: 100%; }
}
/* Ventana de comparación */
dialog.dlg-cmp { width: min(1040px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; padding: 20px 22px; }
.cmp-cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.cmp-elegir { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 14px; margin: 14px 0; align-items: start; }
.cmp-per { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: grid; gap: 10px; background: var(--panel); }
.cmp-per > b { font-size: 16px; }
.cmp-rot { font-size: 13.5px; font-weight: 700; color: var(--ink-3); letter-spacing: .02em; }
.cmp-campos, .cmp-atajos { display: flex; gap: 10px; flex-wrap: wrap; }
.cmp-atajos .btn { font-size: 13.5px; }
.cmp-tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; margin-bottom: 12px; }
.cmp-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; background: var(--panel); align-content: start; }
.cmp-card.b { border-style: dashed; }
.cmp-tit { font-size: 16px; }
.cmp-gran { font-size: 42px; font-weight: 700; line-height: 1.05; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.cmp-card p { margin: 0; font-size: 15px; color: var(--ink-2); }
.cmp-dif { border-radius: 10px; padding: 10px 14px; font-size: 16px; font-weight: 600; margin-bottom: 12px; background: var(--track); }
.cmp-dif.mejor { background: var(--ok-bg); color: var(--ok-txt); }
.cmp-dif.peor { background: var(--critica-bg); color: var(--critica-txt); }
.cmp-nota { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; background: var(--track); font-size: 14px; color: var(--ink-2); }
.cmp-sec { margin: 18px 0 6px; font-size: 16px; }
.cmp-ley { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 6px; font-size: 14px; color: var(--ink-2); }
.cmp-ley span { display: inline-flex; align-items: center; gap: 7px; }
.cmp-ley i { display: inline-block; width: 26px; height: 0; border-top: 3px solid var(--accent); }
.cmp-ley i.b { border-top: 3px dashed var(--ink-3); }
.cmp-ley i.o { border-top: 1.5px dotted var(--ink-2); }
.cmp-graf svg { display: block; width: 100%; max-width: 900px; height: auto; }
.cmp-graf .ejeT { fill: var(--ink-3); font-size: 12px; }
.cmp-graf .rot { fill: var(--ink); font-size: 12.5px; font-weight: 600; }
.cmp-graf .grilla { stroke: var(--line); stroke-width: 1; }
.cmp-graf .obj { stroke: var(--ink-2); stroke-width: 1.2; stroke-dasharray: 2 4; }
.cmp-graf .lin { fill: none; stroke-linejoin: round; stroke-linecap: round; }
.cmp-graf .lin.a { stroke: var(--accent); stroke-width: 2.6; }
.cmp-graf .lin.b { stroke: var(--ink-3); stroke-width: 2.2; stroke-dasharray: 7 5; }
.cmp-graf circle.fin.a { fill: var(--accent); stroke: var(--panel); stroke-width: 2; }
.cmp-graf circle.fin.b { fill: var(--panel); stroke: var(--ink-3); stroke-width: 2.2; }
.cmp-graf circle.h { fill: transparent; }
.cmp-graf circle.h:hover { fill: var(--accent); fill-opacity: .18; }
.cmp-tabla td.mejor { color: var(--ok-txt); font-weight: 600; }
.cmp-tabla td.peor { color: var(--critica-txt); font-weight: 600; }
#cmp-resultado[aria-busy="true"] { opacity: .55; }
"""

BARRA = ('    <div class="per-barra" id="per-barra">\n'
         '      <label class="per-campo" for="per-desde"><span>Desde</span><input type="date" id="per-desde"></label>\n'
         '      <label class="per-campo" for="per-hasta"><span>Hasta</span><input type="date" id="per-hasta"></label>\n'
         '      <button type="button" class="btn primario per-comparar" id="btn-comparar" disabled>Comparar con otro período</button>\n'
         '      <span class="per-parcial" id="per-nota" aria-live="polite"></span>\n'
         '    </div>\n'
         '    <p class="per-error" id="per-error" role="alert" hidden></p>\n')

DIALOGO = r"""<dialog class="dlg dlg-cmp" id="dlg-comparar" aria-labelledby="cmp-titulo">
  <div class="cmp-cab"><h2 id="cmp-titulo">Comparar períodos</h2><button type="button" class="btn chico" data-cerrar>Cerrar</button></div>
  <p class="sub-dlg">Elegí con qué período querés comparar el que estás viendo.</p>
  <div class="cmp-elegir">
    <div class="cmp-per"><span class="cmp-rot">PERÍODO ACTUAL</span><b id="cmp-a-txt"></b></div>
    <div class="cmp-per"><span class="cmp-rot">COMPARAR CON</span>
      <div class="cmp-campos"><label class="per-campo" for="cmp-desde"><span>Desde</span><input type="date" id="cmp-desde"></label><label class="per-campo" for="cmp-hasta"><span>Hasta</span><input type="date" id="cmp-hasta"></label></div>
      <div class="cmp-atajos" role="group" aria-label="Atajos para comparar"><button type="button" class="btn chico" data-cmp-atajo="anterior">Período anterior</button><button type="button" class="btn chico" data-cmp-atajo="mes">Mismo período del mes anterior</button><button type="button" class="btn chico" data-cmp-atajo="anio">Mismo período del año anterior</button></div>
    </div>
  </div>
  <p class="per-error" id="cmp-aviso" role="alert" hidden></p>
  <div id="cmp-resultado" aria-live="polite"></div>
</dialog>
"""

JS = r"""  // ---- Período con Desde / Hasta y comparación (parche 56) ----
  function consultaPeriodo(p) { return p.desde && p.hasta ? '?desde=' + p.desde + '&hasta=' + p.hasta : '?tipo=mes'; }
  function pintarBarraPeriodo(r) {
    var d = $('per-desde'), h = $('per-hasta');
    d.min = h.min = r.fecha_minima; d.max = h.max = r.hoy;
    if (document.activeElement !== d) d.value = r.desde;
    if (document.activeElement !== h) h.value = r.hasta;
    $('per-nota').textContent = r.parcial ? 'El último día todavía no terminó: se mide hasta ahora.' : '';
    $('per-error').hidden = true;
    $('btn-comparar').disabled = false;
    if ($('dlg-comparar').open && comp.b) pintarComparacion();
  }
  function errorPeriodo(msg) { var er = $('per-error'); er.textContent = msg; er.hidden = false; }
  function aplicarRango() {
    var d = $('per-desde').value, h = $('per-hasta').value;
    if (!d || !h) return;
    if (d > h) { errorPeriodo('La fecha "Desde" tiene que ser anterior o igual a "Hasta".'); return; }
    $('per-error').hidden = true;
    periodo = { desde: d, hasta: h };
    try { sessionStorage.setItem('helios_periodo', JSON.stringify(periodo)); } catch (e) { /* sin almacenamiento: no pasa nada */ }
    pedirPeriodo(true);
  }
  $('per-desde').addEventListener('change', aplicarRango);
  $('per-hasta').addEventListener('change', aplicarRango);
  try {
    var guardado = JSON.parse(sessionStorage.getItem('helios_periodo') || 'null');
    if (guardado && /^\d{4}-\d{2}-\d{2}$/.test(guardado.desde) && /^\d{4}-\d{2}-\d{2}$/.test(guardado.hasta)) periodo = { desde: guardado.desde, hasta: guardado.hasta };
  } catch (e) { /* sin almacenamiento */ }

  // ---- Comparar con otro período ----
  var comp = { b: null, pedido: 0 };
  function sumarDias(f, n) { var d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function sumarMeses(f, n) {   // mismo día de otro mes (si ese mes es más corto, su último día)
    var m = +f.slice(5, 7) - 1 + n, yy = +f.slice(0, 4) + Math.floor(m / 12), mm = ((m % 12) + 12) % 12, ult = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm, Math.min(+f.slice(8, 10), ult), 12)).toISOString().slice(0, 10);
  }
  function diasEntre(d, h) { return Math.round((Date.parse(h + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 864e5) + 1; }
  function fechaCorta(f) { return f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4); }
  function rangoTxt(d, h) { return d === h ? fechaCorta(d) : fechaCorta(d) + ' al ' + fechaCorta(h); }
  function dmCorto(iso) { return aFecha(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TZ }); }
  function ponerFechasComp(d, h) { $('cmp-desde').value = d; $('cmp-hasta').value = h; }
  function abrirComparar() {
    var a = resumen; if (!a) return;
    $('cmp-a-txt').textContent = rangoTxt(a.desde, a.hasta) + (a.parcial ? ' (hasta ahora)' : '');
    $('cmp-desde').min = $('cmp-hasta').min = a.fecha_minima; $('cmp-desde').max = $('cmp-hasta').max = a.hoy;
    var bh = sumarDias(a.desde, -1);
    ponerFechasComp(sumarDias(bh, -(diasEntre(a.desde, a.hasta) - 1)), bh);
    comp.b = null; $('cmp-resultado').innerHTML = ''; $('cmp-aviso').hidden = true;
    $('dlg-comparar').showModal();
    pedirComparacion();
  }
  function pedirComparacion() {
    var d = $('cmp-desde').value, h = $('cmp-hasta').value, av = $('cmp-aviso');
    if (!d || !h) return;
    if (d > h) { av.textContent = 'La fecha "Desde" tiene que ser anterior o igual a "Hasta".'; av.hidden = false; return; }
    av.hidden = true;
    var mio = ++comp.pedido; $('cmp-resultado').setAttribute('aria-busy', 'true');
    pedir('/api/tablero/periodo?desde=' + d + '&hasta=' + h + '&liviano=1').then(function (r) {
      if (mio !== comp.pedido) return;
      if (r.hasta > r.hoy) r.hasta = r.hoy;
      comp.b = r; ponerFechasComp(r.desde, r.hasta); $('cmp-resultado').removeAttribute('aria-busy'); pintarComparacion();
    }).catch(function (e) {
      if (mio !== comp.pedido) return;
      $('cmp-resultado').removeAttribute('aria-busy'); av.textContent = e.message; av.hidden = false;
    });
  }
  function tarjetaComp(clase, rot, r) {
    var g = r.disponibilidad && r.disponibilidad.global, tit = '<span class="cmp-rot">' + rot + '</span><b class="cmp-tit">' + esc(rangoTxt(r.desde, r.hasta)) + (r.parcial ? ' (hasta ahora)' : '') + '</b>';
    if (!g) return '<div class="cmp-card ' + clase + '">' + tit + '<p>No hay datos medidos en este período.</p></div>';
    return '<div class="cmp-card ' + clase + '">' + tit + '<div class="cmp-gran">' + pctD(g.disponibilidad, g.objetivo) + '</div>' +
      '<p>' + chipEstado(g) + ' Objetivo: <b>' + pctD(g.objetivo) + '</b></p>' + barraUso(g.consumo, g.estado) + '<p>' + usoTxt(g) + '.</p></div>';
  }
  function fmtPuntos(v) { return Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (Math.abs(v) === 1 ? ' punto' : ' puntos'); }
  function tablaComp(a, b) {
    var ca = (a.disponibilidad && a.disponibilidad.clientes) || [], cb = (b.disponibilidad && b.disponibilidad.clientes) || [], mapa = {}, filas = [];
    ca.forEach(function (c) { mapa[c.cliente_id] = { id: c.cliente_id, a: c }; });
    cb.forEach(function (c) { (mapa[c.cliente_id] = mapa[c.cliente_id] || { id: c.cliente_id }).b = c; });
    Object.keys(mapa).forEach(function (k) { var f = mapa[k]; f.dif = f.a && f.b ? Math.round((f.a.disponibilidad - f.b.disponibilidad) * 10000) / 100 : null; filas.push(f); });
    if (!filas.length) return '';
    filas.sort(function (x, y) { var dx = x.dif == null ? 1e9 : x.dif, dy = y.dif == null ? 1e9 : y.dif; return dx - dy || (x.id < y.id ? -1 : 1); });
    function celda(c) { return c ? pctD(c.disponibilidad, c.objetivo) + ' ' + chipEstado(c) : 'Sin datos'; }
    function cambio(f) {
      if (f.dif == null) return ['', '—'];
      if (f.dif === 0) return ['', 'Igual'];
      return [f.dif > 0 ? 'mejor' : 'peor', (f.dif > 0 ? '▲ Mejoró ' : '▼ Empeoró ') + fmtPuntos(f.dif)];
    }
    return '<h3 class="cmp-sec">Por cliente</h3><p class="dd-ayuda">Ordenado de quien más empeoró a quien más mejoró.</p><div class="tabla-scroll"><table class="dd-tabla cmp-tabla"><thead><tr><th>Cliente</th><th class="n">Actual</th><th class="n">Comparado</th><th class="n">Cambio</th></tr></thead><tbody>' +
      filas.map(function (f) { var c = cambio(f); return '<tr><td><b>' + esc(f.id) + '</b></td><td class="n">' + celda(f.a) + '</td><td class="n">' + celda(f.b) + '</td><td class="n ' + c[0] + '">' + c[1] + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  // Una línea por período: disponibilidad acumulada alineada por el tiempo que pasó desde el inicio de cada uno
  function serieComp(r) {
    var g = r.disponibilidad && r.disponibilidad.global, tn = g && g.tendencia; if (!tn || !tn.pt) return null;
    var t0 = Date.parse(tn.inicio_utc), ini = Date.parse(r.desde_utc), ahora = Date.parse(r.ahora), paso = tn.paso_minutos * 60000, pts = [];
    tn.pt.forEach(function (p, k) {
      if (!p) return;
      var a = t0 + k * paso, b = Math.min(t0 + (k + 1) * paso, ahora);
      pts.push({ x: (a + b) / 2 - ini, d: p[0], iso: new Date(paso >= 86400000 ? a : b).toISOString() });
    });
    return { pts: pts, largo: Date.parse(r.hasta_utc) - ini, obj: g.objetivo, paso: paso };
  }
  function graficoComp(a, b) {
    var sa = serieComp(a), sb = serieComp(b);
    if (!sa || !sb || sa.pts.length < 2 || sb.pts.length < 2) return '<p class="vacio">Todavía no hay suficientes ventanas medidas en los dos períodos para dibujar la evolución.</p>';
    var ancho = Math.round(Math.max(300, Math.min(900, $('cmp-resultado').clientWidth || 760))), chico = ancho < 520;   // el dibujo mide lo que el espacio: las letras no se achican en el celular
    var W = ancho, H = chico ? 250 : Math.min(340, Math.max(270, Math.round(ancho * 0.36))), L = chico ? 52 : 60, R = chico ? 80 : 92, T = 16, B = 32, pw = W - L - R, ph = H - T - B, DIA = 86400000;
    var largo = Math.max(sa.largo, sb.largo), obj = Math.min(sa.obj, sb.obj), lo = obj;
    sa.pts.concat(sb.pts).forEach(function (p) { if (p.d < lo) lo = p.d; });
    var span = Math.max(1 - lo, (1 - obj) * 2, 0.0005) * 1.15, ymin = 1 - span, dec = span < 0.02 ? 2 : span < 0.2 ? 1 : 0;
    function pc(v) { return (v * 100).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' %'; }
    function px(x) { return L + pw * x / largo; }
    function py(v) { return T + ph * (1 - (v - ymin) / (1 - ymin)); }
    function r1(x) { return Math.round(x * 10) / 10; }
    var grilla = [1, (1 + ymin) / 2, ymin].map(function (v) {
      return '<line class="grilla" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(py(v)) + '" y2="' + r1(py(v)) + '"/><text class="ejeT" x="' + (L - 6) + '" y="' + r1(py(v) + 4) + '" text-anchor="end">' + pc(v) + '</text>';
    }).join('');
    var ticks = [];
    if (largo <= DIA * 1.01) [0, 6, 12, 18, 24].forEach(function (h) { ticks.push([h * 3600000, (h < 10 ? '0' : '') + h + ':00']); });
    else { var nd = Math.round(largo / DIA), salto = Math.max(1, Math.ceil(nd / (chico ? 4 : 7))); for (var n = 1; n <= nd; n += salto) ticks.push([(n - 0.5) * DIA, 'día ' + n]); }
    var ejeX = ticks.map(function (t) { return '<text class="ejeT" x="' + r1(px(t[0])) + '" y="' + (H - 8) + '" text-anchor="middle">' + t[1] + '</text>'; }).join('');
    function objetivo(o) { return o >= ymin && o <= 1 ? '<line class="obj" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(py(o)) + '" y2="' + r1(py(o)) + '"/>' : ''; }
    function trazo(s) { return 'M' + s.pts.map(function (p) { return r1(px(p.x)) + ' ' + r1(py(p.d)); }).join(' L'); }
    function zonas(s, rot) {
      return s.pts.map(function (p) {
        var cuando = s.paso >= DIA ? dmCorto(p.iso) : dmCorto(p.iso) + ' ' + hora(p.iso);
        return '<circle class="h" cx="' + r1(px(p.x)) + '" cy="' + r1(py(p.d)) + '" r="7"><title>' + esc(rot + ' · ' + cuando + ': ' + pctD(p.d, s.obj) + ' de disponibilidad acumulada') + '</title></circle>';
      }).join('');
    }
    var ua = sa.pts[sa.pts.length - 1], ub = sb.pts[sb.pts.length - 1], ya = py(ua.d), yb = py(ub.d);
    if (Math.abs(ya - yb) < 15) { if (ya <= yb) yb = ya + 15; else ya = yb + 15; }
    var xl = Math.min(W - R + 6, Math.max(px(ua.x), px(ub.x)) + 10);
    var rotulos = '<text class="rot" x="' + r1(xl) + '" y="' + r1(ya + 4) + '">Actual</text><text class="rot" x="' + r1(xl) + '" y="' + r1(yb + 4) + '">Comparado</text>';
    var resumenTxt = 'Evolución de la disponibilidad acumulada: el período actual termina en ' + pctD(ua.d, sa.obj) + ' y el comparado en ' + pctD(ub.d, sb.obj) + '.';
    return '<div class="cmp-graf"><div class="cmp-ley"><span><i class="a"></i>Actual · ' + esc(rangoTxt(a.desde, a.hasta)) + '</span><span><i class="b"></i>Comparado · ' + esc(rangoTxt(b.desde, b.hasta)) + '</span><span><i class="o"></i>Objetivo ' + pctD(obj) + '</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(resumenTxt) + '">' + grilla + objetivo(sa.obj) + (sb.obj !== sa.obj ? objetivo(sb.obj) : '') +
      '<path class="lin b" d="' + trazo(sb) + '"/><path class="lin a" d="' + trazo(sa) + '"/>' +
      '<circle class="fin b" cx="' + r1(px(ub.x)) + '" cy="' + r1(py(ub.d)) + '" r="4.5"/><circle class="fin a" cx="' + r1(px(ua.x)) + '" cy="' + r1(py(ua.d)) + '" r="5"/>' +
      ejeX + rotulos + zonas(sb, 'Comparado') + zonas(sa, 'Actual') + '</svg>' +
      '<p class="dd-ayuda">' + esc(resumenTxt) + ' Las dos líneas se alinean por el tiempo que pasó desde el inicio de cada período. Pasá el mouse por un punto para ver el detalle.</p></div>';
  }
  function pintarComparacion() {
    var a = resumen, b = comp.b, el = $('cmp-resultado'); if (!a || !b) { el.innerHTML = ''; return; }
    var ga = a.disponibilidad && a.disponibilidad.global, gb = b.disponibilidad && b.disponibilidad.global, na = diasEntre(a.desde, a.hasta), nb = diasEntre(b.desde, b.hasta), notas = [];
    if (na !== nb) notas.push('Los períodos tienen distinta duración (' + na + (na === 1 ? ' día' : ' días') + ' y ' + nb + (nb === 1 ? ' día' : ' días') + '). La disponibilidad es un porcentaje y se puede comparar, pero un período corto se mueve más con un solo problema.');
    if (b.desde <= a.hasta && b.hasta >= a.desde) notas.push('Los períodos se superponen: algunos días cuentan en los dos.');
    var dif = '';
    if (ga && gb) {
      var d = Math.round((ga.disponibilidad - gb.disponibilidad) * 10000) / 100;
      dif = '<div class="cmp-dif ' + (d > 0 ? 'mejor' : d < 0 ? 'peor' : '') + '">' + (d === 0 ? 'La disponibilidad es igual en los dos períodos.' : (d > 0 ? '▲ El período actual mejoró ' : '▼ El período actual empeoró ') + fmtPuntos(d) + ' respecto del comparado.') + '</div>';
    } else dif = '<div class="cmp-dif">No hay datos medidos en alguno de los períodos para comparar.</div>';
    el.innerHTML = notas.map(function (t) { return '<p class="cmp-nota">' + esc(t) + '</p>'; }).join('') + dif +
      '<div class="cmp-tarjetas">' + tarjetaComp('a', 'PERÍODO ACTUAL', a) + tarjetaComp('b', 'COMPARADO', b) + '</div>' +
      '<h3 class="cmp-sec">Evolución de la disponibilidad</h3>' + graficoComp(a, b) + tablaComp(a, b);
  }
  $('btn-comparar').addEventListener('click', abrirComparar);
  $('cmp-desde').addEventListener('change', pedirComparacion);
  $('cmp-hasta').addEventListener('change', pedirComparacion);
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-cmp-atajo]'); if (!t || !resumen) return;
    var k = t.getAttribute('data-cmp-atajo'), a = resumen;
    if (k === 'anterior') { var bh = sumarDias(a.desde, -1); ponerFechasComp(sumarDias(bh, -(diasEntre(a.desde, a.hasta) - 1)), bh); }
    else { var m = k === 'mes' ? -1 : -12; ponerFechasComp(sumarMeses(a.desde, m), sumarMeses(a.hasta, m)); }
    pedirComparacion();
  });

"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    # sección: texto, y los campos de fecha en lugar de Día / Semana / Mes
    h = _rep(h, "Elegí un día, una semana o un mes: todo lo de esta sección corresponde a ese período.",
             "Elegí desde qué día y hasta qué día mirar: todo lo de esta sección corresponde a ese período.")
    h = _rep(h, '    <div class="per-barra" id="per-barra"></div>\n', BARRA)
    h = _rep(h, '<dialog class="dlg" id="dlg-derivar">', DIALOGO + '<dialog class="dlg" id="dlg-derivar">')
    # estado y pedido
    h = _rep(h, "var periodo = { tipo: 'mes', fecha: null }, resumen = null,", "var periodo = { desde: null, hasta: null }, resumen = null,")
    h = _rep(h, "  var PER_TIPOS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];\n", "")
    h = _rep(h, "var clave = periodo.tipo + '|' + (periodo.fecha || '') + '|' + rev;", "var clave = (periodo.desde || '') + '|' + (periodo.hasta || '') + '|' + rev;")
    h = _rep(h, "return pedir('/api/tablero/periodo?tipo=' + periodo.tipo + (periodo.fecha ? '&fecha=' + periodo.fecha : '')).then(function (r) {",
             "return pedir('/api/tablero/periodo' + consultaPeriodo(periodo)).then(function (r) {")
    h = _rep(h, "      $('per-dispo').innerHTML = '<p class=\"vacio\">No se pudo cargar el período: ' + esc(e.message) + '</p>';\n",
             "      if (resumen) {   // el rango no se pudo medir: los campos vuelven al último período bueno y se explica por qué\n"
             "        periodo = { desde: resumen.desde, hasta: resumen.hasta }; $('per-desde').value = resumen.desde; $('per-hasta').value = resumen.hasta;\n"
             "        try { sessionStorage.setItem('helios_periodo', JSON.stringify(periodo)); } catch (x) { /* nada */ }\n"
             "        errorPeriodo(e.message); return;\n"
             "      }\n"
             "      if (periodo.desde) { periodo = { desde: null, hasta: null }; try { sessionStorage.removeItem('helios_periodo'); } catch (x) { /* nada */ } return pedirPeriodo(true); }\n"
             "      $('per-dispo').innerHTML = '<p class=\"vacio\">No se pudo cargar el período: ' + esc(e.message) + '</p>';\n")
    # pintarPeriodo: la barra ya está en la página, solo se actualizan los valores
    i = h.index("    $('per-barra').innerHTML = "); j = h.index("    pintarDispo(r);\n", i)
    h = h[:i] + "    pintarBarraPeriodo(r);\n" + h[j:]
    h = _rep(h, "      resumen = r; resumenClave = clave; pintarPeriodo();", "      if (r.hasta > r.hoy) r.hasta = r.hoy;   // el mes o la semana en curso se miran hasta hoy\n      resumen = r; resumenClave = clave; pintarPeriodo();")
    # los botones Día / Semana / Mes y las flechas se van; entran los campos y la comparación
    i = h.index("  document.addEventListener('click', function (ev) {\n    var t = ev.target.closest && ev.target.closest('[data-per-tipo]')")
    j = h.index("    pedirPeriodo(true);\n  });\n", i) + len("    pedirPeriodo(true);\n  });\n")
    h = h[:i] + JS + h[j:]
    # barras de clientes: flecha que gira, y la indicación en el título
    h = _rep(h, "<h3>Clientes según su disponibilidad</h3>'", "<h3>Clientes según su disponibilidad <span class=\"dd-hint\">· tocá una barra para ver los clientes de cada grupo</span></h3>'")
    h = _rep(h, "cant + (cant === 1 ? ' cliente' : ' clientes') + '</span></button>';", "cant + (cant === 1 ? ' cliente' : ' clientes') + '<span class=\"dd-rflecha\" aria-hidden=\"true\">›</span></span></button>';")
    h = _rep(h, "'<p class=\"dd-ayuda\">Tocá una barra para ver los clientes de ese grupo. Verde:", "'<p class=\"dd-ayuda\">Verde:")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'HTML', tablero)
    return s
