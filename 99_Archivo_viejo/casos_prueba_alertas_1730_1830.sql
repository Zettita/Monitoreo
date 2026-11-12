-- =====================================================================
-- CASOS DE PRUEBA - ALERTAS (Cloudflare D1)
-- Hora puntual: 2026-10-05 17:30 a 18:30 (4 ventanas de 15 min)
-- Serie: CLI_001 / TRANSFERENCIAS / BILLETERA / MOBILE / ARS / PROD
--
-- Continúa los datos existentes: PRED-0001..0010 y MET-BF-0001..0010,
-- que terminan en la ventana 17:15-17:30. Agrega:
--   PRED-0011..0014   predicciones de la hora
--   MET-BF-0011..0014 observaciones de la hora (mismo formato que "Datos que llegan")
--
-- CÓMO EJECUTARLO
--   Para cada PASO 0..6:
--     a) ejecutar el bloque del paso
--     b) correr el worker (POST /run)
--     c) correr la VERIFICACIÓN del final y comparar con lo "Esperado"
--   Al terminar, correr el bloque FIN.
--
-- NOTAS (ajustado al esquema real)
--   * Los INSERT son posicionales y siguen el orden real de las tablas:
--     core_metricas_esperadas = 31 columnas, core_metricas_observadas = 29.
--   * Los "reprocesos" (pasos 3, 4 y 5) borran la fila de la ventana y la
--     vuelven a insertar.
--   * origen_dato = 'BACKFILL', así que no dispara DATO_TARDIO.
--   * En las predicciones nuevas el importe esperado es 2.000.000
--     [1.400.000 - 2.500.000], acorde a lo que llega (ticket de 20.000).
--     Ojo: PRED-0001..0007 esperan 920.000 [700.000 - 1.150.000] y lo
--     observado ronda 1.900.000, así que los datos actuales ya disparan
--     IMPORTE_ALTO en casi todas las ventanas de CLI_001.
--   * Severidades según v_alertas_observadas (desvío contra el valor esperado):
--     ERROR_ALTO: >= +0.05 ALTA, >= +0.15 CRITICA
--     APROBACION_BAJA: >= 0.05 por debajo ALTA, >= 0.15 CRITICA
--     LATENCIA_ALTA (promedio > máximo esperado): >= +25% ALTA, >= +50% CRITICA
-- =====================================================================


-- =====================================================================
-- PASO 0 - Limpieza y línea base. ahora = 17:31
--
-- Borra el histórico de alertas del 05/10 y los datos de prueba de esta
-- hora, para que el worker reconstruya las alertas de los datos ya
-- cargados (hasta 17:30).
--
-- Esperado: aparecen las alertas de los datos existentes. Por ejemplo,
-- en CLI_001: VOLUMEN_BAJO a las 15:45 y 16:30, RECHAZO_ALTO y
-- APROBACION_BAJA a las 16:00, ERROR_ALTO y LATENCIA_ALTA a las 16:15,
-- e IMPORTE_ALTO. Las de CLI_001 que no
-- tengan una ventana posterior normal quedan ABIERTAS.
-- =====================================================================
DELETE FROM alertas_historico
WHERE ventana_inicio LIKE '2026-10-05%';

DELETE FROM core_metricas_observadas
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND producto_id = 'BILLETERA' AND canal_id = 'MOBILE' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15
  AND ventana_inicio >= '2026-10-05T17:30:00.000Z' AND ventana_inicio < '2026-10-05T18:30:00.000Z';

DELETE FROM core_metricas_esperadas
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND producto_id = 'BILLETERA' AND canal_id = 'MOBILE' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15
  AND ventana_inicio >= '2026-10-05T17:30:00.000Z' AND ventana_inicio < '2026-10-05T18:30:00.000Z';

