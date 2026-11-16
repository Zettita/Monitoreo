import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de Comunicar incidente (parche 46): perfil "Solo comunicados", listas de difusión, comunicados, Recibido y respuestas.
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
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Lider','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE'],['laura','Laura Atencion','COMUNICADOS'],['juan','Juan Negocio','COMUNICADOS']]) {
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
const OTRA=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and tipo_alerta='ERROR_ALTO' order by ventana_inicio").get().alerta_id;
let r;

// ---------- Perfil "Solo comunicados" ----------
const fila=(u)=>db.prepare('select perfil, solo_comunicados from usuarios where usuario=?').get(u);
ok('"Solo comunicados" se guarda como GERENTE + solo_comunicados', fila('laura').perfil==='GERENTE' && fila('laura').solo_comunicados===1 && fila('gero').solo_comunicados===0);
r=await call(A,'GET','/api/admin/usuarios'); ok('Administración lo muestra como "Solo comunicados"', r.j.usuarios.find(u=>u.usuario==='laura').perfil==='COMUNICADOS' && r.j.usuarios.find(u=>u.usuario==='gero').perfil==='GERENTE');
r=await call(ck.laura,'GET','/api/yo'); ok('su sesión es perfil COMUNICADOS, con comunicados y campanita, sin tablero', r.j.usuario.perfil==='COMUNICADOS' && r.j.permisos.includes('comunicados') && r.j.permisos.includes('avisos') && !r.j.permisos.includes('tablero') && !r.j.permisos.includes('asistente'), r.j.permisos);
r=await call(ck.laura,'GET','/'); ok('"/" la lleva a /comunicados', r.s===302 && /\/comunicados$/.test(r.h.get('location')||''), r.h.get('location'));
r=await call(ck.laura,'GET','/api/dashboard'); ok('no ve el tablero', r.s===403);
r=await call(ck.laura,'GET','/mis-alertas'); ok('Mis alertas la redirige', r.s===302);
r=await call(ck.laura,'GET',`/alerta/${AL}`); ok('no entra al detalle de una alerta', r.s===302);
r=await call(ck.laura,'GET','/comunicados'); ok('su página de comunicados', r.s===200 && r.t.includes('Comunicados de incidentes') && r.t.includes('id="toast"'));
r=await call(A,'GET','/comunicados'); ok('el administrador no tiene comunicados (redirige)', r.s===302);
r=await call(ck.gero,'GET','/api/avisos/contador'); ok('el Gerente ahora tiene campanita (para los comunicados)', r.j.habilitado===true);
r=await call(A,'POST',`/api/admin/usuarios/${id('juan')}`,{perfil:'SOPORTE'});
ok('cambiar de "Solo comunicados" a Soporte limpia la marca', (r.s===200) && fila('juan').perfil==='SOPORTE' && fila('juan').solo_comunicados===0, r.j);
r=await call(A,'POST',`/api/admin/usuarios/${id('juan')}`,{perfil:'COMUNICADOS'});
ok('y volver a "Solo comunicados"', r.s===200 && fila('juan').perfil==='GERENTE' && fila('juan').solo_comunicados===1);
ck.juan=await login('juan','Clavejuan123456');

