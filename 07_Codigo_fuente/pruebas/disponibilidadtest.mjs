import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del dashboard gerencial, parte 4 (parche 45): disponibilidad mensual contra un objetivo, con objetivo y pesos configurables.
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
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
let r;
const P=(c,q)=>call(c,'GET','/api/tablero/periodo'+q);
const cerca=(a,b,e=1e-9)=>Math.abs(a-b)<=e;

// ---- Cálculo independiente, directo de la base ----
const ahora=db.prepare('select ahora from alerta_parametros where id=1').get().ahora;
const ahoraMs=Date.parse(ahora), d0=Date.parse('2026-10-01T03:00:00Z');
const primera={};
for (const s of db.prepare('select cliente_id,servicio_id,primera_ventana_inicio p from series_estado').all()) { const k=s.cliente_id+'|'+s.servicio_id, t=Date.parse(s.p); primera[k]=Math.min(primera[k]??Infinity,t); }
const malas=(cli,srv)=>{
  const filas=db.prepare("select ventana_inicio, severidad from alertas_historico where cliente_id=? and servicio_id=? and ventana_inicio>='2026-10-01T03:00:00Z' and severidad in ('CRITICA','ALTA','MEDIA') and tipo_alerta not in ('DATO_TARDIO','DATO_INCONSISTENTE','SIN_PREDICCION')").all(cli,srv);
  const peor={}; for (const f of filas) { const n=f.severidad==='CRITICA'?1:f.severidad==='ALTA'?2:3; peor[f.ventana_inicio]=Math.min(peor[f.ventana_inicio]??9,n); }
  const v=Object.values(peor); return { g:v.filter(x=>x===1).length, i:v.filter(x=>x===2).length, l:v.filter(x=>x===3).length };
};
const esperada=(cli,srv,pg={g:1,i:0.5,l:0})=>{
  const k=cli+'|'+srv, m=malas(cli,srv), medidas=Math.floor((ahoraMs-Math.max(d0,primera[k]))/(15*60e3));
  return { disp: 1-Math.min(m.g*pg.g+m.i*pg.i+m.l*pg.l, medidas)/medidas, m, medidas };
};

