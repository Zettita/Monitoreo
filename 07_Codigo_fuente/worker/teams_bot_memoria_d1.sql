DROP TABLE IF EXISTS teams_bot_memoria;
CREATE TABLE teams_bot_memoria ( conversacion_id TEXT PRIMARY KEY, mensajes TEXT NOT NULL, sala_id INTEGER, actualizado TEXT NOT NULL ) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_teams_bot_memoria_actualizado ON teams_bot_memoria (actualizado);
