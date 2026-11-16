import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
// Copia del Worker con una integración de mentira, para probar el modo real sin InvGate ni Jira
const w = fs.readFileSync(new URL('../worker/w.mjs', import.meta.url), 'utf8');
const INTEG = w
  .replace("throw new Error('La integración con InvGate todavía no está terminada", "globalThis.__recibido = datos; if (datos.resumen.includes('FALLA')) throw new Error('InvGate no respondió (prueba).'); return { clave: 'INV-' + (4500 + (globalThis.__n = (globalThis.__n || 0) + 1)), url: 'https://invgate.ejemplo/requests/' + globalThis.__n, estado: 'Nuevo' }; throw new Error('")
  .replace("async function rutasTicketsIntegracion(env, request, ruta) {\n  return null;\n}", "async function rutasTicketsIntegracion(env, request, ruta) {\n  if (ruta !== '/api/integraciones/invgate' || request.headers.get('x-clave') !== 'secreta') return null;\n  const b = await request.json(); const ok = await novedadTicket(env, 'INVGATE', b.clave, b);\n  return Response.json({ ok });\n}");
if (INTEG === w || !INTEG.includes("globalThis.__recibido") || !INTEG.includes("x-clave")) throw new Error('no se pudo armar la integración de mentira');
fs.writeFileSync(new URL('./w_integ.mjs', import.meta.url), INTEG);
const normal = (await import('../worker/w.mjs')).default, conInteg = (await import('./w_integ.mjs')).default;
let worker = normal;
// (el Worker se importa más abajo: uno normal y una copia con una integración de mentira)
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
// R2 simulado: guarda en memoria lo que el Worker sube
const r2=new Map();
const EVIDENCIA={async put(k,v,o){r2.set(k,{datos:new Uint8Array(v),tipo:o&&o.httpMetadata&&o.httpMetadata.contentType,custom:(o&&o.customMetadata)||{},subido:new Date()});},async get(k){const x=r2.get(k);return x?{body:x.datos,httpMetadata:{contentType:x.tipo},customMetadata:x.custom,size:x.datos.length}:null;},async head(k){const x=r2.get(k);return x?{key:k,httpMetadata:{contentType:x.tipo},customMetadata:x.custom,size:x.datos.length}:null;},async delete(k){r2.delete(k);},async list(o){return{objects:[...r2.entries()].filter(([k])=>k.startsWith(o.prefix)).map(([k,x])=>({key:k,size:x.datos.length,uploaded:x.subido,httpMetadata:{contentType:x.tipo},customMetadata:x.custom}))};}};
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
let env={DB,EVIDENCIA};
const call=async(ck,m,p,body,extra)=>{
  const h=Object.assign({cookie:ck||''},extra&&extra.headers||{});
  if(body!==undefined&&!(extra&&extra.crudo))h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:(extra&&extra.crudo?body:JSON.stringify(body)),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const bin=extra&&extra.bin&&!ct.includes('json')?new Uint8Array(await r.arrayBuffer()):null;
  const j=!bin&&ct.includes('json')?await r.json():null;const t=j||bin?null:await r.text();
  return{s:r.status,j:j||{},t,bin,ck:sc?sc.split(';')[0]:null,h:r.headers};
};
const subir=(ck,al,nombre,contenido)=>call(ck,'POST',`/api/alertas/${al}/adjuntos`,contenido,{crudo:true,headers:{'x-nombre-archivo':encodeURIComponent(nombre),'content-type':'application/octet-stream'}});
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
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
await sig(8);
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id;
const AL_2=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio desc").get().alerta_id;
const OTRA=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and tipo_alerta='ERROR_ALTO' order by ventana_inicio").get().alerta_id;
const tickets=()=>db.prepare('select * from tickets_alerta order by id').all();
let r;

