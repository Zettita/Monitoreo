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
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['ana2','Otra Analista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('ana2')]});
const MESA=db.prepare("select id from equipos where nombre='Mesa'").get().id;
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<7;i++) await call(A,'POST','/api/demo/siguiente');
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004'").get().alerta_id;
let r;
// Permisos de páginas
const st=async(c,p)=>(await call(c,'GET',p)).s;
ok('analista: Mis alertas ya no (302 / 403)', await st(ck.ana,'/mis-alertas')===302 && await st(ck.ana,'/api/mis-alertas')===403);
ok('analista: Seguimiento sí', await st(ck.ana,'/seguimiento')===200 && await st(ck.ana,'/api/seguimiento')===200);
ok('gerente: Seguimiento no', await st(ck.gero,'/seguimiento')===302 && await st(ck.gero,'/api/seguimiento')===403);
ok('soporte: Seguimiento no, Mis alertas sí', await st(ck.sol,'/seguimiento')===302 && await st(ck.sol,'/api/seguimiento')===403 && await st(ck.sol,'/api/mis-alertas')===200);
ok('admin: Seguimiento sí (lectura), Mis alertas no', await st(A,'/seguimiento')===200 && await st(A,'/api/mis-alertas')===403);
r=await call(ck.ana,'GET','/api/yo'); ok('permisos del analista', r.j.permisos.includes('seguimiento') && !r.j.permisos.includes('mis_alertas'), r.j.permisos);
r=await call(ck.ana,'GET','/api/dashboard'); ok('tablero del analista sin contador de Mis alertas', r.s===200 && r.j.mis_pendientes===undefined);
// El analista deriva, no toma
r=await call(ck.ana,'POST',`/api/alertas/${AL}/tomar`,{}); ok('analista no toma (403)', r.s===403, r.j.error);
r=await call(ck.ana,'GET','/api/asignables'); ok('asignables sin analistas ni gerentes', r.s===200 && r.j.usuarios.every(u=>u.perfil==='ADMIN'||u.perfil==='SOPORTE'), r.j.usuarios.map(u=>u.perfil));
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('ana2')}); ok('no se deriva a un analista', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA,comentario:'Revisen'}); ok('analista deriva al equipo', r.s===200);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'A una analista',equipo_id:null,usuario_id:id('ana2')}); ok('regla de derivación a analista = 400', r.s===400, r.j.error);
// Datos del seguimiento
r=await call(ck.ana,'GET','/api/seguimiento');
ok('seguimiento trae abiertas, equipos, miembros y umbrales', r.j.abiertas.some(a=>a.alerta_id===AL && a.equipo_nombre==='Mesa') && r.j.equipos.length===1 && r.j.miembros.length===2 && r.j.umbrales.length>=1, {ab:r.j.abiertas.length, eq:r.j.equipos.length});
await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{});
r=await call(ck.ana,'GET','/api/seguimiento'); ok('seguimiento: la tomó Sol', r.j.abiertas.filter(a=>a.alerta_id===AL).every(a=>a.estado==='RECONOCIDA' && a.asignado_nombre==='Sol Porte'));
await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{comentario:'Se reinició el conector'});
r=await call(ck.ana,'GET','/api/seguimiento'); ok('seguimiento: aparece en resueltas 24 h con comentario', r.j.resueltas.some(a=>a.alerta_id===AL && a.comentario_resolucion==='Se reinició el conector' && a.resuelta_por==='Sol Porte'), r.j.resueltas.length);
// Mis alertas del soporte trae umbrales (prioridad)
r=await call(ck.sol,'GET','/api/mis-alertas'); ok('Mis alertas trae umbrales', Array.isArray(r.j.umbrales) && r.j.umbrales.length>=1);
// Campanita: a dónde lleva
r=await call(ck.ana,'GET','/api/avisos/contador'); ok('campanita del analista lleva a Seguimiento', r.j.bandeja==='/seguimiento');
r=await call(ck.sol,'GET','/api/avisos/contador'); ok('campanita de soporte lleva a Mis alertas', r.j.bandeja==='/mis-alertas');
r=await call(ck.gero,'POST',`/api/alertas/${AL}/comentar`,{comentario:'x'}); ok('gerente no actúa', r.s===403);
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
