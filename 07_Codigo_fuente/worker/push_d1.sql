CREATE TABLE IF NOT EXISTS suscripciones_push ( endpoint TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios (id), clave_p256dh TEXT NOT NULL, clave_auth TEXT NOT NULL, creada TEXT NOT NULL, actualizada TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS ix_suscripciones_push_usuario ON suscripciones_push (usuario_id);
