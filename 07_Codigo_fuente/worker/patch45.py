# Parche 45 (dashboard gerencial, parte 4): disponibilidad mensual contra un objetivo, configurable.
#   - Qué es: de todo el tiempo que se midió, cuánto estuvo bien. Se mide en ventanas de 15 minutos de cada servicio: una ventana con
#     una alerta Grave cuenta como no disponible, una Importante cuenta la mitad y una Leve no cuenta (los tres porcentajes se
#     editan). No cuentan los avisos de datos tardíos o inconsistentes ni los clientes sin historia. La disponibilidad de un cliente
#     es el promedio de sus servicios, y los más críticos pesan más (Alta 3, Media 2, Baja 1: también editable).
#   - Objetivo mensual: por defecto 99,9 % (unos 43 minutos por mes, unas 3 ventanas Graves). Se puede cambiar en general, por cliente
#     o por servicio, con decimales (por ejemplo 99,98 %), en Administración > Umbrales (grupo "5 · Disponibilidad mensual"), y los
#     pesos en "Cómo se mide la disponibilidad". Cada pantalla muestra al lado cuántos minutos y ventanas equivale el objetivo elegido.
#   - Tablero: dentro de "Disponibilidad y resumen del período" (el selector Día / Semana / Mes del parche 44): disponibilidad global y
#     por cliente contra su objetivo, cuánto del margen de errores del mes se usó (barra), comparación con el período anterior y el
#     detalle por servicio al abrir un cliente. Para un día o una semana se compara contra el margen del mes.
#   - Datos: columna umbrales_config.objetivo_mensual y alerta_parametros.disponibilidad_config (JSON con los pesos): script 20
#     (20_disponibilidad_d1.txt). Sin el script el tablero usa los valores de fábrica y Administración avisa que falta para guardar.
#   - Rutas: GET/POST /api/admin/umbrales/disponibilidad (solo Administrador); el resumen por período suma "disponibilidad".
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
// DISPONIBILIDAD MENSUAL (parche 45)
//   Se mide en ventanas de 15 minutos de cada servicio. Una ventana con una alerta Grave cuenta como no disponible, una Importante cuenta
//   la mitad y una Leve no cuenta (pesos editables: alerta_parametros.disponibilidad_config). La disponibilidad de un cliente es el
//   promedio de sus servicios, ponderado por criticidad (editable). El objetivo mensual sale de umbrales_config.objetivo_mensual
//   (general, por cliente o por servicio; fábrica 99,9 %). No cuentan: datos tardíos, datos inconsistentes ni series sin perfil.
// =====================================================================
const DISPO_OBJETIVO_FABRICA = 0.999;
const DISPO_TIPOS_SIN_CONTAR = ['DATO_TARDIO', 'DATO_INCONSISTENTE', 'SIN_PREDICCION'];
function dispoConfig(texto) {
  const c = { pesos_gravedad: { CRITICA: 1, ALTA: 0.5, MEDIA: 0 }, pesos_criticidad: { ALTA: 3, MEDIA: 2, BAJA: 1 } };
  let j = null;
  try { j = texto ? JSON.parse(texto) : null; } catch (e) { j = null; }
  if (j) {
    for (const [grupo, claves] of [['pesos_gravedad', ['CRITICA', 'ALTA', 'MEDIA']], ['pesos_criticidad', ['ALTA', 'MEDIA', 'BAJA']]]) {
      for (const k of claves) {
        const n = j[grupo] ? Number(j[grupo][k]) : NaN;
        if (Number.isFinite(n) && n >= 0 && n <= 100) c[grupo][k] = n;
      }
    }
  }
  return c;
}
// Lee la configuración; si falta el script 20 devuelve los valores de fábrica y instalado = false
async function dispoLeer(env) {
  try {
    const r = await env.DB.batch([
      env.DB.prepare('SELECT disponibilidad_config AS c FROM alerta_parametros WHERE id = 1'),
      env.DB.prepare('SELECT objetivo_mensual FROM umbrales_config LIMIT 1'),
    ]);
    return { cfg: dispoConfig(r[0].results[0] && r[0].results[0].c), instalado: true };
  } catch (e) {
    return { cfg: dispoConfig(null), instalado: false };
  }
}
// Valor más específico: cliente y servicio, después el cliente, después el general
function dispoValor(umbrales, cli, srv, campo, defecto) {
  const filas = [umbrales.find((f) => f.cliente_id === cli && f.servicio_id === srv), umbrales.find((f) => f.cliente_id === cli && f.servicio_id === '*'),
    umbrales.find((f) => f.cliente_id === '*' && f.servicio_id === '*')];
  for (const f of filas) if (f && f[campo] != null) return f[campo];
  return defecto;
}
const Q_DISPO_VENTANAS = `
SELECT cliente_id, servicio_id, SUM(sev = 1) AS graves, SUM(sev = 2) AS importantes, SUM(sev = 3) AS leves
FROM (
  SELECT cliente_id, servicio_id, ventana_inicio,
         MIN(CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 ELSE 3 END) AS sev
  FROM alertas_historico
  WHERE ventana_inicio >= ?1 AND ventana_inicio < ?2 AND severidad IN ('CRITICA', 'ALTA', 'MEDIA')
    AND tipo_alerta NOT IN ('DATO_TARDIO', 'DATO_INCONSISTENTE', 'SIN_PREDICCION')
  GROUP BY cliente_id, servicio_id, ventana_inicio
)
GROUP BY cliente_id, servicio_id
`;
// Disponibilidad de un período [desdeISO, hastaISO), medida hasta ahora. minutosMes: minutos del mes calendario del período (margen de errores)
function dispoCalcular(cfg, umbrales, series, malas, desdeISO, hastaISO, ahoraMs, minutosMes) {
  const d0 = Date.parse(desdeISO), d1 = Date.parse(hastaISO), fin = Math.min(d1, ahoraMs), VENT = 15 * 60e3;
  const svcs = new Map();
  const dame = (cli, srv) => {
    const k = cli + '|' + srv;
    if (!svcs.has(k)) svcs.set(k, { cliente_id: cli, servicio_id: srv, primera: Infinity, graves: 0, importantes: 0, leves: 0 });
    return svcs.get(k);
  };
  for (const s of series) { const x = dame(s.cliente_id, s.servicio_id), p = Date.parse(s.primera_ventana_inicio); if (!isNaN(p)) x.primera = Math.min(x.primera, p); }
  for (const m of malas) { const x = dame(m.cliente_id, m.servicio_id); x.graves = m.graves || 0; x.importantes = m.importantes || 0; x.leves = m.leves || 0; if (x.primera === Infinity) x.primera = d0; }
  const pg = cfg.pesos_gravedad, lista = [];
  for (const x of svcs.values()) {
    if (x.primera === Infinity) continue;
    const ini = Math.max(d0, x.primera), medidas = Math.floor((fin - ini) / VENT);
    if (medidas <= 0) continue;
    const ponderadas = x.graves * pg.CRITICA + x.importantes * pg.ALTA + x.leves * pg.MEDIA;
    const perdidos = Math.min(ponderadas, medidas) * 15, medidos = medidas * 15;
    const criticidad = dispoValor(umbrales, x.cliente_id, x.servicio_id, 'criticidad', 'MEDIA');
    const objetivo = dispoValor(umbrales, x.cliente_id, x.servicio_id, 'objetivo_mensual', DISPO_OBJETIVO_FABRICA);
    const disp = 1 - perdidos / medidos;
    lista.push({ cliente_id: x.cliente_id, servicio_id: x.servicio_id, criticidad, peso: cfg.pesos_criticidad[criticidad] != null ? cfg.pesos_criticidad[criticidad] : 1,
      objetivo, disponibilidad: disp, graves: x.graves, importantes: x.importantes, leves: x.leves,
      minutos_perdidos: Math.round(perdidos * 10) / 10, minutos_medidos: medidos, minutos_permitidos: Math.round((1 - objetivo) * minutosMes * 10) / 10,
      consumo: (1 - objetivo) * minutosMes > 0 ? perdidos / ((1 - objetivo) * minutosMes) : (perdidos > 0 ? 99 : 0) });
    // Cumple mientras no se gaste todo el margen de errores del mes (si el mes no terminó, "hasta ahora")
    lista[lista.length - 1].cumple = lista[lista.length - 1].consumo <= 1 + 1e-12;
  }
  const resumen = (xs, cli) => {
    let pp = 0, pm = 0, pw = 0, pt = 0;
    for (const s of xs) { pp += s.peso * s.minutos_perdidos; pm += s.peso * s.minutos_medidos; pw += s.peso; }
    if (!pm) return null;
    const disp = 1 - pp / pm, objetivo = dispoValor(umbrales, cli, '*', 'objetivo_mensual', DISPO_OBJETIVO_FABRICA);
    const perdidosEq = pp / pw, permitido = (1 - objetivo) * minutosMes;
    const consumo = permitido > 0 ? perdidosEq / permitido : (perdidosEq > 0 ? 99 : 0);
    return { disponibilidad: disp, objetivo, cumple: consumo <= 1 + 1e-12, minutos_perdidos: Math.round(perdidosEq * 10) / 10,
      minutos_permitidos: Math.round(permitido * 10) / 10, consumo, servicios_medidos: xs.length };
  };
  if (!lista.length) return { global: null, clientes: [] };
  const porCliente = new Map();
  for (const s of lista) { if (!porCliente.has(s.cliente_id)) porCliente.set(s.cliente_id, []); porCliente.get(s.cliente_id).push(s); }
  const clientes = [...porCliente.entries()].map(([cli, xs]) => Object.assign({ cliente_id: cli,
    servicios: xs.sort((a, b) => b.consumo - a.consumo || (a.servicio_id < b.servicio_id ? -1 : 1)) }, resumen(xs, cli)))
    .sort((a, b) => b.consumo - a.consumo || (a.cliente_id < b.cliente_id ? -1 : 1));
  return { global: resumen(lista, '*'), clientes };
}
async function dispoGuardar(env, request, yo) {
  const b = await leerCuerpo(request);
  const g = b.pesos_gravedad || {}, c = b.pesos_criticidad || {}, pg = {}, pc = {};
  for (const k of ['CRITICA', 'ALTA', 'MEDIA']) {
    const n = Number(g[k]);
    if (g[k] === '' || g[k] == null || !Number.isFinite(n) || n < 0 || n > 1) return jsonError('Cada peso de gravedad tiene que estar entre 0 % y 100 %.', 400);
    pg[k] = Math.round(n * 1000) / 1000;
  }
  if (pg.CRITICA <= 0) return jsonError('Una alerta Grave tiene que contar algo de tiempo no disponible (más de 0 %).', 400);
  if (pg.ALTA > pg.CRITICA || pg.MEDIA > pg.ALTA) return jsonError('El orden tiene que ser: Grave cuenta lo mismo o más que Importante, e Importante lo mismo o más que Leve.', 400);
  for (const k of ['ALTA', 'MEDIA', 'BAJA']) {
    const n = Number(c[k]);
    if (c[k] === '' || c[k] == null || !Number.isFinite(n) || n < 0.1 || n > 100) return jsonError('El peso de cada criticidad tiene que ser un número entre 0,1 y 100.', 400);
    pc[k] = Math.round(n * 100) / 100;
  }
  if (pc.MEDIA > pc.ALTA || pc.BAJA > pc.MEDIA) return jsonError('El orden tiene que ser: criticidad Alta pesa lo mismo o más que Media, y Media lo mismo o más que Baja.', 400);
  const d = await dispoLeer(env);
  if (!d.instalado) return jsonError('Falta correr el script 20 (20_disponibilidad_d1.txt) en la consola de D1.', 409);
  const pct = (v) => String(Math.round(v * 1000) / 10).replace('.', ',') + ' %';
  const detalle = 'Grave ' + pct(pg.CRITICA) + ', Importante ' + pct(pg.ALTA) + ', Leve ' + pct(pg.MEDIA) + '; peso de criticidad Alta ' + pc.ALTA + ', Media ' + pc.MEDIA + ', Baja ' + pc.BAJA;
  await env.DB.batch([
    env.DB.prepare('UPDATE alerta_parametros SET disponibilidad_config = ?1 WHERE id = 1').bind(JSON.stringify({ pesos_gravedad: pg, pesos_criticidad: pc })),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'EDITAR_DISPONIBILIDAD', detalle.slice(0, 500)),
    env.DB.prepare(MARCAR_TABLERO),
  ]);
  return okJson({});
}

