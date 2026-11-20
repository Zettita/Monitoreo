# Genera el SQL de la sala de crisis (parche 69, script 24):
#   07_Codigo_fuente/worker/sala_crisis_d1.sql            una sentencia por línea (lo usa mkdb.mjs)
#   02_Base_de_datos_D1/24_sala_crisis_d1.txt             bloques numerados para la Console de D1
# Solo crea tablas e índices y carga el ejemplo: no toca ninguna tabla existente. Se puede repetir sin duplicar nada
# (CREATE ... IF NOT EXISTS e INSERT OR IGNORE con ids fijos).
# Uso: python sala_crisis_sql.py
import os

D = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.normpath(os.path.join(D, '..', '..'))


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


TABLAS = [
    ('Tabla incidentes_mayores (cada sala de crisis)',
     "CREATE TABLE IF NOT EXISTS incidentes_mayores ( id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descripcion TEXT, "
     "estado TEXT NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'MITIGADO', 'RESUELTO', 'CERRADO')), "
     "severidad TEXT NOT NULL CHECK (severidad IN ('CRITICA', 'ALTA')), cliente_id TEXT, servicio_id TEXT, "
     "responsable_usuario_id INTEGER REFERENCES usuarios (id), abierto_por INTEGER REFERENCES usuarios (id), "
     "inicio TEXT NOT NULL, abierto TEXT NOT NULL, mitigado TEXT, resuelto TEXT, cerrado TEXT, "
     "causa_raiz TEXT, componente_causa_id INTEGER, resumen_cierre TEXT, "
     "origen TEXT NOT NULL DEFAULT 'HELIOS' CHECK (origen IN ('HELIOS', 'IMPORTADO')), actualizado TEXT NOT NULL );"),
    ('Índice de incidentes por estado (lista de salas abiertas y contador del menú)',
     'CREATE INDEX IF NOT EXISTS ix_incidentes_mayores_estado ON incidentes_mayores (estado, abierto);'),
    ('Índice de incidentes por componente de la causa (antecedentes de la guía de diagnóstico)',
     'CREATE INDEX IF NOT EXISTS ix_incidentes_mayores_componente ON incidentes_mayores (componente_causa_id, cerrado);'),
    ('Tabla incidente_alertas (qué grupos de alertas agrupa cada incidente)',
     'CREATE TABLE IF NOT EXISTS incidente_alertas ( incidente_id INTEGER NOT NULL REFERENCES incidentes_mayores (id), alerta_id TEXT NOT NULL, '
     'tipo_alerta TEXT NOT NULL, cliente_id TEXT, servicio_id TEXT, canal_id TEXT, sumada_por INTEGER REFERENCES usuarios (id), sumada TEXT NOT NULL, '
     'PRIMARY KEY (incidente_id, alerta_id) ) WITHOUT ROWID;'),
    ('Índice de alertas de incidentes por alerta ("es parte de IM-N" en el detalle de la alerta)',
     'CREATE INDEX IF NOT EXISTS ix_incidente_alertas_alerta ON incidente_alertas (alerta_id);'),
    ('Tabla incidente_tareas (quién hace qué en la sala)',
     "CREATE TABLE IF NOT EXISTS incidente_tareas ( id INTEGER PRIMARY KEY AUTOINCREMENT, incidente_id INTEGER NOT NULL REFERENCES incidentes_mayores (id), "
     "titulo TEXT NOT NULL, detalle TEXT, responsable_usuario_id INTEGER REFERENCES usuarios (id), equipo_id INTEGER REFERENCES equipos (id), "
     "componente_id INTEGER, estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'HECHA', 'CANCELADA')), "
     "resultado TEXT, creada_por INTEGER REFERENCES usuarios (id), creada TEXT NOT NULL, vence TEXT, actualizada TEXT NOT NULL, terminada TEXT, "
     "propuesta_por_asistente INTEGER NOT NULL DEFAULT 0 );"),
    ('Índice de tareas por incidente y estado',
     'CREATE INDEX IF NOT EXISTS ix_incidente_tareas_incidente ON incidente_tareas (incidente_id, estado);'),
    ('Índice de tareas por responsable y estado ("mis tareas" de Soporte)',
     'CREATE INDEX IF NOT EXISTS ix_incidente_tareas_responsable ON incidente_tareas (responsable_usuario_id, estado);'),
    ('Tabla incidente_linea_tiempo (cada hecho del incidente con su hora)',
     "CREATE TABLE IF NOT EXISTS incidente_linea_tiempo ( id INTEGER PRIMARY KEY AUTOINCREMENT, incidente_id INTEGER NOT NULL REFERENCES incidentes_mayores (id), "
     "fecha TEXT NOT NULL, usuario_id INTEGER REFERENCES usuarios (id), "
     "tipo TEXT NOT NULL CHECK (tipo IN ('APERTURA', 'ALERTA_SUMADA', 'ESTADO', 'TAREA', 'NOTA', 'COMUNICADO', 'ESCALAMIENTO', 'CIERRE')), "
     "texto TEXT NOT NULL, referencia TEXT );"),
    ('Índice de la línea de tiempo por incidente y fecha',
     'CREATE INDEX IF NOT EXISTS ix_incidente_linea_tiempo_incidente ON incidente_linea_tiempo (incidente_id, fecha);'),
    ('Tabla componentes_infraestructura (catálogo para la guía de diagnóstico)',
     "CREATE TABLE IF NOT EXISTS componentes_infraestructura ( id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, "
     "tipo TEXT NOT NULL CHECK (tipo IN ('GATEWAY', 'BASE_DE_DATOS', 'AUTENTICACION', 'PROVEEDOR_EXTERNO', 'RED', 'APLICACION')), "
     "descripcion TEXT, area_responsable TEXT, equipo_id INTEGER REFERENCES equipos (id), que_revisar TEXT, activo INTEGER NOT NULL DEFAULT 1 );"),
    ('Tabla componente_dependencias (de qué depende cada servicio y cada componente)',
     'CREATE TABLE IF NOT EXISTS componente_dependencias ( id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id TEXT, servicio_id TEXT, '
     'componente_id INTEGER REFERENCES componentes_infraestructura (id), depende_de_componente_id INTEGER NOT NULL REFERENCES componentes_infraestructura (id), '
     'CHECK ((servicio_id IS NULL) <> (componente_id IS NULL)) );'),
    ('Índice único de dependencias (repetir la carga no duplica)',
     "CREATE UNIQUE INDEX IF NOT EXISTS ux_componente_dependencias ON componente_dependencias "
     "(IFNULL(cliente_id, '*'), IFNULL(servicio_id, ''), IFNULL(componente_id, 0), depende_de_componente_id);"),
    ('Índice de dependencias por servicio (la guía arranca por el servicio afectado)',
     'CREATE INDEX IF NOT EXISTS ix_componente_dependencias_servicio ON componente_dependencias (servicio_id, cliente_id);'),
]

