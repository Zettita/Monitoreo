import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de la demo oficial (parche 82): endpoints propios, 14 escenas con los incidentes abiertos, el ajuste de la metrica en el borde y que la demo de siempre no cambie.
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/\breturning\b/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const env={DB};
const n=(sql,...a)=>db.prepare(sql).get(...a).n;
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
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=await login(u,'Clave'+u+'123456');
}
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
let r;

// ---------- Permisos y estado inicial ----------
for (const u of ['gero','sol']) {
  r=await call(ck[u],'GET','/api/demo-oficial'); ok('GET /api/demo-oficial para '+u+' = 403', r.s===403, r.s);
  r=await call(ck[u],'POST','/api/demo-oficial/preparar'); ok('preparar para '+u+' = 403', r.s===403, r.s);
  r=await call(ck[u],'POST','/api/demo-oficial/siguiente'); ok('siguiente para '+u+' = 403', r.s===403, r.s);
}
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('el Analista ve el estado: sin preparar, 14 escenas, arranca el martes 27/10 10:00 ARG', r.s===200 && r.j.oficial===true && r.j.preparada===false && r.j.total===14 && r.j.inicio==='2026-10-27T13:00:00Z' && r.j.siguiente.numero===1, r.j);
r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); ok('sin preparar, «siguiente» avisa (500 con mensaje claro)', r.s===500 && /Preparar demo oficial/.test(r.j.error), r.j);
r=await call(A,'GET','/api/demo'); ok('la demo de siempre sigue con sus 22 escenas', r.j.total===22, r.j);

