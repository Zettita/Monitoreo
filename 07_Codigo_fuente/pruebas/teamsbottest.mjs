import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createSign } from 'node:crypto';
import worker from '../worker/w.mjs';
// Prueba del bot de Helios en Teams (parche 76), con un Microsoft de mentira: claves, tokens, Bot Framework y el modelo de IA.
// Valida la firma del token, a quién le contesta, qué ve cada perfil, los límites, que no ejecute nada y que no mande nada a direcciones ajenas.
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql)||/\breturning\b/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const APP='11111111-2222-3333-4444-555555555555', TENANT='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const pedidosIA=[]; let textoIA='Respuesta de Helios.';
const AI={ async run(modelo,p){ pedidosIA.push(p); return { choices:[{ message:{ content: textoIA } }] }; } };
const CFG={ TEAMS_BOT_APP_ID:APP, TEAMS_BOT_SECRET:'secreto-de-prueba-123', TEAMS_BOT_TENANT:TENANT };
let env={ DB, AI, ...CFG };
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined&&!c?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,400)):''));if(!c)fallas++;};

// ---------- Microsoft de mentira ----------
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: otraClave } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
const b64u = (b) => Buffer.from(b).toString('base64url');
const SERVICIO = 'https://smba.trafficmanager.net/amer/';
const jwt = (o = {}) => {
  const cab = { alg: o.alg || 'RS256', typ: 'JWT', kid: o.kid || 'k1' };
  const ahora = Math.floor(Date.now() / 1000);
  const carga = { iss: o.iss || 'https://api.botframework.com', aud: o.aud || APP, serviceurl: o.serviceurl || SERVICIO, exp: o.exp || ahora + 3600, nbf: ahora - 60 };
  const base = b64u(JSON.stringify(cab)) + '.' + b64u(JSON.stringify(carga));
  const firma = createSign('RSA-SHA256').update(base).sign(o.clave || privateKey);
  return base + '.' + b64u(firma);
};
const CORREOS = { 'u-ana': 'ana@helios.test', 'u-sol': 'sol@helios.test', 'u-gero': 'gero@helios.test', 'u-nadie': 'nadie@otraempresa.com', 'u-upn': 'sol.upn@helios.test' };
let salidas = [];   // todo lo que el bot le manda a Microsoft
let tokenPedidos = 0, rechazar401 = 0, falloMembers = false;
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const cuerpo = init.body ? (typeof init.body === 'string' ? init.body : String(init.body)) : null;
  const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  if (url === 'https://login.botframework.com/v1/.well-known/keys') return json({ keys: [{ kty: 'RSA', kid: 'k1', n: jwk.n, e: jwk.e, endorsements: ['msteams'] }] });
  if (url.startsWith('https://login.microsoftonline.com/' + TENANT + '/oauth2/v2.0/token')) {
    tokenPedidos++;
    if (!/client_id=/.test(cuerpo) || !/scope=https%3A%2F%2Fapi.botframework.com%2F.default/.test(cuerpo)) return json({ error: 'invalid_request' }, 400);
    if (/client_secret=mal/.test(cuerpo)) return json({ error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.\nTrace ID: x' }, 401);
    return json({ access_token: 'token-de-microsoft-' + tokenPedidos, expires_in: 3600 });
  }
  if (url.startsWith(SERVICIO + 'v3/conversations/')) {
    salidas.push({ metodo: init.method || 'GET', url, cuerpo: cuerpo ? JSON.parse(cuerpo) : null, auth: (init.headers || {}).authorization });
    if ((init.method || 'GET') === 'GET' && /\/members\//.test(url)) {
      if (falloMembers) return json({ error: 'x' }, 500);
      const uid = decodeURIComponent(url.split('/members/')[1]);
      return CORREOS[uid] ? json({ id: uid, name: uid, email: uid === 'u-upn' ? null : CORREOS[uid], userPrincipalName: CORREOS[uid] }) : json({ error: 'nadie' }, 404);
    }
    if (rechazar401 > 0 && (init.method || 'GET') === 'POST') { rechazar401--; return json({ error: 'token vencido' }, 401); }
    return json({ id: 'act-1' });
  }
  throw new Error('El bot intentó llamar a una dirección que no corresponde: ' + url);
};

const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
const call=async(ck,m,p,body,cab)=>{
  const h={cookie:ck||'',...(cab||{})}; if(body!==undefined)h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'}),env,ctx);
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const j=ct.includes('json')?await r.json():null;const t=j?null:await r.text();
  return{s:r.status,j:j||{},t,ck:sc?sc.split(';')[0]:null};
};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;
const q1=(sql,...a)=>db.prepare(sql).get(...a);
const n=(sql,...a)=>db.prepare(sql).get(...a).n;
// Un mensaje de Teams: arma la actividad, la firma y la manda como lo haría Microsoft; espera a que el bot termine de contestar
const actividad = (uid, texto, extra = {}) => ({ type: 'message', id: 'msg-' + Math.random().toString(36).slice(2, 8), serviceUrl: SERVICIO, channelId: 'msteams', text: texto,
  from: { id: uid, name: uid }, recipient: { id: '28:' + APP, name: 'Gemma' }, conversation: { id: '19:chat@thread.v2', conversationType: 'groupChat', name: extra.chat }, channelData: { tenant: { id: extra.tenant || TENANT } }, ...extra.act });
async function teams(act, token, cab) {
  salidas = []; pend.length = 0; pedidosIA.length = 0;
  const r = await call('', 'POST', '/api/teams/bot', act, { authorization: 'Bearer ' + (token === undefined ? jwt() : token), ...(cab || {}) });
  await Promise.all(pend);
  return r;
}
const olvidarTodo = () => db.exec('DELETE FROM teams_bot_memoria');
const mensajes = () => salidas.filter((x) => x.metodo === 'POST' && x.cuerpo && x.cuerpo.type === 'message');
const ultimo = () => (mensajes().slice(-1)[0] || {}).cuerpo;

// ---------- Datos: usuarios con correo, una sala abierta y un equipo ----------
await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,nom,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Mesa','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:nom,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=await login(u,'Clave'+u+'123456');
}
db.prepare("UPDATE usuarios SET correo = 'SOL.UPN@Helios.test' WHERE usuario = 'carla'").run();   // en mayúsculas: se compara sin importar mayúsculas
const id=(u)=>q1('select id from usuarios where usuario=?',u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',miembros:[id('sol')]});
await call(A,'POST','/api/demo/preparar');
for(let i=0;i<14;i++) await call(A,'POST','/api/demo/siguiente');
const ab=db.prepare("select alerta_id from alertas_historico where cliente_id='CLI_006' and estado!='RESUELTA' and severidad_maxima!='BAJA' group by tipo_alerta, servicio_id, canal_id order by ventana_inicio").all().map(x=>x.alerta_id);
let r=await call(ck.ana,'POST','/api/incidentes',{alertas:ab.slice(0,2)}); const IM=r.j.incidente.id;
ok('(preparación) hay una sala abierta IM-'+IM, r.s===200 && IM===4, r.j);

// ---------- Configuración ----------
env={ DB, AI };
r=await teams(actividad('u-ana','hola'), jwt());
ok('sin los secretos, Microsoft recibe 503 y no pasa nada', r.s===503 && salidas.length===0, r.s);
env={ DB, AI, TEAMS_BOT_APP_ID:'no-es-un-guid', TEAMS_BOT_SECRET:'secreto-de-prueba-123' };
r=await teams(actividad('u-ana','hola'), jwt());
ok('con un App ID que no es un GUID también (503)', r.s===503);
env={ DB, AI, ...CFG };

// ---------- Quién llama: la firma del token ----------
r=await teams(actividad('u-ana','hola'), '');
ok('sin token: 401 y no contesta nada', r.s===401 && salidas.length===0, r.s);
r=await teams(actividad('u-ana','hola'), 'no.es.untoken');
ok('un token mal formado: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ clave: otraClave }));
ok('un token firmado con otra clave: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ aud: '99999999-2222-3333-4444-555555555555' }));
ok('un token para otro bot: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ exp: Math.floor(Date.now()/1000) - 4000 }));
ok('un token vencido: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ iss: 'https://evil.example.com' }));
ok('un token de otro emisor: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ serviceurl: 'https://smba.trafficmanager.net/emea/' }));
ok('un token cuya dirección de servicio no es la del mensaje: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ alg: 'HS256' }));
ok('un algoritmo que no es RS256: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola'), jwt({ kid: 'otra-clave' }));
ok('una clave que Microsoft no publica: 401', r.s===401 && salidas.length===0);
r=await teams(actividad('u-ana','hola',{ act: { serviceUrl: 'https://evil.example.com/' } }), jwt({ serviceurl: 'https://evil.example.com/' }));
ok('una dirección de servicio que no es de Microsoft: 400 y no se le manda nada', r.s===400 && salidas.length===0, r.s);
r=await call('','POST','/api/teams/bot','esto no es json',{ authorization: 'Bearer ' + jwt() });
ok('un cuerpo que no es una actividad: 400', r.s===400 || r.s===401);
r=await teams(actividad('u-ana','hola',{ tenant: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }), jwt());
ok('un mensaje de otro tenant se ignora (200, sin respuesta)', r.s===200 && salidas.length===0);

// ---------- Una pregunta de la sala (Analista) ----------
tokenPedidos=0;
r=await teams(actividad('u-ana','<at>Helios</at> IM-4 ¿qué reviso primero?'));
ok('Microsoft recibe 200 enseguida', r.s===200);
const m1=ultimo();
ok('contesta en el mismo chat, respondiendo al mensaje y con el token de Microsoft', !!m1 && m1.replyToId && m1.conversation.id==='19:chat@thread.v2' && mensajes()[0].auth==='Bearer token-de-microsoft-1', salidas.map(x=>x.metodo+' '+x.url.slice(-30)));
ok('la respuesta es la del asistente, con el enlace a la sala', !!m1 && /Respuesta de Helios\./.test(m1.text) && m1.text.includes('https://x/incidente/4') && m1.textFormat==='markdown', m1&&m1.text);
ok('mostró "escribiendo…" mientras pensaba', salidas.some(x=>x.cuerpo&&x.cuerpo.type==='typing'));
ok('consultó el modelo una vez y quedó en el límite y en la auditoría del asistente', pedidosIA.length>=1 && n("select count(*) n from auditoria where accion='ASISTENTE' and detalle like '%qué reviso primero%'")===1 && n('select coalesce(sum(preguntas),0) n from asistente_uso where usuario_id=?',id('ana'))===1);
ok('la pregunta que recibió el modelo no tiene la mención ni etiquetas', pedidosIA.every(p=>!JSON.stringify(p).includes('<at>')));
const tokens1=tokenPedidos;
r=await teams(actividad('u-ana','IM-4 ¿hubo algo parecido antes?'));
ok('el token de Microsoft se reutiliza (no se pide en cada mensaje)', tokenPedidos===tokens1 && !!ultimo());
ok('y el correo de quien escribe también (no vuelve a consultar los integrantes)', !salidas.some(x=>x.metodo==='GET'));

// Sala implícita (una sola abierta) y varias abiertas
olvidarTodo();
r=await teams(actividad('u-ana','¿cómo vamos?'));
ok('con una sola sala abierta, la pregunta va a esa sala', /incidente\/4/.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-ana','¿cómo vamos?',{ chat: 'IM-4 · Se aprueban menos operaciones' }));
ok('el título del chat de Helios ("IM-4 · …") también marca la sala', /incidente\/4/.test((ultimo()||{}).text||''));
{ const r2=await call(ck.ana,'POST','/api/incidentes',{alertas:ab.slice(2,3).length?ab.slice(2,3):[db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' and alerta_id not in (select alerta_id from incidente_alertas) limit 1").get().alerta_id]});
  ok('(preparación) una segunda sala', r2.s===200, r2.j);
  olvidarTodo();
  r=await teams(actividad('u-ana','¿cómo vamos?'));
  ok('con varias salas abiertas, avisa que hay que decir cuál', /varias salas abiertas/.test((ultimo()||{}).text||''), ultimo());
  r=await teams(actividad('u-ana','IM-'+r2.j.incidente.id+' ¿cómo vamos?'));
  ok('y con el número, responde de esa sala', new RegExp('incidente/'+r2.j.incidente.id).test((ultimo()||{}).text||''), ultimo()); }

// ---------- Saludos, ayuda y permisos ----------
olvidarTodo();
r=await teams(actividad('u-ana','<at>Helios</at> hola'));
ok('un saludo se contesta sin consultar el modelo', pedidosIA.length===0 && /^Hola\. Preguntame/.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-ana','<at>Helios</at>'));
ok('una mención sin pregunta muestra cómo usarlo', /Mencioname/.test((ultimo()||{}).text||'') && pedidosIA.length===0);
r=await teams(actividad('u-nadie','IM-4 ¿qué reviso primero?'));
ok('quien no está en Helios no recibe datos, solo cómo pedir su alta', pedidosIA.length===0 && /No encontré tu usuario de Helios con el correo nadie@otraempresa\.com/.test((ultimo()||{}).text||'') && !/IM-4|CLI_/.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-upn','IM-4 ¿qué reviso primero?'));
ok('se identifica también por el UPN y sin importar mayúsculas (Carla tiene el correo en mayúsculas)', pedidosIA.length===0 && /Esa sala de crisis no tiene tareas/.test((ultimo()||{}).text||'') , ultimo());
r=await teams(actividad('u-sol','IM-4 ¿qué reviso primero?'));
ok('Soporte sin tareas en la sala recibe el mismo aviso de siempre y ningún dato', pedidosIA.length===0 && /Esa sala de crisis no tiene tareas/.test((ultimo()||{}).text||'') && !/CLI_006/.test((ultimo()||{}).text||''), ultimo());
await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar el gateway',responsable_usuario_id:id('sol')});
r=await teams(actividad('u-sol','IM-4 ¿qué tengo que hacer?'));
ok('con una tarea en la sala, Soporte sí consulta', pedidosIA.length>=1 && /Respuesta de Helios\./.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-gero','IM-4 ¿cómo vamos?'));
ok('el Gerente consulta la sala en lectura (sin propuestas)', /Respuesta de Helios\./.test((ultimo()||{}).text||'') && !/Propuestas/.test((ultimo()||{}).text||''));

// ---------- No ejecuta nada: las propuestas se confirman en Helios ----------
olvidarTodo();
const estadoAntes=JSON.stringify(db.prepare('select estado, asignado_usuario_id from alertas_historico order by alerta_id').all())+n('select count(*) n from incidente_tareas');
textoIA='Te dejo una propuesta.';
{ const llamar=(nombre,args)=>({ choices:[{ message:{ content:'', tool_calls:[{ id:'c1', type:'function', function:{ name:nombre, arguments:JSON.stringify(args) } }] } }] });
  let paso=0; const aiAnterior=env.AI; env={ DB, AI:{ async run(m,p){ pedidosIA.push(p); paso++; return paso===1 ? llamar('sugerir_accion',{ tipo:'escalar', incidente_id:IM, motivo:'Hay que avisar al proveedor del gateway' }) : { choices:[{message:{content:'Conviene escalarlo.'}}] }; } }, ...CFG };
  r=await teams(actividad('u-ana','IM-4 ¿escalo esto al proveedor?'));
  const t=(ultimo()||{}).text||'';
  ok('si el asistente propone algo, el bot lo cuenta y manda a Helios (no lo hace)', /Propuestas \(no se hizo nada\)/.test(t) && /Escalar/.test(t) && t.includes('https://x/incidente/4'), t);
  ok('y no cambió nada en la base (ni tareas ni alertas)', JSON.stringify(db.prepare('select estado, asignado_usuario_id from alertas_historico order by alerta_id').all())+n('select count(*) n from incidente_tareas')===estadoAntes);
  env={ DB, AI:aiAnterior, ...CFG }; }
textoIA='Respuesta de Helios.';

// ---------- Límites ----------
olvidarTodo();
env={ DB, AI, ...CFG, ASISTENTE_POR_HORA:'1' };
db.exec("DELETE FROM asistente_uso");
r=await teams(actividad('u-ana','IM-4 ¿qué está demorado?'));
r=await teams(actividad('u-ana','IM-4 ¿qué está demorado otra vez?'));
ok('los mismos límites de preguntas por hora que el panel', /máximo de 1 preguntas por hora/.test((ultimo()||{}).text||'') && pedidosIA.length===0, ultimo());
r=await teams(actividad('u-ana','gracias'));
ok('pero un gracias no gasta ni se frena', /De nada/.test((ultimo()||{}).text||''));
env={ DB, AI, ...CFG };
{ const aiAnterior=env.AI; env={ DB, ...CFG };   // sin Workers AI
  r=await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
  ok('sin Workers AI, avisa que falta configurarlo (no se cae)', /no está configurado|falta conectar/i.test((ultimo()||{}).text||''), ultimo());
  env={ DB, AI:aiAnterior, ...CFG }; }


// ---------- Memoria de la conversación: una por chat, compartida por quienes están en él (parches 77 y 78, script 25) ----------
const CHAT = '19:chat@thread.v2';
const memoria = (conv = CHAT) => { const f = q1('select mensajes, sala_id, actualizado from teams_bot_memoria where conversacion_id=?', conv); return f ? { ...f, ms: JSON.parse(f.mensajes) } : null; };
const hablaCon = (frag) => pedidosIA.some((p) => JSON.stringify(p).includes(frag));
olvidarTodo(); textoIA = 'Primero revisá el gateway de pagos (A1).';
r=await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
ok('la primera pregunta guarda lo conversado (con el nombre de quien preguntó) y la sala, en una sola fila del chat', n('select count(*) n from teams_bot_memoria')===1 && memoria().ms.length===2 && memoria().sala_id===4 && memoria().ms[0].rol==='usuario' && memoria().ms[0].quien==='Ana' && /A1/.test(memoria().ms[1].texto), memoria());
ok('lo que se guarda es la respuesta del modelo, sin los enlaces ni las propuestas que arma el bot', !/https:\/\//.test(memoria().mensajes));
textoIA = 'Depende del core de cuentas y del proveedor (A2).';
r=await teams(actividad('u-ana','¿y de qué depende?'));
ok('la segunda pregunta le llega al modelo con la primera y su respuesta, y la primera lleva el nombre de quien la hizo', hablaCon('Ana: IM-4 ¿qué reviso primero?') && hablaCon('(A1)'), pedidosIA.length);
ok('sin decir la sala, sigue hablando de la misma (IM-4)', /incidente\/4/.test((ultimo()||{}).text||'') && memoria().ms.length===4);
// Otra persona del mismo chat: sigue lo que se viene hablando ahí (todos leen las mismas respuestas)
textoIA = 'El proveedor tiene un incidente abierto (A3).';
r=await teams(actividad('u-gero','¿y eso a quién afecta?'));
ok('otra persona del mismo chat responde en base a lo que se viene hablando ahí (le llega lo que preguntó Ana y lo que se contestó)', hablaCon('Ana: IM-4 ¿qué reviso primero?') && hablaCon('(A1)') && hablaCon('(A2)'), pedidosIA.length);
ok('y su pregunta se suma a la misma conversación, con su nombre', n('select count(*) n from teams_bot_memoria')===1 && memoria().ms.length===6 && memoria().ms[4].quien==='Gero' && /A3/.test(memoria().ms[5].texto), memoria().ms.map(x=>x.quien||x.rol));
ok('sin decir la sala, Gero también sigue en IM-4', /incidente\/4/.test((ultimo()||{}).text||''));
r=await teams(actividad('u-ana','¿y el proveedor?',{ act: { conversation: { id: '19:otro-chat@thread.v2', conversationType: 'groupChat' } } }));
ok('en otro chat no se arrastra nada (la memoria es de cada chat)', !hablaCon('(A1)') && !hablaCon('(A3)') && n('select count(*) n from teams_bot_memoria')===2);
await teams(actividad('u-ana','pregunta de relleno 1')); await teams(actividad('u-gero','pregunta de relleno 2')); await teams(actividad('u-ana','pregunta de relleno 3'));
ok('guarda como mucho los últimos 6 mensajes del chat (de varias personas)', memoria().ms.length===6 && /relleno 3/.test(memoria().ms[4].texto) && memoria().ms[2].quien==='Gero', memoria().ms.length);
{ const antes=memoria().mensajes;
  await teams(actividad('u-ana','gracias'));
  await teams(actividad('u-gero','hola'));
  ok('los saludos sueltos no entran en la memoria (no pasaron por el modelo)', memoria().mensajes===antes); }
{ const antes=memoria().mensajes; const aiAnterior=env.AI;
  env={ DB, AI, ...CFG, ASISTENTE_POR_HORA:'1' }; db.exec('DELETE FROM asistente_uso'); db.prepare("INSERT INTO asistente_uso (hora, usuario_id, preguntas) VALUES (strftime('%Y-%m-%dT%H','now'), ?, 5)").run(id('ana'));
  await teams(actividad('u-ana','otra pregunta sin cupo'));
  ok('si no pudo responder (límite), tampoco se guarda', /máximo de 1 preguntas por hora/.test((ultimo()||{}).text||'') && memoria().mensajes===antes);
  env={ DB, AI:aiAnterior, ...CFG }; db.exec('DELETE FROM asistente_uso'); }
// El permiso es el de quien pregunta: Soporte sin tareas en la sala no recibe datos aunque el chat venga hablando de ella
{ const antes=memoria().mensajes;
  r=await teams(actividad('u-upn','¿qué reviso primero?'));
  ok('el permiso sigue siendo el de quien pregunta: Soporte sin tareas en la sala recibe el aviso de siempre y no se guarda nada', pedidosIA.length===0 && /Esa sala de crisis no tiene tareas/.test((ultimo()||{}).text||'') && memoria().mensajes===antes, ultimo()); }
// Otra sala: lo anterior era de otro tema
{ const r2=await call(ck.ana,'POST','/api/incidentes',{alertas:[db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and severidad_maxima!='BAJA' and alerta_id not in (select alerta_id from incidente_alertas) limit 1").get().alerta_id]});
  const IM2=r2.j.incidente.id;
  await teams(actividad('u-gero','IM-'+IM2+' ¿cómo vamos?'));
  ok('si se pregunta por otra sala, se empieza de cero y se recuerda la nueva', !hablaCon('relleno') && !hablaCon('(A1)') && memoria().sala_id===IM2 && memoria().ms.length===2, memoria());
  await teams(actividad('u-ana','¿y qué falta?'));
  ok('la pregunta siguiente (de otra persona) sigue en la sala nueva', new RegExp('incidente/'+IM2).test((ultimo()||{}).text||'') && hablaCon('Gero: IM-'+IM2+' ¿cómo vamos?')); }
// Vencimiento
db.prepare("UPDATE teams_bot_memoria SET actualizado = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 hours')").run();
await teams(actividad('u-ana','¿y ahora?'));
ok('pasadas 2 horas, el bot empieza de nuevo (no usa lo viejo ni la sala vieja)', !hablaCon('¿cómo vamos?') && !hablaCon('¿y qué falta?') && memoria().ms.length===2 && /varias salas abiertas/.test((ultimo()||{}).text||''), ultimo());
// Limpieza de lo viejo
db.prepare("INSERT OR REPLACE INTO teams_bot_memoria (conversacion_id, mensajes, sala_id, actualizado) VALUES ('19:viejo', '[]', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 days'))").run();
await teams(actividad('u-ana','IM-4 ¿qué está demorado?'));
ok('lo de más de 7 días se borra solo', !q1("select 1 from teams_bot_memoria where conversacion_id='19:viejo'"));
// Empezar de nuevo (vale para todo el chat)
await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
await teams(actividad('u-gero','<at>Gemma</at> Empezar de nuevo'));
ok('«empezar de nuevo» (lo pida quien lo pida) borra la memoria de ese chat, avisa y no consulta el modelo', pedidosIA.length===0 && /empezamos de nuevo/.test((ultimo()||{}).text||'') && !memoria(), ultimo());
await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
await teams(actividad('u-ana','¿y qué más?',{ act: { conversation: { id: '19:otro-chat@thread.v2', conversationType: 'groupChat' } } }));
await teams(actividad('u-ana','olvidá todo'));
ok('olvidar borra solo la memoria del chat donde se pide', !memoria() && !!memoria('19:otro-chat@thread.v2'));
// Sin el script 25
db.exec('DROP TABLE teams_bot_memoria');
textoIA='Respuesta sin memoria.';
r=await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
ok('sin el script 25 el bot responde igual (cada mensaje es independiente)', /Respuesta sin memoria\./.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-gero','¿y de qué depende?'));
ok('…y no recuerda lo anterior', !hablaCon('qué reviso primero') && !!ultimo());
r=await call(A,'GET','/api/admin/teams/bot');
ok('Administración avisa que falta el script 25', r.s===200 && r.j.memoria===false, r.j);
r=await teams(actividad('u-ana','empezar de nuevo'));
ok('y «empezar de nuevo» tampoco falla', /empezamos de nuevo/.test((ultimo()||{}).text||''));
db.exec("CREATE TABLE teams_bot_memoria ( conversacion_id TEXT PRIMARY KEY, mensajes TEXT NOT NULL, sala_id INTEGER, actualizado TEXT NOT NULL ) WITHOUT ROWID");
r=await call(A,'GET','/api/admin/teams/bot'); ok('con el script 25, Administración lo ve activo', r.j.memoria===true);
textoIA='Respuesta de Helios.';
olvidarTodo();

// ---------- El nombre con el que se lo menciona: @Gemma ----------
olvidarTodo();
r=await teams({ type:'conversationUpdate', id:'cu-n', serviceUrl:SERVICIO, channelId:'msteams', membersAdded:[{ id:'28:'+APP }], from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Gemma' }, conversation:{ id:'19:chat@thread.v2' }, channelData:{ tenant:{ id:TENANT } } });
ok('el saludo usa el nombre de la app en Teams (@Gemma)', /soy Gemma/.test((ultimo()||{}).text||'') && /\*\*@Gemma IM-4/.test((ultimo()||{}).text||''), ultimo());
r=await teams({ type:'conversationUpdate', id:'cu-m', serviceUrl:SERVICIO, channelId:'msteams', membersAdded:[{ id:'28:'+APP }], from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Asistente Helios' }, conversation:{ id:'19:chat-otro-nombre@thread.v2' }, channelData:{ tenant:{ id:TENANT } } });
ok('si la app se registró con otro nombre, usa ese', /\*\*@Asistente Helios IM-4/.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-ana','<at>Gemma</at> IM-4 ¿qué reviso primero?'));
ok('la mención @Gemma de un chat grupal se contesta como cualquier otra', /Respuesta de Helios\./.test((ultimo()||{}).text||'') && hablaCon('qué reviso primero') && !hablaCon('<at>') && !hablaCon('Gemma IM-4'), ultimo());
r=await teams(actividad('u-ana','gemma, ¿hubo algo parecido antes?'));
ok('en un chat de a dos se lo puede llamar por el nombre sin mención («gemma, …»): el nombre no llega al modelo', /Respuesta de Helios\./.test((ultimo()||{}).text||'') && hablaCon('¿hubo algo parecido antes?') && !/"content":"gemma/i.test(JSON.stringify(pedidosIA)), ultimo());
r=await teams(actividad('u-ana','@Gemma hola'));
ok('«@Gemma hola» es un saludo (no gasta una pregunta)', pedidosIA.length===0 && /^Hola\./.test((ultimo()||{}).text||''), ultimo());
r=await teams(actividad('u-ana','gemmas del sur: ¿qué reviso?'));
ok('una palabra que empieza igual que el nombre (gemmas) no se recorta', hablaCon('gemmas del sur'), pedidosIA.length);
r=await teams(actividad('u-ana','<at>Gemma</at>'));
ok('solo la mención, sin pregunta: explica cómo usarlo', /soy Gemma/.test((ultimo()||{}).text||'') && pedidosIA.length===0);
olvidarTodo();

// ---------- Instalación y bienvenida ----------
r=await teams({ type:'conversationUpdate', id:'cu-1', serviceUrl:SERVICIO, channelId:'msteams', membersAdded:[{ id:'28:'+APP }], from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Helios' }, conversation:{ id:'19:chat@thread.v2' }, channelData:{ tenant:{ id:TENANT } } });
ok('al sumar el bot a un chat, saluda y explica cómo usarlo', /Mencioname/.test((ultimo()||{}).text||''));
r=await teams({ type:'conversationUpdate', id:'cu-2', serviceUrl:SERVICIO, channelId:'msteams', membersAdded:[{ id:'u-ana' }], from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Helios' }, conversation:{ id:'19:chat@thread.v2' }, channelData:{ tenant:{ id:TENANT } } });
ok('si se suma una persona (no el bot), no dice nada', salidas.length===0);
r=await teams({ type:'installationUpdate', action:'add', id:'iu-1', serviceUrl:SERVICIO, channelId:'msteams', from:{ id:'u-ana' }, recipient:{ id:'28:'+APP }, conversation:{ id:'a:1' }, channelData:{ tenant:{ id:TENANT } } });
ok('al instalar la app, saluda', /Mencioname/.test((ultimo()||{}).text||''));
r=await teams({ type:'typing', id:'t-1', serviceUrl:SERVICIO, channelId:'msteams', from:{ id:'u-ana' }, recipient:{ id:'28:'+APP }, conversation:{ id:'a:1' }, channelData:{ tenant:{ id:TENANT } } });
ok('otros eventos (por ejemplo "está escribiendo") se ignoran con 200', r.s===200 && salidas.length===0);


// ---------- Un solo saludo por chat (parche 79) ----------
// Teams manda dos avisos al instalar la app (installationUpdate y conversationUpdate): antes cada uno saludaba y el chat recibía el saludo dos veces
olvidarTodo();
const CONV = (c) => ({ id: c, conversationType: 'groupChat' });
const cuInstal = (c, id) => ({ type:'conversationUpdate', id, serviceUrl:SERVICIO, channelId:'msteams', membersAdded:[{ id:'28:'+APP }], from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Gemma' }, conversation:CONV(c), channelData:{ tenant:{ id:TENANT } } });
const iuInstal = (c, id) => ({ type:'installationUpdate', action:'add', id, serviceUrl:SERVICIO, channelId:'msteams', from:{ id:'u-ana' }, recipient:{ id:'28:'+APP, name:'Gemma' }, conversation:CONV(c), channelData:{ tenant:{ id:TENANT } } });
let saludos = 0;
for (const a of [iuInstal('19:doble@thread.v2', 'iu-d'), cuInstal('19:doble@thread.v2', 'cu-d')]) { await teams(a); saludos += mensajes().filter((x) => /Mencioname/.test(x.cuerpo.text)).length; }
ok('si Teams manda los dos avisos al instalar (primero la instalación), el chat recibe un solo saludo', saludos === 1, saludos);
saludos = 0;
for (const a of [cuInstal('19:doble2@thread.v2', 'cu-e'), iuInstal('19:doble2@thread.v2', 'iu-e')]) { await teams(a); saludos += mensajes().filter((x) => /Mencioname/.test(x.cuerpo.text)).length; }
ok('y si llegan en el otro orden, también uno solo', saludos === 1, saludos);
await Promise.all([teams(cuInstal('19:doble3@thread.v2', 'cu-f')), teams(iuInstal('19:doble3@thread.v2', 'iu-f'))]);
ok('(la marca del saludo queda anotada, una por chat)', n("select count(*) n from teams_bot_memoria where conversacion_id like 'saludo:%'") === 3);
await teams(cuInstal('19:doble@thread.v2', 'cu-g'));
ok('dentro de los 10 minutos, otro aviso del mismo chat no vuelve a saludar', mensajes().length === 0, mensajes().length);
db.prepare("UPDATE teams_bot_memoria SET actualizado = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-11 minutes') WHERE conversacion_id = 'saludo:19:doble@thread.v2'").run();
await teams(cuInstal('19:doble@thread.v2', 'cu-h'));
ok('si se lo saca y se lo vuelve a sumar pasados 10 minutos, saluda de nuevo', mensajes().length === 1 && /Mencioname/.test(ultimo().text));
ok('el saludo cuenta lo que se puede preguntar por perfil (alertas, tareas, casos parecidos)', /qué alertas tengo asignadas/.test(ultimo().text) && /qué tareas tengo/.test(ultimo().text) && /algo parecido/.test(ultimo().text), ultimo().text);
await teams(actividad('u-ana','IM-4 ¿qué reviso primero?'));
ok('la marca del saludo no se confunde con la memoria de la conversación (el chat sigue su curso)', n("select count(*) n from teams_bot_memoria where conversacion_id = '19:chat@thread.v2'") === 1);
olvidarTodo();
// Sin el script 25 no hay dónde anotar la marca: saluda solo con uno de los dos avisos (el de conversationUpdate)
db.exec('DROP TABLE teams_bot_memoria');
saludos = 0;
for (const a of [iuInstal('19:sin25@thread.v2', 'iu-s'), cuInstal('19:sin25@thread.v2', 'cu-s')]) { await teams(a); saludos += mensajes().filter((x) => /Mencioname/.test(x.cuerpo.text)).length; }
ok('sin el script 25 también saluda una sola vez', saludos === 1, saludos);
db.exec("CREATE TABLE teams_bot_memoria ( conversacion_id TEXT PRIMARY KEY, mensajes TEXT NOT NULL, sala_id INTEGER, actualizado TEXT NOT NULL ) WITHOUT ROWID");
olvidarTodo();

// ---------- Cada perfil pregunta por lo suyo (parche 79) ----------
// Lo que llega al modelo (sección «Datos de Helios») para cada pregunta: alertas asignadas o sin asignar, tareas de las salas y casos parecidos ya cerrados
const datosIA = () => pedidosIA.map((p) => (p.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n')).join('\n');
const datosJSON = () => { const D = datosIA(), m = 'Datos de Helios para responder (JSON):\n', i = D.indexOf(m); if (i < 0) return {}; try { return JSON.parse(D.slice(i + m.length).split('\n')[0]); } catch (e) { return {}; } };
const trae = (clave) => datosJSON()[clave] !== undefined;
const sec = (clave) => JSON.stringify(datosJSON()[clave] === undefined ? null : datosJSON()[clave]);   // solo lo que trajo esa herramienta
await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Llamar al proveedor',responsable_usuario_id:id('carla')});
await call(ck.ana,'POST',`/api/incidentes/${IM}/tareas`,{titulo:'Revisar el balanceador',equipo_id:q1("select id from equipos where nombre='Mesa'").id});
// Tareas
r=await teams(actividad('u-sol','IM-4 ¿qué tareas tengo?'));
ok('Soporte pregunta por sus tareas dentro de la sala: llegan las de todas las salas abiertas que le tocan', trae('tareas_salas') && /Revisar el gateway/.test(sec('tareas_salas')), sec('tareas_salas'));
ok('…incluida la que es de su equipo y nadie tomó («sin tomar»)', /Revisar el balanceador/.test(sec('tareas_salas')) && /sin persona responsable/.test(sec('tareas_salas')));
ok('…y no ve las tareas de otra persona de Soporte (en esta lista; las de la sala donde trabaja sí, como siempre)', !/Llamar al proveedor/.test(sec('tareas_salas')), sec('tareas_salas'));
olvidarTodo();
r=await teams(actividad('u-upn','¿qué tareas tengo asignadas?'));
ok('otra persona de Soporte, fuera de una sala, ve solo las suyas (no las de Sol ni las de su equipo)', trae('tareas_salas') && /Llamar al proveedor/.test(sec('tareas_salas')) && !/Revisar el gateway|Revisar el balanceador/.test(sec('tareas_salas')), sec('tareas_salas'));
olvidarTodo();
r=await teams(actividad('u-ana','¿qué tareas hay sin tomar o sin asignar?'));
ok('el Analista ve las tareas de toda la operación, con las que están sin tomar', trae('tareas_salas') && /Revisar el gateway/.test(sec('tareas_salas')) && /Llamar al proveedor/.test(sec('tareas_salas')) && /"sin_tomar":1/.test(sec('tareas_salas')), sec('tareas_salas'));
olvidarTodo();
r=await teams(actividad('u-gero','¿qué tareas hay abiertas?'));
ok('el Gerente también (solo lectura)', trae('tareas_salas') && /Llamar al proveedor/.test(sec('tareas_salas')) && !/Propuestas/.test((ultimo()||{}).text||''), sec('tareas_salas'));
olvidarTodo();
// Alertas asignadas y sin asignar
await call(ck.ana,'POST',`/api/alertas/${ab[0]}/derivar`,{usuario_id:id('sol')});
r=await teams(actividad('u-sol','¿qué alertas tengo asignadas?'));
ok('Soporte pregunta por sus alertas asignadas: llegan las suyas', trae('mis_alertas') && /Se aprueban menos operaciones/.test(sec('mis_alertas')), sec('mis_alertas'));
r=await teams(actividad('u-sol','IM-4 ¿qué alertas tengo asignadas?'));
ok('…también dentro de una sala (antes solo llegaban los datos de la sala)', trae('mis_alertas') && trae('estado_incidente'), datosIA().slice(0,200));
r=await teams(actividad('u-ana','IM-4 ¿hay alertas sin asignar?'));
ok('el Analista pregunta por lo sin asignar dentro de la sala: llegan las alertas abiertas con su estado', trae('alertas_abiertas') && trae('estado_incidente') && /sin_asignar/.test(sec('alertas_abiertas')));
r=await teams(actividad('u-ana','¿hay alertas sin asignar?'));
ok('…y fuera de una sala también', trae('alertas_abiertas'));
// Casos parecidos ya cerrados
db.exec("DROP TABLE IF EXISTS cp_t");
db.exec(`CREATE TEMP TABLE cp_t AS SELECT * FROM alertas_historico WHERE alerta_id = '${ab[0]}'`);
const cerrar = (idx, ventana, resol, causa, acc, asig) => {
  db.exec(`UPDATE cp_t SET alerta_id = 'c${idx}' || substr(alerta_id, 3), ventana_inicio = '${ventana}T10:00:00Z', ventana_fin = '${ventana}T10:15:00Z', estado = 'RESUELTA', fecha_resolucion = '${resol}T11:00:00Z',
    motivo_resolucion = 'MANUAL', resuelta_por = 'Ana Lista', causa_resolucion = '${causa}', acciones_resolucion = '${acc}', asignado_usuario_id = ${asig}, asignado_equipo_id = NULL`);
  db.exec('INSERT INTO alertas_historico SELECT * FROM cp_t');
};
cerrar(1, '2026-10-24', '2026-10-24', 'Falla en el gateway del proveedor', 'Escalado al proveedor', id('sol'));
cerrar(2, '2026-10-23', '2026-10-23', 'Causa que Soporte no tiene que ver', 'Reinicio del servicio', 'NULL');
db.exec('DROP TABLE cp_t');
olvidarTodo();
r=await teams(actividad('u-ana','¿hubo algo parecido antes?'));
ok('el Analista pregunta si hubo algo parecido: llegan los casos ya cerrados, con la causa y qué se hizo', trae('casos_parecidos') && /Falla en el gateway del proveedor/.test(sec('casos_parecidos')) && /Escalado al proveedor/.test(sec('casos_parecidos')) && /Causa que Soporte no tiene que ver/.test(sec('casos_parecidos')), sec('casos_parecidos'));
olvidarTodo();
r=await teams(actividad('u-sol','¿hubo algo parecido antes?'));
ok('Soporte recibe solo los casos parecidos que fueron suyos o de su equipo', trae('casos_parecidos') && /Falla en el gateway del proveedor/.test(sec('casos_parecidos')) && !/Causa que Soporte no tiene que ver/.test(sec('casos_parecidos')), sec('casos_parecidos'));
r=await teams(actividad('u-sol','IM-4 ¿pasó algo similar antes?'));
ok('dentro de la sala, además de los antecedentes de la sala, llegan los casos parecidos de las alertas', trae('guia_diagnostico') && trae('casos_parecidos') && trae('estado_incidente'), datosIA().slice(0,200));
olvidarTodo();
r=await teams(actividad('u-gero','¿hubo algo parecido antes?'));
ok('el Gerente también los ve (solo lectura, sin propuestas)', trae('casos_parecidos') && /Falla en el gateway del proveedor/.test(sec('casos_parecidos')) && !/Propuestas/.test((ultimo()||{}).text||''), sec('casos_parecidos'));
olvidarTodo();
r=await teams(actividad('u-upn','¿hubo algo parecido antes?'));
ok('Soporte sin alertas asignadas no recibe casos de otros', !/Falla en el gateway|Causa que Soporte/.test(sec('casos_parecidos')) && /No hay alertas abiertas para comparar/.test(sec('casos_parecidos')), sec('casos_parecidos'));
olvidarTodo();

// ---------- Cuando Microsoft falla ----------
falloMembers=true; BOT_CORREOS_LIMPIAR();
function BOT_CORREOS_LIMPIAR(){ CORREOS['u-nuevo']='ana@helios.test'; }
r=await teams(actividad('u-nuevo','IM-4 ¿qué reviso primero?'));
ok('si Teams no deja leer quién escribe, pide reintentar y no consulta el modelo', pedidosIA.length===0 && /No pude confirmar quién sos/.test((ultimo()||{}).text||''), ultimo());
falloMembers=false;
rechazar401=1;
r=await teams(actividad('u-ana','gracias'));
ok('si Microsoft rechaza el token una vez (venció), pide otro y reintenta: la respuesta llega igual', /De nada/.test((ultimo()||{}).text||'') && salidas.filter(x=>x.metodo==='POST').length===3 && mensajes().length===1, salidas.map(x=>x.metodo));

// ---------- Administración ----------
r=await call(A,'GET','/api/admin/teams/bot');
ok('el Administrador ve el estado y la dirección de mensajes', r.s===200 && r.j.configurado===true && r.j.con_tenant===true && r.j.direccion==='https://x/api/teams/bot' && r.j.falta.length===0, r.j);
r=await call(ck.ana,'GET','/api/admin/teams/bot'); ok('un Analista no lo ve (403)', r.s===403);
env={ DB, AI, TEAMS_BOT_APP_ID:APP };
r=await call(A,'GET','/api/admin/teams/bot'); ok('sin el secreto, dice qué falta', r.j.configurado===false && r.j.falta.join()==='TEAMS_BOT_SECRET', r.j);
r=await call(A,'POST','/api/admin/teams/bot/probar',{}); ok('y no deja probar', r.s===409);
env={ DB, AI, ...CFG };
const aud0=n("select count(*) n from auditoria where accion='TEAMS_BOT_PRUEBA'");
r=await call(A,'POST','/api/admin/teams/bot/probar',{}); ok('la prueba de conexión pide un token a Microsoft y queda en la auditoría', r.s===200 && n("select count(*) n from auditoria where accion='TEAMS_BOT_PRUEBA'")===aud0+1, r.j);
env={ DB, AI, ...CFG, TEAMS_BOT_SECRET:'mal-secreto-123' };
r=await call(A,'POST','/api/admin/teams/bot/probar',{}); ok('con un secreto que Microsoft rechaza, explica por qué', r.s===502 && /Invalid client secret/.test(r.j.error) && !/mal-secreto/.test(r.j.error), r.j);
env={ DB, AI, ...CFG };
r=await call(ck.ana,'POST','/api/admin/teams/bot/probar',{}); ok('un Analista no puede probar (403)', r.s===403);
r=await call('','GET','/api/teams/bot'); ok('el GET de la dirección del bot no es una ruta pública (pide sesión)', r.s===401);
r=await call(A,'GET',`/incidente/${IM}`); ok('la página de la sala sigue andando y su borrador del chat explica cómo sumar al asistente', r.s===200 && r.t.includes('sumá la app'), r.s);
r=await call(A,'GET',`/api/incidentes/${IM}`); ok('la sala le pasa a la página el nombre del bot (Gemma por defecto)', r.s===200 && r.j.teams_chat && r.j.teams_chat.bot==='Gemma', r.j.teams_chat);
env={ DB, AI, ...CFG, TEAMS_BOT_NOMBRE:'Helios' };
r=await call(A,'GET',`/api/incidentes/${IM}`); ok('y con TEAMS_BOT_NOMBRE usa ese', r.j.teams_chat.bot==='Helios');
r=await call(A,'GET','/api/admin/teams/bot'); ok('Administración muestra el nombre', r.j.nombre==='Helios', r.j);
env={ DB, AI, ...CFG };

globalThis.fetch = fetchReal;
console.log(fallas ? 'FALLAS: '+fallas : 'TODO OK');