# ---------- Catálogo de ejemplo: componentes de los servicios de la demo ----------
COMPONENTES = [
    (1, 'Autenticación', 'AUTENTICACION', 'Ingreso de los usuarios a la app y la web, y códigos de seguridad por SMS.', 'Plataforma',
     'Tasa de ingresos fallidos; demora y entrega de los SMS; certificados vencidos; últimos cambios publicados.'),
    (2, 'Core de cuentas y saldos', 'BASE_DE_DATOS', 'Base de cuentas y saldos: toda operación que mueve dinero la consulta y la actualiza.', 'Base de datos',
     'Tiempo de respuesta de las consultas; conexiones abiertas contra el máximo; bloqueos; espacio en disco; tareas programadas pesadas.'),
    (3, 'Motor de transferencias', 'APLICACION', 'Valida y envía las transferencias entre cuentas propias y hacia otros bancos.', 'Pagos y transferencias',
     'Errores de la aplicación en los registros; cola de transferencias pendientes; último despliegue; respuesta de la red interbancaria.'),
    (4, 'Red interbancaria', 'PROVEEDOR_EXTERNO', 'Red de compensación que conecta con los otros bancos (proveedor externo).', 'Pagos y transferencias',
     'Página de estado del proveedor; rechazos con código de la red; tiempo de respuesta de la red; comunicado del proveedor.'),
    (5, 'Gateway de pagos', 'GATEWAY', 'Recibe los pagos de servicios y los envía al proveedor de cobranza.', 'Pagos y transferencias',
     'Errores 5xx del gateway; tiempo de respuesta; certificados del enlace con el proveedor; uso de CPU y memoria.'),
    (6, 'Proveedor de cobranza de servicios', 'PROVEEDOR_EXTERNO', 'Empresa externa que cobra luz, gas, agua, telefonía e impuestos.', 'Pagos y transferencias',
     'Página de estado del proveedor; rechazos por empresa de servicios; mantenimiento programado; canal de contacto con el proveedor.'),
    (7, 'Proveedor de recargas de celular', 'PROVEEDOR_EXTERNO', 'Integración con las compañías de telefonía para las recargas.', 'Integraciones',
     'Respuesta por compañía de telefonía; saldo prepago con el proveedor; tiempo de respuesta; mantenimiento programado.'),
    (8, 'Proveedor de carga de transporte', 'PROVEEDOR_EXTERNO', 'Integración con el sistema de tarjetas de transporte.', 'Integraciones',
     'Respuesta del sistema de transporte; tiempo de respuesta; promociones activas que suban el tráfico.'),
    (9, 'Balanceador y red de entrada', 'RED', 'Punto de entrada de la app, la web y la API: balanceador, firewall y certificados.', 'Infraestructura',
     'Errores 502/503/504; certificados; reglas de firewall cambiadas; tráfico anormal (posible ataque).'),
]

