import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/w.mjs';
// Prueba del contexto externo del asistente (patch29): calendario, proveedores y noticias con caché de una hora,
// permisos, consumo de D1, fallas de las fuentes y la pantalla de eventos comerciales. Internet y el modelo, simulados.
const db = new DatabaseSync(process.argv[2]);
let consultas = 0, escrituras = 0;
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){consultas++;return{results:db.prepare(sql).all(...b),meta:{}}},async first(){consultas++;return db.prepare(sql).get(...b)??null},async run(){consultas++;const r=db.prepare(sql).run(...b);escrituras+=Number(r.changes);return{meta:{changes:Number(r.changes)}}},_exec(){consultas++;const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/returning/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);escrituras+=Number(r.changes);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};

// Internet simulado
const pedidosWeb = []; let webCaida = false, googleCaido = false;
globalThis.fetch = async (url, op) => {
  url = String(url); pedidosWeb.push(url);
  if (webCaida) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  const j = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://www.cloudflarestatus.com/api/v2/incidents/unresolved.json'))
    return j({ incidents: [
      { name: 'Demoras en el DNS de Sudamérica', status: 'identified', impact: 'major', created_at: '2026-11-13T12:10:00Z', shortlink: 'https://stspg.io/abc', components: [{ name: 'Buenos Aires, Argentina - (EZE)' }] },
      { name: 'Elevated errors on Workers startup', status: 'identified', impact: 'minor', created_at: '2026-11-13T13:54:00Z', shortlink: 'https://stspg.io/wrk', components: [{ name: 'Workers' }] },
      { name: 'Workers changes not producing subscription events', status: 'identified', impact: 'minor', created_at: '2026-11-10T01:53:00Z', components: [] } ] });
  if (url.startsWith('https://www.cloudflarestatus.com/api/v2/scheduled-maintenances/upcoming.json'))
    return j({ scheduled_maintenances: [{ name: 'SIN (Singapore) on 2026-11-13', scheduled_for: new Date(Date.now() + 3600000).toISOString(), scheduled_until: new Date(Date.now() + 5 * 3600000).toISOString() }] });
  if (url.startsWith('https://status.twilio.com/api/v2/incidents/unresolved.json'))
    return j({ incidents: [
      { name: 'Increased failures in SNA and Lookup API in the United Kingdom', status: 'investigating', impact: 'minor', created_at: '2026-11-13T14:47:00Z' },
      { name: 'Delays in email delivery to Microsoft inboxes', status: 'identified', impact: 'minor', created_at: '2026-11-12T19:42:00Z' },
      { name: 'SMS delivery failures to Claro Costa Rica', status: 'investigating', impact: 'minor', created_at: '2026-11-12T22:31:00Z' },
      { name: 'Voice calls failing from Twilio numbers in Philippines', status: 'identified', impact: 'minor', created_at: '2026-11-02T05:41:00Z' },
      { name: 'SMS Delivery Receipt failures to Claro Costa Rica', status: 'investigating', impact: 'minor', created_at: '2026-11-12T22:31:00Z', components: [{ name: 'Latin America' }] },
      { name: 'Silent or one-way audio on calls from Colombia to some Twilio numbers', status: 'identified', impact: 'minor', created_at: '2026-11-12T16:53:00Z', components: [{ name: 'South America' }] } ] });
  if (url.startsWith('https://status.twilio.com/api/v2/scheduled-maintenances/upcoming.json'))
    return j({ scheduled_maintenances: [{ name: 'Mantenimiento de SMS en Argentina', scheduled_for: new Date(Date.now() + 20 * 3600000).toISOString(), scheduled_until: new Date(Date.now() + 22 * 3600000).toISOString(), shortlink: 'https://stspg.io/xyz' }] });
  if (url.startsWith('https://news.google.com/rss/search')) {
    if (googleCaido) return new Response('no', { status: 503 });
    const f = (h) => new Date(Date.now() - h * 3600000).toUTCString();
    return new Response('<?xml version="1.0"?><rss><channel><title>Google</title>' +
      '<item><title>La Bancaria anunció un paro para el lunes - Ámbito</title><link>https://news.google.com/rss/articles/abc</link><pubDate>' + f(2) + '</pubDate><source url="https://www.ambito.com">Ámbito</source></item>' +
      '<item><title><![CDATA[Mercado Pago &amp; billeteras: cambios en transferencias - Clarín]]></title><link>https://news.google.com/rss/articles/def</link><pubDate>' + f(5) + '</pubDate><source url="https://www.clarin.com">Clarín</source></item>' +
      '<item><title>Nota vieja - La Nación</title><link>https://news.google.com/rss/articles/old</link><pubDate>' + f(80) + '</pubDate><source url="https://www.lanacion.com.ar">La Nación</source></item>' +
      '</channel></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  }
  if (url.startsWith('https://api.gdeltproject.org/'))
    return j({ articles: [
      { url: 'https://www.ambito.com/paro-bancario', title: 'La Bancaria anunció un paro para el lunes', seendate: '20261113T140000Z', domain: 'ambito.com' },
      { url: 'https://www.ambito.com/paro-bancario-2', title: 'La Bancaria anunció un paro para el lunes ', seendate: '20261113T141500Z', domain: 'ambito.com' },
      { url: 'http://inseguro.com/x', title: 'Sin https', seendate: '20261113T140000Z', domain: 'inseguro.com' },
    ] });
  return new Response('no', { status: 404 });
};

const pedidos = []; let guion = [];
const AI = { async run(modelo, p) { pedidos.push({ modelo, p: JSON.parse(JSON.stringify(p)) }); const f = guion.shift(); return f ? f(p) : { response: 'Respuesta de prueba.' }; } };
const texto = (t) => ({ choices: [{ message: { content: t } }] });
let env = { DB, AI, CONTEXTO_CALENDARIO: 'demo' };   // el calendario sigue el reloj de la prueba (sin esto usa la fecha real)
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{waitUntil(){}});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,300)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123'); const ck={ADMIN:A};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
await call(A,'POST','/api/demo/preparar');
db.prepare("UPDATE umbrales_config SET criticidad = 'ALTA' WHERE cliente_id = '*' AND servicio_id = '*'").run();
const reloj=(iso)=>db.prepare('UPDATE alerta_parametros SET ahora = ?1 WHERE id = 1').run(iso);
const datos=(i)=>{ const c=pedidos[i].p.messages.at(-1).content; const k=c.indexOf('Datos de Helios para responder (JSON):\n'); return JSON.parse(c.slice(k+39).split('\n\nCómo responder:')[0].replace(/ \/no_think$/,'')); };

