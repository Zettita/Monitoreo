# Genera los íconos de Helios (parche 26) a partir del logo "Helios System" (caballo de ajedrez blanco):
#   iconos/logo_helios_system.png   el logo original completo (caballo + texto, blanco sobre transparente)
#   iconos/icono-192.png, icono-512.png   fondo verde azulado con el caballo blanco (sirven también como "maskable")
#   iconos/apple-touch-icon.png (180)     el de la pantalla de inicio del iPhone
#   iconos/icono-insignia.png (96)        el caballo blanco sobre transparente: barra de avisos de Android y
#                                         máscara del logo de la barra superior de las páginas
# Solo se usa el caballo: el texto no se lee en tamaños chicos. El original es chico (el caballo mide ~60 × 85 px),
# así que se agranda suavizando el borde para que quede nítido.
# Uso: python iconos.py   (necesita Pillow; los PNG quedan en iconos/ y patch26.py los embebe en el Worker)
import os
from PIL import Image, ImageFilter

AQUI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(AQUI, 'iconos')
TEAL = (15, 118, 110, 255)


def silueta():
    im = Image.open(os.path.join(D, 'logo_helios_system.png')).convert('RGBA')
    a = im.split()[3]
    # El caballo es lo de arriba: termina en la primera fila vacía antes del texto
    filas = [any(a.getpixel((x, y)) > 40 for x in range(im.width)) for y in range(im.height)]
    arriba = filas.index(True)
    abajo = arriba + filas[arriba:].index(False)
    caja = a.crop((0, arriba, im.width, abajo)).getbbox()
    return a.crop((caja[0], arriba + caja[1], caja[2], arriba + caja[3]))


def agrandar(alfa, alto):
    """Alfa del caballo de 'alto' px, con borde nítido (agranda de a 8x, suaviza y vuelve a contrastar)."""
    g = alfa.resize((alfa.width * 8, alfa.height * 8), Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))
    g = g.point(lambda v: 0 if v < 96 else 255 if v > 160 else int((v - 96) * 255 / 64))
    return g.resize((max(1, round(alfa.width * alto / alfa.height)), alto), Image.LANCZOS)


def icono(lado, fondo, alto_rel):
    base = Image.new('RGBA', (lado, lado), fondo or (0, 0, 0, 0))
    a = agrandar(silueta(), round(lado * alto_rel))
    blanco = Image.new('RGBA', a.size, (255, 255, 255, 255))
    blanco.putalpha(a)
    base.alpha_composite(blanco, ((lado - a.width) // 2, (lado - a.height) // 2))
    return base


if __name__ == '__main__':
    # Con fondo: el caballo ocupa el 58 % del alto (dentro de la zona segura de los íconos "maskable")
    for nombre, lado, fondo, alto in [('icono-192.png', 192, TEAL, .58), ('icono-512.png', 512, TEAL, .58),
                                      ('apple-touch-icon.png', 180, TEAL, .58), ('icono-insignia.png', 96, None, .86)]:
        icono(lado, fondo, alto).save(os.path.join(D, nombre), optimize=True)
        print(nombre, os.path.getsize(os.path.join(D, nombre)), 'bytes')
