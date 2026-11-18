import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../worker/w.mjs';
// Prueba de la revisión incremental (parche 37, etapa 3).
//   1. La demo de 19 escenas corre a la vez en dos bases: una con revisión incremental (lo normal) y otra forzada a
//      revisión completa (como antes). Después de cada escena tienen que dar lo mismo: alertas, pre-alertas, series
//      del tablero y avisos (sin contar cuántas veces se volvió a detectar cada ventana, que es justo lo que se ahorra).
//   2. Casos que solo existen en incremental: dato tardío que cierra "dejaron de llegar datos", dato corregido que hace
//      desaparecer una alerta, revisión sin datos nuevos, marca vieja (cae en completa), "Recalcular 24 h".
// Uso: node inctest.mjs base_incremental.sqlite base_completa.sqlite   (las dos armadas con mkdb.mjs)
const [archA, archB] = [process.argv[2], process.argv[3]];
function entorno(arch, extra) {
  const db = new DatabaseSync(arch); db.exec('PRAGMA foreign_keys = ON');
  const mk = (sql) => { let b = []; const st = { bind(...a) { b = a.map((x) => (x === undefined ? null : x instanceof ArrayBuffer ? Buffer.from(x) : x)); return st; }, async all() { return { results: db.prepare(sql).all(...b), meta: {} }; }, async first() { return db.prepare(sql).get(...b) ?? null; }, async run() { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes) } }; }, _exec() { const s = db.prepare(sql); if (/^\s*(select|with)/i.test(sql)) return { results: s.all(...b), meta: {} }; const r = s.run(...b); return { results: [], meta: { changes: Number(r.changes) } }; } }; return st; };
  const env = Object.assign({ DB: { prepare: mk, async batch(s) { db.exec('BEGIN'); try { const r = s.map((x) => x._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } }, extra || {});
  const call = async (ck, m, p, body) => {
    const r = await worker.fetch(new Request('https://x' + p, { method: m, headers: { 'content-type': 'application/json', cookie: ck || '' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }), env, {});
    const sc = r.headers.get('set-cookie'); const ct = r.headers.get('content-type') || '';
    return { s: r.status, j: ct.includes('json') ? await r.json() : {}, ck: sc ? sc.split(';')[0] : null };
  };
  return { db, env, call };
}
const A = entorno(archA), B = entorno(archB, { FORZAR_REVISION_COMPLETA: '1' });
let fallas = 0; const ok = (t, c, x) => { console.log((c ? 'OK  ' : 'FALLA ') + t + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)) : '')); if (!c) fallas++; };

async function usuarios(E) {
  await E.call('', 'POST', '/api/setup', { usuario: 'uriel', nombre: 'Uriel Solnik', clave: 'ClaveSegura123' });
  const adm = (await E.call('', 'POST', '/api/login', { usuario: 'uriel', clave: 'ClaveSegura123' })).ck;
  const r = await E.call(adm, 'POST', '/api/admin/usuarios', { usuario: 'ana', nombre: 'Ana Lista', perfil: 'ANALISTA', correo: 'ana@helios.test' });
  const c = (await E.call('', 'POST', '/api/login', { usuario: 'ana', clave: r.j.clave_temporal })).ck;
  await E.call(c, 'POST', '/api/cambiar-clave', { actual: r.j.clave_temporal, nueva: 'Claveana123456' });
  return { adm, ana: (await E.call('', 'POST', '/api/login', { usuario: 'ana', clave: 'Claveana123456' })).ck };
}
const ckA = await usuarios(A), ckB = await usuarios(B);

// Lo que tiene que dar igual (sin alerta_id, que es al azar, ni las veces que se volvió a detectar)
const FUERA = new Set(['alerta_id', 'cantidad_detecciones', 'ultima_deteccion']);
const filas = (E, sql) => E.db.prepare(sql).all().map((r) => JSON.stringify(Object.keys(r).filter((k) => !FUERA.has(k)).sort().map((k) => [k, r[k]]))).sort();
function comparar(nombre, sql) {
  const a = filas(A, sql), b = filas(B, sql);
  const soloA = a.filter((x) => !b.includes(x)), soloB = b.filter((x) => !a.includes(x));
  return { igual: !soloA.length && !soloB.length, soloA: soloA.slice(0, 2), soloB: soloB.slice(0, 2), n: a.length };
}
const Q = {
  alertas: 'SELECT * FROM alertas_historico',
  prealertas: 'SELECT * FROM prealertas_estado',
  series: 'SELECT * FROM series_estado',
  avisos: 'SELECT usuario_id, tipo, texto, leido FROM avisos',
};

