ALTER TABLE usuarios ADD COLUMN solo_comunicados INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alerta_parametros ADD COLUMN listas_difusion TEXT;
CREATE TABLE IF NOT EXISTS comunicados_incidente ( id INTEGER PRIMARY KEY AUTOINCREMENT, alerta_id TEXT NOT NULL, mensaje TEXT NOT NULL, listas TEXT, enviado_por INTEGER REFERENCES usuarios (id), enviado TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS ix_comunicados_incidente_alerta ON comunicados_incidente (alerta_id);
CREATE TABLE IF NOT EXISTS comunicado_destinatarios ( comunicado_id INTEGER NOT NULL REFERENCES comunicados_incidente (id), usuario_id INTEGER NOT NULL REFERENCES usuarios (id), rol TEXT NOT NULL CHECK (rol IN ('INFORMADO', 'TECNICO', 'LIDER')), visto TEXT, recibido TEXT, PRIMARY KEY (comunicado_id, usuario_id) ) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_comunicado_destinatarios_usuario ON comunicado_destinatarios (usuario_id, comunicado_id);
