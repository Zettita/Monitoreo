# Parche 44 (dashboard gerencial, parte 3): resumen por período (día, semana o mes), con ‹ › para ir a períodos anteriores.
#   - Sección nueva en el tablero ("Disponibilidad y resumen del período"): selector Día / Semana / Mes, flechas para ir al período
#     anterior o al siguiente, y "Volver a hoy". Muestra cuántos problemas hubo, cuántos graves, cuántos siguen abiertos y cuánto
#     tardaron en resolverse, y la "Distribución de fallas" (por cliente, tipo o causa) del mismo período. Reemplaza a la sección de
#     fallas de "hoy / 7 / 30 días": ahora se puede mirar cualquier día, semana o mes de hasta 400 días atrás.
#   - GET /api/tablero/periodo?tipo=dia|semana|mes&fecha=AAAA-MM-DD (permiso "tablero": Analista, Gerente y Administrador).
#     Lee los incidentes que empezaron en el período por el índice de ventana_inicio (no recorre la historia). Las semanas van de lunes
#     a domingo y los días son de Argentina (UTC-3). El período actual se mide hasta ahora ("parcial").
#   - El tablero lo vuelve a pedir solo cuando hubo una revisión nueva (marcador de revisión) o cuando se cambia de período.
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


SERVIDOR = r"""// =====================================================================
// RESUMEN POR PERÍODO (parche 44): día, semana o mes (hora de Argentina, UTC-3)
//   GET /api/tablero/periodo?tipo=dia|semana|mes&fecha=AAAA-MM-DD  -> incidentes que empezaron en ese período
// =====================================================================
const PERIODO_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const PERIODO_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const PERIODO_ATRAS_MAX_DIAS = 400;
function pFechaSuma(f, n) { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function pMesSuma(f, n) { const d = new Date(f.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
// Límites en fechas de Argentina: desde (incluido) y hasta (excluido)
function pLimites(tipo, f) {
  if (tipo === 'dia') return { desde: f, hasta: pFechaSuma(f, 1) };
  if (tipo === 'semana') {
    const ini = pFechaSuma(f, -((new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7));   // lunes
    return { desde: ini, hasta: pFechaSuma(ini, 7) };
  }
  const ini = f.slice(0, 8) + '01';
  return { desde: ini, hasta: pMesSuma(ini, 1) };
}
function pFechaDentroDelAnterior(tipo, lim) { return tipo === 'dia' ? pFechaSuma(lim.desde, -1) : tipo === 'semana' ? pFechaSuma(lim.desde, -7) : pMesSuma(lim.desde, -1); }
function pTitulo(tipo, lim) {
  const a = lim.desde, z = pFechaSuma(lim.hasta, -1), dm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
  const may = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  if (tipo === 'dia') return may(PERIODO_DIAS[new Date(a + 'T12:00:00Z').getUTCDay()]) + ' ' + dm(a) + '/' + a.slice(0, 4);
  if (tipo === 'semana') return 'Semana del ' + dm(a) + ' al ' + dm(z) + '/' + z.slice(0, 4);
  return may(PERIODO_MESES[Number(a.slice(5, 7)) - 1]) + ' ' + a.slice(0, 4);
}
// Incidentes que empezaron entre ?1 (incluido) y ?2 (excluido): igual que Q_INCIDENTES_30D, pero con el período elegido
const Q_INCIDENTES_PERIODO = `
SELECT
    h.tipo_alerta,
    CASE MIN(CASE h.severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END)
        WHEN 1 THEN 'CRITICA' WHEN 2 THEN 'ALTA' WHEN 3 THEN 'MEDIA' ELSE 'BAJA' END AS severidad_maxima,
    CASE WHEN h.fecha_resolucion IS NULL THEN 'ABIERTO' ELSE 'RESUELTO' END AS estado_incidente,
    h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id,
    MIN(h.ventana_inicio) AS inicio,
    MAX(h.ventana_fin) AS ultima_ventana_afectada,
    h.fecha_resolucion,
    MAX(h.motivo_resolucion) AS motivo_resolucion,
    MAX(h.causa_resolucion) AS causa_resolucion,
    COUNT(*) AS ventanas_afectadas,
    MIN(h.alerta_id) AS alerta_id,
    ROUND((julianday(COALESCE(h.fecha_resolucion, p.ahora)) - julianday(MIN(h.ventana_inicio))) * 1440, 1) AS duracion_minutos
FROM alertas_historico h
CROSS JOIN (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora FROM alerta_parametros WHERE id = 1) p
WHERE h.ventana_inicio >= ?1 AND h.ventana_inicio < ?2
GROUP BY h.tipo_alerta, h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id, h.duracion_ventana_minutos, h.fecha_resolucion
HAVING NOT EXISTS (
    SELECT 1 FROM alertas_historico x
    WHERE x.ambiente = h.ambiente AND x.cliente_id = h.cliente_id AND x.servicio_id = h.servicio_id
      AND x.producto_id = h.producto_id AND x.canal_id = h.canal_id AND x.moneda_id = h.moneda_id
      AND x.duracion_ventana_minutos = h.duracion_ventana_minutos AND x.tipo_alerta = h.tipo_alerta
      AND x.ventana_inicio < ?1 AND x.fecha_resolucion IS h.fecha_resolucion)
ORDER BY (estado_incidente = 'ABIERTO') DESC, duracion_minutos DESC
LIMIT 1500
`;

async function resumenPeriodo(env, url) {
  const tipo = url.searchParams.get('tipo') || 'mes';
  if (!['dia', 'semana', 'mes'].includes(tipo)) return jsonError('Elegí día, semana o mes.', 400);
  const par = await env.DB.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora, tablero_revision AS revision FROM alerta_parametros WHERE id = 1`).first();
  if (!par) throw new Error('Faltan los parámetros del tablero.');
  const ahoraMs = Date.parse(par.ahora);
  const hoy = new Date(ahoraMs - 3 * 3600e3).toISOString().slice(0, 10);
  let f = url.searchParams.get('fecha') || hoy;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(Date.parse(f + 'T12:00:00Z')) || new Date(f + 'T12:00:00Z').toISOString().slice(0, 10) !== f) return jsonError('La fecha no es válida.', 400);
  if (f > hoy) f = hoy;
  const minimo = pFechaSuma(hoy, -PERIODO_ATRAS_MAX_DIAS);
  if (f < minimo) return jsonError('Se puede mirar hasta ' + PERIODO_ATRAS_MAX_DIAS + ' días atrás.', 400);
  const lim = pLimites(tipo, f);
  const desdeISO = lim.desde + 'T03:00:00Z', hastaISO = lim.hasta + 'T03:00:00Z';
  const parcial = ahoraMs < Date.parse(hastaISO);
  const ant = pFechaDentroDelAnterior(tipo, lim);
  const r = await env.DB.batch([
    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),
  ]);
  return Response.json({
    ok: true, tipo, fecha: f, titulo: pTitulo(tipo, lim), desde: lim.desde, hasta: pFechaSuma(lim.hasta, -1),
    desde_utc: desdeISO, hasta_utc: hastaISO, parcial, es_actual: hoy >= lim.desde && hoy < lim.hasta,
    anterior: ant >= minimo ? ant : null, siguiente: lim.hasta <= hoy ? lim.hasta : null,
    ahora: par.ahora, revision: par.revision, periodo_fijo: true,
    incidentes: r[0].results,
  }, { headers: { 'cache-control': 'no-store' } });
}

"""