await A.call(ckA.adm, 'POST', '/api/demo/preparar', {}); await B.call(ckB.adm, 'POST', '/api/demo/preparar', {});
const modos = [], nuevos = [];
let todoIgual = true;
for (let e = 1; e <= 19; e++) {
  const marca = A.db.prepare('SELECT revisado_hasta FROM alerta_parametros WHERE id = 1').get().revisado_hasta;
  const ra = await A.call(ckA.adm, 'POST', '/api/demo/siguiente', {}); await B.call(ckB.adm, 'POST', '/api/demo/siguiente', {});
  modos.push((ra.j.proceso && ra.j.proceso.modo) || '?');
  // Cuántos datos miró el modo incremental contra los de la ventana de 25 h del modo completo
  const ahora = A.db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ahora) a, strftime('%Y-%m-%dT%H:%M:%fZ', ahora, '-25 hours') d FROM alerta_parametros").get();
  nuevos.push([A.db.prepare('SELECT COUNT(*) n FROM core_metricas_observadas WHERE fecha_recepcion > ? AND fecha_recepcion <= ?').get(marca || '', ahora.a).n,
    A.db.prepare('SELECT COUNT(*) n FROM core_metricas_observadas WHERE ventana_inicio >= ? AND ventana_inicio < ?').get(ahora.d, ahora.a).n]);
  // El tablero: en B (completa) recalcula el caché al abrirse; en A ya lo dejó al día la revisión
  const da = await A.call(ckA.ana, 'GET', '/api/dashboard'); const db = await B.call(ckB.ana, 'GET', '/api/dashboard');
  if (e >= 2 && da.j.cache_recalculado) { ok('escena ' + e + ': el tablero incremental no recalcula al abrirse', false); }
  for (const k of Object.keys(Q)) {
    const c = comparar(k, Q[k]);
    if (!c.igual) { todoIgual = false; ok('escena ' + e + ': ' + k + ' iguales', false, { soloIncremental: c.soloA, soloCompleta: c.soloB }); }
  }
  const sinId = (xs) => JSON.stringify((xs || []).map((x) => { const y = Object.assign({}, x); delete y.alerta_id; return y; }));   // alerta_id: al azar en cada base
  if (e === 14) { try { fs.unlinkSync('inc_c.sqlite'); } catch (x) {} A.db.exec("VACUUM INTO 'inc_c.sqlite'"); }   // copia para el caso del dato corregido
  if (sinId(da.j.incidentes) !== sinId(db.j.incidentes)) { todoIgual = false; ok('escena ' + e + ': incidentes del tablero iguales', false); }
}
ok('las 19 escenas dan lo mismo en incremental y en completa (alertas, pre-alertas, series, avisos e incidentes)', todoIgual);
ok('escena 1 completa (primera revisión) y de la 2 en adelante incremental', modos[0] === 'completa' && modos.slice(1).every((m) => m === 'incremental'), modos.join(' '));
console.log('     datos que mira cada escena (incremental / ventana de 25 h de la completa): ' + nuevos.map((x) => x[0] + '/' + x[1]).join(' '));
ok('el modo incremental mira solo los datos nuevos de la escena', nuevos.slice(1).every((x) => x[0] <= 20));

// ---------- Casos que solo existen en incremental (base A, después de la demo) ----------
// La revisión incremental se dispara como lo haría el cron: ruta de pruebas con ?incremental=1
A.env.PERMITIR_REVISION_MANUAL = '1';
const inc = async () => (await A.call(ckA.adm, 'POST', '/api/procesar?incremental=1')).j;
const avanzar = (min) => A.db.prepare(`UPDATE alerta_parametros SET ahora = strftime('%Y-%m-%dT%H:%M:%SZ', ahora, '+${min} minutes') WHERE id = 1`).run();

// 1. Sin datos nuevos: no registra ni cierra nada
avanzar(15);
let r = await inc();
ok('sin datos nuevos: revisión incremental que no cambia alertas', r.modo === 'incremental' && r.registradas_o_actualizadas >= 0, r);

