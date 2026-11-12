-- =====================================================================
-- HELIOS · Modelo de comportamiento esperado v2: PERFIL POR DÍA DE LA SEMANA, FRANJA HORARIA Y TERCIO DEL MES
-- Se corre FUERA de D1 (PostgreSQL 13+), sobre el histórico completo, y produce:
--   1. calendario            : cada fecha con su día de la semana, si es día hábil o feriado, su número de día hábil y su tercio del mes.
--   2. perfil_comportamiento : lo esperado y su banda por serie × día de la semana × franja horaria de 15 min × tercio del mes.
--   3. Las sentencias INSERT para subir los dos a D1 (paso 4).
--
-- Entradas:
--   historico_metricas = mismas columnas que core_metricas_observadas, con todo el histórico (12 meses recomendados).
--   feriados(fecha DATE, nombre TEXT) = feriados nacionales y no laborables del período (misma fuente que D1).
--   (Paso 0: crear y cargar las dos tablas desde los CSV.)
--
-- Definiciones:
--   - Fecha y franja horaria en hora de Argentina (America/Argentina/Buenos_Aires). franja_horaria = 0..95 (00:00 = 0, 00:15 = 1, ...).
--   - dia_semana: 0 = domingo ... 6 = sábado (igual que strftime('%w') en SQLite/D1).
--   - Día hábil: lunes a viernes que no es feriado. numero_dia_habil = número de día hábil dentro del mes (1, 2, ...).
--     Sábados, domingos y feriados toman el número del último día hábil anterior (0 si el mes todavía no tuvo hábiles).
--   - tercio_mes: tercio del mes por día del CALENDARIO: 1 = días 1 a 10, 2 = días 11 a 20, 3 = día 21 a fin de mes.
--     (El día de la semana ya separa hábiles de fines de semana; el tercio solo marca la parte del mes. Decisión del 11/11/2026:
--      por calendario queda balanceado, 8 a 11 días por tercio, mientras que por día hábil el tercio 3 tenía 0 a 3 días por mes.)
--     numero_dia_habil se guarda igual en calendario, por si más adelante algún servicio necesita tramos por día hábil.
--   - Los feriados NO entrenan el perfil: en D1, un feriado se compara contra el perfil del domingo
--     (o se silencia, si el servicio lo tiene configurado).
--   - Cada celda necesita al menos 6 muestras (con 12 meses tiene ~17). Si no las tiene, usa la celda sin tercio (día × franja horaria).
--     La columna nivel_perfil dice cuál se usó: TERCIO o DIA_FRANJA.
--
-- Cómo se calcula cada valor (robusto a incidentes: medianas y percentiles, no promedios):
--   tráfico    esperado = mediana;  mínimo = el menor entre esperado × 0,85 y el percentil 5;  máximo = el mayor entre esperado × 1,15 y el percentil 95
--   importe    esperado = mediana;  mínimo = menor entre esperado × 0,75 y p5;  máximo = mayor entre esperado × 1,20 y p95
--   aprobación esperado = Σ éxitos / Σ total;  mínimo = menor entre esperado − 0,035 y el p5 de la tasa
--   rechazo    esperado = Σ rechazos / Σ total; máximo = mayor entre esperado + 0,03 y el p95
--   error      esperado = Σ errores / Σ total;  máximo = mayor entre esperado + 0,015 y el p95
--   latencia   esperado = mediana;  máximo = mayor entre esperado × 1,15 y p95
--   Es decir: la banda nunca es más angosta que la del modelo actual y se ensancha donde el histórico es más variable.
--   Las tasas solo usan ventanas con al menos 20 operaciones (volumen mínimo).
-- =====================================================================

-- ---------- 0. Tablas de entrada y carga de los CSV ----------
DROP TABLE IF EXISTS historico_metricas;
CREATE TABLE historico_metricas (
    metrica_id TEXT PRIMARY KEY, ventana_inicio TIMESTAMPTZ NOT NULL, ventana_fin TIMESTAMPTZ NOT NULL, duracion_ventana_minutos INT NOT NULL,
    ambiente TEXT NOT NULL, cliente_id TEXT NOT NULL, servicio_id TEXT NOT NULL, producto_id TEXT NOT NULL, canal_id TEXT NOT NULL, moneda_id TEXT NOT NULL,
    cantidad_total INT NOT NULL, cantidad_exitos INT NOT NULL, cantidad_rechazos INT NOT NULL, cantidad_errores INT NOT NULL,
    tasa_aprobacion NUMERIC, tasa_rechazo NUMERIC, tasa_error NUMERIC,
    importe_total NUMERIC, importe_promedio NUMERIC, tiempo_respuesta_promedio NUMERIC, tiempo_respuesta_maximo NUMERIC,
    origen_dato TEXT, fecha_recepcion TIMESTAMPTZ);
