import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
import { motor } from './motor.mjs';
const db = new DatabaseSync(process.argv[2]);
const M = motor(db);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0;
const ok=(t,cond,extra)=>{console.log((cond?'OK  ':'FALLA ')+t+(extra!==undefined?'  → '+(typeof extra==='string'?extra:JSON.stringify(extra).slice(0,160)):'')); if(!cond) fallas++;};
const login=async(u,c)=>(await call('', 'POST','/api/login',{usuario:u,clave:c})).ck;
await call('', 'POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
let r=await call(A,'POST','/api/admin/usuarios',{usuario:'analista',nombre:'Ana Lista',perfil:'ANALISTA'});
let an=await login('analista',r.j.clave_temporal); await call(an,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'NuevaAnalista123'}); an=await login('analista','NuevaAnalista123');
r=await call(an,'GET','/api/admin/feriados'); ok('analista sin feriados (403)', r.s===403);
r=await call(A,'GET','/api/admin/feriados?anio=2026'); ok('lista 2026', r.s===200 && r.j.feriados.length===19 && r.j.anios.includes(2025), {n:r.j.feriados.length, anios:r.j.anios});
// Sincronizar con la API (simulada)
const fetchOrig = globalThis.fetch;
globalThis.fetch = async (u) => { ok('llama a la API correcta', String(u)==='https://api.argentinadatos.com/v1/feriados/2027', String(u)); return new Response(JSON.stringify([{fecha:'2027-01-01',tipo:'inamovible',nombre:'Año nuevo'},{fecha:'2027-03-24',tipo:'inamovible',nombre:'Memoria'},{fecha:'2026-12-25',tipo:'inamovible',nombre:'de otro año'}]), {headers:{'content-type':'application/json'}}); };
r=await call(A,'POST','/api/admin/feriados/sincronizar',{anio:2027}); ok('sincroniza 2027 (descarta fechas de otro año)', r.s===200 && r.j.cargados===2, r.j);
globalThis.fetch = async () => new Response('boom', {status:500});
r=await call(A,'POST','/api/admin/feriados/sincronizar',{anio:2028}); ok('API caída = 502 con mensaje', r.s===502, r.j.error);
globalThis.fetch = fetchOrig;
// Manuales
r=await call(A,'POST','/api/admin/feriados',{fecha:'2026-02-30',nombre:'Malo'}); ok('fecha inválida = 400', r.s===400);
r=await call(A,'POST','/api/admin/feriados',{fecha:'2026-12-25',nombre:'Repetido'}); ok('fecha ya feriado = 409', r.s===409);
r=await call(A,'POST','/api/admin/feriados/borrar',{fecha:'2026-12-25'}); ok('no se quita uno de la API', r.s===400);
// Demo completa y silencio en un día con alertas
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<19;i++) await call(A,'POST','/api/demo/siguiente');
const fin = db.prepare('select ahora from alerta_parametros').get().ahora;
const foto = () => { const out=[]; for (let t=Date.parse(fin)-8*3600e3; t<=Date.parse(fin); t+=15*60e3) { db.prepare('update alerta_parametros set ahora=?').run(new Date(t).toISOString().slice(0,19)+'Z'); for (const x of M.alertas()) out.push(t+'|'+[x.tipo_alerta, x.cliente_id, x.servicio_id, x.canal_id, x.ventana_inicio, x.severidad].join('|')); } db.prepare('update alerta_parametros set ahora=?').run(fin); return out.sort(); };
const base = foto();
const cli = 'CLI_006';
ok('hay alertas de '+cli+' el 26/10', base.some(x=>x.includes('|'+cli+'|')));
r=await call(A,'POST','/api/admin/feriados',{fecha:'2026-10-26',nombre:'Feriado de prueba'}); ok('agrega feriado manual', r.s===200);
// Modelo v2: un feriado se compara contra el perfil del domingo (el lunes de la demo tiene más tráfico que un domingo)
const feri = foto();
ok('feriado sin silenciar: se compara como domingo (aparece más tráfico del esperado)', feri.join()!==base.join() && feri.some(x=>x.includes('VOLUMEN_ALTO|')), feri.filter(x=>x.includes('VOLUMEN_ALTO|')).length+' ventanas con VOLUMEN_ALTO');
let ahora;
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli, silenciar_feriados:1}); ok('silenciar '+cli, r.s===200, r.j);
ahora = foto();
ok(cli+' sin alertas ese día', !ahora.some(x=>x.includes('|'+cli+'|')));
ok('los demás clientes igual', ahora.join()===feri.filter(x=>!x.includes('|'+cli+'|')).join());
const pre = M.prealertas().filter(x=>x.cliente_id===cli).length;
ok('sin pre-alertas de '+cli, pre===0);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli, servicio_id:'PAGO_SERVICIOS', silenciar_feriados:0}); ok('excepción de servicio: alertar igual', r.s===200);
ahora = foto();
ok('el servicio con excepción vuelve a alertar', ahora.filter(x=>x.includes('|'+cli+'|PAGO_SERVICIOS|')).join()===feri.filter(x=>x.includes('|'+cli+'|PAGO_SERVICIOS|')).join());
// Reglas personalizadas también se silencian
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:cli, servicio_id:'PAGO_SERVICIOS'});
r=await call(A,'POST','/api/admin/reglas',{nombre:'Errores prueba',metrica:'ERROR',direccion:'ALTO',ventanas_seguidas:1,severidad:'ALTA',cliente_id:cli});
db.prepare("delete from alertas_historico where cliente_id=?").run(cli);
await call(A,'POST','/api/procesar');
ok('regla personalizada silenciada', db.prepare("select count(*) n from alertas_historico where tipo_alerta like 'PERS_%' and cliente_id=?").get(cli).n===0);
ok('ninguna alerta de '+cli+' registrada', db.prepare("select count(*) n from alertas_historico where cliente_id=?").get(cli).n===0);
// Tablero
r=await call(A,'GET','/api/dashboard'); ok('tablero sabe que hoy es feriado', r.j.feriado_hoy && r.j.feriado_hoy.nombre==='Feriado de prueba', r.j.feriado_hoy);
r=await call(A,'POST','/api/admin/feriados/borrar',{fecha:'2026-10-26'}); ok('quita el manual', r.s===200);
r=await call(A,'GET','/api/dashboard'); ok('ya no es feriado', r.j.feriado_hoy===null);
const aud = db.prepare("select accion from auditoria where accion like '%FERIADO%'").all().map(x=>x.accion);
ok('auditoría', aud.includes('SINCRONIZAR_FERIADOS') && aud.includes('ALTA_FERIADO') && aud.includes('BORRAR_FERIADO'), aud);
// Cron: trae el año que falta (reloj real noviembre 2026 -> 2026 ya está, 2027 ya está)
let llamadas=0; globalThis.fetch = async () => { llamadas++; return new Response('[]'); };
await worker.scheduled({}, env, {});
ok('cron no vuelve a pedir años que ya están', llamadas===0, llamadas);
db.prepare("delete from feriados where fecha like '2027%'").run();
await worker.scheduled({}, env, {});
ok('cron pide el año que falta', llamadas===1, llamadas);
globalThis.fetch = fetchOrig;
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
