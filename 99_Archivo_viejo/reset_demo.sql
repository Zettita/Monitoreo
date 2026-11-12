UPDATE alerta_parametros SET ahora = '2026-10-24T16:30:00Z', volumen_minimo = 20, gracia_minutos = 5, horizonte_horas = 24, tolerancia_tasa = 0.001 WHERE id = 1;
DELETE FROM alertas_historico;
DELETE FROM core_metricas_observadas;
SELECT (SELECT COUNT(*) FROM alertas_historico) AS alertas, (SELECT COUNT(*) FROM core_metricas_observadas) AS observadas, (SELECT COUNT(*) FROM core_metricas_esperadas) AS esperadas, (SELECT ahora FROM alerta_parametros WHERE id = 1) AS ahora;
