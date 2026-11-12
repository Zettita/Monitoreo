-- =====================================================================
-- CASOS DE PRUEBA - ALERTAS (Cloudflare D1)
--
-- Carga observaciones contra las predicciones PRED-0001..PRED-0010
-- ("Datos esperados") en 8 pasos. Cada paso fija un "ahora" simulado en
-- alerta_parametros y carga o corrige datos.
--
-- CÓMO EJECUTARLO
--   1. Correr el bloque PASO 0 (limpieza).
--   2. Para cada PASO 1..8:
--        a) ejecutar el bloque en la consola de D1 (o con wrangler d1 execute)
--        b) correr el worker:  POST /run  (o esperar el cron)
--        c) opcional: correr la consulta de VERIFICACIÓN del final
--   3. Al terminar, correr el bloque FIN para volver a ahora = NULL.
--
-- SUPUESTOS (revisar antes de correr)
--   * Las predicciones PRED-0001..0010 ya están cargadas.
--   * Los nombres de las columnas de métricas de core_metricas_observadas
--     son supuestos: cantidad_transacciones, cantidad_aprobadas,
--     cantidad_rechazadas, cantidad_errores, tasa_aprobacion, tasa_rechazo,
--     tasa_error, monto_total, latencia_p95_ms. Si tu tabla usa otros
--     nombres, cambialos en los INSERT y en los UPDATE.
--   * Los nombres de tipo_alerta (VOLUMEN_BAJO, TASA_ERROR, etc.) son
--     orientativos: los reales los define v_alertas.
--   * La comparación es estricta: un valor justo en el límite NO alerta.
--
-- IMPORTANTE: "ahora" tiene que avanzar entre pasos. Con un ahora fijo,
-- CERRAR_DESAPARECIDAS nunca cierra nada, porque cada corrida deja
-- ultima_deteccion = ahora.
-- =====================================================================


-- =====================================================================
-- PASO 0 - Limpieza de corridas anteriores (solo las ventanas de prueba)
-- =====================================================================
DELETE FROM alertas_historico
WHERE ambiente = 'PROD'
  AND ventana_inicio BETWEEN '2026-10-05T15:00:00Z' AND '2026-10-05T17:15:00Z'
  AND cliente_id IN ('CLI_001', 'CLI_002', 'CLI_003');

DELETE FROM core_metricas_observadas
WHERE ambiente = 'PROD'
  AND ventana_inicio BETWEEN '2026-10-05T15:00:00.000Z' AND '2026-10-05T17:15:00.000Z'
  AND cliente_id IN ('CLI_001', 'CLI_002', 'CLI_003');


-- =====================================================================
-- PASO 1 - ahora = 16:00 - CLI_001 TRANSFERENCIAS, ventanas 15:00 a 15:45
--
--  PRED-0001 15:00  BORDE: aprob 0.85 (=mín), rechazo 0.10 (=máx),
--                   error 0.05 (=máx), monto 700000 (=mín), latencia 800 (=máx)
--                   -> NO debe alertar
--  PRED-0002 15:15  CAÍDA DE VOLUMEN: 40 tx (mín 85, esperado 115, -65%)
--                   (el monto queda dentro de la banda a propósito)
--  PRED-0003 15:30  NORMAL -> normaliza la alerta de 0002
--  PRED-0004 15:45  TASA DE ERROR 0.09 (máx 0.05)
--
--  Esperado después de correr el worker:
--   - 0002 VOLUMEN_BAJO: RESUELTA / NORMALIZADA / SISTEMA,
--     fecha_resolucion = 16:00 (max(primera_deteccion 16:00, fin de 0003 15:45))
--   - 0004 TASA_ERROR: ABIERTA
--   - 0001 y 0003: sin alertas
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T16:00:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T15:00:00.000Z', '2026-10-05T15:15:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 85, 10,  5, 0.85,   0.10,   0.05,    700000,  800),
('2026-10-05T15:15:00.000Z', '2026-10-05T15:30:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD',  40, 37,  2,  1, 0.925,  0.05,   0.025,   800000,  330),
('2026-10-05T15:30:00.000Z', '2026-10-05T15:45:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 104, 96,  6,  2, 0.9231, 0.0577, 0.0192,  960000,  330),
('2026-10-05T15:45:00.000Z', '2026-10-05T16:00:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 86,  5,  9, 0.86,   0.05,   0.09,    900000,  340);


-- =====================================================================
-- PASO 2 - ahora = 16:15 - INCIDENTE QUE SE AGRAVA
--
--  PRED-0005 16:00  error 0.20 (máx 0.05) y aprobación 0.74 (mín 0.85)
--
--  Esperado:
--   - 0005 TASA_ERROR (severidad alta o crítica) y APROBACION_BAJA: ABIERTAS
--   - 0004 sigue ABIERTA: la ventana siguiente también tiene alerta de
--     error, así que NO normaliza. cantidad_detecciones de 0004 = 2
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T16:15:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T16:00:00.000Z', '2026-10-05T16:15:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 74, 6, 20, 0.74, 0.06, 0.20, 880000, 360);


-- =====================================================================
-- PASO 3 - ahora = 16:30 - SE RECUPERAN LOS ERRORES Y SUBE LA LATENCIA
--
--  PRED-0006 16:15  tasas normales, latencia 1500 ms (máx 800)
--
--  Esperado:
--   - 0004 y 0005 TASA_ERROR y 0005 APROBACION_BAJA: RESUELTA / NORMALIZADA,
--     fecha_resolucion = 16:30
--   - 0006 LATENCIA_ALTA: ABIERTA. La alerta de 0006 es de otro tipo, así
--     que no impide normalizar las de error.
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T16:30:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T16:15:00.000Z', '2026-10-05T16:30:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 101, 93, 6, 2, 0.9208, 0.0594, 0.0198, 925000, 1500);


