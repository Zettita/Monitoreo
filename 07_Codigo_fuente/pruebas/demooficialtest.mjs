import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba de la demo oficial en UNA escena (parche 83): carga de 16 ventanas en pasos cortos (menos de 50 consultas por pedido),
// incidentes en todos los estados (sin asignar, asignada, en curso, devuelta, a un equipo, resueltas a mano y solas), pre-alertas en sus tres resultados,
// la carga incremental igual a una revisión completa y que la demo de siempre no cambie.
const db = new DatabaseSync(process.argv[2]);
let cnt = 0, maxc = 0;   // consultas por pedido (cada sentencia de un lote cuenta una: es lo más exigente)
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){cnt++;return{results:db.prepare(sql).all(...b),meta:{}}},async first(){cnt++;return db.prepare(sql).get(...b)??null},async run(){cnt++;const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/\breturning\b/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){cnt+=s.length;db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const env={DB};
const n=(sql,...a)=>db.prepare(sql).get(...a).n;
const call=async(ck,m,p,body)=>{
  cnt=0;
  const h={cookie:ck||''}; if(body!==undefined)h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  maxc=Math.max(maxc,cnt);
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null,h:r.headers,c:cnt};
};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined&&!c?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,300)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const q1=(sql,...a)=>db.prepare(sql).get(...a);

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['soporte1','Sol Uno','SOPORTE'],['soporte2','Sol Dos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=await login(u,'Clave'+u+'123456');
}
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa de ayuda',miembros:[id('soporte1'),id('soporte2')]});
let r;

// ---------- Permisos y estado inicial ----------
for (const u of ['gero','soporte1']) {
  r=await call(ck[u],'GET','/api/demo-oficial'); ok('GET /api/demo-oficial para '+u+' = 403', r.s===403, r.s);
  r=await call(ck[u],'POST','/api/demo-oficial/preparar'); ok('preparar para '+u+' = 403', r.s===403, r.s);
  r=await call(ck[u],'POST','/api/demo-oficial/siguiente'); ok('siguiente para '+u+' = 403', r.s===403, r.s);
}
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('el Analista ve el estado: sin preparar, UNA escena, arranca el martes 27/10 10:00 ARG', r.s===200 && r.j.oficial===true && r.j.preparada===false && r.j.total===1 && r.j.inicio==='2026-10-27T13:00:00Z' && r.j.siguiente.numero===1 && r.j.ventanas_total===16, r.j);
r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); ok('sin preparar, «siguiente» avisa (500 con mensaje claro)', r.s===500 && /Preparar demo oficial/.test(r.j.error), r.j);
r=await call(A,'GET','/api/demo'); ok('la demo de siempre sigue con sus 22 escenas', r.j.total===22, r.j);

