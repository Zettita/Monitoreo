import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del dashboard gerencial, parte 3 (parche 44): resumen por periodo (dia, semana, mes) con flechas para ir a periodos anteriores.
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body,extra)=>{
  const h=Object.assign({cookie:ck||''},extra&&extra.headers||{});
  if(body!==undefined&&!(extra&&extra.crudo))h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:(extra&&extra.crudo?body:JSON.stringify(body)),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null,h:r.headers};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
let r;
const P=(ck_,q)=>call(ck_,'GET','/api/tablero/periodo'+q);

// ---- Permisos y validaciones ----
for (const [n,c] of [['Gerente',ck.gero],['Analista',ck.ana],['Administrador',A]]) { r=await P(c,'?tipo=mes'); ok(n+' abre el resumen por período', r.s===200 && r.j.ok===true && Array.isArray(r.j.incidentes)); }
r=await P(ck.sol,'?tipo=mes'); ok('Soporte no (403)', r.s===403);
r=await call('','GET','/api/tablero/periodo?tipo=mes'); ok('sin sesión no entra', r.s===401);
r=await P(ck.gero,'?tipo=anio'); ok('tipo inválido: 400', r.s===400);
r=await P(ck.gero,'?tipo=dia&fecha=2026-02-31'); ok('fecha imposible: 400', r.s===400);
r=await P(ck.gero,'?tipo=dia&fecha=hola'); ok('fecha mal escrita: 400', r.s===400);
r=await P(ck.gero,'?tipo=dia&fecha=2024-01-01'); ok('más de 400 días atrás: 400', r.s===400, r.j.error);
r=await P(ck.gero,'?tipo=dia&fecha=2030-01-01'); ok('una fecha futura se lleva a hoy', r.s===200 && r.j.fecha==='2026-10-26' && r.j.es_actual===true, r.j.fecha);

// ---- Límites de cada período (la demo está en el lunes 26/10/2026) ----
r=await P(ck.gero,'?tipo=dia'); const dia=r.j;
ok('día: lunes 26/10/2026, es el actual y todavía no terminó', dia.titulo==='Lunes 26/10/2026' && dia.es_actual && dia.parcial && dia.desde==='2026-10-26' && dia.hasta==='2026-10-26', dia.titulo);
ok('…el anterior es el domingo y no hay siguiente', dia.anterior==='2026-10-25' && dia.siguiente===null, [dia.anterior,dia.siguiente]);
r=await P(ck.gero,'?tipo=semana'); const sem=r.j;
ok('semana: de lunes a domingo', sem.titulo==='Semana del 26/10 al 01/11/2026' && sem.desde==='2026-10-26' && sem.hasta==='2026-11-01' && sem.anterior==='2026-10-19' && sem.siguiente===null, sem.titulo);
r=await P(ck.gero,'?tipo=semana&fecha=2026-10-25'); ok('un domingo pertenece a la semana que empezó el lunes anterior', r.j.desde==='2026-10-19' && r.j.hasta==='2026-10-25' && r.j.siguiente==='2026-10-26', [r.j.desde,r.j.hasta,r.j.siguiente]);
r=await P(ck.gero,'?tipo=mes'); const mes=r.j;
ok('mes: octubre 2026, de punta a punta', mes.titulo==='Octubre 2026' && mes.desde==='2026-10-01' && mes.hasta==='2026-10-31' && mes.anterior==='2026-09-01' && mes.siguiente===null, mes.titulo);
r=await P(ck.gero,'?tipo=mes&fecha=2026-09-15'); ok('septiembre tiene su fin y su siguiente', r.j.titulo==='Septiembre 2026' && r.j.hasta==='2026-09-30' && r.j.siguiente==='2026-10-01' && r.j.es_actual===false && r.j.parcial===false, r.j.titulo);
r=await P(ck.gero,'?tipo=mes&fecha=2026-01-10'); ok('enero: el anterior cruza de año', r.j.anterior==='2025-12-01', r.j.anterior);
r=await P(ck.gero,'?tipo=semana&fecha=2026-01-01'); ok('una semana que cruza de año', r.j.titulo==='Semana del 29/12 al 04/01/2026', r.j.titulo);