// ---- El tablero trae la disponibilidad ----
r=await P(ck.gero,'?tipo=mes'); const mes=r.j;
ok('el mes trae disponibilidad global y por cliente', r.s===200 && mes.disponibilidad && mes.disponibilidad.global && mes.disponibilidad.clientes.length>=6, mes.disponibilidad.clientes.length);
ok('…con el objetivo de fábrica (99,9 %) y el margen sobre lo medido del período (0,1 % de los minutos medidos)', cerca(mes.disponibilidad.global.objetivo,0.999) && mes.disponibilidad.clientes.every(c=>c.servicios.every(s=>cerca(s.minutos_permitidos,Math.round(0.001*s.minutos_medidos*10)/10,0.051))), [mes.disponibilidad.global.objetivo]);
ok('…y la configuración de pesos de fábrica', mes.config_disponibilidad.pesos_gravedad.CRITICA===1 && mes.config_disponibilidad.pesos_gravedad.ALTA===0.5 && mes.config_disponibilidad.pesos_gravedad.MEDIA===0 && mes.config_disponibilidad.pesos_criticidad.ALTA===3 && mes.disponibilidad_instalada===true);
const c6=mes.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006');
ok('CLI_006 (caída total, 15 minutos): su disponibilidad medida (96 %) está por debajo del objetivo (99,9 %), así que NO cumple y está en rojo', c6 && c6.cumple===false && c6.estado==='rojo' && c6.disponibilidad<0.999 && c6.consumo>1, c6 && [c6.disponibilidad,c6.consumo,c6.estado]);
for (const s of c6.servicios) {
  const e=esperada('CLI_006',s.servicio_id);
  ok('disponibilidad de CLI_006 / '+s.servicio_id+' = la calculada a mano ('+e.m.g+' graves, '+e.m.i+' importantes, '+e.medidas+' ventanas medidas)', cerca(s.disponibilidad,e.disp), [s.disponibilidad,e.disp]);
  ok('…con sus ventanas y minutos', s.graves===e.m.g && s.importantes===e.m.i && s.leves===e.m.l && cerca(s.minutos_perdidos,Math.round((e.m.g+e.m.i*0.5)*15*10)/10,0.051));
}
const c1=mes.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_001'), e1=esperada('CLI_001','TRANSFERENCIAS');
ok('un cliente con una ventana faltante resuelta tiene su descuento', c1 && c1.servicios.some(s=>s.servicio_id==='TRANSFERENCIAS' && cerca(s.disponibilidad,e1.disp)), [e1.m, e1.disp]);
const sinProblemas=mes.disponibilidad.clientes.filter(c=>c.servicios.every(s=>s.graves+s.importantes+s.leves===0));
ok('los que no tuvieron problemas están al 100 % y cumplen', sinProblemas.length>=1 && sinProblemas.every(c=>c.disponibilidad===1 && c.cumple && c.consumo===0), sinProblemas.map(c=>c.cliente_id));
ok('los clientes vienen ordenados: primero el que más margen gastó', mes.disponibilidad.clientes.every((c,i,a)=>i===0||a[i-1].consumo>=c.consumo));
const w=(await P(ck.gero,'?tipo=semana')).j, d=(await P(ck.gero,'?tipo=dia')).j;
ok('el día y la semana dan lo mismo que el mes (la demo empezó hoy): misma disponibilidad y mismo semáforo', cerca(d.disponibilidad.global.disponibilidad,mes.disponibilidad.global.disponibilidad) && cerca(w.disponibilidad.global.disponibilidad,mes.disponibilidad.global.disponibilidad) && cerca(d.disponibilidad.global.consumo,mes.disponibilidad.global.consumo,1e-6) && d.disponibilidad.global.estado===mes.disponibilidad.global.estado);
ok('cumple, semáforo y número coinciden en todos los clientes y servicios: verde si la disponibilidad llega al objetivo, y nunca verde si queda por debajo', mes.disponibilidad.clientes.every(c=>(c.cumple===(c.disponibilidad>=c.objetivo-1e-12)) && ((c.estado==='verde')===c.cumple) && c.servicios.every(s=>(s.cumple===(s.disponibilidad>=s.objetivo-1e-12)) && ((s.estado==='verde')===s.cumple))));
r=await P(ck.gero,'?tipo=mes&fecha=2026-09-10');
ok('un mes sin datos no inventa disponibilidad', r.s===200 && r.j.disponibilidad.global===null && r.j.disponibilidad.clientes.length===0);
ok('el mes actual compara con septiembre (sin datos)', mes.disponibilidad_anterior.titulo==='Septiembre 2026' && mes.disponibilidad_anterior.global===null);
const g0=mes.disponibilidad.global.disponibilidad;

// ---- Permisos ----
r=await call(ck.gero,'GET','/api/admin/umbrales'); ok('el Gerente no ve los umbrales', r.s===403);
r=await call(ck.ana,'POST','/api/admin/umbrales/disponibilidad',{pesos_gravedad:{CRITICA:1,ALTA:.5,MEDIA:0},pesos_criticidad:{ALTA:3,MEDIA:2,BAJA:1}}); ok('el Analista no cambia cómo se mide', r.s===403);
r=await call(ck.gero,'POST','/api/admin/umbrales/disponibilidad',{pesos_gravedad:{CRITICA:1,ALTA:.5,MEDIA:0},pesos_criticidad:{ALTA:3,MEDIA:2,BAJA:1}}); ok('el Gerente tampoco', r.s===403);

// ---- La pantalla de Administración ----
r=await call(A,'GET','/api/admin/umbrales');
ok('Umbrales trae la configuración de disponibilidad y el objetivo general de 99,9 %', r.s===200 && r.j.disponibilidad.instalado===true && r.j.disponibilidad.pesos_gravedad.ALTA===0.5 && cerca(r.j.filas.find(f=>f.cliente_id==='*').objetivo_mensual,0.999) && cerca(r.j.fabrica.objetivo_mensual,0.999));
r=await call(A,'GET','/admin');
ok('la página de Administración tiene el grupo 5, el bloque y el diálogo de pesos', r.s===200 && r.t.includes('um-objetivo_mensual') && r.t.includes('5 · Disponibilidad mensual') && r.t.includes('dlg-dispo') && r.t.includes('btn-dispo') && r.t.includes('EDITAR_DISPONIBILIDAD'));

