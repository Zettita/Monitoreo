# Genera umbrales_d1.sql: tabla umbrales_config + vistas v_alertas_* y v_prealertas que usan
# los umbrales configurados (general, por cliente o por cliente + servicio).
# Con los valores de fábrica las vistas devuelven exactamente lo mismo que las anteriores.
import os
D = os.path.dirname(os.path.abspath(__file__))

def rep(t, a, b, n=1):
    assert t.count(a) == n, ('esperaba %d, hay %d' % (n, t.count(a)), a[:100])
    return t.replace(a, b)

# Vistas actuales en producción
viejas = [l for l in open(os.path.join(D, 'vistas_fecha.sql')) if l.strip()]
obs = [l for l in viejas if l.startswith('CREATE VIEW v_alertas_observadas')][0].strip()
falt = [l for l in viejas if l.startswith('CREATE VIEW v_alertas_faltantes')][0].strip()
pre = [l for l in open(os.path.join(D, 'originales', 'arreglo_vista_prealertas.txt')) if l.startswith('CREATE VIEW v_prealertas')][0].strip()

def joins(x):
    return (" LEFT JOIN umbrales_config ug ON ug.cliente_id = '*' AND ug.servicio_id = '*'"
            " LEFT JOIN umbrales_config uc ON uc.cliente_id = %s.cliente_id AND uc.servicio_id = '*'"
            " LEFT JOIN umbrales_config us ON us.cliente_id = %s.cliente_id AND us.servicio_id = %s.servicio_id" % (x, x, x))
FABRICA = dict(corte_pct_alta='0.25', corte_pct_critica='0.50', corte_tasa_alta='0.05', corte_tasa_critica='0.15',
               banda_volumen='1.0', banda_tasas='1.0', banda_importe='1.0', banda_latencia='1.0')
def u(col, ultimo=None):
    return 'COALESCE(us.%s, uc.%s, ug.%s, %s)' % (col, col, col, ultimo or FABRICA[col])
def banda(f, esp, lim):
    # límite con la banda ajustada: esperado + factor * (límite del modelo - esperado); con factor 1 queda el del modelo
    return 'CASE WHEN %s = 1 OR %s IS NULL THEN %s ELSE %s + %s * (%s - %s) END' % (f, esp, lim, esp, f, lim, esp)

# ---------- v_alertas_observadas ----------
cols = ['metrica_id', 'prediccion_id', 'ventana_inicio', 'ventana_fin', 'duracion_ventana_minutos', 'ambiente', 'cliente_id', 'servicio_id', 'producto_id', 'canal_id', 'moneda_id', 'cantidad_total', 'cantidad_exitos', 'cantidad_rechazos', 'cantidad_errores', 'tasa_aprobacion_calc', 'tasa_rechazo_calc', 'tasa_error_calc', 'tasa_aprobacion_informada', 'tasa_rechazo_informada', 'tasa_error_informada', 'importe_total', 'tiempo_respuesta_promedio', 'tiempo_respuesta_maximo_obs', 'ultimo_evento_exitoso', 'fecha_recepcion', 'origen_dato', 'cantidad_total_esperada', 'cantidad_total_minima', 'cantidad_total_maxima', 'tasa_aprobacion_esperada', 'tasa_aprobacion_minima', 'tasa_rechazo_esperada', 'tasa_rechazo_maxima', 'tasa_error_esperada', 'tasa_error_maxima', 'importe_total_esperado', 'importe_total_minimo', 'importe_total_maximo', 'tiempo_respuesta_esperado', 'tiempo_respuesta_maximo_esp', 'modelo_id', 'modelo_version']
bv, bt, bi, bl = u('banda_volumen'), u('banda_tasas'), u('banda_importe'), u('banda_latencia')
ajuste = {
    'cantidad_total_minima': banda(bv, 'v.cantidad_total_esperada', 'v.cantidad_total_minima'),
    'cantidad_total_maxima': banda(bv, 'v.cantidad_total_esperada', 'v.cantidad_total_maxima'),
    'tasa_aprobacion_minima': banda(bt, 'v.tasa_aprobacion_esperada', 'v.tasa_aprobacion_minima'),
    'tasa_rechazo_maxima': banda(bt, 'v.tasa_rechazo_esperada', 'v.tasa_rechazo_maxima'),
    'tasa_error_maxima': banda(bt, 'v.tasa_error_esperada', 'v.tasa_error_maxima'),
    'importe_total_minimo': banda(bi, 'v.importe_total_esperado', 'v.importe_total_minimo'),
    'importe_total_maximo': banda(bi, 'v.importe_total_esperado', 'v.importe_total_maximo'),
    'tiempo_respuesta_maximo_esp': banda(bl, 'v.tiempo_respuesta_esperado', 'v.tiempo_respuesta_maximo_esp'),
}
lista = ', '.join((ajuste[c] + ' AS ' + c) if c in ajuste else 'v.' + c for c in cols)
vol_min = u('volumen_minimo', 'prm.volumen_minimo')
gracia = u('gracia_minutos', 'prm.gracia_minutos')
obs = rep(obs, "SELECT v.*, prm.volumen_minimo, prm.gracia_minutos, prm.tolerancia_tasa, (julianday(v.fecha_recepcion) - julianday(v.ventana_fin)) * 1440 AS demora_minutos FROM prm CROSS JOIN v_comparacion v WHERE",
          "SELECT " + lista + ", " + vol_min + " AS volumen_minimo, " + gracia + " AS gracia_minutos, prm.tolerancia_tasa, (julianday(v.fecha_recepcion) - julianday(v.ventana_fin)) * 1440 AS demora_minutos, "
          + u('corte_pct_alta') + " AS corte_pct_alta, " + u('corte_pct_critica') + " AS corte_pct_critica, "
          + u('corte_tasa_alta') + " AS corte_tasa_alta, " + u('corte_tasa_critica') + " AS corte_tasa_critica FROM prm CROSS JOIN v_comparacion v" + joins('v') + " WHERE")
