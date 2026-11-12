// Servidor local para probar el Worker en el navegador, sin Cloudflare.
// Corre w.mjs con Node y una base SQLite como D1 (la misma idea que la Fase 1 de la migración).
// Uso:  node --no-warnings servidor_local.mjs prueba.sqlite [puerto]
//   (prueba.sqlite se arma con mkdb.mjs; el primer ingreso pide crear el administrador)
import http from 'node:http';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './w.mjs';

const archivo = process.argv[2] || 'prueba.sqlite';
const puerto = Number(process.argv[3] || 8787);
const db = new DatabaseSync(archivo);
db.exec('PRAGMA foreign_keys = ON');

// env.DB con la misma forma que D1: prepare().bind().all()/first()/run() y batch() como transacción
const preparar = (sql) => {
  let args = [];
  const st = {
    bind(...a) { args = a.map((x) => (x === undefined ? null : x)); return st; },
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
// Avisos push (parche 26): clave VAPID local de prueba (se genera sola la primera vez en clave_push_local.txt).
// Es solo para esta PC: la de Cloudflare se genera con generar_clave_push.mjs y va como secreto VAPID_JWK.
const archivoClave = new URL('./clave_push_local.txt', import.meta.url);
if (!process.env.VAPID_JWK && !fs.existsSync(archivoClave)) {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', par.privateKey);
  fs.writeFileSync(archivoClave, JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d }) + '\n');
}
const env = {
  VAPID_JWK: process.env.VAPID_JWK || fs.readFileSync(archivoClave, 'utf8').trim(),
  DB: {
    prepare: preparar,
    async batch(sts) { db.exec('BEGIN'); try { const r = sts.map((s) => s._exec()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  },
};

http.createServer(async (req, res) => {
  try {
    const cuerpo = await new Promise((ok) => { const p = []; req.on('data', (c) => p.push(c)); req.on('end', () => ok(Buffer.concat(p))); });
    const pedido = new Request('http://localhost:' + puerto + req.url, {
      method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo, redirect: 'manual',
    });
    const r = await worker.fetch(pedido, env, { waitUntil: (p) => p.catch((e) => console.error(e)) });
    const cab = {};
    r.headers.forEach((v, k) => { cab[k] = k === 'set-cookie' ? v.replace(/;\s*Secure/i, '') : v; });   // en http local la cookie no puede ser Secure
    res.writeHead(r.status, cab);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end(String(e && e.stack || e));
  }
}).listen(puerto, () => console.log('Helios local en http://localhost:' + puerto + ' (base ' + archivo + ')'));
