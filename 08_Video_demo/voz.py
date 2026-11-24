# Voz en off: genera un .wav por frase con la voz de Windows en español (Microsoft Helena, SAPI).
# Guarda cada frase por el hash de su texto, así solo se vuelven a generar las que cambian.
import hashlib, json, os, shutil, subprocess, tempfile, wave

VOZ = 'Microsoft Helena Desktop'
TASA = 0          # -10 (lento) a 10 (rápido)


def ruta(carpeta, texto):
    h = hashlib.sha1((VOZ + str(TASA) + texto).encode('utf-8')).hexdigest()[:16]
    return os.path.join(carpeta, h + '.wav')


CARACTERES_POR_SEGUNDO = 14.0     # ritmo de lectura estimado para las pausas (sin la voz de Windows)


def _pausa(texto, destino):
    """Un .wav en silencio del largo que llevaría leer el texto: marca el ritmo del video para que una persona ponga su voz."""
    seg = max(2.0, len(texto) / CARACTERES_POR_SEGUNDO + 0.4)
    with wave.open(destino, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050); w.writeframes(bytes(int(seg * 22050) * 2))


def _a_wav(origen, destino):
    """Pasa un audio grabado (mp4, m4a, mp3, wav) a .wav de 22.050 Hz, 16 bits, mono (el formato de las demás frases)."""
    import imageio_ffmpeg
    r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', origen, '-ac', '1', '-ar', '22050', '-sample_fmt', 's16', destino], capture_output=True, text=True)
    if r.returncode: raise SystemExit('No se pudo leer el audio ' + origen + ':\n' + r.stderr[-800:])


def generar(textos, carpeta, audios=None):
    """textos: lista de str. audios: {texto: archivo de audio grabado por una persona}. Devuelve {texto: (ruta_wav, duracion_en_segundos)}."""
    os.makedirs(carpeta, exist_ok=True)
    audios = audios or {}
    sin_voz = shutil.which('powershell') is None                       # fuera de Windows no hay voz sintética: pausas con el largo estimado
    for t, arch in audios.items():
        if t in textos: _a_wav(arch, ruta(carpeta, t))
    if sin_voz:
        for t in dict.fromkeys(textos):
            if t not in audios: _pausa(t, ruta(carpeta, t))
        textos_voz = []
    else:
        textos_voz = [t for t in textos if t not in audios]
    faltan = [t for t in dict.fromkeys(textos_voz) if not os.path.exists(ruta(carpeta, t))]
    if faltan:
        trabajo = [{'texto': t, 'wav': ruta(carpeta, t)} for t in faltan]
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(trabajo, f, ensure_ascii=False); lista = f.name
        ps = r'''
Add-Type -AssemblyName System.Speech
$trabajo = Get-Content -Raw -Encoding UTF8 -Path "%s" | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice("%s")
$s.Rate = %d
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($t in $trabajo) {
  $s.SetOutputToWaveFile($t.wav, $fmt)
  $s.Speak($t.texto)
  $s.SetOutputToNull()
}
''' % (lista.replace('\\', '/'), VOZ, TASA)
        with tempfile.NamedTemporaryFile('w', suffix='.ps1', delete=False, encoding='utf-8-sig') as f:
            f.write(ps); script = f.name
        subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], check=True)
        os.remove(lista); os.remove(script)
    out = {}
    for t in textos:
        p = ruta(carpeta, t)
        with wave.open(p) as w:
            out[t] = (p, w.getnframes() / w.getframerate())
    return out


if __name__ == '__main__':
    r = generar(['Hola, esto es una prueba de la voz en off de Helios.'], os.path.join(tempfile.gettempdir(), 'voz_prueba'))
    print(r)
