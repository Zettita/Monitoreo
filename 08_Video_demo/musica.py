# Música de fondo suave, propia (sintetizada acá, sin derechos de autor): un colchón de acordes largos
# (La menor - Fa - Do - Sol) con armónicos suaves, movimiento lento y un eco que lo ablanda.
# Uso:  from musica import generar;  generar('musica.wav', segundos)
import numpy as np, wave

SR = 44100
ACORDES = [  # notas en Hz
    (110.00, 220.00, 261.63, 329.63),   # La menor
    (87.31, 174.61, 261.63, 349.23),    # Fa
    (130.81, 196.00, 261.63, 329.63),   # Do
    (98.00, 196.00, 246.94, 293.66),    # Sol
]
DUR_ACORDE = 8.0   # segundos por acorde
CRUCE = 3.0        # cruce entre acordes


def _nota(f, n, t0):
    t = (np.arange(n) + t0) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    s += 0.5 * np.sin(2 * np.pi * f * 1.004 * t)          # leve desafinación: da cuerpo
    return s * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t + f))  # respiración lenta


def generar(ruta, segundos):
    n = int((segundos + 2) * SR)
    y = np.zeros(n)
    k = int(np.ceil((segundos + 2) / DUR_ACORDE)) + 1
    for i in range(k):
        ini = int(i * DUR_ACORDE * SR)
        largo = int((DUR_ACORDE + CRUCE) * SR)
        fin = min(n, ini + largo)
        if ini >= n: break
        m = fin - ini
        env = np.ones(m)
        c = int(CRUCE * SR)
        env[:min(c, m)] = np.linspace(0, 1, min(c, m)) ** 2
        if m > c: env[-c:] = np.linspace(1, 0, c) ** 2
        acorde = sum(_nota(f, m, ini) for f in ACORDES[i % len(ACORDES)])
        y[ini:fin] += env * acorde
    # eco suave (da espacio)
    for ret, g in ((int(0.37 * SR), 0.35), (int(0.61 * SR), 0.25), (int(1.1 * SR), 0.15)):
        y[ret:] += g * y[:-ret]
    # pasa bajos simple para que sea cálida
    a = np.exp(-2 * np.pi * 1800 / SR)
    z = np.zeros_like(y); acc = 0.0
    for i in range(0, len(y)):  # filtro de un polo
        acc = (1 - a) * y[i] + a * acc; z[i] = acc
    y = z[: int(segundos * SR)]
    y = y / (np.abs(y).max() + 1e-9) * 0.5
    f = int(2 * SR); y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    with wave.open(ruta, 'wb') as o:
        o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR)
        o.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
