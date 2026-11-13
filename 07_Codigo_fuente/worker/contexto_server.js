// ============================================================================
// CONTEXTO EXTERNO PARA EL ASISTENTE (parche 29)
// ----------------------------------------------------------------------------
// Lo que pasa afuera y puede afectar la operación, para que el asistente lo cruce con las alertas:
//   1. Calendario (gratis, sale de la base): feriados, fines de semana largos, primeros días hábiles del mes
//      (cobro de sueldos), aguinaldo y eventos comerciales cargados por el Administrador.
//   2. Proveedores: incidentes abiertos y mantenimientos programados de servicios que publican su estado
//      (páginas de estado tipo Statuspage). Por defecto Cloudflare y Twilio; se cambia con la variable
//      CONTEXTO_PROVEEDORES = [{"nombre":"…","base":"https://…"}].
//   3. Noticias de Argentina de las últimas 48 h que pueden afectar pagos y transferencias (buscador abierto GDELT).
//      Se cambia la búsqueda con CONTEXTO_NOTICIAS_CONSULTA. Con CONTEXTO_EXTERNO = "apagado" no se consulta nada de afuera.
//   4. Eventos comerciales (Hot Sale, CyberMonday, Black Friday…): tabla eventos_comerciales, Administración > Umbrales.
//
// Cuidado del plan gratuito:
//   - Proveedores y noticias se consultan como mucho una vez por hora y se guardan en contexto_externo
//     (1 fila por fuente): leerlos cuesta 1 consulta; actualizarlos, 1 escritura por fuente y hora.
//   - Solo se consultan cuando alguien le pregunta al asistente algo de este tema (no hay cron).
//   - Cada pedido externo tiene 5 segundos de tope; si falla, se usa lo último guardado y se avisa.
// Tablas: contexto_externo y eventos_comerciales (script 12_contexto_externo_d1.txt).
// ============================================================================
const CONTEXTO_MINUTOS = 60;
const CONTEXTO_TOPE_MS = 5000;
const CONTEXTO_PROVEEDORES_FABRICA = [
  { nombre: 'Cloudflare', base: 'https://www.cloudflarestatus.com' },
  { nombre: 'Twilio (SMS y códigos de verificación)', base: 'https://status.twilio.com' },
];
// Noticias: primero Google Noticias (Argentina, en español; responde rápido), y si falla, GDELT (más lento)
const CONTEXTO_NOTICIAS_FABRICA = '"paro bancario" OR "home banking" OR "billeteras virtuales" OR "Mercado Pago" OR "BCRA" OR "transferencias" OR "corte de luz" OR "apagón" OR "ciberataque" OR "caída del sistema"';
const CONTEXTO_NOTICIAS_GDELT = '("paro bancario" OR "caída del sistema" OR "home banking" OR "billeteras virtuales" OR "Mercado Pago" OR "BCRA" OR "corte de luz" OR "apagón" OR "ciberataque" OR "transferencias inmediatas") sourcecountry:AR sourcelang:spanish';
const CTX_IMPACTO = { none: 'sin impacto', minor: 'menor', major: 'importante', critical: 'grave', maintenance: 'mantenimiento' };
const CTX_ESTADO = { investigating: 'investigando', identified: 'causa identificada', monitoring: 'en observación', scheduled: 'programado', in_progress: 'en curso', verifying: 'verificando' };
const CTX_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const ctxDia = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const ctxSumar = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const ctxDow = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
function ctxHoraArg(iso) {
  const t = Date.parse(iso); if (isNaN(t)) return null;
  const d = new Date(t - 3 * 3600000).toISOString();
  return ctxDia(d.slice(0, 10)) + ' ' + d.slice(11, 16);
}
async function ctxTraer(url, texto, tope) {
  const r = await fetch(url, { headers: { accept: texto ? 'application/rss+xml, text/xml' : 'application/json', 'user-agent': 'Helios-Monitoreo/1.0' }, signal: AbortSignal.timeout(tope || CONTEXTO_TOPE_MS) });
  if (!r.ok) throw new Error('respondió ' + r.status);
  const t = await r.text();
  if (texto) return t;
  try { return JSON.parse(t); } catch (e) { throw new Error('no devolvió datos válidos'); }
}
const ctxEntidades = (t) => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
function ctxProveedores(env) {
  try {
    const l = env.CONTEXTO_PROVEEDORES ? JSON.parse(env.CONTEXTO_PROVEEDORES) : CONTEXTO_PROVEEDORES_FABRICA;
    return (Array.isArray(l) ? l : []).filter((p) => p && typeof p.nombre === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(String(p.base || '').replace(/\/$/, '')))
      .slice(0, 6).map((p) => ({ nombre: p.nombre.slice(0, 60), base: p.base.replace(/\/$/, '') }));
  } catch (e) { return CONTEXTO_PROVEEDORES_FABRICA; }
}