-- =====================================================================
-- PASO 4 - ahora = 16:45 - TODO NORMAL
--
--  PRED-0007 16:30  normal en todas las métricas
--
--  Esperado:
--   - 0006 LATENCIA_ALTA: RESUELTA / NORMALIZADA, fecha_resolucion = 16:45
--   - 0004/0005 siguen apareciendo en v_alertas (el dato no cambió): suben
--     cantidad_detecciones, pero NO se reabren (motivo NORMALIZADA)
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T16:45:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T16:30:00.000Z', '2026-10-05T16:45:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 99, 91, 6, 2, 0.9192, 0.0606, 0.0202, 915000, 310);


-- =====================================================================
-- PASO 5 - ahora = 17:15 - OTROS CLIENTES
--
--  PRED-0008 CLI_002 PAGO_SERVICIOS 16:45   monto 600000 (máx 470000, +28%)
--  PRED-0009 CLI_003 RECARGA_CELULAR 17:00  rechazo 0.25 (máx 0.10)
--                                           -> también baja la aprobación (0.726)
--
--  Esperado:
--   - 0008 MONTO_ALTO: ABIERTA, severidad baja o media
--   - 0009 TASA_RECHAZO y APROBACION_BAJA: ABIERTAS
--   - Ninguna se normaliza: no hay ventanas posteriores para esas claves
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T17:15:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T16:45:00.000Z', '2026-10-05T17:00:00.000Z', 15, 'CLI_002', 'PAGO_SERVICIOS',  'BILLETERA', 'WEB', 'ARS', 'PROD', 82, 76,  4, 2, 0.9268, 0.0488, 0.0244, 600000, 300),
('2026-10-05T17:00:00.000Z', '2026-10-05T17:15:00.000Z', 15, 'CLI_003', 'RECARGA_CELULAR', 'BILLETERA', 'API', 'ARS', 'PROD', 84, 61, 21, 2, 0.7262, 0.25,   0.0238, 395000, 310);


-- =====================================================================
-- PASO 6 - ahora = 17:20 - ESCALADA DE SEVERIDAD (dato reprocesado)
--
--  PRED-0008: el monto se corrige a 1.200.000 (+155% sobre el máximo)
--
--  Esperado:
--   - 0008 MONTO_ALTO: severidad = CRITICA (o la más alta que use la
--     vista), severidad_maxima = CRITICA, cantidad_detecciones = 2
--   - 0009 sigue ABIERTA, ultima_deteccion = 17:20
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T17:20:00Z' WHERE id = 1;

UPDATE core_metricas_observadas
SET monto_total = 1200000
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_002' AND servicio_id = 'PAGO_SERVICIOS'
  AND producto_id = 'BILLETERA' AND canal_id = 'WEB' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T16:45:00.000Z';


-- =====================================================================
-- PASO 7 - ahora = 17:25 - BAJA LA SEVERIDAD Y DESAPARECE UNA CONDICIÓN
--
--  PRED-0008: monto 520000 (+11% sobre el máximo, sigue fuera de banda)
--  PRED-0009: se corrige el dato, rechazo 0.06 (normal)
--
--  Esperado:
--   - 0008 MONTO_ALTO: severidad baja (BAJA o MEDIA), severidad_maxima
--     sigue CRITICA, sigue ABIERTA
--   - 0009 TASA_RECHAZO y APROBACION_BAJA: RESUELTA /
--     CONDICION_DESAPARECIDA, fecha_resolucion = 17:25
--     (requiere horizonte_horas >= 1)
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T17:25:00Z' WHERE id = 1;

UPDATE core_metricas_observadas
SET monto_total = 520000
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_002' AND servicio_id = 'PAGO_SERVICIOS'
  AND producto_id = 'BILLETERA' AND canal_id = 'WEB' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T16:45:00.000Z';

