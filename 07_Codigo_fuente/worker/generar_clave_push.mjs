// Genera la clave VAPID de los avisos push (parche 26) para cargarla como secreto del Worker.
// Uso: node generar_clave_push.mjs [archivo]   (por defecto la escribe en clave_push_secreta.txt)
// Ese texto va en Cloudflare: worker-alertas-cron → Settings → Variables and Secrets → Add → tipo Secret,
// nombre VAPID_JWK. No lo compartan ni lo suban a ningún lado. Si se pierde, se genera otra
// (los dispositivos tienen que volver a tocar "Activar" en la campanita).
import fs from 'node:fs';
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const j = await crypto.subtle.exportKey('jwk', par.privateKey);
const texto = JSON.stringify({ kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d });
const archivo = process.argv[2] || 'clave_push_secreta.txt';
fs.writeFileSync(archivo, texto + '\n');
console.log('Clave escrita en ' + archivo + ' (cargala como secreto VAPID_JWK del Worker).');