CSS = """/* Resumen por período (parche 44) */
.per-barra { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin: 0 0 14px; }
.per-nav { display: inline-flex; align-items: center; gap: 6px; }
.per-nav .btn { padding: 4px 11px; font-size: 16px; line-height: 1.1; }
.per-nav .btn.texto { font-size: 13px; padding: 5px 11px; }
.per-titulo { font-weight: 700; font-size: 16px; min-width: 9ch; text-align: center; }
.per-parcial { font-size: 12.5px; color: var(--ink-3); }
.per-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 18px; }
.per-kpi { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 10px 14px; min-width: 0; }
.per-kpi b { display: block; font-size: 26px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.per-kpi span { display: block; color: var(--ink-2); font-size: 13px; margin-top: 2px; }
.per-sub { margin: 22px 0 4px; font-size: 16px; }
#b-periodo[aria-busy="true"] .per-kpis, #b-periodo[aria-busy="true"] #fallas { opacity: .55; }
"""

SECCION = ('  <section class="bloque" id="b-periodo">\n'
           '    <div class="titulo-filtro"><h2>Disponibilidad y resumen del período</h2></div>\n'
           '    <p class="bajada" id="per-bajada">Elegí un día, una semana o un mes: todo lo de esta sección corresponde a ese período.</p>\n'
           '    <div class="per-barra" id="per-barra"></div>\n'
           '    <div class="per-kpis" id="per-kpis"></div>\n'
           '    <div id="per-dispo"></div>\n'
           '    <h3 class="per-sub">Distribución de fallas</h3>\n'
           '    <p class="bajada">Qué parte de los problemas del período corresponde a cada cliente, tipo de falla o causa.</p>\n'
           '    <div class="fallas" id="fallas"></div>\n'
           '  </section>\n')

