# Genera feriados_d1.sql: tabla feriados (2025-2026 precargados), columna silenciar_feriados en
# umbrales_config y las vistas de alertas y pre-alertas que no generan nada en un feriado para
# los servicios que lo tienen silenciado. Sin silencios configurados, todo da igual que antes.
import os
D = os.path.dirname(os.path.abspath(__file__))
L = [l for l in open(os.path.join(D, 'umbrales_d1.sql')).read().split('\n') if l.strip()]
obs = [l for l in L if l.startswith('CREATE VIEW v_alertas_observadas')][0]
falt = [l for l in L if l.startswith('CREATE VIEW v_alertas_faltantes')][0]
pre = [l for l in L if l.startswith('CREATE VIEW v_prealertas')][0]

def rep(t, a, b):
    assert t.count(a) == 1, (t.count(a), a[:80])
    return t.replace(a, b)
SIL = "COALESCE(us.silenciar_feriados, uc.silenciar_feriados, ug.silenciar_feriados, 0) = 1"
def filtro(x):
    # feriado = fecha local (UTC-3) de la ventana; búsqueda por clave primaria
    return (" LEFT JOIN feriados fe ON fe.fecha = date(%s.ventana_inicio, '-3 hours')" % x,
            "NOT (fe.fecha IS NOT NULL AND " + SIL + ") AND ")
j, w = filtro('v'); obs = rep(obs, "us.servicio_id = v.servicio_id WHERE ", "us.servicio_id = v.servicio_id" + j + " WHERE " + w)
j, w = filtro('p'); falt = rep(falt, "us.servicio_id = p.servicio_id WHERE ", "us.servicio_id = p.servicio_id" + j + " WHERE " + w)
j, w = filtro('o'); pre = rep(pre, "us.servicio_id = o.servicio_id WHERE ", "us.servicio_id = o.servicio_id" + j + " WHERE " + w)

# Feriados nacionales y días no laborables (fuente: calendario oficial; la API los mantiene al día)
FERIADOS = [
    ('2025-11-21', 'Día no laborable con fines turísticos', 'puente'),
    ('2025-11-24', 'Día de la Soberanía Nacional', 'trasladable'),
    ('2025-12-08', 'Inmaculada Concepción de María', 'inamovible'),
    ('2025-12-25', 'Navidad', 'inamovible'),
    ('2026-01-01', 'Año Nuevo', 'inamovible'),
    ('2026-02-16', 'Carnaval', 'inamovible'),
    ('2026-02-17', 'Carnaval', 'inamovible'),
    ('2026-03-23', 'Día no laborable con fines turísticos', 'puente'),
    ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'),
    ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'),
    ('2026-04-03', 'Viernes Santo', 'inamovible'),
    ('2026-05-01', 'Día del Trabajador', 'inamovible'),
    ('2026-05-25', 'Día de la Revolución de Mayo', 'inamovible'),
    ('2026-06-15', 'Paso a la Inmortalidad del General Martín Miguel de Güemes', 'trasladable'),
    ('2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'inamovible'),
    ('2026-07-09', 'Día de la Independencia', 'inamovible'),
    ('2026-07-10', 'Día no laborable con fines turísticos', 'puente'),
    ('2026-08-17', 'Paso a la Inmortalidad del General José de San Martín', 'trasladable'),
    ('2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'),
    ('2026-11-23', 'Día de la Soberanía Nacional', 'trasladable'),
    ('2026-12-07', 'Día no laborable con fines turísticos', 'puente'),
    ('2026-12-08', 'Inmaculada Concepción de María', 'inamovible'),
    ('2026-12-25', 'Navidad', 'inamovible'),
]
TABLA = ("CREATE TABLE IF NOT EXISTS feriados ( fecha TEXT NOT NULL PRIMARY KEY CHECK (fecha = date(fecha)), nombre TEXT NOT NULL, "
         "tipo TEXT NOT NULL, origen TEXT NOT NULL DEFAULT 'API' CHECK (origen IN ('API', 'MANUAL')), "
         "actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) );")
cargas = ["INSERT OR IGNORE INTO feriados (fecha, nombre, tipo, origen) VALUES ('%s', '%s', '%s', 'API');" % f for f in FERIADOS]
bloques = [('Crear la tabla de feriados', TABLA)] + [('Feriado ' + f[0], c) for f, c in zip(FERIADOS, cargas)] + [
    ('Agregar "silenciar en feriados" a los umbrales', 'ALTER TABLE umbrales_config ADD COLUMN silenciar_feriados INTEGER CHECK (silenciar_feriados IN (0, 1));'),
    ('Valor general: no silenciar', "UPDATE umbrales_config SET silenciar_feriados = 0 WHERE cliente_id = '*' AND servicio_id = '*';"),
    ('Borrar v_alertas', 'DROP VIEW IF EXISTS v_alertas;'),
    ('Borrar v_alertas_observadas', 'DROP VIEW IF EXISTS v_alertas_observadas;'),
    ('Borrar v_alertas_faltantes', 'DROP VIEW IF EXISTS v_alertas_faltantes;'),
    ('Borrar v_prealertas', 'DROP VIEW IF EXISTS v_prealertas;'),
    ('Crear v_alertas_observadas', obs),
    ('Crear v_alertas_faltantes', falt),
    ('Crear v_alertas', 'CREATE VIEW v_alertas AS SELECT * FROM v_alertas_observadas UNION ALL SELECT * FROM v_alertas_faltantes;'),
    ('Crear v_prealertas', pre),
    ('Marcar el tablero para que recalcule', "UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;"),
]
open(os.path.join(D, 'feriados_d1.sql'), 'w').write('\n'.join(b for _, b in bloques) + '\n')
txt = '''FERIADOS (para la Console de D1)

Qué hace: crea la tabla feriados con los de fines de 2025 y todo 2026 (el Worker trae los años siguientes de la API
api.argentinadatos.com), agrega a los umbrales la opción "Silenciar alertas en feriados" y recrea las vistas de alertas
y pre-alertas para respetarla. Mientras nadie silencie un servicio, las alertas son exactamente las mismas que hoy.

En el panel de Cloudflare: D1 > helios-monitoring-dev > Console. Cada bloque es una sola línea.
Requiere haber corrido antes umbrales_d1_tablas.txt.
Correr los bloques en orden y seguidos: entre "Borrar v_alertas" y "Crear v_prealertas" el tablero da error porque faltan las vistas.
Después, publicar el worker nuevo (worker_alertas_cron.js).
'''
for k, (t, b) in enumerate(bloques, 1):
    txt += '\n--- %d. %s ---\n%s\n' % (k, t, b)
open(os.path.join(D, 'feriados_d1_tablas.txt'), 'w').write(txt)
print('ok', len(bloques), 'bloques')
