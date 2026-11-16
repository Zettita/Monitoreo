import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del dashboard gerencial, parte 1 (parche 42): el Gerente y el Administrador ven lo activo y el detalle, en solo lectura.
//   - Ven la lista de alertas activas (con su estado y quién las tiene), el detalle completo y la evidencia.
//   - No pueden cambiar nada: tomar, derivar, comentar, devolver, resolver, adjuntar, correo (el servidor lo rechaza aunque lo pidan).
//   - Soporte sigue viendo solo lo suyo. El marcador de revisión (GET /api/tablero/version) cambia con cada revisión.
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body,extra)=>{
  const h=Object.assign({cookie:ck||''},extra&&extra.headers||{});
  if(body!==undefined&&!(extra&&extra.crudo))h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:(extra&&extra.crudo?body:JSON.stringify(body)),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null,h:r.headers};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;

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
const MESA=db.prepare("select id from equipos where nombre='Mesa'").get().id;
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<8;i++) await call(A,'POST','/api/demo/siguiente');
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id;
let r;

// Alguien la trabaja: derivada a Sol, tomada y con un comentario y un archivo
await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA,usuario_id:id('sol'),comentario:'Sol, revisá el conector'});
await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{});
await call(ck.sol,'POST',`/api/alertas/${AL}/comentar`,{comentario:'Llamé al cliente, me pasan los logs'});
r=await call(ck.sol,'POST',`/api/alertas/${AL}/adjuntos`,new TextEncoder().encode('10:40 ERROR timeout\n'),{crudo:true,headers:{'x-nombre-archivo':encodeURIComponent('gateway.log'),'content-type':'application/octet-stream'}});
const archivo=r.j.id; ok('sol subió un archivo', r.s===200, r.j);

// ---- Permisos ----
r=await call(ck.gero,'GET','/api/yo');
ok('el Gerente tiene lista de alertas y detalle, y no tiene acciones ni Seguimiento', ['tablero','alertas_abiertas','detalle_alerta'].every(p=>r.j.permisos.includes(p)) && !['derivar','accion_alerta','seguimiento','mis_alertas','avisar_prealerta'].some(p=>r.j.permisos.includes(p)), r.j.permisos);
r=await call(A,'GET','/api/yo'); ok('el Administrador tiene el detalle pero tampoco acciones', r.j.permisos.includes('detalle_alerta') && !r.j.permisos.includes('derivar') && !r.j.permisos.includes('accion_alerta'));

// ---- Lo que ve el Gerente ----
r=await call(ck.gero,'GET','/api/dashboard');
const ab=(r.j.abiertas||[]).filter(a=>a.alerta_id===AL||a.cliente_id==='CLI_004');
ok('el tablero del Gerente trae las alertas activas con su asignación', r.s===200 && ab.length>0 && ab.some(a=>a.asignado_nombre==='Sol Porte' && a.estado==='RECONOCIDA'), ab.map(a=>a.asignado_nombre+':'+a.estado));
ok('…y los eventos (conversación) y las pre-alertas', Array.isArray(r.j.eventos) && r.j.eventos.some(e=>e.accion==='TOMAR') && Array.isArray(r.j.prealertas));
r=await call(ck.gero,'GET','/'); ok('la página del tablero tiene la lista y la actualización automática', r.s===200 && r.t.includes('id="bloque-alertas"') && r.t.includes('/api/tablero/version'));
r=await call(ck.gero,'GET',`/alerta/${AL}`); ok('el Gerente abre la página de detalle', r.s===200 && r.t.includes('Solo lectura'));
r=await call(ck.gero,'GET',`/api/alertas/${AL}/detalle`);
ok('el detalle del Gerente: conversación, datos y ventanas, con todos los botones apagados', r.s===200 && r.j.puedo.lectura===true && Object.entries(r.j.puedo).every(([k,v])=>k==='lectura'?v===true:v===false) && r.j.eventos.length>=3 && r.j.ventanas.length>=1, r.j.puedo);
ok('…y ve la evidencia que subió Sol', r.j.adjuntos.some(a=>a.nombre_archivo==='gateway.log' && a.usuario_nombre==='Sol Porte'));
ok('…sin plantillas de correo (no puede armar correos)', Array.isArray(r.j.plantillas_correo) && r.j.plantillas_correo.length===0);
r=await call(ck.gero,'GET',`/api/alertas/${AL}/adjuntos/${archivo}`); ok('el Gerente puede abrir el archivo', r.s===200 && /ERROR timeout/.test(r.t||''), r.s);
r=await call(ck.gero,'GET',`/api/alertas/${AL}/historial`); ok('y el historial', r.s===200 && r.j.eventos.length>=3);
r=await call(ck.gero,'GET','/seguimiento'); ok('el Gerente sigue sin Seguimiento', r.s===302);
r=await call(A,'GET',`/api/alertas/${AL}/detalle`); ok('el Administrador ve lo mismo en lectura', r.s===200 && r.j.puedo.lectura===true && r.j.adjuntos.length>=1);
r=await call(A,'GET','/seguimiento'); ok('Seguimiento del Administrador ofrece "Ver detalle" a quien tiene el detalle', r.t.includes("puedo('detalle_alerta')"));