-- psql: \copy historico_metricas FROM 'historico_metricas_demo.csv' WITH (FORMAT csv, HEADER true)
DROP TABLE IF EXISTS feriados;
CREATE TABLE feriados (fecha DATE PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT);
-- psql: \copy feriados FROM 'feriados.csv' WITH (FORMAT csv, HEADER true)
-- (El resto del script asume las dos tablas ya cargadas.)

-- ---------- 1. Calendario (del primer mes del histórico hasta fin del último año con feriados) ----------
DROP TABLE IF EXISTS calendario;
CREATE TABLE calendario AS
WITH limites_fechas AS (
    SELECT date_trunc('month', MIN(ventana_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires'))::date AS desde,
           -- hasta fin del último año que tiene feriados cargados (sin feriados es_feriado y numero_dia_habil saldrían mal);
           -- los años siguientes los arma el Worker en D1 cuando trae los feriados de la API
           (SELECT (date_trunc('year', MAX(fecha)) + INTERVAL '1 year' - INTERVAL '1 day')::date FROM feriados) AS hasta
    FROM historico_metricas
),
dias AS (
    SELECT d::date AS fecha,
           EXTRACT(DOW FROM d)::int AS dia_semana,
           (f.fecha IS NOT NULL) AS es_feriado,
           (EXTRACT(ISODOW FROM d) <= 5 AND f.fecha IS NULL) AS es_dia_habil
    FROM limites_fechas, generate_series(limites_fechas.desde, limites_fechas.hasta, INTERVAL '1 day') AS d
    LEFT JOIN feriados f ON f.fecha = d::date
)
SELECT fecha, dia_semana, es_feriado, es_dia_habil,
       SUM(CASE WHEN es_dia_habil THEN 1 ELSE 0 END) OVER (PARTITION BY date_trunc('month', fecha) ORDER BY fecha) AS numero_dia_habil,
       CASE WHEN EXTRACT(DAY FROM fecha) <= 10 THEN 1 WHEN EXTRACT(DAY FROM fecha) <= 20 THEN 2 ELSE 3 END AS tercio_mes
FROM dias;
ALTER TABLE calendario ADD PRIMARY KEY (fecha);

-- ---------- 2. Perfil ----------
-- 2a. Estadísticas por celda. tercio_mes = 0 es la celda sin tercio (día × franja horaria), que sirve de respaldo.
DROP TABLE IF EXISTS perfil_celdas_calculo;
CREATE TEMP TABLE perfil_celdas_calculo AS
WITH observaciones AS (
    SELECT h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id, h.duracion_ventana_minutos,
           c.dia_semana, c.tercio_mes,
           (EXTRACT(HOUR FROM h.ventana_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires') * 60
            + EXTRACT(MINUTE FROM h.ventana_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int / 15 AS franja_horaria,
           h.cantidad_total, h.cantidad_exitos, h.cantidad_rechazos, h.cantidad_errores, h.importe_total, h.tiempo_respuesta_promedio,
           CASE WHEN h.cantidad_total >= 20 THEN h.cantidad_exitos::numeric / h.cantidad_total END AS tasa_aprobacion_ventana,
           CASE WHEN h.cantidad_total >= 20 THEN h.cantidad_rechazos::numeric / h.cantidad_total END AS tasa_rechazo_ventana,
           CASE WHEN h.cantidad_total >= 20 THEN h.cantidad_errores::numeric / h.cantidad_total END AS tasa_error_ventana
    FROM historico_metricas h
    JOIN calendario c ON c.fecha = (h.ventana_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
    WHERE NOT c.es_feriado                       -- los feriados no entrenan
)
SELECT ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos,
       dia_semana, franja_horaria, CASE WHEN GROUPING(tercio_mes) = 1 THEN 0 ELSE tercio_mes END AS tercio_mes,
       COUNT(*) AS muestras,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY cantidad_total) AS volumen_mediana,
       percentile_cont(0.05) WITHIN GROUP (ORDER BY cantidad_total) AS volumen_percentil_05,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY cantidad_total) AS volumen_percentil_95,
       SUM(cantidad_exitos)::numeric / NULLIF(SUM(cantidad_total), 0) AS aprobacion_esperada,
       percentile_cont(0.05) WITHIN GROUP (ORDER BY tasa_aprobacion_ventana) AS aprobacion_percentil_05,
       SUM(cantidad_rechazos)::numeric / NULLIF(SUM(cantidad_total), 0) AS rechazo_esperado,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY tasa_rechazo_ventana) AS rechazo_percentil_95,
       SUM(cantidad_errores)::numeric / NULLIF(SUM(cantidad_total), 0) AS error_esperado,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY tasa_error_ventana) AS error_percentil_95,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY importe_total) AS importe_mediana,
       percentile_cont(0.05) WITHIN GROUP (ORDER BY importe_total) AS importe_percentil_05,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY importe_total) AS importe_percentil_95,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY tiempo_respuesta_promedio) AS latencia_mediana,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY tiempo_respuesta_promedio) AS latencia_percentil_95