# (servicio_id, componente_id) para todos los clientes; componente → componente
DEP_SERVICIOS = [
    ('TRANSFERENCIAS', 1), ('TRANSFERENCIAS', 3),
    ('PAGO_SERVICIOS', 1), ('PAGO_SERVICIOS', 5),
    ('RECARGA_CELULAR', 1), ('RECARGA_CELULAR', 7),
    ('RECARGA_TRANSPORTE', 1), ('RECARGA_TRANSPORTE', 8),
]
DEP_COMPONENTES = [(1, 9), (3, 2), (3, 4), (3, 9), (5, 2), (5, 6), (5, 9), (7, 2), (8, 2)]
# Particular de un cliente: CLI_006 cobra servicios por API y pasa por el balanceador también desde el servicio
DEP_CLIENTE = [('CLI_006', 'PAGO_SERVICIOS', 9)]

# ---------- Antecedentes: 3 incidentes mayores cerrados del mes anterior a la demo (historia importada) ----------
# (id, titulo, descripcion, severidad, cliente, servicio, inicio, mitigado, resuelto, cerrado, causa_raiz, componente_causa, resumen, linea)
ANTECEDENTES = [
    (1, 'Caída de pagos de servicios de CLI_002', 'No se aprobaba ningún pago de servicios desde la app ni la web.', 'CRITICA', 'CLI_002', 'PAGO_SERVICIOS',
     '2026-09-08T14:15:00Z', '2026-09-08T15:40:00Z', '2026-09-08T16:10:00Z', '2026-09-09T13:00:00Z',
     'Certificado vencido en el enlace entre el gateway de pagos y el proveedor de cobranza.', 5,
     'Se renovó el certificado y se reinició el gateway. Queda pendiente un aviso automático 30 días antes del vencimiento.',
     [('2026-09-08T14:20:00Z', 'APERTURA', 'Se abrió la sala de crisis: 0 pagos aprobados en CLI_002 desde las 11:15.'),
      ('2026-09-08T14:35:00Z', 'TAREA', 'Revisar errores del gateway de pagos: el enlace con el proveedor rechaza la conexión.'),
      ('2026-09-08T15:10:00Z', 'COMUNICADO', 'Se comunicó el incidente al cliente y a Atención al cliente.'),
      ('2026-09-08T15:40:00Z', 'ESTADO', 'Mitigado: certificado renovado, los pagos vuelven a aprobarse.'),
      ('2026-09-09T13:00:00Z', 'CIERRE', 'Cerrado con causa raíz: certificado vencido en el enlace con el proveedor de cobranza.')]),
    (2, 'Ingreso fallido a la app de CLI_001', 'Los usuarios no podían entrar a la app: el código por SMS no llegaba.', 'CRITICA', 'CLI_001', 'TRANSFERENCIAS',
     '2026-09-15T12:00:00Z', '2026-09-15T13:05:00Z', '2026-09-15T13:30:00Z', '2026-09-16T14:00:00Z',
     'El proveedor de SMS cambió la ruta de envío y los códigos de seguridad llegaban con más de 10 minutos de demora.', 1,
     'Se pasó a la ruta de respaldo del proveedor de SMS. Se suma una alerta por demora de entrega de los códigos.',
     [('2026-09-15T12:10:00Z', 'APERTURA', 'Se abrió la sala de crisis: cae el tráfico de transferencias de CLI_001 por la app.'),
      ('2026-09-15T12:25:00Z', 'TAREA', 'Revisar autenticación: los ingresos fallan en el paso del código por SMS.'),
      ('2026-09-15T12:50:00Z', 'ESCALAMIENTO', 'Se escaló al proveedor de SMS.'),
      ('2026-09-15T13:05:00Z', 'ESTADO', 'Mitigado: se activó la ruta de respaldo de SMS.'),
      ('2026-09-16T14:00:00Z', 'CIERRE', 'Cerrado con causa raíz: cambio de ruta del proveedor de SMS.')]),
    (3, 'Recargas de celular lentas en CLI_003', 'Las recargas tardaban más de 20 segundos y muchas se rechazaban por tiempo agotado.', 'ALTA', 'CLI_003', 'RECARGA_CELULAR',
     '2026-09-22T19:30:00Z', '2026-09-22T20:45:00Z', '2026-09-22T21:00:00Z', '2026-09-23T15:00:00Z',
     'Mantenimiento no avisado del proveedor de recargas en una de las compañías de telefonía.', 7,
     'El proveedor terminó el mantenimiento. Se acordó que avise los mantenimientos con 48 horas.',
     [('2026-09-22T19:40:00Z', 'APERTURA', 'Se abrió la sala de crisis: latencia alta en recargas de celular de CLI_003.'),
      ('2026-09-22T20:00:00Z', 'TAREA', 'Revisar respuesta del proveedor de recargas por compañía de telefonía.'),
      ('2026-09-22T20:45:00Z', 'ESTADO', 'Mitigado: el proveedor terminó el mantenimiento.'),
      ('2026-09-23T15:00:00Z', 'CIERRE', 'Cerrado con causa raíz: mantenimiento no avisado del proveedor de recargas.')]),
]


