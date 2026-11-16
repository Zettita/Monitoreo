# Parche 38 (etapa 3b): limpieza de tablas. De 25 a 23.
#
#   - alerta_reglas (12 reglas del sistema) + alerta_reglas_personalizadas  ->  reglas_alerta (una sola tabla; columna tipo
#     SISTEMA / PERSONALIZADA). Los ids de las personalizadas se conservan (las alertas se llaman PERS_<id>).
#   - tablero_cache (una fila: revision, calculado)  ->  columnas tablero_revision y tablero_calculado de alerta_parametros.
#   - Script 16 (crea lo nuevo y copia, sin borrar nada) -> publicar el Worker -> script 17 (borra las tablas viejas).
#   - Mismo comportamiento que antes: solo cambia dónde se guardan las cosas. OJO con el motor: la consulta de las reglas del
#     sistema recorre TODAS las filas de la tabla de reglas, así que ahora filtra tipo = 'SISTEMA'; las ediciones por id de
#     una regla personalizada filtran tipo = 'PERSONALIZADA' (para no poder tocar una del sistema por su id).
def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:130])
    return s.replace(a, b)


def aplicar(s):
    # ---- Reglas: motor ----
    s = _rep(s, "CROSS JOIN alerta_reglas r WHERE r.activa = 1 AND r.regla <> 'VENTANA_FALTANTE'",
             "CROSS JOIN reglas_alerta r WHERE r.tipo = 'SISTEMA' AND r.activa = 1 AND r.regla <> 'VENTANA_FALTANTE'")
    s = _rep(s, "EXISTS (SELECT 1 FROM alerta_reglas WHERE regla = 'VENTANA_FALTANTE' AND activa = 1)",
             "EXISTS (SELECT 1 FROM reglas_alerta WHERE tipo = 'SISTEMA' AND regla = 'VENTANA_FALTANTE' AND activa = 1)")
    s = _rep(s, "    JOIN alerta_reglas_personalizadas r\n      ON r.activa = 1\n",
             "    JOIN reglas_alerta r\n      ON r.tipo = 'PERSONALIZADA'\n     AND r.activa = 1\n")
    s = _rep(s, "(SELECT COUNT(*) FROM alerta_reglas WHERE activa = 0) AS reglas_inactivas",
             "(SELECT COUNT(*) FROM reglas_alerta WHERE tipo = 'SISTEMA' AND activa = 0) AS reglas_inactivas")
    # Preparar demo: reactiva solo las del sistema (las personalizadas no se tocan)
    s = _rep(s, "env.DB.prepare('UPDATE alerta_reglas SET activa = 1'),",
             "env.DB.prepare(\"UPDATE reglas_alerta SET activa = 1 WHERE tipo = 'SISTEMA'\"),")
    # ---- Reglas: administración ----
    s = _rep(s, "env.DB.prepare('SELECT regla, orden, grupo, descripcion, activa FROM alerta_reglas ORDER BY orden'),",
             "env.DB.prepare(\"SELECT regla, orden, grupo, descripcion, activa FROM reglas_alerta WHERE tipo = 'SISTEMA' ORDER BY orden\"),")
    s = _rep(s, "                    FROM alerta_reglas_personalizadas r LEFT JOIN usuarios u ON u.id = r.creada_por\n                    ORDER BY r.activa DESC, r.id`),",
             "                    FROM reglas_alerta r LEFT JOIN usuarios u ON u.id = r.creada_por\n                    WHERE r.tipo = 'PERSONALIZADA'\n                    ORDER BY r.activa DESC, r.id`),")
    s = _rep(s, "'UPDATE alerta_reglas SET activa = ?1 WHERE regla = ?2'",
             "\"UPDATE reglas_alerta SET activa = ?1 WHERE tipo = 'SISTEMA' AND regla = ?2\"")
    s = _rep(s, "'SELECT * FROM alerta_reglas_personalizadas WHERE id = ?1'",
             "\"SELECT * FROM reglas_alerta WHERE id = ?1 AND tipo = 'PERSONALIZADA'\"")
    s = _rep(s, "`UPDATE alerta_reglas_personalizadas SET nombre = ?1,", "`UPDATE reglas_alerta SET nombre = ?1,")
    s = _rep(s, "servicio_id = ?6, canal_id = ?7, severidad = ?8, activa = ?9, actualizada = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10`)",
             "servicio_id = ?6, canal_id = ?7, severidad = ?8, activa = ?9, actualizada = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?10 AND tipo = 'PERSONALIZADA'`)")
    s = _rep(s, "`INSERT INTO alerta_reglas_personalizadas (nombre, metrica, direccion, ventanas_seguidas, cliente_id, servicio_id, canal_id, severidad, activa, creada_por)\n                        VALUES (?1, ?2,",
             "`INSERT INTO reglas_alerta (tipo, nombre, metrica, direccion, ventanas_seguidas, cliente_id, servicio_id, canal_id, severidad, activa, creada_por)\n                        VALUES ('PERSONALIZADA', ?1, ?2,")
    s = _rep(s, "'SELECT MAX(id) AS id FROM alerta_reglas_personalizadas WHERE creada_por = ?1'",
             "\"SELECT MAX(id) AS id FROM reglas_alerta WHERE tipo = 'PERSONALIZADA' AND creada_por = ?1\"")
    # ---- Reglas: nombres en el tablero, avisos y push ----
    s = _rep(s, "FROM alerta_reglas_personalizadas ORDER BY id`;", "FROM reglas_alerta WHERE tipo = 'PERSONALIZADA' ORDER BY id`;")
    s = _rep(s, "'SELECT id, nombre, activa FROM alerta_reglas_personalizadas ORDER BY id'",
             "\"SELECT id, nombre, activa FROM reglas_alerta WHERE tipo = 'PERSONALIZADA' ORDER BY id\"")
    s = _rep(s, "LEFT JOIN alerta_reglas_personalizadas rp ON 'PERS_' || rp.id = h.tipo_alerta",
             "LEFT JOIN reglas_alerta rp ON rp.tipo = 'PERSONALIZADA' AND 'PERS_' || rp.id = h.tipo_alerta", n=2)
    # ---- Caché del tablero: columnas de alerta_parametros ----
    s = _rep(s, "const MARCAR_TABLERO = `UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;",
             "const MARCAR_TABLERO = `UPDATE alerta_parametros SET tablero_revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;")
    s = _rep(s, "'SELECT revision, calculado FROM tablero_cache WHERE id = 1'",
             "'SELECT tablero_revision AS revision, tablero_calculado AS calculado FROM alerta_parametros WHERE id = 1'")
    s = _rep(s, "if (!c) throw new Error('Falta la tabla tablero_cache: corran cache_d1_tablas.txt en la consola de D1.');",
             "if (!c) throw new Error('Faltan los parámetros del tablero: corran 16_reglas_y_cache_d1.txt en la consola de D1.');")
    s = _rep(s, "'UPDATE tablero_cache SET calculado = ?1 WHERE id = 1'", "'UPDATE alerta_parametros SET tablero_calculado = ?1 WHERE id = 1'")
    s = _rep(s, "const CACHE_AL_DIA = `UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), calculado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;",
             "const CACHE_AL_DIA = `UPDATE alerta_parametros SET tablero_revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), tablero_calculado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;")
    s = _rep(s, "(SELECT revision IS calculado FROM tablero_cache WHERE id = 1) AS cache_al_dia,", "(tablero_revision IS tablero_calculado) AS cache_al_dia,")
    # Mensaje de error: también cuando falta una columna
    s = _rep(s, "if (/no such table|no such view/i.test(detalle)) {", "if (/no such table|no such view|no such column/i.test(detalle)) {")
    s = _rep(s, "el último script de 02_Base_de_datos_D1 (y perfil_comportamiento_d1.txt).",
             "el último script de 02_Base_de_datos_D1 (hoy el 16: 16_reglas_y_cache_d1.txt) y perfil_comportamiento_d1.txt.")
    # Comentarios
    s = _rep(s, "marca tablero_cache.revision;", "marca alerta_parametros.tablero_revision;")
    s = _rep(s, "// REGLAS PERSONALIZADAS (tabla alerta_reglas_personalizadas)", "// REGLAS PERSONALIZADAS (tabla reglas_alerta, tipo PERSONALIZADA)")
    s = _rep(s, "// Tablas: equipos, equipo_miembros, alerta_reglas_personalizadas (admin_d1_tablas.txt).", "// Tablas: equipos, equipo_miembros, reglas_alerta (16_reglas_y_cache_d1.txt).")
    return s
