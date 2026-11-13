import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de los avisos en Teams (patch30): sin el secreto no hace nada; con el secreto, un mensaje por acción
// (no uno por persona), los tipos que corresponden, formato de tarjeta, direcciones permitidas, prueba desde
// Administración y que una falla de Teams no rompa la acción. Teams se simula.
const db = new DatabaseSync(process.argv[2]);
let consultas = 0;
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){consultas++;return{results:db.prepare(sql).all(...b),meta:{}}},async first(){consultas++;return db.prepare(sql).get(...b)??null},async run(){consultas++;const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){consultas++;const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/returning/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};

// Teams simulado
const URL_OK = 'https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?api-version=2016-06-01&sig=xyz';
const mensajes = []; let teamsFalla = false;
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.startsWith('https://prod-12.westus.logic.azure.com')) {
    if (teamsFalla) return new Response('falla', { status: 500 });
    mensajes.push(JSON.parse(op.body)); return new Response('', { status: 202 });
  }
  mensajes.push({ otro: url }); return new Response('no', { status: 404 });
};
let env = { DB };
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://helios.ejemplo.com'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{waitUntil(){}});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,300)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const textos=(m)=>JSON.stringify(m.attachments[0].content.body);

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123'); const ck={ADMIN:A};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['pedro','Pedro Pagos','SOPORTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('pedro')]});
const EQ=(n)=>db.prepare('select id from equipos where nombre=?').get(n).id;

// ---------- Sin el secreto: no hace nada ----------
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<8;i++) await call(A,'POST','/api/demo/siguiente');
ok('sin TEAMS_WEBHOOK no se manda nada a Teams', mensajes.length===0, mensajes.length);
let r=await call(A,'GET','/api/admin/teams'); ok('estado: sin conectar', r.j.configurado===false && r.j.cargado===false, r.j);
r=await call(A,'POST','/api/admin/teams/probar',{}); ok('probar sin secreto: lo explica', r.s===409 && /TEAMS_WEBHOOK/.test(r.j.error), r.j);
// La consulta extra solo se paga con el secreto
consultas=0; await call(ck.ana,'POST','/api/avisos/leer-todos',{}); const sinTeams=consultas;

// ---------- Dirección que no es de Microsoft: no se usa ----------
env = { DB, TEAMS_WEBHOOK: 'https://atacante.com/webhook' };
r=await call(A,'GET','/api/admin/teams'); ok('dirección ajena: cargada pero no se usa', r.j.configurado===false && r.j.cargado===true, r.j);
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' and estado<>'RESUELTA'").get().alerta_id;
await call(ck.ana,'POST',`/api/alertas/${AL}/comentar`,{comentario:'x'});
ok('…y no se le manda nada', mensajes.length===0, mensajes);

// ---------- Con el secreto ----------
env = { DB, TEAMS_WEBHOOK: URL_OK };
r=await call(ck.ana,'GET','/api/admin/teams'); ok('analista no ve la configuración de Teams', r.s===403);
r=await call(A,'GET','/api/admin/teams'); ok('estado: conectado', r.j.configurado===true, r.j);
r=await call(ck.ana,'POST','/api/admin/teams/probar',{}); ok('analista no puede mandar la prueba', r.s===403);
r=await call(A,'POST','/api/admin/teams/probar',{});
ok('prueba desde Administración: llega al canal', r.s===200 && mensajes.length===1 && /Aviso de prueba/.test(textos(mensajes[0])), r.j);
ok('formato de tarjeta adaptable para Workflows, con botón "Abrir Helios"', mensajes[0].type==='message' && mensajes[0].attachments[0].contentType==='application/vnd.microsoft.card.adaptive' && mensajes[0].attachments[0].content.type==='AdaptiveCard' && mensajes[0].attachments[0].content.actions[0].url==='https://helios.ejemplo.com/inicio', mensajes[0]);
ok('la prueba queda en auditoría', db.prepare("select count(*) n from auditoria where accion='TEAMS_PRUEBA'").get().n===1);

