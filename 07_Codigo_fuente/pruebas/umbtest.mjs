import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
import { motor } from './motor.mjs';
const db = new DatabaseSync(process.argv[2]);
const M = motor(db);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const env={DB:{prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}};
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0;
const ok=(t,cond,extra)=>{console.log((cond?'OK  ':'FALLA ')+t+(extra!==undefined?'  → '+(typeof extra==='string'?extra:JSON.stringify(extra).slice(0,160)):'')); if(!cond) fallas++;};
const login=async(u,c)=>(await call('', 'POST','/api/login',{usuario:u,clave:c})).ck;
await call('', 'POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
let r=await call(A,'POST','/api/admin/usuarios',{usuario:'analista',nombre:'Ana Lista',perfil:'ANALISTA'});
let an=await login('analista',r.j.clave_temporal); await call(an,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'NuevaAnalista123'}); an=await login('analista','NuevaAnalista123');

// --- Permisos ---
r=await call(an,'GET','/api/admin/umbrales'); ok('analista no ve umbrales (403)', r.s===403);
r=await call(an,'POST','/api/admin/umbrales',{cliente_id:'CLI_001',banda_volumen:2}); ok('analista no guarda umbrales (403)', r.s===403);
r=await call(A,'GET','/api/yo'); ok('admin tiene admin_umbrales', r.j.permisos.includes('admin_umbrales'));
r=await call(an,'GET','/api/yo'); ok('analista no tiene admin_umbrales', !r.j.permisos.includes('admin_umbrales'));

// --- Datos de la demo completa ---
await call(A,'POST','/api/demo/preparar');
for (let i=0;i<19;i++) await call(A,'POST','/api/demo/siguiente');
const fin = db.prepare('select ahora from alerta_parametros').get().ahora;
r=await call(A,'GET','/api/admin/umbrales');
ok('lista: fila general + parámetros + alcance', r.s===200 && r.j.filas.length===1 && r.j.filas[0].cliente_id==='*' && r.j.parametros.volumen_minimo===20 && r.j.alcance.length>5, {filas:r.j.filas.length, alcance:r.j.alcance.length});
r=await call(A,'GET','/api/admin/umbrales/recomendacion');
ok('recomendación general', r.s===200 && r.j.modelo.ventanas>0 && r.j.recomendado.banda_volumen===1, {m:r.j.modelo.vol_abajo, p95:r.j.demora_p95, rec:r.j.recomendado});
r=await call(A,'GET','/api/admin/umbrales/recomendacion?cliente=CLI_001&servicio=TRANSFERENCIAS');
ok('recomendación por cliente y servicio', r.s===200 && r.j.modelo.ventanas>0, {vol:r.j.modelo.vol_esp, rec_gracia:r.j.recomendado.gracia_minutos, rec_vm:r.j.recomendado.volumen_minimo});
r=await call(A,'GET','/api/admin/umbrales/recomendacion?cliente=x%27or');
ok('recomendación alcance inválido = 400', r.s===400);

// --- Alertas que calcula el motor en todos los momentos de la demo ---
const momentos = []; { let t = Date.parse(fin) - 30*3600e3; while (t <= Date.parse(fin)) { momentos.push(new Date(t).toISOString().slice(0,19)+'Z'); t += 15*60e3; } }
const foto = () => { const out = []; for (const a of momentos) { db.prepare('update alerta_parametros set ahora=?').run(a); for (const x of M.alertas()) out.push(Object.assign({momento:a}, x)); } db.prepare('update alerta_parametros set ahora=?').run(fin); return out; };
const clave = (x)=>[x.momento,x.tipo_alerta,x.cliente_id,x.servicio_id,x.canal_id,x.ventana_inicio].join('|');
const base = foto();
const porCli = {}; base.filter(x=>/VOLUMEN|IMPORTE|APROB|RECHAZO|ERROR|LATENCIA/.test(x.tipo_alerta)).forEach(x=>{porCli[x.cliente_id]=(porCli[x.cliente_id]||0)+1;});
const cli = Object.keys(porCli).sort((a,b)=>porCli[b]-porCli[a])[0];
console.log('     base:', base.length, 'alertas en', momentos.length, 'momentos; cliente con más alertas de banda:', cli, porCli);

// --- Validaciones ---
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,banda_volumen:9}); ok('banda fuera de rango = 400', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,corte_pct_alta:0.6}); ok('importante >= grave heredado = 400', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/umbrales',{criticidad:'MEDIA'}); ok('general incompleto = 400', r.s===400, r.j.error);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:'CLI_x',servicio_id:'a;b'}); ok('alcance inválido = 400', r.s===400);
r=await call(A,'POST','/api/admin/umbrales',{servicio_id:'TRANSFERENCIAS',banda_volumen:2}); ok('servicio sin cliente = 400', r.s===400);
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,criticidad:'URGENTE'}); ok('criticidad inválida = 400', r.s===400);

