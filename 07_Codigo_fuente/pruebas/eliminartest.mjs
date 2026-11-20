import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del parche 75: el Administrador elimina lo que crea (usuarios, equipos, reglas de alerta, reglas de derivación, causas y acciones)
// y "Preparar demo" reinicia la numeración de las salas de crisis (la primera sala de la demo es siempre IM-4).
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/\breturning\b/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const env={DB};
const call=async(ck,m,p,body)=>{
  const h={cookie:ck||''}; if(body!==undefined)h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined&&!c?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,300)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const q1=(sql,...a)=>db.prepare(sql).get(...a);
const n=(sql,...a)=>db.prepare(sql).get(...a).n;
const fkRotas=()=>db.prepare('PRAGMA foreign_key_check').all().length;

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Mesa','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['luz','Luz Temporal','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=await login(u,'Clave'+u+'123456');
}
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('carla')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Temporal',miembros:[id('luz')]});
const eq=(nom)=>q1('select id from equipos where nombre=?',nom).id;
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
const grupos=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, cliente_id, servicio_id, canal_id order by ventana_inicio").all().map(x=>x.alerta_id);
ok('hay alertas abiertas para la prueba', grupos.length>=4, grupos.length);
let r;

// ---------- Usuarios ----------
r=await call(ck.ana,'POST',`/api/admin/usuarios/${id('luz')}/borrar`,{}); ok('un Analista no elimina usuarios (403)', r.s===403);
r=await call(ck.sol,'POST',`/api/admin/usuarios/${id('luz')}/borrar`,{}); ok('Soporte no elimina usuarios (403)', r.s===403);
r=await call(A,'POST',`/api/admin/usuarios/${id('uriel')}/borrar`,{}); ok('nadie se elimina a sí mismo (400)', r.s===400 && /propio usuario/.test(r.j.error), r.j);
r=await call(A,'POST','/api/admin/usuarios/99999/borrar',{}); ok('un usuario que no existe = 404', r.s===404);
// Alerta abierta asignada: no se puede eliminar hasta derivarla o resolverla
r=await call(ck.ana,'POST',`/api/alertas/${grupos[0]}/derivar`,{usuario_id:id('sol'),comentario:'Para vos'});
ok('(preparación) se deriva una alerta a Sol', r.s===200, r.j);
r=await call(A,'POST',`/api/admin/usuarios/${id('sol')}/borrar`,{}); ok('con alertas abiertas asignadas no se elimina (409, dice cuántas)', r.s===409 && /1 alerta abierta asignada/.test(r.j.error) && !!q1("select 1 from usuarios where usuario='sol'"), r.j);
r=await call(ck.ana,'POST',`/api/alertas/${grupos[0]}/resolver`,{comentario:'Falsa alarma, se resuelve'}); ok('(preparación) el Analista resuelve esa alerta', r.s===200, r.j);
// Lo que cuelga de la persona
await call(ck.pedro,'POST','/api/asistente',{pregunta:'seguimos'});   // sin Workers AI no hay respuesta, pero no importa
db.prepare("INSERT OR REPLACE INTO asistente_uso (hora, usuario_id, preguntas) VALUES ('2026-11-20T10', ?, 2)").run(id('pedro'));
db.prepare("INSERT INTO suscripciones_push (endpoint, usuario_id, clave_p256dh, clave_auth, creada, actualizada) VALUES ('https://fcm.googleapis.com/x/pedro', ?, 'k', 'a', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z')").run(id('pedro'));
await call(ck.ana,'POST',`/api/alertas/${grupos[1]}/derivar`,{equipo_id:eq('Pagos'),comentario:'Pagos'});   // le llega un aviso a Pedro
const regPedro=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Todo a Pedro',usuario_id:id('pedro')});
const regPedroEq=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Pagos con Pedro',equipo_id:eq('Pagos'),usuario_id:id('pedro'),cliente_id:'CLI_004'});
ok('(preparación) hay avisos, uso del asistente, push y 2 reglas de derivación de Pedro', n('select count(*) n from avisos where usuario_id=?',id('pedro'))>=1 && n('select count(*) n from suscripciones_push where usuario_id=?',id('pedro'))===1 && regPedro.s===200 && regPedroEq.s===200, [regPedro.s, regPedroEq.s]);
r=await call(ck.ana,'POST',`/api/alertas/${grupos[1]}/resolver`,{comentario:'Resuelta para la prueba'});
const sesPedro=n('select count(*) n from sesiones where usuario_id=?',id('pedro'));
db.prepare("INSERT INTO teams_bot_memoria (conversacion_id, usuario_id, mensajes, sala_id, actualizado) VALUES ('19:chat', ?, '[]', NULL, '2026-11-20T10:00:00Z')").run(id('pedro'));   // memoria del bot de Teams (parche 77)
const aud0=n('select count(*) n from auditoria');
r=await call(A,'POST',`/api/admin/usuarios/${id('pedro')}/borrar`,{});
ok('el Administrador elimina a Pedro (con historial)', r.s===200 && !q1("select 1 from usuarios where usuario='pedro'"), r.j);
ok('se fueron sus sesiones, avisos, push, uso del asistente y pertenencia a equipos', n('select count(*) n from sesiones where usuario_id=?',id('uriel'))>=0 && !q1("select 1 from sesiones s where s.usuario_id not in (select id from usuarios)") && sesPedro>=1
  && n("select count(*) n from avisos where usuario_id not in (select id from usuarios)")===0 && n("select count(*) n from suscripciones_push where endpoint like '%pedro'")===0
  && n("select count(*) n from asistente_uso where usuario_id not in (select id from usuarios)")===0 && n('select count(*) n from equipo_miembros where usuario_id not in (select id from usuarios)')===0);