// ---- Objetivo por cliente (con decimales) ----
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',objetivo_mensual:0.9998});
ok('objetivo de 99,98 % para CLI_006', r.s===200, r.j);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',objetivo_mensual:0.5}); ok('un objetivo menor a 90 % se rechaza', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',objetivo_mensual:'abc'}); ok('…y uno que no es número también', r.s===400);
r=await P(ck.gero,'?tipo=mes'); const c6b=r.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006'), c1b=r.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_001');
ok('CLI_006 usa su objetivo (99,98 %) y los demás el general', cerca(c6b.objetivo,0.9998) && cerca(c1b.objetivo,0.999) && c6b.servicios.every(s=>cerca(s.objetivo,0.9998)), [c6b.objetivo,c1b.objetivo]);
ok('la disponibilidad no cambia por cambiar el objetivo', cerca(c6b.disponibilidad,c6.disponibilidad));
const pagoB=c6b.servicios.find(s=>s.servicio_id==='PAGO_SERVICIOS');
ok('con 99,98 % se permite 0,02 % de lo medido: 15 minutos sin servicio lo superan por mucho (no cumple, rojo) y se ve cuánto', pagoB.cumple===false && pagoB.estado==='rojo' && cerca(pagoB.consumo,(1-pagoB.disponibilidad)/0.0002,0.01) && c6b.cumple===false, [pagoB.consumo,c6b.consumo]);
await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS',objetivo_mensual:0.99});
r=await P(ck.gero,'?tipo=mes'); const c6c=r.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006');
ok('un servicio puede tener su propio objetivo (gana el más específico)', c6c.servicios.filter(s=>s.servicio_id==='PAGO_SERVICIOS').every(s=>cerca(s.objetivo,0.99)) && c6c.servicios.filter(s=>s.servicio_id!=='PAGO_SERVICIOS').every(s=>cerca(s.objetivo,0.9998)), c6c.servicios.map(s=>s.servicio_id+':'+s.objetivo));
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS'});
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:'CLI_006'});
// El objetivo general se cambia con decimales y, si no viene, queda el de fábrica
r=await call(A,'GET','/api/admin/umbrales'); const gen=r.j.filas.find(f=>f.cliente_id==='*');
const cuerpoGeneral=Object.assign({},gen,{objetivo_mensual:0.9995, cliente_id:null, servicio_id:null, volumen_minimo:r.j.parametros.volumen_minimo, gracia_minutos:r.j.parametros.gracia_minutos});
r=await call(A,'POST','/api/admin/umbrales',cuerpoGeneral); ok('objetivo general de 99,95 %', r.s===200, r.j);
r=await P(ck.gero,'?tipo=mes'); ok('el general lo usan todos los que no tienen uno propio', r.j.disponibilidad.clientes.every(c=>cerca(c.objetivo,0.9995)) && cerca(r.j.disponibilidad.global.objetivo,0.9995));
delete cuerpoGeneral.objetivo_mensual; r=await call(A,'POST','/api/admin/umbrales',cuerpoGeneral);
ok('si el general viene sin objetivo mensual, vuelve al de fábrica (99,9 %)', r.s===200 && cerca(db.prepare("select objetivo_mensual o from umbrales_config where cliente_id='*' and servicio_id='*'").get().o,0.999));