JS = r"""  // ---- Resumen por período (parche 44): día / semana / mes con ‹ › ----
  var periodo = { tipo: 'mes', fecha: null }, resumen = null, resumenClave = '', pedidoPeriodo = 0;
  var PER_TIPOS = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];
  function pedirPeriodo(forzar) {
    var rev = datos && datos.parametros ? datos.parametros.revision : null;
    var clave = periodo.tipo + '|' + (periodo.fecha || '') + '|' + rev;
    if (!forzar && resumen && clave === resumenClave) return pintarPeriodo();
    var mio = ++pedidoPeriodo;
    $('b-periodo').setAttribute('aria-busy', 'true');
    return pedir('/api/tablero/periodo?tipo=' + periodo.tipo + (periodo.fecha ? '&fecha=' + periodo.fecha : '')).then(function (r) {
      if (mio !== pedidoPeriodo) return;
      resumen = r; resumenClave = clave; pintarPeriodo();
    }).catch(function (e) {
      if (mio !== pedidoPeriodo) return;
      $('b-periodo').removeAttribute('aria-busy');
      $('per-kpis').innerHTML = '<p class="vacio">No se pudo cargar el período: ' + esc(e.message) + '</p>';
    });
  }
  function pintarPeriodo() {
    var r = resumen; if (!r) return;
    $('b-periodo').removeAttribute('aria-busy');
    $('per-barra').innerHTML = '<div class="fallas-seg" role="group" aria-label="Período">' + PER_TIPOS.map(function (o) {
        return '<button type="button" data-per-tipo="' + o[0] + '" aria-pressed="' + (o[0] === r.tipo) + '">' + o[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="per-nav"><button type="button" class="btn" data-per-ir="anterior" aria-label="Período anterior" title="Período anterior"' + (r.anterior ? '' : ' disabled') + '>‹</button>' +
      '<span class="per-titulo" aria-live="polite">' + esc(r.titulo) + '</span>' +
      '<button type="button" class="btn" data-per-ir="siguiente" aria-label="Período siguiente" title="Período siguiente"' + (r.siguiente ? '' : ' disabled') + '>›</button>' +
      (r.es_actual ? '' : '<button type="button" class="btn texto" data-per-ir="hoy">Volver a hoy</button>') + '</div>' +
      (r.parcial ? '<span class="per-parcial">' + (r.tipo === 'dia' ? 'El día todavía no terminó: se mide hasta ahora.' : 'El período todavía no terminó: se mide hasta ahora.') + '</span>' : '');
    var xs = (r.incidentes || []).filter(function (i) { return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION'; });
    var graves = xs.filter(function (i) { return i.severidad_maxima === 'CRITICA'; }).length;
    var abiertos = xs.filter(function (i) { return i.estado_incidente === 'ABIERTO' || !i.fecha_resolucion; }).length;
    var res = xs.filter(function (i) { return i.estado_incidente === 'RESUELTO' && i.fecha_resolucion; });
    var prom = res.length ? res.reduce(function (t, i) { return t + (i.duracion_minutos || 0); }, 0) / res.length : null;
    function kpi(n, txt) { return '<div class="per-kpi"><b>' + n + '</b><span>' + txt + '</span></div>'; }
    $('per-kpis').innerHTML = kpi(xs.length, xs.length === 1 ? 'problema en el período' : 'problemas en el período') +
      kpi(graves, graves === 1 ? 'grave' : 'graves') +
      kpi(abiertos, abiertos === 1 ? 'sigue abierto ahora' : 'siguen abiertos ahora') +
      kpi(prom == null ? '—' : minutos(prom), 'tardó en resolverse, en promedio');
    if (window.HeliosFallas) window.HeliosFallas($('fallas'), r, function (t) { return frase(t); },
      'Cada problema es una alerta de un servicio y canal, de principio a fin (las ventanas seguidas cuentan una vez). No incluye avisos informativos. Pasá el mouse por una fila para ver el detalle.');
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-per-tipo]'), ir = ev.target.closest && ev.target.closest('[data-per-ir]');
    if (!t && !ir) return;
    if (t) { if (t.getAttribute('data-per-tipo') === periodo.tipo) return; periodo.tipo = t.getAttribute('data-per-tipo'); periodo.fecha = null; }
    if (ir && resumen) {
      var a = ir.getAttribute('data-per-ir');
      periodo.fecha = a === 'anterior' ? resumen.anterior : a === 'siguiente' ? resumen.siguiente : null;
      if (a !== 'hoy' && !periodo.fecha) return;
    }
    pedirPeriodo(true);
  });

"""