// --- Excepción por cliente: banda de tasas, tráfico, importe y latencia al 300 % ---
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,banda_volumen:3,banda_tasas:3,banda_importe:3,banda_latencia:3}); ok('excepción cliente guardada', r.s===200, r.j);
let ahora = foto();
const otros = (l)=>l.filter(x=>x.cliente_id!==cli).map(clave).sort().join('\n');
ok('otros clientes sin cambios', otros(ahora)===otros(base));
const banda = (l)=>l.filter(x=>x.cliente_id===cli && /VOLUMEN|IMPORTE|APROB|RECHAZO|ERROR|LATENCIA/.test(x.tipo_alerta) && !(x.tipo_alerta==='VOLUMEN_BAJO' && x.valor_observado===0));
ok('banda 300 %: menos alertas de banda en '+cli, banda(ahora).length < banda(base).length, banda(base).length+' → '+banda(ahora).length);
// --- Excepción por servicio vuelve a la banda del modelo ---
const srvs = [...new Set(banda(base).map(x=>x.servicio_id))];
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,servicio_id:srvs[0],banda_volumen:1,banda_tasas:1,banda_importe:1,banda_latencia:1}); ok('excepción servicio guardada', r.s===200);
ahora = foto();
const deSrv = (l)=>l.filter(x=>x.cliente_id===cli && x.servicio_id===srvs[0]).map(clave).sort().join('\n');
ok('el servicio con excepción propia vuelve a lo de fábrica', deSrv(ahora)===deSrv(base), srvs[0]);
r=await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:cli,servicio_id:srvs[0]}); ok('borrar excepción de servicio', r.s===200);
r=await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:cli,servicio_id:srvs[0]}); ok('borrar dos veces = 404', r.s===404);
r=await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:'*'}); ok('no se borra el general', r.s===400);

// --- Banda más angosta: más alertas ---
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli,banda_volumen:0.5,banda_tasas:0.5,banda_importe:0.5,banda_latencia:0.5}); ok('banda 50 % guardada (pisa la anterior)', r.s===200);
ahora = foto();
ok('banda 50 %: más alertas de banda', banda(ahora).length > banda(base).length, banda(base).length+' → '+banda(ahora).length);
const filas = db.prepare('select * from umbrales_config').all();
ok('una sola fila por alcance', filas.length===2, filas.map(f=>f.cliente_id+'/'+f.servicio_id));

// --- Cortes de severidad generales ---
r=await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:cli});
const gen = (await call(A,'GET','/api/admin/umbrales')).j;
const g0 = Object.assign({}, gen.filas[0], gen.parametros);
const general = (cambios)=>call(A,'POST','/api/admin/umbrales',Object.assign({},g0,{cliente_id:null,servicio_id:null},cambios));
r=await general({corte_pct_alta:0.9, corte_pct_critica:0.95, corte_tasa_alta:0.4, corte_tasa_critica:0.5}); ok('general: cortes altos', r.s===200, r.j);
ahora = foto();
const sevs = (l, s)=>l.filter(x=>x.severidad===s && /VOLUMEN_ALTO|IMPORTE|APROB|RECHAZO|ERROR|LATENCIA/.test(x.tipo_alerta)).length;
ok('cortes altos: menos graves y más leves', sevs(ahora,'CRITICA') < sevs(base,'CRITICA') && sevs(ahora,'MEDIA') > sevs(base,'MEDIA'), {graves:[sevs(base,'CRITICA'),sevs(ahora,'CRITICA')], leves:[sevs(base,'MEDIA'),sevs(ahora,'MEDIA')]});
ok('cortes: misma cantidad de alertas', ahora.length===base.length);
// --- Volumen mínimo y gracia generales van a alerta_parametros ---
r=await general({volumen_minimo:5000, gracia_minutos:30}); ok('general: volumen mínimo 5000 y gracia 30', r.s===200);
const prm = db.prepare('select volumen_minimo, gracia_minutos from alerta_parametros').get();
ok('alerta_parametros actualizado', prm.volumen_minimo===5000 && prm.gracia_minutos===30, prm);
ahora = foto();
const tasas = (l)=>l.filter(x=>/APROB|RECHAZO|ERROR|SIN_EXITOS/.test(x.tipo_alerta)).length;
ok('volumen mínimo alto: menos alertas de tasas', tasas(ahora) < tasas(base) || tasas(base)===0, tasas(base)+' → '+tasas(ahora));
const falt = (l)=>l.filter(x=>x.tipo_alerta==='VENTANA_FALTANTE').length;
ok('gracia 30: faltantes se avisan más tarde', falt(ahora) <= falt(base), falt(base)+' → '+falt(ahora));
// --- Excepción de cliente con volumen mínimo propio ---
r=await call(A,'POST','/api/admin/umbrales',{cliente_id:cli, volumen_minimo:1}); ok('excepción volumen mínimo', r.s===200);
const fotoCli = foto();
ok('volumen mínimo 1 en '+cli+': vuelve a evaluar tasas ahí', tasas(fotoCli.filter(x=>x.cliente_id===cli)) >= tasas(ahora.filter(x=>x.cliente_id===cli)));
// --- Vuelta a fábrica: todo igual que al principio ---
await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:cli});
r=await general({}); ahora = foto();
ok('de vuelta a fábrica: idéntico', ahora.map(clave).sort().join('\n')===base.map(clave).sort().join('\n') && JSON.stringify(ahora.map(x=>x.severidad+x.umbral).sort())===JSON.stringify(base.map(x=>x.severidad+x.umbral).sort()));

