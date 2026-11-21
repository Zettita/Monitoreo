# Arma el paquete (.zip) de la app de Helios para Teams: manifiesto + íconos.
# Uso:  python armar_paquete.py <BOT_ID> [--nombre Gemma] [--url https://worker-alertas-cron.developers-hs-842.workers.dev] [--salida carpeta]
#   --nombre = cómo se lo menciona en Teams (@Gemma). Tiene que ser el mismo nombre con que IT registró el bot.
#   BOT_ID = el Bot ID / Microsoft App ID que entrega el registro del bot (un GUID). Se usa también como id de la app.
# Después lo sube IT al Teams admin center (Teams apps > Manage apps > Upload new app; el manifiesto es 1.25 con supportsChannelFeatures = tier1, que Teams exige por el alcance «team») o se importa en el Developer Portal (Apps > Import app).
import argparse, json, os, re, sys, zipfile
from urllib.parse import urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
ICONOS = os.path.join(AQUI, '..', 'worker', 'iconos')

ap = argparse.ArgumentParser()
ap.add_argument('bot_id')
ap.add_argument('--nombre', default='Gemma')
ap.add_argument('--url', default='https://worker-alertas-cron.developers-hs-842.workers.dev')
ap.add_argument('--salida', default=os.path.join(AQUI, 'salida'))
a = ap.parse_args()
if not re.fullmatch(r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', a.bot_id):
    sys.exit('El Bot ID tiene que ser un GUID, por ejemplo 11111111-2222-3333-4444-555555555555.')
u = urlparse(a.url)
if u.scheme != 'https' or not u.netloc:
    sys.exit('La dirección (--url) tiene que ser https.')

texto = open(os.path.join(AQUI, 'manifest.plantilla.json'), encoding='utf-8').read()
if not 2 <= len(a.nombre) <= 20 or re.search(r'[<>"@]', a.nombre):
    sys.exit('El nombre tiene que tener entre 2 y 20 letras y sin @, < ni >.')
texto = texto.replace('{{NOMBRE}}', a.nombre).replace('{{BOT_ID}}', a.bot_id.lower()).replace('{{URL}}', a.url.rstrip('/')).replace('{{DOMINIO}}', u.netloc)
m = json.loads(texto)
assert len(m['name']['short']) <= 30 and len(m['description']['short']) <= 80 and len(m['description']['full']) <= 4000

from PIL import Image
color = Image.open(os.path.join(ICONOS, 'icono-192.png')).convert('RGBA').resize((192, 192), Image.LANCZOS)    # a color, 192 x 192
contorno = Image.open(os.path.join(ICONOS, 'icono-insignia.png')).convert('RGBA').resize((32, 32), Image.LANCZOS)  # blanco sobre transparente, 32 x 32

os.makedirs(a.salida, exist_ok=True)
destino = os.path.join(a.salida, 'Helios_bot_teams.zip')
tmp = os.path.join(a.salida, '_tmp')
os.makedirs(tmp, exist_ok=True)
color.save(os.path.join(tmp, 'color.png')); contorno.save(os.path.join(tmp, 'outline.png'))
with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('manifest.json', json.dumps(m, ensure_ascii=False, indent=2))
    z.write(os.path.join(tmp, 'color.png'), 'color.png'); z.write(os.path.join(tmp, 'outline.png'), 'outline.png')
for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
os.rmdir(tmp)
print('Listo:', destino)
print('  Se lo menciona como @' + a.nombre)
print('  App / Bot ID:', a.bot_id.lower(), '· dominio válido:', u.netloc)