// ---- Pesos ----
const pesos=(g,i,l,a,m,b)=>({pesos_gravedad:{CRITICA:g,ALTA:i,MEDIA:l},pesos_criticidad:{ALTA:a,MEDIA:m,BAJA:b}});
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,3,2,1)); ok('guardar los pesos de fábrica', r.s===200, r.j);
for (const [t,cuerpo] of [['Grave en 0 %',pesos(0,0,0,3,2,1)],['Importante más que Grave',pesos(0.5,0.8,0,3,2,1)],['Leve más que Importante',pesos(1,0.2,0.4,3,2,1)],['más de 100 %',pesos(1.5,0.5,0,3,2,1)],['negativo',pesos(1,-0.1,0,3,2,1)],['criticidad Media más que Alta',pesos(1,0.5,0,2,3,1)],['criticidad en 0',pesos(1,0.5,0,3,2,0)],['sin números',pesos(1,'x',0,3,2,1)]]) {
  r=await call(A,'POST','/api/admin/umbrales/disponibilidad',cuerpo); ok('se rechaza: '+t, r.s===400, r.j.error);
}
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(0.5,0.25,0.1,3,2,1)); ok('Grave 50 %, Importante 25 %, Leve 10 %', r.s===200);
r=await P(ck.gero,'?tipo=mes'); const c6d=r.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006');
ok('con esos pesos los mismos problemas restan menos', r.j.config_disponibilidad.pesos_gravedad.CRITICA===0.5 && r.j.disponibilidad.global.disponibilidad>g0 && c6d.servicios.every(s=>{ const e=esperada('CLI_006',s.servicio_id,{g:0.5,i:0.25,l:0.1}); return cerca(s.disponibilidad,e.disp); }), [g0,r.j.disponibilidad.global.disponibilidad]);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,1,1,1));
r=await P(ck.gero,'?tipo=mes'); const gPlano=r.j.disponibilidad.global.disponibilidad;
await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,10,2,1));
r=await P(ck.gero,'?tipo=mes');
await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS',criticidad:'ALTA'});
const clienteDisp=async(p)=>{ await call(A,'POST','/api/admin/umbrales/disponibilidad',p); const x=(await P(ck.gero,'?tipo=mes')).j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006'); return x; };
let x=await clienteDisp(pesos(1,0.5,0,1,1,1));
ok('con el mismo peso para todos, el cliente es el promedio simple de sus servicios (1 - 15/420)', cerca(x.disponibilidad,1-15/420), x.disponibilidad);
x=await clienteDisp(pesos(1,0.5,0,3,2,1));
ok('con Alta 3 y Media 2, el servicio crítico pesa más: 1 - 45/(630+420)', cerca(x.disponibilidad,1-45/1050) && x.servicios.find(s=>s.servicio_id==='PAGO_SERVICIOS').criticidad==='ALTA', x.disponibilidad);
ok('…y la disponibilidad de cada servicio no depende del peso', cerca(x.servicios.find(s=>s.servicio_id==='PAGO_SERVICIOS').disponibilidad,1-15/210));
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS'});
const aud=db.prepare("select detalle from auditoria where accion='EDITAR_DISPONIBILIDAD' order by id desc").get();
ok('queda en la auditoría', aud && aud.detalle.includes('Grave 100 %'), aud && aud.detalle);
await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,3,2,1));