// Página y datos
r=await call(ck.ana,'GET',`/alerta/${AL}`); ok('la página trae "Generar ticket" y el diálogo', r.t.includes('id="dlg-ticket"') && r.t.includes('Generar ticket') && r.t.includes('id="m-ticket"'));
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`);
ok('detalle: sin tickets, las dos herramientas en simulado, puede generar', r.s===200 && r.j.tickets.length===0 && r.j.puedo.ticket===true && JSON.stringify(r.j.tickets_sistemas)==='[{"id":"INVGATE","nombre":"InvGate","modo":"simulado"},{"id":"JIRA","nombre":"Jira","modo":"simulado"}]', r.j.tickets_sistemas);
ok('la plantilla General trae {ticket}', r.j.plantillas_correo.find(p=>p.nombre==='General').cuerpo.includes('- Ticket: {ticket}'));
r=await call(A,'GET','/admin'); ok('Administración: variable {ticket} y auditoría', r.t.includes("['ticket', 'Ticket (número y herramienta)']") && r.t.includes("GENERAR_TICKET: 'Generó un ticket'"));

// Permisos
r=await call(ck.gero,'POST',`/api/alertas/${AL}/ticket`,{sistema:'INVGATE',resumen:'Prueba gerente'}); ok('gerente no genera tickets', r.s===403);
r=await call(A,'POST',`/api/alertas/${AL}/ticket`,{sistema:'INVGATE',resumen:'Prueba admin'}); ok('administrador no', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/ticket`,{sistema:'INVGATE',resumen:'Prueba sol'}); ok('soporte sin la alerta asignada no', r.s===403);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/ticket`); ok('GET no existe', r.s===404 || r.s===405);

// Simulado
r=await call(ck.ana,'POST',`/api/alertas/${AL}/ticket`,{sistema:'SAP',resumen:'Rechazos altos CLI_004'}); ok('herramienta inválida = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/ticket`,{sistema:'INVGATE',resumen:'abc'}); ok('resumen corto = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/ticket`,{sistema:'INVGATE',resumen:'[P2 · Importante] CLI_004: Suben los rechazos',descripcion:'Qué pasa: …',prioridad:'P2'});
let t=tickets();
ok('InvGate simulado: INV-1001', r.s===200 && r.j.ticket.clave==='INV-1001' && r.j.ticket.simulado===1 && t.length===1 && t[0].alerta_id===AL && t[0].estado==='Abierto' && t[0].simulado===1, r.j);
ok('queda en la conversación y en la auditoría', db.prepare("select count(*) n from alerta_eventos where comentario='Generó el ticket INV-1001 en InvGate (simulado)'").get().n===1 && db.prepare("select count(*) n from auditoria where accion='GENERAR_TICKET'").get().n===1);
r=await call(ck.ana,'POST',`/api/alertas/${AL_2}/ticket`,{sistema:'INVGATE',resumen:'Otro InvGate del mismo problema'}); ok('uno por herramienta y por problema (desde otra ventana) = 409', r.s===409 && /INV-1001/.test(r.j.error), r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/ticket`,{sistema:'JIRA',resumen:'Rechazos altos CLI_004 (desarrollo)'}); ok('Jira simulado: HEL-101', r.s===200 && r.j.ticket.clave==='HEL-101');
r=await call(ck.ana,'GET',`/api/alertas/${AL_2}/detalle`); ok('el detalle de cualquier ventana del problema trae los 2 tickets', r.j.tickets.length===2 && r.j.tickets[0].clave==='INV-1001' && r.j.tickets[0].creado_por_nombre==='Ana Lista');
await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA});
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('sol (equipo) ve los tickets y puede generar', r.j.tickets.length===2 && r.j.puedo.ticket===true);
r=await call(ck.ana,'POST',`/api/alertas/${OTRA}/ticket`,{sistema:'INVGATE',resumen:'Errores técnicos CLI_002'}); ok('otro problema: INV-1002', r.s===200 && r.j.ticket.clave==='INV-1002');

// Modo real sin la integración terminada: avisa y no guarda nada
const antes=tickets().length;
env.TICKETS_JIRA='real';
r=await call(ck.ana,'POST',`/api/alertas/${OTRA}/ticket`,{sistema:'JIRA',resumen:'Errores técnicos CLI_002'}); ok('Jira real sin secretos = 502 con aviso, sin guardar', r.s===502 && /Falta configurar la conexión con Jira/.test(r.j.error) && tickets().length===antes, r.j.error);
r=await call(ck.ana,'GET',`/api/alertas/${OTRA}/detalle`); ok('el detalle dice que Jira está en real', r.j.tickets_sistemas.find(x=>x.id==='JIRA').modo==='real');
delete env.TICKETS_JIRA;

// Modo real con una integración de mentira (lo que va a completar el equipo)
worker=conInteg; env.TICKETS_INVGATE='real';
const AL3=db.prepare("select alerta_id from alertas_historico where tipo_alerta not in ('RECHAZO_ALTO','ERROR_ALTO') order by ventana_inicio").get().alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${AL3}/ticket`,{sistema:'INVGATE',resumen:'FALLA a propósito'}); ok('si la integración falla: 502 con su mensaje, sin guardar', r.s===502 && r.j.error==='InvGate no respondió (prueba).' && tickets().length===antes);
r=await call(ck.ana,'POST',`/api/alertas/${AL3}/ticket`,{sistema:'INVGATE',resumen:'Caída en la alerta 3',descripcion:'detalle',prioridad:'P1'});
const rec=globalThis.__recibido||{};
ok('real: guarda la clave y el enlace que devuelve', r.s===200 && r.j.ticket.clave==='INV-4501' && r.j.ticket.url==='https://invgate.ejemplo/requests/1' && r.j.ticket.simulado===0 && r.j.ticket.estado==='Nuevo', r.j);
ok('la integración recibe los datos del contrato', rec.resumen==='Caída en la alerta 3' && rec.descripcion==='detalle' && rec.prioridad==='P1' && rec.alerta_id===AL3 && /^https:\/\/x\/alerta\/[0-9a-f]{32}$/.test(rec.enlace) && rec.solicitante.nombre==='Ana Lista' && rec.cliente_id && rec.tipo_alerta && rec.desde, rec);
ok('en la conversación, sin "simulado"', db.prepare("select count(*) n from alerta_eventos where comentario='Generó el ticket INV-4501 en InvGate'").get().n===1);
// Novedad desde la herramienta (webhook de mentira)
r=await call('','POST','/api/integraciones/invgate',{clave:'INV-4501',estado:'En curso',comentario:'Lo toma la mesa N2'},{headers:{'x-clave':'secreta'}});
ok('webhook: actualiza el estado y deja la novedad en la conversación', r.s===200 && r.j.ok===true && db.prepare("select estado from tickets_alerta where clave='INV-4501'").get().estado==='En curso' &&
  db.prepare("select count(*) n from alerta_eventos where usuario_id is null and comentario='Novedad del ticket INV-4501 en InvGate: pasó a \"En curso\". Lo toma la mesa N2'").get().n===1);
r=await call('','POST','/api/integraciones/invgate',{clave:'INV-4501',estado:'Cerrado'}); ok('webhook sin la clave secreta: no entra', r.s!==200 || r.j.ok!==true);
r=await call('','POST','/api/integraciones/otra',{}); ok('una ruta de integración que no existe pide sesión', r.s===401 || r.s===302 || r.s===404, r.s);
worker=normal; delete env.TICKETS_INVGATE;

// Preparar demo borra los tickets; sin el script 19 avisa
await call(A,'POST','/api/demo/preparar'); ok('Preparar demo borra los tickets', tickets().length===0);
await sig(8);
const AL4=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${AL4}/ticket`,{sistema:'INVGATE',resumen:'Después de preparar la demo'}); ok('la numeración simulada vuelve a INV-1001', r.j.ticket && r.j.ticket.clave==='INV-1001');
db.exec('DROP TABLE tickets_alerta');
r=await call(ck.ana,'GET',`/api/alertas/${AL4}/detalle`); ok('sin el script 19: el detalle anda, sin tickets', r.s===200 && r.j.tickets.length===0);
r=await call(ck.ana,'POST',`/api/alertas/${AL4}/ticket`,{sistema:'JIRA',resumen:'Sin la tabla'}); ok('sin el script 19: "Generar ticket" avisa (503)', r.s===503 && /19_tickets_d1/.test(r.j.error));
r=await call(A,'POST','/api/demo/preparar'); ok('sin el script 19: Preparar demo igual anda', r.s===200);

fs.unlinkSync(new URL('./w_integ.mjs', import.meta.url));
console.log(fallas?`${fallas} FALLAS`:'TODO OK');