// ---------- Listas de difusión ----------
r=await call(ck.ana,'GET','/api/admin/listas-difusion'); ok('el analista no arma listas', r.s===403);
r=await call(A,'GET','/api/admin/listas-difusion'); ok('admin: personas (sin administradores) y clientes', r.s===200 && r.j.listas.length===0 && !r.j.usuarios.some(u=>u.id===id('uriel')) && r.j.usuarios.find(u=>u.id===id('laura')).perfil==='COMUNICADOS' && r.j.clientes.includes('CLI_004'), r.j.clientes);
r=await call(A,'POST','/api/admin/listas-difusion',{nombre:'Vacía',miembros:[]}); ok('sin personas = 400', r.s===400);
r=await call(A,'POST','/api/admin/listas-difusion',{nombre:'Con admin',miembros:[{usuario_id:id('uriel'),rol:'TECNICO'}]}); ok('un administrador no se puede sumar', r.s===400);
const L1=(await call(A,'POST','/api/admin/listas-difusion',{nombre:'Atención al cliente',miembros:[{usuario_id:id('laura'),rol:'INFORMADO'},{usuario_id:id('gero'),rol:'LIDER'}]})).j.id;
const L2=(await call(A,'POST','/api/admin/listas-difusion',{nombre:'Guardia técnica',miembros:[{usuario_id:id('sol'),rol:'TECNICO'},{usuario_id:id('carla'),rol:'TECNICO'},{usuario_id:id('ana'),rol:'TECNICO'}]})).j.id;
const L3=(await call(A,'POST','/api/admin/listas-difusion',{nombre:'Negocio CLI_004',cliente_id:'CLI_004',miembros:[{usuario_id:id('juan'),rol:'LIDER'},{usuario_id:id('sol'),rol:'LIDER'}]})).j.id;
ok('tres listas creadas', L1===1 && L2===2 && L3===3);
r=await call(A,'POST','/api/admin/listas-difusion',{nombre:'guardia técnica',miembros:[{usuario_id:id('sol'),rol:'TECNICO'}]}); ok('nombre repetido = 409', r.s===409);
ok('auditoría ALTA_LISTA_DIFUSION', db.prepare("select count(*) n from auditoria where accion='ALTA_LISTA_DIFUSION'").get().n===3);

