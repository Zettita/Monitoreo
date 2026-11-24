import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del parche 80: quien tiene una alerta asignada entra a la sala, la linea de tiempo dice quien es el responsable y Mis alertas/tareas muestra las tareas.
// (Lo demas de la sala esta en salacrisistest.)
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
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null,h:r.headers};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined&&!c?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,300)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const q1=(sql,...a)=>db.prepare(sql).get(...a);

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Mesa','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=await login(u,'Clave'+u+'123456');
}
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('carla')]});
const MESA=q1("select id from equipos where nombre='Mesa'").id;
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
let r;
const PS=db.prepare("select alerta_id from alertas_historico where cliente_id='CLI_006' and estado!='RESUELTA' and severidad_maxima!='BAJA' and servicio_id='PAGO_SERVICIOS' group by tipo_alerta, servicio_id, canal_id order by min(ventana_inicio)").all().map(x=>x.alerta_id);
const [A1,A2]=PS;
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[A1,A2]}); const IM=r.j.incidente.id;
ok('(preparación) sala abierta IM-'+IM+' con dos alertas', r.s===200 && IM===4, r.j);
const linea=()=>db.prepare('select texto, tipo from incidente_linea_tiempo where incidente_id=? order by id').all(IM).map(x=>x.texto);
ok('la línea de tiempo dice, al sumar cada alerta, que todavía no tiene responsable', linea().filter(t=>/Todavía no tiene responsable asignado/.test(t)).length===2, linea());

// ---------- Entrar a la sala con una alerta asignada ----------
r=await call(ck.sol,'GET',`/api/incidentes/${IM}`); ok('Soporte sin tareas ni alertas asignadas no entra a la sala (403)', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${A1}/derivar`,{usuario_id:id('sol'),comentario:'Es tuya'});
ok('el Analista deriva la alerta de la sala a Sol', r.s===200, r.j);
ok('la línea de tiempo dice quién es el responsable de la alerta', linea().some(t=>/Derivó la alerta .+ a Sol Porte\. Sol Porte es ahora el responsable de la alerta\./.test(t)), linea());
r=await call(ck.sol,'GET',`/api/incidentes/${IM}`);
ok('Sol, que tiene asignada una alerta de la sala (sin tareas), entra a la sala', r.s===200 && r.j.incidente.id===IM, r.s);
ok('…en lectura: no dirige ni deja notas', r.j.puedo && r.j.puedo.dirigir===false && r.j.puedo.notas===false && r.j.puedo.lectura===false, r.j.puedo);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/notas`,{texto:'Una nota'}); ok('…y no escribe en la sala (403)', r.s===403, r.j);
r=await call(ck.sol,'GET','/api/incidentes'); ok('la sala aparece en su lista', r.j.incidentes.some(i=>i.id===IM), r.j);
r=await call(ck.pedro,'GET',`/api/incidentes/${IM}`); ok('otra persona de Soporte sin alertas ni tareas sigue sin entrar (403)', r.s===403);
r=await call(ck.carla,'GET',`/api/incidentes/${IM}`); ok('y la de un equipo sin alertas asignadas tampoco', r.s===403);
r=await call(ck.ana,'POST',`/api/alertas/${A2}/derivar`,{equipo_id:MESA});
ok('derivar a un equipo también queda en la línea de tiempo', linea().some(t=>/equipo Mesa/.test(t) && /Queda a cargo del equipo/.test(t)), linea());
r=await call(ck.carla,'GET',`/api/incidentes/${IM}`); ok('quien es de un equipo con una alerta de la sala entra también (Carla)', r.s===200, r.s);
r=await call(ck.sol,'POST',`/api/alertas/${A1}/tomar`,{});
ok('Sol toma la alerta: queda en la línea de tiempo', r.s===200 && linea().some(t=>/^Tomó la alerta .+es quien la resuelve \(responsable de la alerta\)/.test(t)), [r.j, linea()]);
r=await call(ck.sol,'POST',`/api/alertas/${A1}/devolver`,{comentario:'No es de mi área'});
ok('Sol la devuelve: queda dicho que vuelve a quedar sin responsable, con el motivo', r.s===200 && linea().some(t=>/^Devolvió la alerta .+vuelve a quedar sin responsable\. Motivo: No es de mi área/.test(t)), [r.j, linea()]);
r=await call(ck.ana,'POST',`/api/alertas/${A1}/derivar`,{usuario_id:id('pedro')});
r=await call(ck.pedro,'POST',`/api/alertas/${A1}/tomar`,{});
r=await call(ck.ana,'POST',`/api/alertas/${A1}/resolver`,{comentario:'Se reinició el proceso'});
ok('al resolverla también queda en la línea de tiempo', r.s===200 && linea().some(t=>/^Resolvió la alerta/.test(t)), [r.j, linea()]);
ok('Sol conserva el acceso por la alerta del equipo (A2 es de Mesa)', (await call(ck.sol,'GET',`/api/incidentes/${IM}`)).s===200);
const LIB=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' and alerta_id not in (select alerta_id from incidente_alertas) and cliente_id!='CLI_006' limit 1").get();
const antes=linea().length;
if (LIB) { await call(ck.ana,'POST',`/api/alertas/${LIB.alerta_id}/derivar`,{usuario_id:id('carla')}); ok('derivar una alerta que no está en una sala no toca la línea de tiempo', linea().length===antes); }