ok('la regla que mandaba solo a Pedro se borró y la que tenía también equipo quedó con el equipo', !q1("select 1 from reglas_derivacion where nombre='Todo a Pedro'") && q1("select usuario_id, equipo_id from reglas_derivacion where nombre='Pagos con Pedro'").usuario_id===null && q1("select equipo_id from reglas_derivacion where nombre='Pagos con Pedro'").equipo_id===eq('Pagos'));
ok('se fue también su memoria del bot de Teams', n('select count(*) n from teams_bot_memoria where usuario_id not in (select id from usuarios)')===0 && n('select count(*) n from teams_bot_memoria')===0);
ok('queda en la auditoría con su nombre', n("select count(*) n from auditoria where accion='BORRAR_USUARIO' and detalle='pedro (Pedro Pagos)'")===1 && n('select count(*) n from auditoria')===aud0+1);
ok('no quedan referencias rotas en la base', fkRotas()===0, db.prepare('PRAGMA foreign_key_check').all().slice(0,3));
ok('el historial de las alertas que tuvo el equipo sigue ahí', n("select count(*) n from alertas_historico where estado='RESUELTA'")>=1);
r=await call(ck.pedro,'GET','/api/yo'); ok('Pedro ya no puede entrar con su sesión (401)', r.s===401);
r=await call('','POST','/api/login',{usuario:'pedro',clave:'Clavepedro123456'}); ok('ni con su usuario', r.s!==200 || r.j.ok===false);
r=await call(A,'POST',`/api/admin/usuarios/99999/borrar`,{}); ok('eliminarlo otra vez = 404', r.s===404);
// Usuario sin nada: se va limpio
r=await call(A,'POST',`/api/admin/usuarios/${id('luz')}/borrar`,{}); ok('un usuario sin historial se elimina', r.s===200 && !q1("select 1 from usuarios where usuario='luz'") && fkRotas()===0);

// ---------- Equipos ----------
r=await call(ck.ana,'POST',`/api/alertas/${grupos[2]}/derivar`,{equipo_id:eq('Mesa'),comentario:'Mesa'});
r=await call(ck.ana,'POST',`/api/admin/equipos/${eq('Mesa')}/borrar`,{}); ok('un equipo con alertas abiertas asignadas no se elimina (409)', r.s===409 && /alerta abierta asignada/.test(r.j.error), r.j);
await call(ck.ana,'POST',`/api/alertas/${grupos[2]}/resolver`,{comentario:'Resuelta para la prueba'});
await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'A la Mesa',equipo_id:eq('Mesa')});
r=await call(ck.ana,'POST',`/api/admin/equipos/${eq('Mesa')}/borrar`,{});
ok('con la alerta resuelta, el equipo se elimina aunque tenga historial', r.s===200 && !q1("select 1 from equipos where nombre='Mesa'"), r.j);
ok('se fueron sus integrantes y su regla de derivación; sin referencias rotas', !q1("select 1 from reglas_derivacion where nombre='A la Mesa'") && n('select count(*) n from equipo_miembros where equipo_id not in (select id from equipos)')===0 && fkRotas()===0);
ok('queda en la auditoría', n("select count(*) n from auditoria where accion='BORRAR_EQUIPO' and detalle='Mesa'")===1);
r=await call(A,'POST',`/api/admin/equipos/${eq('Temporal')}/borrar`,{}); ok('un equipo sin historial se elimina', r.s===200);
r=await call(A,'POST','/api/admin/equipos/99999/borrar',{}); ok('un equipo que no existe = 404', r.s===404);

