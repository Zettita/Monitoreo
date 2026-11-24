# Arma los archivos finales a partir de la grabación (pantalla.webm + tiempos.json):
#   - voz en off (wav y mp3), con cada frase en el segundo en que se dijo
#   - subtítulos (.srt) y una franja de subtítulos dibujada abajo del video
#   - video con subtítulos y voz, con subtítulos sin voz, y sin subtítulos ni voz
# Uso: python armar.py <carpeta_de_la_grabacion> <carpeta_de_salida>
import json, os, subprocess, sys, wave
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ANCHO, ALTO_PANTALLA, ALTO_FRANJA = 1920, 990, 90
COLOR_FRANJA = (9, 30, 66)
carpeta, salida = sys.argv[1], sys.argv[2]
os.makedirs(salida, exist_ok=True)
T = json.load(open(os.path.join(carpeta, 'tiempos.json'), encoding='utf-8'))
duracion = T['duracion']


def correr(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit('ffmpeg falló:\n' + ' '.join(cmd) + '\n' + r.stderr[-2500:])


# ---------- voz en off ----------
def armar_audio(ruta):
    ini = T['frases'][0]
    with wave.open(ini[2]) as w: tasa, anchos, canales = w.getframerate(), w.getsampwidth(), w.getnchannels()
    total = int((duracion + 1.0) * tasa) * anchos * canales
    pista = bytearray(total)
    for seg, _texto, wav, _dur in T['frases']:
        with wave.open(wav) as w: datos = w.readframes(w.getnframes())
        i = int(seg * tasa) * anchos * canales
        pista[i:i + len(datos)] = datos[:max(0, total - i)]
    with wave.open(ruta, 'wb') as o:
        o.setnchannels(canales); o.setsampwidth(anchos); o.setframerate(tasa); o.writeframes(bytes(pista))


# ---------- subtítulos ----------
def trozos(texto, maximo=150):
    """Parte la frase en trozos que entran en dos líneas; corta en puntos y, si hace falta, en comas."""
    partes = [p.strip() for p in texto.replace('. ', '.|').split('|') if p.strip()]
    out = []
    for p in partes:
        if len(p) <= maximo: out.append(p); continue
        sub, actual = [], ''
        for frag in p.replace(', ', ',|').split('|'):
            if actual and len(actual) + len(frag) + 1 > maximo: sub.append(actual.strip()); actual = ''
            actual += frag + ' '
        if actual.strip(): sub.append(actual.strip())
        out += sub
    # une trozos muy cortos con el siguiente
    fin = []
    for p in out:
        if fin and len(fin[-1]) < 45 and len(fin[-1]) + len(p) + 1 <= maximo: fin[-1] += ' ' + p
        else: fin.append(p)
    return fin


def _fuente(tam):
    for r in ('C:/Windows/Fonts/seguisb.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'):
        if os.path.exists(r): return ImageFont.truetype(r, tam)
    return ImageFont.load_default()


FUENTE = _fuente(30)


def dibujar(texto, ruta):
    im = Image.new('RGB', (ANCHO, ALTO_FRANJA), COLOR_FRANJA); d = ImageDraw.Draw(im)
    lineas, actual = [], ''
    for pal in texto.split(' '):
        prueba = (actual + ' ' + pal).strip()
        if d.textlength(prueba, font=FUENTE) > ANCHO - 200 and actual: lineas.append(actual); actual = pal
        else: actual = prueba
    lineas.append(actual)
    assert len(lineas) <= 2, ('subtítulo de más de dos líneas', texto)
    alto = len(lineas) * 38; y = (ALTO_FRANJA - alto) // 2 - 2
    for l in lineas:
        w = d.textlength(l, font=FUENTE); d.text(((ANCHO - w) / 2, y), l, font=FUENTE, fill=(255, 255, 255)); y += 38
    im.save(ruta)


def srt_tiempo(s):
    ms = int(round(s * 1000)); return '%02d:%02d:%02d,%03d' % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)


EVENTOS = []


def armar_subtitulos():
    carp = os.path.join(carpeta, 'subs'); os.makedirs(carp, exist_ok=True)
    blanco = os.path.join(carp, 'vacio.png'); Image.new('RGB', (ANCHO, ALTO_FRANJA), COLOR_FRANJA).save(blanco)
    eventos = []   # (inicio, fin, texto)
    for seg, texto, _wav, dur in T['frases']:
        ts = trozos(texto); pesos = [len(t) for t in ts]; tot = sum(pesos); t0 = seg
        for t, p in zip(ts, pesos):
            d = dur * p / tot; eventos.append((t0, t0 + d, t)); t0 += d
    EVENTOS[:] = eventos
    lista, cursor, n = [], 0.0, 0
    for ini, fin, texto in eventos:
        if ini > cursor + 0.01: lista.append((blanco, ini - cursor)); cursor = ini
        png = os.path.join(carp, 's%03d.png' % n); dibujar(texto, png); n += 1
        lista.append((png, fin - cursor + 0.15)); cursor = fin + 0.15
    if cursor < duracion: lista.append((blanco, duracion - cursor + 1))
    with open(os.path.join(carp, 'lista.txt'), 'w', encoding='utf-8') as f:
        for png, d in lista: f.write("file '%s'\nduration %.3f\n" % (png.replace('\\', '/'), d))
        f.write("file '%s'\n" % lista[-1][0].replace('\\', '/'))
    with open(os.path.join(salida, 'Helios_demo_subtitulos.srt'), 'w', encoding='utf-8') as f:
        for k, (ini, fin, texto) in enumerate(eventos, 1): f.write('%d\n%s --> %s\n%s\n\n' % (k, srt_tiempo(ini), srt_tiempo(fin), texto))
    return os.path.join(carp, 'lista.txt'), blanco


