UPDATE alerta_parametros SET ahora = '2026-10-24T16:30:00Z', volumen_minimo = 20, gracia_minutos = 5, horizonte_horas = 24, tolerancia_tasa = 0.001 WHERE id = 1;
UPDATE alerta_reglas SET activa = 1;
DELETE FROM alertas_historico;
DELETE FROM core_metricas_observadas;
DROP TABLE IF EXISTS demo_escenarios;
DROP TABLE IF EXISTS demo_series;
SELECT (SELECT COUNT(*) FROM alertas_historico) AS alertas, (SELECT COUNT(*) FROM core_metricas_observadas) AS observadas, (SELECT COUNT(*) FROM core_metricas_esperadas) AS esperadas, (SELECT COUNT(DISTINCT cliente_id || servicio_id || canal_id) FROM core_metricas_esperadas) AS series, (SELECT MIN(ventana_inicio) FROM core_metricas_esperadas) AS desde, (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas) AS hasta;
SELECT ahora, volumen_minimo, gracia_minutos, horizonte_horas, tolerancia_tasa FROM alerta_parametros WHERE id = 1;
