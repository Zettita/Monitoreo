import { DatabaseSync } from 'node:sqlite';
import nodeCrypto from 'node:crypto';
import worker from '../worker/w.mjs';
// Prueba de avisos push (parche 26): archivos públicos, suscripción, envío cifrado (se descifra como lo haría
// el navegador), firma VAPID, limpieza de dispositivos vencidos y que sin la clave no cambie nada.
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
let consultas=0;
let inyectar=null;   // para la prueba de muchos avisos juntos: se agregan justo después de leer el último id
const DB={prepare:(q)=>{consultas++;const st=mk(q);if(inyectar&&/MAX\(id\), 0\) AS m FROM avisos/.test(q)){const f=st.first;st.first=async()=>{const x=await f();inyectar();inyectar=null;return x};}return st},async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const par=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',par.privateKey);
const envCon={DB,VAPID_JWK:JSON.stringify({kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y,d:jwk.d})};
const envSin={DB};
let env=envCon;
const call=async(ck,m,p,body)=>{const r=await worker.fetch(new Request('https://helios.test'+p,{method:m,headers:{'content-type':'application/json',cookie:ck||''},body:body?JSON.stringify(body):undefined,redirect:'manual'}),env,{});const sc=r.headers.get('set-cookie');let j;try{j=await r.clone().json()}catch(e){j=r.status+' html'}return {s:r.status,j,ck:sc?sc.split(';')[0]:null,r};};
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const b64u=(b)=>Buffer.from(b).toString('base64url');

// Servicio de push simulado: guarda lo que el Worker le manda
const enviados=[]; let respuesta=201;
const fetchReal=globalThis.fetch;
globalThis.fetch=async(url,op)=>{ if(String(url).startsWith('https://fcm.googleapis.com/')){enviados.push({url:String(url),op});return new Response('',{status:respuesta});} return fetchReal(url,op); };

// Un "navegador": par ECDH y secreto de 16 bytes, como los que entrega pushManager.subscribe()
function dispositivo(n){
  const ecdh=nodeCrypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth=nodeCrypto.randomBytes(16);
  return {ecdh,auth,sub:{endpoint:'https://fcm.googleapis.com/fcm/send/dispositivo-'+n,keys:{p256dh:b64u(ecdh.getPublicKey()),auth:b64u(auth)}}};
}
// Descifrado RFC 8291 (lo que hace el navegador al recibir el push)
function descifrar(d,cuerpo){
  const buf=Buffer.from(cuerpo); const sal=buf.subarray(0,16), rs=buf.readUInt32BE(16), idlen=buf[20], asPub=buf.subarray(21,21+idlen), cifrado=buf.subarray(21+idlen);
  const ecdhSecreto=d.ecdh.computeSecret(asPub); const uaPub=d.ecdh.getPublicKey();
  const ikm=Buffer.from(nodeCrypto.hkdfSync('sha256',ecdhSecreto,d.auth,Buffer.concat([Buffer.from('WebPush: info\0'),uaPub,asPub]),32));
  const cek=Buffer.from(nodeCrypto.hkdfSync('sha256',ikm,sal,Buffer.from('Content-Encoding: aes128gcm\0'),16));
  const nonce=Buffer.from(nodeCrypto.hkdfSync('sha256',ikm,sal,Buffer.from('Content-Encoding: nonce\0'),12));
  const dec=nodeCrypto.createDecipheriv('aes-128-gcm',cek,nonce); dec.setAuthTag(cifrado.subarray(cifrado.length-16));
  const plano=Buffer.concat([dec.update(cifrado.subarray(0,cifrado.length-16)),dec.final()]);
  ok('relleno RFC 8291 correcto (registro final 0x02, rs 4096)', plano[plano.length-1]===2 && rs===4096 && idlen===65);
  return JSON.parse(plano.subarray(0,plano.length-1).toString('utf8'));
}
async function verificarVapid(cab,endpoint){
  const m=/^vapid t=([^,]+), k=(.+)$/.exec(cab||''); if(!m) return false;
  const [h,c,f]=m[1].split('.'); const claims=JSON.parse(Buffer.from(c,'base64url'));
  const pub=Buffer.from(m[2],'base64url');
  const clave=await crypto.subtle.importKey('raw',pub,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const valida=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},clave,Buffer.from(f,'base64url'),Buffer.from(h+'.'+c));
  return valida && claims.aud===new URL(endpoint).origin && claims.exp>Date.now()/1000 && claims.exp<Date.now()/1000+24*3600 && claims.sub==='https://helios.test';
}

