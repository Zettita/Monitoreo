# Paso 24 del build: modelo v2. El motor compara contra perfil_comportamiento (día de la semana × franja de 15 min ×
# tercio del mes; un feriado se compara como domingo) en vez de core_metricas_esperadas, y deja de usar vistas:
# el SQL de v_comparacion, v_alertas_observadas, v_alertas_faltantes y v_prealertas pasa al Worker.
#
# El SQL de partida es el de las vistas vigentes (vistas_fecha.sql para v_comparacion y feriados_d1.sql para las demás).
# Cada cambio se hace con reemplazos que tienen que encontrar exactamente un lugar (si no, el build falla).
import json, os, re
AQUI = os.path.dirname(os.path.abspath(__file__))


def leer(f):
    return open(os.path.join(AQUI, f), encoding='utf-8').read()


def rep(txt, a, b, n=1):
    assert txt.count(a) == n, ('no encontrado/duplicado', txt.count(a), a[:120])
    return txt.replace(a, b)


def vista(archivo, nombre):
    for l in leer(archivo).split('\n'):
        if l.startswith('CREATE VIEW ' + nombre + ' AS '):
            return l[len('CREATE VIEW ' + nombre + ' AS '):].rstrip().rstrip(';')
    raise AssertionError('falta la vista ' + nombre)


# ---------- Celda del perfil de una ventana ----------
# Fecha y hora de Argentina (UTC-3). t = alias de la tabla con ventana_inicio, fe = feriado de esa fecha (LEFT JOIN).
def celda(t, fe):
    loc = t + ".ventana_inicio, '-3 hours'"
    dia = "CAST(strftime('%d', " + loc + ") AS INTEGER)"
    return ("p.dia_semana = CASE WHEN " + fe + ".fecha IS NOT NULL THEN 0 ELSE CAST(strftime('%w', " + loc + ") AS INTEGER) END"
            " AND p.franja_horaria = CAST(strftime('%H', " + loc + ") AS INTEGER) * 4 + CAST(strftime('%M', " + t + ".ventana_inicio) AS INTEGER) / 15"
            " AND p.tercio_mes = CASE WHEN " + dia + " <= 10 THEN 1 WHEN " + dia + " <= 20 THEN 2 ELSE 3 END")


def perfil_on(o, fe):
    return ("p.ambiente = {o}.ambiente AND p.cliente_id = {o}.cliente_id AND p.servicio_id = {o}.servicio_id"
            " AND p.producto_id = {o}.producto_id AND p.canal_id = {o}.canal_id AND p.moneda_id = {o}.moneda_id"
            " AND p.duracion_ventana_minutos = {o}.duracion_ventana_minutos AND ").format(o=o) + celda(o, fe)


# En alertas_historico.prediccion_id queda la celda usada (modelo:día:franja:tercio); NULL = la serie no tiene perfil
PERFIL_ID = "p.modelo_id || ':' || p.dia_semana || ':' || p.franja_horaria || ':' || p.tercio_mes"


# ---------- 1. Comparación observado contra perfil (era v_comparacion) ----------
def sql_comparacion():
    v = vista('vistas_fecha.sql', 'v_comparacion')
    v = rep(v, 'SELECT o.metrica_id, p.prediccion_id,', 'SELECT o.metrica_id, ' + PERFIL_ID + ' AS prediccion_id,')
    i = v.index(' FROM core_metricas_observadas o LEFT JOIN core_metricas_esperadas p ON')
    # Solo las ventanas del horizonte, por el índice de ventana_inicio (prm viene del WITH de afuera)
    return (v[:i] + " FROM prm CROSS JOIN core_metricas_observadas o"
            " LEFT JOIN feriados fp ON fp.fecha = date(o.ventana_inicio, '-3 hours')"
            " LEFT JOIN perfil_comportamiento p ON " + perfil_on('o', 'fp') +
            " WHERE o.ventana_inicio >= prm.desde_txt AND o.ventana_inicio < prm.hasta_txt")