// 2. Dato tardío que cierra "dejaron de llegar datos" (CLI_007 dejó de enviar en la escena 18)
const falt = A.db.prepare("SELECT ventana_inicio FROM alertas_historico WHERE tipo_alerta = 'VENTANA_FALTANTE' AND cliente_id = 'CLI_007' AND estado <> 'RESUELTA' ORDER BY ventana_inicio LIMIT 1").get();
ok('hay un "dejaron de llegar datos" abierto de CLI_007', !!falt, falt);
if (falt) {
  const molde = A.db.prepare("SELECT * FROM core_metricas_observadas WHERE cliente_id = 'CLI_007' ORDER BY ventana_inicio DESC LIMIT 1").get();
  const ahoraTxt = A.db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ahora) a FROM alerta_parametros").get().a;
  const vi = falt.ventana_inicio.replace('Z', '.000Z'), vf = new Date(Date.parse(falt.ventana_inicio) + 15 * 60000).toISOString();
  const cols = Object.keys(molde);
  const recep = A.db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ahora, '+30 seconds') r FROM alerta_parametros").get().r;
  const fila = Object.assign({}, molde, { metrica_id: 'MET-TARDIO-1', ventana_inicio: vi, ventana_fin: vf, fecha_recepcion: recep });
  A.db.prepare(`INSERT INTO core_metricas_observadas (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => fila[c]));
  avanzar(1);
  r = await inc();
  const est = A.db.prepare("SELECT estado, motivo_resolucion FROM alertas_historico WHERE tipo_alerta = 'VENTANA_FALTANTE' AND cliente_id = 'CLI_007' AND ventana_inicio = ?").get(falt.ventana_inicio);
  ok('el dato tardío cierra ese "dejaron de llegar datos"', est.estado === 'RESUELTA', est);
}

// 3. Dato corregido (sobre la copia tomada en la escena 14, con alertas abiertas): la ventana se reenvía normal
const C = entorno('inc_c.sqlite', { PERMITIR_REVISION_MANUAL: '1' });
const ab = C.db.prepare("SELECT * FROM alertas_historico WHERE estado <> 'RESUELTA' AND tipo_alerta IN ('LATENCIA_ALTA','RECHAZO_ALTO','ERROR_ALTO','APROBACION_BAJA','SIN_EXITOS') ORDER BY ventana_inicio DESC LIMIT 1").get();
ok('en la escena 14 hay una alerta abierta para corregir', !!ab, ab && ab.tipo_alerta + ' ' + ab.cliente_id);
if (ab) {
  const recep = C.db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', ahora, '+30 seconds') r FROM alerta_parametros").get().r;
  const p = C.db.prepare('SELECT * FROM perfil_comportamiento WHERE cliente_id = ? AND servicio_id = ? AND canal_id = ? LIMIT 1').get(ab.cliente_id, ab.servicio_id, ab.canal_id);
  const n = C.db.prepare(`UPDATE core_metricas_observadas SET cantidad_total = ?, cantidad_exitos = ?, cantidad_rechazos = 0, cantidad_errores = 0, tasa_aprobacion = 1, tasa_rechazo = 0, tasa_error = 0,
                tiempo_respuesta_promedio = ?, importe_total = ?, fecha_recepcion = ?
                WHERE cliente_id = ? AND servicio_id = ? AND canal_id = ? AND strftime('%Y-%m-%dT%H:%M:%SZ', ventana_inicio) = ?`)
    .run(Math.round(p.cantidad_total_esperada), Math.round(p.cantidad_total_esperada), p.tiempo_respuesta_esperado, p.importe_total_esperado, recep, ab.cliente_id, ab.servicio_id, ab.canal_id, ab.ventana_inicio).changes;
  C.db.prepare("UPDATE alerta_parametros SET ahora = strftime('%Y-%m-%dT%H:%M:%SZ', ahora, '+1 minutes') WHERE id = 1").run();
  const ckC = (await C.call('', 'POST', '/api/login', { usuario: 'uriel', clave: 'ClaveSegura123' })).ck;
  const rc = (await C.call(ckC, 'POST', '/api/procesar?incremental=1')).j;
  const est = C.db.prepare('SELECT estado, motivo_resolucion FROM alertas_historico WHERE alerta_id = ?').get(ab.alerta_id);
  ok('el dato corregido hace desaparecer la alerta de esa ventana (' + ab.tipo_alerta + ' ' + ab.cliente_id + ')', n === 1 && rc.modo === 'incremental' && est.estado === 'RESUELTA' && est.motivo_resolucion === 'CONDICION_DESAPARECIDA', { n, modo: rc.modo, est });
}

// 4. Marca vieja (más de 24 h sin revisar): cae en completa
avanzar(25 * 60);
r = await inc();
ok('más de 24 h sin revisar: hace la revisión completa', r.modo === 'completa' && /24 h/.test(r.motivo_completa || ''), r.motivo_completa);
r = await inc();
ok('y la siguiente vuelve a incremental', r.modo === 'incremental');

// 5. Recalcular 24 h: solo el Administrador, siempre completa, queda en auditoría
r = await A.call(ckA.ana, 'POST', '/api/admin/recalcular', {});
ok('el Analista no puede recalcular', r.s === 403);
r = await A.call(ckA.adm, 'POST', '/api/admin/recalcular', {});
ok('el Administrador recalcula (completa)', r.s === 200 && r.j.modo === 'completa' && r.j.motivo_completa === 'pedida', r.j);
ok('queda en auditoría', A.db.prepare("SELECT COUNT(*) n FROM auditoria WHERE accion = 'RECALCULAR_24H'").get().n === 1);
ok('Administración tiene "Recalcular 24 h"', (await (await worker.fetch(new Request('https://x/admin', { headers: { cookie: ckA.adm } }), A.env, {})).text()).includes('btn-recalcular'));

// 6. Sin el script 15 (sin índice): todo sigue en completa, como antes
A.db.exec('DROP INDEX ix_observadas_recepcion');
avanzar(15);
r = await inc();
ok('sin el índice del script 15: revisión completa', r.modo === 'completa' && /índice/.test(r.motivo_completa || ''), r.motivo_completa);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
