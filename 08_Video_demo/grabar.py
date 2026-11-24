# Graba la demo de Helios de punta a punta (video + tiempos de la voz en off).
# Uso:  python grabar.py [--seco] [--hasta N] [--salida carpeta]
#   --seco   pasada de prueba: sin video y con esperas cortas (sirve para depurar el guion)
#   --hasta  corta después del capítulo N
# Levanta su propio servidor con una copia limpia de la base de la demo (ver preparar_base.mjs).
import argparse, json, os, shutil, subprocess, sys, time, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import voz
from grab import Grabador
from guion import TEXTOS, AUDIOS
import capitulos, historial

ap = argparse.ArgumentParser()
ap.add_argument('--seco', action='store_true')
ap.add_argument('--hasta', type=int, default=99)
ap.add_argument('--salida', default=os.path.join(AQUI, 'salida', 'trabajo'))
ap.add_argument('--base', default=os.environ.get('HELIOS_DEMO_BASE'))
ap.add_argument('--puerto', type=int, default=80, help='80 muestra la dirección como http://helios.localhost (sin puerto); si está ocupado se usa 8791')
a = ap.parse_args()
import socket
def _libre(p):
    x = socket.socket()
    try: x.bind(('0.0.0.0', p)); return True
    except OSError: return False
    finally: x.close()
if not _libre(a.puerto): a.puerto = 8791
os.makedirs(a.salida, exist_ok=True)
base_sqlite = a.base or os.path.join(a.salida, 'base.sqlite')
if not os.path.exists(base_sqlite):
    subprocess.run(['node', '--no-warnings', 'preparar_base.mjs', base_sqlite], cwd=AQUI, check=True)
trabajo_sqlite = os.path.join(a.salida, 'trabajo.sqlite')
shutil.copy(base_sqlite, trabajo_sqlite)

servidor = subprocess.Popen(['node', '--no-warnings', 'servidor_demo.mjs', trabajo_sqlite, str(a.puerto)], cwd=AQUI,
                            stdout=open(os.path.join(a.salida, 'servidor.log'), 'w'), stderr=subprocess.STDOUT)
BASE = 'http://helios.localhost' + ('' if a.puerto == 80 else ':%d' % a.puerto)
for _ in range(60):
    try: urllib.request.urlopen('http://127.0.0.1:%d/login' % a.puerto); break
    except Exception: time.sleep(0.5)
else:
    raise SystemExit('El servidor no arrancó')

try:
    voces = voz.generar(list(TEXTOS.values()), os.path.join(a.salida, 'voces'), {TEXTOS[k]: os.path.join(AQUI, r) for k, r in AUDIOS.items()})
    g = Grabador(BASE, voces, a.salida, grabar=not a.seco)
    g.abrir()
    capitulos.preparar_demo(g)            # deja la demo en la escena 0
    print('Historial de días anteriores:', historial.sembrar(trabajo_sqlite), 'alertas resueltas'); historial.sembrar_contexto(trabajo_sqlite)
    g.ir('/login', espera=0.3)
    g.tarjeta('Helios', 'Monitoreo inteligente · Enterate antes que tus clientes'); g.esperar(0.8)
    g.empezar()
    for n, cap in enumerate(capitulos.CAPITULOS, 1):
        if n > a.hasta: break
        print('Capítulo %d: %s' % (n, cap.__doc__.strip().splitlines()[0]), flush=True)
        g.capitulo(cap.__doc__.strip().splitlines()[0])
        cap(g)
    g.guardar_tiempos()
    print('Errores de consola:', g.errores[:10])
    g.cerrar()
finally:
    servidor.terminate()