# ---------- 2. Reglas 1 a 11 (era v_alertas_observadas) ----------
def sql_alertas_observadas():
    v = vista('feriados_d1.sql', 'v_alertas_observadas')
    v = rep(v, ' WHERE id = 1 ), c AS (', ' WHERE id = 1 ), comparacion AS ( ' + sql_comparacion() + ' ), c AS (')
    v = rep(v, ' CROSS JOIN v_comparacion v ', ' CROSS JOIN comparacion v ')
    assert 'core_metricas_esperadas' not in v and 'v_' + 'comparacion' not in v
    return v


# ---------- 3. Regla 12, ventana faltante (era v_alertas_faltantes) ----------
# Antes: había predicción y no llegó el dato. Ahora: la serie tiene perfil para esa ventana (esperaba > 0), ya había
# mandado algún dato antes (así un cliente que todavía no empezó a enviar no genera alertas) y no llegó.
# Las ventanas del horizonte se generan con un WITH RECURSIVE (~100) y el perfil se busca por (día, franja, tercio)
# con el índice ix_perfil_comportamiento_franja.
def sql_alertas_faltantes():
    v = vista('feriados_d1.sql', 'v_alertas_faltantes')
    sel = v[v.index(" SELECT 'VENTANA_FALTANTE' AS tipo_alerta,"):v.index(' FROM prm CROSS JOIN core_metricas_esperadas p ')]
    sel = rep(sel, ' p.ventana_inicio, p.duracion_ventana_minutos,', ' w.ventana_inicio, p.duracion_ventana_minutos,')
    sel = rep(sel, ' NULL AS metrica_id, p.prediccion_id', ' NULL AS metrica_id, ' + PERFIL_ID + ' AS prediccion_id')
    prm = v[:v.index(' SELECT ' + "'VENTANA_FALTANTE'")]
    prm = rep(prm, 'WITH prm AS (', 'WITH RECURSIVE prm AS (')
    prm = rep(prm, "julianday(COALESCE(ahora, 'now')) AS ahora_jd,",
              "julianday(COALESCE(ahora, 'now')) AS ahora_jd, CAST(strftime('%s', COALESCE(ahora, 'now')) AS INTEGER) AS ahora_s,")
    ventanas = (" ventanas(ventana_inicio, s) AS ("
                " SELECT strftime('%Y-%m-%dT%H:%M:%fZ', x, 'unixepoch'), x FROM (SELECT (ahora_s - (horizonte_horas + 1) * 3600) / 900 * 900 AS x FROM prm)"
                " UNION ALL"
                " SELECT strftime('%Y-%m-%dT%H:%M:%fZ', w.s + 900, 'unixepoch'), w.s + 900 FROM ventanas w CROSS JOIN prm WHERE w.s + 900 < prm.ahora_s )")
    umbral = lambda campo: 'COALESCE(us.{c}, uc.{c}, ug.{c}, prm.{c})'.format(c=campo)
    cuerpo = (" FROM prm CROSS JOIN ventanas w"
              " LEFT JOIN feriados fe ON fe.fecha = date(w.ventana_inicio, '-3 hours')"
              " JOIN perfil_comportamiento p ON p.duracion_ventana_minutos = 15 AND " + celda('w', 'fe') +
              " LEFT JOIN umbrales_config ug ON ug.cliente_id = '*' AND ug.servicio_id = '*'"
              " LEFT JOIN umbrales_config uc ON uc.cliente_id = p.cliente_id AND uc.servicio_id = '*'"
              " LEFT JOIN umbrales_config us ON us.cliente_id = p.cliente_id AND us.servicio_id = p.servicio_id"
              " WHERE NOT (fe.fecha IS NOT NULL AND COALESCE(us.silenciar_feriados, uc.silenciar_feriados, ug.silenciar_feriados, 0) = 1)"
              " AND w.ventana_inicio >= prm.desde_txt AND w.ventana_inicio < prm.hasta_txt"
              " AND EXISTS (SELECT 1 FROM alerta_reglas WHERE regla = 'VENTANA_FALTANTE' AND activa = 1)"
              " AND julianday(w.ventana_inicio) + 15 / 1440.0 + " + umbral('gracia_minutos') + " / 1440.0 <= prm.ahora_jd"
              " AND julianday(w.ventana_inicio) + 15 / 1440.0 > prm.ahora_jd - prm.horizonte_horas / 24.0"
              " AND p.cantidad_total_esperada > 0"
              # solo desde que la serie empezó a mandar: un cliente que todavía no envió nada no genera faltantes
              " AND EXISTS ( SELECT 1 FROM core_metricas_observadas o"
              " WHERE o.cliente_id = p.cliente_id AND o.servicio_id = p.servicio_id AND o.canal_id = p.canal_id AND o.producto_id = p.producto_id"
              " AND o.moneda_id = p.moneda_id AND o.ambiente = p.ambiente AND o.duracion_ventana_minutos = p.duracion_ventana_minutos"
              " AND strftime('%Y-%m-%dT%H:%M:%S', o.ventana_inicio) < strftime('%Y-%m-%dT%H:%M:%S', w.ventana_inicio) )"
              " AND NOT EXISTS ( SELECT 1 FROM core_metricas_observadas o"
              " WHERE strftime('%Y-%m-%dT%H:%M:%S', o.ventana_inicio) = strftime('%Y-%m-%dT%H:%M:%S', w.ventana_inicio)"
              " AND o.duracion_ventana_minutos = p.duracion_ventana_minutos AND o.ambiente = p.ambiente AND o.cliente_id = p.cliente_id"
              " AND o.servicio_id = p.servicio_id AND o.producto_id = p.producto_id AND o.canal_id = p.canal_id AND o.moneda_id = p.moneda_id )")
    s = prm.rstrip() + ',' + ventanas + sel + cuerpo
    assert 'core_metricas_esperadas' not in s
    return s


