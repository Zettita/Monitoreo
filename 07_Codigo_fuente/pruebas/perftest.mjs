import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,160)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
// Prueba de perfiles (patch25): qué ve y qué hace cada uno, "Avisar" de pre-alertas e inicio por perfil
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
const EQ=(n)=>db.prepare('select id from equipos where nombre=?').get(n).id;
const loc=async(c,p)=>{const r=await worker.fetch(new Request('https://x'+p,{headers:{cookie:c},redirect:'manual'}),env,{});return r.status+' '+(r.headers.get('location')||'').replace('https://x','');};

// Inicio de cada perfil
ok('inicio admin → Administración', await loc(A,'/inicio')==='302 /admin');
ok('inicio soporte → Mis alertas', await loc(ck.sol,'/inicio')==='302 /mis-alertas');
ok('inicio analista y gerente → tablero', await loc(ck.ana,'/inicio')==='302 /' && await loc(ck.gero,'/inicio')==='302 /');
ok('inicio con ?demo (admin) → tablero de la demo', await loc(A,'/inicio?demo')==='302 /?demo');
let r=await call(A,'GET','/api/yo'); ok('/api/yo trae inicio', r.j.inicio==='/admin');

// Tablero
ok('soporte: el tablero lo manda a Mis alertas', await loc(ck.sol,'/')==='302 /mis-alertas');
r=await call(ck.sol,'GET','/api/dashboard'); ok('soporte: /api/dashboard prohibido', r.s===403);
for (const u of ['ana','gero']) { r=await call(ck[u],'GET','/api/dashboard'); ok(u+': ve el tablero', r.s===200); }
r=await call(A,'GET','/api/dashboard'); ok('admin: ve el tablero', r.s===200);
r=await call(ck.gero,'GET','/api/yo'); ok('gerente: sin lista de alertas, sin seguimiento, sin campanita', !r.j.permisos.includes('alertas_abiertas') && !r.j.permisos.includes('seguimiento') && !r.j.permisos.includes('avisos') && r.j.permisos.includes('tablero'));
r=await call(A,'GET','/api/yo'); ok('admin: sin derivar, sin Mis alertas, sin campanita', !r.j.permisos.includes('derivar') && !r.j.permisos.includes('mis_alertas') && !r.j.permisos.includes('avisos') && r.j.permisos.includes('admin_reglas'));
r=await call(ck.ana,'GET','/api/yo'); ok('analista: deriva y avisa pre-alertas, sin reglas de alerta', r.j.permisos.includes('derivar') && r.j.permisos.includes('avisar_prealerta') && !r.j.permisos.includes('admin_reglas') && r.j.permisos.includes('admin_derivacion'));
r=await call(A,'GET','/api/avisos/contador'); ok('admin: campanita apagada', r.j.habilitado===false);
r=await call(ck.sol,'GET','/api/asignables'); ok('asignables: solo Soporte', r.s===200 && r.j.usuarios.length===2 && r.j.usuarios.every(u=>u.perfil==='SOPORTE'), r.j.usuarios);

// Demo hasta la escena 6 (pre-alerta de rechazos en CLI_004)
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<6;i++) await call(A,'POST','/api/demo/siguiente');
r=await call(ck.ana,'GET','/api/dashboard'); const pre=r.j.prealertas.find(p=>p.activa===1);
ok('hay una pre-alerta activa', !!pre, r.j.prealertas.map(p=>p.tipo_prealerta+':'+p.cliente_id+':'+p.activa));
const cuerpo=(x)=>Object.assign({tipo_prealerta:pre.tipo_prealerta,ambiente:pre.ambiente,cliente_id:pre.cliente_id,servicio_id:pre.servicio_id,producto_id:pre.producto_id,canal_id:pre.canal_id,moneda_id:pre.moneda_id},x);
r=await call(ck.sol,'POST','/api/prealertas/avisar',cuerpo({equipo_id:EQ('Mesa')})); ok('soporte no avisa pre-alertas', r.s===403);
r=await call(A,'POST','/api/prealertas/avisar',cuerpo({equipo_id:EQ('Mesa')})); ok('admin no avisa pre-alertas', r.s===403);
r=await call(ck.ana,'POST','/api/prealertas/avisar',cuerpo({})); ok('sin destino = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST','/api/prealertas/avisar',cuerpo({usuario_id:id('gero')})); ok('al gerente = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST','/api/prealertas/avisar',cuerpo({cliente_id:'CLI_999',equipo_id:EQ('Mesa')})); ok('pre-alerta inexistente = 409', r.s===409, r.j.error);
const alertasAntes=db.prepare('select count(*) n from alertas_historico').get().n;
r=await call(ck.ana,'POST','/api/prealertas/avisar',cuerpo({equipo_id:EQ('Pagos'),comentario:'Miren el conector'})); ok('analista avisa al equipo Pagos', r.s===200 && r.j.avisados===1, r.j);
const av=db.prepare("select * from avisos where usuario_id=? and tipo='PREALERTA'").all(id('pedro'));
ok('pedro recibe el aviso con comentario', av.length===1 && av[0].alerta_id===null && av[0].texto.includes('CLI_004') && av[0].detalle==='Miren el conector', av);
ok('no se crea ninguna alerta', db.prepare('select count(*) n from alertas_historico').get().n===alertasAntes);
ok('queda en auditoría', db.prepare("select count(*) n from auditoria where accion='AVISAR_PREALERTA'").get().n===1);
r=await call(ck.pedro,'GET','/api/avisos'); ok('pedro lo ve en la campanita', r.j.avisos.some(a=>a.tipo==='PREALERTA'));

// Escena 7: rechazo alto en CLI_004. El admin no deriva ni toma; el analista deriva a Pagos
await call(A,'POST','/api/demo/siguiente');
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004'").get().alerta_id;
r=await call(A,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:EQ('Pagos')}); ok('admin no deriva', r.s===403);
r=await call(A,'POST',`/api/alertas/${AL}/tomar`,{}); ok('admin no toma', r.s===403);
r=await call(A,'POST',`/api/alertas/${AL}/resolver`,{comentario:'Falsa alarma'}); ok('admin no resuelve', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('uriel')}); ok('derivar al admin = 400', r.s===400, r.j.error);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/historial`); ok('soporte no ve el historial de una alerta ajena', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:EQ('Pagos')}); ok('analista deriva a Pagos', r.s===200);
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/historial`); ok('pedro (Pagos) ve el historial', r.s===200 && r.j.eventos.length===1);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/historial`); ok('sol (Mesa) sigue sin verlo', r.s===403);
r=await call(ck.pedro,'GET','/api/mis-alertas'); ok('Mis alertas trae el contador de pendientes', r.j.mis_pendientes===1, r.j.mis_pendientes);
r=await call(ck.gero,'GET',`/api/alertas/${AL}/historial`); ok('gerente ve el historial (lectura)', r.s===200);
console.log(fallas ? 'FALLAS: '+fallas : 'TODO OK');
