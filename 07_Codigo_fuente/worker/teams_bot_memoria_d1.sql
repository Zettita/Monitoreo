CREATE TABLE IF NOT EXISTS teams_bot_memoria ( conversacion_id TEXT NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuarios (id), mensajes TEXT NOT NULL, sala_id INTEGER, actualizado TEXT NOT NULL, PRIMARY KEY (conversacion_id, usuario_id) ) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_teams_bot_memoria_actualizado ON teams_bot_memoria (actualizado);