// ---------- Preparar ----------
r=await call(ck.ana,'POST','/api/demo-oficial/preparar'); ok('preparar deja el reloj en el arranque de la oficial, con 0 ventanas cargadas', r.s===200 && r.j.preparada===true && r.j.escena===0 && r.j.ventanas_cargadas===0 && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-27T13:00:00Z', r.j);
ok('queda en la auditoría (DEMO_OFICIAL_PREPARAR)', n("select count(*) n from auditoria where accion='DEMO_OFICIAL_PREPARAR'")===1);
r=await call(A,'GET','/api/demo'); ok('y la demo de siempre no se ve como preparada (cada modo en su ventana)', r.j.preparada===false, r.j);

// ---------- Carga de la escena, en pasos ----------
const pasos=[]; let ultimo;
for (let i=0;i<8;i++){ ultimo=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); pasos.push(ultimo); if(ultimo.s!==200||ultimo.j.listo) break; }
ok('la escena se carga en 4 pasos (6 + 6 + 4 ventanas y las asignaciones), todos 200', pasos.length===4 && pasos.every(x=>x.s===200), pasos.map(x=>[x.s,x.j.listo]));
ok('los tres primeros dicen listo: false con su avance; el cuarto, listo: true', pasos.slice(0,3).every(x=>x.j.listo===false) && pasos.map(x=>x.j.ventanas).slice(0,3).join()==='6,12,16' && pasos[3].j.listo===true && pasos[3].j.escena===1, pasos.map(x=>[x.j.listo,x.j.ventanas,x.j.avance]));
ok('cada paso usa menos de 50 consultas (contando cada sentencia de un lote): máximo '+maxc, maxc<50, maxc);
ok('el mensaje final resume la escena', /Escena cargada: \d+ alertas abiertas, \d+ resueltas y 4 pre-alertas/.test(pasos[3].j.mensaje||''), pasos[3].j.mensaje);
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('queda cargada: sin escena siguiente, 16 ventanas, reloj a las 14:06', r.j.preparada===true && r.j.completa===true && r.j.siguiente===null && r.j.escena===1 && r.j.ventanas_cargadas===16 && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-27T17:06:00Z', r.j);
r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); ok('otro paso después de terminar avisa que ya está cargada', r.s===500 && /ya está cargada/.test(r.j.error), r.j);
ok('16 ventanas por serie (13 series; CLI_007 deja de enviar y CLI_008 llega al final)', n('select count(*) n from core_metricas_observadas')===16*12+10+3, n('select count(*) n from core_metricas_observadas'));

// ---------- Qué quedó abierto y cómo ----------
const grupos=(est)=>db.prepare(`select tipo_alerta||':'||cliente_id k, estado, count(*) ventanas, max(severidad_maxima) sev, asignado_usuario_id u, asignado_equipo_id q, asignado_en, reconocida_por
  from alertas_historico where estado ${est} group by tipo_alerta, cliente_id, servicio_id, canal_id`).all();
const ab=grupos("in ('ABIERTA','RECONOCIDA')"); const por=(k)=>ab.find(x=>x.k===k);
const clavesAb=ab.map(x=>x.k).sort();
ok('abiertas: el gateway (3 en CLI_006), errores en CLI_002 y CLI_005, latencia CLI_003, rechazo CLI_004, silencio CLI_007, el borde de CLI_001 y el cliente nuevo',
  clavesAb.join()===['APROBACION_BAJA:CLI_006','ERROR_ALTO:CLI_002','ERROR_ALTO:CLI_005','ERROR_ALTO:CLI_006','LATENCIA_ALTA:CLI_003','RECHAZO_ALTO:CLI_001','RECHAZO_ALTO:CLI_004','SIN_EXITOS:CLI_006','SIN_PREDICCION:CLI_008','VENTANA_FALTANTE:CLI_007'].join(), clavesAb);