// ---------- Reglas de alerta personalizadas ----------
r=await call(A,'POST','/api/admin/reglas',{nombre:'Caída fuerte de transferencias',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:2,severidad:'ALTA'});
const rid=q1("select id from reglas_alerta where tipo='PERSONALIZADA' and nombre='Caída fuerte de transferencias'").id;
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'La regla a Soporte',tipo_alerta:'PERS_'+rid,equipo_id:eq('Pagos')});
r=await call(ck.ana,'POST',`/api/admin/reglas/${rid}/borrar`,{}); ok('un Analista no elimina reglas de alerta (403)', r.s===403);
r=await call(A,'POST',`/api/admin/reglas/${rid}/borrar`,{});
ok('el Administrador elimina una regla personalizada y las reglas de derivación que la usaban', r.s===200 && !q1('select 1 from reglas_alerta where id=?',rid) && !q1("select 1 from reglas_derivacion where nombre='La regla a Soporte'"), r.j);
ok('queda en la auditoría', n("select count(*) n from auditoria where accion='BORRAR_REGLA'")===1);
r=await call(A,'POST',`/api/admin/reglas/${rid}/borrar`,{}); ok('otra vez = 404', r.s===404);
const sis=q1("select id from reglas_alerta where tipo='SISTEMA' limit 1");
r=await call(A,'POST',`/api/admin/reglas/${Math.abs(sis.id)}/borrar`,{}); ok('una regla del sistema no se puede eliminar', r.s===404 && n("select count(*) n from reglas_alerta where tipo='SISTEMA'")>=12, r.s);

// ---------- Reglas de derivación ----------
r=await call(ck.ana,'POST','/api/admin/derivacion',{nombre:'Regla de prueba',equipo_id:eq('Pagos')});
const did=q1("select id from reglas_derivacion where nombre='Regla de prueba'").id;
r=await call(ck.sol,'POST',`/api/admin/derivacion/${did}/borrar`,{}); ok('Soporte no elimina reglas de derivación (403)', r.s===403);
r=await call(ck.ana,'POST',`/api/admin/derivacion/${did}/borrar`,{}); ok('el Analista elimina una regla de derivación', r.s===200 && !q1('select 1 from reglas_derivacion where id=?',did));
ok('queda en la auditoría', n("select count(*) n from auditoria where accion='BORRAR_DERIVACION' and detalle='Regla de prueba'")===1);
r=await call(ck.ana,'POST',`/api/admin/derivacion/${did}/borrar`,{}); ok('otra vez = 404', r.s===404);

// ---------- Causas y qué se hizo ----------
r=await call(A,'POST','/api/admin/catalogo-resolucion',{tipo:'CAUSA',nombre:'Causa de prueba'});
let cat=(await call(A,'GET','/api/admin/catalogo-resolucion')).j.items; const cid=cat.find(x=>x.nombre==='Causa de prueba').id;
r=await call(ck.ana,'POST','/api/admin/catalogo-resolucion',{id:cid,borrar:true}); ok('un Analista no elimina causas (403)', r.s===403);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{id:cid,borrar:true});
cat=(await call(A,'GET','/api/admin/catalogo-resolucion')).j.items;
ok('el Administrador elimina una causa', r.s===200 && !cat.some(x=>x.id===cid), r.j);
ok('queda en la auditoría', n("select count(*) n from auditoria where accion='BORRAR_CATALOGO_RESOLUCION'")===1);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{id:cid,borrar:true}); ok('otra vez = 404', r.s===404);
const aid=cat.find(x=>x.tipo==='ACCION').id;
r=await call(A,'POST','/api/admin/catalogo-resolucion',{id:aid,borrar:true}); ok('también se elimina una acción', r.s===200 && !(await call(A,'GET','/api/admin/catalogo-resolucion')).j.items.some(x=>x.id===aid));

