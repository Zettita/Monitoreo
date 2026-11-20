import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de la sala de crisis (parche 69, script 24): permisos, abrir y sumar alertas, tareas, notas, escalar, estado,
// línea de tiempo y auditoría, avisos, guía de diagnóstico, comunicado, Preparar demo y sin el script 24.
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
const n=(sql,...a)=>db.prepare(sql).get(...a).n;

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
const PAGOS=q1("select id from equipos where nombre='Pagos'").id;
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');   // hasta la caída total de CLI_006
let r;

// ---------- Antes de abrir ----------
ok('el script 24 trae 3 antecedentes importados', n("select count(*) n from incidentes_mayores where origen='IMPORTADO' and estado='CERRADO'")===3);
r=await call(ck.ana,'GET','/api/yo'); ok('el Analista tiene sala_crisis y sala_crisis_dirigir', r.j.permisos.includes('sala_crisis') && r.j.permisos.includes('sala_crisis_dirigir'), r.j.permisos);
r=await call(ck.gero,'GET','/api/yo'); ok('el Gerente ve la sala pero no la dirige', r.j.permisos.includes('sala_crisis') && !r.j.permisos.includes('sala_crisis_dirigir'));
r=await call(ck.ana,'GET','/incidentes'); ok('página /incidentes', r.s===200);
r=await call(ck.ana,'GET','/api/incidentes'); ok('lista sin salas abiertas (los antecedentes son de septiembre)', r.s===200 && r.j.abiertos===0 && r.j.puede_abrir===true, r.j);
const abiertas=db.prepare("select alerta_id, tipo_alerta, servicio_id, severidad_maxima from alertas_historico where cliente_id='CLI_006' and estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, servicio_id, canal_id order by ventana_inicio").all();
const PS=abiertas.filter(a=>a.servicio_id==='PAGO_SERVICIOS');
ok('hay al menos dos alertas abiertas de Pago de servicios de CLI_006 para la prueba', PS.length>=2, abiertas);
const [A1,A2]=PS.map(a=>a.alerta_id);
r=await call(ck.gero,'POST','/api/incidentes',{alertas:[A1]}); ok('el Gerente no abre salas (403)', r.s===403);
r=await call(ck.sol,'POST','/api/incidentes',{alertas:[A1]}); ok('Soporte no abre salas (403)', r.s===403);
r=await call(ck.ana,'POST','/api/incidentes',{alertas:['nada']}); ok('sin alertas válidas = 400', r.s===400);
const RES=q1("select alerta_id from alertas_historico where estado='RESUELTA' limit 1");
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[RES.alerta_id]}); ok('una alerta resuelta no se suma (409)', r.s===409, r.j);