// ---- Semáforo (parches 48 y 50): verde = llega al objetivo, amarillo = no llega pero está cerca, rojo = lejos ----
const estadoPago=async(obj)=>{ await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS',objetivo_mensual:obj}); const x=(await P(ck.gero,'?tipo=mes')).j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006'); return {s:x.servicios.find(s=>s.servicio_id==='PAGO_SERVICIOS'), c:x}; };
const dPago=(await estadoPago(0.999)).s.disponibilidad;                       // disponibilidad medida de CLI_006 / PAGO_SERVICIOS (no depende del objetivo)
const objPara=(veces)=>Math.round((1-(1-dPago)/veces)*1e6)/1e6;                // objetivo con el que el tiempo sin servicio es "veces" lo que permite
let e=await estadoPago(objPara(0.8)); ok('llega al objetivo (usa 80 % de lo permitido): verde y cumple', e.s.estado==='verde' && e.s.cumple===true && e.s.disponibilidad>=e.s.objetivo, [e.s.consumo,e.s.estado]);
e=await estadoPago(0.999); ok('96 % de disponibilidad contra un objetivo de 99,9 %: rojo, no verde', e.s.estado==='rojo' && e.s.cumple===false, [e.s.disponibilidad,e.s.consumo,e.s.estado]);
e=await estadoPago(objPara(1.2)); ok('tiempo sin servicio 1,2 veces lo permitido: no cumple pero está cerca = amarillo', e.s.estado==='amarillo' && e.s.cumple===false && cerca(e.s.consumo,1.2,0.01), [e.s.consumo,e.s.estado]);
e=await estadoPago(objPara(2.5)); ok('tiempo sin servicio 2,5 veces lo permitido: no cumple y está lejos = rojo', e.s.estado==='rojo' && e.s.cumple===false && cerca(e.s.consumo,2.5,0.01), [e.s.consumo,e.s.estado]);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',Object.assign(pesos(1,0.5,0,3,2,1),{umbral_amarillo:2}));
ok('el límite del amarillo se puede subir (a 200 %)', r.s===200, r.j);
e=await estadoPago(objPara(1.8)); ok('con el amarillo hasta 200 %, 1,8 veces lo permitido pasa a amarillo', e.s.estado==='amarillo', e.s.estado);
r=await P(ck.gero,'?tipo=mes'); ok('la configuración trae el límite del amarillo', r.j.config_disponibilidad.umbral_amarillo===2);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',Object.assign(pesos(1,0.5,0,3,2,1),{umbral_amarillo:0.5})); ok('un amarillo menor al 100 % se rechaza', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',Object.assign(pesos(1,0.5,0,3,2,1),{umbral_amarillo:11})); ok('…y uno mayor a 1.000 % también', r.s===400);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,3,2,1)); ok('guardar sin el campo conserva el amarillo anterior', r.s===200 && (await P(ck.gero,'?tipo=mes')).j.config_disponibilidad.umbral_amarillo===2);
await call(A,'POST','/api/admin/umbrales/disponibilidad',Object.assign(pesos(1,0.5,0,3,2,1),{umbral_amarillo:1.5}));
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:'CLI_006',servicio_id:'PAGO_SERVICIOS'});
r=await P(ck.gero,'?tipo=mes');
ok('todos los clientes y el global traen su estado', r.j.disponibilidad.clientes.every(c=>['verde','amarillo','rojo'].includes(c.estado) && c.servicios.every(s=>['verde','amarillo','rojo'].includes(s.estado))) && ['verde','amarillo','rojo'].includes(r.j.disponibilidad.global.estado));
ok('estado y cumple coinciden: verde si cumple', r.j.disponibilidad.clientes.every(c=>(c.estado==='verde')===c.cumple));
r=await call(A,'GET','/admin'); ok('Administración tiene el campo del amarillo', r.t.includes('dp-amarillo') && r.t.includes('Semáforo del tablero'));
r=await call(ck.gero,'GET','/');
const iPan=r.t.indexOf('id=\"bloque-panorama\"')>=0?r.t.indexOf('id=\"bloque-panorama\"'):r.t.indexOf('id="bloque-panorama"'), iDisp=r.t.indexOf('id="b-periodo"'), i24=r.t.indexOf('<h2>Últimas 24 horas</h2>');
ok('la disponibilidad va primero, después las tarjetas de Estado por cliente y después Últimas 24 horas (parche 57)', iDisp>0 && iPan>iDisp && i24>iPan, [iDisp,iPan,i24]);
{ const t=r.t, p=(x)=>t.indexOf(x), pd=p('id="panel-disp"'), po=p('id="panel-op"'), ph=p('id="panel-hist"');
  ok('el tablero se agrupa en tres pestañas: Disponibilidad, Operación ahora e Histórico, en ese orden', t.includes('id="pestanas"') && p('id="tab-disp"')>0 && p('id="tab-op"')>p('id="tab-disp"') && p('id="tab-hist"')>p('id="tab-op"') && pd>0 && po>pd && ph>po, [pd,po,ph]);
  ok('Disponibilidad lleva su período, Operación ahora las tarjetas, las 24 horas y las alertas, e Histórico lo demás', pd<p('id="b-periodo"') && p('id="b-periodo"')<po && po<p('id="bloque-panorama"') && p('id="bloque-panorama"')<i24 && i24<p('id="bloque-alertas"') && p('id="bloque-alertas"')<ph && ph<p('Histórico de Alertas') && p('Histórico de Alertas')<p('Clientes con más problemas'));
  ok('el resumen de arriba queda fijo sobre las pestañas', p('id="portada"')>0 && p('id="portada"')<p('id="pestanas"'));
  ok('Operación ahora muestra el número de alertas abiertas', t.includes('id="tab-n-op"') && t.includes('actualizarPestanas(casos)')); }
ok('ya no están los recuadros del período, y sí el resumen por estado y el filtro de estado', !r.t.includes('id="per-kpis"') && r.t.includes('data-dd-grupo') && r.t.includes('data-act-estado') && r.t.includes('Asignada sin tomar'));

// ---- La página del tablero ----
r=await call(ck.gero,'GET','/');
ok('el tablero dibuja la disponibilidad', r.s===200 && r.t.includes('function pintarDispo') && r.t.includes('pintarDispo(r);') && r.t.includes('dd-global'));

