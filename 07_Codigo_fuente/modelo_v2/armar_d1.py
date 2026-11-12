# Arma los archivos para D1 con el perfil de comportamiento: CREATE de perfil_comportamiento y su índice + los INSERT del perfil.
# La salida de Postgres también trae líneas de calendario: se ignoran (el Worker calcula el día de la semana y el tercio
# a partir de la fecha, así que D1 no necesita la tabla calendario).
# Uso: python armar_d1.py [salida_postgres.sql] [carpeta destino]
import sqlite3, re, os, sys
O = os.path.dirname(os.path.abspath(__file__)) + '/'
# Entrada: salida de perfil_comportamiento_postgres.sql (paso 4), una sentencia INSERT por línea.
SALIDA_POSTGRES = sys.argv[1] if len(sys.argv) > 1 else O + 'salida_postgres.sql'
# Destino: carpeta 03_Modelo_v2_perfil (o la que se pase como segundo argumento).
DESTINO = (sys.argv[2] if len(sys.argv) > 2 else O + '../../03_Modelo_v2_perfil').rstrip('/\\') + '/'

perfil = ("CREATE TABLE IF NOT EXISTS perfil_comportamiento ( ambiente TEXT NOT NULL, cliente_id TEXT NOT NULL, servicio_id TEXT NOT NULL, "
  "producto_id TEXT NOT NULL, canal_id TEXT NOT NULL, moneda_id TEXT NOT NULL, duracion_ventana_minutos INTEGER NOT NULL, "
  "dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), franja_horaria INTEGER NOT NULL CHECK (franja_horaria BETWEEN 0 AND 95), "
  "tercio_mes INTEGER NOT NULL CHECK (tercio_mes IN (1, 2, 3)), nivel_perfil TEXT NOT NULL CHECK (nivel_perfil IN ('TERCIO', 'DIA_FRANJA')), "
  "muestras INTEGER NOT NULL, cantidad_total_esperada REAL, cantidad_total_minima REAL, cantidad_total_maxima REAL, "
  "tasa_aprobacion_esperada REAL, tasa_aprobacion_minima REAL, tasa_rechazo_esperada REAL, tasa_rechazo_maxima REAL, "
  "tasa_error_esperada REAL, tasa_error_maxima REAL, importe_total_esperado REAL, importe_total_minimo REAL, importe_total_maximo REAL, "
  "tiempo_respuesta_esperado REAL, tiempo_respuesta_maximo REAL, modelo_id TEXT NOT NULL, modelo_version TEXT NOT NULL, entrenado_hasta TEXT, "
  "fecha_carga TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), "
  "PRIMARY KEY (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana, franja_horaria, tercio_mes) ) WITHOUT ROWID;")
idx = 'CREATE INDEX IF NOT EXISTS ix_perfil_comportamiento_franja ON perfil_comportamiento (dia_semana, franja_horaria, tercio_mes);'
DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
ins = [l for l in open(SALIDA_POSTGRES, encoding='utf-8').read().split('\n') if l.startswith('INSERT OR REPLACE INTO perfil_comportamiento')]
nom = []
for l in ins:
    m = re.search(r"VALUES \('[^']*','([^']*)','([^']*)','[^']*','([^']*)','[^']*',\d+,(\d)", l)
    nom.append('Perfil %s %s %s, %s' % (m.group(1), m.group(2), m.group(3), DIAS[int(m.group(4))]))
bloques = [('Crear perfil_comportamiento', perfil), ('Índice por día de la semana, franja y tercio', idx)] + list(zip(nom, ins))
# validación con los límites de D1
db = sqlite3.connect(':memory:')
for t, b in bloques:
    assert len(b.encode()) < 100_000 and '\n' not in b, t
    db.execute(b)
print('perfil_comportamiento:', db.execute('select count(*) from perfil_comportamiento').fetchone()[0], 'filas')
print(db.execute("select nivel_perfil, count(*) from perfil_comportamiento group by 1").fetchall())
print('mayor sentencia', max(len(b.encode()) for _, b in bloques), 'bytes;', len(bloques), 'bloques')
open(DESTINO + 'perfil_comportamiento_d1.sql', 'w', encoding='utf-8', newline='\n').write('\n'.join(b for _, b in bloques) + '\n')
txt = '''MODELO v2 · PERFIL DE COMPORTAMIENTO (para D1: helios-monitoring-dev)

Qué carga:
  - perfil_comportamiento : lo esperado y su banda por serie × día de la semana × franja horaria de 15 min × tercio del mes
                            (13 series × 7 días × 96 franjas × 3 tercios = 26.208 filas).
                            Tercio del mes = por día del calendario: días 1-10 = 1, 11-20 = 2, 21 a fin de mes = 3.
  - ix_perfil_comportamiento_franja : índice por (día de la semana, franja, tercio).
Entrenado con historico_metricas_demo.csv (12 meses ficticios, 456.040 ventanas) usando perfil_comportamiento_postgres.sql.

Sirve para cargar el perfil por primera vez o para reemplazarlo después de reentrenar (los INSERT son OR REPLACE).
Escrituras: ~26.200 por la tabla y ~26.200 por el índice.

Opción A, Console de D1: pegar cada bloque (una sola línea) en orden. Los de perfil pesan ~80 KB cada uno.
Opción B, más rápida (Wrangler): npx wrangler d1 execute helios-monitoring-dev --remote --file=perfil_comportamiento_d1.sql
  (perfil_comportamiento_d1.sql tiene exactamente las mismas sentencias, una por línea).
'''
for k, (t, b) in enumerate(bloques, 1):
    txt += '\n--- %d. %s ---\n%s\n' % (k, t, b)
open(DESTINO + 'perfil_comportamiento_d1.txt', 'w', encoding='utf-8', newline='\n').write(txt)