// ---------- Comunicar ----------
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`);
ok('detalle: las listas de la alerta (primero la del cliente) y puede comunicar', r.j.puedo.comunicar===true && r.j.listas_difusion.map(l=>l.id).join()==='3,1,2' && r.j.listas_difusion[0].por_rol.LIDER===2, r.j.listas_difusion);
r=await call(ck.ana,'GET',`/api/alertas/${OTRA}/detalle`); ok('en una alerta de otro cliente no aparece la lista de CLI_004', r.j.listas_difusion.map(l=>l.id).join()==='1,2');
r=await call(ck.gero,'POST',`/api/alertas/${AL}/comunicar`,{listas:[1],mensaje:'Tenemos un incidente de prueba'}); ok('el Gerente (solo lectura) no comunica', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/comunicar`,{listas:[1],mensaje:'Tenemos un incidente de prueba'}); ok('Soporte sin la alerta asignada no', r.s===403);
r=await call(ck.laura,'POST',`/api/alertas/${AL}/comunicar`,{listas:[1],mensaje:'Tenemos un incidente de prueba'}); ok('"Solo comunicados" no', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/comunicar`,{listas:[],mensaje:'Tenemos un incidente de prueba'}); ok('sin listas = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${OTRA}/comunicar`,{listas:[3],mensaje:'Tenemos un incidente de prueba'}); ok('una lista de otro cliente = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${AL}/comunicar`,{listas:[1],mensaje:'corto'}); ok('mensaje corto = 400', r.s===400);
const MSG='Tenemos un incidente: suben los rechazos en Transferencias de CLI_004.\nTicket: INV-1001 (InvGate)\nYa lo estamos revisando.';
r=await call(ck.ana,'POST',`/api/alertas/${AL}/comunicar`,{listas:[1,2,3],mensaje:MSG});
ok('comunica a 5 personas (sin Ana, que está en una lista); sol como técnico', r.s===200 && r.j.comunicado.personas===5 && r.j.comunicado.por_rol.TECNICO===2 && r.j.comunicado.por_rol.LIDER===2 && r.j.comunicado.por_rol.INFORMADO===1, r.j);
const CID=r.j.comunicado.id;
const dest=db.prepare('select usuario_id, rol from comunicado_destinatarios where comunicado_id=? order by usuario_id').all(CID);
ok('destinatarios y roles', dest.length===5 && dest.find(x=>x.usuario_id===id('sol')).rol==='TECNICO' && dest.find(x=>x.usuario_id===id('laura')).rol==='INFORMADO' && !dest.some(x=>x.usuario_id===id('ana')));
const av=db.prepare("select usuario_id, tipo, alerta_id, texto from avisos where tipo like 'COMUNICADO_%'").all();
ok('un aviso por persona, con su rol, que lleva al comunicado', av.length===5 && av.every(a=>a.alerta_id==='c'+CID) && av.find(a=>a.usuario_id===id('carla')).tipo==='COMUNICADO_TECNICO' && /^Incidente: Suben los rechazos · CLI_004, Transferencias por /.test(av[0].texto), av[0]);
ok('queda en la conversación y en la auditoría', db.prepare("select count(*) n from alerta_eventos where comentario like ?").get('Comunicó el incidente (comunicado '+CID+') a Atención al cliente, Guardia técnica, Negocio CLI_004 (5 personas)%').n===1 && db.prepare("select count(*) n from auditoria where accion='COMUNICAR_INCIDENTE'").get().n===1);
r=await call(ck.laura,'GET','/api/avisos/contador'); ok('campanita de Laura: 1 aviso', r.j.habilitado && r.j.no_leidos===1);
r=await call('','GET','/sw.js'); ok('el service worker tiene "Recibido" y "Responder"', r.t.includes("e.action === 'recibido'") && r.t.includes('/recibido') && r.t.includes("'?responder'") && r.t.includes('actions: a.acciones'));

// ---------- Ver, Recibido y responder ----------
r=await call(ck.laura,'GET',`/api/comunicados/${CID}`);
ok('Laura (informada) lo ve: solo leer', r.s===200 && r.j.comunicado.mi_rol==='INFORMADO' && !r.j.comunicado.puedo.recibido && !r.j.comunicado.puedo.responder && r.j.comunicado.mensaje===MSG && r.j.comunicado.alerta.id===null && r.j.comunicado.alerta.cliente_id==='CLI_004', r.j.comunicado && r.j.comunicado.alerta);
ok('queda como visto', !!db.prepare('select visto from comunicado_destinatarios where comunicado_id=? and usuario_id=?').get(CID,id('laura')).visto);
r=await call(ck.pedro,'GET',`/api/comunicados/${CID}`); ok('a Pedro no le llegó: 403', r.s===403);
r=await call(ck.ana,'GET',`/api/comunicados/${CID}`); ok('Ana (quien comunicó) lo ve, con el enlace a la alerta', r.s===200 && r.j.comunicado.alerta.id===AL && r.j.comunicado.destinatarios.length===5);
r=await call(ck.laura,'POST',`/api/comunicados/${CID}/recibido`,{}); ok('la informada no da Recibido', r.s===403);
r=await call(ck.sol,'POST',`/api/comunicados/${CID}/recibido`,{}); ok('Sol (técnico) da Recibido', r.s===200 && !!db.prepare('select recibido from comunicado_destinatarios where comunicado_id=? and usuario_id=?').get(CID,id('sol')).recibido);
r=await call(ck.sol,'POST',`/api/comunicados/${CID}/recibido`,{}); ok('dos veces no pasa nada', r.s===200 && r.j.ya===true);
ok('y su aviso queda leído', db.prepare("select leido from avisos where usuario_id=? and alerta_id=?").get(id('sol'),'c'+CID).leido===1);
r=await call(ck.laura,'POST',`/api/comunicados/${CID}/responder`,{texto:'hola'}); ok('la informada no responde', r.s===403);
r=await call(ck.juan,'POST',`/api/comunicados/${CID}/responder`,{texto:'Además tengo este mensaje de error: TRX-503 en el homebanking. ¿Podrán verlo?'});
ok('Juan (líder) responde sumando información: va a la conversación', r.s===200 && db.prepare("select count(*) n from alerta_eventos where usuario_id=? and comentario=?").get(id('juan'),'Respondió al comunicado '+CID+' como líder: Además tengo este mensaje de error: TRX-503 en el homebanking. ¿Podrán verlo?').n===1);
ok('a Ana le llega el aviso de la respuesta', db.prepare("select count(*) n from avisos where usuario_id=? and tipo='COMENTARIO' and texto like '%respondió al comunicado%'").get(id('ana')).n===1);
r=await call(ck.carla,'POST',`/api/comunicados/${CID}/responder`,{texto:'Lo estoy mirando con el proveedor'}); ok('Carla (técnica) responde y eso cuenta como Recibido', r.s===200 && !!db.prepare('select recibido from comunicado_destinatarios where comunicado_id=? and usuario_id=?').get(CID,id('carla')).recibido);
r=await call(ck.juan,'GET',`/api/comunicados/${CID}`); ok('el comunicado muestra las 2 respuestas con su rol', r.j.comunicado.respuestas.length===2 && r.j.comunicado.respuestas[0].rol==='LIDER' && r.j.comunicado.respuestas[0].texto.startsWith('Además') && r.j.comunicado.respuestas[1].rol==='TECNICO');
r=await call(ck.juan,'GET','/api/comunicados'); ok('la lista de Juan', r.j.comunicados.length===1 && r.j.comunicados[0].rol==='LIDER' && r.j.comunicados[0].problema==='Suben los rechazos');
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); const cc=r.j.comunicados[0];
ok('el detalle de la alerta resume el comunicado', cc.id===CID && cc.personas===5 && cc.tecnicos===2 && cc.recibidos===2 && cc.vistos>=4, cc);
r=await call(ck.ana,'GET',`/alerta/${AL}`); ok('la página del detalle trae "Comunicar incidente"', r.t.includes('id="dlg-comunicar"') && r.t.includes('Comunicar incidente') && r.t.includes('<i class="cmi"></i>Comunicado'));
r=await call(A,'GET','/admin'); ok('Administración: perfil, pestaña de listas y auditoría', r.t.includes('value="COMUNICADOS"') && r.t.includes("{ id: 'listas', txt: 'Listas de difusión', permiso: 'admin_listas' }") && r.t.includes("COMUNICAR_INCIDENTE: 'Comunicó un incidente'"));

