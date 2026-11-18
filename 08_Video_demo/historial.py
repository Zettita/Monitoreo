# Historial ficticio de los días anteriores a la demo (alertas ya resueltas, con causa y qué se hizo).
# Sirve para que el asistente tenga "casos parecidos ya resueltos" y para que el Histórico y el tablero gerencial
# no arranquen vacíos. Todo es inventado, igual que el resto de los datos de la demo.
import sqlite3
from datetime import datetime, timedelta, timezone

# (tipo, cliente, servicio, canal, metrica, observado, esperado, umbral, severidad, días atrás, hora UTC, ventanas, causa, acciones, quién, nota)
CASOS = [
    ('LATENCIA_ALTA', 'CLI_003', 'RECARGA_TRANSPORTE', 'API', 'tiempo_respuesta_promedio', 1180, 640, 780, 'ALTA', 22, 14, 3, 'Proveedor o gateway', ['Se escaló'], 'Diego Ramos', 'El proveedor de recargas respondía al doble de lo normal. Se escaló y se normalizó en una hora.'),
    ('LATENCIA_ALTA', 'CLI_003', 'RECARGA_TRANSPORTE', 'API', 'tiempo_respuesta_promedio', 1090, 650, 790, 'MEDIA', 14, 18, 2, 'Proveedor o gateway', ['Se escaló', 'Se contactó al cliente'], 'Carolina Vega', 'Demora del proveedor de recargas. Se escaló y se avisó al cliente.'),
    ('LATENCIA_ALTA', 'CLI_003', 'RECARGA_TRANSPORTE', 'API', 'tiempo_respuesta_promedio', 1250, 630, 770, 'ALTA', 6, 15, 4, 'Proveedor o gateway', ['Se escaló'], 'Nicolás Funes', 'Mantenimiento no avisado del proveedor. Se escaló y volvió a la normalidad.'),
    ('SIN_EXITOS', 'CLI_006', 'PAGO_SERVICIOS', 'API', 'tasa_aprobacion', 0, 0.97, 0.9, 'CRITICA', 19, 13, 2, 'Falla nuestra', ['Se corrigió'], 'Carolina Vega', 'Se había vencido un certificado de la conexión con el gateway. Se renovó y se restableció el servicio.'),
    ('SIN_EXITOS', 'CLI_006', 'PAGO_SERVICIOS', 'API', 'tasa_aprobacion', 0, 0.97, 0.9, 'CRITICA', 9, 16, 3, 'Proveedor o gateway', ['Se escaló', 'Se contactó al cliente'], 'Diego Ramos', 'El gateway rechazaba todas las operaciones. Se escaló al proveedor y se informó al cliente.'),
    ('RECHAZO_ALTO', 'CLI_004', 'TRANSFERENCIAS', 'API', 'tasa_rechazo', 0.11, 0.039, 0.069, 'MEDIA', 17, 15, 4, 'Falla del cliente', ['Se contactó al cliente'], 'Nicolás Funes', 'El antifraude del cliente estaba rechazando de más. El cliente ajustó sus reglas.'),
    ('RECHAZO_ALTO', 'CLI_004', 'TRANSFERENCIAS', 'API', 'tasa_rechazo', 0.12, 0.04, 0.07, 'MEDIA', 8, 17, 3, 'Falla del cliente', ['Se contactó al cliente'], 'Diego Ramos', 'Nuevo ajuste de reglas antifraude del cliente.'),
    ('ERROR_ALTO', 'CLI_002', 'PAGO_SERVICIOS', 'WEB', 'tasa_error', 0.085, 0.012, 0.027, 'ALTA', 13, 14, 2, 'Proveedor o gateway', ['Se escaló'], 'Carolina Vega', 'Errores técnicos del gateway de pagos. Se escaló al proveedor.'),
    ('ERROR_ALTO', 'CLI_002', 'PAGO_SERVICIOS', 'WEB', 'tasa_error', 0.09, 0.012, 0.027, 'ALTA', 5, 19, 2, 'Falla nuestra', ['Se corrigió'], 'Diego Ramos', 'Un despliegue nuestro generaba errores en el formulario web. Se revirtió.'),
    ('VOLUMEN_BAJO', 'CLI_001', 'TRANSFERENCIAS', 'MOBILE', 'cantidad_total', 520, 1130, 960, 'CRITICA', 12, 13, 1, 'Falla del cliente', ['Se contactó al cliente'], 'Nicolás Funes', 'La app del cliente tuvo una caída momentánea.'),
    ('VOLUMEN_ALTO', 'CLI_005', 'RECARGA_TRANSPORTE', 'MOBILE', 'cantidad_total', 1900, 1180, 1500, 'MEDIA', 11, 15, 2, 'Comportamiento esperado (promo, feriado, campaña)', ['No requirió acción'], 'Carolina Vega', 'Promoción del cliente: más recargas de lo habitual.'),
    ('VENTANA_FALTANTE', 'CLI_007', 'RECARGA_CELULAR', 'MOBILE', 'cantidad_total', 0, 420, 300, 'CRITICA', 16, 16, 2, 'Falla del cliente', ['Se contactó al cliente'], 'Nicolás Funes', 'El collector del cliente dejó de enviar datos. Lo reiniciaron.'),
    ('DATO_TARDIO', 'CLI_003', 'RECARGA_CELULAR', 'MOBILE', 'minutos_demora', 12, 0, 5, 'MEDIA', 10, 14, 1, 'Falla del cliente', ['Se contactó al cliente'], 'Diego Ramos', 'Demora en el envío de datos del collector.'),
    ('DATO_INCONSISTENTE', 'CLI_005', 'PAGO_SERVICIOS', 'MOBILE', 'tasa_aprobacion', 0.91, 0.96, 0.001, 'MEDIA', 7, 15, 1, 'Falla del cliente', ['Se contactó al cliente', 'Se corrigió'], 'Carolina Vega', 'Un bug informaba mal la tasa de aprobación. El cliente lo corrigió.'),
]