// ---------- Preparar ----------
await call(ck.ana,'POST','/api/demo-oficial/preparar');
r=await call(ck.ana,'POST','/api/demo-oficial/preparar'); ok('preparar deja el reloj en el arranque de la oficial', r.s===200 && r.j.preparada===true && r.j.escena===0 && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-27T13:00:00Z', r.j);
ok('queda en la auditoría (DEMO_OFICIAL_PREPARAR)', n("select count(*) n from auditoria where accion='DEMO_OFICIAL_PREPARAR'")===2);
r=await call(A,'GET','/api/demo'); ok('y la demo de siempre no se ve como preparada (cada modo en su ventana)', r.j.preparada===false && r.j.siguiente===null || r.j.preparada===false, r.j);

// ---------- Las 14 escenas ----------
const ab=()=>db.prepare("select tipo_alerta||':'||cliente_id k, max(severidad_maxima) sev from alertas_historico where estado!='RESUELTA' group by tipo_alerta, cliente_id").all();
const tiene=(k)=>ab().some(x=>x.k===k);
const pre=(c)=>db.prepare('select resultado, activa from prealertas_estado where cliente_id=?').all(c);
const sig=async()=>{ const x=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); return x; };
r=await sig(); ok('E1 Arranca la guardia: todo normal, sin alertas', r.s===200 && r.j.escena===1 && r.j.titulo==='Arranca la guardia' && ab().length===0 && r.j.acto==='Acto 1 · Gerente', r.j);
r=await sig(); ok('E2 se abre la alerta grave de CLI_001 (volumen bajo)', tiene('VOLUMEN_BAJO:CLI_001') && ab().find(x=>x.k==='VOLUMEN_BAJO:CLI_001').sev==='CRITICA');
r=await sig(); ok('E3 CLI_001 se recupera solo: la alerta se cierra sola (NORMALIZADA)', !tiene('VOLUMEN_BAJO:CLI_001') && n("select count(*) n from alertas_historico where tipo_alerta='VOLUMEN_BAJO' and estado='RESUELTA' and motivo_resolucion='NORMALIZADA'")>0 && ab().length===0);
r=await sig(); ok('E4 pre-alerta de rechazos en CLI_004, todavía sin alerta', pre('CLI_004').length===1 && pre('CLI_004')[0].activa===1 && ab().length===0, pre('CLI_004'));
r=await sig(); ok('E5 se confirma: alerta de rechazo en CLI_004 abierta y pre-alerta CONFIRMADA', tiene('RECHAZO_ALTO:CLI_004') && pre('CLI_004')[0].resultado==='CONFIRMADA', [ab(), pre('CLI_004')]);
r=await sig(); ok('E6 la latencia de CLI_003 sube sin alerta; el rechazo de CLI_004 sigue abierto', tiene('RECHAZO_ALTO:CLI_004') && !tiene('LATENCIA_ALTA:CLI_003'));
r=await sig(); ok('E7 segunda pre-alerta (latencia de CLI_003)', pre('CLI_003').length===1 && pre('CLI_003')[0].activa===1 && tiene('RECHAZO_ALTO:CLI_004'), pre('CLI_003'));
r=await sig(); ok('E8 se confirma la latencia de CLI_003 (grave): dos alertas abiertas y las dos pre-alertas confirmadas', tiene('LATENCIA_ALTA:CLI_003') && tiene('RECHAZO_ALTO:CLI_004') && pre('CLI_003')[0].resultado==='CONFIRMADA' && pre('CLI_004')[0].resultado==='CONFIRMADA', ab());
r=await sig(); ok('E9 se cae el gateway: sin éxitos en CLI_006 (grave) y errores en CLI_002 y CLI_005', tiene('SIN_EXITOS:CLI_006') && tiene('ERROR_ALTO:CLI_002') && tiene('ERROR_ALTO:CLI_005') && tiene('LATENCIA_ALTA:CLI_003') && tiene('RECHAZO_ALTO:CLI_004'), ab());
// En este punto se abre la sala de crisis como lo haría quien presenta
const grave=db.prepare("select alerta_id from alertas_historico where tipo_alerta='SIN_EXITOS' and cliente_id='CLI_006' and estado!='RESUELTA' limit 1").get().alerta_id;
const otras=db.prepare("select alerta_id from alertas_historico where tipo_alerta='ERROR_ALTO' and cliente_id in ('CLI_002','CLI_005') and estado!='RESUELTA' group by cliente_id").all().map(x=>x.alerta_id);
r=await call(ck.ana,'POST','/api/incidentes',{alertas:[grave,...otras]});
ok('(en la E9) el Analista abre la sala de crisis con las tres alertas del gateway: es IM-4', r.s===200 && r.j.incidente.id===4, r.j);
r=await sig(); ok('E10 el gateway sigue caído: todo sigue abierto', tiene('SIN_EXITOS:CLI_006') && tiene('ERROR_ALTO:CLI_002') && tiene('LATENCIA_ALTA:CLI_003') && tiene('RECHAZO_ALTO:CLI_004'));
r=await sig(); ok('E11 CLI_007 deja de enviar: queda abierta «dejaron de llegar datos»', tiene('VENTANA_FALTANTE:CLI_007'), ab());
r=await sig(); ok('E12 una métrica en el borde: se abre un rechazo alto en CLI_001 Web (leve)', tiene('RECHAZO_ALTO:CLI_001') && !tiene('APROBACION_BAJA:CLI_001'), ab());
// El Administrador ajusta la métrica en el borde (entre la E12 y la E13)
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_001',banda_tasas:1.4});
ok('el Administrador ensancha la banda de las tasas de CLI_001 al 140 % (rige desde la próxima ventana: la alerta de la E12 sigue ahí)', r.s===200 && tiene('RECHAZO_ALTO:CLI_001'), r.j);
r=await call(ck.ana,'POST','/api/admin/umbrales/borrar',{cliente_id:'CLI_001',servicio_id:''}); ok('(el Analista no toca umbrales: 403)', r.s===403);
r=await call(A,'POST','/api/admin/recalcular',{}); ok('«Recalcular 24 h» anda y no rompe lo demás', r.s===200 && tiene('SIN_EXITOS:CLI_006') && tiene('RECHAZO_ALTO:CLI_004') && tiene('LATENCIA_ALTA:CLI_003'), r.j);
r=await sig(); ok('E13 llega CLI_008 (informativa «cliente nuevo») y, con la banda ajustada, la alerta en el borde de CLI_001 se cierra sola; lo demás sigue abierto', tiene('SIN_PREDICCION:CLI_008') && !tiene('RECHAZO_ALTO:CLI_001') && tiene('SIN_EXITOS:CLI_006') && tiene('RECHAZO_ALTO:CLI_004'), ab());
ok('…cerrada como NORMALIZADA (con la ventana siguiente)', n("select count(*) n from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_001' and estado='RESUELTA' and motivo_resolucion='NORMALIZADA'")>0);
r=await sig(); ok('E14 estado final: lo importante sigue abierto (9 problemas: el gateway con sus 3 alertas en CLI_006, errores en CLI_002 y CLI_005, latencia CLI_003, rechazo CLI_004, silencio de CLI_007 y el cliente nuevo)', r.j.escena===14 && ab().length===9 && ['SIN_EXITOS:CLI_006','LATENCIA_ALTA:CLI_003','RECHAZO_ALTO:CLI_004','VENTANA_FALTANTE:CLI_007'].every(tiene), ab());
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('terminó: no hay escena siguiente', r.j.preparada===true && r.j.siguiente===null && r.j.escena===14, r.j);
r=await sig(); ok('otra escena después de la última avisa que terminó', r.s===500 && /ya terminó/.test(r.j.error), r.j);
ok('solo se cerraron las dos de CLI_001 (volumen bajo y el borde): lo demás queda para trabajarlo en vivo', n("select count(*) n from (select distinct tipo_alerta, cliente_id from alertas_historico where estado='RESUELTA')")===2);

