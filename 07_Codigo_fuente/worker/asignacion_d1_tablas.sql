ALTER TABLE alertas_historico ADD COLUMN asignado_usuario_id INTEGER;
ALTER TABLE alertas_historico ADD COLUMN asignado_equipo_id INTEGER;
ALTER TABLE alertas_historico ADD COLUMN asignado_en TEXT;
ALTER TABLE alertas_historico ADD COLUMN asignado_por INTEGER;
CREATE INDEX IF NOT EXISTS ix_alertas_historico_asignado ON alertas_historico (asignado_usuario_id, estado);
CREATE INDEX IF NOT EXISTS ix_alertas_historico_equipo ON alertas_historico (asignado_equipo_id, estado);
CREATE TABLE IF NOT EXISTS alerta_eventos ( id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), alerta_id TEXT NOT NULL, usuario_id INTEGER, accion TEXT NOT NULL CHECK (accion IN ('DERIVAR', 'TOMAR', 'COMENTAR', 'DEVOLVER', 'RESOLVER')), usuario_destino_id INTEGER, equipo_destino_id INTEGER, comentario TEXT );
CREATE INDEX IF NOT EXISTS ix_alerta_eventos_alerta ON alerta_eventos (alerta_id, fecha);
