import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de la ticketera (parche 30): página y datos del detalle, permisos por perfil, evidencia en R2 (simulado),
// resolución con causa y acciones del catálogo, catálogo editable por el Administrador y enlaces de los avisos.
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
let r;

// Página y permisos
r=await call(ck.sol,'GET',`/alerta/${AL}`); ok('página de detalle para soporte', r.s===200 && r.t.includes('Ventanas con problema') && r.t.includes('id="toast"'));
r=await call(ck.gero,'GET',`/alerta/${AL}`); ok('gerente no tiene detalle (redirige)', r.s===302);
r=await call(A,'GET',`/api/alertas/${AL}/detalle`); ok('administrador no tiene detalle', r.s===403);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('soporte no ve lo que no es suyo', r.s===403, r.j.error);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('analista ve el detalle', r.s===200 && r.j.ventanas.length===2 && r.j.causas.length===5 && r.j.acciones.length===4, {v:r.j.ventanas&&r.j.ventanas.length});
ok('analista: derivar y resolver, no tomar', r.j.puedo.derivar && r.j.puedo.resolver && r.j.puedo.comentar && r.j.puedo.adjuntar && !r.j.puedo.tomar);
await call(ck.ana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA,comentario:'Revisen el conector'});
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('sol (equipo) ve el detalle y puede tomar', r.s===200 && r.j.puedo.tomar && !r.j.puedo.resolver && r.j.eventos.length===1);
r=await call(ck.carla,'GET',`/api/alertas/${AL}/detalle`); ok('carla (responsable) puede tomar', r.j.puedo.tomar && !r.j.puedo.reasignar===false);
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/detalle`); ok('pedro (otro equipo) no ve el detalle', r.s===403);
await call(ck.sol,'POST',`/api/alertas/${AL}/tomar`,{});
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('sol en curso: resolver y devolver', r.j.puedo.resolver && r.j.puedo.devolver && !r.j.puedo.tomar);

// Evidencia
r=await subir(ck.sol,AL,'captura del error.png',new Uint8Array([137,80,78,71,1,2,3]));
ok('sol sube una captura', r.s===200 && r.j.tamano_bytes===7, r.j);
r=await subir(ck.sol,AL,'log del gateway.log',new TextEncoder().encode('ERROR 503 en /pagos\n'));
ok('sol sube un log', r.s===200);
r=await subir(ck.sol,AL,'pagina.html',new TextEncoder().encode('<script>alert(1)</script>')); ok('HTML no se acepta', r.s===400, r.j.error);
r=await subir(ck.sol,AL,'dibujo.svg',new TextEncoder().encode('<svg/>')); ok('SVG no se acepta', r.s===400);
r=await subir(ck.sol,AL,'vacio.txt',new Uint8Array(0)); ok('archivo vacío = 400', r.s===400, r.j.error);
r=await subir(ck.sol,AL,'grande.pdf',new Uint8Array(10*1024*1024+1)); ok('más de 10 MB = 413', r.s===413, r.j.error);
r=await subir(ck.pedro,AL,'ajeno.txt',new TextEncoder().encode('x')); ok('pedro no adjunta', r.s===403);
r=await subir(ck.gero,AL,'g.txt',new TextEncoder().encode('x')); ok('gerente no adjunta', r.s===403);
ok('en R2 quedan 2 archivos', r2.size===2, [...r2.keys()]);
ok('en D1 nada más que el comentario del historial', db.prepare("select count(*) n from alerta_eventos where comentario like 'Adjuntó el archivo «%'").get().n===2 && !db.prepare("select name from sqlite_master where name in ('alerta_adjuntos','alerta_resoluciones','catalogo_resolucion')").get());
ok('los archivos van en la carpeta de la primera ventana', [...r2.keys()].every(k=>k.startsWith('alertas/'+AL+'/')));
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); const adj=r.j.adjuntos;
ok('el detalle lista la evidencia', adj.length===2 && adj[0].nombre_archivo==='captura del error.png' && adj[0].usuario_nombre==='Sol Porte', adj);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/adjuntos/${adj[1].id}`); ok('descarga el log', r.s===200 && r.t.includes('ERROR 503') && r.h.get('x-content-type-options')==='nosniff' && /inline/.test(r.h.get('content-disposition')), r.h.get('content-disposition'));
r=await call(ck.ana,'GET',`/api/alertas/${AL}/adjuntos/${adj[0].id}`); ok('analista ve la captura (image/png)', r.s===200 && r.h.get('content-type')==='image/png');
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/adjuntos/${adj[0].id}`); ok('pedro no la descarga', r.s===403);
r=await call(ck.carla,'GET',`/api/alertas/${AL}/adjuntos/${adj[0].id}`); ok('carla (equipo) sí', r.s===200);
const av=db.prepare("select usuario_id, texto from avisos where texto like '%adjuntó evidencia%'").all();
ok('aviso a quien derivó (ana)', av.some(x=>x.usuario_id===id('ana')) && !av.some(x=>x.usuario_id===id('sol')), av);
r=await call(ck.carla,'POST',`/api/alertas/${AL}/adjuntos/${adj[0].id}/borrar`,{}); ok('carla no borra lo de sol', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/adjuntos/${adj[1].id}/borrar`,{}); ok('sol borra su log (y queda en el historial)', r.s===200 && r2.size===1 && db.prepare("select count(*) n from alerta_eventos where comentario='Borró el archivo «log del gateway.log»'").get().n===1);
// Sin R2: la evidencia va a D1 (tabla evidencia_archivos, en pedazos de 90 KB)
env={DB};
const grandeD1=new Uint8Array(200000).map((_,i)=>i%251);
r=await subir(ck.sol,AL,'volcado.log',grandeD1); const idD1=r.j.id;
ok('sin R2: sube a D1 en 3 pedazos', r.s===200 && db.prepare("select count(*) n from evidencia_archivos where clave like '%/'||?").get(idD1).n===3, r.j);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`);
ok('sin R2: el detalle lista lo de D1 (tope 1 MB)', r.j.evidencia_habilitada===true && r.j.adjunto_max_mb===1 && r.j.adjuntos.length===1 && r.j.adjuntos[0].nombre_archivo==='volcado.log' && r.j.adjuntos[0].tamano_bytes===200000 && r.j.adjuntos[0].usuario_nombre==='Sol Porte', r.j.adjuntos);
r=await call(ck.carla,'GET',`/api/alertas/${AL}/adjuntos/${idD1}`,undefined,{bin:true});
ok('sin R2: se descarga idéntico', r.s===200 && r.bin && r.bin.length===200000 && r.bin.every((v,i)=>v===grandeD1[i]));
r=await call(ck.pedro,'GET',`/api/alertas/${AL}/adjuntos/${idD1}`,undefined,{bin:true}); ok('sin R2: pedro no lo descarga', r.s===403);
r=await subir(ck.sol,AL,'enorme.pdf',new Uint8Array(1024*1024+1)); ok('sin R2: más de 1 MB = 413', r.s===413, r.j.error);
const casi=new Uint8Array(1024*1024).map((_,i)=>(i*31)%256); r=await subir(ck.sol,AL,'justo.zip',casi); const idJ=r.j.id; ok('sin R2: 1 MB justo entra (16 pedazos de base64)', r.s===200 && db.prepare("select count(*) n from evidencia_archivos where clave like '%/'||?").get(idJ).n===16, r.j);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/adjuntos/${idJ}`,undefined,{bin:true}); ok('sin R2: el de 1 MB vuelve idéntico', r.bin && r.bin.length===casi.length && r.bin.every((v,i)=>v===casi[i]));
await call(ck.sol,'POST',`/api/alertas/${AL}/adjuntos/${idJ}/borrar`,{});
r=await call(ck.carla,'POST',`/api/alertas/${AL}/adjuntos/${idD1}/borrar`,{}); ok('sin R2: carla no borra lo de sol', r.s===403);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/adjuntos/${idD1}/borrar`,{}); ok('sin R2: sol lo borra de D1', r.s===200 && db.prepare('select count(*) n from evidencia_archivos').get().n===0);
db.exec('DROP TABLE evidencia_archivos');
r=await subir(ck.sol,AL,'otra.png',new Uint8Array([1])); ok('sin R2 ni tabla: avisa que falta el script 14', r.s===503 && /14_evidencia/.test(r.j.error), r.j.error);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('sin R2 ni tabla: el detalle lo indica', r.s===200 && r.j.evidencia_habilitada===false);
db.exec("CREATE TABLE IF NOT EXISTS evidencia_archivos ( clave TEXT NOT NULL, parte INTEGER NOT NULL, datos TEXT NOT NULL, tipo_contenido TEXT, metadatos TEXT, tamano_bytes INTEGER, subido INTEGER, PRIMARY KEY (clave, parte) ) WITHOUT ROWID");
env={DB,EVIDENCIA};

// Resolver con causa
const op=JSON.parse(db.prepare('select opciones_resolucion o from alerta_parametros where id=1').get().o); const cat=op.causas.concat(op.acciones);
const C=(n)=>cat.find(x=>x.nombre.startsWith(n)).id;
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{causa_id:C('Proveedor')}); ok('solo causa, sin qué se hizo ni detalle = 400', r.s===400, r.j.error);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{causa_id:9999,acciones_ids:[C('Se escaló')]}); ok('causa inexistente = 400', r.s===400, r.j.error);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{causa_id:C('Se escaló'),acciones_ids:[C('Se escaló')]}); ok('una acción como causa = 400', r.s===400);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/resolver`,{causa_id:C('Proveedor'),acciones_ids:[C('Se contactó'),C('Se escaló')]});
ok('resuelve con causa y dos acciones, sin detalle', r.s===200, r.j);
const res=db.prepare("select distinct causa_resolucion c, acciones_resolucion a from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004'").all();
ok('causa y acciones en sus columnas (todas las ventanas)', res.length===1 && res[0].c==='Proveedor o gateway' && res[0].a==='Se contactó al cliente · Se escaló', res);
const h=db.prepare("select estado, comentario from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004'").all();
ok('las otras pantallas ven el texto armado', h.every(x=>x.estado==='RESUELTA' && x.comentario==='Causa: Proveedor o gateway. Se hizo: se contactó al cliente, se escaló.'), h[0]);
r=await call(ck.sol,'GET',`/api/alertas/${AL}/detalle`); ok('el detalle muestra la resolución y ya no permite actuar', r.j.resolucion && r.j.resolucion.causa==='Proveedor o gateway' && r.j.resolucion.acciones.length===2 && r.j.resolucion.comentario===null && !r.j.puedo.comentar && !r.j.puedo.adjuntar && !r.j.puedo.resolver);
r=await call(ck.sol,'POST',`/api/alertas/${AL}/adjuntos/${adj[0].id}/borrar`,{}); ok('no se borra evidencia de una resuelta', r.s===409);
r=await subir(ck.sol,AL,'tarde.png',new Uint8Array([1])); ok('no se adjunta a una resuelta', r.s===409);
// Resolver a la vieja (asistente, otros clientes): sigue andando con solo el texto
await sig(1);
const AL2=db.prepare("select alerta_id from alertas_historico where estado in ('ABIERTA','RECONOCIDA') and severidad<>'BAJA' order by ventana_inicio").get().alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${AL2}/resolver`,{comentario:'Falsa alarma, lo confirmó el cliente'}); ok('resolver solo con texto sigue funcionando', r.s===200, r.j);
ok('sin causa: columnas vacías y el texto tal cual', db.prepare('select causa_resolucion c, comentario t from alertas_historico where alerta_id=?').get(AL2).c===null);
r=await call(ck.ana,'GET',`/api/alertas/${AL2}/detalle`); ok('el detalle muestra ese texto', r.j.resolucion && r.j.resolucion.causa===null && r.j.resolucion.comentario==='Falsa alarma, lo confirmó el cliente', r.j.resolucion);

// Catálogo
r=await call(ck.ana,'GET','/api/admin/catalogo-resolucion'); ok('analista no edita el catálogo', r.s===403);
r=await call(A,'GET','/api/admin/catalogo-resolucion'); ok('admin ve el catálogo con usos', r.s===200 && r.j.items.find(x=>x.nombre==='Proveedor o gateway').usos===1 && r.j.items.find(x=>x.nombre==='Se escaló').usos===1);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{tipo:'CAUSA',nombre:'Mantenimiento programado'}); ok('admin agrega una causa', r.s===200);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{tipo:'CAUSA',nombre:'Mantenimiento programado'}); ok('repetida = 409', r.s===409, r.j.error);
const fa=C('Falsa alarma');
r=await call(A,'POST','/api/admin/catalogo-resolucion',{id:fa,nombre:'Falsa alarma',activo:0}); ok('admin desactiva Falsa alarma', r.s===200);
r=await call(ck.ana,'GET',`/api/alertas/${AL}/detalle`); ok('el diálogo ya no la ofrece y suma la nueva', !r.j.causas.some(x=>x.nombre==='Falsa alarma') && r.j.causas.some(x=>x.nombre==='Mantenimiento programado'));
ok('queda en auditoría', db.prepare("select count(*) n from auditoria where accion='EDITAR_CATALOGO_RESOLUCION'").get().n===2);
ok('las opciones viven en alerta_parametros', JSON.parse(db.prepare('select opciones_resolucion o from alerta_parametros where id=1').get().o).causas.length===6);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{id:C('Se escaló'),nombre:'Se escaló a sistemas',activo:1}); ok('renombrar una acción', r.s===200);
ok('lo ya resuelto conserva el nombre anterior', db.prepare("select count(*) n from alertas_historico where acciones_resolucion like '%Se escaló%' and acciones_resolucion not like '%sistemas%'").get().n>0);
r=await call(A,'POST','/api/admin/catalogo-resolucion',{tipo:'ACCION',nombre:'Uno · dos'}); ok('nombre con · = 400', r.s===400);

// Páginas y avisos llevan al detalle
r=await call(ck.sol,'GET','/mis-alertas'); ok('Mis alertas tiene "Ver detalle" y Resolver va al detalle', r.t.includes("href=\\\"/alerta/' + g.id + '\\\">Ver detalle") || r.t.includes('">Ver detalle</a>') && r.t.includes('?resolver'));
r=await call(ck.ana,'GET','/seguimiento'); ok('Seguimiento tiene "Ver detalle"', r.t.includes('Ver detalle</a>'));
r=await call(A,'GET','/admin'); ok('Administración tiene el catálogo', r.t.includes('id="cat-CAUSA"'));
r=await call(ck.ana,'GET','/api/avisos'); ok('campanita: avisos con alerta_id para ir al detalle', (r.j.avisos||[]).some(a=>a.alerta_id), (r.j.avisos||[]).length);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
