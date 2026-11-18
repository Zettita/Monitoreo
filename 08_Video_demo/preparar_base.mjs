// Arma la base de la demo en video: la base de pruebas + personas, equipos y reglas de derivación ficticios.
// Uso: node --no-warnings preparar_base.mjs <salida.sqlite>
// Todo es ficticio (nombres, correos y claves de demostración).
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import worker from '../07_Codigo_fuente/worker/w.mjs';

const salida = process.argv[2];
if (!salida) { console.error('Falta la ruta de salida'); process.exit(1); }
fs.rmSync(salida, { force: true });
execFileSync('node', ['--no-warnings', 'mkdb.mjs', '../pruebas/base.sqlite', salida], { cwd: new URL('../07_Codigo_fuente/worker/', import.meta.url), stdio: 'inherit' });

const db = new DatabaseSync(salida);
db.exec('PRAGMA foreign_keys = ON');
const mk = (sql) => { let b = []; const st = { bind(...a) { b = a.map((x) => (x === undefined ? null : x instanceof ArrayBuffer ? Buffer.from(x) : x)); return st; },
  async all() { return { results: db.prepare(sql).all(...b), meta: {} }; }, async first() { return db.prepare(sql).get(...b) ?? null; },
  async run() { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes) } }; },
  _exec() { const s = db.prepare(sql); if (/^\s*(select|with)/i.test(sql)) return { results: s.all(...b), meta: {} }; const r = s.run(...b); return { results: [], meta: { changes: Number(r.changes) } }; } }; return st; };
const env = { DB: { prepare: mk, async batch(s) { db.exec('BEGIN'); try { const r = s.map((x) => x._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
const call = async (ck, m, p, body) => {
  const h = { cookie: ck || '' }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await worker.fetch(new Request('https://x' + p, { method: m, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' }), env, {});
  const sc = r.headers.get('set-cookie'); const j = (r.headers.get('content-type') || '').includes('json') ? await r.json() : {};
  return { s: r.status, j, ck: sc ? sc.split(';')[0] : null };
};
export const CLAVE = 'Helios2026!';
const PERSONAS = [   // [usuario, nombre, perfil, correo]
  ['mpaz', 'Mariano Paz', 'ADMIN', 'mariano.paz@helios-demo.com.ar'],
  ['lbenitez', 'Laura Benítez', 'ANALISTA', 'laura.benitez@helios-demo.com.ar'],
  ['cvega', 'Carolina Vega', 'SOPORTE', 'carolina.vega@helios-demo.com.ar'],
  ['dramos', 'Diego Ramos', 'SOPORTE', 'diego.ramos@helios-demo.com.ar'],
  ['nfunes', 'Nicolás Funes', 'SOPORTE', 'nicolas.funes@helios-demo.com.ar'],
  ['gtorres', 'Gabriela Torres', 'GERENTE', 'gabriela.torres@helios-demo.com.ar'],
  ['jsosa', 'Julieta Sosa', 'COMUNICADOS', 'julieta.sosa@helios-demo.com.ar'],
  ['mibanez', 'Martín Ibáñez', 'COMUNICADOS', 'martin.ibanez@helios-demo.com.ar'],
];
await call('', 'POST', '/api/setup', { usuario: 'mpaz', nombre: 'Mariano Paz', clave: CLAVE });
db.prepare("UPDATE usuarios SET correo = ?1, debe_cambiar = 0 WHERE usuario = 'mpaz'").run(PERSONAS[0][3]);
const login = async (u, c) => (await call('', 'POST', '/api/login', { usuario: u, clave: c })).ck;
const A = await login('mpaz', CLAVE);
for (const [u, n, p, c] of PERSONAS.slice(1)) {
  const r = await call(A, 'POST', '/api/admin/usuarios', { usuario: u, nombre: n, perfil: p, correo: c });
  if (!r.j.ok) throw new Error('usuario ' + u + ': ' + JSON.stringify(r.j));
  const ck = await login(u, r.j.clave_temporal);
  const q = await call(ck, 'POST', '/api/cambiar-clave', { actual: r.j.clave_temporal, nueva: CLAVE });
  if (!q.j.ok) throw new Error('clave ' + u + ': ' + JSON.stringify(q.j));
}
const id = (u) => db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u).id;
const eq = async (nombre, extra) => { const r = await call(A, 'POST', '/api/admin/equipos', Object.assign({ nombre }, extra)); if (!r.j.ok) throw new Error('equipo ' + nombre + ': ' + JSON.stringify(r.j)); return db.prepare('SELECT id FROM equipos WHERE nombre = ?').get(nombre).id; };
const mesa = await eq('Mesa de ayuda', { responsable_id: id('cvega'), miembros: [{ usuario_id: id('cvega'), rol: 'LIDER' }, { usuario_id: id('dramos'), rol: 'TECNICO' }, { usuario_id: id('nfunes'), rol: 'TECNICO' }] });
await eq('Gerencia y negocio', { miembros: [{ usuario_id: id('gtorres'), rol: 'INFORMADO' }, { usuario_id: id('jsosa'), rol: 'LIDER' }] });
await eq('Atención al cliente', { miembros: [{ usuario_id: id('mibanez'), rol: 'INFORMADO' }] });
// Reglas de derivación automática
for (const regla of [
  { nombre: 'Caídas graves de CLI_006 a la Mesa de ayuda', cliente_id: 'CLI_006', severidad_minima: 'CRITICA', equipo_id: mesa, prioridad: 10 },
]) { const r = await call(A, 'POST', '/api/admin/derivacion', regla); if (!r.j.ok) throw new Error('regla: ' + JSON.stringify(r.j)); }
console.log('Base de la demo lista:', salida, '(clave de todas las personas: ' + CLAVE + ')');
