# Arma el audio final del video: voces limpias (procesar_audio.py) en el instante de cada frase + música de fondo.
#  - Voz: -16 LUFS (ya normalizada clip por clip).
#  - Música (musica/Steady_Pulse.mp3): -39 LUFS integrados, fade in 1,5 s y fade out 2,5 s, en bucle con cruce si el video es más largo.
#  - Ducking: sidechaincompress con la voz como disparador (la música baja unos 3 dB más al hablar, vuelve en ~450 ms).
#  - Salida: WAV 48 kHz 24 bits y AAC 320 kb/s (carpeta de salida).
# Uso:  python mezclar_audio.py <carpeta_trabajo> <carpeta_salida>
import os, sys, json, subprocess, wave, re
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception: FF = 'ffmpeg'
SR = 48000
MUSICA = os.path.join(AQUI, 'musica', 'Steady_Pulse.mp3')
PROC = os.path.join(AQUI, 'salida', 'audio_procesado')
LUFS_MUSICA = -39.0
FADE_IN, FADE_OUT = 1.5, 2.5
DUCK = dict(threshold=0.125, ratio=2, attack=40, release=450, knee=3, makeup=1)   # medido: la música baja ~3 dB al hablar y no se mueve en las pausas


def correr(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit('ffmpeg falló:\n' + ' '.join(cmd) + '\n' + r.stderr[-2000:])
    return r.stderr


def leer(ruta, canales=2):
    """Decodifica cualquier archivo a float32 estéreo/mono 48 kHz."""
    r = subprocess.run([FF, '-v', 'error', '-i', ruta, '-vn', '-ac', str(canales), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True)
    if r.returncode: raise SystemExit(r.stderr.decode()[-500:])
    return np.frombuffer(r.stdout, dtype='<f4').reshape(-1, canales).astype('float64')


def escribir(ruta, x, bits=24):
    """x: (n, canales) float. WAV PCM de 16 o 24 bits."""
    n, c = x.shape
    if bits == 24:
        y = (np.clip(x, -1, 1) * 8388607.0).round().astype('<i4'); a = np.frombuffer(y.tobytes(), dtype='u1').reshape(-1, 4)[:, :3]; datos = a.tobytes()
    else:
        datos = (np.clip(x, -1, 1) * 32767.0).round().astype('<i2').tobytes()
    with wave.open(ruta, 'wb') as w:
        w.setnchannels(c); w.setsampwidth(bits // 8); w.setframerate(SR); w.writeframes(datos)


def lufs(ruta):
    r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', ruta, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    return float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1)), float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', s).group(1))


def pista_de_voz(T, total):
    from guion import TEXTOS
    clave_de = {t: k for k, t in TEXTOS.items()}
    x = np.zeros((total, 1)); fin_anterior = 0.0; usadas = 0
    for ini, texto, _wav, dur in T['frases']:
        k = clave_de.get(texto)
        ruta = os.path.join(PROC, '%s.wav' % k) if k else None
        if not ruta or not os.path.exists(ruta): print('  sin audio procesado para', (k or texto[:40])); continue
        v = leer(ruta, 1)
        i = int(round(ini * SR)); j = min(total, i + len(v))
        if ini < fin_anterior - 0.02: print('  aviso: %s empieza %.2f s antes de que termine la anterior' % (k, fin_anterior - ini))
        x[i:j] += v[:j - i]; fin_anterior = ini + len(v) / SR; usadas += 1
    print('  %d frases con voz real' % usadas)
    return x


def musica_en_bucle(total):
    m = leer(MUSICA, 2)
    cruce = int(3.0 * SR)
    if len(m) >= total: return m[:total]
    out = m.copy()
    while len(out) < total:
        a = out[-cruce:]; b = m[:cruce]
        w = np.linspace(0, 1, cruce)[:, None]
        out = np.concatenate([out[:-cruce], a * (1 - w) + b * w, m[cruce:]])
    return out[:total]


def mezclar(carpeta, salida):
    T = json.load(open(os.path.join(carpeta, 'tiempos.json'), encoding='utf-8'))
    dur = T['duracion']; total = int(round(dur * SR))
    os.makedirs(salida, exist_ok=True)
    print('Voz...')
    voz = pista_de_voz(T, total)
    voz_wav = os.path.join(salida, 'Helios_demo_voz_limpia.wav')
    escribir(voz_wav, np.repeat(voz, 2, axis=1))
    print('Música...')
    mus = musica_en_bucle(total)
    tmp = os.path.join(salida, '_musica_cruda.wav'); escribir(tmp, mus)
    i_antes, _ = lufs(tmp)
    mus = mus * 10 ** ((LUFS_MUSICA - i_antes) / 20.0)
    n_in, n_out = int(FADE_IN * SR), int(FADE_OUT * SR)
    mus[:n_in] *= (np.linspace(0, 1, n_in) ** 1.5)[:, None]
    mus[-n_out:] *= (np.linspace(1, 0, n_out) ** 1.5)[:, None]
    musica_wav = os.path.join(salida, 'Helios_demo_musica_base.wav'); escribir(musica_wav, mus)
    print('  música: %.1f LUFS -> %s LUFS' % (i_antes, '%.1f' % lufs(musica_wav)[0]))
    os.remove(tmp)
    print('Ducking y mezcla...')
    mezcla = os.path.join(salida, 'Helios_demo_voz_y_musica.wav')
    d = DUCK
    correr([FF, '-y', '-loglevel', 'error', '-i', voz_wav, '-i', musica_wav, '-filter_complex',
            '[0:a]asplit=2[v][k];[1:a][k]sidechaincompress=threshold=%g:ratio=%g:attack=%g:release=%g:knee=%g:makeup=%g[md];'
            '[v][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.841:level=disabled[o]' % (d['threshold'], d['ratio'], d['attack'], d['release'], d['knee'], d['makeup']),
            '-map', '[o]', '-ar', str(SR), '-c:a', 'pcm_s24le', mezcla])
    aac = os.path.join(salida, 'Helios_demo_voz_y_musica_320k.m4a')
    correr([FF, '-y', '-loglevel', 'error', '-i', mezcla, '-c:a', 'aac', '-b:a', '320k', '-ar', str(SR), aac])
    return dict(voz=voz_wav, musica=musica_wav, mezcla=mezcla, aac=aac, duracion=dur)


def montar(video_sin_audio, aac, destino):
    """Sube el audio al video sin tocar la imagen (-c:v copy)."""
    correr([FF, '-y', '-loglevel', 'error', '-i', video_sin_audio, '-i', aac, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', destino])


if __name__ == '__main__':
    r = mezclar(sys.argv[1], sys.argv[2])
    print(r)
