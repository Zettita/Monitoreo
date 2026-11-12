// =====================================================================
// FERIADOS (tabla feriados)
//
// Se cargan de la API pública api.argentinadatos.com/v1/feriados/{año}
// (fecha, tipo, nombre). El cron revisa una vez por día si faltan el año
// actual o el siguiente y los trae; el Administrador también puede
// actualizarlos a mano o agregar feriados propios (puentes, provinciales).
// Las filas MANUAL nunca las pisa la API.
//
// Uso: en umbrales_config, silenciar_feriados = 1 (general, por cliente o por
// cliente y servicio) hace que en esas fechas (hora de Argentina) no se generen
// alertas, pre-alertas ni reglas personalizadas para ese servicio.
// =====================================================================
const FERIADOS_API = 'https://api.argentinadatos.com/v1/feriados/';
const TIPOS_FERIADO = ['inamovible', 'trasladable', 'puente', 'manual'];

async function sincronizarFeriados(env, anio) {
  const r = await fetch(FERIADOS_API + anio, { headers: { accept: 'application/json' }, cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error('La API de feriados respondió ' + r.status + '.');
  const lista = await r.json();
  if (!Array.isArray(lista)) throw new Error('La API de feriados devolvió un formato inesperado.');
  const validos = lista.filter((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f.fecha || '') && f.fecha.startsWith(String(anio)) && f.nombre);
  if (!validos.length) return { anio, cargados: 0 };
  // Solo pisa las filas que vinieron de la API: los feriados manuales quedan como están
  await env.DB.batch(validos.map((f) => env.DB.prepare(
    `INSERT INTO feriados (fecha, nombre, tipo, origen, actualizado) VALUES (?1, ?2, ?3, 'API', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (fecha) DO UPDATE SET nombre = excluded.nombre, tipo = excluded.tipo, actualizado = excluded.actualizado
     WHERE feriados.origen = 'API'`).bind(f.fecha, String(f.nombre).slice(0, 150), TIPOS_FERIADO.includes(f.tipo) ? f.tipo : String(f.tipo || 'inamovible').slice(0, 30))));
  return { anio, cargados: validos.length };
}

// Desde el cron: trae el año actual y, desde octubre, el siguiente, si todavía no están
async function feriadosAlDia(env) {
  const hoy = new Date(Date.now() - 3 * 3600e3);
  const anios = [hoy.getUTCFullYear()].concat(hoy.getUTCMonth() >= 9 ? [hoy.getUTCFullYear() + 1] : []);
  const out = [];
  for (const a of anios) {
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM feriados WHERE fecha >= ?1 AND fecha < ?2 AND origen = 'API'").bind(a + '-01-01', (a + 1) + '-01-01').first();
    if (c && c.n > 0) continue;
    try { out.push(await sincronizarFeriados(env, a)); } catch (e) { out.push({ anio: a, error: e.message }); }
  }
  return out;
}

async function feriadosListar(env, url) {
  const anio = Number(url.searchParams.get('anio')) || new Date(Date.now() - 3 * 3600e3).getUTCFullYear();
  const r = await env.DB.batch([
    env.DB.prepare('SELECT fecha, nombre, tipo, origen, actualizado FROM feriados WHERE fecha >= ?1 AND fecha < ?2 ORDER BY fecha').bind(anio + '-01-01', (anio + 1) + '-01-01'),
    env.DB.prepare("SELECT DISTINCT substr(fecha, 1, 4) AS anio FROM feriados ORDER BY anio"),
  ]);
  return okJson({ anio, feriados: r[0].results, anios: r[1].results.map((x) => Number(x.anio)) });
}

async function rutasFeriados(env, request, p, url, yo) {
  const m = request.method;
  if (m === 'GET' && p === '/feriados') return await feriadosListar(env, url);
  if (m === 'POST' && p === '/feriados/sincronizar') {
    const b = await leerCuerpo(request);
    const anio = Number(b.anio);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return jsonError('Año inválido.', 400);
    let r;
    try { r = await sincronizarFeriados(env, anio); } catch (e) { return jsonError('No se pudo consultar la API de feriados: ' + e.message, 502); }
    await env.DB.batch([
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'SINCRONIZAR_FERIADOS', anio + ': ' + r.cargados + ' feriados'),
      env.DB.prepare(MARCAR_TABLERO),
    ]);
    return okJson(r);
  }
  if (m === 'POST' && p === '/feriados') {
    const b = await leerCuerpo(request);
    const fecha = String(b.fecha || ''), nombre = texto(b.nombre, 150);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(Date.parse(fecha + 'T12:00:00Z')) || new Date(fecha + 'T12:00:00Z').toISOString().slice(0, 10) !== fecha) return jsonError('Fecha inválida.', 400);
    if (nombre.length < 3) return jsonError('Poné el nombre del feriado.', 400);
    const ya = await env.DB.prepare('SELECT origen FROM feriados WHERE fecha = ?1').bind(fecha).first();
    if (ya) return jsonError('Esa fecha ya es feriado.', 409);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO feriados (fecha, nombre, tipo, origen) VALUES (?1, ?2, 'manual', 'MANUAL')").bind(fecha, nombre),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'ALTA_FERIADO', fecha + ' ' + nombre),
      env.DB.prepare(MARCAR_TABLERO),
    ]);
    return okJson({});
  }
  if (m === 'POST' && p === '/feriados/borrar') {
    const b = await leerCuerpo(request);
    const fecha = String(b.fecha || '');
    const ya = await env.DB.prepare('SELECT origen FROM feriados WHERE fecha = ?1').bind(fecha).first();
    if (!ya || ya.origen !== 'MANUAL') return jsonError('Solo se pueden quitar los feriados agregados a mano.', 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM feriados WHERE fecha = ?1 AND origen = 'MANUAL'").bind(fecha),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_FERIADO', fecha),
      env.DB.prepare(MARCAR_TABLERO),
    ]);
    return okJson({});
  }
  return null;
}