FROM observaciones
GROUP BY GROUPING SETS (
    (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana, franja_horaria, tercio_mes),
    (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana, franja_horaria));
CREATE INDEX ON perfil_celdas_calculo (cliente_id, servicio_id, canal_id, dia_semana, franja_horaria, tercio_mes);

-- 2b. Una fila por serie × día × franja horaria × tercio (1, 2, 3). Si la celda con su tercio tiene menos de 6 muestras,
--     se usa la de respaldo (día × franja_horaria) y queda marcada con nivel_perfil = 'DIA_FRANJA'.
DROP TABLE IF EXISTS perfil_comportamiento;
CREATE TABLE perfil_comportamiento AS
SELECT r.ambiente, r.cliente_id, r.servicio_id, r.producto_id, r.canal_id, r.moneda_id, r.duracion_ventana_minutos,
       r.dia_semana, r.franja_horaria, t.tercio_mes, x.nivel_perfil, x.muestras,
       ROUND(x.volumen_mediana::numeric, 2)                                              AS cantidad_total_esperada,
       ROUND(LEAST(x.volumen_mediana * 0.85, x.volumen_percentil_05)::numeric, 2)                     AS cantidad_total_minima,
       ROUND(GREATEST(x.volumen_mediana * 1.15, x.volumen_percentil_95)::numeric, 2)                  AS cantidad_total_maxima,
       ROUND(x.aprobacion_esperada, 6)                                                     AS tasa_aprobacion_esperada,
       ROUND(GREATEST(0, LEAST(x.aprobacion_esperada - 0.035, COALESCE(x.aprobacion_percentil_05::numeric, 1))), 6) AS tasa_aprobacion_minima,
       ROUND(x.rechazo_esperado, 6)                                                      AS tasa_rechazo_esperada,
       ROUND(LEAST(1, GREATEST(x.rechazo_esperado + 0.03, COALESCE(x.rechazo_percentil_95::numeric, 0))), 6) AS tasa_rechazo_maxima,
       ROUND(x.error_esperado, 6)                                                       AS tasa_error_esperada,
       ROUND(LEAST(1, GREATEST(x.error_esperado + 0.015, COALESCE(x.error_percentil_95::numeric, 0))), 6) AS tasa_error_maxima,
       ROUND(x.importe_mediana::numeric, 2)                                              AS importe_total_esperado,
       ROUND(LEAST(x.importe_mediana * 0.75, x.importe_percentil_05)::numeric, 2)                     AS importe_total_minimo,
       ROUND(GREATEST(x.importe_mediana * 1.20, x.importe_percentil_95)::numeric, 2)                  AS importe_total_maximo,
       ROUND(x.latencia_mediana::numeric, 2)                                              AS tiempo_respuesta_esperado,
       ROUND(GREATEST(x.latencia_mediana * 1.15, x.latencia_percentil_95)::numeric, 2)                  AS tiempo_respuesta_maximo,
       'PERFIL_DIA_FRANJA_TERCIO_MES'::text AS modelo_id, '2'::text AS modelo_version,
       (SELECT MAX(ventana_inicio) FROM historico_metricas) AS entrenado_hasta
FROM perfil_celdas_calculo r
CROSS JOIN (VALUES (1), (2), (3)) AS t(tercio_mes)
CROSS JOIN LATERAL (
    -- 1º la celda de su tercio; si no tiene 6 muestras, la de respaldo (día × franja horaria)
    SELECT 1 AS prioridad, 'TERCIO'::text AS nivel_perfil, c.*
    FROM perfil_celdas_calculo c
    WHERE c.tercio_mes = t.tercio_mes AND c.muestras >= 6
      AND c.dia_semana = r.dia_semana AND c.franja_horaria = r.franja_horaria
      AND c.cliente_id = r.cliente_id AND c.servicio_id = r.servicio_id AND c.canal_id = r.canal_id
      AND c.ambiente = r.ambiente AND c.producto_id = r.producto_id AND c.moneda_id = r.moneda_id
      AND c.duracion_ventana_minutos = r.duracion_ventana_minutos
    UNION ALL
    SELECT 2, 'DIA_FRANJA'::text, r.*
    ORDER BY 1
    LIMIT 1
) AS x
WHERE r.tercio_mes = 0;
ALTER TABLE perfil_comportamiento ADD PRIMARY KEY (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana, franja_horaria, tercio_mes);