// ---- Evolución de la disponibilidad por ventana y desde cuándo se mide (parches 51 y 52) ----
const EST=['verde','amarillo','rojo'];
const ultimo=(t)=>{ for (let i=t.pt.length-1;i>=0;i--) if (t.pt[i]) return t.pt[i]; return null; };
const coincide=(j,lbl)=>{ const g=j.disponibilidad.global, cs=j.disponibilidad.clientes;
  const bien=(x)=>x.tendencia && Array.isArray(x.tendencia.pt) && ultimo(x.tendencia) && cerca(ultimo(x.tendencia)[0],x.disponibilidad,1e-5) && EST[ultimo(x.tendencia)[1]]===x.estado;
  ok('el último punto de la línea es la disponibilidad y el semáforo del período, en el global y en cada cliente ('+lbl+')', bien(g) && cs.every(bien), cs.filter(c=>!bien(c)).map(c=>[c.cliente_id,c.disponibilidad,c.tendencia && ultimo(c.tendencia)]).slice(0,3)); };
const dia0=await P(ck.gero,'?tipo=dia'), sem0=await P(ck.gero,'?tipo=semana'), mes0=await P(ck.gero,'?tipo=mes');
coincide(dia0.j,'día'); coincide(sem0.j,'semana'); coincide(mes0.j,'mes');
ok('con un solo día de datos (la demo) las tres vistas se dibujan por ventana de 15 minutos: Mes ya no queda con un solo punto', dia0.j.disponibilidad.global.tendencia.paso_minutos===15 && sem0.j.disponibilidad.global.tendencia.paso_minutos===15 && mes0.j.disponibilidad.global.tendencia.paso_minutos===15 && mes0.j.disponibilidad.global.tendencia.pt.filter(Boolean).length>=10, [dia0.j.disponibilidad.global.tendencia.pt.length, sem0.j.disponibilidad.global.tendencia.pt.length, mes0.j.disponibilidad.global.tendencia.pt.length]);
const tdia=dia0.j.disponibilidad.global.tendencia;
ok('en la demo (un solo día) hay varias ventanas: la línea del día tiene muchos puntos medidos, no uno solo', tdia.pt.filter(Boolean).length>=10, tdia.pt.filter(Boolean).length);
ok('la línea empieza en el primer momento medido (10:00 de Argentina = 13:00 UTC), con su primer punto ya medido', tdia.inicio_utc==='2026-10-26T13:00:00.000Z' && tdia.pt[0]!==null, tdia.inicio_utc);
ok('en el Mes con un solo día de datos no hay miles de pasos vacíos: los pasos arrancan en el primer momento medido', mes0.j.disponibilidad.global.tendencia.pt.length<=60 && mes0.j.disponibilidad.global.tendencia.inicio_utc==='2026-10-26T13:00:00.000Z', mes0.j.disponibilidad.global.tendencia.pt.length);
// Con la caída de CLI_006 (ventana Grave) la línea acumulada baja y no vuelve a subir de golpe
const t6d=dia0.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006').tendencia.pt.filter(Boolean).map(p=>p[0]);
ok('CLI_006: la disponibilidad acumulada del día baja cuando hay problemas (empieza al 100 % y termina por debajo)', t6d[0]===1 && t6d[t6d.length-1]<t6d[0] && t6d.some((v,i)=>i>0 && v<t6d[i-1]), t6d.slice(0,6));
// Días anteriores armados a mano para CLI_006 / PAGO_SERVICIOS: se empezó a recibir el 20/10 a las 10:00 (hora de Argentina) y el 22/10 hubo una ventana Grave
db.exec("CREATE TEMP TABLE obs_t AS SELECT * FROM core_metricas_observadas WHERE cliente_id='CLI_006' AND servicio_id='PAGO_SERVICIOS' LIMIT 1");
// (más la ventana de la medianoche del 21 y del 22: con datos continuos, la primera ventana de cada día está al principio del día)
for (const [id,ini,fin] of [['t1','2026-10-20T13:00:00.000Z','2026-10-20T13:15:00.000Z'],['t0','2026-10-21T03:00:00.000Z','2026-10-21T03:15:00.000Z'],['t3','2026-10-22T03:00:00.000Z','2026-10-22T03:15:00.000Z'],['t2','2026-10-22T13:00:00.000Z','2026-10-22T13:15:00.000Z']]) {
  db.exec("UPDATE obs_t SET metrica_id='MET-TEND-"+id+"', ventana_inicio='"+ini+"', ventana_fin='"+fin+"'");
  db.exec("INSERT INTO core_metricas_observadas SELECT * FROM obs_t");
}
db.exec("CREATE TEMP TABLE al_t AS SELECT * FROM alertas_historico WHERE cliente_id='CLI_006' AND servicio_id='PAGO_SERVICIOS' AND severidad='CRITICA' AND tipo_alerta NOT IN ('DATO_TARDIO','DATO_INCONSISTENTE','SIN_PREDICCION') LIMIT 1");
db.exec("UPDATE al_t SET alerta_id=lower(hex(randomblob(16))), ventana_inicio='2026-10-22T13:00:00Z', ventana_fin='2026-10-22T13:15:00Z', estado='RESUELTA', fecha_resolucion='2026-10-22T13:20:00Z', motivo_resolucion='MANUAL', asignado_usuario_id=NULL, asignado_equipo_id=NULL");
db.exec("INSERT INTO alertas_historico SELECT * FROM al_t");
// …y una ventana de CLI_003 / RECARGA_CELULAR el 1/10: con más de 8 días medidos, el Mes se dibuja con un punto por día
db.exec("CREATE TEMP TABLE obs_u AS SELECT * FROM core_metricas_observadas WHERE cliente_id='CLI_003' AND servicio_id='RECARGA_CELULAR' LIMIT 1");
db.exec("UPDATE obs_u SET metrica_id='MET-TEND-u1', ventana_inicio='2026-10-01T03:00:00.000Z', ventana_fin='2026-10-01T03:15:00.000Z'"); db.exec("INSERT INTO core_metricas_observadas SELECT * FROM obs_u");
const sem1=await P(ck.gero,'?tipo=semana&fecha=2026-10-22'); ok('con 6 días de datos la Semana (19 al 25/10) se dibuja por hora', sem1.j.disponibilidad.global.tendencia.paso_minutos===60, sem1.j.disponibilidad.global.tendencia.paso_minutos);
const mes1=await P(ck.gero,'?tipo=mes'); ok('con más de 8 días de datos el Mes se dibuja por día', mes1.j.disponibilidad.global.tendencia.paso_minutos===1440, mes1.j.disponibilidad.global.tendencia.paso_minutos); const c6m=mes1.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006'), pm6=c6m.tendencia.pt;
coincide(mes1.j,'mes, con datos de varios días');
ok('en Mes: sin puntos antes del 20/10 (indice 18 = 19/10) y el 20/10 (indice 19) al 100 %', pm6[18]===null && pm6[19] && cerca(pm6[19][0],1), [pm6[18],pm6[19]]);
ok('…el 22/10 (indice 21) acumula 1 ventana Grave sobre 248 medidas desde el 20/10 a las 10:00: 99,60 %', pm6[21] && cerca(pm6[21][0],1-1/248,1e-5), pm6[21]);
ok('…y el 21/10 (indice 20) todavía estaba al 100 %', pm6[20] && cerca(pm6[20][0],1));
const sem22=await P(ck.gero,'?tipo=dia&fecha=2026-10-22'); const c6x=sem22.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006');
coincide(sem22.j,'día 22/10');
ok('el día 22/10 tiene 96 puntos (uno por ventana), todos medidos, y termina en 98,96 %', c6x.tendencia.pt.length===96 && c6x.tendencia.pt.every(Boolean) && cerca(c6x.disponibilidad,1-1/96,1e-5), [c6x.tendencia.pt.length, ultimo(c6x.tendencia)]);
const p22=c6x.tendencia.pt; const i1=p22.findIndex(p=>p && p[0]<1);
ok('…la línea del 22/10 está al 100 % hasta la ventana Grave y baja justo ahí (ventana 40 = 10:00 locales, 41 medidas hasta ese momento)', i1===40 && cerca(p22[i1][0],1-1/41,1e-5) && p22[i1][1]===2, [i1,p22[i1]]);
ok('la página trae el gráfico de evolución en el desplegable de cada cliente', (await call(ck.gero,'GET','/')).t.includes('Evolución de la disponibilidad'));
ok('una consulta por servicio por el índice de ventana_inicio, sin recorrer toda la tabla', /USING (COVERING )?INDEX/i.test(JSON.stringify(db.prepare("EXPLAIN QUERY PLAN SELECT o.ventana_inicio FROM core_metricas_observadas o WHERE o.ventana_inicio >= '2026-10-01T03:00:00' AND o.cliente_id='CLI_006' AND o.servicio_id='PAGO_SERVICIOS' ORDER BY o.ventana_inicio LIMIT 1").all())));
// Rangos con Desde / Hasta (parche 56): el paso de la evolución sale de la duración y de lo medido, y el último punto sigue siendo el número de arriba
const rg7=await P(ck.gero,'?desde=2026-10-20&hasta=2026-10-26'); coincide(rg7.j,'rango de 7 días');
ok('un rango de 7 días va de a una hora', rg7.j.disponibilidad.global.tendencia.paso_minutos===60, rg7.j.disponibilidad.global.tendencia.paso_minutos);
const rg1=await P(ck.gero,'?desde=2026-10-22&hasta=2026-10-22'); coincide(rg1.j,'rango de un día');
ok('un rango de un día va de a 15 minutos y es igual al día 22/10', rg1.j.disponibilidad.global.tendencia.paso_minutos===15 && JSON.stringify(rg1.j.disponibilidad)===JSON.stringify(sem22.j.disponibilidad));
db.exec("UPDATE obs_t SET metrica_id='MET-TEND-v10', ventana_inicio='2026-10-10T13:00:00.000Z', ventana_fin='2026-10-10T13:15:00.000Z'"); db.exec("INSERT INTO core_metricas_observadas SELECT * FROM obs_t");
const rg17=await P(ck.gero,'?desde=2026-10-10&hasta=2026-10-26'); coincide(rg17.j,'rango de 17 días');
ok('un rango de 17 días con más de una semana de datos va de a un día', rg17.j.disponibilidad.global.tendencia.paso_minutos===1440, rg17.j.disponibilidad.global.tendencia.paso_minutos);
ok('…y una sola ventana Grave en el 22/10 baja la línea ese día (indice 12 desde el 10/10), no antes', (()=>{ const t=rg17.j.disponibilidad.clientes.find(c=>c.cliente_id==='CLI_006').tendencia; return t.pt[11] && t.pt[11][0]===1 && t.pt[12] && t.pt[12][0]<1; })());
const rgIz=await P(ck.gero,'?desde=2026-10-10&hasta=2026-10-26&liviano=1');
ok('liviano trae la misma línea y el mismo número, sin período anterior', JSON.stringify(rgIz.j.disponibilidad)===JSON.stringify(rg17.j.disponibilidad) && rgIz.j.disponibilidad_anterior===null);
db.exec("DELETE FROM core_metricas_observadas WHERE metrica_id LIKE 'MET-TEND-%'"); db.exec("DELETE FROM alertas_historico WHERE ventana_inicio='2026-10-22T13:00:00Z' AND cliente_id='CLI_006'");