// ---------- Salas de crisis: no se elimina lo que las deja sin dueño ----------
const g=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, cliente_id, servicio_id, canal_id order by ventana_inicio").all().map(x=>x.alerta_id);
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[g[0]]}); const IM=r.j.incidente&&r.j.incidente.id;
ok('(preparación) Ana abre una sala', r.s===200 && IM>=4, r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar el gateway',responsable_usuario_id:id('carla')}); const TID=r.j.tarea&&r.j.tarea.id;
r=await call(A,'POST',`/api/admin/usuarios/${id('carla')}/borrar`,{}); ok('con una tarea abierta en una sala no se elimina (409)', r.s===409 && /tarea abierta en una sala/.test(r.j.error), r.j);
r=await call(A,'POST',`/api/admin/usuarios/${id('ana')}/borrar`,{}); ok('quien dirige una sala abierta no se elimina (409)', r.s===409 && /dirige 1 sala de crisis abierta/.test(r.j.error), r.j);
await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas/${TID}`,{estado:'CANCELADA'});
r=await call(A,'POST',`/api/admin/usuarios/${id('carla')}/borrar`,{}); ok('con la tarea cancelada, Carla se elimina y la sala queda sin referencias rotas', r.s===200 && fkRotas()===0 && q1('select responsable_usuario_id r from incidente_tareas where id=?',TID).r===null, r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'CERRADO',causa_raiz:'Causa raíz de la prueba'});
r=await call(A,'POST',`/api/admin/usuarios/${id('ana')}/borrar`,{}); ok('con la sala cerrada, quien la abrió se elimina y la sala queda sin referencias rotas', r.s===200 && fkRotas()===0 && q1('select abierto_por a from incidentes_mayores where id=?',IM).a===null, r.j);

// ---------- Preparar demo: la numeración de las salas vuelve a empezar ----------
ok('antes de Preparar demo el contador está en la sala de la prueba', q1("select seq s from sqlite_sequence where name='incidentes_mayores'").s===IM, q1("select seq s from sqlite_sequence where name='incidentes_mayores'"));
const A2=await login('uriel','ClaveSegura123');
{ const rb=await call(A2,'POST','/api/admin/usuarios',{usuario:'bea',nombre:'Bea Analista',perfil:'ANALISTA',correo:'bea@helios.test'}); const c=await login('bea',rb.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:rb.j.clave_temporal,nueva:'Clavebea123456'}); ck.bea=await login('bea','Clavebea123456'); }
for (let vuelta=1; vuelta<=3; vuelta++) {
  await call(A2,'POST','/api/demo/preparar');
  ok('Preparar demo #'+vuelta+': quedan solo los 3 antecedentes importados y el contador en 3', n('select count(*) n from incidentes_mayores')===3 && q1("select seq s from sqlite_sequence where name='incidentes_mayores'").s===3 && n('select count(*) n from incidente_tareas')===0, q1("select seq s from sqlite_sequence where name='incidentes_mayores'"));
  for(let i=0;i<14;i++) await call(A2,'POST','/api/demo/siguiente');
  const ab=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, cliente_id, servicio_id, canal_id order by ventana_inicio").all().map(x=>x.alerta_id);
  const rr=await call(ck.bea,'POST','/api/incidentes',{alertas:[ab[0]]});
  ok('Preparar demo #'+vuelta+': la primera sala de la demo es IM-4', rr.s===200 && rr.j.incidente.codigo==='IM-4', rr.j);
}
// Aunque el contador interno de D1 (sqlite_sequence) no se pudiera reiniciar, el número sale del más alto que hay
{
  await call(A2,'POST','/api/demo/preparar');
  for(let i=0;i<14;i++) await call(A2,'POST','/api/demo/siguiente');
  db.prepare("UPDATE sqlite_sequence SET seq = 9 WHERE name = 'incidentes_mayores'").run();
  const ab=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, cliente_id, servicio_id, canal_id order by ventana_inicio").all().map(x=>x.alerta_id);
  const rr=await call(ck.bea,'POST','/api/incidentes',{alertas:[ab[0]]});
  ok('con el contador interno adelantado, la sala sigue siendo IM-4', rr.s===200 && rr.j.incidente.codigo==='IM-4', rr.j);
  const rr2=await call(ck.bea,'POST','/api/incidentes',{alertas:[ab[1]]});
  ok('y la siguiente es IM-5', rr2.s===200 && rr2.j.incidente.codigo==='IM-5', rr2.j);
}
ok('al final no quedan referencias rotas', fkRotas()===0);
console.log(fallas ? 'FALLAS: '+fallas : 'TODO OK');