# ---------- ejecución ----------
wav = os.path.join(salida, 'Helios_demo_voz_en_off.wav')
armar_audio(wav)
correr([FF, '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', os.path.join(salida, 'Helios_demo_voz_en_off.mp3')])
# voz limpia + música de fondo (Steady_Pulse a -39 LUFS, con ducking): ver mezclar_audio.py; WAV 48 kHz 24 bits y AAC 320 kb/s
import mezclar_audio
_mez = mezclar_audio.mezclar(carpeta, salida)
mezcla = _mez['aac']
lista, blanco = armar_subtitulos()
pantalla = os.path.join(carpeta, 'pantalla.webm')
x264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart']

# con subtítulos, sin voz
sin_audio = os.path.join(salida, 'Helios_demo_con_subtitulos_sin_audio.mp4')
correr([FF, '-y', '-loglevel', 'error', '-i', pantalla, '-f', 'concat', '-safe', '0', '-i', lista, '-filter_complex',
        '[1:v]fps=30,setpts=PTS-STARTPTS[s];[0:v]fps=30[v];[v][s]vstack=inputs=2:shortest=1[o]', '-map', '[o]', '-t', '%.3f' % duracion, *x264, '-an', sin_audio])
# con subtítulos y voz
correr([FF, '-y', '-loglevel', 'error', '-i', sin_audio, '-i', mezcla, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest',
        os.path.join(salida, 'Helios_demo_completo_con_voz_y_subtitulos.mp4')])
# sin subtítulos ni voz (la franja de abajo queda vacía)
correr([FF, '-y', '-loglevel', 'error', '-i', pantalla, '-f', 'lavfi', '-i', 'color=c=0x091E42:s=%dx%d:r=30' % (ANCHO, ALTO_FRANJA), '-filter_complex',
        '[0:v]fps=30[v];[v][1:v]vstack=inputs=2:shortest=1[o]', '-map', '[o]', '-t', '%.3f' % duracion, *x264, '-an', os.path.join(salida, 'Helios_demo_sin_subtitulos_ni_audio.mp4')])


# ---------- tramo nuevo: de la tarjeta AICIM hasta las novedades en el canal de Teams ----------
# Es lo que reemplaza a las dos tarjetas de "lo que viene" en un video ya armado: se entrega aparte, con los mismos formatos.
def tramo():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from guion import TEXTOS, AUDIOS
    por_texto = {v: k for k, v in TEXTOS.items()}
    fr = T['frases']; claves = [por_texto.get(f[1]) for f in fr]
    if 'aicim1' not in claves or 'teams4' not in claves: return []
    i, j = claves.index('aicim1'), len(claves) - 1 - claves[::-1].index('teams4')
    ini = max(0.0, fr[i][0] - 0.4); fin = min(duracion, fr[j][0] + fr[j][3] + 0.8); dur = fin - ini
    pre = os.path.join(salida, 'Helios_tramo_AICIM_Teams_')
    cortar = lambda origen, destino, extra: correr([FF, '-y', '-loglevel', 'error', '-ss', '%.3f' % ini, '-i', origen, '-t', '%.3f' % dur, *extra, destino])
    cortar(os.path.join(salida, 'Helios_demo_completo_con_voz_y_subtitulos.mp4'), pre + 'con_audios_y_subtitulos.mp4', x264[:-2] + ['-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart'])
    cortar(os.path.join(salida, 'Helios_demo_con_subtitulos_sin_audio.mp4'), pre + 'con_subtitulos_sin_audio.mp4', x264[:-2] + ['-an', '-movflags', '+faststart'])
    cortar(os.path.join(salida, 'Helios_demo_sin_subtitulos_ni_audio.mp4'), pre + 'sin_subtitulos_ni_audio.mp4', x264[:-2] + ['-an', '-movflags', '+faststart'])
    cortar(wav, pre + 'audios.wav', [])
    with open(pre + 'subtitulos.srt', 'w', encoding='utf-8') as f:
        k = 0
        for a, b, texto in EVENTOS:
            if b <= ini or a >= fin: continue
            k += 1; f.write('%d\n%s --> %s\n%s\n\n' % (k, srt_tiempo(max(0, a - ini)), srt_tiempo(min(dur, b - ini)), texto))
    # tabla para el guion de la voz: qué frase va en qué momento del tramo
    filas = []
    for n_, (seg, texto, _w, d) in enumerate(fr[i:j + 1]):
        clave = claves[i + n_]
        sig = fr[i + n_ + 1][0] if i + n_ + 1 < len(fr) else fin
        filas.append({'clave': clave, 'desde': round(seg - ini, 2), 'hasta': round(min(sig, fin) - ini, 2), 'dur_frase': round(d, 2), 'texto': texto, 'audio_grabado': clave in AUDIOS})
    json.dump({'duracion': round(dur, 2), 'filas': filas}, open(os.path.join(salida, 'tramo_AICIM_Teams.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return filas


tramo()
print('Listo:', os.listdir(salida))