// ---------- Fuentes externas (con caché de una hora en contexto_externo) ----------
async function ctxBajarProveedores(env, ahoraMs) {
  const out = [], errores = [];
  await Promise.all(ctxProveedores(env).map(async (p) => {
    try {
      const [inc, man] = await Promise.all([ctxTraer(p.base + '/api/v2/incidents/unresolved.json'), ctxTraer(p.base + '/api/v2/scheduled-maintenances/upcoming.json').catch(() => ({}))]);
      for (const i of (inc.incidents || []).slice(0, 12))
        out.push({ proveedor: p.nombre, tipo: 'Incidente', titulo: String(i.name || '').slice(0, 160), impacto: CTX_IMPACTO[i.impact] || i.impact, estado: CTX_ESTADO[i.status] || i.status,
          desde: ctxHoraArg(i.created_at), afecta: (i.components || []).slice(0, 8).map((c) => c.name).join(', ') || undefined, link: i.shortlink || undefined });
      for (const m of (man.scheduled_maintenances || []).filter((m) => Date.parse(m.scheduled_for) - ahoraMs < 48 * 3600000).slice(0, 12))
        out.push({ proveedor: p.nombre, tipo: 'Mantenimiento programado', titulo: String(m.name || '').slice(0, 160), desde: ctxHoraArg(m.scheduled_for), hasta: ctxHoraArg(m.scheduled_until), link: m.shortlink || undefined });
    } catch (e) { errores.push(p.nombre + ': ' + (e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message)); }
  }));
  return { consultados: ctxProveedores(env).map((p) => p.nombre), novedades: out, errores };
}
async function ctxBajarNoticias(env, ahoraMs) {
  const vistos = new Set(), out = [];
  const sumar = (titulo, medio, fechaIso, link) => {
    const t = String(titulo || '').replace(/\s+/g, ' ').trim(), k = t.toLowerCase().slice(0, 60);
    if (!t || vistos.has(k) || !/^https:\/\//.test(link || '') || out.length >= 8) return;
    if (fechaIso && ahoraMs - Date.parse(fechaIso) > 48 * 3600000) return;
    vistos.add(k); out.push({ titulo: t.slice(0, 160), medio, fecha: fechaIso ? ctxHoraArg(fechaIso) : null, link });
  };
  try {
    const q = (env.CONTEXTO_NOTICIAS_CONSULTA || CONTEXTO_NOTICIAS_FABRICA) + ' when:2d';
    const xml = await ctxTraer('https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=es-419&gl=AR&ceid=AR:es-419', true);
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1], g = (re) => { const x = it.match(re); return x ? ctxEntidades(x[1]) : ''; };
      const medio = g(/<source[^>]*>([\s\S]*?)<\/source>/), fecha = Date.parse(g(/<pubDate>([\s\S]*?)<\/pubDate>/));
      let titulo = g(/<title>([\s\S]*?)<\/title>/);
      if (medio && titulo.endsWith(' - ' + medio)) titulo = titulo.slice(0, -(medio.length + 3));
      sumar(titulo, medio || 'Google Noticias', isNaN(fecha) ? null : new Date(fecha).toISOString(), g(/<link>([\s\S]*?)<\/link>/));
    }
    return { noticias: out, fuente: 'Google Noticias (Argentina)' };
  } catch (e) {
    const j = await ctxTraer('https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(CONTEXTO_NOTICIAS_GDELT) + '&mode=ArtList&format=json&timespan=2d&sort=DateDesc&maxrecords=20', false, 8000);
    for (const a of j.articles || []) {
      const s = String(a.seendate || '');   // 20261113T120000Z
      sumar(a.title, a.domain, s.length >= 13 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + 'T' + s.slice(9, 11) + ':' + s.slice(11, 13) + ':00Z' : null, a.url);
    }
    return { noticias: out, fuente: 'GDELT (Google Noticias no respondió)' };
  }
}
async function ctxFuente(env, filas, fuente, bajar) {
  const ahoraMs = Date.now();
  const f = filas.find((x) => x.fuente === fuente);
  // Si la última vez falló, se vuelve a probar a los 10 minutos (no a la hora)
  const fallo = f && (f.error || /"errores":\["/.test(f.contenido));   // también si algún proveedor no respondió
  if (f && ahoraMs - Date.parse(f.actualizado) < (fallo ? 10 : CONTEXTO_MINUTOS) * 60000) return { ...JSON.parse(f.contenido), actualizado: ctxHoraArg(f.actualizado), error: f.error || undefined };
  if (String(env.CONTEXTO_EXTERNO || '').toLowerCase() === 'apagado') return { apagado: true };
  let contenido, error = null;
  try { contenido = await bajar(env, ahoraMs); }
  catch (e) { error = e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message; contenido = f ? JSON.parse(f.contenido) : {}; }
  const ahoraIso = new Date(ahoraMs).toISOString();
  // Aunque falle se guarda la hora: así no se reintenta en cada pregunta (vuelve a probar en una hora)
  try {
    await env.DB.prepare(`INSERT INTO contexto_externo (fuente, actualizado, contenido, error) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (fuente) DO UPDATE SET actualizado = excluded.actualizado, contenido = excluded.contenido, error = excluded.error`)
      .bind(fuente, ahoraIso, JSON.stringify(contenido).slice(0, 20000), error).run();
  } catch (e) { console.error('Contexto externo, guardar ' + fuente + ': ' + e.message); }
  return { ...contenido, actualizado: ctxHoraArg(ahoraIso), error: error || undefined };
}

// ---------- Qué novedades de proveedores importan (se filtra al leer, así también vale para lo ya guardado) ----------
// Helios corre en Cloudflare Workers y D1: un incidente ahí afecta a la plataforma misma. Lo de otros países no importa.
const CTX_AR_TITULO = /argentin|buenos aires|\bEZE\b/i;
const CTX_ARGENTINA = /argentin|buenos aires|\bEZE\b|latin ?america|\blatam\b|south america|sudam[eé]rica|am[eé]rica latina/i;
const CTX_HELIOS = /\bworkers?\b|\bD1\b|workers ai|\bKV\b|durable objects/i;
const CTX_OTRO_PAIS = /\b(UK|U\.K\.|United Kingdom|England|Ireland|Philippines|Costa Rica|India|Russia|Italy|Singapore|Japan|China|Korea|Taiwan|Hong Kong|Germany|France|Spain|Portugal|Netherlands|Belgium|Switzerland|Austria|Poland|Czech|Romania|Hungary|Greece|Ukraine|Turkey|Sweden|Norway|Denmark|Finland|Mexico|Colombia|Peru|Chile|Brazil|Uruguay|Paraguay|Bolivia|Ecuador|Venezuela|Guatemala|Panama|Dominican|Puerto Rico|Canada|United States|USA|US|Australia|New Zealand|Indonesia|Vietnam|Thailand|Malaysia|Pakistan|Bangladesh|Saudi|UAE|Emirates|Israel|Egypt|Nigeria|Kenya|South Africa|Europe|Asia|APAC|EMEA|North America)\b|^[A-Z]{3} \(/;
function ctxRelevantes(prov) {
  const out = { afectan_a_helios: [], argentina_o_region: [], globales_importantes: [], otros_paises_descartados: 0, menores_sin_lugar_descartados: 0 };
  for (const n of prov.novedades || []) {
    const t = n.titulo + ' ' + (n.afecta || '');
    // Si el título nombra otro país (aunque el componente diga "Latin America"), no es de Argentina
    if (CTX_OTRO_PAIS.test(n.titulo) && !CTX_AR_TITULO.test(n.titulo)) { out.otros_paises_descartados++; continue; }
    if (/^Cloudflare/.test(n.proveedor) && CTX_HELIOS.test(t) && !(CTX_OTRO_PAIS.test(t) && !CTX_ARGENTINA.test(t))) out.afectan_a_helios.push(n);
    else if (CTX_ARGENTINA.test(t)) out.argentina_o_region.push(n);
    else if (CTX_OTRO_PAIS.test(t)) out.otros_paises_descartados++;
    else if (n.tipo === 'Incidente' && (n.impacto === 'importante' || n.impacto === 'grave')) out.globales_importantes.push(n);
    else out.menores_sin_lugar_descartados++;
  }
  return out;
}

// ---------- Calendario (sale de la base: feriados y eventos_comerciales) ----------
function ctxCalendario(hoy, dias, feriados, eventos) {
  const fer = new Map(feriados.map((f) => [f.fecha, f.nombre]));
  const libre = (d) => ctxDow(d) === 0 || ctxDow(d) === 6 || fer.has(d);
  const habilDelMes = (d) => {   // 1 = primer día hábil del mes; 0 si no es hábil
    if (libre(d)) return 0;
    let n = 0; for (let x = d.slice(0, 8) + '01'; x <= d; x = ctxSumar(x, 1)) if (!libre(x)) n++;
    return n;
  };
  const out = [];
  for (let i = 0; i < dias; i++) {
    const d = ctxSumar(hoy, i), notas = [];
    if (fer.has(d)) notas.push('Feriado: ' + fer.get(d) + '. Se espera tráfico como un domingo (o nada, en los servicios que silencian feriados).');
    if (libre(d)) {
      let a = d, b = d; while (libre(ctxSumar(a, -1))) a = ctxSumar(a, -1); while (libre(ctxSumar(b, 1))) b = ctxSumar(b, 1);
      const largo = Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;
      if (largo >= 3) notas.push('Fin de semana largo (' + largo + ' días, del ' + ctxDia(a) + ' al ' + ctxDia(b) + '): menos operación de empresas; el día hábil siguiente suele venir cargado.');
    } else if (libre(ctxSumar(d, -1))) {
      let a = ctxSumar(d, -1), n = 0; while (libre(a)) { n++; a = ctxSumar(a, -1); }
      if (n >= 3) notas.push('Primer día hábil después de un fin de semana largo: suele haber más transferencias y pagos acumulados.');
    }
    const h = habilDelMes(d);
    if (h >= 1 && h <= 4) notas.push(h + '.º día hábil del mes: cobro de sueldos (hasta el 4.º día hábil). Suben transferencias, pagos de servicios y recargas.');
    if (d.slice(5) === '06-30' || d.slice(5) === '12-18') notas.push('Vence el pago del aguinaldo: más movimiento de sueldos y transferencias.');
    for (const e of eventos.filter((e) => e.fecha_desde <= d && e.fecha_hasta >= d))
      notas.push('Evento comercial: ' + e.nombre + (e.cliente_id || e.servicio_id ? ' (' + [e.cliente_id, e.servicio_id].filter(Boolean).join(', ') + ')' : '') + '. ' +
        (e.efecto_esperado === 'MENOS_TRAFICO' ? 'Se espera menos tráfico.' : 'Se espera más tráfico de lo normal.') + (e.nota ? ' ' + e.nota : ''));
    out.push({ fecha: ctxDia(d), dia: CTX_DIAS[ctxDow(d)], cuando: i === 0 ? 'hoy' : i === 1 ? 'mañana' : 'en ' + i + ' días', notas: notas.length ? notas : ['Día común: sin feriados, eventos ni fechas de cobro.'] });
  }
  return out;
}

async function contextoExterno(env, yo, a) {
  const dias = Math.min(7, Math.max(1, Number(a && a.dias) || 3));
  const ah = await asistAhora(env);
  const hoy = new Date(Date.parse(ah.ahora) - 3 * 3600000).toISOString().slice(0, 10);   // fecha de Argentina según el reloj de Helios
  const desde = ctxSumar(hoy.slice(0, 8) + '01', -7) < ctxSumar(hoy, -7) ? ctxSumar(hoy.slice(0, 8) + '01', -7) : ctxSumar(hoy, -7);
  const hasta = ctxSumar(hoy, dias + 7);
  const q = [
    env.DB.prepare('SELECT fecha, nombre FROM feriados WHERE fecha >= ?1 AND fecha <= ?2 ORDER BY fecha').bind(desde, hasta),
    env.DB.prepare('SELECT nombre, fecha_desde, fecha_hasta, cliente_id, servicio_id, efecto_esperado, nota FROM eventos_comerciales WHERE fecha_hasta >= ?1 AND fecha_desde <= ?2 ORDER BY fecha_desde LIMIT 20').bind(hoy, ctxSumar(hoy, dias - 1)),
    env.DB.prepare('SELECT fuente, actualizado, contenido, error FROM contexto_externo'),
  ];
  if (puede(yo, 'tablero')) q.push(env.DB.prepare("SELECT cliente_id, servicio_id, criticidad, silenciar_feriados FROM umbrales_config WHERE criticidad = 'ALTA' OR silenciar_feriados = 1 LIMIT 40"));
  const r = await env.DB.batch(q);
  const [proveedores, noticias] = await Promise.all([
    ctxFuente(env, r[2].results, 'proveedores', ctxBajarProveedores),
    ctxFuente(env, r[2].results, 'noticias', ctxBajarNoticias),
  ]);
  const rel = proveedores.apagado ? null : ctxRelevantes(proveedores);
  const nov = (n) => n.proveedor + ': ' + n.titulo + (n.impacto ? ' (impacto ' + n.impacto + (n.estado ? ', ' + n.estado : '') + ')' : '') + (n.desde ? ', desde ' + n.desde : '') + (n.hasta ? ' hasta ' + n.hasta : '') + (n.link ? ' ' + n.link : '');
  const calendario = ctxCalendario(hoy, dias, r[0].results, r[1].results);
  const puntos = [];
  if (rel && rel.afectan_a_helios.length) puntos.push('HELIOS MISMO (corre en Cloudflare Workers y D1, puede fallar la plataforma): ' + rel.afectan_a_helios.map(nov).join(' | '));
  puntos.push('CALENDARIO: ' + calendario.map((c) => c.cuando + ' (' + c.dia + ' ' + c.fecha + '): ' + c.notas.join(' ')).join(' | '));
  if (!rel) puntos.push('PROVEEDORES: no se consultan (contexto externo apagado).');
  else {
    const reg = rel.argentina_o_region.concat(rel.globales_importantes);
    const desc = rel.otros_paises_descartados + rel.menores_sin_lugar_descartados;
    puntos.push('PROVEEDORES (' + (proveedores.consultados || []).join(', ') + '): ' + (reg.length ? reg.map(nov).join(' | ') : 'sin incidentes ni mantenimientos que afecten a Argentina.') +
      (desc ? ' (' + desc + ' novedades de otros países o menores sin relación: no las menciones).' : '') + (proveedores.errores && proveedores.errores.length ? ' No respondieron: ' + proveedores.errores.join('; ') + '.' : ''));
  }
  const nots = (noticias.noticias || []).slice(0, 5);
  puntos.push('NOTICIAS (últimas 48 h' + (noticias.fuente ? ', ' + noticias.fuente : '') + ', no verificadas por Helios): ' + (noticias.apagado ? 'no se consultan.' : nots.length ? nots.map((n) => n.titulo + ' (' + n.medio + (n.fecha ? ', ' + n.fecha : '') + ') ' + n.link).join(' | ') + ' — mencioná solo las que puedan afectar pagos, transferencias, recargas o el acceso; si ninguna, decí que no hay noticias relevantes.' : noticias.error ? 'no se pudieron consultar (' + noticias.error + ').' : 'no hay noticias relevantes.'));
  const out = {
    puntos_clave: puntos,
    reloj_helios: asistFecha(ah.ahora) + (ah.simulado ? ' (reloj de la demo: el calendario es de esa fecha; proveedores y noticias son de hoy real)' : ''),
    calendario,
    proveedores: rel ? { ...rel, errores: proveedores.errores, actualizado: proveedores.actualizado, error: proveedores.error } : proveedores,
    noticias: { noticias: nots, fuente: noticias.fuente, actualizado: noticias.actualizado, error: noticias.error, apagado: noticias.apagado },
    como_usarlo: 'Respondé solo con puntos_clave, en bloques cortos con estos títulos exactos en negrita: **Helios** (este bloque va únicamente si puntos_clave trae HELIOS MISMO; si no, no lo pongas), **Calendario**, **Proveedores**, **Noticias** y **Qué vigilar** (una o dos líneas). Debajo de cada título, una lista con "- ". Traducí al español los títulos en inglés. No agregues nada que no esté en puntos_clave ni incidentes de otros países. Poné el enlace de cada incidente o noticia como [más info](enlace). Si podés, cruzalo con las alertas o servicios del cliente (por ejemplo, SMS de Twilio = códigos de verificación al entrar a la app).',
  };
  if (r[3]) {
    const fmt = (x) => x.cliente_id === '*' ? 'todos los clientes' : x.cliente_id + (x.servicio_id && x.servicio_id !== '*' ? ' / ' + x.servicio_id : '');
    out.servicios_criticos = r[3].results.filter((x) => x.criticidad === 'ALTA').map(fmt);
    out.silencian_feriados = r[3].results.filter((x) => Number(x.silenciar_feriados) === 1).map(fmt);
  }
  return out;
}

// La herramienta del asistente (todos los perfiles: no muestra datos de clientes salvo a quien ve el tablero)
ASIST_HERRAMIENTAS.contexto_externo = {
  permiso: 'asistente',
  descripcion: 'Lo de afuera que puede afectar la operación hoy y los próximos días: feriados y fines de semana largos, fechas de cobro de sueldos y aguinaldo, eventos comerciales (Black Friday, CyberMonday), incidentes y mantenimientos de proveedores (Cloudflare, Twilio) y noticias de Argentina de las últimas 48 h.',
  parametros: { dias: { type: 'integer', description: 'Cuántos días mirar desde hoy (1 a 7). Por defecto 3' } },
  ejecutar: contextoExterno,
};
ASIST_PALABRAS.unshift([/extern|afuera|noticia|feriado|ma[ñn]ana|pr[oó]xim|semana que viene|fin de semana|proveedor|cloudflare|twilio|paro|huelga|corte|apag[oó]n|evento|hot ?sale|cyber|black friday|cobro|sueldo|aguinaldo|calendario|pueda afectar|puede afectar|afectar/i, 'contexto_externo']);
ASIST_ARGS.contexto_externo = (q) => /semana|7 d[ií]as|pr[oó]ximos d[ií]as/i.test(q) ? { dias: 7 } : /ma[ñn]ana|hoy/i.test(q) ? { dias: 2 } : {};
for (const p of ['SOPORTE', 'ANALISTA', 'GERENTE', 'ADMIN'])
  (ASIST_SUGERENCIAS[p] = ASIST_SUGERENCIAS[p] || []).push({ id: 'contexto', texto: '¿Hay algo de afuera que pueda afectar hoy o mañana?', herramientas: ['contexto_externo'], args: { contexto_externo: { dias: 2 } } });

// ---------- Eventos comerciales (Administración > Umbrales; solo Administrador) ----------
const EFECTOS_EVENTO = ['MAS_TRAFICO', 'MENOS_TRAFICO'];
const ctxFechaOk = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(Date.parse(f + 'T12:00:00Z')) && new Date(f + 'T12:00:00Z').toISOString().slice(0, 10) === f;
async function rutasEventos(env, request, p, url, yo) {
  const m = request.method;
  if (m === 'GET' && p === '/eventos') {
    const r = await env.DB.prepare(`SELECT id, nombre, fecha_desde, fecha_hasta, cliente_id, servicio_id, efecto_esperado, nota FROM eventos_comerciales
      WHERE fecha_hasta >= date('now', '-90 days') ORDER BY fecha_desde LIMIT 100`).all();
    return okJson({ eventos: r.results });
  }
  if (m === 'POST' && p === '/eventos') {
    const b = await leerCuerpo(request);
    const nombre = texto(b.nombre, 100), desde = String(b.fecha_desde || ''), hasta = String(b.fecha_hasta || b.fecha_desde || '');
    const cliente = b.cliente_id ? String(b.cliente_id).trim().toUpperCase().slice(0, 40) : null, servicio = b.servicio_id ? String(b.servicio_id).trim().toUpperCase().slice(0, 40) : null;
    const efecto = EFECTOS_EVENTO.includes(b.efecto_esperado) ? b.efecto_esperado : 'MAS_TRAFICO', nota = texto(b.nota, 200) || null;
    if (nombre.length < 3) return jsonError('Poné el nombre del evento.', 400);
    if (!ctxFechaOk(desde) || !ctxFechaOk(hasta)) return jsonError('Fecha inválida.', 400);
    if (hasta < desde) return jsonError('La fecha "hasta" no puede ser anterior a "desde".', 400);
    if ((Date.parse(hasta) - Date.parse(desde)) / 86400000 > 31) return jsonError('Un evento puede durar como máximo un mes.', 400);
    if ((cliente && !/^[A-Z0-9_]+$/.test(cliente)) || (servicio && !/^[A-Z0-9_]+$/.test(servicio))) return jsonError('Cliente y servicio van como en el tablero (por ejemplo CLI_001 y TRANSFERENCIAS).', 400);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO eventos_comerciales (nombre, fecha_desde, fecha_hasta, cliente_id, servicio_id, efecto_esperado, nota, creado_por) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
        .bind(nombre, desde, hasta, cliente, servicio, efecto, nota, yo.id),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'ALTA_EVENTO', nombre + ' (' + desde + ' a ' + hasta + ')'),
    ]);
    return okJson({});
  }
  if (m === 'POST' && p === '/eventos/borrar') {
    const b = await leerCuerpo(request);
    const id = Number(b.id);
    const ev = Number.isInteger(id) ? await env.DB.prepare('SELECT nombre FROM eventos_comerciales WHERE id = ?1').bind(id).first() : null;
    if (!ev) return jsonError('Ese evento no existe.', 404);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM eventos_comerciales WHERE id = ?1').bind(id),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_EVENTO', ev.nombre),
    ]);
    return okJson({});
  }
  return null;
}
