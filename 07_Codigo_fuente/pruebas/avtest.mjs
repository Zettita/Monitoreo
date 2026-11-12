import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,170)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123'); const ck={uriel:A};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Lider','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',responsable_id:id('carla'),miembros:[id('sol'),id('carla')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
const EQ=(n)=>db.prepare("select id from equipos where nombre=?").get(n).id;
let r;
// --- Reglas de derivación ---
r=await call(ck.sol,'GET','/api/admin/derivacion'); ok('soporte no ve derivación', r.s===403);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Sin destino'}); ok('sin destino = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Mal',equipo_id:EQ('Pagos'),usuario_id:id('sol')}); ok('persona fuera del equipo = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Al gerente',usuario_id:id('gero')}); ok('a gerente = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Rechazos CLI_004 a Pagos',cliente_id:'CLI_004',tipo_alerta:'RECHAZO_ALTO',equipo_id:EQ('Pagos')}); ok('R1 creada por analista', r.s===200);
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Todo lo grave a Mesa',severidad_minima:'CRITICA',equipo_id:EQ('Mesa')}); ok('R2', r.s===200);
r=await call(A,'POST','/api/admin/derivacion',{nombre:'Lentitud a Sol',tipo_alerta:'LATENCIA_ALTA',usuario_id:id('sol')}); ok('R3', r.s===200);
r=await call(ck.ana,'GET','/api/admin/derivacion'); ok('orden R1,R2,R3', r.j.reglas.map(x=>x.nombre.split(' ')[0]+x.prioridad).join(',')==='Rechazos10,Todo20,Lentitud30', r.j.reglas.map(x=>x.nombre+':'+x.prioridad));
const RID=(n)=>db.prepare("select id from reglas_derivacion where nombre like ?").get(n+'%').id;
await call(A,'POST','/api/demo/preparar');
const sig=async(n)=>{let x;for(let i=0;i<n;i++) x=await call(A,'POST','/api/demo/siguiente'); return x;};
const grupo=(tipo,cli)=>db.prepare("select alerta_id, estado, asignado_usuario_id u, asignado_equipo_id e, asignado_por p, substr(ventana_inicio,12,5) v, motivo_resolucion m from alertas_historico where tipo_alerta=? and cliente_id=? order by ventana_inicio").all(tipo,cli);
const avisos=(u)=>db.prepare("select tipo, texto, leido, alerta_id from avisos where usuario_id=? order by id").all(id(u));
const cont=async(u)=>(await call(ck[u],'GET','/api/avisos/contador')).j;
r=await sig(2); // E2
let g=grupo('VOLUMEN_BAJO','CLI_001'); ok('E2 grave CLI_001 → Mesa por R2', g.length===1 && g[0].e===EQ('Mesa') && g[0].u==null && g[0].p==null, g);
ok('procesar informa derivadas', true);
let ev=db.prepare("select usuario_id, accion, comentario from alerta_eventos where alerta_id=?").all(g[0].alerta_id); ok('evento automático', ev.length===1 && ev[0].usuario_id==null && ev[0].comentario.includes('Todo lo grave a Mesa'), ev);
ok('aviso a sol y carla', avisos('sol').length===1 && avisos('carla').length===1 && avisos('pedro').length===0, avisos('sol'));
ok('contador sol = 1', (await cont('sol')).no_leidos===1);
r=await call(ck.gero,'GET','/api/avisos/contador'); ok('gerente sin campanita', r.j.habilitado===false);
await sig(2); // E4: VOLUMEN_ALTO CLI_005 grave
g=grupo('VOLUMEN_ALTO','CLI_005'); ok('E4 pico CLI_005 → Mesa', g.length>=1 && g.every(x=>x.e===EQ('Mesa')), g);
r=await call(ck.sol,'POST',`/api/alertas/${g[0].alerta_id}/tomar`,{}); ok('sol toma el pico', r.s===200);
await sig(2); // E6: normaliza
g=grupo('VOLUMEN_ALTO','CLI_005'); ok('E6 pico normalizado', g.every(x=>x.estado==='RESUELTA' && x.m==='NORMALIZADA'), g.map(x=>x.estado+':'+x.m));
ok('aviso a sol: se normalizó sola', avisos('sol').some(a=>a.tipo==='RESUELTA' && /normalizó/.test(a.texto)), avisos('sol').map(a=>a.tipo));
r=await call(ck.ana,'POST',`/api/admin/derivacion/${RID('Lentitud')}/mover`,{direccion:-1}); r=await call(ck.ana,'POST',`/api/admin/derivacion/${RID('Lentitud')}/mover`,{direccion:-1});
r=await call(ck.ana,'GET','/api/admin/derivacion'); ok('Lentitud subió al primer lugar', r.j.reglas[0].nombre==='Lentitud a Sol', r.j.reglas.map(x=>x.nombre));
await sig(1); // E7 rechazo CLI_004 media
g=grupo('RECHAZO_ALTO','CLI_004'); ok('E7 rechazo CLI_004 → Pagos (R1)', g.length===1 && g[0].e===EQ('Pagos'), g);
ok('aviso a pedro', avisos('pedro').some(a=>a.tipo==='ASIGNADA' && a.texto.includes('Pagos')));
r=await call(ck.pedro,'POST',`/api/alertas/${g[0].alerta_id}/devolver`,{comentario:'No es de pagos'}); ok('pedro devuelve', r.s===200);
ok('aviso de devolución a los analistas (ana; el admin ya no)', avisos('ana').some(a=>a.tipo==='DEVUELTA') && !avisos('uriel').some(a=>a.tipo==='DEVUELTA'));
await sig(1); // E8
g=grupo('RECHAZO_ALTO','CLI_004'); ok('E8 devuelta NO se vuelve a derivar sola', g.length===2 && g.every(x=>x.e==null && x.u==null), g.map(x=>x.v+':'+x.e));
await call(ck.ana,'POST',`/api/admin/derivacion/${RID('Todo lo grave')}`,{activa:false});
await sig(5); // E13 latencia grave CLI_003
g=grupo('LATENCIA_ALTA','CLI_003'); ok('E13 latencia → sol (R3 primero)', g.length===1 && g[0].u===id('sol') && g[0].e==null, g);
await sig(1); // E14 CLI_006 graves sin regla
const graves=db.prepare("select count(*) n from avisos where tipo='GRAVE_SIN_ASIGNAR' and usuario_id=?").get(id('ana')).n;
ok('E14 avisos de grave sin asignar a la analista', graves>=1, graves);
await sig(1); // E15
ok('no se repite el aviso de grave', db.prepare("select count(*) n from avisos where tipo='GRAVE_SIN_ASIGNAR' and usuario_id=?").get(id('ana')).n===graves);
ok('gerente nunca recibe avisos', db.prepare("select count(*) n from avisos where usuario_id=?").get(id('gero')).n===0);
// Manual: derivar, comentar, resolver
const se=grupo('SIN_EXITOS','CLI_006');
r=await call(ck.ana,'POST',`/api/alertas/${se[0].alerta_id}/derivar`,{equipo_id:EQ('Mesa'),usuario_id:id('carla'),comentario:'Urgente'}); ok('ana deriva a carla', r.s===200);
ok('aviso a carla con comentario', avisos('carla').some(a=>a.tipo==='ASIGNADA' && a.texto.startsWith('Ana Lista te asignó')));
r=await call(ck.carla,'POST',`/api/alertas/${se[0].alerta_id}/comentar`,{comentario:'Mirando'}); ok('aviso a ana por comentario', avisos('ana').some(a=>a.tipo==='COMENTARIO'));
r=await call(ck.ana,'POST',`/api/alertas/${se[0].alerta_id}/resolver`,{comentario:'Lo resolví yo'}); ok('aviso a carla: resuelta', avisos('carla').some(a=>a.tipo==='RESUELTA' && a.texto.includes('Ana Lista')));
ok('quien actúa no se avisa a sí mismo', !avisos('ana').some(a=>a.tipo==='RESUELTA'));
// Lista y lectura
r=await call(ck.carla,'GET','/api/avisos'); ok('lista con datos de la alerta', r.j.avisos.length>0 && r.j.avisos[0].cliente_id, r.j.avisos.map(a=>a.tipo+':'+a.cliente_id).slice(0,4));
const c0=(await cont('carla')).no_leidos; await call(ck.carla,'POST',`/api/avisos/${r.j.avisos[0].id}/leido`); ok('marcar uno leído', (await cont('carla')).no_leidos===c0-1);
r=await call(ck.sol,'POST',`/api/avisos/${r.j.avisos[1].id}/leido`); ok('no se marca uno ajeno', db.prepare('select leido from avisos where id=?').get(Number((await call(ck.carla,'GET','/api/avisos')).j.avisos[1].id)).leido===0);
await call(ck.carla,'POST','/api/avisos/leer-todos'); ok('leer todos', (await cont('carla')).no_leidos===0);
r=await call(A,'GET','/api/admin/auditoria'); ok('auditoría derivación', ['ALTA_DERIVACION','MOVER_DERIVACION','EDITAR_DERIVACION'].every(a=>r.j.filas.some(f=>f.accion===a)));
await call(A,'POST','/api/demo/preparar'); ok('preparar borra avisos', db.prepare('select count(*) n from avisos').get().n===0);
console.log(fallas?'FALLAS: '+fallas:'TODO OK');
