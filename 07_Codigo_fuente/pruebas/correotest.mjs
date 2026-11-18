import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del correo desde la alerta (parches 39 y 40): permisos, registro en la conversación, confirmación del envío
// con los destinatarios reales y plantillas de correo (Administración).
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
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
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
let r;
const correos=()=>db.prepare("select id, usuario_id, comentario from alerta_eventos where comentario like 'Preparó un correo «%' order by id").all();
const envios=()=>db.prepare("select id, comentario from alerta_eventos where comentario like 'Envió el correo «%' or comentario like 'No envió el correo «%' order by id").all();

// Página
r=await call(ck.ana,'GET',`/alerta/${AL}`); ok('la página trae el botón y los diálogos', r.s===200 && r.t.includes('Template correo alerta') && !r.t.includes('Helios arma el borrador') && r.t.includes('id="m-plantilla"') && r.t.includes('id="e-para"') && r.t.includes('id="dlg-correo"') && r.t.includes('id="dlg-envio"') && r.t.includes('outlook.office.com/mail/deeplink/compose'));
r=await call(A,'GET','/admin'); ok('auditoría con nombres de las acciones nuevas', r.t.includes('Preparó un correo') && r.t.includes('Confirmó el envío de un correo'));

// Permisos
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('analista puede preparar correo', r.s===200 && r.j.puedo.correo===true);
r=await call(ck.gero,'POST',`/api/alertas/${AL}/correo`,{asunto:'Hola gerente'}); ok('gerente no', r.s===403);
r=await call(A,'POST',`/api/alertas/${AL}/correo`,{asunto:'Hola admin'}); ok('administrador no', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/correo`,{asunto:'Hola sol'}); ok('soporte sin la alerta asignada no', r.s===403);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/correo`); ok('GET no existe', r.s===404 || r.s===405);

// Preparar
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'[P2] CLI_004',para:['mesa@cliente.com','malo@'],texto:'x'}); ok('dirección mal escrita = 400', r.s===400 && /malo@/.test(r.j.error), r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:' ',para:[]}); ok('sin asunto = 400', r.s===400);
const T1='Hola,\n\n- Qué pasa: rechazos altos\n\nSaludos,\nAna Lista';
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'[P2 · Importante] CLI_004 «rechazos»',para:['mesa@cliente.com','mesa@cliente.com'],cc:['jefe@helios.com.ar'],texto:T1});
let c=correos(); ok('queda en la conversación con asunto, destinatarios y texto', r.s===200 && c.length===1 && c[0].comentario===`Preparó un correo «[P2 · Importante] CLI_004 rechazos» para mesa@cliente.com (copia a jefe@helios.com.ar)\n---\n${T1}`, c[0]&&c[0].comentario);
ok('auditoría PREPARAR_CORREO', db.prepare("select count(*) n from auditoria where accion='PREPARAR_CORREO'").get().n===1);
ok('no manda avisos', db.prepare("select count(*) n from avisos where texto like '%correo%'").get().n===0);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'[P2 · Importante] CLI_004 «rechazos»',para:['mesa@cliente.com'],cc:['jefe@helios.com.ar'],texto:T1});
ok('el mismo correo otra vez en 10 min no se repite', r.s===200 && r.j.repetido===true && correos().length===1);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'Largo',texto:'a'.repeat(9000)});
ok('el texto se corta en 6000 caracteres', r.s===200 && correos()[1].comentario.split('\n---\n')[1].length===6000);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('el detalle trae los correos en los eventos', r.j.eventos.filter(e=>e.comentario&&e.comentario.startsWith('Preparó un correo «')).length===2);

// Soporte
await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA});
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('sol (equipo) puede preparar correo', r.j.puedo.correo===true);
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/correo`,{asunto:'De pedro'}); ok('pedro (otro equipo) no', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/correo`,{asunto:'Aviso a proveedor',para:'gateway@proveedor.com; otro@proveedor.com',texto:'Hola proveedor'});
ok('sol prepara uno (Para como texto con ;)', r.s===200 && correos()[2].comentario.startsWith('Preparó un correo «Aviso a proveedor» para gateway@proveedor.com, otro@proveedor.com'));