// ---- Archivos públicos (sin sesión)
let r=await call('','GET','/manifest.webmanifest'); const man=JSON.parse(await r.r.text());
ok('manifiesto público', r.s===200 && /manifest\+json/.test(r.r.headers.get('content-type')) && man.short_name==='Helios' && man.start_url==='/inicio' && man.display==='standalone' && man.icons.some(i=>i.purpose==='maskable'), man.name);
r=await call('','GET','/sw.js'); const sw=await r.r.text();
ok('service worker público', r.s===200 && /javascript/.test(r.r.headers.get('content-type')) && sw.includes("addEventListener('push'") && sw.includes('notificationclick'));
for (const [p,lado] of [['/icono-192.png',192],['/icono-512.png',512],['/apple-touch-icon.png',180],['/icono-insignia.png',96],['/favicon.ico',192]]) {
  r=await call('','GET',p); const b=Buffer.from(await r.r.arrayBuffer());
  ok('ícono '+p, r.s===200 && r.r.headers.get('content-type')==='image/png' && b.subarray(1,4).toString()==='PNG' && b.readUInt32BE(16)===lado);
}
r=await call('','GET','/api/push/clave'); ok('la clave pública pide sesión', r.s===401);
r=await call('','GET','/login'); const loginHtml=await r.r.text();
ok('login enlaza manifiesto e ícono de iPhone', loginHtml.includes('rel="manifest"') && loginHtml.includes('apple-touch-icon'));

// ---- Usuarios
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const x=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p}); const c=await login(u,x.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:x.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol'),id('pedro')]});
const EQ=(n)=>db.prepare('select id from equipos where nombre=?').get(n).id;
r=await call(ck.sol,'GET','/mis-alertas'); const pag=await r.r.text();
r=await call(ck.ana,'GET','/'); const tab=await r.r.text();
ok('páginas con manifiesto, ícono y service worker', [pag,tab].every(h=>h.includes('rel="manifest"') && h.includes("register('/sw.js')") && h.includes('/api/push/suscribir')));

// ---- Clave y suscripción
r=await call(ck.sol,'GET','/api/push/clave'); const clavePub=r.j.clave;
ok('soporte recibe la clave pública (65 bytes)', r.s===200 && Buffer.from(clavePub,'base64url').length===65 && Buffer.from(clavePub,'base64url')[0]===4);
r=await call(ck.gero,'GET','/api/push/clave'); ok('gerente: sin clave (no tiene campanita)', r.j.clave===null);
r=await call(A,'GET','/api/push/clave'); ok('admin: sin clave', r.j.clave===null);
const d1=dispositivo(1), d2=dispositivo(2), d3=dispositivo(3);
r=await call(ck.gero,'POST','/api/push/suscribir',{suscripcion:d3.sub}); ok('gerente no se puede suscribir', r.s===403);
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:{endpoint:'https://evil.example.com/x',keys:d1.sub.keys}}); ok('rechaza servicios de push desconocidos', r.s===400, r.j.error);
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:{endpoint:d1.sub.endpoint,keys:{p256dh:'corta',auth:'x'}}}); ok('rechaza claves inválidas', r.s===400);
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:d1.sub}); ok('sol suscribe su celular', r.s===200, r.j);
r=await call(ck.pedro,'POST','/api/push/suscribir',{suscripcion:d2.sub}); ok('pedro suscribe su PC', r.s===200);
r=await call(ck.ana,'POST','/api/push/suscribir',{suscripcion:d3.sub}); ok('ana suscribe su PC', r.s===200);
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:d1.sub}); ok('volver a suscribir no duplica', db.prepare('select count(*) n from suscripciones_push').get().n===3);
ok('no se mandó nada todavía', enviados.length===0);