ok('SIN ASIGNAR: el gateway de CLI_006 (grave), los errores de CLI_005 y el borde de CLI_001', ['SIN_EXITOS:CLI_006','ERROR_ALTO:CLI_005','RECHAZO_ALTO:CLI_001'].every(k=>por(k).u==null&&por(k).q==null&&por(k).estado==='ABIERTA') && por('SIN_EXITOS:CLI_006').sev==='CRITICA', ab);
ok('ASIGNADA SIN TOMAR: el rechazo de CLI_004 a Soporte 1, desde las 13:20 (demorada)', por('RECHAZO_ALTO:CLI_004').u===id('soporte1') && por('RECHAZO_ALTO:CLI_004').estado==='ABIERTA' && por('RECHAZO_ALTO:CLI_004').asignado_en==='2026-10-27T16:20:00Z' && por('RECHAZO_ALTO:CLI_004').ventanas===9, por('RECHAZO_ALTO:CLI_004'));
ok('EN CURSO: la latencia de CLI_003 la tomó Soporte 2', por('LATENCIA_ALTA:CLI_003').u===id('soporte2') && por('LATENCIA_ALTA:CLI_003').estado==='RECONOCIDA' && por('LATENCIA_ALTA:CLI_003').reconocida_por==='Sol Dos' && por('LATENCIA_ALTA:CLI_003').ventanas===6, por('LATENCIA_ALTA:CLI_003'));
ok('A UN EQUIPO: los errores de CLI_002 quedaron para «Mesa de ayuda», sin persona', por('ERROR_ALTO:CLI_002').q!=null && por('ERROR_ALTO:CLI_002').u==null && q1('select nombre from equipos where id=?',por('ERROR_ALTO:CLI_002').q).nombre==='Mesa de ayuda', por('ERROR_ALTO:CLI_002'));
const repFal=q1("select alerta_id from alertas_historico where tipo_alerta='VENTANA_FALTANTE' and estado='ABIERTA' order by ventana_inicio limit 1").alerta_id;
const evFal=db.prepare('select accion, usuario_id from alerta_eventos where alerta_id=? order by fecha, id').all(repFal);
ok('DEVUELTA: la de CLI_007 quedó sin asignar y su último movimiento es «devolvió» (Soporte 1)', por('VENTANA_FALTANTE:CLI_007').u==null && por('VENTANA_FALTANTE:CLI_007').q==null && evFal.map(x=>x.accion).join()==='DERIVAR,DEVOLVER' && evFal[1].usuario_id===id('soporte1') && por('VENTANA_FALTANTE:CLI_007').ventanas===6, evFal);
ok('el cliente nuevo (CLI_008) es informativo y sin asignar', por('SIN_PREDICCION:CLI_008').sev==='BAJA' && por('SIN_PREDICCION:CLI_008').u==null);
ok('el borde de CLI_001 es una alerta leve de rechazo en 2 ventanas', por('RECHAZO_ALTO:CLI_001').sev==='MEDIA' && por('RECHAZO_ALTO:CLI_001').ventanas===2);

const det0=(tipo,c)=>q1("select min(primera_deteccion) d from alertas_historico where tipo_alerta=? and cliente_id=? and estado!='RESUELTA'",tipo,c).d;
ok('cada alerta figura detectada cuando la habría visto una revisión normal (fin de su primera ventana + 5 min): el gateway a las 13:20, el rechazo de CLI_004 a las 12:05, la latencia a las 12:50', det0('SIN_EXITOS','CLI_006')==='2026-10-27T16:20:00Z' && det0('RECHAZO_ALTO','CLI_004')==='2026-10-27T15:05:00Z' && det0('LATENCIA_ALTA','CLI_003')==='2026-10-27T15:50:00Z' && det0('VENTANA_FALTANTE','CLI_007')==='2026-10-27T15:50:00Z', [det0('SIN_EXITOS','CLI_006'),det0('RECHAZO_ALTO','CLI_004'),det0('LATENCIA_ALTA','CLI_003'),det0('VENTANA_FALTANTE','CLI_007')]);