// Confirmar envío
c=correos();
r=await call(ck.pedro,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'SIN_CAMBIOS'}); ok('pedro no confirma', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'TAL_VEZ'}); ok('resultado inválido = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:999999,resultado:'SIN_CAMBIOS'}); ok('correo inexistente = 404', r.s===404);
const otro=db.prepare("select id from alerta_eventos where accion='DERIVAR' order by id desc").get().id;
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:otro,resultado:'SIN_CAMBIOS'}); ok('un evento que no es correo = 404', r.s===404);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'SIN_CAMBIOS'}); ok('enviado sin decir a quién = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'SIN_CAMBIOS',para:'mal'}); ok('destinatario real mal escrito = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'CON_CAMBIOS',texto:'',para:'a@b.com'}); ok('con cambios sin texto = 400', r.s===400, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'CON_CAMBIOS',texto:'Texto final\ncorregido',para:['mesa@cliente.com','otra@cliente.com'],cc:'jefe@helios.com.ar'});
ok('con cambios: queda el texto final', r.s===200 && envios().slice(-1)[0].comentario==='Envió el correo «[P2 · Importante] CLI_004 rechazos» con cambios para mesa@cliente.com, otra@cliente.com (copia a jefe@helios.com.ar)\n---\nTexto final\ncorregido', envios());
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'SIN_CAMBIOS',para:'x@y.com'}); ok('no se confirma dos veces', r.s===409);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[2].id,resultado:'NO_ENVIADO'}); ok('sol: no se envió', r.s===200 && envios().slice(-1)[0].comentario==='No envió el correo «Aviso a proveedor»');
r=await call(ck.sol,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[1].id,resultado:'SIN_CAMBIOS',para:'real@cliente.com'}); ok('sol confirma el de ana (sin cambios, con el destinatario real)', r.s===200 && envios().slice(-1)[0].comentario==='Envió el correo «Largo» sin cambios para real@cliente.com', envios().slice(-1)[0]);
ok('auditoría CONFIRMAR_CORREO', db.prepare("select count(*) n from auditoria where accion='CONFIRMAR_CORREO'").get().n===3);