// ---------- Abrir ----------
const aud0=n('select count(*) n from auditoria');
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[A1,A2],descripcion:'No se aprueban pagos de servicios por API.'});
ok('el Analista abre la sala', r.s===200 && r.j.incidente.id===4 && r.j.incidente.codigo==='IM-4', r.j);
const IM=r.j.incidente.id;
const inc=()=>q1('select * from incidentes_mayores where id=?',IM);
ok('incidente: abierto, grave, de CLI_006 / Pago de servicios, dirigido por quien lo abrió, origen HELIOS', inc().estado==='ABIERTO' && inc().severidad===(PS.some(a=>a.severidad_maxima==='CRITICA')?'CRITICA':'ALTA') && inc().cliente_id==='CLI_006' && inc().servicio_id==='PAGO_SERVICIOS' && inc().responsable_usuario_id===id('ana') && inc().origen==='HELIOS', inc());
ok('inicio = primera ventana de las alertas, en hora de la demo', inc().inicio<=inc().abierto && inc().abierto.startsWith('2026-10-26'), [inc().inicio, inc().abierto]);
ok('agrupa las 2 alertas', n('select count(*) n from incidente_alertas where incidente_id=?',IM)===2);
ok('línea de tiempo: apertura y 2 alertas sumadas', n("select count(*) n from incidente_linea_tiempo where incidente_id=? and tipo='APERTURA'",IM)===1 && n("select count(*) n from incidente_linea_tiempo where incidente_id=? and tipo='ALERTA_SUMADA'",IM)===2);
ok('auditoría ABRIR_INCIDENTE_MAYOR', n("select count(*) n from auditoria where accion='ABRIR_INCIDENTE_MAYOR'")===1 && n('select count(*) n from auditoria')===aud0+1);
ok('la conversación de cada alerta lo cuenta', n("select count(*) n from alerta_eventos where comentario like 'Sumó la alerta a la sala de crisis IM-4%'")===2);
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[A1]}); ok('una alerta no puede estar en dos salas abiertas (409)', r.s===409 && /IM-4/.test(r.j.error), r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/alertas`,{alertas:[A1]}); ok('sumar otra vez la misma = 409 "ya está en esta sala"', r.s===409 && /esta sala/.test(r.j.error), r.j);
const OTRA=q1("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' and not (cliente_id='CLI_006' and servicio_id='PAGO_SERVICIOS') order by ventana_inicio limit 1");
ok('hay otra alerta abierta para sumar', !!OTRA);
{ r=await call(ck.ana,'POST',`/api/incidentes/${IM}/alertas`,{alertas:[OTRA.alerta_id]}); ok('se suma una alerta de otro servicio', r.s===200 && n('select count(*) n from incidente_alertas where incidente_id=?',IM)===3, r.j); }

// ---------- Alertas candidatas y páginas ----------
r=await call(ck.sol,'GET','/api/incidentes/candidatas'); ok('Soporte no ve las alertas candidatas (403)', r.s===403);
r=await call(ck.ana,'GET','/api/incidentes/candidatas'); ok('candidatas: una por grupo, graves primero, y marca las que ya están en IM-4', r.s===200 && r.j.alertas.length>0 && r.j.alertas.filter(a=>a.en_sala==='IM-4').length===n('select count(*) n from incidente_alertas where incidente_id=?',IM) && r.j.alertas[0].severidad==='CRITICA', r.j.alertas.slice(0,3));
r=await call(ck.ana,'GET',`/incidente/${IM}`); ok('la página de la sala lleva el contexto para el asistente y el menú', r.s===200 && r.t.includes('window.ASIS_INCIDENTE = ID') && r.t.includes('id="lnk-sala"') && r.t.includes('Guía de diagnóstico'));
r=await call(ck.ana,'GET',`/alerta/${A1}`); ok('el detalle de la alerta tiene el aviso de la sala, el botón y ?comunicar', r.t.includes('id="sala-aviso"') && r.t.includes('data-acc="sala"') && r.t.includes("helios_comunicar_msg"));

// ---------- Quién ve qué ----------
r=await call(ck.sol,'GET',`/api/incidentes/${IM}`); ok('Soporte sin tareas no entra a la sala (403)', r.s===403);
r=await call(ck.sol,'GET','/api/incidentes'); ok('y no la ve en la lista', r.s===200 && r.j.incidentes.length===0);
r=await call(ck.gero,'GET',`/api/incidentes/${IM}`); ok('el Gerente la ve en lectura', r.s===200 && r.j.puedo.dirigir===false && r.j.puedo.notas===false && r.j.puedo.lectura===true && r.j.opciones===null);
r=await call(A,'GET',`/api/incidentes/${IM}`); ok('el Administrador también, en lectura', r.s===200 && r.j.puedo.dirigir===false);
r=await call(ck.gero,'POST',`/api/incidentes/${IM}/notas`,{texto:'hola'}); ok('el Gerente no deja notas (403)', r.s===403);
r=await call(ck.ana,'GET',`/api/incidentes/${IM}`);
ok('el Analista la dirige y tiene opciones de asignación (Soporte primero)', r.s===200 && r.j.puedo.dirigir===true && r.j.opciones.personas[0].perfil==='SOPORTE' && r.j.opciones.equipos.length===2, r.j.opciones);
ok('trae alertas con su estado, línea de tiempo y la hora de Helios', r.j.alertas.length>=2 && r.j.alertas[0].estado && r.j.linea.length>=3 && r.j.ahora.startsWith('2026-10-26') && r.j.incidente.codigo==='IM-4');
const g=r.j.guia;
ok('guía: componentes de Pago de servicios (autenticación, gateway y el balanceador propio de CLI_006)', ['Autenticación','Gateway de pagos','Balanceador y red de entrada'].every(x=>g.componentes.some(c=>c.nombre===x)), g.componentes.map(c=>c.nombre));
ok('guía: el gateway depende del proveedor de cobranza y del core, con qué revisar', (g.componentes.find(c=>c.nombre==='Gateway de pagos')||{depende_de:[]}).depende_de.map(d=>d.nombre).sort().join()==='Balanceador y red de entrada,Core de cuentas y saldos,Proveedor de cobranza de servicios' && /certificados/.test(g.componentes.find(c=>c.nombre==='Gateway de pagos').que_revisar));
ok('guía: el primer antecedente es el del gateway de pagos (IM-1)', g.antecedentes.length>=1 && g.antecedentes[0].id===1 && /Certificado vencido/.test(g.antecedentes[0].causa_raiz), g.antecedentes);

// ---------- Tareas ----------
const av0=n("select count(*) n from avisos where tipo='TAREA_INCIDENTE'");
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar errores del gateway de pagos',responsable_usuario_id:id('sol'),componente_id:5});
ok('tarea a una persona', r.s===200 && r.j.tarea.responsable==='Sol Porte', r.j); const T1=r.j.tarea.id;
ok('le llega un aviso que lleva a la sala (alerta_id i4)', n("select count(*) n from avisos where tipo='TAREA_INCIDENTE' and usuario_id=? and alerta_id='i4'",id('sol'))===1);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Consultar al proveedor de cobranza',equipo_id:PAGOS});
ok('tarea a un equipo: aviso a su gente de Soporte', r.s===200 && n("select count(*) n from avisos where tipo='TAREA_INCIDENTE' and usuario_id=?",id('pedro'))===1 && n("select count(*) n from avisos where tipo='TAREA_INCIDENTE'")===av0+2, r.j); const T2=r.j.tarea.id;
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'x',responsable_usuario_id:id('sol')}); ok('título muy corto = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Sin destino'}); ok('sin persona ni equipo = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Al gerente',responsable_usuario_id:id('gero')}); ok('no se asigna a un Gerente (400)', r.s===400);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Soporte crea',responsable_usuario_id:id('sol')}); ok('Soporte no crea tareas (403)', r.s===403);
r=await call(ck.sol,'GET',`/api/incidentes/${IM}`); ok('con una tarea, Soporte entra a la sala y ve cuál es suya', r.s===200 && r.j.tareas.find(t=>t.id===T1).mia===true && r.j.tareas.find(t=>t.id===T2).mia===false && r.j.puedo.dirigir===false && r.j.puedo.notas===true, r.j.puedo);
r=await call(ck.sol,'GET','/api/incidentes/contador'); ok('contador de Soporte: sus tareas pendientes', r.j.n===1 && r.j.que==='mis_tareas', r.j);
r=await call(ck.ana,'GET','/api/incidentes/contador'); ok('contador del Analista: salas abiertas', r.j.n===1 && r.j.que==='abiertos', r.j);
r=await call(ck.carla,'GET',`/api/incidentes/${IM}`); ok('alguien de Soporte sin tareas en la sala sigue sin entrar', r.s===403);
r=await call(ck.pedro,'GET',`/api/incidentes/${IM}`); ok('la gente del equipo con la tarea entra', r.s===200 && r.j.tareas.find(t=>t.id===T2).mia===true);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T2}`,{estado:'EN_CURSO'}); ok('Soporte no actualiza una tarea ajena (403)', r.s===403);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'EN_CURSO'}); ok('toma su tarea', r.s===200 && q1('select estado from incidente_tareas where id=?',T1).estado==='EN_CURSO');
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'EN_CURSO'}); ok('mismo estado = 409', r.s===409);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'CANCELADA'}); ok('Soporte no cancela (403)', r.s===403);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'HECHA'}); ok('hecha sin contar qué se hizo = 400', r.s===400);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/tareas/${T1}`,{estado:'HECHA',resultado:'El enlace con el proveedor rechaza la conexión: certificado vencido.'});
ok('la marca hecha con el resultado; le avisa a quien dirige', r.s===200 && q1('select estado, terminada from incidente_tareas where id=?',T1).terminada && n("select count(*) n from avisos where tipo='INCIDENTE' and usuario_id=? and alerta_id='i4'",id('ana'))===1);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/notas`,{texto:'Reinicié el gateway, sigue fallando el enlace.'}); ok('Soporte con tarea deja una nota', r.s===200);
r=await call(ck.carla,'POST',`/api/incidentes/${IM}/notas`,{texto:'hola'}); ok('Soporte sin tarea no deja notas (403)', r.s===403);

