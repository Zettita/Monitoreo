import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,160)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Lider','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',responsable_id:id('carla'),miembros:[id('sol'),id('carla')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
const MESA=db.prepare("select id from equipos where nombre='Mesa'").get().id;
await call(A,'POST','/api/demo/preparar');
const sig=async(n)=>{for(let i=0;i<n;i++) await call(A,'POST','/api/demo/siguiente');};
const grupo=(tipo,cli)=>db.prepare("select alerta_id, estado, asignado_usuario_id u, asignado_equipo_id e, reconocida_por, substr(ventana_inicio,12,5) v, motivo_resolucion m from alertas_historico where tipo_alerta=? and cliente_id=? order by ventana_inicio").all(tipo,cli);
const pend=async(u)=>(await call(ck[u],'GET','/api/mis-alertas')).j.mis_pendientes;   // Soporte no entra al tablero
await sig(7);  // E7: RECHAZO_ALTO CLI_004
let g=grupo('RECHAZO_ALTO','CLI_004'); const AL=g[0].alerta_id; ok('E7 hay rechazo abierto en CLI_004', g.length===1 && g[0].estado==='ABIERTA', g);
let r;
r=await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{}); ok('soporte no toma lo no asignado', r.s===403, r.j.error);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{comentario:'listo'}); ok('soporte no resuelve lo no asignado', r.s===403, r.j.error);
r=await call(ck.gero,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA}); ok('gerente no deriva', r.s===403, r.j.error);
r=await call(ck.gero,'GET','/api/mis-alertas'); ok('gerente sin Mis alertas', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{}); ok('derivar sin destino = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA,usuario_id:id('pedro')}); ok('persona fuera del equipo = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('gero')}); ok('a gerente = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA,comentario:'Revisen el conector API'}); ok('analista deriva al equipo Mesa', r.s===200, r.j);
ok('pendientes: sol 1, carla 1, pedro 0', (await pend('sol'))===1 && (await pend('carla'))===1 && (await pend('pedro'))===0);
r=await call(ck.sol,'GET','/api/mis-alertas'); ok('sol la ve en Mis alertas', r.j.abiertas.length===1 && r.j.eventos.length===1, {ab:r.j.abiertas.length, ev:r.j.eventos.map(e=>e.accion)});
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/tomar`,{}); ok('pedro (otro equipo) no la toma', r.s===403);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/comentar`,{comentario:'hola'}); ok('pedro no comenta', r.s===403);
await sig(1); g=grupo('RECHAZO_ALTO','CLI_004'); ok('E8 ventana nueva hereda el equipo', g.length===2 && g.every(x=>x.e===MESA && x.estado==='ABIERTA'), g);
r=await call(ck.sol,'POST',`/api/alertas/${g[1].alerta_id}/tomar`,{}); ok('sol la toma (desde cualquier ventana)', r.s===200);
r=await call(ck.carla,'POST',`/api/alertas/${AL}/tomar`,{}); ok('carla llega tarde = 409', r.s===409, r.j.error);
g=grupo('RECHAZO_ALTO','CLI_004'); ok('todas las ventanas en curso con sol', g.every(x=>x.estado==='RECONOCIDA' && x.u===id('sol') && x.reconocida_por==='Sol Porte'));
ok('pendientes: sol 1 (en curso), carla 0', (await pend('sol'))===1 && (await pend('carla'))===0);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/comentar`,{comentario:'Estoy hablando con el cliente'}); ok('sol comenta', r.s===200);
await sig(1); g=grupo('RECHAZO_ALTO','CLI_004'); ok('E9 ventana nueva hereda "en curso" de sol', g.length===3 && g.every(x=>x.estado==='RECONOCIDA' && x.u===id('sol')), g.map(x=>x.v+':'+x.estado+':'+x.u));
r=await call(ck.carla,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('carla'),equipo_id:999}); ok('líder reasigna a sí misma (equipo forzado al suyo)', r.s===200, r.j);
g=grupo('RECHAZO_ALTO','CLI_004'); ok('queda asignada a carla, sin tomar, equipo Mesa', g.every(x=>x.estado==='ABIERTA' && x.u===id('carla') && x.e===MESA));
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{comentario:'ya está'}); ok('sol ya no la puede resolver', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{}); ok('sol no la puede tomar (es de carla)', r.s===409||r.s===403, r.s);
r=await call(ck.carla,'POST',`/api/alertas/${AL}/devolver`,{comentario:''}); ok('devolver sin motivo = 400', r.s===400, r.j.error);
r=await call(ck.carla,'POST',`/api/alertas/${AL}/devolver`,{comentario:'Es un tema comercial, no técnico'}); ok('carla devuelve', r.s===200);
g=grupo('RECHAZO_ALTO','CLI_004'); ok('vuelve sin asignar', g.every(x=>x.estado==='ABIERTA' && x.u==null && x.e==null));
r=await call(ck.ana,'GET','/api/dashboard'); const ev=r.j.eventos.filter(e=>g.some(x=>x.alerta_id===e.alerta_id)); ok('tablero ve la devolución como último evento', ev[ev.length-1].accion==='DEVOLVER' && ev[ev.length-1].comentario.includes('comercial'));
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('pedro'),comentario:'Pedro, fijate vos'}); ok('analista deriva directo a pedro', r.s===200);
ok('pendientes pedro 1', (await pend('pedro'))===1);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/tomar`,{}); ok('pedro toma', r.s===200);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/resolver`,{comentario:''}); ok('resolver sin comentario = 400', r.s===400, r.j.error);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/resolver`,{comentario:'Se reinició el conector del cliente'}); ok('pedro resuelve', r.s===200);
g=grupo('RECHAZO_ALTO','CLI_004'); ok('todas resueltas a mano por pedro', g.every(x=>x.estado==='RESUELTA' && x.m==='MANUAL'), g.map(x=>x.estado));
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/historial`); ok('historial completo', r.j.eventos.map(e=>e.accion).join(',')==='DERIVAR,TOMAR,COMENTAR,DERIVAR,DEVOLVER,DERIVAR,TOMAR,RESOLVER', r.j.eventos.map(e=>e.accion+':'+e.usuario_nombre));
r=await call(ck.pedro,'GET','/api/mis-alertas'); ok('pedro la ve en resueltas', r.j.resueltas.length===3 && r.j.abiertas.length===0);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/comentar`,{comentario:'x'}); ok('no se actúa sobre resueltas = 409', r.s===409);
// Normalización con asignación
await sig(4); // E13: latencia CLI_003
g=grupo('LATENCIA_ALTA','CLI_003'); const LAT=g[0].alerta_id; ok('E13 latencia CLI_003', g.length===1, g);
r=await call(ck.ana,'POST',`/api/alertas/${LAT}/derivar`,{usuario_id:id('sol')}); r=await call(ck.sol,'POST',`/api/alertas/${LAT}/tomar`,{}); ok('sol toma la latencia', r.s===200);
await sig(4); g=grupo('LATENCIA_ALTA','CLI_003'); ok('E17 se normalizó sola', g.length===4 && g.every(x=>x.estado==='RESUELTA' && x.m==='NORMALIZADA' && x.u===id('sol')), g.map(x=>x.v+':'+x.estado+':'+x.m+':'+x.u));
r=await call(ck.sol,'GET','/api/mis-alertas'); ok('sol la ve en resueltas como NORMALIZADA', r.j.resueltas.some(x=>x.tipo_alerta==='LATENCIA_ALTA' && x.motivo_resolucion==='NORMALIZADA'));
// Analista toma una sin asignar y la resuelve
const abiertas=db.prepare("select alerta_id from alertas_historico where estado='ABIERTA' and severidad<>'BAJA' limit 1").get();
if (abiertas) { r=await call(ck.ana,'POST',`/api/alertas/${abiertas.alerta_id}/tomar`,{}); ok('analista toma sin asignar', r.s===200); r=await call(ck.ana,'POST',`/api/alertas/${abiertas.alerta_id}/resolver`,{comentario:'ok listo'}); ok('analista resuelve', r.s===200); }
r=await call(ck.gero,'GET','/api/dashboard'); ok('gerente ve el tablero', r.s===200 && r.j.mis_pendientes===undefined);
r=await call(A,'GET','/api/admin/auditoria'); const acc=new Set(r.j.filas.map(f=>f.accion)); ok('auditoría registra la asignación', ['DERIVAR_ALERTA','TOMAR_ALERTA','COMENTAR_ALERTA','DEVOLVER_ALERTA','RESOLVER_ALERTA'].every(a=>acc.has(a)));
r=await call(A,'POST','/api/demo/preparar'); ok('preparar demo limpia eventos', db.prepare('select count(*) n from alerta_eventos').get().n===0);
console.log(fallas?'FALLAS: '+fallas:'TODO OK');
