import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del correo de cada usuario y de los contactos del correo de la alerta (parche 68).
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
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const CON = !process.env.SIN_SCRIPT_23;

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
let r;
const crear=(extra)=>call(A,'POST','/api/admin/usuarios',Object.assign({nombre:'Nombre',perfil:'SOPORTE'},extra));
const correoDe=(u)=>db.prepare('select correo from usuarios where usuario=?').get(u).correo;
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
const entrar=async(u,temp)=>{ const c=await login(u,temp); await call(c,'POST','/api/cambiar-clave',{actual:temp,nueva:'Clave'+u+'123456'}); return c; };
const alertaDemo=async()=>{ await call(A,'POST','/api/demo/preparar'); for(let i=0;i<8;i++) await call(A,'POST','/api/demo/siguiente');
  return db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id; };

if (CON) {
  // ---- Crear ----
  r=await crear({usuario:'sin1'}); ok('crear sin correo = 400', r.s===400 && /correo/i.test(r.j.error), r.j.error);
  r=await crear({usuario:'sin2',correo:'   '}); ok('correo en blanco = 400', r.s===400, r.j.error);
  for (const malo of ['juan','juan@','@x.com','juan@x','a b@x.com','juan@x.com,otro@x.com','<j@x.com>']) {
    r=await crear({usuario:'mal',correo:malo}); ok('correo mal escrito "'+malo+'" = 400', r.s===400 && /no es válido/.test(r.j.error), r.j.error);
  }
  ok('nada de lo anterior creó usuarios', db.prepare("select count(*) n from usuarios where usuario in ('sin1','sin2','mal')").get().n===0);
  r=await crear({usuario:'ana',nombre:'Ana Lista',perfil:'ANALISTA',correo:'  Ana.Lista@Helios.com.ar '}); ok('crear con correo', r.s===200 && !!r.j.clave_temporal);
  const tempAna=r.j.clave_temporal;
  ok('se guarda sin espacios y en minúsculas', correoDe('ana')==='ana.lista@helios.com.ar', correoDe('ana'));
  r=await crear({usuario:'otra',correo:'ANA.LISTA@helios.com.ar'}); ok('correo repetido (otras mayúsculas) = 409 con el nombre', r.s===409 && /Ana Lista/.test(r.j.error), r.j.error);
  r=await crear({usuario:'ana',correo:'x@helios.com.ar'}); ok('usuario repetido sigue siendo 409', r.s===409);
  ok('la auditoría de alta lleva el correo', db.prepare("select detalle from auditoria where accion='ALTA_USUARIO' and detalle like 'ana %'").get().detalle.includes('ana.lista@helios.com.ar'));
  r=await call('','POST','/api/admin/usuarios',{usuario:'x1',nombre:'X',perfil:'SOPORTE',correo:'x1@x.com'}); ok('sin sesión no crea', r.s===401);

  // ---- Listado y edición ----
  r=await call(A,'GET','/api/admin/usuarios'); const ana=r.j.usuarios.find(u=>u.usuario==='ana'), uri=r.j.usuarios.find(u=>u.usuario==='uriel');
  ok('el listado trae el correo', r.s===200 && ana.correo==='ana.lista@helios.com.ar' && r.j.falta_script_23===false, ana);
  ok('el administrador de antes (sin correo) queda con correo vacío', !uri.correo);
  r=await call(A,'POST','/api/admin/usuarios/'+uri.id,{nombre:'Uriel Solnik'}); ok('editar sin tocar el correo no lo pide', r.s===200);
  r=await call(A,'POST','/api/admin/usuarios/'+uri.id,{nombre:'Uriel Solnik',correo:''}); ok('quien no tenía correo puede seguir sin él', r.s===200 && !correoDe('uriel'));
  r=await call(A,'POST','/api/admin/usuarios/'+uri.id,{correo:'uriel@helios.com.ar'}); ok('se carga el correo de un usuario de antes', r.s===200 && correoDe('uriel')==='uriel@helios.com.ar');
  r=await call(A,'POST','/api/admin/usuarios/'+ana.id,{correo:'ana.nueva@helios.com.ar'}); ok('cambiar el correo', r.s===200 && correoDe('ana')==='ana.nueva@helios.com.ar');
  ok('la auditoría de edición dice que cambió el correo', db.prepare("select detalle from auditoria where accion='EDITAR_USUARIO' and detalle like 'ana:%'").get().detalle.includes('correo'));
  r=await call(A,'POST','/api/admin/usuarios/'+ana.id,{correo:''}); ok('no se puede vaciar un correo cargado', r.s===400 && /vac/.test(r.j.error), r.j.error);
  r=await call(A,'POST','/api/admin/usuarios/'+ana.id,{correo:'uriel@helios.com.ar'}); ok('no se puede usar el correo de otro (409)', r.s===409 && /Uriel/.test(r.j.error), r.j.error);
  r=await call(A,'POST','/api/admin/usuarios/'+ana.id,{correo:'malo@'}); ok('editar con correo malo = 400', r.s===400);
  ok('lo rechazado no cambió nada', correoDe('ana')==='ana.nueva@helios.com.ar');
  r=await call(A,'POST','/api/admin/usuarios/'+ana.id,{correo:'ANA.NUEVA@helios.com.ar'}); ok('el mismo correo con otras mayúsculas no cuenta como cambio', r.s===200 && correoDe('ana')==='ana.nueva@helios.com.ar');
  db.prepare("insert into usuarios (usuario,nombre,perfil,hash,sal,iteraciones,debe_cambiar) values ('viejo','Viejo Usuario','SOPORTE','x','x',1,1)").run();
  r=await call(A,'POST','/api/admin/usuarios/'+id('viejo'),{nombre:'Viejo Usuario',perfil:'SOPORTE',activo:true,correo:''}); ok('un usuario de antes se puede editar sin correo', r.s===200);

  // ---- Otros perfiles ----
  const cks={};
  for (const [u,n,p] of [['sol','Sol Porte','SOPORTE'],['carla','Carla Lider','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
    const x=await crear({usuario:u,nombre:n,perfil:p,correo:u+'@helios.com.ar'}); cks[u]=await entrar(u,x.j.clave_temporal);
  }
  const cana=await entrar('ana',tempAna);
  r=await call(cana,'POST','/api/admin/usuarios',{usuario:'hack',nombre:'X',perfil:'SOPORTE',correo:'h@x.com'}); ok('el analista no crea usuarios', r.s===403);
  r=await call(cana,'POST','/api/admin/usuarios/'+id('sol'),{correo:'otro@x.com'}); ok('el analista no cambia correos', r.s===403 && correoDe('sol')==='sol@helios.com.ar');

  // ---- Equipos y contactos del correo de una alerta ----
  await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',responsable_id:id('carla'),miembros:[id('sol'),id('carla'),id('viejo')]});
  await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
  await call(A,'POST','/api/admin/equipos',{nombre:'Sin correos',miembros:[id('viejo')]});
  const AL=await alertaDemo();
  const MESA=db.prepare("select id from equipos where nombre='Mesa'").get().id;

  r=await call(cana,'GET',`/api/alertas/${AL}/correo/contactos`);
  ok('el analista recibe los contactos', r.s===200 && r.j.ok===true, Object.keys(r.j));
  const c=r.j, nombres=c.personas.map(p=>p.nombre);
  ok('personas con correo, ordenadas por nombre', c.personas.length>0 && c.personas.every(p=>p.correo && p.id && p.nombre) && nombres.join('|')===[...nombres].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).join('|'), nombres);
  ok('incluye a Ana y a Sol con su correo', c.personas.some(p=>p.nombre==='Ana Lista'&&p.correo==='ana.nueva@helios.com.ar') && c.personas.some(p=>p.nombre==='Sol Porte'&&p.correo==='sol@helios.com.ar'));
  ok('no incluye a quien no tiene correo', !nombres.includes('Viejo Usuario'));
  ok('cuenta cuántos activos no tienen correo', c.sin_correo===1, c.sin_correo);
  ok('equipo Mesa con los correos de sus miembros (sin el que no tiene)', JSON.stringify(c.equipos.find(e=>e.nombre==='Mesa').correos.slice().sort())===JSON.stringify(['carla@helios.com.ar','sol@helios.com.ar']), c.equipos);
  ok('equipo Pagos con un solo correo', JSON.stringify(c.equipos.find(e=>e.nombre==='Pagos').correos)==='["pedro@helios.com.ar"]');
  ok('un equipo sin ningún correo no aparece', !c.equipos.some(e=>e.nombre==='Sin correos'));
  ok('no filtra datos de acceso', Object.keys(c.personas[0]).sort().join()==='correo,id,nombre' && !/hash|"sal"|clave/i.test(JSON.stringify(c)), Object.keys(c.personas[0]));
  await call(A,'POST','/api/admin/usuarios/'+id('pedro'),{activo:false});
  r=await call(cana,'GET',`/api/alertas/${AL}/correo/contactos`);
  ok('una persona desactivada deja de aparecer, y su equipo también', !r.j.personas.some(p=>p.nombre==='Pedro Pagos') && !r.j.equipos.some(e=>e.nombre==='Pagos'));
  // Permisos
  r=await call(cks.gero,'GET',`/api/alertas/${AL}/correo/contactos`); ok('el gerente no (solo lectura)', r.s===403);
  r=await call(A,'GET',`/api/alertas/${AL}/correo/contactos`); ok('el administrador no (solo lectura)', r.s===403);
  r=await call(cks.sol,'GET',`/api/alertas/${AL}/correo/contactos`); ok('soporte sin la alerta asignada no', r.s===403);
  await call(cana,'POST',`/api/alertas/${AL}/derivar`,{equipo_id:MESA});
  r=await call(cks.sol,'GET',`/api/alertas/${AL}/correo/contactos`); ok('soporte del equipo al que se derivó sí', r.s===200 && r.j.personas.length>0);
  r=await call('','GET',`/api/alertas/${AL}/correo/contactos`); ok('sin sesión = 401', r.s===401);
  r=await call(cana,'POST',`/api/alertas/${AL}/correo/contactos`,{}); ok('POST no existe', r.s===404 || r.s===405);
  r=await call(cana,'GET',`/api/alertas/${'0'.repeat(32)}/correo/contactos`); ok('alerta inexistente = 404', r.s===404, r.s);

  // ---- Páginas ----
  r=await call(A,'GET','/admin'); ok('Administración trae el campo Correo, el aviso de sin correo y la validación', r.s===200 && r.t.includes('id="u-correo"') && r.t.includes('Sin correo cargado') && r.t.includes('El correo no es válido'));
  r=await call(cana,'GET',`/alerta/${AL}`); ok('el detalle trae el selector en el correo y en la confirmación', r.s===200 && r.t.includes('Elegir de la lista') && r.t.includes("selectoresCorreo(['m-para', 'm-cc'])") && r.t.includes("selectoresCorreo(['e-para', 'e-cc'])") && r.t.includes('/correo/contactos'));
  // El correo sigue aceptando direcciones elegidas y escritas a mano
  r=await call(cana,'POST',`/api/alertas/${AL}/correo`,{asunto:'Mixto',para:['sol@helios.com.ar','cliente@banco.com'],cc:['carla@helios.com.ar'],texto:'x'});
  ok('el correo acepta elegidas y escritas a mano juntas', r.s===200);
} else {
  // ---- Sin el script 23: todo anda como antes ----
  r=await crear({usuario:'viejo1'}); ok('sin el script se crea sin correo', r.s===200);
  r=await crear({usuario:'viejo2',correo:'viejo2@helios.test'}); ok('con correo avisa que falta el script (503)', r.s===503 && /23_correo_usuarios_d1/.test(r.j.error), r.j.error);
  ok('y no creó al usuario', db.prepare("select count(*) n from usuarios where usuario='viejo2'").get().n===0);
  r=await call(A,'GET','/api/admin/usuarios'); ok('el listado avisa que falta el script y no se rompe', r.s===200 && r.j.falta_script_23===true && r.j.usuarios.length>=2 && r.j.usuarios.every(u=>u.correo==null), r.j.falta_script_23);
  r=await call(A,'POST','/api/admin/usuarios/'+id('viejo1'),{nombre:'Viejo Uno',correo:''}); ok('editar sin correo funciona', r.s===200);
  r=await call(A,'POST','/api/admin/usuarios/'+id('viejo1'),{correo:'x@helios.test'}); ok('editar con correo avisa (503)', r.s===503);
  const AL=await alertaDemo();
  r=await crear({usuario:'ana',nombre:'Ana Lista',perfil:'ANALISTA'}); const cana=await entrar('ana',r.j.clave_temporal);
  r=await call(cana,'GET',`/api/alertas/${AL}/correo/contactos`); ok('los contactos avisan que falta el script y vienen vacíos', r.s===200 && r.j.falta_script===true && r.j.personas.length===0 && r.j.equipos.length===0, r.j);
  r=await call(cana,'POST',`/api/alertas/${AL}/correo`,{asunto:'A mano',para:['a@b.com'],texto:'x'}); ok('el correo con destinatarios escritos sigue andando', r.s===200);
}
console.log(fallas?('\n'+fallas+' FALLAS'):'\nTODO OK'); process.exit(fallas?1:0);
