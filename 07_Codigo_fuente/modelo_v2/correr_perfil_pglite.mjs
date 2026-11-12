// Corre perfil_comportamiento_postgres.sql en PGlite (Postgres dentro de Node, sin instalar PostgreSQL) y deja las
// sentencias INSERT para armar_d1.py. Una sola vez, en una carpeta aparte: npm install @electric-sql/pglite@0.2.17
// Uso: node correr_perfil_pglite.mjs perfil_comportamiento_postgres.sql historico_metricas_demo.csv feriados.csv salida_postgres.sql
// (ejecutarlo desde la carpeta donde se instaló PGlite, pasando las rutas completas)
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const [sqlPath, csvPath, ferPath, outPath] = process.argv.slice(2);
const sql = fs.readFileSync(sqlPath, 'utf8');
const i1 = sql.indexOf('-- ---------- 1.');
const db = new PGlite();
await db.exec(sql.slice(0, i1));
const t0 = Date.now();
await db.query("COPY historico_metricas FROM '/dev/blob' WITH (FORMAT csv, HEADER true)", [], { blob: new Blob([fs.readFileSync(csvPath)]) });
await db.query("COPY feriados FROM '/dev/blob' WITH (FORMAT csv, HEADER true)", [], { blob: new Blob([fs.readFileSync(ferPath)]) });
console.log('cargado', (await db.query('select count(*) n from historico_metricas')).rows[0], (Date.now()-t0)/1000, 's');
const res = await db.exec(sql.slice(i1));
console.log('calculado', (Date.now()-t0)/1000, 's');
const sel = res.filter(r => r.fields.length);
const control = sel[sel.length - 3], perf = sel[sel.length - 2], cal = sel[sel.length - 1];
console.table(control.rows);
fs.writeFileSync(outPath, [...perf.rows, ...cal.rows].map(r => r.sentencia_d1).join('\n') + '\n');
console.log('sentencias', perf.rows.length, cal.rows.length);
