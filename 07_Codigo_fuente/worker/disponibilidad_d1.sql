ALTER TABLE umbrales_config ADD COLUMN objetivo_mensual REAL;
ALTER TABLE alerta_parametros ADD COLUMN disponibilidad_config TEXT;
UPDATE umbrales_config SET objetivo_mensual = 0.999 WHERE cliente_id = '*' AND servicio_id = '*';