-- Predicciones de la hora (todas iguales)
INSERT INTO core_metricas_esperadas VALUES
('PRED-0011', '2026-10-05T17:30:00.000Z', '2026-10-05T17:45:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 75, 125, 0.92, 0.85, 1, 0.06, 0.1, 0.02, 0.05, 2000000, 1400000, 2500000, 320, 800, 'MODELO_SIMULADO_001', '1.0', '2026-10-05 17:00:00', 'SIMULACION', 'ACTIVA', '2026-10-05 17:00:00'),
('PRED-0012', '2026-10-05T17:45:00.000Z', '2026-10-05T18:00:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 75, 125, 0.92, 0.85, 1, 0.06, 0.1, 0.02, 0.05, 2000000, 1400000, 2500000, 320, 800, 'MODELO_SIMULADO_001', '1.0', '2026-10-05 17:00:00', 'SIMULACION', 'ACTIVA', '2026-10-05 17:00:00'),
('PRED-0013', '2026-10-05T18:00:00.000Z', '2026-10-05T18:15:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 75, 125, 0.92, 0.85, 1, 0.06, 0.1, 0.02, 0.05, 2000000, 1400000, 2500000, 320, 800, 'MODELO_SIMULADO_001', '1.0', '2026-10-05 17:00:00', 'SIMULACION', 'ACTIVA', '2026-10-05 17:00:00'),
('PRED-0014', '2026-10-05T18:15:00.000Z', '2026-10-05T18:30:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 75, 125, 0.92, 0.85, 1, 0.06, 0.1, 0.02, 0.05, 2000000, 1400000, 2500000, 320, 800, 'MODELO_SIMULADO_001', '1.0', '2026-10-05 17:00:00', 'SIMULACION', 'ACTIVA', '2026-10-05 17:00:00');

UPDATE alerta_parametros SET ahora = '2026-10-05T17:31:00Z' WHERE id = 1;


-- =====================================================================
-- PASO 1 - ahora = 17:46 - Ventana 17:30 NORMAL
--
--   102 tx | aprob 0.931 | rech 0.049 | error 0.020 | monto 1.900.000 | lat 315 / 690
--
-- Esperado:
--   - 17:30: sin alertas
--   - Todas las alertas de CLI_001 TRANSFERENCIAS que seguían ABIERTAS en
--     la línea base -> RESUELTA / NORMALIZADA / SISTEMA,
--     fecha_resolucion = 17:45 (fin de la ventana 17:30)
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T17:46:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0011', 'REC-BF-0002', 'LOTE-BF-20261005-002', 'COLLECTOR-LOCAL-001', '2026-10-05T17:30:00.000Z', '2026-10-05T17:45:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 102, 95, 5, 2, 0.931373, 0.04902, 0.019608, 1900000, 20000, 315, 690, '2026-10-05T17:44:52.000Z', 'BACKFILL', '1.0', '2026-10-05T17:45:20.000Z', NULL);


-- =====================================================================
-- PASO 2 - ahora = 18:01 - Ventana 17:45 con TASA DE ERROR ALTA
--
--   98 tx | aprob 0.857 | rech 0.051 | error 0.092 (máx 0.05) | monto 1.680.000 | lat 380 / 790
--
-- Esperado:
--   - 17:45 ERROR_ALTO: ABIERTA, severidad ALTA (0.092 - 0.02 = +0.07), primera_deteccion = ultima_deteccion = 18:01
--   - La aprobación (0.857) queda dentro de la banda: sin alerta de aprobación
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T18:01:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0012', 'REC-BF-0003', 'LOTE-BF-20261005-003', 'COLLECTOR-LOCAL-001', '2026-10-05T17:45:00.000Z', '2026-10-05T18:00:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 98, 84, 5, 9, 0.857143, 0.05102, 0.091837, 1680000, 20000, 380, 790, '2026-10-05T17:59:47.000Z', 'BACKFILL', '1.0', '2026-10-05T18:00:20.000Z', NULL);


-- =====================================================================
-- PASO 3 - ahora = 18:06 - REPROCESO: la condición desaparece
--
-- Llega una corrección de la ventana 17:45: 7 de los 9 errores eran
-- duplicados.
--   98 tx | aprob 0.929 | rech 0.051 | error 0.020 | monto 1.820.000 | lat 350 / 740
--
-- Esperado:
--   - 17:45 ERROR_ALTO: RESUELTA / CONDICION_DESAPARECIDA / SISTEMA,
--     fecha_resolucion = 18:06
--     (requiere horizonte_horas >= 1)
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T18:06:00Z' WHERE id = 1;

DELETE FROM core_metricas_observadas
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND producto_id = 'BILLETERA' AND canal_id = 'MOBILE' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T17:45:00.000Z';

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0012', 'REC-BF-0004', 'LOTE-BF-20261005-004', 'COLLECTOR-LOCAL-001', '2026-10-05T17:45:00.000Z', '2026-10-05T18:00:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 98, 91, 5, 2, 0.928571, 0.05102, 0.020408, 1820000, 20000, 350, 740, '2026-10-05T17:59:47.000Z', 'BACKFILL', '1.0', '2026-10-05T18:05:10.000Z', NULL);


-- =====================================================================
-- PASO 4 - ahora = 18:16 - REAPERTURA + ventana 18:00 con error moderado
--
-- Se revierte la corrección de 17:45 (los errores eran reales) y llega la
-- ventana 18:00:
--   18:00 -> 100 tx | aprob 0.86 | rech 0.06 | error 0.08 (máx 0.05) | monto 1.720.000 | lat 360 / 780
--
-- Esperado:
--   - 17:45 ERROR_ALTO: ABIERTA de nuevo, cantidad_reaperturas = 1,
--     fecha_resolucion / resuelta_por / motivo_resolucion = NULL,
--     cantidad_detecciones = 2
--   - 18:00 ERROR_ALTO: ABIERTA, severidad ALTA (+0.06)
--   - 17:45 NO se normaliza: la ventana siguiente (18:00) también tiene
--     alerta de error
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T18:16:00Z' WHERE id = 1;

DELETE FROM core_metricas_observadas
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND producto_id = 'BILLETERA' AND canal_id = 'MOBILE' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T17:45:00.000Z';

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0012', 'REC-BF-0005', 'LOTE-BF-20261005-005', 'COLLECTOR-LOCAL-001', '2026-10-05T17:45:00.000Z', '2026-10-05T18:00:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 98, 84, 5, 9, 0.857143, 0.05102, 0.091837, 1680000, 20000, 380, 790, '2026-10-05T17:59:47.000Z', 'BACKFILL', '1.0', '2026-10-05T18:15:10.000Z', NULL),
('MET-BF-0013', 'REC-BF-0005', 'LOTE-BF-20261005-005', 'COLLECTOR-LOCAL-001', '2026-10-05T18:00:00.000Z', '2026-10-05T18:15:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 86, 6, 8, 0.86, 0.06, 0.08, 1720000, 20000, 360, 780, '2026-10-05T18:14:40.000Z', 'BACKFILL', '1.0', '2026-10-05T18:15:10.000Z', NULL);


-- =====================================================================
-- PASO 5 - ahora = 18:21 - ESCALADA: la ventana 18:00 se agrava
--
-- Llegan eventos tardíos de 18:00 y el incidente resulta peor:
--   100 tx | aprob 0.72 (mín 0.85) | rech 0.06 | error 0.22 | monto 1.440.000 | lat 950 / 2800
--
-- Esperado:
--   - 18:00 ERROR_ALTO: severidad ALTA -> CRITICA (+0.20),
--     severidad_maxima = la misma, cantidad_detecciones = 2
--   - 18:00 APROBACION_BAJA (0.72 vs 0.92 esperado) y LATENCIA_ALTA
--     (950 vs 320, +197%): nuevas, ABIERTAS, ambas CRITICA
--   - 18:00 monto 1.440.000: dentro de la banda, sin alerta de monto
--   - 17:45 ERROR_ALTO: sigue ABIERTA, cantidad_detecciones = 3
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T18:21:00Z' WHERE id = 1;

DELETE FROM core_metricas_observadas
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND producto_id = 'BILLETERA' AND canal_id = 'MOBILE' AND moneda_id = 'ARS'
  AND duracion_ventana_minutos = 15 AND ventana_inicio = '2026-10-05T18:00:00.000Z';

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0013', 'REC-BF-0006', 'LOTE-BF-20261005-006', 'COLLECTOR-LOCAL-001', '2026-10-05T18:00:00.000Z', '2026-10-05T18:15:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 100, 72, 6, 22, 0.72, 0.06, 0.22, 1440000, 20000, 950, 2800, '2026-10-05T18:14:58.000Z', 'BACKFILL', '1.0', '2026-10-05T18:20:10.000Z', NULL);


