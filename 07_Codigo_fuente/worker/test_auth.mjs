import { DatabaseSync } from 'node:sqlite';
import worker from './w.mjs';
const file = process.argv[2];
const db = new DatabaseSync(file);
const mk = (sql) => {
  let b = [];
  const st = {
    bind(...a) { b = a.map(x => x === undefined ? null : x); return st; },
    async all() { return { results: db.prepare(sql).all(...b), meta: {} }; },
    async first() { return db.prepare(sql).get(...b) ?? null; },
    async run() { const r = db.prepare(sql).run(...b); return { meta: { changes: Number(r.changes) } }; },
    async raw() { const s = db.prepare(sql); s.setReturnArrays?.(true); return s.all(...b); },
    _exec() { const s = db.prepare(sql); if (/^\s*(select|with)/i.test(sql)) return { results: s.all(...b), meta: {} }; const r = s.run(...b); return { results: [], meta: { changes: Number(r.changes), rows_read: 0, rows_written: Number(r.changes) } }; },
  };
  return st;
};
const D1 = { prepare: mk, async batch(sts) { db.exec('BEGIN'); try { const r = sts.map(s => s._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
const env = { DB: D1 };
let ck = '';
const call = async (m, p, body) => { const r = await worker.fetch(new Request('https://x' + p, { method: m, headers: { cookie: ck, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env, {}); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return r.json(); };
await call('POST', '/api/setup', { usuario: 'admin', nombre: 'Admin', clave: 'ClaveSegura123' });
await call('POST', '/api/login', { usuario: 'admin', clave: 'ClaveSegura123' });
let r = await call('POST', '/api/demo/preparar');
console.log('preparar', r.ok, r.inicio, r.alertas_borradas, r.observadas_borradas, r.error || '');
const prev = new Set();
for (let i = 0; i < 20; i++) {
  r = await call('POST', '/api/demo/siguiente');
  if (!r.ok) { console.log('fin:', r.error); break; }
  const al = db.prepare("select alerta_id, tipo_alerta, cliente_id, canal_id, servicio_id, severidad, estado from alertas_historico").all();
  const nuevas = al.filter(a => !prev.has(a.alerta_id)); nuevas.forEach(a => prev.add(a.alerta_id));
  const ab = al.filter(a => a.estado !== 'RESUELTA').length;
  const pre = (await call('GET', '/api/dashboard')).prealertas;   // pre-alertas del cache del tablero (se recalcula en cada revisión)
  console.log(`E${String(r.escena).padStart(2)} ${r.ventana_inicio.slice(11,16)} abiertas=${ab} nuevas=${nuevas.map(a=>a.tipo_alerta+':'+a.cliente_id+':'+a.canal_id+':'+a.severidad).join(', ')} | pre=${pre.map(p=>p.tipo_prealerta.replace('RIESGO_','')+':'+p.cliente_id+':'+(p.activa?'ACT':'')+':'+p.resultado).sort().join(', ')}`);
}
const est = await call('GET', '/api/demo'); console.log('estado', est.escena, est.siguiente);