def cargas():
    b = []
    for c in COMPONENTES:
        b.append(('Componente: ' + c[1],
                  'INSERT OR IGNORE INTO componentes_infraestructura (id, nombre, tipo, descripcion, area_responsable, equipo_id, que_revisar, activo) VALUES ('
                  + ', '.join(q(x) for x in (c[0], c[1], c[2], c[3], c[4], None, c[5], 1)) + ');'))
    nombre = {c[0]: c[1] for c in COMPONENTES}
    filas = [(None, s, None, c) for s, c in DEP_SERVICIOS] + [(None, None, a, d) for a, d in DEP_COMPONENTES] + [(cl, s, None, c) for cl, s, c in DEP_CLIENTE]
    vals = ', '.join('(' + ', '.join(q(x) for x in f) + ')' for f in filas)
    b.append(('Dependencias de los servicios y de los componentes (' + str(len(filas)) + ')',
              'INSERT OR IGNORE INTO componente_dependencias (cliente_id, servicio_id, componente_id, depende_de_componente_id) VALUES ' + vals + ';'))
    lid = 0
    for a in ANTECEDENTES:
        (i, tit, desc, sev, cli, srv, ini, mit, res, cer, causa, comp, resumen, linea) = a
        b.append(('Antecedente IM-' + str(i) + ': ' + tit + ' (' + nombre[comp] + ')',
                  'INSERT OR IGNORE INTO incidentes_mayores (id, titulo, descripcion, estado, severidad, cliente_id, servicio_id, responsable_usuario_id, abierto_por, '
                  'inicio, abierto, mitigado, resuelto, cerrado, causa_raiz, componente_causa_id, resumen_cierre, origen, actualizado) VALUES ('
                  + ', '.join(q(x) for x in (i, tit, desc, 'CERRADO', sev, cli, srv, None, None, ini, linea[0][0], mit, res, cer, causa, comp, resumen, 'IMPORTADO', cer)) + ');'))
        vals = []
        for (f, t, txt) in linea:
            lid += 1
            vals.append('(' + ', '.join(q(x) for x in (lid, i, f, None, t, txt, None)) + ')')
        b.append(('Línea de tiempo del antecedente IM-' + str(i),
                  'INSERT OR IGNORE INTO incidente_linea_tiempo (id, incidente_id, fecha, usuario_id, tipo, texto, referencia) VALUES ' + ', '.join(vals) + ';'))
    return b