"""

CSS_TABLERO = """/* Disponibilidad (parche 45) */
.dispo { margin: 0 0 8px; }
.dd-global { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 22px; align-items: center; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); padding: 16px 20px; margin-bottom: 12px; }
.dd-global .dd-grande b { display: block; font-size: 38px; line-height: 1.05; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.dd-global .dd-grande span { display: block; color: var(--ink-2); font-size: 13px; margin-top: 3px; }
.dd-lineas { display: grid; gap: 6px; min-width: 0; }
.dd-lineas p { margin: 0; font-size: 13.5px; color: var(--ink-2); }
.dd-chip { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.dd-chip.cumple { background: var(--ok-bg); color: var(--ok-txt); }
.dd-chip.nocumple { background: var(--critica-bg); color: var(--critica-txt); }
.dd-barra { display: block; height: 10px; border-radius: 5px; background: var(--track); overflow: hidden; min-width: 70px; }
.dd-barra i { display: block; height: 100%; border-radius: 5px; background: var(--ok); }
.dd-barra i.atencion { background: var(--alta); }
.dd-barra i.mal { background: var(--critica); }
.dd-cli { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); margin-bottom: 8px; }
.dd-cli > summary { position: relative; display: grid; grid-template-columns: minmax(70px, 110px) 96px 84px minmax(110px, 1fr) minmax(0, 1.3fr); gap: 4px 14px; align-items: center; padding: 10px 14px 10px 30px; cursor: pointer; list-style: none; }
.dd-cli > summary::-webkit-details-marker { display: none; }
.dd-cli > summary::before { content: '▸'; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-3); font-size: 12px; }
.dd-cli[open] > summary::before { content: '▾'; }
.dd-cli > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 8px; }
.dd-cli > summary .dd-chip { justify-self: start; }
.dd-nom { font-weight: 700; }
.dd-pct { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
.dd-uso { font-size: 12.5px; color: var(--ink-2); min-width: 0; }
.dd-detalle { padding: 0 14px 12px; }
.dd-detalle p { margin: 0 0 8px; font-size: 13px; color: var(--ink-2); }
.dd-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
.dd-tabla th { text-align: left; font-weight: 600; color: var(--ink-3); padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.dd-tabla td { padding: 6px 8px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.dd-tabla .n { text-align: right; }
.dd-nota { margin: 10px 2px 0; font-size: 12.5px; color: var(--ink-3); max-width: 90ch; }
@media (max-width: 700px) {
  .dd-global { grid-template-columns: minmax(0, 1fr); }
  .dd-cli > summary { grid-template-columns: minmax(0, 1fr) auto; }
  .dd-cli > summary .dd-uso, .dd-cli > summary .dd-barra { grid-column: 1 / -1; }
}
"""

JS_TABLERO = r"""  // ---- Disponibilidad (parche 45) ----
  function pctD(v, obj) {
    var p = v * 100, t = Math.round(p * 100) / 100;
    if (obj != null && (t >= obj * 100 - 1e-9) !== (v >= obj - 1e-12)) t = Math.floor(p * 1000) / 1000;   // que el redondeo no esconda si cumple o no
    return t.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' %';
  }
  function minD(m) { return (Math.round(m * 10) / 10).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' min'; }
  function claseUso(c) { return c > 1 ? 'mal' : c > 0.6 ? 'atencion' : ''; }
  function barraUso(c) { return '<span class="dd-barra" aria-hidden="true"><i class="' + claseUso(c) + '" style="width:' + Math.max(c > 0 ? 3 : 0, Math.min(100, Math.round(c * 100))) + '%"></i></span>'; }
  function chipCumple(x) { return '<span class="dd-chip ' + (x.cumple ? 'cumple' : 'nocumple') + '">' + (x.cumple ? 'Cumple' : 'No cumple') + '</span>'; }
  function usoTxt(x) {
    return 'Usó ' + minD(x.minutos_perdidos) + ' de los ' + minD(x.minutos_permitidos) + ' que permite el mes (' + (x.consumo > 9.99 ? 'más de 1.000' : Math.round(x.consumo * 100).toLocaleString('es-AR')) + ' %)';
  }
  function pintarDispo(r) {
    var el = $('per-dispo'); if (!el) return;
    var dsp = r.disponibilidad;
    if (!dsp || !dsp.global) { el.innerHTML = '<p class="vacio">Todavía no hay datos para medir la disponibilidad en este período.</p>'; return; }
    var g = dsp.global, ant = r.disponibilidad_anterior, cfg = r.config_disponibilidad || {};
    var cmp = '';
    if (ant && ant.global) {
      var dif = Math.round((g.disponibilidad - ant.global.disponibilidad) * 10000) / 100;
      cmp = dif === 0 ? 'Igual que ' + esc(ant.titulo) + '.' : (dif > 0 ? '▲ Mejoró ' : '▼ Empeoró ') + Math.abs(dif).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + (Math.abs(dif) === 1 ? ' punto' : ' puntos') + ' respecto de ' + esc(ant.titulo) + ' (' + pctD(ant.global.disponibilidad, g.objetivo) + ').';
    } else if (ant) cmp = 'No hay datos de ' + esc(ant.titulo) + ' para comparar.';
    var pg = cfg.pesos_gravedad || {};
    var porcent = function (v) { return (Math.round(v * 1000) / 10).toLocaleString('es-AR') + ' %'; };
    el.innerHTML = '<div class="dispo">' +
      '<div class="dd-global"><div class="dd-grande"><b>' + pctD(g.disponibilidad, g.objetivo) + '</b><span>disponibilidad · ' + esc(r.titulo) + (r.parcial ? ' (hasta ahora)' : '') + '</span></div>' +
      '<div class="dd-lineas"><p>' + chipCumple(g) + ' Objetivo del mes: <b>' + pctD(g.objetivo) + '</b>' + (g.servicios_medidos ? ' · ' + g.servicios_medidos + (g.servicios_medidos === 1 ? ' servicio medido' : ' servicios medidos') : '') + '</p>' +
      barraUso(g.consumo) + '<p>' + usoTxt(g) + '.</p>' + (cmp ? '<p>' + cmp + '</p>' : '') + '</div></div>' +
      dsp.clientes.map(function (c) {
        return '<details class="dd-cli"' + (!c.cumple ? ' open' : '') + '><summary><span class="dd-nom">' + esc(c.cliente_id) + '</span><span class="dd-pct">' + pctD(c.disponibilidad, c.objetivo) + '</span>' +
          chipCumple(c) + barraUso(c.consumo) + '<span class="dd-uso">' + usoTxt(c) + '</span></summary>' +
          '<div class="dd-detalle"><p>Objetivo del mes para ' + esc(c.cliente_id) + ': <b>' + pctD(c.objetivo) + '</b>. Cada servicio cuenta según su criticidad.</p>' +
          '<div class="tabla-scroll"><table class="dd-tabla"><thead><tr><th>Servicio</th><th>Criticidad</th><th class="n">Disponibilidad</th><th class="n">Objetivo</th><th class="n">Ventanas con problema</th><th class="n">Sin servicio</th></tr></thead><tbody>' +
          c.servicios.map(function (s) {
            var vent = [s.graves ? s.graves + (s.graves === 1 ? ' grave' : ' graves') : '', s.importantes ? s.importantes + (s.importantes === 1 ? ' importante' : ' importantes') : '', s.leves ? s.leves + (s.leves === 1 ? ' leve' : ' leves') : ''].filter(Boolean).join(', ') || 'ninguna';
            return '<tr><td>' + esc(SERV_CORTO[s.servicio_id] || s.servicio_id) + '</td><td>' + esc({ ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }[s.criticidad] || s.criticidad) + '</td><td class="n">' + pctD(s.disponibilidad, s.objetivo) + ' ' + chipCumple(s) + '</td>' +
              '<td class="n">' + pctD(s.objetivo) + '</td><td class="n">' + vent + '</td><td class="n">' + minD(s.minutos_perdidos) + '</td></tr>';
          }).join('') + '</tbody></table></div></div></details>';
      }).join('') +
      '<p class="dd-nota">Se mide en ventanas de 15 minutos de cada servicio: una ventana con una alerta Grave cuenta como no disponible (' + porcent(pg.CRITICA != null ? pg.CRITICA : 1) + '), una Importante cuenta ' + porcent(pg.ALTA != null ? pg.ALTA : 0.5) + ' y una Leve ' + porcent(pg.MEDIA != null ? pg.MEDIA : 0) +
      '. No se cuentan los datos tardíos ni los clientes sin historia. La barra muestra qué parte del margen de errores del mes se usó (un día o una semana se comparan contra el margen del mes): si se gasta todo, no cumple. ' +
      (puedo('admin_umbrales') ? 'El objetivo y la forma de medir se cambian en Administración > Umbrales.' : 'El objetivo y la forma de medir los define el Administrador.') + '</p></div>';
  }

"""

# ---- Administración ----
ADMIN_CSS = """/* Disponibilidad mensual (parche 45) */
.dispo-pesos { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 16px; margin: 8px 0 12px; }
.dispo-pesos .campo input { text-align: right; }
.dispo-ejemplo { background: var(--track); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--ink-2); margin: 4px 0 12px; line-height: 1.45; }
.dispo-ejemplo b { color: var(--ink); }
"""

ADMIN_SECCION = ('    <div class="cab-seccion" style="margin-top:30px">\n'
                 '      <div><h2>Disponibilidad mensual</h2><p class="bajada">Qué parte del mes se espera que cada servicio funcione bien, y cómo se mide. El objetivo se cambia por cliente o servicio en cada excepción (grupo 5); acá se define qué cuenta como tiempo sin servicio.</p></div>\n'
                 '      <button class="btn" id="btn-dispo">Cómo se mide la disponibilidad</button>\n'
                 '    </div>\n'
                 '    <div class="fichas" id="fichas-dispo"></div>\n')

ADMIN_GRUPO = ('    <fieldset class="grupo">\n'
               '      <legend>5 · Disponibilidad mensual</legend>\n'
               '      <p class="bajada">Qué parte del mes se espera que el servicio funcione bien. Se mide en ventanas de 15 minutos: las Graves cuentan como no disponibles y las Importantes cuentan la mitad (se ajusta en "Cómo se mide la disponibilidad"). No cambia cuándo se abre una alerta.</p>\n'
               '      <div class="fu"><label class="fu-nombre" for="um-objetivo_mensual">Objetivo mensual de disponibilidad<small>Por ejemplo 99,9 % o 99,98 %. Cuanto más cerca de 100, menos tiempo sin servicio se tolera en el mes</small></label><span class="fu-control"><input type="text" inputmode="decimal" id="um-objetivo_mensual" autocomplete="off"><em>%</em></span><small class="reco" data-reco="objetivo_mensual"></small></div>\n'
               '    </fieldset>\n')

ADMIN_DIALOGO = r"""
<!-- Diálogo: cómo se mide la disponibilidad (parche 45) -->
<dialog id="dlg-dispo" class="ancho">
  <form id="f-dispo" method="dialog">
    <h2>Cómo se mide la disponibilidad</h2>
    <p class="bajada">Disponibilidad = del tiempo que se midió, cuánto estuvo bien. Se mira cada ventana de 15 minutos de cada servicio. Esto vale para todos los clientes.</p>
    <p class="alcance-fijo" id="dp-aviso" hidden></p>
    <h3>Cuánto cuenta cada gravedad como tiempo sin servicio</h3>
    <div class="dispo-pesos">
      <label class="campo"><span>Grave (%)</span><input type="text" inputmode="decimal" id="dp-CRITICA" autocomplete="off"></label>
      <label class="campo"><span>Importante (%)</span><input type="text" inputmode="decimal" id="dp-ALTA" autocomplete="off"></label>
      <label class="campo"><span>Leve (%)</span><input type="text" inputmode="decimal" id="dp-MEDIA" autocomplete="off"></label>
    </div>
    <h3>Cuánto pesa cada servicio en la disponibilidad del cliente</h3>
    <div class="dispo-pesos">
      <label class="campo"><span>Criticidad Alta</span><input type="text" inputmode="decimal" id="dp-c-ALTA" autocomplete="off"></label>
      <label class="campo"><span>Criticidad Media</span><input type="text" inputmode="decimal" id="dp-c-MEDIA" autocomplete="off"></label>
      <label class="campo"><span>Criticidad Baja</span><input type="text" inputmode="decimal" id="dp-c-BAJA" autocomplete="off"></label>
    </div>
    <div class="dispo-ejemplo" id="dp-ejemplo"></div>
    <p class="error-form" id="dp-error" hidden></p>
    <div class="acc-dlg"><button type="button" class="btn" id="dp-fabrica">Volver a los valores de fábrica</button><span class="separa"></span><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="dp-guardar">Guardar</button></div>
  </form>
</dialog>
"""

ADMIN_JS = r"""  // ---------- Disponibilidad mensual (parche 45) ----------
  var DISPO_FAB = { pg: { CRITICA: 1, ALTA: 0.5, MEDIA: 0 }, pc: { ALTA: 3, MEDIA: 2, BAJA: 1 } };
  function dispoCfg() { var d = (UMB && UMB.disponibilidad) || {}; return { pg: d.pesos_gravedad || DISPO_FAB.pg, pc: d.pesos_criticidad || DISPO_FAB.pc }; }
  function minutosTxt(m) { return m >= 60 ? nTxt(Math.round(m / 6) / 10) + ' h' : nTxt(Math.round(m * 10) / 10) + ' min'; }
  // Cuánto equivale un objetivo mensual: minutos por mes (30 días) y ventanas Graves o Importantes de 15 minutos
  function equivalencia(obj) {
    var c = dispoCfg(), mins = (1 - obj) * 43200;
    var graves = c.pg.CRITICA > 0 ? mins / 15 / c.pg.CRITICA : null, imp = c.pg.ALTA > 0 ? mins / 15 / c.pg.ALTA : null;
    return nTxt(Math.round(obj * 100000) / 1000) + ' % equivale a ' + minutosTxt(mins) + ' sin servicio por mes' +
      (graves != null ? ': ' + nTxt(Math.round(graves * 10) / 10) + ' ventanas Graves de 15 minutos' + (imp != null ? ' (o ' + nTxt(Math.round(imp * 10) / 10) + ' Importantes)' : '') : '') + '.' +
      (graves != null && graves < 1 ? ' Una sola ventana Grave ya supera este objetivo.' : '');
  }
  function pintarDispoFichas() {
    var d = (UMB && UMB.disponibilidad) || {}, c = dispoCfg(), g = generales(), obj = g.objetivo_mensual != null ? g.objetivo_mensual : 0.999;
    var f = [
      ['Objetivo mensual general', nTxt(Math.round(obj * 100000) / 1000) + ' %', equivalencia(obj) + ' Cada cliente o servicio puede tener el suyo.'],
      ['Qué cuenta como tiempo sin servicio', 'Grave ' + nTxt(c.pg.CRITICA * 100) + ' % · Importante ' + nTxt(c.pg.ALTA * 100) + ' % · Leve ' + nTxt(c.pg.MEDIA * 100) + ' %', 'Una ventana de 15 minutos con una alerta Grave cuenta ' + (c.pg.CRITICA >= 1 ? 'entera' : nTxt(c.pg.CRITICA * 100) + ' %') + '; con una Importante, ' + nTxt(c.pg.ALTA * 100) + ' %'],
      ['Peso de cada servicio', 'Alta ' + nTxt(c.pc.ALTA) + ' · Media ' + nTxt(c.pc.MEDIA) + ' · Baja ' + nTxt(c.pc.BAJA), 'La disponibilidad de un cliente es el promedio de sus servicios: los más críticos pesan más']
    ];
    if (d.instalado === false) f.unshift(['Falta un paso', 'Correr el script 20', 'En la consola de D1: 20_disponibilidad_d1.txt. Mientras tanto se usan los valores de fábrica y no se pueden guardar cambios.']);
    $('fichas-dispo').innerHTML = f.map(function (x) { return '<div class="ficha"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');
  }
  function dpLeer(id) { var t = $(id).value.trim().replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; }
  function dpPoner(pg, pc) {
    ['CRITICA', 'ALTA', 'MEDIA'].forEach(function (k) { $('dp-' + k).value = String(Math.round(pg[k] * 1000) / 10).replace('.', ','); });
    ['ALTA', 'MEDIA', 'BAJA'].forEach(function (k) { $('dp-c-' + k).value = String(pc[k]).replace('.', ','); });
    dpEjemplo();
  }
  function dpEjemplo() {
    var g = generales(), obj = g.objetivo_mensual != null ? g.objetivo_mensual : 0.999;
    var gr = dpLeer('dp-CRITICA') / 100, im = dpLeer('dp-ALTA') / 100, mins = (1 - obj) * 43200;
    var t = '<b>En la práctica:</b> con el objetivo general de ' + nTxt(Math.round(obj * 100000) / 1000) + ' % se toleran ' + minutosTxt(mins) + ' sin servicio por mes.';
    if (gr > 0) t += ' Eso son ' + nTxt(Math.round(mins / 15 / gr * 10) / 10) + ' ventanas Graves de 15 minutos' + (im > 0 ? ' o ' + nTxt(Math.round(mins / 15 / im * 10) / 10) + ' Importantes' : '') + '.';
    t += ' <b>↑ Si subís los porcentajes</b>, el mismo problema resta más disponibilidad. <b>↓ Si los bajás</b>, resta menos. No cambia cuándo se abre una alerta.';
    $('dp-ejemplo').innerHTML = t;
  }
  document.querySelectorAll('#f-dispo input').forEach(function (el) { el.addEventListener('input', dpEjemplo); });
  $('btn-dispo').addEventListener('click', function () {
    var c = dispoCfg(), inst = !UMB || !UMB.disponibilidad || UMB.disponibilidad.instalado !== false;
    errorForm('dp-error'); dpPoner(c.pg, c.pc);
    $('dp-aviso').hidden = inst; $('dp-aviso').textContent = inst ? '' : 'Falta correr el script 20 en la consola de D1: hasta entonces no se pueden guardar cambios.';
    $('dp-guardar').disabled = !inst;
    $('dlg-dispo').showModal();
  });
  $('dp-fabrica').addEventListener('click', function () { dpPoner(DISPO_FAB.pg, DISPO_FAB.pc); });
  $('f-dispo').addEventListener('submit', function (ev) {
    ev.preventDefault(); errorForm('dp-error');
    var pg = {}, pc = {};
    ['CRITICA', 'ALTA', 'MEDIA'].forEach(function (k) { pg[k] = dpLeer('dp-' + k) / 100; });
    ['ALTA', 'MEDIA', 'BAJA'].forEach(function (k) { pc[k] = dpLeer('dp-c-' + k); });
    if ([pg.CRITICA, pg.ALTA, pg.MEDIA, pc.ALTA, pc.MEDIA, pc.BAJA].some(function (n) { return isNaN(n); })) { errorForm('dp-error', 'Revisá los valores: tienen que ser números.'); return; }
    var b = $('dp-guardar'); b.disabled = true;
    pedir('/api/admin/umbrales/disponibilidad', { pesos_gravedad: pg, pesos_criticidad: pc })
      .then(function () { $('dlg-dispo').close(); toast('Guardado. El tablero lo usa desde la próxima vez que se abra.'); return cargarUmbrales(); })
      .catch(function (e) { errorForm('dp-error', e.message); }).then(function () { b.disabled = false; });
  });

"""


def tablero(h):
    i = h.index('</style>'); h = h[:i] + CSS_TABLERO + h[i:]
    h = _rep(h, "  // ---- Resumen por período (parche 44): día / semana / mes con ‹ › ----\n", JS_TABLERO + "  // ---- Resumen por período (parche 44): día / semana / mes con ‹ › ----\n")
    h = _rep(h, "      kpi(prom == null ? '—' : minutos(prom), 'tardó en resolverse, en promedio');\n",
             "      kpi(prom == null ? '—' : minutos(prom), 'tardó en resolverse, en promedio');\n    pintarDispo(r);\n")
    return h


def admin(h):
    i = h.index('</style>'); h = h[:i] + ADMIN_CSS + h[i:]
    # Pestaña Umbrales: bloque de disponibilidad
    h = _rep(h, '    <div class="fichas" id="fichas-umbrales"></div>\n', '    <div class="fichas" id="fichas-umbrales"></div>\n' + ADMIN_SECCION)
    # Diálogo de umbrales: grupo 5
    h = _rep(h, '    <p class="error-form" id="um-error" hidden></p>\n', ADMIN_GRUPO + '    <p class="error-form" id="um-error" hidden></p>\n')
    h = _rep(h, '<!-- Diálogo: feriado manual -->', ADMIN_DIALOGO.strip('\n') + '\n\n<!-- Diálogo: feriado manual -->')
    # Campo nuevo en el diálogo
    h = _rep(h, "    objetivo_disponibilidad: { x: 100, txt: function (n) { return 'Objetivo ' + n + ' %'; } },\n",
             "    objetivo_disponibilidad: { x: 100, txt: function (n) { return 'Objetivo ' + n + ' %'; } },\n    objetivo_mensual: { x: 100, txt: function (n) { return 'Objetivo mensual ' + n + ' %'; } },\n")
    h = _rep(h, "    objetivo_disponibilidad: ['el tablero exige más: con menos problemas ya marca al cliente debajo del objetivo', 'tolera más ventanas con problemas antes de marcarlo. No cambia las alertas'],\n",
             "    objetivo_disponibilidad: ['el tablero exige más: con menos problemas ya marca al cliente debajo del objetivo', 'tolera más ventanas con problemas antes de marcarlo. No cambia las alertas'],\n"
             "    objetivo_mensual: ['el tablero exige más: con menos minutos sin servicio ya marca al cliente debajo del objetivo del mes', 'tolera más minutos sin servicio en el mes. No cambia las alertas'],\n")
    h = _rep(h, "      if (k === 'objetivo_disponibilidad') {\n        r = 'Lo define el negocio';\n",
             "      if (k === 'objetivo_mensual') {\n        r = 'Lo define el negocio';\n        if (num && v > 0 && v < 1) p = equivalencia(v);\n        if (num && v >= 1) p = 'Con 100 % no se tolera ningún minuto sin servicio.';\n      }\n"
             "      if (k === 'objetivo_disponibilidad') {\n        r = 'Lo define el negocio';\n")
    h = _rep(h, "if (k === 'criticidad' || k === 'objetivo_disponibilidad' || k === 'silenciar_feriados') return;   // los define el negocio",
             "if (k === 'criticidad' || k === 'objetivo_disponibilidad' || k === 'objetivo_mensual' || k === 'silenciar_feriados') return;   // los define el negocio")
    # Fichas
    h = _rep(h, "    $('fichas-umbrales').innerHTML = f.map(function (x) { return '<div class=\"ficha\"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');\n",
             "    $('fichas-umbrales').innerHTML = f.map(function (x) { return '<div class=\"ficha\"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('');\n    pintarDispoFichas();\n")
    h = _rep(h, "  // Formulario\n  function umLeer(k) {", ADMIN_JS + "  // Formulario\n  function umLeer(k) {")
    h = _rep(h, "EDITAR_UMBRALES: 'Cambió umbrales',", "EDITAR_UMBRALES: 'Cambió umbrales', EDITAR_DISPONIBILIDAD: 'Cambió cómo se mide la disponibilidad',")
    return h


def aplicar(s):
    # ---- Servidor: configuración y cálculo ----
    s = _rep(s, "// =====================================================================\n// RESUMEN POR PERÍODO (parche 44)", SERVIDOR + "// =====================================================================\n// RESUMEN POR PERÍODO (parche 44)")
    # El resumen por período suma la disponibilidad
    s = _rep(s, "  const r = await env.DB.batch([\n    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),\n  ]);\n",
             "  const antLim = pLimites(tipo, ant), antDesde = antLim.desde + 'T03:00:00Z', antHasta = antLim.hasta + 'T03:00:00Z';\n"
             "  const diasDelMes = (f) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0)).getUTCDate();\n"
             "  const dsp = await dispoLeer(env);\n"
             "  const r = await env.DB.batch([\n"
             "    env.DB.prepare(Q_INCIDENTES_PERIODO).bind(desdeISO, hastaISO),\n"
             "    env.DB.prepare(Q_DISPO_VENTANAS).bind(desdeISO, hastaISO),\n"
             "    env.DB.prepare(Q_DISPO_VENTANAS).bind(antDesde, antHasta),\n"
             "    env.DB.prepare('SELECT cliente_id, servicio_id, primera_ventana_inicio FROM series_estado'),\n"
             "    env.DB.prepare('SELECT * FROM umbrales_config LIMIT 300'),\n"
             "  ]);\n"
             "  const disponibilidad = dispoCalcular(dsp.cfg, r[4].results, r[3].results, r[1].results, desdeISO, hastaISO, ahoraMs, diasDelMes(pFechaSuma(lim.hasta, -1)) * 1440);\n"
             "  const anterior = dispoCalcular(dsp.cfg, r[4].results, r[3].results, r[2].results, antDesde, antHasta, ahoraMs, diasDelMes(pFechaSuma(antLim.hasta, -1)) * 1440);\n")
    s = _rep(s, "    incidentes: r[0].results,\n  }, { headers",
             "    incidentes: r[0].results,\n    disponibilidad, disponibilidad_anterior: Object.assign({ titulo: pTitulo(tipo, antLim) }, anterior),\n"
             "    config_disponibilidad: dsp.cfg, disponibilidad_instalada: dsp.instalado,\n  }, { headers")
    # ---- Umbrales: campo nuevo y pesos ----
    s = _rep(s, "  objetivo_disponibilidad: { min: 0.9, max: 0.99999 },\n", "  objetivo_disponibilidad: { min: 0.9, max: 0.99999 },\n  objetivo_mensual:        { min: 0.9, max: 0.99999 },\n")
    s = _rep(s, "criticidad: 'MEDIA', objetivo_disponibilidad: 0.97,", "criticidad: 'MEDIA', objetivo_disponibilidad: 0.97, objetivo_mensual: 0.999,")
    s = _rep(s, "criticidad: 'Criticidad', objetivo_disponibilidad: 'Objetivo de disponibilidad',", "criticidad: 'Criticidad', objetivo_disponibilidad: 'Objetivo de disponibilidad', objetivo_mensual: 'Objetivo mensual de disponibilidad',")
    # El objetivo mensual general nunca queda vacío: si no viene, queda el de fábrica
    s = _rep(s, "    const x = umbralValor(k, b[k]);\n    if (!x.ok) return jsonError('Revisá el valor de \"' + UMBRAL_TEXTO[k] + '\".', 400);\n",
             "    const x = umbralValor(k, b[k]);\n    if (!x.ok) return jsonError('Revisá el valor de \"' + UMBRAL_TEXTO[k] + '\".', 400);\n    if (general && x.v === null && k === 'objetivo_mensual') x.v = UMBRAL_FABRICA.objetivo_mensual;\n")
    s = _rep(s, "  return okJson({ filas, parametros: r[1].results[0] || {}, alcance: r[2].results, fabrica: UMBRAL_FABRICA });",
             "  const dsp = await dispoLeer(env);\n  return okJson({ filas, parametros: r[1].results[0] || {}, alcance: r[2].results, fabrica: UMBRAL_FABRICA, disponibilidad: Object.assign({ instalado: dsp.instalado }, dsp.cfg) });")
    s = _rep(s, "  if (m === 'POST' && p === '/umbrales/borrar') return await umbralesBorrar(env, request, yo);\n",
             "  if (m === 'POST' && p === '/umbrales/borrar') return await umbralesBorrar(env, request, yo);\n  if (m === 'POST' && p === '/umbrales/disponibilidad') return await dispoGuardar(env, request, yo);\n")
    # ---- Páginas ----
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
