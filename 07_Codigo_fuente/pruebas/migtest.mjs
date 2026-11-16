import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import nuevo from '../worker/w.mjs';
// Prueba de la etapa 3b (parche 38): reglas_alerta (reemplaza a alerta_reglas y alerta_reglas_personalizadas) y las columnas
// tablero_revision / tablero_calculado (reemplazan a tablero_cache). Se corre la demo en DOS bases con el esquema viejo:
//   - Base 1: todo con el Worker anterior (w_anterior.mjs, el publicado antes del parche 38).
//   - Base 2: la primera parte con el Worker anterior, después se aplican los scripts 16 y 17 y sigue con el Worker nuevo.
// En cada escena las dos tienen que dar lo mismo (alertas, pre-alertas, series, avisos, reglas). Además se prueba la
// migración en sí: que copie todo, conserve los ids PERS_<id>, no se pise al repetirse y que lo viejo se pueda borrar.
// Uso: node migtest.mjs viejo1.sqlite viejo2.sqlite   (armadas con SIN_ETAPA_3B=1 node ../worker/mkdb.mjs base.sqlite x.sqlite)
//      necesita pruebas/w_anterior.mjs (git show HEAD~:01_Worker/worker_alertas_cron.js > w_anterior.mjs, antes del parche 38)
const [arch1, arch2] = [process.argv[2], process.argv[3]];
const viejo = (await import(pathToFileURL(new URL('./w_anterior.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href)).default;
const SQL = (f) => fs.readFileSync(new URL('../worker/' + f, import.meta.url), 'utf8').split('\n').filter((l) => l.trim());

function entorno(arch) {
  const db = new DatabaseSync(arch); db.exec('PRAGMA foreign_keys = ON');
  const mk = (sql) => { let b = []; const st = { bind(...a) { b = a.map((x) => (x === undefined ? null : x instanceof ArrayBuffer ? Buffer.from(x) : x)); return st; }, async all() { return { results: db.prepare(sql).all(...b), meta: {} }; }, async first() { return db.prepare(sql).get(...b) ?? null; }, async run() { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes) } }; }, _exec() { const s = db.prepare(sql); if (/^\s*(select|with)/i.test(sql)) return { results: s.all(...b), meta: {} }; const r = s.run(...b); return { results: [], meta: { changes: Number(r.changes) } }; } }; return st; };
  const env = { DB: { prepare: mk, async batch(s) { db.exec('BEGIN'); try { const r = s.map((x) => x._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
  const E = { db, env, w: viejo };
  E.call = async (ck, m, p, body) => {
    const r = await E.w.fetch(new Request('https://x' + p, { method: m, headers: { 'content-type': 'application/json', cookie: ck || '' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }), env, {});
    const sc = r.headers.get('set-cookie'); const ct = r.headers.get('content-type') || '';
    return { s: r.status, j: ct.includes('json') ? await r.json() : {}, ck: sc ? sc.split(';')[0] : null };
  };
  return E;
}
const A = entorno(arch1), B = entorno(arch2);
let fallas = 0; const ok = (t, c, x) => { console.log((c ? 'OK  ' : 'FALLA ') + t + (x !== undefined ? '  → ' + (typeof x === 'string' ? x : JSON.stringify(x).slice(0, 300)) : '')); if (!c) fallas++; };

async function preparar(E) {
  await E.call('', 'POST', '/api/setup', { usuario: 'uriel', nombre: 'Uriel Solnik', clave: 'ClaveSegura123' });
  E.adm = (await E.call('', 'POST', '/api/login', { usuario: 'uriel', clave: 'ClaveSegura123' })).ck;
  await E.call(E.adm, 'POST', '/api/demo/preparar', {});   // reactiva las del sistema: lo demás va después
  // Tres reglas personalizadas y una del sistema apagada (VOLUMEN_ALTO: sin ella no hay alerta en la escena de la promo)
  const reglas = [
    { nombre: 'Rechazos altos CLI_004', metrica: 'RECHAZO', direccion: 'ALTO', ventanas_seguidas: 2, cliente_id: 'CLI_004', severidad: 'ALTA' },
    { nombre: 'Lentitud general', metrica: 'LATENCIA', direccion: 'ALTO', ventanas_seguidas: 1, severidad: 'CRITICA' },
    { nombre: 'Caída de tráfico CLI_001 app', metrica: 'VOLUMEN', direccion: 'BAJO', ventanas_seguidas: 1, cliente_id: 'CLI_001', canal_id: 'MOBILE', severidad: 'MEDIA' },
  ];
  for (const r of reglas) await E.call(E.adm, 'POST', '/api/admin/reglas', r);
  await E.call(E.adm, 'POST', '/api/admin/reglas/2', { activa: false });   // una personalizada apagada (PERS_2)
  await E.call(E.adm, 'POST', '/api/admin/reglas/base/VOLUMEN_ALTO', { activa: false });
}
await preparar(A); await preparar(B);

const FUERA = new Set(['alerta_id', 'cantidad_detecciones', 'ultima_deteccion']);
const filas = (E, sql) => E.db.prepare(sql).all().map((r) => JSON.stringify(Object.keys(r).filter((k) => !FUERA.has(k)).sort().map((k) => [k, r[k]]))).sort();
const Q = { alertas: 'SELECT * FROM alertas_historico', prealertas: 'SELECT * FROM prealertas_estado', series: 'SELECT * FROM series_estado', avisos: 'SELECT usuario_id, tipo, texto, leido FROM avisos' };
function comparar(sql) { const a = filas(A, sql), b = filas(B, sql); return { igual: a.length === b.length && a.every((x, i) => x === b[i]), n: a.length, soloA: a.filter((x) => !b.includes(x)).slice(0, 2), soloB: b.filter((x) => !a.includes(x)).slice(0, 2) }; }
const sinFechas = (xs) => JSON.stringify((xs || []).map((x) => { const y = Object.assign({}, x); for (const k of ['creada', 'actualizada', 'creada_por_nombre']) delete y[k]; return y; }));

let migrada = false, todoIgual = true, escenasPers = 0;
for (let e = 1; e <= 19; e++) {
  if (e === 7) {
    // ---- Migración de la base 2: scripts 16 y 17, y desde acá el Worker nuevo ----
    const cacheAntes = B.db.prepare('SELECT revision, calculado FROM tablero_cache WHERE id = 1').get();
    const persAntes = B.db.prepare('SELECT * FROM alerta_reglas_personalizadas ORDER BY id').all();
    const sistemaAntes = B.db.prepare('SELECT * FROM alerta_reglas ORDER BY orden').all();
    for (const l of SQL('reglas_cache_d1.sql')) B.db.exec(l);
    const n1 = B.db.prepare('SELECT COUNT(*) n FROM reglas_alerta').get().n;
    for (const l of SQL('reglas_cache_d1.sql').filter((x) => !/^ALTER/.test(x))) B.db.exec(l);   // repetir (menos los ALTER, que dan "duplicate column")
    ok('repetir el script 16 no duplica nada', B.db.prepare('SELECT COUNT(*) n FROM reglas_alerta').get().n === n1, n1);
    const pers = B.db.prepare("SELECT * FROM reglas_alerta WHERE tipo = 'PERSONALIZADA' ORDER BY id").all();
    ok('las 3 personalizadas se copiaron con el mismo id y los mismos datos',
      pers.length === 3 && persAntes.every((p, i) => ['id', 'nombre', 'metrica', 'direccion', 'ventanas_seguidas', 'cliente_id', 'servicio_id', 'canal_id', 'severidad', 'activa', 'creada_por', 'creada'].every((k) => (p[k] ?? null) === (pers[i][k] ?? null))), pers.map((p) => p.id + ':' + p.activa));
    const sis = B.db.prepare("SELECT * FROM reglas_alerta WHERE tipo = 'SISTEMA' ORDER BY orden").all();
    ok('las 12 del sistema se copiaron con su estado (VOLUMEN_ALTO sigue apagada)', sis.length === 12 && sistemaAntes.every((r, i) => sis[i].regla === r.regla && sis[i].activa === r.activa && sis[i].orden === r.orden && sis[i].grupo === r.grupo && sis[i].descripcion === r.descripcion) && sis.find((r) => r.regla === 'VOLUMEN_ALTO').activa === 0);
    const par = B.db.prepare('SELECT tablero_revision r, tablero_calculado c FROM alerta_parametros WHERE id = 1').get();
    ok('el caché del tablero pasó a alerta_parametros con los mismos valores', par.r === cacheAntes.revision && par.c === cacheAntes.calculado, par);
    ok('las ediciones de reglas del sistema por id no pisan a las personalizadas (ids negativos)', sis.every((r) => r.id < 0) && pers.every((r) => r.id > 0));
    for (const l of SQL('limpieza_d1.sql')) B.db.exec(l);
    const quedan = B.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('alerta_reglas', 'alerta_reglas_personalizadas', 'tablero_cache')").all();
    ok('el script 17 borra las 3 tablas viejas', quedan.length === 0, quedan);
    ok('quedan 23 tablas', B.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'").get().n === 23);
    B.w = nuevo; migrada = true;
  }
  // Antes de la migración, la base 1 y la 2 usan el Worker anterior; después, la 1 sigue con el anterior y la 2 con el nuevo
  await A.call(A.adm, 'POST', '/api/demo/siguiente', {}); await B.call(B.adm, 'POST', '/api/demo/siguiente', {});
  const da = await A.call(A.adm, 'GET', '/api/dashboard'), db = await B.call(B.adm, 'GET', '/api/dashboard');
  for (const k of Object.keys(Q)) { const c = comparar(Q[k]); if (!c.igual) { todoIgual = false; ok('escena ' + e + ': ' + k + ' iguales', false, { soloViejo: c.soloA, soloNuevo: c.soloB }); } }
  if (sinFechas(da.j.reglas_personalizadas) !== sinFechas(db.j.reglas_personalizadas)) { todoIgual = false; ok('escena ' + e + ': nombres de reglas personalizadas en el tablero iguales', false); }
  const ra = await A.call(A.adm, 'GET', '/api/admin/reglas'), rb = await B.call(B.adm, 'GET', '/api/admin/reglas');
  if (JSON.stringify(ra.j.base) !== JSON.stringify(rb.j.base) || sinFechas(ra.j.personalizadas) !== sinFechas(rb.j.personalizadas)) { todoIgual = false; ok('escena ' + e + ': pantalla de Reglas de alerta igual', false, { viejo: ra.j.personalizadas && ra.j.personalizadas.length, nuevo: rb.j.personalizadas && rb.j.personalizadas.length }); }
}
ok('las 19 escenas dan lo mismo con el Worker anterior y con el nuevo (migrando a mitad de camino)', todoIgual);
const pers = B.db.prepare("SELECT tipo_alerta, COUNT(*) n FROM alertas_historico WHERE tipo_alerta LIKE 'PERS_%' GROUP BY tipo_alerta").all();
ok('las reglas personalizadas dispararon (antes y después de migrar) y la apagada (PERS_2) no', pers.length >= 1 && !pers.some((p) => p.tipo_alerta === 'PERS_2'), pers);
ok('la regla del sistema apagada (VOLUMEN_ALTO) no disparó', B.db.prepare("SELECT COUNT(*) n FROM alertas_historico WHERE tipo_alerta = 'VOLUMEN_ALTO'").get().n === 0);

// ---- Con el Worker nuevo sobre la base migrada ----
let r = await B.call(B.adm, 'POST', '/api/admin/reglas', { nombre: 'Errores altos nueva', metrica: 'ERROR', direccion: 'ALTO', ventanas_seguidas: 1, severidad: 'ALTA' });
ok('una regla personalizada nueva sigue la numeración (PERS_4)', r.s === 200 && r.j.id === 4, r.j);
r = await B.call(B.adm, 'POST', '/api/admin/reglas/-9', { nombre: 'Intento sobre una del sistema', metrica: 'ERROR', direccion: 'ALTO', ventanas_seguidas: 1, severidad: 'ALTA' });
ok('no se puede editar una regla del sistema por su id (404)', r.s === 404, r.s);
ok('y DATO_TARDIO (id -9) sigue siendo la misma', B.db.prepare('SELECT regla, nombre FROM reglas_alerta WHERE id = -9').get().regla === 'DATO_TARDIO');
r = await B.call(B.adm, 'POST', '/api/admin/reglas/base/DATO_TARDIO', { activa: false });
ok('apagar una del sistema', r.s === 200 && B.db.prepare("SELECT activa FROM reglas_alerta WHERE regla = 'DATO_TARDIO'").get().activa === 0);
r = await B.call(B.adm, 'POST', '/api/admin/reglas/base/PERS_1', { activa: false });
ok('apagar "base" con el nombre de una personalizada: no existe (404)', r.s === 404, r.s);
r = await B.call(B.adm, 'POST', '/api/demo/preparar', {});
ok('Preparar demo reactiva solo las del sistema, no las personalizadas', B.db.prepare("SELECT activa FROM reglas_alerta WHERE regla = 'DATO_TARDIO'").get().activa === 1 && B.db.prepare('SELECT activa FROM reglas_alerta WHERE id = 2').get().activa === 0 && B.db.prepare("SELECT activa FROM reglas_alerta WHERE regla = 'VOLUMEN_ALTO'").get().activa === 1);
// Ambas escenas con reglas del sistema activas y una personalizada nueva activa: el motor no confunde unas con otras
const rev = await B.call(B.adm, 'POST', '/api/demo/siguiente', {});
ok('la primera escena después de Preparar demo anda (revisión completa) con el esquema nuevo', rev.s === 200 && rev.j.ok, rev.j.error || rev.j.escena);
// Sin tablas viejas, el tablero, el asistente y los avisos siguen respondiendo
const dash = await B.call(B.adm, 'GET', '/api/dashboard');
ok('el tablero responde sin las tablas viejas', dash.s === 200 && Array.isArray(dash.j.reglas_personalizadas) && dash.j.reglas_personalizadas.length === 4, dash.j.reglas_personalizadas && dash.j.reglas_personalizadas.map((x) => x.id));

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
