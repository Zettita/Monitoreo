# Historia ficticia de 12 meses para el modelo v2 (13 series de la demo, ventanas de 15 min, hora ARG = UTC-3).
# Mismos parámetros por serie que la carga de la demo, con patrones reales:
#   día de la semana, tercio del mes (días 1-10 / 11-20 / 21 a fin; más tráfico a principio de mes), feriados más bajos,
#   ruido aleatorio y algunos incidentes sueltos (para que el perfil aprenda a ignorarlos).
import csv, datetime as dt, math, random
random.seed(20261026)
SERIES = [  # cliente, servicio, canal, volumen_pico, ticket, aprob, rech, err, latencia
 ('CLI_001','TRANSFERENCIAS','MOBILE',1200,20000,0.95,0.04,0.01,320), ('CLI_001','TRANSFERENCIAS','WEB',600,25000,0.95,0.04,0.01,350),
 ('CLI_002','PAGO_SERVICIOS','WEB',700,15000,0.96,0.03,0.01,380), ('CLI_002','PAGO_SERVICIOS','MOBILE',900,15000,0.96,0.03,0.01,300),
 ('CLI_003','RECARGA_CELULAR','MOBILE',800,5000,0.96,0.03,0.01,250), ('CLI_003','RECARGA_TRANSPORTE','API',1100,5000,0.96,0.03,0.01,200),
 ('CLI_004','TRANSFERENCIAS','API',800,30000,0.95,0.04,0.01,300), ('CLI_004','RECARGA_CELULAR','WEB',400,5000,0.96,0.03,0.01,280),
 ('CLI_005','PAGO_SERVICIOS','MOBILE',700,12000,0.96,0.03,0.01,330), ('CLI_005','RECARGA_TRANSPORTE','MOBILE',1300,3000,0.96,0.03,0.01,220),
 ('CLI_006','TRANSFERENCIAS','MOBILE',900,18000,0.95,0.04,0.01,310), ('CLI_006','PAGO_SERVICIOS','API',500,14000,0.96,0.03,0.01,360),
 ('CLI_007','RECARGA_CELULAR','MOBILE',600,4000,0.96,0.03,0.01,240)]
CURVA = [0.22,0.16,0.15,0.15,0.15,0.18,0.30,0.50,0.75,0.92,1.00,1.00,0.95,0.88,0.90,0.95,1.00,1.00,0.97,0.88,0.75,0.58,0.42,0.30]
# día de la semana (lunes = 0 ... domingo = 6), por tipo de servicio
DOW = {'TRANSFERENCIAS': [1.00,0.97,0.97,1.00,1.12,0.70,0.55], 'PAGO_SERVICIOS': [1.05,1.00,1.00,1.00,1.05,0.60,0.45],
       'RECARGA_CELULAR': [0.95,0.95,0.97,1.00,1.08,1.05,0.90], 'RECARGA_TRANSPORTE': [1.05,1.02,1.02,1.02,1.00,0.50,0.35]}
TERCIO = {'TRANSFERENCIAS': (1.15,1.00,0.95), 'PAGO_SERVICIOS': (1.35,1.00,0.85), 'RECARGA_CELULAR': (1.10,1.00,0.96), 'RECARGA_TRANSPORTE': (1.05,1.00,0.98)}
FERIADO = {'TRANSFERENCIAS': 0.50, 'PAGO_SERVICIOS': 0.35, 'RECARGA_CELULAR': 0.80, 'RECARGA_TRANSPORTE': 0.40}
import os
fer = {l.split(',')[0] for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'feriados.csv')).read().split('\n')[1:] if l}

def tercio_mes(d):  # tercio del mes por día del calendario: 1-10 = 1, 11-20 = 2, 21 a fin de mes = 3
    return 1 if d.day <= 10 else 2 if d.day <= 20 else 3

INI = dt.datetime(2025, 10, 26, 3, 0, tzinfo=dt.timezone.utc)   # domingo 26/10/2025 00:00 ARG
FIN = dt.datetime(2026, 10, 26, 13, 0, tzinfo=dt.timezone.utc)  # lunes 26/10/2026 10:00 ARG (arranque de la demo)
iso = lambda t: t.strftime('%Y-%m-%dT%H:%M:%S.000Z')
cols = ['metrica_id','ventana_inicio','ventana_fin','duracion_ventana_minutos','ambiente','cliente_id','servicio_id','producto_id','canal_id','moneda_id',
        'cantidad_total','cantidad_exitos','cantidad_rechazos','cantidad_errores','tasa_aprobacion','tasa_rechazo','tasa_error',
        'importe_total','importe_promedio','tiempo_respuesta_promedio','tiempo_respuesta_maximo','origen_dato','fecha_recepcion']
w = csv.writer(open('historico_metricas_demo.csv', 'w', newline='')); w.writerow(cols)
n_ventanas = int((FIN - INI).total_seconds() // 900); filas = 0
for k, (cli, srv, can, pico, ticket, ap, re_, er, lat) in enumerate(SERIES):
    incidentes = set(random.sample(range(n_ventanas), 40))      # ~40 ventanas raras por serie en el año
    for i in range(n_ventanas):
        t = INI + dt.timedelta(minutes=15 * i); loc = t - dt.timedelta(hours=3); d = loc.date()
        f = CURVA[loc.hour] * DOW[srv][d.weekday()] * TERCIO[srv][tercio_mes(d) - 1]
        if d.isoformat() in fer: f = CURVA[loc.hour] * FERIADO[srv]
        total = max(0, round(pico * f * random.gauss(1, 0.04)))
        p_rech, p_err, l = re_ * random.gauss(1, 0.08), er * random.gauss(1, 0.10), lat * random.gauss(1, 0.04)
        if i in incidentes:                                     # incidente: cae el tráfico o suben errores y latencia
            if random.random() < 0.5: total = round(total * random.uniform(0.1, 0.5))
            else: p_err, l = p_err * random.uniform(4, 8), l * random.uniform(1.5, 2.5)
        rech, err = int(total * max(0, p_rech)), int(total * max(0, p_err)); ok = total - rech - err
        imp = round(total * ticket * random.gauss(1, 0.03), 2)
        w.writerow([f'HIS-{k + 1:02d}-{i:06d}', iso(t), iso(t + dt.timedelta(minutes=15)), 15, 'PROD', cli, srv, 'BILLETERA', can, 'ARS',
                    total, ok, rech, err, round(ok / total, 6) if total else '', round(rech / total, 6) if total else '', round(err / total, 6) if total else '',
                    imp, round(imp / total, 2) if total else '', round(l, 1), round(l * 2.2), 'BACKFILL', iso(t + dt.timedelta(minutes=15, seconds=40))])
        filas += 1
print(filas, 'filas,', n_ventanas, 'ventanas por serie')