UPDATE core_metricas_observadas
SET cantidad_aprobadas = 78, cantidad_rechazadas = 5, cantidad_errores = 1,
    tasa_aprobacion = 0.9286, tasa_rechazo = 0.0595, tasa_error = 0.0119
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_003' AND servicio_id = 'RECARGA_CELULAR'
  AND producto_id = 'BILLETERA' AND canal_id = 'API' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T17:00:00.000Z';


-- =====================================================================
-- PASO 8 - ahora = 17:30 - REAPERTURA Y ALERTA DOBLE
--
--  PRED-0009: vuelve el dato malo (rechazo 0.25)
--  PRED-0010 CLI_002 RECARGA_TRANSPORTE 17:15: pico de volumen
--            160 tx (máx 75) y monto 300000 (máx 145000)
--
--  Esperado:
--   - 0009 TASA_RECHAZO y APROBACION_BAJA: ABIERTA otra vez,
--     cantidad_reaperturas = 1, fecha_resolucion / resuelta_por /
--     motivo_resolucion = NULL
--   - 0010: dos alertas en la misma ventana (VOLUMEN_ALTO y MONTO_ALTO),
--     ambas ABIERTAS
--   - Las NORMALIZADAS de CLI_001 siguen RESUELTAS
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T17:30:00Z' WHERE id = 1;

UPDATE core_metricas_observadas
SET cantidad_aprobadas = 61, cantidad_rechazadas = 21, cantidad_errores = 2,
    tasa_aprobacion = 0.7262, tasa_rechazo = 0.25, tasa_error = 0.0238
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_003' AND servicio_id = 'RECARGA_CELULAR'
  AND producto_id = 'BILLETERA' AND canal_id = 'API' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T17:00:00.000Z';

INSERT INTO core_metricas_observadas (
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    cliente_id, servicio_id, producto_id, canal_id, moneda_id, ambiente,
    cantidad_transacciones, cantidad_aprobadas, cantidad_rechazadas, cantidad_errores,
    tasa_aprobacion, tasa_rechazo, tasa_error, monto_total, latencia_p95_ms
) VALUES
('2026-10-05T17:15:00.000Z', '2026-10-05T17:30:00.000Z', 15, 'CLI_002', 'RECARGA_TRANSPORTE', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 160, 147, 10, 3, 0.9188, 0.0625, 0.0188, 300000, 360);


-- =====================================================================
-- FIN - Volver al reloj real
-- =====================================================================
UPDATE alerta_parametros SET ahora = NULL WHERE id = 1;


-- =====================================================================
-- VERIFICACIÓN - correr después de cada paso
-- =====================================================================
SELECT ventana_inicio, cliente_id, servicio_id, tipo_alerta, metrica,
       estado, motivo_resolucion, severidad, severidad_maxima,
       valor_observado, umbral, cantidad_detecciones, cantidad_reaperturas,
       primera_deteccion, ultima_deteccion, fecha_resolucion
FROM alertas_historico
WHERE ambiente = 'PROD'
  AND ventana_inicio BETWEEN '2026-10-05T15:00:00Z' AND '2026-10-05T17:15:00Z'
ORDER BY ventana_inicio, cliente_id, tipo_alerta;

-- Estado final esperado (después del paso 8):
--   ventana  cliente/servicio              alerta            estado     motivo
--   15:00    CLI_001 TRANSFERENCIAS        (ninguna: borde)
--   15:15    CLI_001 TRANSFERENCIAS        VOLUMEN_BAJO      RESUELTA   NORMALIZADA
--   15:30    CLI_001 TRANSFERENCIAS        (ninguna)
--   15:45    CLI_001 TRANSFERENCIAS        TASA_ERROR        RESUELTA   NORMALIZADA
--   16:00    CLI_001 TRANSFERENCIAS        TASA_ERROR        RESUELTA   NORMALIZADA
--   16:00    CLI_001 TRANSFERENCIAS        APROBACION_BAJA   RESUELTA   NORMALIZADA
--   16:15    CLI_001 TRANSFERENCIAS        LATENCIA_ALTA     RESUELTA   NORMALIZADA
--   16:30    CLI_001 TRANSFERENCIAS        (ninguna)
--   16:45    CLI_002 PAGO_SERVICIOS        MONTO_ALTO        ABIERTA    -   (sev. baja, máx CRITICA, 4 detecciones)
--   17:00    CLI_003 RECARGA_CELULAR       TASA_RECHAZO      ABIERTA    -   (1 reapertura, 3 detecciones)
--   17:00    CLI_003 RECARGA_CELULAR       APROBACION_BAJA   ABIERTA    -   (1 reapertura, 3 detecciones)
--   17:15    CLI_002 RECARGA_TRANSPORTE    VOLUMEN_ALTO      ABIERTA
--   17:15    CLI_002 RECARGA_TRANSPORTE    MONTO_ALTO        ABIERTA