// ---------- Qué se resolvió ----------
const res=grupos("= 'RESUELTA'"); const rk=(k)=>res.find(x=>x.k===k);
const det=(tipo,c)=>q1("select motivo_resolucion m, causa_resolucion ca, acciones_resolucion ac, resuelta_por rp, comentario co, fecha_resolucion f from alertas_historico where tipo_alerta=? and cliente_id=? and estado='RESUELTA' limit 1",tipo,c);
ok('RESUELTAS SOLAS (normalizadas): volumen bajo de CLI_001, dato tardío de CLI_003 y dato inconsistente de CLI_005', ['VOLUMEN_BAJO:CLI_001','DATO_TARDIO:CLI_003','DATO_INCONSISTENTE:CLI_005'].every(k=>rk(k)) && det('VOLUMEN_BAJO','CLI_001').m==='NORMALIZADA' && det('DATO_TARDIO','CLI_003').m==='NORMALIZADA' && det('DATO_INCONSISTENTE','CLI_005').m==='NORMALIZADA', res);
ok('RESUELTA A MANO 1: tickets chicos de CLI_002, por Soporte 2, con causa y qué se hizo', det('IMPORTE_BAJO','CLI_002').m==='MANUAL' && det('IMPORTE_BAJO','CLI_002').rp==='Sol Dos' && /Comportamiento esperado/.test(det('IMPORTE_BAJO','CLI_002').ca) && det('IMPORTE_BAJO','CLI_002').ac==='Se contactó al cliente' && /^Causa: .*Se hizo: /.test(det('IMPORTE_BAJO','CLI_002').co) && rk('IMPORTE_BAJO:CLI_002').ventanas===4, det('IMPORTE_BAJO','CLI_002'));
ok('RESUELTA A MANO 2: importe alto de CLI_001 Web, por Soporte 1, «Falsa alarma»', det('IMPORTE_ALTO','CLI_001').m==='MANUAL' && det('IMPORTE_ALTO','CLI_001').rp==='Sol Uno' && det('IMPORTE_ALTO','CLI_001').ca==='Falsa alarma' && det('IMPORTE_ALTO','CLI_001').ac==='No requirió acción' && rk('IMPORTE_ALTO:CLI_001').ventanas===3, det('IMPORTE_ALTO','CLI_001'));
ok('lo resuelto a mano tiene su conversación (derivó, tomó y resolvió) en orden',
  JSON.stringify(db.prepare("select e.accion from alerta_eventos e join alertas_historico h on h.alerta_id=e.alerta_id where h.tipo_alerta='IMPORTE_BAJO' and h.cliente_id='CLI_002' order by e.fecha, e.id").all().map(x=>x.accion))==='["DERIVAR","TOMAR","RESOLVER"]');

// ---------- Pre-alertas ----------
const pre=db.prepare('select tipo_prealerta t, cliente_id c, servicio_id s, resultado r, activa a from prealertas_estado order by cliente_id, servicio_id').all();
ok('PRE-ALERTAS: confirmadas (CLI_003 latencia y CLI_004 transferencias), no se cumplió (CLI_005) y una activa en observación (CLI_004 recarga de celular)',
  pre.length===4 && pre.find(x=>x.c==='CLI_003').r==='CONFIRMADA' && pre.find(x=>x.c==='CLI_004'&&x.s==='TRANSFERENCIAS').r==='CONFIRMADA' && pre.find(x=>x.c==='CLI_005').r==='NO_SE_CUMPLIO' && pre.find(x=>x.c==='CLI_004'&&x.s==='RECARGA_CELULAR').r==='EN_OBSERVACION' && pre.find(x=>x.c==='CLI_004'&&x.s==='RECARGA_CELULAR').a===1 && pre.filter(x=>x.a===1).length===1, pre);

// Foto de la escena recién cargada (antes de trabajarla en vivo), para comparar cuando se repite
const resumen=()=>JSON.stringify({ab:grupos("in ('ABIERTA','RECONOCIDA')").map(x=>[x.k,x.estado,x.ventanas,x.u,x.q]),re:grupos("= 'RESUELTA'").map(x=>[x.k,x.ventanas]),pre:db.prepare('select cliente_id,servicio_id,resultado,activa from prealertas_estado order by cliente_id,servicio_id').all()});
const primera=resumen();

// ---------- Avisos ----------
ok('Soporte 1 tiene su aviso de la alerta asignada y los miembros del equipo, el del equipo', n("select count(*) n from avisos where tipo='ASIGNADA' and usuario_id=?", id('soporte1'))===2 && n("select count(*) n from avisos where tipo='ASIGNADA' and usuario_id=?", id('soporte2'))===1, db.prepare('select usuario_id,tipo,texto from avisos').all());
ok('el Analista tiene el aviso de que le devolvieron la alerta de CLI_007', n("select count(*) n from avisos where tipo='DEVUELTA' and usuario_id=?", id('ana'))===1 && n("select count(*) n from avisos where tipo='DEVUELTA' and usuario_id=?", id('uriel'))===0);
ok('queda en la auditoría (DEMO_OFICIAL_ESCENA)', n("select count(*) n from auditoria where accion='DEMO_OFICIAL_ESCENA'")===1);

