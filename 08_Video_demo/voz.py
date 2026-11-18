# Voz en off: genera un .wav por frase con la voz de Windows en español (Microsoft Helena, SAPI).
# Guarda cada frase por el hash de su texto, así solo se vuelven a generar las que cambian.
import hashlib, json, os, subprocess, tempfile, wave

VOZ = 'Microsoft Helena Desktop'
TASA = 0          # -10 (lento) a 10 (rápido)


def ruta(carpeta, texto):
    h = hashlib.sha1((VOZ + str(TASA) + texto).encode('utf-8')).hexdigest()[:16]
    return os.path.join(carpeta, h + '.wav')


def generar(textos, carpeta):
    """textos: lista de str. Devuelve {texto: (ruta_wav, duracion_en_segundos)}."""
    os.makedirs(carpeta, exist_ok=True)
    faltan = [t for t in dict.fromkeys(textos) if not os.path.exists(ruta(carpeta, t))]
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