def sembrar(ruta_sqlite):
    db = sqlite3.connect(ruta_sqlite)
    db.execute('PRAGMA foreign_keys = ON')
    ids = {n: i for n, i in db.execute('SELECT nombre, id FROM usuarios')}
    iso = lambda d: d.strftime('%Y-%m-%dT%H:%M:%SZ')
    base = datetime(2026, 10, 26, 0, 0, tzinfo=timezone.utc)
    n = 0
    for (tipo, cli, srv, can, metrica, obs, esp, umb, sev, dias, hora, ventanas, causa, acciones, quien, nota) in CASOS:
        ini = base - timedelta(days=dias) + timedelta(hours=hora)
        resolucion = ini + timedelta(minutes=15 * ventanas + 10)
        for k in range(ventanas):
            v = ini + timedelta(minutes=15 * k)
            desvio = round((obs - esp) / esp, 4) if esp else 0
            db.execute("""INSERT INTO alertas_historico (tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, ventana_inicio, ventana_fin,
                  duracion_ventana_minutos, metrica, severidad, severidad_maxima, valor_observado, valor_esperado, umbral, desvio, metrica_id, prediccion_id, estado,
                  primera_deteccion, ultima_deteccion, cantidad_detecciones, fecha_reconocimiento, reconocida_por, fecha_resolucion, motivo_resolucion, resuelta_por,
                  comentario, asignado_usuario_id, asignado_en, causa_resolucion, acciones_resolucion)
                  VALUES (?,?,?,?,?,?,?,?,?,15,?,?,?,?,?,?,?,?,?,'RESUELTA',?,?,1,?,?,?,'MANUAL',?,?,?,?,?,?)""",
                (tipo, 'PROD', cli, srv, 'BILLETERA', can, 'ARS', iso(v), iso(v + timedelta(minutes=15)), metrica, sev, sev, obs, esp, umb, desvio, None, None,
                 iso(v + timedelta(minutes=20)), iso(v + timedelta(minutes=20)), iso(ini + timedelta(minutes=25)), quien, iso(resolucion), quien,
                 'Causa: %s. Se hizo: %s. %s' % (causa, ' · '.join(acciones), nota), ids[quien], iso(ini + timedelta(minutes=22)), causa, ' · '.join(acciones)))
            n += 1
    db.commit(); db.close()
    return n


def sembrar_contexto(ruta_sqlite):
    """Contexto externo de ejemplo para el asistente (proveedores y noticias de demostración, guardados como si se hubieran consultado recién)
    y un evento comercial para los días de la demo. Sin internet, el asistente usa esto; con internet y la caché vencida, volvería a consultar."""
    import json
    from datetime import datetime, timezone
    db = sqlite3.connect(ruta_sqlite)
    ahora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    prov = {'consultados': ['Cloudflare', 'Twilio'], 'errores': [], 'novedades': [
        {'proveedor': 'Twilio (SMS)', 'tipo': 'Incidente', 'titulo': 'Delayed SMS delivery to Argentina carriers', 'titulo_es': 'Demora en el envío de SMS a operadores de Argentina',
         'impacto': 'importante', 'estado': 'Investigando', 'desde': '12:40', 'afecta': 'SMS · Argentina', 'link': 'https://status.twilio.com/'}]}
    noti = {'fuente': 'Fuente de demostración', 'noticias': [
        {'titulo': 'Paro de transporte anunciado para mañana: se espera más uso de billeteras y recargas', 'medio': 'Noticia de ejemplo (demo)', 'fecha': '25/10 18:30', 'link': 'https://example.com/noticia-de-ejemplo'}]}
    for fuente, cont in (('proveedores', prov), ('noticias', noti)):
        db.execute('INSERT OR REPLACE INTO contexto_externo (fuente, actualizado, contenido, error) VALUES (?, ?, ?, NULL)', (fuente, ahora, json.dumps(cont, ensure_ascii=False)))
    db.execute("INSERT INTO eventos_comerciales (nombre, fecha_desde, fecha_hasta, cliente_id, servicio_id, efecto_esperado, nota) VALUES (?, ?, ?, ?, ?, 'MAS_TRAFICO', ?)",
               ('Promo de recarga de transporte de CLI_005', '2026-10-26', '2026-10-27', 'CLI_005', 'RECARGA_TRANSPORTE', 'Promoción del cliente: más recargas de lo habitual.'))
    db.commit(); db.close()