// ---- Demo hasta la escena 2: aparece "Dejaron de llegar datos" en CLI_001 (grave, sin asignar → aviso a analistas)
await call(A,'POST','/api/demo/preparar');
enviados.length=0;
await call(A,'POST','/api/demo/siguiente'); await call(A,'POST','/api/demo/siguiente');
const graves=db.prepare("select count(*) n from avisos where tipo='GRAVE_SIN_ASIGNAR' and usuario_id=?").get(id('ana')).n;
const aAna=enviados.filter(e=>e.url===d3.sub.endpoint);
ok('la revisión avisa por push a la analista', graves>0 && aAna.length>=1, {graves,push:aAna.length});
if (aAna.length) {
  const p=descifrar(d3,aAna[0].op.body);
  ok('push a la analista: "Alerta grave sin asignar", lleva al tablero', p.avisos[0].titulo==='Helios · Alerta grave sin asignar' && p.avisos[0].url==='/' && /CLI_00/.test(p.avisos[0].cuerpo), p.avisos[0]);
  ok('cabeceras del push (cifrado, TTL, urgencia)', aAna[0].op.headers['content-encoding']==='aes128gcm' && aAna[0].op.headers.ttl==='86400' && aAna[0].op.headers.urgency==='high');
  ok('firma VAPID válida (aud, exp, sub)', await verificarVapid(aAna[0].op.headers.authorization,d3.sub.endpoint));
}
ok('soporte no recibe push de lo que no le asignaron', enviados.every(e=>e.url===d3.sub.endpoint));

// ---- Derivar a Sol: le llega el push con el texto de la alerta y el comentario
r=await call(ck.ana,'GET','/api/dashboard');
const al=r.j.abiertas.find(a=>a.severidad==='CRITICA') || r.j.abiertas[0];
enviados.length=0;
r=await call(ck.ana,'POST','/api/alertas/'+al.alerta_id+'/derivar',{usuario_id:id('sol'),comentario:'Mirá el conector'});
ok('derivar a sol', r.s===200, r.j);
const aSol=enviados.filter(e=>e.url===d1.sub.endpoint);
ok('un solo push al celular de sol (y ninguno a ana, que derivó)', aSol.length===1 && enviados.length===1, enviados.map(e=>e.url));
if (aSol.length) {
  const p=descifrar(d1,aSol[0].op.body);
  ok('push a sol: "Te asignaron una alerta", con la alerta y el comentario, lleva a Mis alertas',
    p.avisos.length===1 && p.avisos[0].titulo==='Helios · Te asignaron una alerta' && p.avisos[0].cuerpo.includes(al.cliente_id) && p.avisos[0].cuerpo.includes('“Mirá el conector”') && p.avisos[0].url==='/mis-alertas', p.avisos[0]);
}

// ---- Avanzar la demo hasta la escena 9 para tener más alertas sin asignar
for (let i=0;i<7;i++) await call(A,'POST','/api/demo/siguiente');
// ---- Derivar al equipo: un push por persona con dispositivo
const otra=(await call(ck.ana,'GET','/api/dashboard')).j.abiertas.find(a=>a.alerta_id!==al.alerta_id && !a.asignado_usuario_id && !a.asignado_equipo_id && a.severidad!=='BAJA');
ok('hay otra alerta para derivar', !!otra);
if (otra) {
  enviados.length=0;
  r=await call(ck.ana,'POST','/api/alertas/'+otra.alerta_id+'/derivar',{equipo_id:EQ('Mesa')});
  ok('derivar al equipo Mesa: push a sol y a pedro', r.s===200 && enviados.length===2 && enviados.some(e=>e.url===d1.sub.endpoint) && enviados.some(e=>e.url===d2.sub.endpoint), enviados.map(e=>e.url));
}

// ---- Dispositivo que ya no existe (410): se borra la suscripción
respuesta=410; enviados.length=0;
r=await call(ck.sol,'POST','/api/alertas/'+(otra||al).alerta_id+'/comentar',{comentario:'Ya lo estoy viendo'});
ok('comentario de sol avisa a ana', r.s===200 && enviados.some(e=>e.url===d3.sub.endpoint), enviados.map(e=>e.url));
ok('respuesta 410: se borra la suscripción de ana', !db.prepare('select 1 from suscripciones_push where endpoint=?').get(d3.sub.endpoint));
respuesta=201;

