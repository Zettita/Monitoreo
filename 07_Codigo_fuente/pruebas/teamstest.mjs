import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de la sala de crisis en Teams (parche 70): avisos al canal (A) y chat de Teams de la sala (B).
// Teams es de mentira: se reemplaza fetch y se guarda lo que se le mandó.
const db = new DatabaseSync(process.argv[2]);
let consultas=0;
const mk=(sql)=>{consultas++;let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/\breturning\b/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const env={DB};
const WEBHOOK='https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=xyz';
const enviados=[]; let teamsFalla=null;
const fetchReal=globalThis.fetch;
globalThis.fetch=async(url,op)=>{
  const u=String(url instanceof Request?url.url:url);
  if(u.startsWith('https://prod-12.westus.logic.azure.com')){ enviados.push(JSON.parse(op.body)); if(teamsFalla) return new Response(teamsFalla,{status:500}); return new Response('',{status:202}); }
  return fetchReal(url,op);
};
const errores=[]; const consolaErr=console.error; console.error=(m)=>errores.push(String(m));
const call=async(ck,m,p,body)=>{
  const h={cookie:ck||''}; if(body!==undefined)h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://helios.test'+p,{method:m,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined&&!c?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,400)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const q1=(sql,...a)=>db.prepare(sql).get(...a);
const n=(sql,...a)=>db.prepare(sql).get(...a).n;
const tarjeta=(m)=>m.attachments[0].content;
const textos=(m)=>tarjeta(m).body.map(b=>b.text).join('\n');

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Mesa','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('carla')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
const MESA=q1("select id from equipos where nombre='Mesa'").id, PAGOS=q1("select id from equipos where nombre='Pagos'").id;
db.prepare("update usuarios set correo=null where usuario='carla'").run();   // una persona de antes, sin correo
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<20;i++) await call(A,'POST','/api/demo/siguiente');   // escena 20: se cae el gateway de pagos
let r;
const grupos=db.prepare("select alerta_id, cliente_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' and servicio_id='PAGO_SERVICIOS' group by tipo_alerta, cliente_id, canal_id order by severidad_maxima='CRITICA' desc, ventana_inicio").all();
const A1=grupos.find(g=>g.cliente_id==='CLI_006').alerta_id, A2=grupos.find(g=>g.cliente_id==='CLI_002').alerta_id;

// ---------- Sin el secreto: nada ----------
consultas=0;
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[A1]}); const IM=r.j.incidente.id;
ok('sin TEAMS_WEBHOOK la sala se abre y no se manda nada a Teams', r.s===200 && enviados.length===0);
const consultasSin=consultas;
r=await call(A,'GET','/api/admin/teams'); ok('Administración: sin conectar', r.s===200 && r.j.configurado===false && r.j.cargado===false, r.j);
r=await call(A,'POST','/api/admin/teams/probar',{}); ok('aviso de prueba sin secreto = 409 con qué falta', r.s===409 && /TEAMS_WEBHOOK/.test(r.j.error), r.j);
env.TEAMS_WEBHOOK='https://ejemplo.com/hook';
r=await call(A,'GET','/api/admin/teams'); ok('una dirección que no es de Microsoft no se usa', r.j.configurado===false && r.j.cargado===true, r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/notas`,{texto:'Prueba con una dirección que no es de Teams.'});
ok('…y no se le manda nada', r.s===200 && enviados.length===0);
r=await call(ck.ana,'GET','/api/admin/teams'); ok('el Analista no ve la configuración de Teams (403)', r.s===403);

// ---------- A · Con el secreto ----------
env.TEAMS_WEBHOOK=WEBHOOK;
r=await call(A,'GET','/api/admin/teams'); ok('Administración: conectado', r.j.configurado===true, r.j);
r=await call(A,'POST','/api/admin/teams/probar',{}); ok('aviso de prueba al canal y auditoría TEAMS_PRUEBA', r.s===200 && enviados.length===1 && textos(enviados[0]).includes('aviso de prueba') && n("select count(*) n from auditoria where accion='TEAMS_PRUEBA'")===1, r.j);
enviados.length=0;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/alertas`,{alertas:[A2]});
ok('sumar una alerta: una tarjeta al canal', r.s===200 && enviados.length===1, enviados.length);
let m=enviados[0], t=tarjeta(m);
ok('formato de Workflows: mensaje con una tarjeta adaptable 1.4', m.type==='message' && m.attachments[0].contentType==='application/vnd.microsoft.card.adaptive' && t.type==='AdaptiveCard' && t.version==='1.4');
ok('la tarjeta dice la sala, quién y qué', textos(m).includes('IM-'+IM) && textos(m).includes('**Ana Lista**: Sumó la alerta') && textos(m).includes('CLI_002'), textos(m));
ok('botón "Abrir sala en Helios" con el enlace a la sala', t.actions[0].title==='Abrir sala en Helios' && t.actions[0].url==='https://helios.test/incidente/'+IM, t.actions);
ok('sala grave abierta: en rojo', /^🔴 IM-/.test(t.body[1].text) && t.body[1].color==='Attention', t.body[1]);