// Mismo asunto dos veces: cada confirmación es de un correo
await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'Repetido',texto:'uno'});
await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'Repetido',texto:'dos'});
c=correos().filter(x=>x.comentario.includes('«Repetido»'));
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[1].id,resultado:'SIN_CAMBIOS',para:'x@y.com'}); ok('confirma uno de los dos', r.s===200);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[0].id,resultado:'SIN_CAMBIOS',para:'x@y.com'}); ok('esa confirmación cuenta para el primero', r.s===409);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[1].id,resultado:'NO_ENVIADO'}); ok('el segundo todavía se puede confirmar', r.s===200);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo/envio`,{evento_id:c[1].id,resultado:'NO_ENVIADO'}); ok('y después ya no', r.s===409);

// Con la alerta resuelta también
await call(ck.ana,'POST',`/api/alertas/${AL}/resolver`,{comentario:'Se normalizó el conector'});
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('resuelta: sigue pudiendo preparar correo', r.j.puedo.correo===true && !r.j.puedo.comentar);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'[Resuelta] CLI_004',para:'mesa@cliente.com',texto:'cierre'}); ok('correo de cierre con la alerta resuelta', r.s===200);
ok('no hay tablas nuevas', !db.prepare("select name from sqlite_master where type='table' and name like '%correo%'").get());


// ---------- Plantillas de correo (parche 40) ----------
r=await call(A,'GET','/api/admin/plantillas-correo'); ok('admin ve las 6 de fábrica', r.s===200 && r.j.plantillas.length===6 && !r.j.falta_script, r.j.plantillas&&r.j.plantillas.map(p=>p.nombre));
r=await call(ck.ana,'GET','/api/admin/plantillas-correo'); ok('parche 63: el analista administra plantillas', r.s===200);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('el detalle trae las plantillas activas', r.j.plantillas_correo.length===6 && r.j.plantillas_correo[0].cuerpo.length>10);
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/detalle`); ok('quien no trabaja la alerta no las recibe', r.s===403 || (r.j.plantillas_correo||[]).length===0);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'Escalar a Seguridad',sector:'Seguridad',cuando:'ABIERTA',tipos:['ERROR_ALTO','RECHAZO_ALTO'],asunto:'Seguridad: {alerta}',cuerpo:'Hola,\n{problema}\nNovedad: {ultima_novedad}\n{firma}',activa:1});
ok('alta de una plantilla', r.s===200 && r.j.id===7, r.j);
ok('se guardan todas en alerta_parametros', JSON.parse(db.prepare('select plantillas_correo p from alerta_parametros where id=1').get().p).plantillas.length===7);
ok('auditoría ALTA_PLANTILLA_CORREO', db.prepare("select count(*) n from auditoria where accion='ALTA_PLANTILLA_CORREO'").get().n===1);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'Escalar a Seguridad',sector:'seguridad',cuando:'ABIERTA',asunto:'abc',cuerpo:'abc'}); ok('mismo nombre y sector = 409', r.s===409);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'X1',cuando:'NUNCA',asunto:'abc',cuerpo:'abc'}); ok('cuándo inválido = 400', r.s===400);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'X1',cuando:'TODAS',tipos:['no vale'],asunto:'abc',cuerpo:'abc'}); ok('tipo inválido = 400', r.s===400);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'X1',cuando:'TODAS',asunto:'',cuerpo:'abc'}); ok('sin asunto = 400', r.s===400);
r=await call(A,'POST','/api/admin/plantillas-correo',{id:7,nombre:'Escalar a Seguridad',sector:'Seguridad',cuando:'ABIERTA',tipos:['ERROR_ALTO'],asunto:'Seg: {alerta}',cuerpo:'Hola',activa:0});
ok('editar y apagar', r.s===200 && db.prepare('select plantillas_correo p from alerta_parametros where id=1').get().p.includes('"activa":0'));
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('la apagada no llega al detalle', r.j.plantillas_correo.length===6);
r=await call(A,'POST','/api/admin/plantillas-correo/borrar',{id:7}); ok('borrar', r.s===200 && JSON.parse(db.prepare('select plantillas_correo p from alerta_parametros where id=1').get().p).plantillas.length===6);
r=await call(A,'POST','/api/admin/plantillas-correo/borrar',{id:99}); ok('borrar inexistente = 404', r.s===404);
ok('auditoría de editar y borrar', db.prepare("select count(*) n from auditoria where accion in ('EDITAR_PLANTILLA_CORREO','BORRAR_PLANTILLA_CORREO')").get().n===2);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/correo`,{asunto:'Con plantilla',para:'a@b.com',texto:'t',plantilla:'Aviso al cliente'});
ok('el correo registra la plantilla usada', r.s===200 && correos().slice(-1)[0].comentario.startsWith('Preparó un correo «Con plantilla» para a@b.com con la plantilla "Aviso al cliente"'), correos().slice(-1)[0].comentario);
// Sin el script 18: usa las de fábrica y no deja guardar
db.exec('ALTER TABLE alerta_parametros DROP COLUMN plantillas_correo');
r=await call(A,'GET','/api/admin/plantillas-correo'); ok('sin script 18: muestra las de fábrica y avisa', r.s===200 && r.j.plantillas.length===6 && r.j.falta_script===true);
r=await call(A,'POST','/api/admin/plantillas-correo',{nombre:'X',cuando:'TODAS',asunto:'abc',cuerpo:'abc'}); ok('sin script 18: no guarda (503 con el aviso)', r.s===503 && /18_plantillas_correo_d1/.test(r.j.error));
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('sin script 18: el detalle igual trae las de fábrica', r.s===200 && r.j.plantillas_correo.length===6);
r=await call(A,'GET','/admin'); ok('la pestaña de plantillas está en Administración', r.t.includes('Plantillas de correo') && r.t.includes('id="dlg-plantilla"'));

console.log(fallas?`${fallas} FALLAS`:'TODO OK');