# Cortes de severidad configurables
obs = rep(obs, ">= 0.50 THEN 'CRITICA'", ">= e.corte_pct_critica THEN 'CRITICA'", 4)
obs = rep(obs, ">= 0.25 THEN 'ALTA'", ">= e.corte_pct_alta THEN 'ALTA'", 4)
obs = rep(obs, ">= 0.15 THEN 'CRITICA'", ">= e.corte_tasa_critica THEN 'CRITICA'", 3)
obs = rep(obs, ">= 0.05 THEN 'ALTA'", ">= e.corte_tasa_alta THEN 'ALTA'", 3)

# ---------- v_alertas_faltantes ----------
falt = rep(falt, "CASE WHEN p.cantidad_total_esperada >= prm.volumen_minimo THEN 'CRITICA'", "CASE WHEN p.cantidad_total_esperada >= " + vol_min + " THEN 'CRITICA'")
falt = rep(falt, "p.cantidad_total_minima AS umbral", banda(bv, 'p.cantidad_total_esperada', 'p.cantidad_total_minima') + " AS umbral")
falt = rep(falt, "FROM prm CROSS JOIN core_metricas_esperadas p WHERE", "FROM prm CROSS JOIN core_metricas_esperadas p" + joins('p') + " WHERE")
falt = rep(falt, "julianday(p.ventana_fin) + prm.gracia_minutos / 1440.0", "julianday(p.ventana_fin) + " + gracia + " / 1440.0")
falt = rep(falt, "SELECT volumen_minimo, gracia_minutos, horizonte_horas,", "SELECT volumen_minimo, gracia_minutos, horizonte_horas,")  # prm sin cambios

# ---------- v_prealertas ----------
# El margen consumido se mide contra la banda ajustada: con factor f la distancia al límite es f veces la del modelo.
pre = rep(pre, "NULLIF(p.cantidad_total_esperada - p.cantidad_total_minima, 0)", "NULLIF(" + bv + " * (p.cantidad_total_esperada - p.cantidad_total_minima), 0)")
pre = rep(pre, "NULLIF(p.tasa_aprobacion_esperada - p.tasa_aprobacion_minima, 0)", "NULLIF(" + bt + " * (p.tasa_aprobacion_esperada - p.tasa_aprobacion_minima), 0)")
pre = rep(pre, "NULLIF(p.tasa_rechazo_maxima - p.tasa_rechazo_esperada, 0)", "NULLIF(" + bt + " * (p.tasa_rechazo_maxima - p.tasa_rechazo_esperada), 0)")
pre = rep(pre, "NULLIF(p.tasa_error_maxima - p.tasa_error_esperada, 0)", "NULLIF(" + bt + " * (p.tasa_error_maxima - p.tasa_error_esperada), 0)")
pre = rep(pre, "NULLIF(p.tiempo_respuesta_maximo - p.tiempo_respuesta_esperado, 0)", "NULLIF(" + bl + " * (p.tiempo_respuesta_maximo - p.tiempo_respuesta_esperado), 0)")
pre = rep(pre, "p.cantidad_total_minima,", banda(bv, 'p.cantidad_total_esperada', 'p.cantidad_total_minima') + " AS cantidad_total_minima,")
pre = rep(pre, "p.tasa_aprobacion_minima,", banda(bt, 'p.tasa_aprobacion_esperada', 'p.tasa_aprobacion_minima') + " AS tasa_aprobacion_minima,")
pre = rep(pre, "p.tasa_rechazo_maxima,", banda(bt, 'p.tasa_rechazo_esperada', 'p.tasa_rechazo_maxima') + " AS tasa_rechazo_maxima,")
pre = rep(pre, "p.tasa_error_maxima,", banda(bt, 'p.tasa_error_esperada', 'p.tasa_error_maxima') + " AS tasa_error_maxima,")
pre = rep(pre, "p.tiempo_respuesta_maximo,", banda(bl, 'p.tiempo_respuesta_esperado', 'p.tiempo_respuesta_maximo') + " AS tiempo_respuesta_maximo,")
pre = rep(pre, "o.cantidad_total >= prm.volumen_minimo", "o.cantidad_total >= " + vol_min, 4)
pre = rep(pre, "FROM core_metricas_observadas o CROSS JOIN core_metricas_esperadas p CROSS JOIN prm WHERE",
          "FROM core_metricas_observadas o CROSS JOIN core_metricas_esperadas p CROSS JOIN prm" + joins('o') + " WHERE")