// ---------- Calendario: con el reloj de la demo usa la fecha real (caso real 13/11: mezclaba 26/10 con proveedores de hoy) ----------
{ const e0=env; env={ DB, AI, CONTEXTO_EXTERNO: 'apagado' }; reloj('2026-10-26T13:00:00Z'); pedidos.length=0; guion=[()=>texto('ok')];
  await call(ck.gero,'POST','/api/asistente',{sugerencia:'contexto'});
  const hoyReal=new Date(Date.now()-3*3600000).toISOString(); const dd=hoyReal.slice(8,10)+'/'+hoyReal.slice(5,7);
  const c=datos(0).contexto_externo; ok('calendario con la fecha real si el reloj de la demo está puesto', c.calendario[0].fecha===dd && /fecha real/.test(c.reloj_helios), [c.calendario[0].fecha, c.reloj_helios]);
  env=e0; }

// ---------- Sugerencia en todos los perfiles ----------
for (const u of ['ADMIN','ana','sol','gero']) { const r=await call(ck[u],'GET','/api/asistente'); ok(u+': tiene la pregunta "¿Hay algo de afuera…?"', r.j.sugerencias.some(s=>s.id==='contexto'), r.j.sugerencias.map(s=>s.texto)); }

// ---------- Soporte: pregunta libre del caso real ----------
reloj('2026-11-20T15:00:00Z');   // viernes 20/11 12:00, antes del fin de semana largo del 23
pedidos.length=0; pedidosWeb.length=0; guion=[()=>texto('El lunes 23 es feriado y Twilio tiene un mantenimiento de SMS.')];
let r=await call(ck.sol,'POST','/api/asistente',{pregunta:'Hay agentes externos que pueden afectar mi trabajo hoy o mañana?'});
ok('soporte: la pregunta trae el contexto externo junto con sus alertas, en una sola llamada', r.s===200 && r.j.herramientas.includes('contexto_externo') && r.j.herramientas.includes('mis_alertas') && pedidos.length===1, r.j.herramientas);
let d=datos(0).contexto_externo;
ok('consulta 2 proveedores (incidentes y mantenimientos) y noticias: 5 pedidos a internet', pedidosWeb.length===5, pedidosWeb);
ok('calendario: fin de semana largo del 21 al 23 y feriado del lunes', JSON.stringify(d.calendario).includes('Fin de semana largo (3 días, del 21/11 al 23/11)') , d.calendario.map(x=>x.fecha+': '+x.notas.join(' | ')));
ok('proveedores: lo de Argentina (DNS en EZE, mantenimiento de SMS) queda, con impacto y lugar', d.proveedores.argentina_o_region.some(x=>/DNS/.test(x.titulo)&&x.impacto==='importante'&&/EZE/.test(x.afecta)) && d.proveedores.argentina_o_region.some(x=>x.tipo==='Mantenimiento programado'), d.proveedores);
// Caso real (13/11): la respuesta listó incidentes de Reino Unido, Filipinas, Costa Rica, India y un mantenimiento en Singapur
ok('caso real: lo de otros países se descarta, también Costa Rica y Colombia aunque digan "Latin America", y lo menor sin lugar', d.proveedores.otros_paises_descartados===6 && d.proveedores.menores_sin_lugar_descartados===2 && !JSON.stringify(d.proveedores.argentina_o_region).match(/Kingdom|Costa Rica|Philippines|Singapore|Microsoft/), d.proveedores);
ok('caso real: los errores de Cloudflare Workers van aparte y primero, como algo que afecta a Helios mismo', d.proveedores.afectan_a_helios.length===1 && /^HELIOS MISMO/.test(d.puntos_clave[0]) && /Más errores al iniciar Workers/.test(d.puntos_clave[0]), d.puntos_clave[0]);
// Caso real (13/11, parche 29e): "Event Subscription" de Workers figuraba como que afectaba a Helios (Helios no usa esa función)
ok('caso real: "subscription events" de Workers no va en Helios (no lo usa) y se descarta como menor', !/subscription/i.test(JSON.stringify(d.proveedores.afectan_a_helios)), d.proveedores.afectan_a_helios);
// Caso real (13/11, 29e): los títulos de Cloudflare quedaban en inglés; ahora el servidor los pasa al español
ok('títulos en español armados en el servidor (el original queda aparte)', !/Elevated errors/.test(d.puntos_clave.join(' ')) && d.proveedores.afectan_a_helios[0].titulo==='Elevated errors on Workers startup', d.puntos_clave[0]);
ok('título que ya está en español queda igual', d.proveedores.argentina_o_region.some(x=>x.titulo_es==='Demoras en el DNS de Sudamérica'));
// Caso real (13/11, 29e): el modelo copiaba "Proveedores (Cloudflare, Twilio (SMS y códigos de verificación)):"; ahora la frase viene armada
ok('proveedores: nombres cortos, sin la etiqueta con paréntesis', /^PROVEEDORES: /.test(d.puntos_clave[2]) && !/\(SMS y códigos/.test(d.puntos_clave[2]), d.puntos_clave[2]);
// Caso real (13/11, 29e): "Qué vigilar" salía genérico; ahora el servidor lo cruza con lo que se ve en Helios
ok('qué vigilar concreto: incidente de Workers → el tablero puede fallar; mantenimiento de SMS → códigos', /^QUÉ VIGILAR: /.test(d.puntos_clave.at(-1)) && /tablero/.test(d.puntos_clave.at(-1)) && /códigos por SMS/.test(d.puntos_clave.at(-1)), d.puntos_clave.at(-1));
ok('caso real: los puntos clave siempre traen calendario, proveedores y noticias', /^CALENDARIO: hoy \(viernes 20\/11\)/.test(d.puntos_clave[1]) && /^PROVEEDORES/.test(d.puntos_clave[2]) && /no las menciones/.test(d.puntos_clave[2]) && /^NOTICIAS/.test(d.puntos_clave[3]) && /Ámbito/.test(d.puntos_clave[3]), d.puntos_clave);
ok('las instrucciones piden títulos exactos (Helios solo si hay algo, sin copiar la aclaración), traducir, enlaces y no sumar otros países', /títulos exactos/.test(d.como_usarlo) && /únicamente si puntos_clave trae HELIOS MISMO/.test(d.como_usarlo) && /ya están en español/.test(d.como_usarlo) && /QUÉ VIGILAR/.test(d.como_usarlo) && /otros países/.test(d.como_usarlo));
ok('noticias de Google Noticias: título sin el medio, medio aparte, entidades resueltas y sin las de más de 48 h', d.noticias.noticias.length===2 && d.noticias.noticias[0].titulo==='La Bancaria anunció un paro para el lunes' && d.noticias.noticias[0].medio==='Ámbito' && d.noticias.noticias[1].titulo==='Mercado Pago & billeteras: cambios en transferencias' && /Google Noticias/.test(d.noticias.fuente), d.noticias);
ok('soporte no recibe la lista de servicios críticos de los clientes', d.servicios_criticos===undefined);
const sis=pedidos[0].p.messages[0].content;
ok('instrucciones: lo de afuera solo con contexto_externo, citando la fuente', /solo con los datos de la herramienta contexto_externo/.test(sis) && /citá de dónde sale/.test(sis) && /Solo puedo ayudarte/.test(sis));

// Caso real (13/11): los enlaces de Google Noticias son larguísimos; el modelo los copiaba mal y la respuesta se cortaba
const alModelo=pedidos[0].p.messages.at(-1).content;
ok('al modelo no le llega ninguna dirección web: solo códigos cortos ([E1], [N1])', !/https?:\/\//.test(alModelo) && /\[E1\]/.test(alModelo) && /\[N1\]/.test(alModelo), alModelo.slice(0,200));
pedidos.length=0; guion=[()=>texto('**Noticias**\n- Paro bancario el lunes [N1]\n- Mercado Pago [más info](N2)\n- Prioridad (P1) sin cambios, DNS [E1] y uno inventado [N9]')];
r=await call(ck.ana,'POST','/api/asistente',{pregunta:'¿Hay algo de afuera que pueda afectar hoy o mañana?'});
ok('el servidor cambia los códigos por los enlaces reales, deja la prioridad (P1) y borra códigos inventados', r.j.respuesta.includes('[más info](https://news.google.com/rss/articles/abc)') && r.j.respuesta.includes('[más info](https://news.google.com/rss/articles/def)') && r.j.respuesta.includes('(P1)') && r.j.respuesta.includes('[más info](https://stspg.io/wrk)') && !/N9/.test(r.j.respuesta), r.j.respuesta);

// ---------- Caché de una hora: la segunda pregunta no sale a internet ni escribe ----------
pedidosWeb.length=0; escrituras=0; consultas=0; guion=[()=>texto('ok')];
r=await call(ck.ana,'POST','/api/asistente',{sugerencia:'contexto'});
d=datos(pedidos.length-1).contexto_externo;
ok('dentro de la hora usa lo guardado: 0 pedidos a internet', pedidosWeb.length===0, pedidosWeb);
ok('sugerencia: 1 llamada al modelo, 2 escrituras (uso + auditoría) y pocas consultas', escrituras===2 && consultas<=12, {escrituras,consultas});
ok('analista sí ve los servicios críticos (tiene tablero)', Array.isArray(d.servicios_criticos) && d.servicios_criticos.includes('todos los clientes'), d.servicios_criticos);

// ---------- Pasada la hora se actualiza; si internet falla, usa lo último y avisa ----------
db.prepare("UPDATE contexto_externo SET actualizado = '2026-01-01T00:00:00Z'").run();
webCaida=true; pedidosWeb.length=0; guion=[()=>texto('ok')];
r=await call(ck.gero,'POST','/api/asistente',{sugerencia:'contexto'});
d=datos(pedidos.length-1).contexto_externo;
ok('si los proveedores no responden, avisa cuál y no se cae', r.s===200 && d.proveedores.errores.length===2 && /no respondió a tiempo/.test(d.proveedores.errores[0]), d.proveedores.errores);
ok('si las noticias fallan, quedan las últimas guardadas con el aviso', d.noticias.noticias.length===2 && /no respondió a tiempo/.test(d.noticias.error), d.noticias);
pedidosWeb.length=0; guion=[()=>texto('ok')];
await call(ck.gero,'POST','/api/asistente',{sugerencia:'contexto'});
ok('después de una falla no reintenta en cada pregunta', pedidosWeb.length===0, pedidosWeb.length);
webCaida=false;
db.prepare("UPDATE contexto_externo SET actualizado = ?1").run(new Date(Date.now() - 11*60000).toISOString());
pedidosWeb.length=0; guion=[()=>texto('ok')];
await call(ck.gero,'POST','/api/asistente',{sugerencia:'contexto'});
ok('si la última vez falló, a los 10 minutos vuelve a probar (no espera la hora)', pedidosWeb.length===5 && !datos(pedidos.length-1).contexto_externo.noticias.error, pedidosWeb.length);
googleCaido=true; db.prepare("UPDATE contexto_externo SET actualizado = '2026-01-01T00:00:00Z'").run(); pedidosWeb.length=0; guion=[()=>texto('ok')];
await call(ck.gero,'POST','/api/asistente',{sugerencia:'contexto'});
d=datos(pedidos.length-1).contexto_externo;
ok('si Google Noticias no responde, usa GDELT de respaldo', pedidosWeb.some(u=>u.includes('gdeltproject')) && d.noticias.noticias[0].medio==='ambito.com' && /GDELT/.test(d.noticias.fuente), d.noticias);
googleCaido=false;

// ---------- Apagado: no sale a internet ----------
db.prepare("DELETE FROM contexto_externo").run();
env = { DB, AI, CONTEXTO_EXTERNO: 'apagado', CONTEXTO_CALENDARIO: 'demo' }; pedidosWeb.length=0; guion=[()=>texto('ok')];
r=await call(ck.ana,'POST','/api/asistente',{sugerencia:'contexto'});
ok('con CONTEXTO_EXTERNO=apagado solo usa el calendario', pedidosWeb.length===0 && datos(pedidos.length-1).contexto_externo.proveedores.apagado===true);
env = { DB, AI, CONTEXTO_CALENDARIO: 'demo' };

// ---------- Calendario ----------
reloj('2026-11-22T15:00:00Z');   // domingo 22/11
pedidos.length=0; guion=[()=>texto('ok')];
await call(ck.ana,'POST','/api/asistente',{pregunta:'¿qué eventos hay la semana que viene? próximos 7 días'});
d=datos(0).contexto_externo; const cal=JSON.stringify(d.calendario);
ok('primer día hábil después del fin de semana largo', /24\/11.*Primer día hábil después de un fin de semana largo/.test(cal), d.calendario.map(x=>x.fecha));
ok('Black Friday (evento ya cargado) dentro de los próximos días', cal.includes('Black Friday 2026') && cal.includes('más tráfico'), cal.slice(0,400));
reloj('2026-12-01T15:00:00Z');   // martes 1/12
pedidos.length=0; guion=[()=>texto('ok')];
await call(ck.ana,'POST','/api/asistente',{pregunta:'¿qué pasa mañana con los sueldos?'});
d=datos(0).contexto_externo;
ok('cobro de sueldos: 1.º y 2.º día hábil del mes', /1\.º día hábil del mes/.test(d.calendario[0].notas.join()) && /2\.º día hábil/.test(d.calendario[1].notas.join()), d.calendario.slice(0,2));
ok('"mañana" mira 2 días (hoy y mañana)', d.calendario.length===2);

// ---------- Fuera de tema sigue fuera ----------
pedidos.length=0; guion=[()=>texto('Solo puedo ayudarte con la operación y las alertas de Helios.')];
r=await call(ck.ana,'POST','/api/asistente',{pregunta:'¿Maradona sigue vivo?'});
ok('una pregunta de otro tema no consulta el contexto externo', !r.j.herramientas.includes('contexto_externo'), r.j.herramientas);

// ---------- Eventos comerciales (Administración) ----------
r=await call(A,'GET','/api/admin/eventos'); ok('lista con los 2 eventos precargados', r.j.eventos.length===2, r.j.eventos.map(e=>e.nombre));
r=await call(ck.ana,'GET','/api/admin/eventos'); ok('analista: no puede ver ni cargar eventos (403)', r.s===403);
r=await call(ck.ana,'POST','/api/admin/eventos',{nombre:'X',fecha_desde:'2026-12-01'}); ok('analista: no puede agregar (403)', r.s===403);
r=await call(A,'POST','/api/admin/eventos',{nombre:'Promo recargas',fecha_desde:'2026-12-10',fecha_hasta:'2026-12-01'}); ok('valida que "hasta" no sea anterior', r.s===400 && /anterior/.test(r.j.error));
r=await call(A,'POST','/api/admin/eventos',{nombre:'Promo recargas',fecha_desde:'2026-02-30'}); ok('valida la fecha', r.s===400);
r=await call(A,'POST','/api/admin/eventos',{nombre:'Promo recargas',fecha_desde:'2026-12-01',fecha_hasta:'2027-03-01'}); ok('máximo un mes', r.s===400);
r=await call(A,'POST','/api/admin/eventos',{nombre:'Promo recargas',fecha_desde:'2026-12-02',cliente_id:'cli_003',servicio_id:'recarga_celular',efecto_esperado:'MAS_TRAFICO',nota:'20 % de reintegro'});
const nuevo=db.prepare("select * from eventos_comerciales where nombre='Promo recargas'").get();
ok('agrega un evento de un día para un cliente y servicio (en mayúsculas)', r.s===200 && nuevo.fecha_hasta==='2026-12-02' && nuevo.cliente_id==='CLI_003' && nuevo.servicio_id==='RECARGA_CELULAR', nuevo);
pedidos.length=0; guion=[()=>texto('ok')];
await call(ck.ana,'POST','/api/asistente',{sugerencia:'contexto'});
ok('el asistente ve el evento nuevo con su cliente y servicio', JSON.stringify(datos(0).contexto_externo.calendario).includes('Promo recargas (CLI_003, RECARGA_CELULAR)'));
r=await call(A,'POST','/api/admin/eventos/borrar',{id:nuevo.id}); ok('quita el evento', r.s===200 && !db.prepare("select 1 from eventos_comerciales where id=?").get(nuevo.id));
const aud=db.prepare("select accion from auditoria where accion like '%EVENTO'").all().map(x=>x.accion);
ok('alta y baja quedan en auditoría', JSON.stringify(aud)==='["ALTA_EVENTO","BORRAR_EVENTO"]', aud);

// ---------- Página: sección, diálogo y enlaces del panel ----------
const adm=await (await worker.fetch(new Request('https://x/admin',{headers:{cookie:A}}),env,{waitUntil(){}})).text();
ok('Administración tiene la sección y el diálogo de eventos', adm.includes('id="t-eventos"') && adm.includes('id="dlg-evento"') && adm.includes('cargarFeriados().then(cargarEventos)'));
const i=adm.indexOf('function formato(t)'), f=adm.slice(i, adm.indexOf('\n  function agregar', i));
const escA=(v)=>String(v==null?'':v).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formato=new Function('escA', f+'\nreturn formato;')(escA);
const h=formato('Según [Ámbito](https://www.ambito.com/paro?x=1&y=2), hay paro. Ver https://stspg.io/abc. <img src=x onerror=alert(1)> javascript:alert(1)');
const h2=formato('**Proveedores**\n- Twilio:\n  - SMS en Argentina\n- Cloudflare');
ok('panel: las sublistas se ven con sangría', /<li>Twilio:<\/li><li class="sub">SMS en Argentina<\/li><li>Cloudflare<\/li>/.test(h2), h2);
ok('panel: los enlaces https se pueden tocar y el resto sigue escapado', h.includes('<a href="https://www.ambito.com/paro?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">Ámbito</a>') && h.includes('>stspg.io</a>.') && !h.includes('<img') && !/href="javascript/.test(h), h);

console.log(fallas ? 'FALLAS: '+fallas : 'TODO OK');