enviados.length=0;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/notas`,{texto:'Las notas quedan en Helios.'}); ok('las notas no van al canal', r.s===200 && enviados.length===0);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar errores del gateway de pagos',responsable_usuario_id:id('sol'),componente_id:5});
const T1=r.j.tarea.id;
ok('tarea nueva: al canal', r.s===200 && enviados.length===1 && textos(enviados[0]).includes('Asignó la tarea «Revisar errores del gateway de pagos» a Sol Porte'), enviados.map(textos));
enviados.length=0;
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'EN_CURSO'}); ok('"empezó la tarea" no va al canal', r.s===200 && enviados.length===0);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'HECHA',resultado:'Certificado del gateway vencido, se renovó.'});
ok('tarea hecha: al canal, con lo que se encontró y quién', r.s===200 && enviados.length===1 && textos(enviados[0]).includes('**Sol Porte**') && textos(enviados[0]).includes('Certificado del gateway vencido'), enviados.map(textos));
enviados.length=0;
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Soporte no crea',responsable_usuario_id:id('sol')}); ok('un pedido rechazado (403) no manda nada', r.s===403 && enviados.length===0);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Consultar al proveedor de cobranza',equipo_id:PAGOS}); const T2=r.j.tarea.id;
enviados.length=0;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/escalar`,{equipo_id:PAGOS,motivo:'Hace 30 minutos que no se aprueba ningún pago.'});
ok('escalamiento: al canal', r.s===200 && enviados.length===1 && textos(enviados[0]).includes('Escaló a'), enviados.map(textos));
enviados.length=0;
r=await call(ck.ana,'POST',`/api/alertas/${A1}/comunicar`,{personas:[id('gero')],mensaje:'Tenemos un incidente con los pagos de servicios de CLI_006.'});
ok('comunicar el incidente desde la alerta: al canal de la sala', r.s===200 && enviados.length===1 && /omunic/.test(textos(enviados[0])), enviados.map(textos));
enviados.length=0;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'MITIGADO'});
ok('servicio restablecido: al canal, y la tarjeta ya no va en rojo', r.s===200 && enviados.length===1 && textos(enviados[0]).includes('Mitigado') && !/^🔴/.test(tarjeta(enviados[0]).body[1].text), enviados.map(textos));

// Teams falla: Helios sigue igual
enviados.length=0; teamsFalla='Workflow disabled'; errores.length=0;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'ABIERTO'});
ok('si Teams falla, el cambio igual se hace y queda en el registro', r.s===200 && q1('select estado from incidentes_mayores where id=?',IM).estado==='ABIERTO' && errores.some(e=>/^Teams: Teams respondió 500/.test(e)), errores);
teamsFalla=null;
r=await call(A,'POST','/api/admin/teams/probar',{}); ok('prueba con Teams andando de nuevo', r.s===200);
teamsFalla='x'; r=await call(A,'POST','/api/admin/teams/probar',{}); ok('aviso de prueba con Teams caído = 502 con el motivo', r.s===502 && /500/.test(r.j.error), r.j); teamsFalla=null;

// Costo: 2 consultas más por POST de la sala, nada en los GET
consultas=0; enviados.length=0;
await call(ck.ana,'POST',`/api/incidentes/${IM}/notas`,{texto:'Otra nota para medir.'});
const conTeams=consultas;
delete env.TEAMS_WEBHOOK; consultas=0;
await call(ck.ana,'POST',`/api/incidentes/${IM}/notas`,{texto:'Otra nota para medir.'});
ok('con el secreto, cada POST de la sala cuesta 2 consultas más', conTeams-consultas===2, [conTeams, consultas]);
env.TEAMS_WEBHOOK=WEBHOOK; enviados.length=0;
await call(ck.ana,'GET',`/api/incidentes/${IM}`); await call(ck.ana,'POST',`/api/alertas/${A1}/comentar`,{comentario:'Comentario común en la alerta.'});
ok('ni los GET ni las otras acciones de la alerta mandan a Teams', enviados.length===0);

// ---------- B · Chat en Teams ----------
r=await call(ck.ana,'GET',`/api/incidentes/${IM}`); let tc=r.j.teams_chat;
ok('chat (Analista): Sol (tarea) y Pedro (equipo Pagos), sin quien mira', tc && tc.correos.sort().join()==='pedro@helios.test,sol@helios.test' && !tc.correos.includes('ana@helios.test'), tc);
r=await call(ck.gero,'GET',`/api/incidentes/${IM}`); tc=r.j.teams_chat;
ok('chat (Gerente): también la Analista que abrió la sala', tc.correos.includes('ana@helios.test') && tc.correos.length===3, tc);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Mirar el balanceador de entrada',equipo_id:MESA});
r=await call(ck.ana,'GET',`/api/incidentes/${IM}`); tc=r.j.teams_chat;
ok('una tarea al equipo Mesa suma a Sol y avisa que Carla no tiene correo', tc.correos.length===2 && tc.sin_correo.join()==='Carla Mesa', tc);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas/${T2}`,{estado:'CANCELADA'});
r=await call(ck.ana,'GET',`/api/incidentes/${IM}`); tc=r.j.teams_chat;
ok('cancelar una tarea no saca a quien sigue en otra (Pedro, por el escalamiento)', tc.correos.includes('pedro@helios.test'), tc);
r=await call(ck.ana,'GET',`/incidente/${IM}`);
ok('la página de la sala tiene el botón "Chat en Teams" con el enlace de Teams', r.s===200 && r.t.includes('function chatTeams') && r.t.includes('https://teams.microsoft.com/l/chat/0/0?users='));
r=await call(A,'GET','/admin'); ok('Administración tiene "Avisos en Teams"', r.t.includes('id="teams-panel"') && r.t.includes('/api/admin/teams/probar'));

// Sala de otro cliente sin nadie más: lista vacía
r=await call(ck.gero,'GET','/api/incidentes/1'); ok('un antecedente importado: chat sin nadie con correo (no hay gente en la sala)', r.s===200 && r.j.teams_chat.correos.length===0, r.j.teams_chat);

console.error=consolaErr;
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