// ---- Lo que cuenta cada período ----
const tablero=(await call(ck.gero,'GET','/api/dashboard')).j;
const llaves=(x)=>x.map(i=>[i.tipo_alerta,i.cliente_id,i.servicio_id,i.canal_id,i.inicio,i.fecha_resolucion].join('|')).sort();
ok('el mes trae lo mismo que los incidentes de 30 días del tablero', llaves(mes.incidentes).join()===llaves(tablero.incidentes.filter(i=>i.inicio>='2026-10-01T03:00:00Z')).join() && mes.incidentes.length>3, mes.incidentes.length);
ok('el día y la semana de hoy traen lo mismo que el mes (la demo empezó hoy)', llaves(dia.incidentes).join()===llaves(mes.incidentes).join() && llaves(sem.incidentes).join()===llaves(mes.incidentes).join());
ok('cada incidente trae su alerta y su duración', mes.incidentes.every(i=>/^[0-9a-f]{32}$/.test(i.alerta_id) && i.duracion_minutos>=0));
r=await P(ck.gero,'?tipo=dia&fecha=2026-10-25'); ok('el domingo anterior no tiene nada', r.j.incidentes.length===0 && r.j.es_actual===false && r.j.parcial===false);
r=await P(ck.gero,'?tipo=mes&fecha=2026-09-10'); ok('septiembre tampoco', r.j.incidentes.length===0);

// Se mueve una caída al domingo 18/10 (8 días atrás) y al 30/09: tiene que aparecer en su día, su semana y su mes, y en ningún otro
const filas=db.prepare("select count(*) n from alertas_historico where cliente_id='CLI_006' and tipo_alerta='APROBACION_BAJA'").get().n;
const mover=(dias)=>db.prepare("update alertas_historico set ventana_inicio=strftime('%Y-%m-%dT%H:%M:%SZ',ventana_inicio,?1), ventana_fin=strftime('%Y-%m-%dT%H:%M:%SZ',ventana_fin,?1), fecha_resolucion=CASE WHEN fecha_resolucion IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%SZ',fecha_resolucion,?1) END where cliente_id='CLI_006' and tipo_alerta='APROBACION_BAJA'").run(dias+' days');
const cuenta=async(q)=>(await P(ck.gero,q)).j.incidentes.filter(i=>i.cliente_id==='CLI_006' && i.tipo_alerta==='APROBACION_BAJA').length;
const antes=await cuenta('?tipo=dia');
ok('(antes de moverla) la caída de CLI_006 está en el día de hoy', antes>=1 && filas>=1, [antes,filas]);
mover(-8);
ok('movida al domingo 18/10: está en ese día', await cuenta('?tipo=dia&fecha=2026-10-18')===antes);
ok('…en la semana 12 al 18/10', await cuenta('?tipo=semana&fecha=2026-10-14')===antes);
ok('…en octubre', await cuenta('?tipo=mes')===antes);
ok('…y no en hoy, ni en la semana actual, ni en el sábado', await cuenta('?tipo=dia')===0 && await cuenta('?tipo=semana')===0 && await cuenta('?tipo=dia&fecha=2026-10-17')===0);
mover(-18);   // 30/09
ok('movida al 30/09: está en septiembre y no en octubre', await cuenta('?tipo=mes&fecha=2026-09-30')===antes && await cuenta('?tipo=mes')===0);
ok('…y en su día', await cuenta('?tipo=dia&fecha=2026-09-30')===antes && await cuenta('?tipo=dia&fecha=2026-10-01')===0);

// ---- La página ----
r=await call(ck.gero,'GET','/');
ok('el tablero trae la sección del período y ya no la de fallas suelta', r.s===200 && r.t.includes('id="b-periodo"') && r.t.includes('data-per-tipo') && !r.t.includes('id="b-fallas"') && r.t.includes('/api/tablero/periodo'));
ok('la distribución de fallas no muestra Hoy / 7 / 30 días cuando el período viene de afuera', r.t.includes("d.periodo_fijo ? '' : seg(PERIODOS"));

console.log(fallas ? '\nHAY '+fallas+' FALLAS' : '\nTODO OK');
process.exit(fallas?1:0);