// ---- Dejar de recibir (al cerrar sesión): no pide sesión, borra solo ese dispositivo
r=await call('','POST','/api/push/desuscribir',{endpoint:d2.sub.endpoint});
ok('pedro deja de recibir en su PC', r.s===200 && !db.prepare('select 1 from suscripciones_push where endpoint=?').get(d2.sub.endpoint) && !!db.prepare('select 1 from suscripciones_push where endpoint=?').get(d1.sub.endpoint));

// ---- Más de 3 avisos juntos: van los 3 últimos y un resumen
enviados.length=0;
inyectar=()=>{for(let k=1;k<=5;k++) db.prepare("insert into avisos (usuario_id, fecha, tipo, alerta_id, texto) values (?, '2026-10-26T13:00:00Z', 'COMENTARIO', null, ?)").run(id('sol'),'Aviso de prueba '+k);};
await call(ck.ana,'POST','/api/avisos/leer-todos');
const aSol5=enviados.filter(e=>e.url===d1.sub.endpoint);
ok('un solo push con 5 avisos nuevos', aSol5.length===1, enviados.length);
if (aSol5.length) { const p=descifrar(d1,aSol5[0].op.body); ok('van los 3 últimos y "Y 2 avisos más"', p.avisos.length===4 && p.avisos[0].cuerpo==='Aviso de prueba 5' && p.avisos[3].cuerpo==='Y 2 avisos más en la campanita.', p.avisos.map(a=>a.cuerpo)); }

// ---- Sin la clave VAPID: ni una consulta de más y nada se envía
env=envSin; enviados.length=0;
const libre=(await call(ck.ana,'GET','/api/dashboard')).j.abiertas.find(a=>!a.asignado_usuario_id && !a.asignado_equipo_id && a.severidad!=='BAJA');
r=await call(ck.ana,'GET','/api/push/clave'); ok('sin clave en el servidor: /api/push/clave da null', r.j.clave===null);
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:d2.sub}); ok('sin clave: no deja suscribir (409)', r.s===409);
ok('hay alertas libres para la prueba sin clave', !!libre);
if (libre) {
  consultas=0; await call(ck.ana,'POST','/api/alertas/'+libre.alerta_id+'/derivar',{usuario_id:id('sol')}); const sinPush=consultas;
  ok('sin clave: no se envía nada', enviados.length===0);
  env=envCon; const otraLibre=(await call(ck.ana,'GET','/api/dashboard')).j.abiertas.find(a=>!a.asignado_usuario_id && !a.asignado_equipo_id && a.severidad!=='BAJA');
  if (otraLibre) { consultas=0; await call(ck.ana,'POST','/api/alertas/'+otraLibre.alerta_id+'/derivar',{usuario_id:id('sol')}); ok('con clave: solo 2 consultas extra por pedido', consultas-sinPush===2, {sinPush,conPush:consultas}); }
}
env=envCon;

// ---- Sin la tabla (Worker publicado antes del script 10): no se rompe nada
db.exec('DROP TABLE suscripciones_push');
const ultimaLibre=(await call(ck.ana,'GET','/api/dashboard')).j.abiertas.find(a=>!a.asignado_usuario_id && !a.asignado_equipo_id && a.severidad!=='BAJA');
if (ultimaLibre) { r=await call(ck.ana,'POST','/api/alertas/'+ultimaLibre.alerta_id+'/derivar',{usuario_id:id('sol')}); ok('sin la tabla: derivar sigue andando', r.s===200, r.j); }
r=await call(ck.sol,'POST','/api/push/suscribir',{suscripcion:d1.sub}); ok('sin la tabla: suscribir explica que falta el script 10', r.s===500 && /script 10/.test(r.j.error), r.j.error);
r=await call('','POST','/api/push/desuscribir',{endpoint:d1.sub.endpoint}); ok('sin la tabla: desuscribir no falla', r.s===200);

globalThis.fetch=fetchReal;
console.log(fallas?('FALLARON '+fallas):'TODO OK');