# ---------- 4. Pre-alertas (era v_prealertas) ----------
def sql_prealertas():
    v = vista('feriados_d1.sql', 'v_prealertas')
    v = rep(v, ' FROM core_metricas_observadas o CROSS JOIN core_metricas_esperadas p CROSS JOIN prm LEFT JOIN',
               ' FROM core_metricas_observadas o CROSS JOIN prm LEFT JOIN')
    v = rep(v, " LEFT JOIN feriados fe ON fe.fecha = date(o.ventana_inicio, '-3 hours') WHERE NOT",
               " LEFT JOIN feriados fe ON fe.fecha = date(o.ventana_inicio, '-3 hours') JOIN perfil_comportamiento p ON " + perfil_on('o', 'fe') + " WHERE NOT")
    i = v.index(" AND p.ventana_inicio = strftime('%Y-%m-%dT%H:%M:%fZ', o.ventana_inicio)")
    j = v.index(" AND o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-49 hours')")
    v = v[:i] + v[j:]
    assert 'core_metricas_esperadas' not in v and 'estado_prediccion' not in v
    return v


def js(nombre, sql):
    assert '`' not in sql and '${' not in sql
    return 'const ' + nombre + ' = `\n' + sql + '\n`;\n'


def aplicar(s):
    # ----- Motor: las consultas nuevas, antes del registro de alertas -----
    nuevo = ('// =====================================================================\n'
             '// MOTOR CONTRA EL PERFIL DE COMPORTAMIENTO (modelo v2, sin vistas)\n'
             '// Cada ventana observada se compara con su celda de perfil_comportamiento: misma serie, día de la semana\n'
             '// (un feriado cuenta como domingo), franja de 15 min y tercio del mes (días 1-10, 11-20, 21 a fin), en hora\n'
             '// de Argentina. La celda se busca por clave primaria. Era el SQL de las vistas v_comparacion,\n'
             '// v_alertas_observadas, v_alertas_faltantes y v_prealertas, que ya no existen.\n'
             '// =====================================================================\n'
             + js('SQL_ALERTAS_OBSERVADAS', sql_alertas_observadas())
             + js('SQL_ALERTAS_FALTANTES', sql_alertas_faltantes())
             + js('SQL_PREALERTAS', sql_prealertas()) + '\n')
    s = rep(s, 'const REGISTRAR = `', nuevo + 'const REGISTRAR = `')
    # REGISTRAR: reglas 1 a 11; REGISTRAR_FALTANTES: regla 12 (dos sentencias: D1 admite como máximo 2 SELECT unidos)
    s = rep(s, 'FROM v_alertas a\nCROSS JOIN (', 'FROM (${SQL_ALERTAS_OBSERVADAS}) a\nCROSS JOIN (')
    s = rep(s, 'const CERRAR_NORMALIZADAS = `',
            "const REGISTRAR_FALTANTES = REGISTRAR.replace('FROM (' + SQL_ALERTAS_OBSERVADAS + ') a', () => 'FROM (' + SQL_ALERTAS_FALTANTES + ') a');\n\n"
            'const CERRAR_NORMALIZADAS = `')
    s = rep(s, """    const [registrar, personalizadas, , normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(REGISTRAR_PERSONALIZADAS_SQL),""", """    const [registrar, faltantes, personalizadas, , normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(REGISTRAR_FALTANTES),
      env.DB.prepare(REGISTRAR_PERSONALIZADAS_SQL),""")
    s = rep(s, """    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];""",
               """    const pasos = [registrar, faltantes, personalizadas, normalizadas, desaparecidas];""")
    s = rep(s, """      registradas_o_actualizadas: registrar.meta.changes + personalizadas.meta.changes,""",
               """      registradas_o_actualizadas: registrar.meta.changes + faltantes.meta.changes + personalizadas.meta.changes,""")
    s = rep(s, '\nFROM v_prealertas\n`;', '\nFROM (${SQL_PREALERTAS})\n`;')
    # Consultas viejas del tablero que ya no se usan (leían las vistas)
    i = s.index('const Q_KPIS = `'); j = s.index('const Q_PARAMETROS = `')
    s = s[:i] + s[j:]
    i = s.index('const Q_PREALERTAS = `'); j = s.index('const RECONOCER = `')
    s = s[:i] + s[j:]
    s = rep(s, """    return detalle + ' -> Falta crear objetos en la base: ejecuten alertas_d1_objetos.sql y ' +
      'después alertas_d1_historico.sql (con --remote si la base es la de Cloudflare).';""",
               """    return detalle + ' -> Falta crear objetos en la base: revisen que se haya corrido en la consola de D1 ' +
      'el último script de 02_Base_de_datos_D1 (y perfil_comportamiento_d1.txt).';""")
    s = rep(s, '//   1. Cron Trigger: ejecuta el proceso de alertas (alertas_d1_proceso.sql)\n//      y actualiza alertas_historico.\n',
               '//   1. Proceso de alertas (botón, escenas de la demo o Cron Trigger si se configura):\n'
               '//      compara cada ventana contra perfil_comportamiento y actualiza alertas_historico.\n')
    s = rep(s, '//      y la predicción (vista v_prealertas: métricas que vienen empeorando).',
               '//      y las pre-alertas (métricas que vienen empeorando).')

    # ----- Reglas personalizadas -----
    a = s.index('    JOIN core_metricas_esperadas p\n      ON p.ventana_inicio           = strftime(')
    b = s.index("     AND p.estado_prediccion        = 'ACTIVA'\n", a) + len("     AND p.estado_prediccion        = 'ACTIVA'\n")
    s = s[:a] + s[b:]
    s = rep(s, "    LEFT JOIN feriados fe ON fe.fecha = date(o.ventana_inicio, '-3 hours')\n    WHERE julianday(o.ventana_fin) >  prm.ahora_jd - prm.horizonte_horas / 24.0\n",
               "    LEFT JOIN feriados fe ON fe.fecha = date(o.ventana_inicio, '-3 hours')\n"
               "    -- celda del perfil de la ventana (un feriado cuenta como domingo), por clave primaria\n"
               "    JOIN perfil_comportamiento p ON " + perfil_on('o', 'fe') + "\n"
               "    WHERE julianday(o.ventana_fin) >  prm.ahora_jd - prm.horizonte_horas / 24.0\n")
    a = s.index('      -- si el modelo generó más de una predicción para la ventana, vale la última\n')
    b = s.index('      )\n),\n-- límite con la banda ajustada', a) + len('      )\n')
    s = s[:a] + s[b:]
    s = rep(s, 'o.ventana_inicio, o.duracion_ventana_minutos, o.metrica_id, p.prediccion_id,',
               'o.ventana_inicio, o.duracion_ventana_minutos, o.metrica_id, ' + PERFIL_ID + ' AS prediccion_id,')
    s = rep(s, '// predicción del modelo (core_metricas_esperadas), con el ancho de banda y el',
               '// celda del perfil de comportamiento (perfil_comportamiento), con el ancho de banda y el')
    s = rep(s, '// CERRAR_DESAPARECIDAS), el tablero y Power BI las tratan como a cualquier alerta.',
               '// CERRAR_DESAPARECIDAS) y el tablero las tratan como a cualquier alerta.')
    s = rep(s, '// ventana_inicio) y la predicción de cada una por la clave única de esperadas.',
               '// ventana_inicio) y la celda del perfil de cada una por su clave primaria.')

    # ----- Demo: lo "normal" de cada ventana sale del perfil -----
    s = rep(s, """const Q_DEMO_ESPERADAS = `
SELECT * FROM core_metricas_esperadas
WHERE estado_prediccion = 'ACTIVA'
  AND julianday(ventana_inicio) = julianday(?1)
ORDER BY cliente_id, servicio_id, canal_id, julianday(fecha_generacion) DESC
`;""", """// Perfil de todas las series para la ventana ?1 (por el índice de día, franja y tercio)
const Q_DEMO_PERFIL = `
SELECT p.* FROM (SELECT ?1 AS ventana_inicio) w
LEFT JOIN feriados fe ON fe.fecha = date(w.ventana_inicio, '-3 hours')
JOIN perfil_comportamiento p ON p.duracion_ventana_minutos = 15 AND """ + celda('w', 'fe') + """
ORDER BY p.cliente_id, p.servicio_id, p.canal_id
`;""")
    s = rep(s, 'const esperadas = (await env.DB.prepare(Q_DEMO_ESPERADAS).bind(isoZ(iniMs)).all()).results;',
               'const esperadas = (await env.DB.prepare(Q_DEMO_PERFIL).bind(isoZ(iniMs)).all()).results;')
    s = rep(s, "if (!filas.length) throw new Error('No hay predicciones para la ventana ' + isoZ(iniMs) + '.');",
               "if (!filas.length) throw new Error('No hay perfil de comportamiento para la ventana ' + isoZ(iniMs) + ': falta cargar perfil_comportamiento_d1.txt.');")
    s = rep(s, '// (alerta_parametros.ahora). Los valores "normales" salen de la predicción\n// vigente de cada serie (core_metricas_esperadas).',
               '// (alerta_parametros.ahora). Los valores "normales" salen del perfil de\n// comportamiento de cada serie (perfil_comportamiento) para esa ventana.')
    s = rep(s, """// La demo arranca en DEMO_INICIO, que tiene que coincidir con la carga baseline
// (carga_baseline_demo_consola.txt): historia hasta el sábado 24/10, modelo
// para domingo 25 y lunes 26, y datos normales hasta el lunes 26 a las 10:00 ARG.""",
               """// La demo arranca en DEMO_INICIO, el lunes 26/10/2026 a las 10:00 ARG: el perfil
// está entrenado con la historia hasta ese momento y no hay datos recibidos antes
// (09_modelo_v2_d1.txt vacía core_metricas_observadas). La escena 1 es la primera
// llegada de datos de cada serie.""")

    # ----- Administración: series del modelo, pestaña Modelo y recomendación de umbrales -----
    viejo = """FROM core_metricas_esperadas
                    WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')"""
    s = rep(s, viejo, """FROM perfil_comportamiento
                    WHERE dia_semana = 0 AND franja_horaria = 0 AND tercio_mes = 1""", 3)
    s = rep(s, 'que tiene el modelo (último día de predicciones, por índice)', 'que tiene el modelo (una celda del perfil, por índice)', 2)
    s = rep(s, """    env.DB.prepare(`SELECT modelo_id, modelo_version, origen_prediccion, MAX(fecha_generacion) AS ultima_generacion,
                           MIN(ventana_inicio) AS desde, MAX(ventana_inicio) AS hasta, COUNT(*) AS predicciones,
                           COUNT(DISTINCT cliente_id || '|' || servicio_id || '|' || canal_id || '|' || producto_id) AS series
                    FROM core_metricas_esperadas WHERE estado_prediccion = 'ACTIVA'
                    GROUP BY modelo_id, modelo_version, origen_prediccion ORDER BY ultima_generacion DESC`),""",
               """    // Una celda por serie (por índice): el perfil tiene 7 días × 96 franjas × 3 tercios = 2.016 celdas por serie
    env.DB.prepare(`SELECT modelo_id, modelo_version, MAX(fecha_carga) AS fecha_carga, MAX(entrenado_hasta) AS entrenado_hasta,
                           COUNT(*) AS series
                    FROM perfil_comportamiento WHERE dia_semana = 0 AND franja_horaria = 0 AND tercio_mes = 1
                    GROUP BY modelo_id, modelo_version ORDER BY fecha_carga DESC`),""")
    s = rep(s, """      FROM core_metricas_esperadas
      WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')
        AND estado_prediccion = 'ACTIVA' AND (?1 IS NULL OR cliente_id = ?1) AND (?2 IS NULL OR servicio_id = ?2)`).bind(cli, srv),""",
               """      FROM perfil_comportamiento
      -- un día como hoy: mismo día de la semana y mismo tercio del mes (hora de Argentina), las 96 franjas
      WHERE dia_semana = (SELECT CAST(strftime('%w', COALESCE(ahora, 'now'), '-3 hours') AS INTEGER) FROM alerta_parametros WHERE id = 1)
        AND tercio_mes = (SELECT CASE WHEN CAST(strftime('%d', COALESCE(ahora, 'now'), '-3 hours') AS INTEGER) <= 10 THEN 1
                                      WHEN CAST(strftime('%d', COALESCE(ahora, 'now'), '-3 hours') AS INTEGER) <= 20 THEN 2 ELSE 3 END
                          FROM alerta_parametros WHERE id = 1)
        AND (?1 IS NULL OR cliente_id = ?1) AND (?2 IS NULL OR servicio_id = ?2)`).bind(cli, srv),""")
    assert 'core_metricas_esperadas' not in s, s[s.index('core_metricas_esperadas') - 300:s.index('core_metricas_esperadas') + 100]
    s = rep(s, '// NULL = hereda del nivel de arriba. Las vistas v_alertas_* y v_prealertas toman el valor',
               '// NULL = hereda del nivel de arriba. El motor (SQL_ALERTAS_*, SQL_PREALERTAS) y las reglas personalizadas toman el valor')
    codigo = '\n'.join(l for l in s.split('\n') if not l.lstrip().startswith(('//', '--')))
    for v in ('v_alertas', 'v_comparacion', 'v_prealertas', 'v_incidentes', 'v_prediccion_vigente'):
        assert not re.search(r'\b' + v + r'\b', codigo), v

    i = s.index('const ADMIN_HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const ADMIN_HTML = '):j])
    h = rep(h, """        <li>Toma los últimos 7 días de datos observados, sin las ventanas que tuvieron alertas.</li>
        <li>Para cada cliente, servicio y canal calcula, por franja de 15 minutos del día, el valor normal y la banda de mínimo y máximo.</li>
        <li>Con eso genera las predicciones de las próximas 48 horas. Se reentrena una vez por día.</li>
        <li>Las reglas (del sistema y personalizadas) comparan cada ventana observada contra esa predicción.</li>""",
               """        <li>Se entrena fuera del sistema con 12 meses de historia, sin los feriados. Usa medianas y percentiles, así los incidentes del pasado no lo desvían.</li>
        <li>Para cada cliente, servicio y canal calcula el valor normal y la banda de mínimo y máximo según el día de la semana, la franja de 15 minutos y la parte del mes (días 1 a 10, 11 a 20 y 21 a fin de mes).</li>
        <li>Un feriado se compara contra lo que se espera un domingo.</li>
        <li>Las reglas (del sistema y personalizadas) comparan cada ventana observada contra ese perfil. Se vuelve a entrenar cada tanto (por ejemplo, una vez por mes) con la historia nueva.</li>""")
    h = rep(h, """      if (m) {
        var horas = Math.round((new Date(m.hasta) - new Date(m.desde)) / 36e5 + 0.25);
        f.push(['Modelo', esc(String(m.modelo_id).replace(/_/g, ' ')), 'Versión ' + esc(m.modelo_version) + ' · origen ' + esc(String(m.origen_prediccion || '').toLowerCase().replace(/_/g, ' '))]);
        f.push(['Último entrenamiento', esc(corta(m.ultima_generacion)), esc(hace(m.ultima_generacion)) + ' · ' + esc(fechaHora(m.ultima_generacion))]);
        f.push(['Predicciones', esc(corta(m.desde)) + ' → ' + esc(corta(m.hasta)), horas + ' h · ' + Number(m.predicciones).toLocaleString('es-AR') + ' ventanas de ' + m.series + ' series']);
      } else {
        f.push(['Modelo', 'Sin predicciones activas', 'Hay que correr el entrenamiento']);
      }""", """      if (m) {
        f.push(['Modelo', 'Perfil de comportamiento', 'Versión ' + esc(m.modelo_version) + ' · día de la semana, franja de 15 minutos y parte del mes']);
        f.push(['Último entrenamiento', esc(corta(m.fecha_carga)), m.entrenado_hasta ? 'Con historia hasta el ' + esc(fechaHora(m.entrenado_hasta)) : esc(hace(m.fecha_carga))]);
        f.push(['Perfil', Number(m.series * 2016).toLocaleString('es-AR') + ' celdas', m.series + ' series × 7 días × 96 franjas × 3 partes del mes']);
      } else {
        f.push(['Modelo', 'Sin perfil cargado', 'Hay que cargar perfil_comportamiento_d1.txt en la consola de D1']);
      }""")
    h = rep(h, "</b> (último día de predicciones):<ul>", "</b> (un día como hoy):<ul>")
    h = rep(h, "'El modelo todavía no tiene predicciones para '", "'El modelo todavía no tiene perfil para '")
    h = rep(h, '<p class="bajada">Solo lectura. Muestra con qué está calculando el modelo los valores esperados, mínimos y máximos.</p>',
               '<p class="bajada">Solo lectura. Muestra contra qué perfil se comparan las ventanas: valores esperados, mínimos y máximos.</p>')
    s = s[:i] + 'const ADMIN_HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]

    # ----- Tablero: "Cliente nuevo" solo si no tiene perfil (alerta SIN_PREDICCION); si sus datos empiezan
    #       después del comienzo de las 24 h (por ejemplo, al arrancar la demo), el resumen dice "desde las HH:MM" -----
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    h = rep(h, "      var nuevo = c.primera > ini + paso;\n",
               "      var parcial = c.primera > ini + paso;   // los datos de este cliente empiezan después del comienzo de las 24 h\n"
               "      var nuevo = parcial && (d.incidentes || []).some(function (i) { return i.cliente_id === id && i.tipo_alerta === 'SIN_PREDICCION'; });\n"
               "      var periodo = parcial ? ' desde las ' + hora(new Date(c.primera).toISOString()) : ' del día';\n")
    h = rep(h, "(pct != null ? 'bien el ' + pctTxt(pct) + ' % del día' : '')", "(pct != null ? 'bien el ' + pctTxt(pct) + ' %' + periodo : '')")
    h = rep(h, "(pct == null ? 'Sin datos' : pct === 100 ? 'Todo el día bien' : 'Bien el ' + pctTxt(pct) + ' % del día')",
               "(pct == null ? 'Sin datos' : pct === 100 ? (parcial ? 'Todo bien' + periodo : 'Todo el día bien') : 'Bien el ' + pctTxt(pct) + ' %' + periodo)")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