-- =====================================================================
-- PASO 6 - ahora = 18:31 - Ventana 18:15 NORMAL: se cierra el incidente
--
--   101 tx | aprob 0.931 | rech 0.050 | error 0.020 | monto 1.880.000 | lat 330 / 700
--
-- Esperado:
--   - 17:45 ERROR_ALTO y 18:00 ERROR_ALTO / APROBACION_BAJA / LATENCIA_ALTA:
--     RESUELTA / NORMALIZADA / SISTEMA, fecha_resolucion = 18:30
--   - 18:00 ERROR_ALTO conserva severidad_maxima = CRITICA
--   - 18:15: sin alertas
-- =====================================================================
UPDATE alerta_parametros SET ahora = '2026-10-05T18:31:00Z' WHERE id = 1;

INSERT INTO core_metricas_observadas VALUES
('MET-BF-0014', 'REC-BF-0007', 'LOTE-BF-20261005-007', 'COLLECTOR-LOCAL-001', '2026-10-05T18:15:00.000Z', '2026-10-05T18:30:00.000Z', 15, 'CLI_001', 'TRANSFERENCIAS', 'BILLETERA', 'MOBILE', 'ARS', 'PROD', 101, 94, 5, 2, 0.930693, 0.049505, 0.019802, 1880000, 20000, 330, 700, '2026-10-05T18:29:50.000Z', 'BACKFILL', '1.0', '2026-10-05T18:30:20.000Z', NULL);