// ---------- Escalar y comunicar ----------
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/escalar`,{equipo_id:PAGOS,motivo:'Hace 30 minutos que no se aprueba ningún pago.'});
ok('escalar: tarea de escalamiento, renglón ESCALAMIENTO y auditoría', r.s===200 && /^Escalamiento: /.test(r.j.tarea.titulo) && n("select count(*) n from incidente_linea_tiempo where incidente_id=? and tipo='ESCALAMIENTO'",IM)===1 && n("select count(*) n from auditoria where accion='ESCALAR_INCIDENTE'")===1, r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/escalar`,{equipo_id:PAGOS,motivo:'no'}); ok('escalar sin motivo = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/alertas/${A1}/comunicar`,{personas:[id('gero')],mensaje:'Tenemos un incidente con los pagos de servicios de CLI_006.'});
ok('comunicar desde una alerta de la sala deja el renglón COMUNICADO en la sala', r.s===200 && n("select count(*) n from incidente_linea_tiempo where incidente_id=? and tipo='COMUNICADO'",IM)===1, r.j);
r=await call(ck.ana,'GET',`/api/alertas/${A1}/detalle`); ok('el detalle de la alerta muestra la sala y deja abrir otra al Analista', r.j.incidentes_mayores.length===1 && r.j.incidentes_mayores[0].codigo==='IM-4' && r.j.puede_abrir_sala===true, [r.j.incidentes_mayores, r.j.puede_abrir_sala]);
r=await call(ck.gero,'GET',`/api/alertas/${A1}/detalle`); ok('al Gerente no le ofrece abrir salas', r.j.puede_abrir_sala===false);

// ---------- Asistente dentro de la sala (modelo simulado) ----------
const pedidos=[]; let respuestas=[];
env.AI={async run(modelo,p){pedidos.push(p); const x=respuestas.shift(); return x||{response:'Respuesta de prueba.'};}};
r=await call(ck.ana,'GET','/api/asistente'); ok('el asistente ofrece las preguntas de la sala', r.j.sugerencias_sala.map(s=>s.id).join()==='sala_como_vamos,sala_que_reviso,sala_demorado', r.j);
r=await call(ck.ana,'POST','/api/asistente',{sugerencia:'sala_que_reviso'}); ok('una pregunta de la sala sin incidente = 400', r.s===400);
r=await call(ck.carla,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Cómo vamos?'}); ok('Soporte sin tareas en la sala no le pregunta por ella (403)', r.s===403);
pedidos.length=0;
r=await call(ck.ana,'POST','/api/asistente',{incidente_id:IM,sugerencia:'sala_que_reviso'});
const enviado=JSON.stringify(pedidos[0]&&pedidos[0].messages);
ok('"¿Qué reviso primero?": al modelo le llegan la guía y las tareas, ya en frases', r.s===200 && enviado.includes('Gateway de pagos') && enviado.includes('IM-1') && enviado.includes('Certificado vencido') && enviado.includes('Revisar errores del gateway'), r.j.error||enviado.slice(0,300));
ok('y las instrucciones saben que está en la sala', enviado.includes('Estás dentro de una sala de crisis (incidente_id '+IM+')'));
const ats=r.j.acciones||[];
ok('el servidor deja hasta 2 botones de "Asignar tarea" para componentes que nadie revisó (no el gateway, ya revisado)', ats.length===2 && ats.every(a=>a.tipo==='asignar_tarea' && a.incidente_id===IM && a.usuario_id) && !ats.some(a=>a.componente_id===5) && ats[0].tarea.startsWith('Revisar '), ats);
ok('auditoría del asistente con la sala', n("select count(*) n from auditoria where accion='ASISTENTE' and detalle like '[IM-"+IM+"]%'")===1);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:ats[0].tarea,detalle:ats[0].comentario,responsable_usuario_id:ats[0].usuario_id,componente_id:ats[0].componente_id,propuesta_por_asistente:1});
ok('la propuesta se hace por la ruta de siempre y queda marcada como del asistente', r.s===200 && q1('select propuesta_por_asistente p from incidente_tareas where id=?',r.j.tarea.id).p===1 && n("select count(*) n from auditoria where accion='CREAR_TAREA_INCIDENTE' and detalle like '%(propuesta del asistente)'")===1, r.j);
r=await call(ck.gero,'POST','/api/asistente',{incidente_id:IM,sugerencia:'sala_que_reviso'}); ok('el Gerente pregunta en la sala pero no recibe propuestas', r.s===200 && (r.j.acciones||[]).length===0, r.j);
// El modelo propone escalar y comunicar; el servidor las valida
respuestas=[{response:'',tool_calls:[{name:'sugerir_accion',arguments:{tipo:'escalar',incidente_id:IM,equipo_id:PAGOS,motivo:'Sigue sin aprobarse nada',comentario:'Hace 40 minutos que no se aprueba ningún pago.'}},
  {name:'sugerir_accion',arguments:{tipo:'comunicar',incidente_id:IM,motivo:'Avisar a atención al cliente'}},{name:'sugerir_accion',arguments:{tipo:'asignar_tarea',incidente_id:IM,titulo_tarea:'Revisar el balanceador',usuario_id:id('gero'),motivo:'x'}}]},
  {response:'Te dejo dos propuestas.'}];
