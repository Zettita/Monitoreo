import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' '+(r.headers.get('location')||'html')}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0;
const ok=(t,cond,extra)=>{console.log((cond?'OK  ':'FALLA ')+t+(extra!==undefined?'  → '+(typeof extra==='string'?extra:JSON.stringify(extra).slice(0,140)):'')); if(!cond) fallas++;};
const login=async(u,c)=>{const r=await call('', 'POST','/api/login',{usuario:u,clave:c}); return r.ck;};
// --- Setup y admin ---
await call('', 'POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123'); ok('login admin', !!A);
let r=await call(A,'GET','/api/yo'); ok('admin ve permisos admin', r.j.permisos.includes('admin_usuarios') && r.j.permisos.includes('admin_auditoria'), r.j.permisos);
r=await call(A,'GET','/admin'); ok('GET /admin admin = 200 html', r.s===200 && r.j.includes('html'));
// --- Usuarios ---
r=await call(A,'POST','/api/admin/equipos',{nombre:'Mesa de ayuda',descripcion:'Primer nivel',miembros:[]}); ok('alta equipo', r.s===200, r.j);
r=await call(A,'POST','/api/admin/equipos',{nombre:'mesa de AYUDA'}); ok('equipo duplicado (sin mayúsculas) = 409', r.s===409, r.j.error);
r=await call(A,'POST','/api/admin/equipos',{nombre:'X'}); ok('equipo nombre corto = 400', r.s===400, r.j.error);
const temps={};
for (const [u,n,p,eq] of [['gerente','Gerente Demo','GERENTE',[]],['analista','Ana Lista','ANALISTA',[]],['soporte','Sol Porte','SOPORTE',[1]],['admin2','Segundo Admin','ADMIN',[]]]) {
  r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p,equipos:eq}); temps[u]=r.j.clave_temporal;
  ok('alta '+p, r.s===200 && /^[A-Za-z2-9]{12}$/.test(r.j.clave_temporal||''), r.j.usuario);
}
r=await call(A,'POST','/api/admin/usuarios',{usuario:'gerente',nombre:'Otro',perfil:'GERENTE'}); ok('usuario duplicado = 409', r.s===409, r.j.error);
r=await call(A,'POST','/api/admin/usuarios',{usuario:'a b',nombre:'X',perfil:'GERENTE'}); ok('usuario inválido = 400', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/usuarios',{usuario:'zzz',nombre:'X',perfil:'JEFE'}); ok('perfil inválido = 400', r.s===400, r.j.error);
r=await call(A,'GET','/api/admin/usuarios'); ok('lista usuarios', r.j.usuarios.length===5, r.j.usuarios.map(u=>u.usuario+':'+u.perfil+':'+(u.debe_cambiar?'dc':'')));
ok('soporte quedó en Mesa de ayuda', r.j.miembros.some(m=>m.equipo_id===1 && m.usuario_id===r.j.usuarios.find(u=>u.usuario==='soporte').id));
ok('lista no expone hash ni sal', !('hash' in r.j.usuarios[0]) && !('sal' in r.j.usuarios[0]));
const id = (u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
// --- Primer ingreso con temporal ---
const ck={};
for (const u of ['gerente','analista','soporte','admin2']) {
  ck[u]=await login(u,temps[u]);
  r=await call(ck[u],'GET','/api/admin/reglas'); const bloq=r.s===403;
  await call(ck[u],'POST','/api/cambiar-clave',{actual:temps[u],nueva:'Nueva'+u+'12345'});
  ok(u+': temporal sirve, API bloqueada hasta cambiar', !!ck[u] && bloq);
}
// --- Permisos por perfil ---
const matriz = { gerente:[302,403,403,403,403,403], soporte:[302,403,403,403,403,403], analista:[200,403,403,403,200,403], admin2:[200,200,200,200,200,200] };
for (const [u,esp] of Object.entries(matriz)) {
  const got=[];
  for (const p of ['/admin','/api/admin/usuarios','/api/admin/equipos','/api/admin/reglas','/api/admin/modelo','/api/admin/auditoria']) got.push((await call(ck[u],'GET',p)).s);
  ok('permisos '+u+' '+got.join(','), JSON.stringify(got)===JSON.stringify(esp));
}
r=await call(ck.analista,'POST','/api/admin/usuarios',{usuario:'hack',nombre:'X',perfil:'ADMIN'}); ok('analista no crea usuarios', r.s===403);
r=await call(ck.soporte,'POST','/api/admin/reglas/base/DATO_TARDIO',{activa:false}); ok('soporte no toca reglas', r.s===403);
r=await call(ck.gerente,'GET','/api/yo'); ok('gerente sin admin_panel (sin ítem de menú)', !r.j.permisos.includes('admin_panel'));
r=await call(ck.analista,'GET','/api/yo'); ok('analista con admin_panel', r.j.permisos.includes('admin_panel'));
// --- Reglas del admin sobre sí mismo y último admin ---
r=await call(A,'POST','/api/admin/usuarios/'+id('uriel'),{perfil:'GERENTE'}); ok('no se quita su propio perfil', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/usuarios/'+id('uriel'),{activo:false}); ok('no se desactiva a sí mismo', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/usuarios/'+id('uriel')+'/resetear-clave',{}); ok('no resetea su propia clave', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/usuarios/'+id('uriel'),{nombre:'Uriel S.'}); ok('sí edita su propio nombre', r.s===200);
r=await call(ck.admin2,'POST','/api/admin/usuarios/'+id('uriel'),{perfil:'ANALISTA'}); ok('admin2 baja a uriel a analista', r.s===200, r.j);
r=await call(A,'GET','/api/yo'); ok('sesión de uriel cerrada al cambiar perfil', r.s===401);
r=await call(ck.admin2,'POST','/api/admin/usuarios/'+id('uriel'),{perfil:'ADMIN'}); ok('vuelve a admin', r.s===200);
// admin2 es el único otro admin; uriel lo desactiva → ok; luego uriel intenta... (es él mismo). Probar "último admin": admin2 con uriel inactivo
const A2=await login('uriel','ClaveSegura123');
r=await call(A2,'POST','/api/admin/usuarios/'+id('admin2'),{activo:false}); ok('desactiva admin2 (queda uriel)', r.s===200);
r=await call(ck.admin2,'GET','/api/yo'); ok('admin2 desactivado sin sesión', r.s===401);
r=await login('admin2','Nuevaadmin212345'); ok('admin2 desactivado no ingresa', r===null);
db.prepare("update usuarios set perfil='GERENTE' where usuario='uriel'").run(); db.prepare("update usuarios set activo=1 where usuario='admin2'").run();
// ahora admin2 único admin activo: uriel (gerente) no puede; probamos con un admin que intente desactivar al único otro... simulamos
db.prepare("update usuarios set perfil='ADMIN' where usuario='uriel'").run(); db.prepare("update usuarios set activo=0 where usuario='admin2'").run();
r=await call(A2,'POST','/api/admin/usuarios/'+id('admin2'),{perfil:'SOPORTE'}); ok('editar admin inactivo no rompe', r.s===200);
// --- Reseteo y desbloqueo ---
for (let k=0;k<5;k++) await call('', 'POST','/api/login',{usuario:'soporte',clave:'malmalmalmal'});
r=await call(A2,'GET','/api/admin/usuarios'); ok('soporte figura bloqueado', r.j.usuarios.find(u=>u.usuario==='soporte').bloqueado);
r=await call(A2,'POST','/api/admin/usuarios/'+id('soporte')+'/desbloquear',{}); ok('desbloquear', r.s===200);
ok('soporte ingresa tras desbloqueo', !!(await login('soporte','Nuevasoporte12345')));
r=await call(A2,'POST','/api/admin/usuarios/'+id('soporte')+'/resetear-clave',{}); ok('resetear clave', r.s===200 && r.j.clave_temporal);
ok('clave vieja ya no sirve', (await login('soporte','Nuevasoporte12345'))===null);
const cs=await login('soporte',r.j.clave_temporal); r=await call(cs,'GET','/api/yo'); ok('con temporal: debe_cambiar', r.j.usuario.debe_cambiar===true);
// --- Equipos ---
r=await call(A2,'POST','/api/admin/equipos',{nombre:'Guardia',responsable_id:id('analista'),miembros:[id('soporte')]}); ok('equipo con responsable', r.s===200);
r=await call(A2,'GET','/api/admin/equipos'); const g=r.j.equipos.find(e=>e.nombre==='Guardia');
ok('responsable agregado como miembro', r.j.miembros.filter(m=>m.equipo_id===g.id).length===2);
r=await call(A2,'POST','/api/admin/equipos/'+g.id,{nombre:'Guardia 24x7',miembros:[id('gerente')],responsable_id:null,activo:false}); ok('editar equipo', r.s===200);
r=await call(A2,'GET','/api/admin/equipos'); const g2=r.j.equipos.find(e=>e.id===g.id);
ok('equipo renombrado, inactivo, 1 miembro', g2.nombre==='Guardia 24x7' && !g2.activo && r.j.miembros.filter(m=>m.equipo_id===g.id).length===1);
r=await call(A2,'POST','/api/admin/usuarios/'+id('gerente'),{equipos:[1]}); r=await call(A2,'GET','/api/admin/equipos');
ok('usuario cambia de equipos', JSON.stringify(r.j.miembros.filter(m=>m.usuario_id===id('gerente')).map(m=>m.equipo_id))==='[1]');
// --- Reglas ---
const CA=await login('analista','Nuevaanalista12345');
r=await call(CA,'POST','/api/admin/reglas',{nombre:'Del analista',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:1,severidad:'ALTA'}); ok('analista ya no crea reglas de alerta', r.s===403);
r=await call(A2,'GET','/api/admin/reglas'); ok('admin ve reglas', r.j.base.length===12 && r.j.series.length>0, 'series '+r.j.series.length);
for (const [b,t] of [[{nombre:'x',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:1,severidad:'ALTA'},'nombre corto'],
  [{nombre:'Rechazo bajo',metrica:'RECHAZO',direccion:'BAJO',ventanas_seguidas:1,severidad:'ALTA'},'combinación sin límite'],
  [{nombre:'Muchas',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:9,severidad:'ALTA'},'ventanas > 8'],
  [{nombre:'Sev mala',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:1,severidad:'BAJA'},'severidad BAJA'],
  [{nombre:'Inyección',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:1,severidad:'ALTA',cliente_id:"x' OR 1=1"},'alcance inválido']]) {
  r=await call(A2,'POST','/api/admin/reglas',b); ok('regla rechazada: '+t, r.s===400, r.j.error);
}
const nuevas=[
  {nombre:'Rechazos altos sostenidos en CLI_004',metrica:'RECHAZO',direccion:'ALTO',ventanas_seguidas:3,cliente_id:'CLI_004',severidad:'ALTA'},
  {nombre:'Lentitud sostenida',metrica:'LATENCIA',direccion:'ALTO',ventanas_seguidas:2,severidad:'CRITICA'},
  {nombre:'Caída de tráfico CLI_001 app',metrica:'VOLUMEN',direccion:'BAJO',ventanas_seguidas:1,cliente_id:'CLI_001',canal_id:'MOBILE',severidad:'MEDIA'},
  {nombre:'Importe alto',metrica:'IMPORTE',direccion:'ALTO',ventanas_seguidas:1,severidad:'MEDIA'},
  {nombre:'Errores en CLI_006 x4',metrica:'ERROR',direccion:'ALTO',ventanas_seguidas:4,cliente_id:'CLI_006',severidad:'ALTA'},
];
for (const b of nuevas) { r=await call(A2,'POST','/api/admin/reglas',b); ok('alta regla '+b.nombre, r.s===200, r.j.id); }
r=await call(A2,'POST','/api/admin/reglas/4',{activa:false}); ok('apagar regla personalizada', r.s===200);
r=await call(A2,'POST','/api/admin/reglas/base/DATO_TARDIO',{activa:false}); ok('apagar regla del sistema DATO_TARDIO', r.s===200);
r=await call(A2,'POST','/api/admin/reglas/base/NO_EXISTE',{activa:false}); ok('regla del sistema inexistente = 404', r.s===404);
r=await call(A2,'GET','/api/admin/reglas'); ok('estado reglas', !r.j.base.find(x=>x.regla==='DATO_TARDIO').activa && !r.j.personalizadas.find(x=>x.id===4).activa && r.j.personalizadas.find(x=>x.id===1).creada_por_nombre==='Uriel S.');
// --- Modelo ---
// Modelo v2: el perfil (13 series); la demo recién preparada todavía no tiene datos recibidos (observadas_desde puede ser null)
r=await call(CA,'GET','/api/admin/modelo'); ok('modelo', r.j.modelos.length===1 && r.j.modelos[0].series===13 && r.j.modelos[0].modelo_version==='2' && r.j.reloj, {m:r.j.modelos[0], d:r.j.observadas_desde, h:r.j.observadas_hasta});
// --- Demo con reglas personalizadas ---
r=await call(A2,'POST','/api/demo/preparar'); ok('preparar demo (reactiva las del sistema)', r.j.ok && db.prepare("select activa from alerta_reglas where regla='DATO_TARDIO'").get().activa===1);
r=await call(A2,'POST','/api/admin/reglas/base/DATO_TARDIO',{activa:false}); ok('apagar DATO_TARDIO después de preparar', r.s===200);
const nom = Object.fromEntries(db.prepare('select id, nombre from alerta_reglas_personalizadas').all().map(x=>['PERS_'+x.id,x.nombre]));
for (let i=0;i<20;i++) {
  r=await call(A2,'POST','/api/demo/siguiente'); if (!r.j.ok) break;
  const pers=db.prepare("select tipo_alerta t, cliente_id c, servicio_id s, canal_id k, estado e, motivo_resolucion m, count(*) n, min(substr(ventana_inicio,12,5)) i, max(substr(ventana_inicio,12,5)) f, severidad sv from alertas_historico where tipo_alerta like 'PERS_%' group by 1,2,3,4,5,6").all();
  const tard=db.prepare("select count(*) n from alertas_historico where tipo_alerta='DATO_TARDIO'").get().n;
  console.log(`  E${String(r.j.escena).padStart(2)} ${r.j.ventana_inicio.slice(11,16)} ` + pers.map(p=>`${p.t}:${p.c}:${p.k}:${p.sv}:${p.e}${p.m?'/'+p.m:''}[${p.n}v ${p.i}-${p.f}]`).join(' ; ') + (tard?' DATO_TARDIO='+tard:''));
}
r=await call(A2,'GET','/api/dashboard'); ok('dashboard trae reglas_personalizadas', r.j.reglas_personalizadas.length===5);
ok('nunca hubo DATO_TARDIO (regla apagada)', db.prepare("select count(*) n from alertas_historico where tipo_alerta='DATO_TARDIO'").get().n===0);
ok('regla apagada (PERS_4) nunca disparó', db.prepare("select count(*) n from alertas_historico where tipo_alerta='PERS_4'").get().n===0);
r=await call(A2,'GET','/api/admin/reglas'); ok('disparos 7 días', r.j.disparos.some(d=>d.tipo_alerta==='PERS_1'), r.j.disparos.filter(d=>d.tipo_alerta.startsWith('PERS')));
// --- Auditoría ---
r=await call(A2,'GET','/api/admin/auditoria'); ok('auditoría', r.j.filas.length>0, [...new Set(r.j.filas.map(f=>f.accion))].join(','));
const hoy=new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
r=await call(A2,'GET','/api/admin/auditoria?accion=ALTA_REGLA&usuario='+id('uriel')+'&desde='+hoy+'&hasta='+hoy); ok('auditoría filtrada', r.j.filas.length===5 && r.j.filas.every(f=>f.accion==='ALTA_REGLA'), r.j.filas.map(f=>f.detalle));
r=await call(A2,'GET','/api/admin/auditoria?desde=2020-01-01&hasta=2020-01-02'); ok('auditoría rango vacío', r.j.filas.length===0);
r=await call(A2,'GET','/api/admin/auditoria?accion=x;drop'); ok('auditoría acción inválida se ignora', r.s===200);
console.log(fallas ? 'FALLAS: '+fallas : 'TODO OK');