-- =====================================================================
-- FIN - Volver al reloj real
-- =====================================================================
UPDATE alerta_parametros SET ahora = NULL WHERE id = 1;


-- =====================================================================
-- VERIFICACIÓN - correr después de cada paso
-- =====================================================================
SELECT ventana_inicio, tipo_alerta, metrica, estado, motivo_resolucion,
       severidad, severidad_maxima, valor_observado, umbral,
       cantidad_detecciones, cantidad_reaperturas,
       primera_deteccion, ultima_deteccion, fecha_resolucion
FROM alertas_historico
WHERE ambiente = 'PROD' AND cliente_id = 'CLI_001' AND servicio_id = 'TRANSFERENCIAS'
  AND ventana_inicio LIKE '2026-10-05%'
ORDER BY ventana_inicio, tipo_alerta;

-- Estado final esperado para la hora 17:30-18:30 (después del paso 6):
--   ventana  alerta            estado    motivo       detalle
--   17:30    (ninguna)
--   17:45    ERROR_ALTO        RESUELTA  NORMALIZADA  1 reapertura, 4 detecciones
--   18:00    ERROR_ALTO        RESUELTA  NORMALIZADA  severidad_maxima CRITICA
--   18:00    APROBACION_BAJA   RESUELTA  NORMALIZADA
--   18:00    LATENCIA_ALTA     RESUELTA  NORMALIZADA
--   18:15    (ninguna)
-- Y ninguna alerta de CLI_001 TRANSFERENCIAS anterior a 17:30 en ABIERTA.
--
-- Los conteos de detecciones suponen que v_alertas no filtra ventanas por
-- antigüedad respecto de "ahora".