def tablero(h):
    # La sección de fallas de "hoy / 7 / 30 días" pasa a ser parte de la sección por período
    i = h.index('  <section class="bloque" id="b-fallas">'); j = h.index('  </section>\n', i) + len('  </section>\n')
    h = h[:i] + SECCION + h[j:]
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    h = _rep(h, "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n", JS + "  // ---- Modo demo: aparece abriendo la página con ?demo ----\n")
    # pintar(): en vez de dibujar la distribución con los incidentes de 30 días, se pide el período elegido
    a = "    if (window.HeliosFallas) window.HeliosFallas(document.getElementById('fallas'), d, function (t) { return frase(t); }, "
    i = h.index(a); j = h.index('\n', i) + 1
    h = h[:i] + "    pedirPeriodo(false);\n" + h[j:]
    return h


def aplicar(s):
    s = _rep(s, "// Todos los datos del dashboard en un solo viaje a la base (más el recálculo, si hace falta)\n",
             SERVIDOR + "// Todos los datos del dashboard en un solo viaje a la base (más el recálculo, si hace falta)\n")
    s = _rep(s, "      if (request.method === 'GET' && ruta === '/api/dashboard') {",
             "      if (request.method === 'GET' && ruta === '/api/tablero/periodo') {\n"
             "        if (!puede(yo, 'tablero')) return jsonError('Tu perfil no usa el tablero general.', 403);\n"
             "        return await resumenPeriodo(env, url);\n"
             "      }\n"
             "      if (request.method === 'GET' && ruta === '/api/dashboard') {")
    s = _html(s, 'HTML', tablero)
    # La distribución de fallas, con un período que viene de afuera (periodo_fijo), no muestra "Hoy / 7 / 30 días" ni filtra por fecha
    # (el código está dos veces: en el tablero y en Mis alertas; el parche solo toca la página del tablero porque Mis alertas no manda periodo_fijo)
    s = _rep(s, "return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION' && ms(i.inicio) >= desde; });",
             "return i.severidad_maxima !== 'BAJA' && i.tipo_alerta !== 'SIN_PREDICCION' && (d.periodo_fijo || ms(i.inicio) >= desde); });", 2)
    s = _rep(s, "seg(CORTES, st.corte, 'corte', 'Ver por') + seg(PERIODOS, st.periodo, 'periodo', 'Período') + '</div>'",
             "seg(CORTES, st.corte, 'corte', 'Ver por') + (d.periodo_fijo ? '' : seg(PERIODOS, st.periodo, 'periodo', 'Período')) + '</div>'", 2)
    return s