r=await call(ck.ana,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Escalo esto?'});
const tipos=(r.j.acciones||[]).map(a=>a.tipo).sort().join();
ok('el modelo propone escalar y comunicar; asignar a un Gerente se rechaza', r.s===200 && tipos==='comunicar,escalar', r.j);
const com=(r.j.acciones||[]).find(a=>a.tipo==='comunicar');
ok('comunicar lleva la alerta principal de la sala y un mensaje armado', com && /^[0-9a-f]{32}$/.test(com.alerta_id) && /IM-4/.test(com.comentario), com);
respuestas=[{response:'',tool_calls:[{name:'estado_incidente',arguments:{incidente_id:1}}]},{response:'Listo.'}];
r=await call(ck.sol,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Y la sala 1?'});
const ultima=JSON.stringify(pedidos[pedidos.length-1].messages);
ok('Soporte no puede leer por el asistente una sala donde no tiene tareas', r.s===200 && ultima.includes('no está disponible para tu perfil'), ultima.slice(-400));
respuestas=[{response:'',tool_calls:[{name:'sugerir_accion',arguments:{tipo:'escalar',incidente_id:IM,equipo_id:PAGOS,motivo:'x',comentario:'Escalar ya mismo'}}]},{response:'Listo.'}];
r=await call(ck.sol,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Escalo?'}); ok('a Soporte no le llegan propuestas de la sala', (r.j.acciones||[]).length===0, r.j.acciones);
// Parche 71: pregunta libre en la sala (lo que pasó con Gemma: "dejame consultar…" sin consultar ni dejar el botón)
env.CONTEXTO_EXTERNO='apagado'; pedidos.length=0;
respuestas=[{response:'Para saber si conviene escalar, dejame consultar la herramienta de contexto externo.'},{response:'Conviene escalar al proveedor de cobranza: el gateway depende de él y sigue sin aprobarse nada.'}];
r=await call(ck.ana,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Escalo esto al proveedor?'});
let m0=pedidos[0]?(pedidos[0].messages.find(x=>x.role==='user'&&String(x.content).includes('Datos de Helios'))||{}).content||'':'';
ok('pregunta libre "¿Escalo esto al proveedor?": van estado, tareas, guía y lo de afuera, con la guía de respuesta', ['"estado_incidente":','"tareas_incidente":','"guia_diagnostico":','"contexto_externo":'].every(k=>m0.includes(k)) && m0.includes('Gateway de pagos') && m0.includes('No digas que vas a consultar'), m0.slice(0,300));
ok('anunció una consulta sin hacerla: se le pide otra vez y responde', pedidos.length===2 && JSON.stringify(pedidos[1].messages).includes('No anuncies consultas') && /^Conviene escalar/.test(r.j.respuesta), [pedidos.length, r.j.respuesta]);
const esc=(r.j.acciones||[]).find(a=>a.tipo==='escalar');
ok('el servidor deja el botón Escalar a una persona de Soporte, con el motivo armado, y lo dice', esc && esc.incidente_id===IM && esc.usuario_id && /IM-4/.test(esc.comentario) && /Te dejo el botón para escalar/.test(r.j.respuesta), [r.j.acciones, r.j.respuesta]);
respuestas=[{response:'No hace falta escalar todavía: la tarea del gateway ya encontró la causa.'}];
r=await call(ck.ana,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Escalo esto?'});
ok('si dice que no hace falta escalar, no deja el botón', r.s===200 && !(r.j.acciones||[]).some(a=>a.tipo==='escalar') && !/Te dejo el botón/.test(r.j.respuesta), r.j);
pedidos.length=0; respuestas=[{response:'Vamos bien.'}];
r=await call(ck.ana,'POST','/api/asistente',{incidente_id:IM,pregunta:'¿Cómo vamos?'});
m0=pedidos[0]?(pedidos[0].messages.find(x=>x.role==='user'&&String(x.content).includes('Datos de Helios'))||{}).content||'':'';
ok('"¿Cómo vamos?": estado y tareas, sin guía ni lo de afuera, y sin botón', !m0.includes('"guia_diagnostico":') && !m0.includes('"contexto_externo":') && m0.includes('"tareas_incidente":') && m0.includes('"estado_incidente":') && (r.j.acciones||[]).length===0, m0.slice(0,300));
delete env.CONTEXTO_EXTERNO;
pedidos.length=0; r=await call(ck.ana,'POST','/api/asistente',{pregunta:'¿Cómo está la operación?'});
const herr=JSON.stringify((pedidos[0]&&pedidos[0].tools)||[]);
const enHerr=(herr.match(/estado_incidente|tareas_incidente|guia_diagnostico|asignar_tarea|"escalar"|"comunicar"|incidente_id/g)||[]);
ok('fuera de la sala, al modelo no le llegan las herramientas ni las propuestas de la sala', r.s===200 && /alertas_abiertas/.test(herr) && (!enHerr.length || enHerr.every(x=>x==='incidente_id')), enHerr);
delete env.AI;

// ---------- Estado y cierre ----------
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'OTRO'}); ok('estado inválido = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'MITIGADO'}); ok('pasa a mitigado con su hora', r.s===200 && inc().estado==='MITIGADO' && inc().mitigado);
ok('avisa a quien tiene tareas abiertas', n("select count(*) n from avisos where tipo='INCIDENTE' and usuario_id=?",id('pedro'))===1);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'ABIERTO'}); ok('puede volver a abierto (se registra "Volvió a")', r.s===200 && n("select count(*) n from incidente_linea_tiempo where incidente_id=? and texto like 'Volvió a abierto%'",IM)===1);
r=await call(ck.sol,'POST',`/api/incidentes/${IM}/estado`,{estado:'MITIGADO'}); ok('Soporte no cambia el estado (403)', r.s===403);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'CERRADO',causa_raiz:'corta'}); ok('cerrar sin causa raíz = 400', r.s===400);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/estado`,{estado:'CERRADO',causa_raiz:'Certificado vencido en el enlace con el proveedor de cobranza.',componente_causa_id:5,resumen_cierre:'Se renovó el certificado.'});
ok('cierra con causa raíz y componente', r.s===200 && inc().estado==='CERRADO' && inc().cerrado && inc().componente_causa_id===5);
ok('las tareas abiertas quedan canceladas', n("select count(*) n from incidente_tareas where incidente_id=? and estado in ('PENDIENTE','EN_CURSO')",IM)===0);
ok('renglón CIERRE con la causa', n("select count(*) n from incidente_linea_tiempo where incidente_id=? and tipo='CIERRE' and texto like '%Certificado vencido%'",IM)===1);
r=await call(ck.ana,'POST',`/api/incidentes/${IM}/notas`,{texto:'tarde'}); ok('cerrado: ya no se cambia (409)', r.s===409);
r=await call(ck.ana,'GET',`/api/incidentes/${IM}`); ok('cerrado: el Analista ya no la dirige', r.j.puedo.dirigir===false && r.j.opciones===null);
ok('cada acción dejó su renglón de auditoría', ['CREAR_TAREA_INCIDENTE','ACTUALIZAR_TAREA_INCIDENTE','NOTA_INCIDENTE','CAMBIAR_ESTADO_INCIDENTE','CERRAR_INCIDENTE_MAYOR','SUMAR_ALERTA_INCIDENTE'].every(a=>n('select count(*) n from auditoria where accion=?',a)>=1));
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[A2]}); ok('con la sala cerrada, la alerta se puede sumar a una sala nueva', r.s===200 && r.j.incidente.id===5, r.j);
r=await call(ck.ana,'GET',`/api/incidentes/${r.j.incidente.id}`); ok('la sala nueva ya tiene el cierre de IM-4 como antecedente', r.j.guia.antecedentes.some(a=>a.id===IM), r.j.guia.antecedentes.map(a=>a.id));

// ---------- Páginas: la campanita lleva a la sala ----------
r=await call(ck.sol,'GET','/mis-alertas'); ok('la campanita de Mis alertas lleva los avisos de la sala a /incidente/<id>', r.t.includes("return '/incidente/' + a.alerta_id.slice(1);"));

// ---------- Preparar demo ----------
await call(A,'POST','/api/demo/preparar');
ok('Preparar demo borra las salas de Helios y deja los antecedentes', n("select count(*) n from incidentes_mayores where origen='HELIOS'")===0 && n("select count(*) n from incidentes_mayores where origen='IMPORTADO'")===3 && n('select count(*) n from incidente_tareas')===0 && n('select count(*) n from incidente_linea_tiempo where incidente_id>3')===0);

// ---------- Escenas 20 a 22 de la demo: el gateway de pagos cae en tres clientes ----------
for(let i=0;i<19;i++) await call(A,'POST','/api/demo/siguiente');
r=await call(A,'POST','/api/demo/siguiente'); ok('escena 20: se cae el gateway de pagos', r.j.escena===20 && /gateway/.test(r.j.titulo), r.j);
r=await call(ck.ana,'GET','/api/incidentes/candidatas');
const g20=r.j.alertas.filter(a=>['CLI_002','CLI_005','CLI_006'].includes(a.cliente_id) && a.servicio==='Pago de servicios');
ok('escena 20: aparecen alertas de Pago de servicios en CLI_002, CLI_005 y CLI_006, las graves primero', new Set(g20.map(a=>a.cliente_id)).size===3 && r.j.alertas[0].severidad==='CRITICA' && r.j.alertas[0].cliente_id==='CLI_006', g20.map(a=>a.cliente_id+':'+a.severidad));
const grave=g20.find(a=>a.cliente_id==='CLI_006' && a.tipo_alerta==='SIN_EXITOS');
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[grave.alerta_id]}); const IMD=r.j.incidente.id;
ok('el Analista abre la sala desde la alerta grave', r.s===200 && q1('select cliente_id c, servicio_id s from incidentes_mayores where id=?',IMD).s==='PAGO_SERVICIOS', r.j);
r=await call(ck.ana,'POST',`/api/incidentes/${IMD}/alertas`,{alertas:g20.filter(a=>a.cliente_id!=='CLI_006').map(a=>a.alerta_id)});
ok('y suma las de los otros dos clientes: la sala queda de varios clientes', r.s===200 && n('select count(*) n from incidente_alertas where incidente_id=?',IMD)===3, r.j);
r=await call(ck.ana,'GET',`/api/incidentes/${IMD}`);
ok('la guía arranca por Pago de servicios (gateway y proveedor de cobranza) y trae IM-1 como antecedente', r.j.guia.componentes.some(c=>c.nombre==='Gateway de pagos') && r.j.guia.antecedentes[0] && r.j.guia.antecedentes[0].id===1, r.j.guia.antecedentes.map(a=>a.id));
r=await call(A,'POST','/api/demo/siguiente'); ok('escena 21: el gateway sigue caído', r.j.escena===21);
r=await call(ck.ana,'GET',`/api/incidentes/${IMD}`); ok('escena 21: las alertas de la sala siguen abiertas', r.j.alertas.every(a=>a.estado!=='RESUELTA'), r.j.alertas.map(a=>a.estado));
r=await call(A,'POST','/api/demo/siguiente'); ok('escena 22: servicio restablecido', r.j.escena===22 && r.j.total===22);
r=await call(ck.ana,'GET',`/api/incidentes/${IMD}`);
ok('escena 22: las alertas se resolvieron solas y la sala sigue abierta hasta que el Analista la cierre', r.j.alertas.every(a=>a.estado==='RESUELTA') && r.j.incidente.estado==='ABIERTO', [r.j.alertas.map(a=>a.estado), r.j.incidente.estado]);
r=await call(ck.ana,'POST',`/api/incidentes/${IMD}/estado`,{estado:'MITIGADO'}); ok('se marca mitigado', r.s===200);
r=await call(ck.ana,'POST',`/api/incidentes/${IMD}/estado`,{estado:'CERRADO',causa_raiz:'El gateway de pagos perdió la conexión con el proveedor de cobranza.',componente_causa_id:5});
ok('y se cierra con causa raíz: queda como antecedente del gateway', r.s===200 && n("select count(*) n from incidentes_mayores where estado='CERRADO' and componente_causa_id=5")>=2);
r=await call(A,'POST','/api/demo/siguiente'); ok('después de la 22 la demo termina', r.s!==200 || r.j.ok===false);

// ---------- Sin el script 24 ----------
for (const t of ['incidente_alertas','incidente_tareas','incidente_linea_tiempo','incidentes_mayores','componente_dependencias','componentes_infraestructura']) db.exec('DROP TABLE '+t);
r=await call(ck.ana,'GET','/api/incidentes'); ok('sin el script 24 la lista avisa qué falta (503)', r.s===503 && /24_sala_crisis_d1/.test(r.j.error), r.j);
r=await call(A,'POST','/api/demo/preparar'); ok('sin el script 24, Preparar demo anda igual', r.s===200 && r.j.ok===true, r.j);
for(let i=0;i<9;i++) await call(A,'POST','/api/demo/siguiente');
const X=q1("select alerta_id from alertas_historico where estado!='RESUELTA' limit 1");
r=await call(ck.ana,'GET',`/api/alertas/${X.alerta_id}/detalle`); ok('y el detalle de la alerta sigue andando', r.s===200 && Array.isArray(r.j.incidentes_mayores) && r.j.incidentes_mayores.length===0, r.j.error);
r=await call(ck.ana,'POST',`/api/alertas/${X.alerta_id}/comunicar`,{personas:[id('gero')],mensaje:'Comunicado sin las tablas de la sala.'}); ok('y comunicar también', r.s===200, r.j);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