// ---------- Lo que se ve en cada perfil ----------
r=await call(ck.gero,'GET','/api/dashboard'); ok('el Gerente ve las alertas abiertas en el tablero (solo lectura)', r.s===200 && (r.j.abiertas||[]).length>=10, Object.keys(r.j));
const abTablero=(r.j.abiertas||[]);
ok('…con quién las tiene (asignado_nombre) para las asignadas', abTablero.some(a=>a.cliente_id==='CLI_004'&&a.asignado_nombre==='Sol Uno') && abTablero.some(a=>a.cliente_id==='CLI_003'&&a.asignado_nombre==='Sol Dos'), abTablero.length);
ok('y las pre-alertas', (r.j.prealertas||[]).length===4, (r.j.prealertas||[]).length);
r=await call(ck.gero,'GET','/api/tablero/periodo?desde=2026-10-27&hasta=2026-10-27'); ok('la disponibilidad del día: por debajo del objetivo por el gateway caído y el silencio de CLI_007', r.s===200 && r.j.disponibilidad && r.j.disponibilidad.global && r.j.disponibilidad.global.disponibilidad<0.999 && r.j.disponibilidad.global.disponibilidad>0.8, r.j.disponibilidad && r.j.disponibilidad.global);
ok('…y la «Distribución de fallas» por causa tiene las dos causas cargadas a mano', (r.j.incidentes||[]).filter(x=>x.causa_resolucion).map(x=>x.causa_resolucion).sort().join('|')==='Comportamiento esperado (promo, feriado, campaña)|Falsa alarma', (r.j.incidentes||[]).map(x=>x.causa_resolucion));
r=await call(ck.ana,'GET','/api/seguimiento'); ok('el Analista ve Seguimiento con todo abierto, con sus eventos', r.s===200 && (r.j.abiertas||[]).length>=10 && (r.j.eventos||[]).some(e=>e.accion==='DEVOLVER'), Object.keys(r.j));
r=await call(ck.soporte2,'GET','/api/mis-alertas'); ok('Soporte 2 ve en Mis alertas la latencia que tiene en curso y los errores del equipo para tomar', r.s===200 && (r.j.abiertas||[]).some(a=>a.cliente_id==='CLI_003'&&a.estado==='RECONOCIDA') && (r.j.abiertas||[]).some(a=>a.cliente_id==='CLI_002'&&a.tipo_alerta==='ERROR_ALTO'), (r.j.abiertas||[]).map(a=>[a.cliente_id,a.tipo_alerta,a.estado]));
r=await call(ck.soporte1,'GET','/api/mis-alertas'); ok('Soporte 1 ve el rechazo de CLI_004 para tomar', r.s===200 && (r.j.abiertas||[]).some(a=>a.cliente_id==='CLI_004'&&a.tipo_alerta==='RECHAZO_ALTO'), (r.j.abiertas||[]).map(a=>[a.cliente_id,a.tipo_alerta,a.estado]));