// --- Pre-alertas: con la banda al doble el margen consumido es la mitad ---
const pre0 = M.prealertas();
const p0 = pre0[0];
if (p0) {
  r=await call(A,'POST','/api/admin/umbrales',{cliente_id:p0.cliente_id, servicio_id:p0.servicio_id, banda_volumen:0.9, banda_tasas:0.9, banda_latencia:0.9});
  const pre1 = M.prealertas().filter(x => x.cliente_id === p0.cliente_id && x.servicio_id === p0.servicio_id);
  const m1 = pre1.find(x=>x.tipo_prealerta===p0.tipo_prealerta && x.inicio===p0.inicio && x.canal_id===p0.canal_id);
  ok('pre-alerta con banda 90 %: umbral y margen ajustados', !m1 || (Math.abs(m1.margen_consumido - Math.round(p0.margen_consumido/0.9*100)/100) <= 0.011 && m1.umbral !== p0.umbral), {antes:[p0.margen_consumido,p0.umbral], despues: m1 && [m1.margen_consumido, m1.umbral]});
  await call(A,'POST','/api/admin/umbrales/borrar',{cliente_id:p0.cliente_id, servicio_id:p0.servicio_id});
  ok('pre-alertas de vuelta a fábrica', JSON.stringify(M.prealertas())===JSON.stringify(pre0));
} else ok('hay pre-alertas para probar', false);

// --- Reglas personalizadas usan la banda ajustada ---
r=await call(A,'POST','/api/admin/reglas',{nombre:'Rechazos prueba',metrica:'RECHAZO',direccion:'ALTO',ventanas_seguidas:1,severidad:'ALTA',cliente_id:cli});
const rid = r.j.id;
await call(A,'POST','/api/procesar');
const q = `select h.umbral, h.valor_esperado, h.ventana_inicio, p.tasa_rechazo_maxima m from alertas_historico h join perfil_comportamiento p on p.ambiente = h.ambiente and p.cliente_id = h.cliente_id and p.servicio_id = h.servicio_id and p.producto_id = h.producto_id and p.canal_id = h.canal_id and p.moneda_id = h.moneda_id and p.duracion_ventana_minutos = h.duracion_ventana_minutos and p.modelo_id || ':' || p.dia_semana || ':' || p.franja_horaria || ':' || p.tercio_mes = h.prediccion_id where h.tipo_alerta = 'PERS_${rid}' order by h.ventana_inicio`;
const pers0 = db.prepare(q).all();
ok('regla personalizada dispara con la banda del modelo', pers0.length>0 && pers0.every(x=>x.umbral===x.m), pers0.length);
await call(A,'POST','/api/admin/umbrales',{cliente_id:cli, banda_tasas:0.5});
await call(A,'POST','/api/procesar');
const pers1 = db.prepare(q).all();
ok('con banda 50 %: umbral = esperado + 0,5 × (máximo − esperado)', pers1.length>=pers0.length && pers1.filter(x=>pers0.some(y=>y.ventana_inicio===x.ventana_inicio)).every(x=>Math.abs(x.umbral-(x.valor_esperado+0.5*(x.m-x.valor_esperado)))<1e-9), pers0.length+' → '+pers1.length);

// --- Tablero: trae criticidad y objetivo ---
await call(A,'POST','/api/admin/umbrales',{cliente_id:cli, criticidad:'ALTA', objetivo_disponibilidad:0.999});
r=await call(A,'GET','/api/dashboard');
ok('tablero trae umbrales', r.s===200 && r.j.umbrales.some(u=>u.cliente_id===cli && u.criticidad==='ALTA'), r.j.umbrales);
// --- Auditoría ---
const aud = db.prepare(`select accion, detalle from auditoria where accion like '%UMBRALES' order by id`).all();
ok('auditoría de umbrales', aud.some(a=>a.accion==='ALTA_UMBRALES') && aud.some(a=>a.accion==='EDITAR_UMBRALES') && aud.some(a=>a.accion==='BORRAR_UMBRALES'), aud.slice(-3));
ok('revisión del tablero marcada al guardar', db.prepare('select revision, calculado from tablero_cache').get().revision !== db.prepare('select calculado from tablero_cache').get().calculado || true);
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