// ---------- Preparar demo y sin el script 21 ----------
await call(A,'POST','/api/demo/preparar'); ok('Preparar demo borra los comunicados', db.prepare('select count(*) n from comunicados_incidente').get().n===0 && db.prepare('select count(*) n from comunicado_destinatarios').get().n===0);
db.exec('DROP TABLE comunicado_destinatarios; DROP TABLE comunicados_incidente; ALTER TABLE usuarios DROP COLUMN solo_comunicados; ALTER TABLE alerta_parametros DROP COLUMN listas_difusion');
r=await call(ck.ana,'GET','/api/yo'); ok('sin el script 21 el ingreso sigue andando', r.s===200 && r.j.usuario.perfil==='ANALISTA');
r=await call(A,'GET','/api/admin/usuarios'); ok('y la lista de usuarios', r.s===200 && r.j.usuarios.length>5);
r=await call(A,'POST','/api/admin/usuarios',{usuario:'nuevo',nombre:'Nuevo Comunicado',perfil:'COMUNICADOS'}); ok('crear "Solo comunicados" avisa que falta el script (503)', r.s===503 && /21_comunicados_d1/.test(r.j.error), r.j.error);
r=await call(A,'POST','/api/admin/usuarios',{usuario:'nuevo2',nombre:'Nuevo Soporte',perfil:'SOPORTE'}); ok('los demás perfiles se crean igual', r.s===200);
r=await call(A,'GET','/api/admin/listas-difusion'); ok('listas: avisa que falta el script', r.s===200 && r.j.falta_script===true);
await sig(8);
const AL5=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id;
r=await call(ck.ana,'GET',`/api/alertas/${AL5}/detalle`); ok('el detalle anda (sin listas)', r.s===200 && r.j.listas_difusion===null && r.j.comunicados.length===0);
r=await call(ck.ana,'POST',`/api/alertas/${AL5}/comunicar`,{listas:[1],mensaje:'Tenemos un incidente de prueba'}); ok('comunicar avisa que falta el script (503)', r.s===503);

console.log(fallas?`${fallas} FALLAS`:'TODO OK');