// Derivar al equipo (2 personas): un solo mensaje, con a quién le llegó
mensajes.length=0;
r=await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:EQ('Mesa'),comentario:'Revisen el conector'});
ok('derivar a un equipo de 2: UN mensaje (no uno por persona)', r.s===200 && mensajes.length===1, mensajes.length);
const t1=textos(mensajes[0]);
ok('…dice a quién se asignó, qué pasa y a quién le llegó', /Alerta asignada a equipo Mesa/.test(t1) && /Suben los rechazos · CLI_004, Transferencias por API/.test(t1) && /Sol Porte/.test(t1) && /Pedro Pagos/.test(t1), t1);
ok('…con el comentario del analista', /Revisen el conector/.test(t1));
// Comentar: no va a Teams
mensajes.length=0;
await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{comentario:''});
await call(ck.sol,'POST',`/api/alertas/${AL}/comentar`,{comentario:'Mirando'});
ok('tomar y comentar no se mandan a Teams', mensajes.length===0, mensajes.map(textos));
// Devolver
r=await call(ck.sol,'POST',`/api/alertas/${AL}/devolver`,{comentario:'No es de Mesa'});
ok('devolver: un mensaje con el motivo', mensajes.length===1 && /Devolvieron una alerta/.test(textos(mensajes[0])) && /No es de Mesa/.test(textos(mensajes[0])), mensajes.map(textos));
// Resolver (el analista)
mensajes.length=0;
await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{usuario_id:id('pedro')});
mensajes.length=0;
r=await call(ck.ana,'POST',`/api/alertas/${AL}/resolver`,{comentario:'Falsa alarma'});
ok('resolver: un mensaje "Alerta resuelta por" con el comentario', r.s===200 && mensajes.length===1 && /Alerta resuelta por Ana Lista/.test(textos(mensajes[0])) && /Falsa alarma/.test(textos(mensajes[0])), mensajes.map(textos));

// Escenas de la demo: lo grave sin asignar llega marcado como urgente
mensajes.length=0; consultas=0;
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
const todos=mensajes.map(textos).join(' ');
ok('demo: llegan las graves sin asignar, en rojo', /🔴 Alerta grave sin asignar/.test(todos) && mensajes.some(m=>m.attachments[0].content.body.some(b=>b.items&&b.items[0].color==='Attention')), mensajes.length);
ok('demo: como mucho un mensaje por escena', mensajes.length<=14, mensajes.length);
ok('cada mensaje tiene como mucho 6 hechos', mensajes.every(m=>m.attachments[0].content.body.filter(b=>b.type==='Container').length<=6));

// Pre-alerta avisada a Soporte
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<6;i++) await call(A,'POST','/api/demo/siguiente');
r=await call(ck.ana,'GET','/api/dashboard'); const pre=r.j.prealertas.find(p=>p.activa===1);
mensajes.length=0;
r=await call(ck.ana,'POST','/api/prealertas/avisar',{tipo_prealerta:pre.tipo_prealerta,ambiente:pre.ambiente,cliente_id:pre.cliente_id,servicio_id:pre.servicio_id,producto_id:pre.producto_id,canal_id:pre.canal_id,moneda_id:pre.moneda_id,equipo_id:EQ('Mesa'),comentario:'Ojo con el conector'});
const tp=mensajes.length?textos(mensajes[0]):'';
ok('pre-alerta avisada: un mensaje con qué pasa, quién avisó y a qué equipo', r.s===200 && mensajes.length===1 && /Pre-alerta avisada a Soporte/.test(tp) && /CLI_004/.test(tp) && /Avisó Ana Lista al equipo Mesa/.test(tp) && /Ojo con el conector/.test(tp), tp);

// Costo: con el secreto, solo 2 consultas más por POST
consultas=0; await call(ck.ana,'POST','/api/avisos/leer-todos',{});
ok('con el secreto: como mucho 2 consultas más por pedido', consultas-sinTeams<=2, [sinTeams, consultas]);
ok('un pedido sin avisos nuevos no manda nada', mensajes.length===1);

// Si Teams falla, la acción igual se hace
teamsFalla=true;
for (let i=0;i<2;i++) await call(A,'POST','/api/demo/siguiente');
const AL2=db.prepare("select alerta_id from alertas_historico where estado='ABIERTA' and severidad<>'BAJA'").get().alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${AL2}/derivar`,{equipo_id:EQ('Mesa')});
ok('si Teams falla, derivar igual funciona', r.s===200 && db.prepare('select asignado_equipo_id e from alertas_historico where alerta_id=?').get(AL2).e===EQ('Mesa'), r.j);
r=await call(A,'POST','/api/admin/teams/probar',{}); ok('probar con Teams caído: avisa el error', r.s===502 && /500/.test(r.j.error), r.j);
teamsFalla=false;

// La pantalla de Administración tiene el recuadro
r=await worker.fetch(new Request('https://helios.ejemplo.com/admin',{headers:{cookie:A}}),env,{waitUntil(){}}); const html=await r.text();
ok('Administración > Equipos: recuadro "Avisos en Teams"', /Avisos en Teams/.test(html) && /btn-teams-probar/.test(html) && /TEAMS_PRUEBA/.test(html));

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