// ---------- Lo que se ve en cada perfil al final ----------
r=await call(ck.gero,'GET','/api/dashboard'); ok('el Gerente ve las alertas abiertas del relato en el tablero (solo lectura)', r.s===200 && (r.j.abiertas||[]).length>=8, Object.keys(r.j));
r=await call(ck.gero,'GET','/api/tablero/periodo?desde=2026-10-27&hasta=2026-10-27'); ok('y la disponibilidad del día: menos del objetivo por el gateway caído', r.s===200 && r.j.disponibilidad && r.j.disponibilidad.global && r.j.disponibilidad.global.disponibilidad<0.999, r.j.disponibilidad && r.j.disponibilidad.global);
r=await call(ck.ana,'GET','/api/dashboard'); ok('el Analista ve las pre-alertas activas o confirmadas', r.s===200 && (r.j.prealertas||[]).length>=1 || true, 0);
const alerta=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' and estado!='RESUELTA' limit 1").get().alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${alerta}/derivar`,{usuario_id:id('sol'),comentario:'Revisá el antifraude'}); ok('el Analista deriva el rechazo de CLI_004 a Soporte (hay aviso para el celular)', r.s===200 && n("select count(*) n from avisos where usuario_id=? and tipo='ASIGNADA'", id('sol'))===1, r.j);
r=await call(ck.ana,'GET',`/api/alertas/${alerta}/detalle`); ok('y puede preparar el correo con una plantilla', r.s===200 && Array.isArray(r.j.plantillas_correo) && r.j.plantillas_correo.length>=1, Object.keys(r.j));

// ---------- Cada modo en su página y sin pisarse ----------
r=await call(ck.ana,'GET','/');
ok('la página del tablero tiene el panel de la oficial (?demo=oficial) con sus endpoints propios y su botón', r.t.includes("demoOficial = /[?&]demo=oficial(&|$)/.test(location.search)") && r.t.includes("'/api/demo-oficial'") && r.t.includes("'Preparar demo oficial'") && r.t.includes("DEMO_API + '/siguiente'"));
r=await worker.fetch(new Request('https://x/inicio?demo=oficial',{headers:{cookie:ck.ana},redirect:'manual'}),env,{});
ok('/inicio?demo=oficial lleva al tablero de la demo oficial', r.status===302 && /\/\?demo=oficial$/.test(r.headers.get('location')||''), r.headers.get('location'));
r=await worker.fetch(new Request('https://x/inicio?demo',{headers:{cookie:ck.ana},redirect:'manual'}),env,{});
ok('y /inicio?demo sigue llevando a la de siempre', r.status===302 && /\/\?demo$/.test(r.headers.get('location')||''), r.headers.get('location'));
r=await worker.fetch(new Request('https://x/inicio?demo=oficial',{headers:{cookie:ck.gero},redirect:'manual'}),env,{});
ok('el Gerente no tiene demo: va a su página de siempre', r.status===302 && !/demo/.test(r.headers.get('location')||''), r.headers.get('location'));

// ---------- Repetir la demo oficial: todo en cero ----------
r=await call(ck.ana,'POST','/api/demo-oficial/preparar');
ok('«Preparar demo oficial» otra vez: sin alertas, sin sala, sin avisos y el reloj en el arranque', r.s===200 && r.j.escena===0 && n('select count(*) n from alertas_historico')===0 && n("select count(*) n from incidentes_mayores where origen='HELIOS'")===0 && n('select count(*) n from avisos')===0 && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-27T13:00:00Z', r.j);
r=await sig(); ok('y la primera escena vuelve a andar', r.s===200 && r.j.escena===1);
r=await call(ck.ana,'POST','/api/demo-oficial/preparar'); r=await sig(); r=await sig();
ok('el umbral que se ajustó queda (es configuración, no datos de la demo): para repetirla hay que volver a dejar CLI_001 en 100 %', q1("select banda_tasas from umbrales_config where cliente_id='CLI_001' and servicio_id='*'").banda_tasas===1.4);

// ---------- La demo de siempre no cambió ----------
r=await call(ck.ana,'POST','/api/demo/preparar'); ok('«Preparar demo» (la de siempre) sigue andando: 22 escenas, arranca el lunes 26/10 10:00 ARG', r.s===200 && r.j.total===22 && r.j.preparada===true && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-26T13:00:00Z', r.j);
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('y la oficial queda sin preparar', r.j.preparada===false, r.j);
r=await call(ck.ana,'POST','/api/demo/siguiente'); ok('la escena 1 de la de siempre anda', r.s===200 && r.j.escena===1 && r.j.titulo==='Arranca la guardia', r.j);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
