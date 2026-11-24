# Limpia y nivela las voces grabadas (una por frase de guion.py) y las deja listas para el video.
# Cadena por clip: pasa-altos 85 Hz, pasa-bajos 14 kHz, reducción de ruido leve (afftdn), recorte de silencios
# (voz detectada por energía; margen 0,2 s), compresor 3:1, limitador a -1,5 dB, loudnorm de dos pasadas
# (-16 LUFS, TP -1,5 dB, LRA 5 LU) y fades de 40 ms.
# Salida:  audios/voz_<clave>.m4a (AAC 256 kb/s, para que grabar.py mida cada frase)
#          salida/audio_procesado/<clave>.wav (48 kHz, 24 bits: lo que usa mezclar_audio.py)
# Uso:  python procesar_audio.py
import os, sys, re, json, subprocess, wave, shutil
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(AQUI, 'audios')
O = os.path.join(A, 'originales')
SALIDA = os.path.join(AQUI, 'salida', 'audio_procesado')
TMP = os.path.join(AQUI, 'salida', 'audio_tmp')
try:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception: FF = 'ffmpeg'
SR = 48000
OBJ = dict(I=-16.0, TP=-1.5, LRA=5.0)


def v(n): return os.path.join(O, 'VOZ_%02d.m4a' % n)


# clave de frase -> archivos de origen (si son varios, se pegan en orden)
FUENTES = {
    'login': [v(2)], 'datos': [v(3)], 'pre': [v(4)], 'avisar': [v(5)], 'confirma': [v(6)], 'abiertas': [v(7)], 'derivar': [v(8)],
    'regla': [v(9)], 'auto': [v(10)], 'seguimiento': [v(11)], 'soporte1': [v(12), v(13)], 'tomar': [v(14)], 'evidencia': [v(15)],
    'ticket': [v(16)], 'comunicar': [v(17)], 'push_tec': [v(18)], 'push_ger': [v(19)], 'registro': [v(20)], 'correo': [v(21)],
    'destinatarios': [v(22)], 'outlook': [v(23)], 'resolver': [v(24)], 'ger1': [v(25)], 'ger_ops': [v(26)], 'disp': [v(27)],
    'hist': [v(28)], 'asis1': [v(29)], 'asis2': [v(30)], 'asis3': [v(31)], 'asis4': [v(32)], 'asis5': [v(33)], 'fin': [v(34)],
    'aicim1': [os.path.join(A, 'demo AICIM.mp4')], 'teams1': [os.path.join(A, 'demo Microsoft Teams.mp4')],
    'sala1': [os.path.join(A, '1 \u00b7 Sala de crisis.mp4')], 'sala2': [os.path.join(A, '2 \u00b7 Sala de crisis.mp4')],
    'sala3': [os.path.join(A, '3 \u00b7 Sala de crisis.mp4')], 'sala4': [os.path.join(A, '4 \u00b7 Sala de crisis.mp4')],
    'sala5': [os.path.join(A, '5 \u00b7 Sala de crisis.mp4')], 'teams2': [os.path.join(A, '6 \u00b7 Gemma en Teams.mp4')],
    'teams3': [os.path.join(A, '7 \u00b7 Gemma en Teams.mp4')], 'teams4': [os.path.join(A, '8 \u00b7 Novedades.mp4')],
}
# un solo archivo que lleva dos frases: clave1, clave2, segundo aproximado donde está la pausa entre las dos
PARTIDOS = {'intro': (v(1), 'intro1', 'intro2', 15.5)}


