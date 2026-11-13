import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import worker from '../worker/w.mjs';
import { motor, referencia } from './motor.mjs';
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined}),env,{});const sc=r.headers.get('set-cookie');return {j:await r.json().catch(()=>null),ck:sc?sc.split(';')[0]:null};};
// Referencia: el cálculo directo (consultas del Worker original con v_incidentes temporal, y las pre-alertas del motor)
const OLD = referencia(db), M = motor(db);
const norm = rows => JSON.stringify(rows.map(r => JSON.stringify(r)).sort());
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel',clave:'ClaveSegura123'});
const A=(await call('','POST','/api/login',{usuario:'uriel',clave:'ClaveSegura123'})).ck;
let fallas = 0, recalc = 0, cargas = 0;
await call(A,'POST','/api/demo/preparar');
for (let e = 0; e <= 19; e++) {
  if (e > 0) await call(A,'POST','/api/demo/siguiente');
  for (let k = 0; k < 2; k++) {   // dos cargas seguidas: la segunda tiene que usar el cache
    const d = (await call(A,'GET','/api/dashboard')).j; cargas++; if (d.cache_recalculado) recalc++;
    if (k === 1 && d.cache_recalculado) { console.log('FALLA: recalculó dos veces en la escena', e); fallas++; }
    const okS = norm(d.series) === norm(db.prepare(OLD.series).all());
    const COLS = ['tipo_prealerta','tipo_previsto','severidad','ambiente','cliente_id','servicio_id','producto_id','canal_id','moneda_id','metrica','inicio','ultima_ventana','ventanas','valor_observado','valor_esperado','umbral','margen_consumido','margen_consumido_max','minutos_estimados','activa','resultado','minutos_anticipacion'];
    const solo = (x) => Object.fromEntries(COLS.map((c) => [c, x[c]]));
    const okP = norm(d.prealertas.map(solo)) === norm(M.prealertas().map(solo));
    // alerta_id (parche 33) es solo el enlace al detalle: tiene que ser una ventana del mismo problema; el resto, igual que antes
    const sinId = (xs) => xs.map((x) => { const y = Object.assign({}, x); delete y.alerta_id; return y; });
    const idsOk = d.incidentes.every((i) => { const h = db.prepare('select tipo_alerta, cliente_id, servicio_id, canal_id from alertas_historico where alerta_id = ?').get(i.alerta_id); return h && h.tipo_alerta === i.tipo_alerta && h.cliente_id === i.cliente_id && h.servicio_id === i.servicio_id && h.canal_id === i.canal_id; });
    const okI = idsOk && norm(sinId(d.incidentes)) === norm(db.prepare(OLD.inc).all());
    const kp = db.prepare(OLD.kpis).get();
    const res7 = d.incidentes.filter(i => i.estado_incidente==='RESUELTO' && Date.parse(i.inicio) >= Date.parse(d.parametros.ahora) - 7*864e5);
    const mttr = res7.length ? Math.round(10*res7.reduce((t,i)=>t+i.duracion_minutos,0)/res7.length)/10 : null;
    const okK = mttr === kp.mttr_minutos_7d;
    if (!(okS && okP && okI && okK)) { fallas++; console.log('FALLA escena', e, {okS, okP, okI, okK, mttr, k: kp.mttr_minutos_7d}); }
  }
}
console.log('escenas 0-19 comparadas,', cargas, 'cargas,', recalc, 'recálculos');
// Incidentes que cruzan el corte de 30 días: mover el reloj 30 días después de cada alerta
const tiempos = db.prepare("select distinct ventana_inicio v from alertas_historico order by 1").all().map(r=>r.v);
let n = 0;
for (const t of tiempos) for (const off of [-1, 0, 1]) {
  const ahora = new Date(Date.parse(t) + 30*864e5 + off*60e3).toISOString().replace('.000','');
  db.prepare('update alerta_parametros set ahora=? where id=1').run(ahora);
  const nuevo = (await call(A,'GET','/api/dashboard')).j.incidentes;
  const sinIdC = nuevo.map((x) => { const y = Object.assign({}, x); delete y.alerta_id; return y; });   // alerta_id: enlace al detalle (parche 33)
  if (norm(sinIdC) !== norm(db.prepare(OLD.inc).all()) || nuevo.some((x) => !x.alerta_id)) { fallas++; console.log('FALLA incidentes con ahora', ahora); }
  n++;
}
console.log('corte de 30 días probado en', n, 'momentos');
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO IGUAL');
