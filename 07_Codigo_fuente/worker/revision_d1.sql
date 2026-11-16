CREATE INDEX IF NOT EXISTS ix_observadas_recepcion ON core_metricas_observadas (fecha_recepcion);
ALTER TABLE alerta_parametros ADD COLUMN revisado_hasta TEXT;
