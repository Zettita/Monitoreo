import { DatabaseSync } from 'node:sqlite';
// Jira real (parche 53): prueba crearTicketJira con un fetch de mentira. No llama a Jira: comprueba qué pedido arma Helios
// (dirección, autenticación, campos, descripción), cómo guarda la respuesta y los mensajes cuando Jira falla.
// Las credenciales de acá son inventadas.
const worker = (await import('../worker/w.mjs')).default;
const db = new DatabaseSync(process.argv[2]);
const mk=(sql)=>{let b=[];const st={bind(...a){b=a.map(x=>x===undefined?null:x instanceof ArrayBuffer?Buffer.from(x):x);return st},async all(){return{results:db.prepare(sql).all(...b),meta:{}}},async first(){return db.prepare(sql).get(...b)??null},async run(){const r=db.prepare(sql).run(...b);return{meta:{changes:Number(r.changes)}}},_exec(){const s=db.prepare(sql);if(/^\s*(select|with)/i.test(sql))return{results:s.all(...b),meta:{}};const r=s.run(...b);return{results:[],meta:{changes:Number(r.changes)}}}};return st};
db.exec('PRAGMA foreign_keys = ON');
// R2 simulado: guarda en memoria lo que el Worker sube
const r2=new Map();
const EVIDENCIA={async put(k,v,o){r2.set(k,{datos:new Uint8Array(v),tipo:o&&o.httpMetadata&&o.httpMetadata.contentType,custom:(o&&o.customMetadata)||{},subido:new Date()});},async get(k){const x=r2.get(k);return x?{body:x.datos,httpMetadata:{contentType:x.tipo},customMetadata:x.custom,size:x.datos.length}:null;},async head(k){const x=r2.get(k);return x?{key:k,httpMetadata:{contentType:x.tipo},customMetadata:x.custom,size:x.datos.length}:null;},async delete(k){r2.delete(k);},async list(o){return{objects:[...r2.entries()].filter(([k])=>k.startsWith(o.prefix)).map(([k,x])=>({key:k,size:x.datos.length,uploaded:x.subido,httpMetadata:{contentType:x.tipo},customMetadata:x.custom}))};}};
const DB={prepare:mk,async batch(s){db.exec('BEGIN');try{const r=s.map(x=>x._exec());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
let env={DB,EVIDENCIA};
const call=async(ck,m,p,body,extra)=>{
  const h=Object.assign({cookie:ck||''},extra&&extra.headers||{});
  if(body!==undefined&&!(extra&&extra.crudo))h['content-type']='application/json';
  const r=await worker.fetch(new Request('https://x'+p,{method:m,headers:h,body:body===undefined?undefined:(extra&&extra.crudo?body:JSON.stringify(body)),redirect:'manual'}),env,{});
  const sc=r.headers.get('set-cookie');const ct=r.headers.get('content-type')||'';
  const bin=extra&&extra.bin&&!ct.includes('json')?new Uint8Array(await r.arrayBuffer()):null;
  const j=!bin&&ct.includes('json')?await r.json():null;const t=j||bin?null:await r.text();
  return{s:r.status,j:j||{},t,bin,ck:sc?sc.split(';')[0]:null,h:r.headers};
};
const subir=(ck,al,nombre,contenido)=>call(ck,'POST',`/api/alertas/${al}/adjuntos`,contenido,{crudo:true,headers:{'x-nombre-archivo':encodeURIComponent(nombre),'content-type':'application/octet-stream'}});
let fallas=0; const ok=(t,c,x)=>{console.log((c?'OK  ':'FALLA ')+t+(x!==undefined?'  → '+(typeof x==='string'?x:JSON.stringify(x).slice(0,200)):''));if(!c)fallas++;};
const login=async(u,c)=>(await call('','POST','/api/login',{usuario:u,clave:c})).ck;

await call('','POST','/api/setup',{usuario:'uriel',nombre:'Uriel Solnik',clave:'ClaveSegura123'});
const A=await login('uriel','ClaveSegura123');
const ck={};
for (const [u,n,p] of [['ana','Ana Lista','ANALISTA'],['sol','Sol Porte','SOPORTE'],['carla','Carla Lider','SOPORTE'],['pedro','Pedro Pagos','SOPORTE'],['gero','Gero Rente','GERENTE']]) {
  const r=await call(A,'POST','/api/admin/usuarios',{usuario:u,nombre:n,perfil:p,correo:u+'@helios.test'}); const c=await login(u,r.j.clave_temporal);
  await call(c,'POST','/api/cambiar-clave',{actual:r.j.clave_temporal,nueva:'Clave'+u+'123456'}); ck[u]=c;
}
const id=(u)=>db.prepare('select id from usuarios where usuario=?').get(u).id;
await call(A,'POST','/api/admin/equipos',{nombre:'Mesa',responsable_id:id('carla'),miembros:[id('sol'),id('carla')]});
await call(A,'POST','/api/admin/equipos',{nombre:'Pagos',miembros:[id('pedro')]});
const MESA=db.prepare("select id from equipos where nombre='Mesa'").get().id;
await call(A,'POST','/api/demo/preparar');
const sig=async(n)=>{for(let i=0;i<n;i++) await call(A,'POST','/api/demo/siguiente');};
await sig(8);
const AL=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio").get().alerta_id;
const AL_2=db.prepare("select alerta_id from alertas_historico where tipo_alerta='RECHAZO_ALTO' and cliente_id='CLI_004' order by ventana_inicio desc").get().alerta_id;
const OTRA=db.prepare("select alerta_id from alertas_historico where estado!='RESUELTA' and tipo_alerta='ERROR_ALTO' order by ventana_inicio").get().alerta_id;
const tickets=()=>db.prepare('select * from tickets_alerta order by id').all();
let r;
let t;

const CONF = { JIRA_URL: 'https://monitoreo-helios.atlassian.net/', JIRA_USUARIO: 'servicio@ejemplo.com', JIRA_TOKEN: 'token-de-prueba-123', JIRA_PROYECTO: 'KAN', JIRA_TIPO: 'Tarea' };
const pedidos = []; let respuestas = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  pedidos.push({ url: String(url), op, cuerpo: op && op.body ? JSON.parse(op.body) : null });
  const x = respuestas.shift();
  if (x instanceof Error) throw x;
  return new Response(JSON.stringify(x.cuerpo === undefined ? {} : x.cuerpo), { status: x.status, headers: { 'content-type': 'application/json' } });
};
const generar = (al, resumen, extra) => call(ck.ana, 'POST', `/api/alertas/${al}/ticket`, Object.assign({ sistema: 'JIRA', resumen: resumen || 'Rechazos altos CLI_004 (Jira)' }, extra || {}));
const nTickets = () => tickets().length;
const reset = () => { pedidos.length = 0; respuestas = []; };
const aborto = () => { const e = new Error('x'); e.name = 'AbortError'; return e; };

env.TICKETS_JIRA = 'real';

// Sin configuración: avisa, no llama a nadie, no guarda
let antes = nTickets();
r = await generar(AL); ok('sin usuario ni token: 502 con aviso, sin llamar a Jira ni guardar', r.s === 502 && /Falta configurar la conexión con Jira/.test(r.j.error) && pedidos.length === 0 && nTickets() === antes, r.j.error);
Object.assign(env, CONF, { JIRA_URL: 'http://monitoreo-helios.atlassian.net' });
r = await generar(AL); ok('JIRA_URL sin https: no se usa', r.s === 502 && /Falta configurar/.test(r.j.error) && pedidos.length === 0);
Object.assign(env, CONF);

// Errores de Jira: mensajes claros, sin guardar y sin mostrar el token
const prueba = async (titulo, resp, re) => {
  reset(); respuestas = [resp]; antes = nTickets();
  const x = await generar(AL);
  ok(titulo, x.s === 502 && re.test(x.j.error) && nTickets() === antes && !x.j.error.includes(CONF.JIRA_TOKEN), x.j.error);
};
await prueba('401: usuario o token rechazado', { status: 401, cuerpo: {} }, /no aceptó el usuario o el token/);
await prueba('403: sin permiso en el proyecto', { status: 403, cuerpo: { errorMessages: ['No tenés permiso'] } }, /no tiene permiso para crear tickets/);
await prueba('404: sitio o proyecto no encontrado', { status: 404, cuerpo: {} }, /no encontró el sitio o el proyecto/);
await prueba('429: pide esperar', { status: 429, cuerpo: {} }, /esperar un momento/);
await prueba('500: Jira caído', { status: 503, cuerpo: {} }, /no está respondiendo bien/);
await prueba('400: tipo de ticket que no existe (muestra lo que dice Jira)', { status: 400, cuerpo: { errors: { issuetype: 'El tipo de ticket especificado no es válido.' } } }, /no aceptó el ticket: El tipo de ticket especificado no es válido\./);
await prueba('201 sin número de ticket', { status: 201, cuerpo: {} }, /no devolvió el número/);
await prueba('tiempo agotado', aborto(), /no respondió a tiempo/);
await prueba('sin conexión', new TypeError('fetch failed'), /No se pudo conectar/);

// Ticket bueno: qué pedido arma
reset(); respuestas = [{ status: 201, cuerpo: { id: '10001', key: 'KAN-7', self: 'https://x' } }]; antes = nTickets();
r = await generar(AL, '[P2 · Importante] CLI_004 · Transferencias por app: Suben los rechazos', { prioridad: 'P2', descripcion: 'Qué pasa: suben los rechazos.\n\nCliente: CLI_004\nVer la alerta: https://x/alerta/' + AL + ' (Helios)' });
const p = pedidos[0] || {}, f = (p.cuerpo && p.cuerpo.fields) || {};
ok('crea el ticket: KAN-7 con el enlace a Jira', r.s === 200 && r.j.ticket.clave === 'KAN-7' && r.j.ticket.url === 'https://monitoreo-helios.atlassian.net/browse/KAN-7' && r.j.ticket.simulado === 0 && r.j.ticket.estado === 'Abierto', r.j);
ok('un solo pedido, POST a /rest/api/3/issue (sin barra doble)', pedidos.length === 1 && p.url === 'https://monitoreo-helios.atlassian.net/rest/api/3/issue' && p.op.method === 'POST', p.url);
ok('autenticación Basic con usuario:token', p.op.headers.authorization === 'Basic ' + btoa('servicio@ejemplo.com:token-de-prueba-123') && p.op.headers['content-type'] === 'application/json');
ok('proyecto, tipo y resumen', f.project.key === 'KAN' && f.issuetype.name === 'Tarea' && f.summary === '[P2 · Importante] CLI_004 · Transferencias por app: Suben los rechazos', f);
ok('no manda el campo prioridad; la prioridad va como etiqueta', f.priority === undefined && JSON.stringify(f.labels) === '["helios","P2","RECHAZO_ALTO"]', f.labels);
const txtDoc = JSON.stringify(f.description);
ok('descripción en formato de Jira (ADF), con la prioridad de Helios, quién lo pidió y sin líneas vacías', f.description.type === 'doc' && f.description.version === 1 && f.description.content.every((x) => x.type === 'paragraph' && x.content.length) && /Prioridad en Helios: P2/.test(txtDoc) && /Qué pasa: suben los rechazos\./.test(txtDoc) && /Lo pidió en Helios: Ana Lista/.test(txtDoc));
ok('el enlace a Helios queda como link clickeable', txtDoc.includes('"marks":[{"type":"link","attrs":{"href":"https://x/alerta/' + AL + '"}}]'));
t = tickets()[tickets().length - 1];
ok('queda guardado como real, con la url y la descripción', t.sistema === 'JIRA' && t.clave === 'KAN-7' && t.simulado === 0 && t.url === 'https://monitoreo-helios.atlassian.net/browse/KAN-7' && t.alerta_id === AL);
ok('conversación y auditoría', db.prepare("select count(*) n from alerta_eventos where comentario='Generó el ticket KAN-7 en Jira'").get().n === 1 && db.prepare("select count(*) n from auditoria where accion='GENERAR_TICKET' and detalle like '%KAN-7 en Jira%'").get().n === 1);
ok('el token no queda en ninguna tabla', ['tickets_alerta', 'alerta_eventos', 'auditoria'].every((tb) => !JSON.stringify(db.prepare('select * from ' + tb).all()).includes(CONF.JIRA_TOKEN)));
r = await generar(AL_2); ok('un segundo ticket de Jira para el mismo problema: 409 y no llama a Jira', r.s === 409 && /KAN-7/.test(r.j.error) && pedidos.length === 1);

// Proyecto sin el campo "etiquetas": se reintenta una vez sin etiquetas
reset(); respuestas = [{ status: 400, cuerpo: { errors: { labels: "Field 'labels' cannot be set. It is not on the appropriate screen, or unknown." } } }, { status: 201, cuerpo: { key: 'KAN-8' } }];
r = await generar(OTRA, 'Errores técnicos CLI_002 (Jira)', { prioridad: 'P3' });
ok('sin campo etiquetas: reintenta una vez sin etiquetas y crea KAN-8', r.s === 200 && r.j.ticket.clave === 'KAN-8' && pedidos.length === 2 && pedidos[0].cuerpo.fields.labels && pedidos[1].cuerpo.fields.labels === undefined && pedidos[1].cuerpo.fields.summary === pedidos[0].cuerpo.fields.summary, pedidos.length);

// Sin tipo configurado usa "Task"; resumen con saltos de línea; descripción vacía
delete env.JIRA_TIPO; delete env.JIRA_URL; delete env.JIRA_PROYECTO; reset(); respuestas = [{ status: 201, cuerpo: { key: 'KAN-9' } }];
const AL3 = db.prepare("select alerta_id from alertas_historico where tipo_alerta not in ('RECHAZO_ALTO','ERROR_ALTO') order by ventana_inicio").get().alerta_id;
r = await generar(AL3, 'Caída\nen la alerta 3');
ok('sin JIRA_TIPO usa "Task"; sin URL ni proyecto usa el sitio y KAN; resumen en una línea', r.s === 200 && pedidos[0].url === 'https://monitoreo-helios.atlassian.net/rest/api/3/issue' && pedidos[0].cuerpo.fields.project.key === 'KAN' && pedidos[0].cuerpo.fields.issuetype.name === 'Task' && pedidos[0].cuerpo.fields.summary === 'Caída en la alerta 3' && pedidos[0].cuerpo.fields.description.content.length >= 1, pedidos[0] && pedidos[0].cuerpo.fields.summary);

// InvGate no cambia: sigue simulado, sin llamar a nadie
reset(); r = await call(ck.ana, 'POST', `/api/alertas/${AL}/ticket`, { sistema: 'INVGATE', resumen: 'InvGate sigue simulado' });
ok('InvGate sigue simulado y no hace pedidos', r.s === 200 && r.j.ticket.simulado === 1 && pedidos.length === 0);

globalThis.fetch = realFetch;
console.log(fallas ? `${fallas} FALLAS` : 'TODO OK');