// ---------- Se puede trabajar en vivo: abrir la sala del gateway, derivar, tomar ----------
const graves=db.prepare("select alerta_id from alertas_historico where tipo_alerta in ('SIN_EXITOS','ERROR_ALTO') and cliente_id in ('CLI_006','CLI_002','CLI_005') and estado='ABIERTA' group by tipo_alerta, cliente_id").all().map(x=>x.alerta_id);
r=await call(ck.ana,'POST','/api/incidentes',{alertas:graves.slice(0,3)}); ok('el Analista abre la sala de crisis con las alertas del gateway: es IM-4', r.s===200 && r.j.incidente.id===4, r.j);
const rechazo=q1("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' and estado!='RESUELTA' order by ventana_inicio limit 1").alerta_id;
r=await call(ck.soporte1,'POST',`/api/alertas/${rechazo}/tomar`,{}); ok('Soporte 1 toma lo que tiene asignado en vivo', r.s===200 && q1("select estado from alertas_historico where alerta_id=?",rechazo).estado==='RECONOCIDA', r.j);
const sinExitos=q1("select alerta_id from alertas_historico where tipo_alerta='SIN_EXITOS' and estado='ABIERTA' order by ventana_inicio limit 1").alerta_id;
r=await call(ck.ana,'POST',`/api/alertas/${sinExitos}/derivar`,{usuario_id:id('soporte2'),comentario:'Revisá el gateway'}); ok('y el Analista deriva la grave que estaba sin asignar', r.s===200, r.j);
r=await call(ck.ana,'GET',`/api/alertas/${rechazo}/detalle`); ok('el detalle muestra la conversación con las fechas del relato y las plantillas de correo', r.s===200 && Array.isArray(r.j.plantillas_correo) && r.j.plantillas_correo.length>=1, Object.keys(r.j));

// ---------- La carga incremental da lo mismo que una revisión completa ----------
// (se compara solo lo que las revisiones calculan: lo que se armó a mano no se toca)
const foto=()=>JSON.stringify({
  a: db.prepare("select tipo_alerta,cliente_id,servicio_id,canal_id,ventana_inicio,severidad,severidad_maxima,estado from alertas_historico where motivo_resolucion is null or motivo_resolucion<>'MANUAL' order by tipo_alerta,cliente_id,servicio_id,canal_id,ventana_inicio").all(),
  p: db.prepare('select tipo_prealerta,cliente_id,servicio_id,canal_id,inicio,ultima_ventana,ventanas,resultado,activa,round(margen_consumido,3) m from prealertas_estado order by cliente_id,servicio_id,canal_id,inicio').all(),
  s: db.prepare('select cliente_id,servicio_id,canal_id,ventanas,ultima_ventana_fin,primera_ventana_inicio from series_estado order by cliente_id,servicio_id,canal_id').all(),
});
const antes=foto();
r=await call(A,'POST','/api/admin/recalcular',{}); ok('«Recalcular 24 h» (revisión completa) anda', r.s===200 && r.j.modo==='completa', r.j);
ok('y deja exactamente las mismas alertas, pre-alertas y series que la carga en pasos (incremental)', foto()===antes, 'distinto');

// ---------- Cada modo en su página y sin pisarse ----------
r=await call(ck.ana,'GET','/');
ok('la página del tablero tiene el panel de la oficial con sus endpoints propios y el botón «Cargar escena»', r.t.includes("demoOficial = /[?&]demo=oficial(&|$)/.test(location.search)") && r.t.includes("'/api/demo-oficial'") && r.t.includes("'Preparar demo oficial'") && r.t.includes("Cargar escena ▶") && r.t.includes("DEMO_API + '/siguiente'"));
ok('…que encadena los pasos sola (listo: false → «Cargando… N %») y avisa con el mensaje final', r.t.includes("r.listo === false") && r.t.includes("'Cargando… ' + r.avance + ' %'") && r.t.includes('r.mensaje'));
r=await worker.fetch(new Request('https://x/inicio?demo=oficial',{headers:{cookie:ck.ana},redirect:'manual'}),env,{});
ok('/inicio?demo=oficial lleva al tablero de la demo oficial', r.status===302 && /\/\?demo=oficial$/.test(r.headers.get('location')||''), r.headers.get('location'));
r=await worker.fetch(new Request('https://x/inicio?demo',{headers:{cookie:ck.ana},redirect:'manual'}),env,{});
ok('y /inicio?demo sigue llevando a la de siempre', r.status===302 && /\/\?demo$/.test(r.headers.get('location')||''), r.headers.get('location'));
r=await worker.fetch(new Request('https://x/inicio?demo=oficial',{headers:{cookie:ck.gero},redirect:'manual'}),env,{});
ok('el Gerente no tiene demo: va a su página de siempre', r.status===302 && !/demo/.test(r.headers.get('location')||''), r.headers.get('location'));