// ---- No pueden cambiar nada (el servidor lo rechaza aunque lo pidan) ----
const intentos=[
  ['tomar',['POST',`/api/alertas/${AL}/tomar`,{}]],['derivar',['POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA}]],
  ['comentar',['POST',`/api/alertas/${AL}/comentar`,{comentario:'hola'}]],['devolver',['POST',`/api/alertas/${AL}/devolver`,{comentario:'no'}]],
  ['resolver',['POST',`/api/alertas/${AL}/resolver`,{comentario:'listo ya', causa_id:1, acciones_ids:[6]}]],
  ['reconocer',['POST',`/api/alertas/${AL}/reconocer`,{}]],
  ['correo',['POST',`/api/alertas/${AL}/correo`,{}]],['envío de correo',['POST',`/api/alertas/${AL}/correo/envio`,{}]],
  ['borrar archivo',['POST',`/api/alertas/${AL}/adjuntos/${archivo}/borrar`,{}]],
];
for (const [quien,c] of [['Gerente',ck.gero],['Administrador',A]]) {
  const res=[]; for (const [n,[m,p,b]] of intentos) { const x=await call(c,m,p,b); res.push([n,x.s]); }
  ok(quien+': ninguna acción pasa (todas 403)', res.every(([,s])=>s===403), res.filter(([,s])=>s!==403));
  const x=await call(c,'POST',`/api/alertas/${AL}/adjuntos`,new TextEncoder().encode('x'),{crudo:true,headers:{'x-nombre-archivo':'a.txt','content-type':'application/octet-stream'}});
  ok(quien+': no puede adjuntar', x.s===403, x.s);
}
const estado=db.prepare("select estado, asignado_usuario_id u from alertas_historico where alerta_id=?").get(AL);
ok('la alerta no cambió: sigue en curso con Sol', estado.estado==='RECONOCIDA' && estado.u===id('sol'), estado);
ok('y no se agregaron comentarios ni archivos', db.prepare("select count(*) n from alerta_eventos e where e.alerta_id=? and e.accion='COMENTAR' and e.comentario in ('hola')").get(AL).n===0);

// ---- Soporte sigue viendo solo lo suyo; Analista todo ----
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/detalle`); ok('Soporte de otro equipo sigue sin ver la alerta', r.s===403);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('Sol la ve y puede trabajarla', r.s===200 && r.j.puedo.comentar===true && !r.j.puedo.lectura);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('el Analista la ve completa', r.s===200 && r.j.puedo.derivar===true && !r.j.puedo.lectura);

// ---- Marcador de revisión (actualización automática) ----
r=await call(ck.gero,'GET','/api/tablero/version'); const v1=r.j.revision;
ok('el marcador responde (1 fila) para el Gerente', r.s===200 && typeof v1==='string' && v1.length>10, r.j);
r=await call(ck.gero,'GET','/api/dashboard'); ok('el tablero trae el mismo marcador en sus parámetros', r.j.parametros.revision===v1, r.j.parametros);
r=await call(ck.sol,'GET','/api/tablero/version'); ok('Soporte no lo usa (403)', r.s===403);
r=await call('','GET','/api/tablero/version'); ok('sin sesión (401)', r.s===401);
await call(A,'POST','/api/demo/siguiente');
r=await call(ck.gero,'GET','/api/tablero/version'); ok('después de una revisión el marcador cambia (el tablero se recarga solo)', r.j.revision!==v1, [v1,r.j.revision]);
const d2=await call(ck.gero,'GET','/api/dashboard');
r=await call(ck.gero,'GET','/api/tablero/version'); ok('y al recargar coincide otra vez', d2.j.parametros.revision===r.j.revision);

// ---- Asistente ----
r=await call(ck.gero,'GET','/api/asistente');
ok('el Gerente tiene la pregunta "¿Qué incidentes están activos y quién los está trabajando?"', (r.j.sugerencias||[]).some(s=>s.id==='activas_ahora'), (r.j.sugerencias||[]).map(s=>s.id));
r=await call(A,'GET','/api/asistente'); ok('y el Administrador también', (r.j.sugerencias||[]).some(s=>s.id==='activas_ahora'));
r=await call(ck.ana,'GET','/api/asistente'); ok('el Analista no la necesita: tiene las suyas', !(r.j.sugerencias||[]).some(s=>s.id==='activas_ahora'));

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
