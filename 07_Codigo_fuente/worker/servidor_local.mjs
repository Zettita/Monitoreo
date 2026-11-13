// Servidor local para probar el Worker en el navegador, sin Cloudflare.
// Corre w.mjs con Node y una base SQLite como D1 (la misma idea que la Fase 1 de la migración).
// Uso:  node --no-warnings servidor_local.mjs prueba.sqlite [puerto]
//   Asistente de IA con un modelo simulado: ASISTENTE_LOCAL=simulado node --no-warnings servidor_local.mjs prueba.sqlite
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
// Asistente de IA (parche 28): sin Cloudflare no hay Workers AI. Con ASISTENTE_LOCAL=simulado se usa un modelo de mentira
// que solo muestra qué datos recibió (sirve para ver la pantalla y los permisos, no la calidad de las respuestas).
const AI_SIMULADO = {
  async run(modelo, p) {
    const ult = p.messages[p.messages.length - 1];
    const tools = (p.tools || []).map((t) => t.function.name);
    if (ult.role === 'tool' || /Datos de Helios/.test(ult.content || '')) {
      const datos = ult.role === 'tool' ? ult.name : (ult.content.match(/"([a-z_]+)":\{/g) || []).map((x) => x.slice(1, -3)).join(', ');
      const id = ((ult.content || '').match(/"alerta_id":"([0-9a-f]{32})"/) || [])[1];
      if (id && tools.includes('sugerir_accion') && !p.messages.some((m) => m.role === 'tool' && m.name === 'sugerir_accion'))
        return { choices: [{ message: { content: '**(Modo simulado)** Recibí estos datos: ' + datos + '.\n- Revisá primero las últimas ventanas.\n- Te dejo una propuesta para confirmar.',
          tool_calls: [{ id: 's1', type: 'function', function: { name: 'sugerir_accion', arguments: JSON.stringify({ tipo: 'comentar', alerta_id: id, comentario: 'Revisando con el asistente', motivo: 'Dejar registro de que se está mirando' }) } }] } }] };
      return { choices: [{ message: { content: '**(Modo simulado)** Recibí estos datos: ' + datos + '. Con Workers AI, acá va la respuesta real.' } }] };
    }
    if (tools[0] && tools[0] !== 'sugerir_accion') return { choices: [{ message: { content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: tools.includes('estado_clientes') ? 'estado_clientes' : tools[0], arguments: '{}' } }] } }] };
    return { choices: [{ message: { content: '(Modo simulado) Hola.' } }] };
  },
};
const env = {
  AI: process.env.ASISTENTE_LOCAL === 'simulado' ? AI_SIMULADO : undefined,
  VAPID_JWK: process.env.VAPID_JWK || fs.readFileSync(archivoClave, 'utf8').trim(),
  TEAMS_WEBHOOK: process.env.TEAMS_WEBHOOK || undefined,   // avisos en Teams (parche 30): dirección del flujo de Workflows
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