// ---------- Repetir: todo en cero y sale igual ----------
r=await call(ck.ana,'POST','/api/demo-oficial/preparar');
ok('«Preparar demo oficial» otra vez: sin alertas, sin eventos, sin sala, sin avisos, sin métricas y el reloj en el arranque', r.s===200 && r.j.escena===0 && r.j.ventanas_cargadas===0 && n('select count(*) n from alertas_historico')===0 && n('select count(*) n from alerta_eventos')===0 && n("select count(*) n from incidentes_mayores where origen='HELIOS'")===0 && n('select count(*) n from avisos')===0 && n('select count(*) n from core_metricas_observadas')===0 && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-27T13:00:00Z', r.j);
for (let i=0;i<8;i++){ r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); if(r.s!==200||r.j.listo) break; }
ok('y la escena vuelve a cargarse idéntica (sala IM-4 otra vez, la numeración se reinicia)', r.j.listo===true && resumen()===primera, 'distinta');
r=await call(ck.ana,'POST','/api/incidentes',{alertas:db.prepare("select alerta_id from alertas_historico where tipo_alerta='SIN_EXITOS' and estado='ABIERTA' limit 1").all().map(x=>x.alerta_id)});
ok('…y la sala nueva es IM-4 de nuevo', r.s===200 && r.j.incidente.id===4, r.j);

// ---------- Un paso que se corta se retoma ----------
await call(ck.ana,'POST','/api/demo-oficial/preparar');
await call(ck.ana,'POST','/api/demo-oficial/siguiente');
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('con el primer paso hecho, queda a medio cargar y todavía ofrece la escena (6 de 16 ventanas)', r.j.ventanas_cargadas===6 && r.j.completa===false && r.j.siguiente!==null, r.j);
for (let i=0;i<8;i++){ r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); if(r.s!==200||r.j.listo) break; }
ok('seguir toca retoma donde quedó y llega al mismo resultado', r.j.listo===true && resumen()===primera, 'distinta');

// ---------- Sin personas de Soporte: no se rompe ----------
db.exec("update usuarios set activo = 0 where perfil = 'SOPORTE'");
await call(ck.ana,'POST','/api/demo-oficial/preparar');
for (let i=0;i<8;i++){ r=await call(ck.ana,'POST','/api/demo-oficial/siguiente'); if(r.s!==200||r.j.listo) break; }
ok('sin Soporte activo la escena igual se carga (todo abierto queda sin asignar)', r.s===200 && r.j.listo===true && n("select count(*) n from alertas_historico where estado in ('ABIERTA','RECONOCIDA') and (asignado_usuario_id is not null or asignado_equipo_id is not null)")===0, r.j);
ok('…y lo resuelto a mano lo resuelve quien presenta (el Analista), con su causa', n("select count(*) n from alertas_historico where motivo_resolucion='MANUAL' and resuelta_por='Ana Lista' and causa_resolucion is not null")===7, n("select count(*) n from alertas_historico where motivo_resolucion='MANUAL'"));
db.exec("update usuarios set activo = 1 where perfil = 'SOPORTE'");

// ---------- La demo de siempre no cambió ----------
r=await call(ck.ana,'POST','/api/demo/preparar'); ok('«Preparar demo» (la de siempre) sigue andando: 22 escenas, arranca el lunes 26/10 10:00 ARG', r.s===200 && r.j.total===22 && r.j.preparada===true && q1('select ahora from alerta_parametros where id=1').ahora==='2026-10-26T13:00:00Z', r.j);
r=await call(ck.ana,'GET','/api/demo-oficial'); ok('y la oficial queda sin preparar', r.j.preparada===false, r.j);
r=await call(ck.ana,'POST','/api/demo/siguiente'); ok('la escena 1 de la de siempre anda', r.s===200 && r.j.escena===1 && r.j.titulo==='Arranca la guardia', r.j);

console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