// ---------- Mis alertas/tareas ----------
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Llamar al proveedor de cobranza',responsable_usuario_id:id('carla')});
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar el balanceador',equipo_id:MESA});
r=await call(ck.carla,'GET','/api/mis-alertas');
ok('Mis alertas trae las tareas de las salas de Carla: la suya y la del equipo sin tomar', r.s===200 && Array.isArray(r.j.tareas) && r.j.tareas.length===2, r.j.tareas);
const t1=(r.j.tareas||[]).find(t=>/Llamar/.test(t.titulo)) || {}, t2=(r.j.tareas||[]).find(t=>/balanceador/.test(t.titulo)) || {};
ok('…cada tarea dice a qué sala pertenece y de quién es', t1.codigo==='IM-'+IM && t1.persona==='Carla Mesa' && t1.sin_tomar===false && t2.sin_tomar===true && t2.equipo==='Mesa', r.j.tareas);
r=await call(ck.pedro,'GET','/api/mis-alertas'); ok('quien no tiene tareas ni es del equipo no ve ninguna', r.s===200 && r.j.tareas.length===0, r.j.tareas);
r=await call(ck.carla,'GET','/api/mis-alertas'); const p0=r.j.mis_pendientes;
ok('el número del menú cuenta también las tareas pendientes', p0>=2, r.j);
r=await call(ck.carla,'POST',`/api/incidentes/${IM}/tareas/${t1.id}`,{estado:'EN_CURSO'});
r=await call(ck.carla,'GET','/api/mis-alertas'); ok('al tomarla queda «en curso»', (r.j.tareas.find(t=>t.id===t1.id)||{}).estado==='EN_CURSO', r.j.tareas);
r=await call(ck.carla,'POST',`/api/incidentes/${IM}/tareas/${t1.id}`,{estado:'HECHA',resultado:'El proveedor confirmó la caída de su lado'});
ok('la termina', r.s===200, r.j);
r=await call(ck.carla,'GET','/api/mis-alertas'); const h=(r.j.tareas||[]).find(t=>t.id===t1.id);
ok('la tarea hecha sigue apareciendo (24 h) como hecha, con su resultado', h && h.estado==='HECHA' && /confirmó la caída/.test(h.resultado), r.j.tareas);
r=await call(ck.carla,'GET','/api/mis-alertas'); ok('y ya no cuenta como pendiente en el menú', r.j.mis_pendientes===p0-1, [p0,r.j.mis_pendientes]);
db.prepare("UPDATE incidente_tareas SET terminada = strftime('%Y-%m-%dT%H:%M:%SZ', '2020-01-01') WHERE id = ?").run(t1.id);
r=await call(ck.carla,'GET','/api/mis-alertas'); ok('pasadas las 24 horas, la tarea hecha deja de listarse', !(r.j.tareas||[]).some(t=>t.id===t1.id), r.j.tareas);
r=await call(ck.gero,'GET','/api/mis-alertas'); ok('el Gerente no tiene Mis alertas (403)', r.s===403);

// ---------- Nombres ----------
r=await call(ck.carla,'GET','/mis-alertas');
ok('la página se llama «Mis alertas/tareas» y tiene las secciones de tareas', r.t.includes('<h1>Mis alertas/tareas</h1>') && r.t.includes('<title>Helios · Mis alertas/tareas</title>') && r.t.includes('id="b-tareas"') && r.t.includes('id="b-tareas-hechas"'));
ok('el menú de la sala y de Administración también', (await call(ck.carla,'GET',`/incidente/${IM}`)).t.includes('>Mis alertas/tareas</a>') && (await call(A,'GET','/admin')).t.includes('>Mis alertas/tareas</a>'));
r=await call(ck.carla,'GET',`/alerta/${A2}`); ok('y el detalle de la alerta', r.s===200 && r.t.includes('>Mis alertas/tareas</a>') && !/>Mis alertas<\/a>/.test(r.t));