def correr(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit('ffmpeg falló:\n' + ' '.join(cmd) + '\n' + r.stderr[-2000:])
    return r.stderr


def leer_wav(ruta):
    with wave.open(ruta) as w:
        n, ch, sw = w.getnframes(), w.getnchannels(), w.getsampwidth()
        d = w.readframes(n)
    x = np.frombuffer(d, dtype={2: '<i2', 4: '<i4'}[sw]).astype('float64') / float(2 ** (8 * sw - 1))
    return x.reshape(-1, ch).mean(axis=1)


def escribir_wav(ruta, x):
    y = np.clip(x, -1, 1) * 8388607.0
    y = y.astype('<i4')
    b = np.empty((len(y), 3), dtype='u1'); raw = y.tobytes(); a = np.frombuffer(raw, dtype='u1').reshape(-1, 4)
    b[:] = a[:, :3]
    with wave.open(ruta, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(3); w.setframerate(SR); w.writeframes(b.tobytes())


def etapa_a(src, dst):
    """Mono, 48 kHz, pasa-altos 85 Hz, pasa-bajos 14 kHz y reducción de ruido leve."""
    correr([FF, '-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', str(SR),
            '-af', 'highpass=f=85,lowpass=f=14000,afftdn=nr=9:nf=-45:tn=1', '-c:a', 'pcm_s32le', dst])


def energia(x, paso=0.02):
    n = int(SR * paso); k = len(x) // n
    r = np.sqrt((x[:k * n].reshape(k, n) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(r)


def hallar_voz(x):
    """Devuelve (inicio, fin) en segundos de la voz, sin zumbidos ni golpes sueltos en las puntas."""
    db = energia(x)
    piso, techo = np.percentile(db, 10), np.percentile(db, 95)
    umbral = max(piso + 9.0, techo - 26.0)
    on = db > umbral
    # tramos de voz, uniendo huecos de menos de 0,5 s
    tramos, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            tramos.append([i, j]); i = j
        else: i += 1
    unidos = []
    for t in tramos:
        if unidos and (t[0] - unidos[-1][1]) * 0.02 < 0.5: unidos[-1][1] = t[1]
        else: unidos.append(t)
    unidos = [t for t in unidos if (t[1] - t[0]) >= 4]
    descartados = []
    # un golpe o respiración suelta en las puntas: corto y separado de lo demás
    while len(unidos) > 1 and (unidos[0][1] - unidos[0][0]) * 0.02 < 0.8 and (unidos[1][0] - unidos[0][1]) * 0.02 >= 0.5:
        descartados.append(('inicio', unidos[0][0] * 0.02)); unidos.pop(0)
    while len(unidos) > 1 and (unidos[-1][1] - unidos[-1][0]) * 0.02 < 0.8 and (unidos[-1][0] - unidos[-2][1]) * 0.02 >= 0.5:
        descartados.append(('final', unidos[-1][0] * 0.02)); unidos.pop()
    ini, fin = unidos[0][0] * 0.02, unidos[-1][1] * 0.02
    return ini, fin, descartados, (piso, techo, umbral)


def medir(ruta):
    """Sonoridad integrada (LUFS) y pico real (dBTP) con ebur128."""
    r = subprocess.run([FF, '-hide_banner', '-nostats', '-i', ruta, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]
    li = re.search(r'I:\s+(-?[\d.]+) LUFS', s); lp = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    return (float(li.group(1)) if li else None, float(lp.group(1)) if lp else None)


def cadena(x, base, clave):
    """x: señal ya limpia (etapa A). Recorta, comprime, limita, normaliza en dos pasadas y aplica fades."""
    ini, fin, desc, (piso, techo, umbral) = hallar_voz(x)
    t0 = max(0.0, ini - 0.2); t1 = min(len(x) / SR, fin + 0.2)
    corte = x[int(t0 * SR):int(t1 * SR)]
    if desc: print('   %s: se descartó ruido suelto %s' % (clave, desc))
    p_rec = os.path.join(TMP, clave + '_rec.wav'); escribir_wav(p_rec, corte)
    p_lim = os.path.join(TMP, clave + '_lim.wav')
    correr([FF, '-y', '-loglevel', 'error', '-i', p_rec, '-af',
            'acompressor=threshold=0.1:ratio=3:attack=5:release=150:makeup=2,alimiter=limit=0.841:attack=2:release=60:level=disabled',
            '-ar', str(SR), '-c:a', 'pcm_f32le', p_lim])
    # loudnorm, pasada 1: medir
    err = correr([FF, '-y', '-hide_banner', '-i', p_lim, '-af', 'loudnorm=I=%g:TP=%g:LRA=%g:print_format=json' % (OBJ['I'], OBJ['TP'], OBJ['LRA']), '-f', 'null', '-'])
    m = json.loads(err[err.rfind('{'):err.rfind('}') + 1])
    dur = len(corte) / SR
    filt = ('loudnorm=I=%g:TP=%g:LRA=%g:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true,'
            'aresample=%d,afade=t=in:st=0:d=0.04,afade=t=out:st=%.3f:d=0.04') % (
        OBJ['I'], OBJ['TP'], OBJ['LRA'], m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset'], SR, max(0, dur - 0.04))
    out_wav = os.path.join(SALIDA, clave + '.wav')
    correr([FF, '-y', '-loglevel', 'error', '-i', p_lim, '-af', filt, '-ar', str(SR), '-c:a', 'pcm_s24le', out_wav])
    out_m4a = os.path.join(A, 'voz_%s.m4a' % clave)
    correr([FF, '-y', '-loglevel', 'error', '-i', out_wav, '-ac', '1', '-c:a', 'aac', '-b:a', '256k', out_m4a])
    return dict(clave=clave, recorte=(round(t0, 2), round(t1, 2)), umbral=round(umbral, 1), wav=out_wav)


def main():
    os.makedirs(SALIDA, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    tabla = []
    # 1) los archivos que llevan dos frases
    pendientes = {}  # clave -> (señal limpia, origen)
    for nombre, (src, k1, k2, t) in PARTIDOS.items():
        p = os.path.join(TMP, nombre + '_a.wav'); etapa_a(src, p); x = leer_wav(p)
        db = energia(x, 0.05); a, b = int((t - 1.0) / 0.05), int((t + 1.0) / 0.05)
        corte = (a + int(np.argmin(db[a:b]))) * 0.05 + 0.025
        print('Partido %s en %.2f s (pausa)' % (os.path.basename(src), corte))
        pendientes[k1] = (x[:int(corte * SR)], [src]); pendientes[k2] = (x[int(corte * SR):], [src])
    # 2) el resto
    for clave, fuentes in FUENTES.items():
        partes = []
        for i, f in enumerate(fuentes):
            p = os.path.join(TMP, '%s_a%d.wav' % (clave, i)); etapa_a(f, p); partes.append(leer_wav(p))
        x = partes[0]
        for q in partes[1:]: x = np.concatenate([x, np.zeros(int(0.3 * SR)), q])
        pendientes[clave] = (x, fuentes)
    for clave, (x, fuentes) in pendientes.items():
        r = cadena(x, None, clave)
        antes = medir(fuentes[0]) if len(fuentes) == 1 and clave not in ('intro1', 'intro2') else (None, None)
        despues = medir(r['wav'])
        r['antes'], r['despues'] = antes, despues
        tabla.append(r)
        print('%-14s recorte %s  antes %s -> después %s' % (clave, r['recorte'], antes, despues))
    json.dump(tabla, open(os.path.join(SALIDA, 'resumen.json'), 'w'), indent=1)
    shutil.rmtree(TMP, ignore_errors=True)
    print('Listo:', len(tabla), 'frases en', SALIDA)


if __name__ == '__main__': main()