-- ---------- 3. Controles (2.016 celdas por serie: 7 días × 96 franjas × 3 tercios) ----------
SELECT cliente_id, servicio_id, canal_id, COUNT(*) AS celdas, SUM(CASE WHEN nivel_perfil = 'TERCIO' THEN 1 ELSE 0 END) AS con_tercio,
       SUM(CASE WHEN nivel_perfil = 'DIA_FRANJA' THEN 1 ELSE 0 END) AS respaldo,
       MIN(muestras) AS muestras_min, ROUND(AVG(muestras), 1) AS muestras_prom
FROM perfil_comportamiento GROUP BY cliente_id, servicio_id, canal_id ORDER BY 1, 2, 3;

-- ---------- 4. Sentencias para la consola de D1 ----------
-- Una línea por serie y día de la semana (288 filas, ~80 KB: debajo del máximo de 100 KB por sentencia de D1).
-- Correr con salida sin formato para que cada fila sea una sentencia lista, por ejemplo:
--   psql -At -f perfil_comportamiento_postgres.sql -o perfil_comportamiento_d1.sql
-- (o exportar el resultado de estas dos consultas desde el cliente SQL que usen) y pegar cada línea en la consola de D1
-- después de crear las tablas (bloques de CREATE de perfil_comportamiento_d1.txt). 13 series = 91 líneas de perfil + 2 de calendario.
SELECT 'INSERT OR REPLACE INTO perfil_comportamiento (ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, '
    || 'dia_semana, franja_horaria, tercio_mes, nivel_perfil, muestras, cantidad_total_esperada, cantidad_total_minima, cantidad_total_maxima, '
    || 'tasa_aprobacion_esperada, tasa_aprobacion_minima, tasa_rechazo_esperada, tasa_rechazo_maxima, tasa_error_esperada, tasa_error_maxima, '
    || 'importe_total_esperado, importe_total_minimo, importe_total_maximo, tiempo_respuesta_esperado, tiempo_respuesta_maximo, '
    || 'modelo_id, modelo_version, entrenado_hasta) VALUES '
    || string_agg(format('(%L,%L,%L,%L,%L,%L,%s,%s,%s,%s,%L,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%L,%L,%L)',
         ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana, franja_horaria, tercio_mes, nivel_perfil, muestras,
         cantidad_total_esperada, cantidad_total_minima, cantidad_total_maxima,
         COALESCE(tasa_aprobacion_esperada::text, 'NULL'), COALESCE(tasa_aprobacion_minima::text, 'NULL'),
         COALESCE(tasa_rechazo_esperada::text, 'NULL'), COALESCE(tasa_rechazo_maxima::text, 'NULL'),
         COALESCE(tasa_error_esperada::text, 'NULL'), COALESCE(tasa_error_maxima::text, 'NULL'),
         COALESCE(importe_total_esperado::text, 'NULL'), COALESCE(importe_total_minimo::text, 'NULL'), COALESCE(importe_total_maximo::text, 'NULL'),
         COALESCE(tiempo_respuesta_esperado::text, 'NULL'), COALESCE(tiempo_respuesta_maximo::text, 'NULL'),
         modelo_id, modelo_version, to_char(entrenado_hasta AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), ',' ORDER BY franja_horaria, tercio_mes)
    || ';' AS sentencia_d1
FROM perfil_comportamiento
GROUP BY ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos, dia_semana
ORDER BY cliente_id, servicio_id, canal_id, dia_semana;

-- Calendario: una línea por año (2025 y 2026)
SELECT 'INSERT OR REPLACE INTO calendario (fecha, dia_semana, es_feriado, es_dia_habil, numero_dia_habil, tercio_mes) VALUES '
    || string_agg(format('(%L,%s,%s,%s,%s,%s)', fecha, dia_semana, es_feriado::int, es_dia_habil::int, numero_dia_habil, tercio_mes), ',' ORDER BY fecha)
    || ';' AS sentencia_d1
FROM calendario
GROUP BY EXTRACT(YEAR FROM fecha)
ORDER BY EXTRACT(YEAR FROM fecha);
