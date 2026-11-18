// Servidor local para grabar la demo en video: el Worker de siempre (w.mjs) sobre una base SQLite, como D1.
// El asistente de IA usa un "modelo con guion" (ia_guion.mjs): redacta con los datos reales de la demo, sin Workers AI.
// Uso: node --no-warnings servidor_demo.mjs <base.sqlite> [puerto]
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import worker from '../07_Codigo_fuente/worker/w.mjs';
import { AI_GUION } from './ia_guion.mjs';

const archivo = process.argv[2];
const puerto = Number(process.argv[3] || 8790);
const db = new DatabaseSync(archivo);
db.exec('PRAGMA foreign_keys = ON');
const preparar = (sql) => {
  let args = [];
  const st = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x instanceof ArrayBuffer ? Buffer.from(x) : x)); return st; },
    async all() { return { results: db.prepare(sql).all(...args), meta: {} }; },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _exec() {
      const s = db.prepare(sql);
      if (/^\s*(select|with)/i.test(sql)) return { results: s.all(...args), meta: {} };
      const r = s.run(...args);
      return { results: [], meta: { changes: Number(r.changes), rows_read: 0, rows_written: Number(r.changes) } };
    },
  };
  return st;
};
const env = {
  AI: AI_GUION,
  CONTEXTO_CALENDARIO: 'demo',   // el calendario sigue el reloj de la demo (26/10/2026); proveedores y noticias salen de la caché de ejemplo (historial.sembrar_contexto)
  TICKETS_JIRA: undefined,        // sin la variable, los tickets son simulados (HEL-101…)
  DB: { prepare: preparar, async batch(sts) { db.exec('BEGIN'); try { const r = sts.map((s) => s._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } },
};

http.createServer(async (req, res) => {
  try {
    const cuerpo = await new Promise((ok) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); });
    const pedido = new Request('http://' + (req.headers.host || 'localhost:' + puerto) + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo, redirect: 'manual' });
    const r = await worker.fetch(pedido, env, { waitUntil: (p) => p.catch((e) => console.error(e)) });
    const cab = {};
    r.headers.forEach((v, k) => { cab[k] = k === 'set-cookie' ? v.replace(/;\s*Secure/i, '') : v; });
    res.writeHead(r.status, cab);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end(String(e && e.stack || e)); }
}).listen(puerto, () => console.log('Helios (demo en video) en http://localhost:' + puerto));