TABLA = ("CREATE TABLE IF NOT EXISTS umbrales_config ( cliente_id TEXT NOT NULL DEFAULT '*', servicio_id TEXT NOT NULL DEFAULT '*', "
         "criticidad TEXT CHECK (criticidad IN ('ALTA', 'MEDIA', 'BAJA')), objetivo_disponibilidad REAL CHECK (objetivo_disponibilidad > 0 AND objetivo_disponibilidad <= 1), "
         "corte_pct_alta REAL, corte_pct_critica REAL, corte_tasa_alta REAL, corte_tasa_critica REAL, "
         "banda_volumen REAL, banda_tasas REAL, banda_importe REAL, banda_latencia REAL, volumen_minimo INTEGER, gracia_minutos INTEGER, "
         "actualizado TEXT, actualizado_por INTEGER, PRIMARY KEY (cliente_id, servicio_id), CHECK (cliente_id <> '*' OR servicio_id = '*') );")
SEMILLA = ("INSERT OR IGNORE INTO umbrales_config (cliente_id, servicio_id, criticidad, objetivo_disponibilidad, corte_pct_alta, corte_pct_critica, corte_tasa_alta, corte_tasa_critica, "
           "banda_volumen, banda_tasas, banda_importe, banda_latencia) VALUES ('*', '*', 'MEDIA', 0.97, 0.25, 0.50, 0.05, 0.15, 1.0, 1.0, 1.0, 1.0);")

bloques = [
    ('Crear la tabla de umbrales', TABLA),
    ('Cargar los valores generales (los de fábrica)', SEMILLA),
    ('Borrar v_alertas', 'DROP VIEW IF EXISTS v_alertas;'),
    ('Borrar v_alertas_observadas', 'DROP VIEW IF EXISTS v_alertas_observadas;'),
    ('Borrar v_alertas_faltantes', 'DROP VIEW IF EXISTS v_alertas_faltantes;'),
    ('Borrar v_prealertas', 'DROP VIEW IF EXISTS v_prealertas;'),
    ('Crear v_alertas_observadas', obs.rstrip(';') + ';'),
    ('Crear v_alertas_faltantes', falt.rstrip(';') + ';'),
    ('Crear v_alertas', 'CREATE VIEW v_alertas AS SELECT * FROM v_alertas_observadas UNION ALL SELECT * FROM v_alertas_faltantes;'),
    ('Crear v_prealertas', pre.rstrip(';') + ';'),
    ('Marcar el tablero para que recalcule', "UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;"),
]
open(os.path.join(D, 'umbrales_d1.sql'), 'w').write('\n'.join(b for _, b in bloques) + '\n')
txt = '''UMBRALES CONFIGURABLES (para la Console de D1)

Qué hace: crea la tabla umbrales_config (valores generales + excepciones por cliente o por cliente y servicio)
y recrea las vistas de alertas y pre-alertas para que usen esos valores.
Con los valores de fábrica las alertas y pre-alertas son exactamente las mismas que hoy (probado con la demo completa).

En el panel de Cloudflare: D1 > helios-monitoring-dev > Console. Cada bloque es una sola línea.
Correr los bloques 1 a 11 en orden y seguidos: entre el 3 y el 10 el tablero y el proceso de alertas dan error porque faltan las vistas.
Después, desplegar el worker nuevo (worker_alertas_cron.js).
'''
for k, (t, b) in enumerate(bloques, 1):
    txt += '\n--- %d. %s ---\n%s\n' % (k, t, b)
open(os.path.join(D, 'umbrales_d1_tablas.txt'), 'w').write(txt)
print('ok', len(obs), len(falt), len(pre))