def main():
    bloques = TABLAS + cargas()
    for _, s in bloques:
        assert '\n' not in s and len(s.encode()) < 100_000, s[:80]
    open(os.path.join(D, 'sala_crisis_d1.sql'), 'w', encoding='utf-8', newline='\n').write('\n'.join(s for _, s in bloques) + '\n')
    cab = """SALA DE CRISIS, ETAPA 1 DEL AICIM (para la Console de D1: helios-monitoring-dev) — parche 69

Qué hace:
- Crea 6 tablas nuevas para los incidentes mayores (sala de crisis): incidentes_mayores, incidente_alertas, incidente_tareas,
  incidente_linea_tiempo, componentes_infraestructura y componente_dependencias. Pasa de 26 a 32 tablas.
- Carga el catálogo de ejemplo (9 componentes de los servicios de la demo y sus dependencias) y 3 incidentes mayores ya cerrados
  del mes anterior (antecedentes para la guía de diagnóstico, marcados como IMPORTADO: "Preparar demo" no los borra).
- No toca ninguna tabla existente.

Orden: 1) correr los bloques en orden; 2) publicar 01_Worker/worker_alertas_cron.js.
Sin este script el Worker funciona igual: la sala de crisis avisa que falta el script.
Cada bloque es una sola línea. Se pueden repetir sin duplicar nada (IF NOT EXISTS e INSERT OR IGNORE). No hace falta /bookmark.

Para comprobar al final (solo lee; tiene que dar 6, 9, 18 y 3):
SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('incidentes_mayores', 'incidente_alertas', 'incidente_tareas', 'incidente_linea_tiempo', 'componentes_infraestructura', 'componente_dependencias')) AS tablas, (SELECT COUNT(*) FROM componentes_infraestructura) AS componentes, (SELECT COUNT(*) FROM componente_dependencias) AS dependencias, (SELECT COUNT(*) FROM incidentes_mayores WHERE origen = 'IMPORTADO') AS antecedentes;
"""
    txt = cab + ''.join('\n--- %d. %s ---\n%s\n' % (k, t, s) for k, (t, s) in enumerate(bloques, 1))
    open(os.path.join(RAIZ, '02_Base_de_datos_D1', '24_sala_crisis_d1.txt'), 'w', encoding='utf-8', newline='\n').write(txt)
    print('ok', len(bloques), 'bloques')


if __name__ == '__main__':
    main()