// ---------- Alertas y tareas bien separadas (parche 81) ----------
r=await call(ck.carla,'GET','/mis-alertas');
ok('Mis alertas/tareas tiene dos grupos con títulos propios: Alertas y Tareas de salas de crisis', r.t.includes('id="g-alertas"') && r.t.includes('id="g-tareas"') && r.t.indexOf('id="g-alertas"')<r.t.indexOf('id="g-tareas"'));
ok('…y títulos específicos: «Alertas resueltas…» y «Tareas hechas…» (ya no hay «Resueltas…» a secas)', r.t.includes('<h2>Alertas resueltas en las últimas 24 horas</h2>') && r.t.includes('<h2>Tareas hechas en las últimas 24 horas</h2>') && !r.t.includes('<h2>Resueltas en las últimas 24 horas</h2>') && r.t.includes('<h2>Alertas en curso</h2>') && r.t.includes('<h2>Alertas para tomar</h2>') && r.t.includes('<h2>Tareas pendientes</h2>'));
ok('…el resumen de arriba va en dos filas (Alertas / Tareas)', r.t.includes('<span class="res-rot">Alertas</span>') && r.t.includes('<span class="res-rot">Tareas</span>'));
ok('…y no está la variante de solo tareas', !r.t.includes('window.SOLO_TAREAS = true'));

// ---------- Mis tareas del Analista (parche 81) ----------
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Coordinar con el proveedor de cobranza',responsable_usuario_id:id('ana')});
const TA=r.j.id || q1("select id from incidente_tareas where titulo like 'Coordinar%'").id;
r=await call(ck.ana,'GET','/api/yo'); ok('el Analista tiene el permiso mis_tareas y Soporte no', r.j.permisos.includes('mis_tareas') && !(await call(ck.carla,'GET','/api/yo')).j.permisos.includes('mis_tareas'), r.j.permisos);
r=await call(ck.ana,'GET','/api/mis-tareas');
ok('el Analista ve la tarea que tiene en la sala, con su sala', r.s===200 && r.j.tareas.length===1 && r.j.tareas[0].codigo==='IM-'+IM && /Coordinar/.test(r.j.tareas[0].titulo) && r.j.tareas[0].persona==='Ana Lista', r.j.tareas);
ok('…con la misma forma que Mis alertas (sin alertas)', Array.isArray(r.j.abiertas) && r.j.abiertas.length===0 && typeof r.j.ahora==='string' && r.j.mis_pendientes===1, Object.keys(r.j));
for (const [u,cod] of [['carla',403],['sol',403],['gero',403]]) { r=await call(ck[u],'GET','/api/mis-tareas'); ok('/api/mis-tareas para '+u+' no corresponde ('+cod+')', r.s===cod, r.s); }
r=await call(ck.ana,'GET','/mis-tareas');
ok('la página «Mis tareas» del Analista: título, solo tareas y sus propios datos', r.s===200 && r.t.includes('<h1>Mis tareas</h1>') && r.t.includes('<title>Helios · Mis tareas</title>') && r.t.includes('window.SOLO_TAREAS = true') && r.t.includes("pedir('/api/mis-tareas')") && r.t.includes("puedo('mis_tareas')") && r.t.includes('id="b-tareas"'));
r=await call(ck.carla,'GET','/mis-tareas'); ok('Soporte no entra a /mis-tareas (lo lleva a su página)', r.s===302, r.s);
r=await call(ck.gero,'GET','/mis-tareas'); ok('el Gerente tampoco', r.s===302);
ok('el menú del usuario tiene «Mis tareas» (solo se muestra al Analista) en el tablero, Seguimiento, la sala y el detalle de la alerta',
  (await call(ck.ana,'GET','/')).t.includes('id="lnk-mistareas"') && (await call(ck.ana,'GET','/seguimiento')).t.includes('id="lnk-mistareas"') && (await call(ck.ana,'GET',`/incidente/${IM}`)).t.includes('id="lnk-mistareas"')
  && (await call(ck.ana,'GET',`/alerta/${A2}`)).t.includes('id="lnk-mistareas"') && (await call(A,'GET','/admin')).t.includes("$('lnk-mistareas').hidden = !puedo('mis_tareas')"));
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas/${TA}`,{estado:'EN_CURSO'}); ok('(el Analista que tiene la tarea la toma)', r.s===200, r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas/${TA}`,{estado:'HECHA',resultado:'El proveedor ya lo está resolviendo'});
r=await call(ck.ana,'GET','/api/mis-tareas'); ok('al terminarla pasa a «hechas» (24 h) y deja de ser pendiente', r.j.tareas.length===1 && r.j.tareas[0].estado==='HECHA' && r.j.mis_pendientes===0 && /ya lo está resolviendo/.test(r.j.tareas[0].resultado), r.j);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