// ---- Sin el script 20 (sin las columnas nuevas) ----
db.exec('ALTER TABLE alerta_parametros DROP COLUMN disponibilidad_config');
r=await P(ck.gero,'?tipo=mes');
ok('sin la columna de pesos el tablero sigue con los de fábrica y avisa', r.s===200 && r.j.disponibilidad_instalada===false && r.j.config_disponibilidad.pesos_gravedad.ALTA===0.5 && r.j.disponibilidad.global!==null);
r=await call(A,'GET','/api/admin/umbrales'); ok('Administración avisa que falta el script', r.s===200 && r.j.disponibilidad.instalado===false);
r=await call(A,'POST','/api/admin/umbrales/disponibilidad',pesos(1,0.5,0,3,2,1)); ok('y no deja guardar los pesos (409 con el nombre del script)', r.s===409 && /20_disponibilidad/.test(r.j.error), r.j.error);

// ---- Textos del tablero (parche 50) ----
r=await call(ck.gero,'GET','/');
ok('el texto largo de cómo se mide ya no está y queda la línea corta', !r.t.includes('Se mide en ventanas de 15 minutos de cada servicio') && !r.t.includes('define el Administrador') && r.t.includes('Cuenta como sin servicio: alerta Grave = '));
ok('la barra tiene la marca de lo que permite el objetivo y el texto cuenta minutos sin servicio contra los permitidos', r.t.includes('La marca indica lo que permite el objetivo') && r.t.includes('sin servicio; el objetivo permite hasta '));
ok('ya no habla del margen de errores del mes', !r.t.includes('margen de errores del mes') && !r.t.includes('Objetivo del mes'));

console.log(fallas ? '\nHAY '+fallas+' FALLAS' : '\nTODO OK');
process.exit(fallas?1:0);
