// =====================================================================
// REGLAS PERSONALIZADAS (tabla alerta_reglas_personalizadas)
//
// Cada regla dice QUÉ mirar (métrica), HACIA DÓNDE (por debajo del mínimo o por
// encima del máximo del modelo), CUÁNTAS ventanas seguidas, DÓNDE (todo, o un
// cliente / servicio / canal) y con qué severidad. Los umbrales salen de la
// predicción del modelo (core_metricas_esperadas), con el ancho de banda y el
// volumen mínimo que el Administrador configuró para ese cliente (umbrales_config).
//
// Registra en alertas_historico con tipo_alerta = 'PERS_<id>' y el mismo
// ON CONFLICT que REGISTRAR, así que el cierre (CERRAR_NORMALIZADAS y
// CERRAR_DESAPARECIDAS), el tablero y Power BI las tratan como a cualquier alerta.
//
// "N ventanas seguidas": se agrupan las ventanas que superan el umbral en tramos
// consecutivos (k = número de ventana desde 1970; isla = k - orden). Cuando un
// tramo llega a N ventanas, se registran todas, así el tablero muestra desde
// cuándo viene el problema.
//
// Lecturas: solo las ventanas observadas del horizonte (por el índice de
// ventana_inicio) y la predicción de cada una por la clave única de esperadas.
// =====================================================================
const REGISTRAR_PERSONALIZADAS = `
INSERT INTO alertas_historico (
    tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id,
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    metrica, severidad, severidad_maxima,
    valor_observado, valor_esperado, umbral, desvio,
    metrica_id, prediccion_id,
    primera_deteccion, ultima_deteccion
)
WITH prm AS (
    SELECT volumen_minimo, horizonte_horas,
           julianday(COALESCE(ahora, 'now')) AS ahora_jd,
           strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora_txt,
           strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now'), '-' || (horizonte_horas + 1) || ' hours') AS desde_txt
    FROM alerta_parametros
    WHERE id = 1
),
c AS (
    SELECT r.id AS regla_id, r.metrica AS regla_metrica, r.direccion, r.ventanas_seguidas, r.severidad,
           o.ambiente, o.cliente_id, o.servicio_id, o.producto_id, o.canal_id, o.moneda_id,
           o.ventana_inicio, o.duracion_ventana_minutos, o.metrica_id, p.prediccion_id,
           CAST(strftime('%s', o.ventana_inicio) AS INTEGER) / (60 * o.duracion_ventana_minutos) AS k,
           CASE r.metrica
               WHEN 'VOLUMEN'    THEN o.cantidad_total
               WHEN 'APROBACION' THEN CASE WHEN o.cantidad_total >= COALESCE(us.volumen_minimo, uc.volumen_minimo, ug.volumen_minimo, prm.volumen_minimo) THEN 1.0 * o.cantidad_exitos / o.cantidad_total END
               WHEN 'RECHAZO'    THEN CASE WHEN o.cantidad_total >= COALESCE(us.volumen_minimo, uc.volumen_minimo, ug.volumen_minimo, prm.volumen_minimo) THEN 1.0 * o.cantidad_rechazos / o.cantidad_total END
               WHEN 'ERROR'      THEN CASE WHEN o.cantidad_total >= COALESCE(us.volumen_minimo, uc.volumen_minimo, ug.volumen_minimo, prm.volumen_minimo) THEN 1.0 * o.cantidad_errores / o.cantidad_total END
               WHEN 'IMPORTE'    THEN o.importe_total
               WHEN 'LATENCIA'   THEN CASE WHEN o.cantidad_total > 0 THEN o.tiempo_respuesta_promedio END
           END AS valor,
           CASE r.metrica
               WHEN 'VOLUMEN'    THEN p.cantidad_total_esperada
               WHEN 'APROBACION' THEN p.tasa_aprobacion_esperada
               WHEN 'RECHAZO'    THEN p.tasa_rechazo_esperada
               WHEN 'ERROR'      THEN p.tasa_error_esperada
               WHEN 'IMPORTE'    THEN p.importe_total_esperado
               WHEN 'LATENCIA'   THEN p.tiempo_respuesta_esperado
           END AS esperado,
           CASE r.metrica || '_' || r.direccion
               WHEN 'VOLUMEN_BAJO'    THEN p.cantidad_total_minima
               WHEN 'VOLUMEN_ALTO'    THEN p.cantidad_total_maxima
               WHEN 'APROBACION_BAJO' THEN p.tasa_aprobacion_minima
               WHEN 'RECHAZO_ALTO'    THEN p.tasa_rechazo_maxima
               WHEN 'ERROR_ALTO'      THEN p.tasa_error_maxima
               WHEN 'IMPORTE_BAJO'    THEN p.importe_total_minimo
               WHEN 'IMPORTE_ALTO'    THEN p.importe_total_maximo
               WHEN 'LATENCIA_ALTO'   THEN p.tiempo_respuesta_maximo
           END AS umbral_modelo,
           CASE r.metrica
               WHEN 'VOLUMEN'    THEN COALESCE(us.banda_volumen, uc.banda_volumen, ug.banda_volumen, 1.0)
               WHEN 'IMPORTE'    THEN COALESCE(us.banda_importe, uc.banda_importe, ug.banda_importe, 1.0)
               WHEN 'LATENCIA'   THEN COALESCE(us.banda_latencia, uc.banda_latencia, ug.banda_latencia, 1.0)
               ELSE COALESCE(us.banda_tasas, uc.banda_tasas, ug.banda_tasas, 1.0)
           END AS factor_banda
    FROM prm
    JOIN core_metricas_observadas o
      ON o.ventana_inicio >= prm.desde_txt
    JOIN core_metricas_esperadas p
      ON p.ventana_inicio           = strftime('%Y-%m-%dT%H:%M:%fZ', o.ventana_inicio)
     AND p.duracion_ventana_minutos = o.duracion_ventana_minutos
     AND p.ambiente                 = o.ambiente
     AND p.cliente_id               = o.cliente_id
     AND p.servicio_id              = o.servicio_id
     AND p.producto_id              = o.producto_id
     AND p.canal_id                 = o.canal_id
     AND p.moneda_id                = o.moneda_id
     AND p.estado_prediccion        = 'ACTIVA'
    JOIN alerta_reglas_personalizadas r
      ON r.activa = 1
     AND (r.cliente_id  IS NULL OR r.cliente_id  = o.cliente_id)
     AND (r.servicio_id IS NULL OR r.servicio_id = o.servicio_id)
     AND (r.canal_id    IS NULL OR r.canal_id    = o.canal_id)
    LEFT JOIN umbrales_config ug ON ug.cliente_id = '*' AND ug.servicio_id = '*'
    LEFT JOIN umbrales_config uc ON uc.cliente_id = o.cliente_id AND uc.servicio_id = '*'
    LEFT JOIN umbrales_config us ON us.cliente_id = o.cliente_id AND us.servicio_id = o.servicio_id
    -- feriado (fecha local) en un servicio con "silenciar alertas en feriados": no se evalúa
    LEFT JOIN feriados fe ON fe.fecha = date(o.ventana_inicio, '-3 hours')
    WHERE julianday(o.ventana_fin) >  prm.ahora_jd - prm.horizonte_horas / 24.0
      AND NOT (fe.fecha IS NOT NULL AND COALESCE(us.silenciar_feriados, uc.silenciar_feriados, ug.silenciar_feriados, 0) = 1)
      AND julianday(o.ventana_fin) <= prm.ahora_jd
      -- si el modelo generó más de una predicción para la ventana, vale la última
      AND NOT EXISTS (
            SELECT 1
            FROM core_metricas_esperadas p2
            WHERE p2.ventana_inicio           = p.ventana_inicio
              AND p2.duracion_ventana_minutos = p.duracion_ventana_minutos
              AND p2.ambiente                 = p.ambiente
              AND p2.cliente_id               = p.cliente_id
              AND p2.servicio_id              = p.servicio_id
              AND p2.producto_id              = p.producto_id
              AND p2.canal_id                 = p.canal_id
              AND p2.moneda_id                = p.moneda_id
              AND p2.estado_prediccion        = 'ACTIVA'
              AND (p2.fecha_generacion > p.fecha_generacion
                   OR (p2.fecha_generacion = p.fecha_generacion AND p2.modelo_version > p.modelo_version))
      )
),
-- límite con la banda ajustada: esperado + factor x (límite del modelo - esperado); con factor 1, el del modelo
cu AS (
    SELECT c.*,
           CASE WHEN c.factor_banda = 1 OR c.esperado IS NULL THEN c.umbral_modelo
                ELSE c.esperado + c.factor_banda * (c.umbral_modelo - c.esperado) END AS umbral
    FROM c
),
b AS (
    SELECT c.*,
           c.k - ROW_NUMBER() OVER (
               PARTITION BY c.regla_id, c.ambiente, c.cliente_id, c.servicio_id, c.producto_id, c.canal_id, c.moneda_id, c.duracion_ventana_minutos
               ORDER BY c.k) AS isla
    FROM cu c
    WHERE c.valor IS NOT NULL
      AND c.umbral IS NOT NULL
      AND ((c.direccion = 'BAJO' AND c.valor < c.umbral) OR (c.direccion = 'ALTO' AND c.valor > c.umbral))
),
f AS (
    SELECT b.*,
           COUNT(*) OVER (
               PARTITION BY b.regla_id, b.ambiente, b.cliente_id, b.servicio_id, b.producto_id, b.canal_id, b.moneda_id, b.duracion_ventana_minutos, b.isla
           ) AS largo
    FROM b
)
SELECT
    'PERS_' || f.regla_id,
    f.ambiente, f.cliente_id, f.servicio_id, f.producto_id, f.canal_id, f.moneda_id,
    strftime('%Y-%m-%dT%H:%M:%SZ', f.ventana_inicio),
    strftime('%Y-%m-%dT%H:%M:%SZ', f.ventana_inicio, '+' || f.duracion_ventana_minutos || ' minutes'),
    f.duracion_ventana_minutos,
    CASE f.regla_metrica
        WHEN 'VOLUMEN'    THEN 'cantidad_total'
        WHEN 'APROBACION' THEN 'tasa_aprobacion'
        WHEN 'RECHAZO'    THEN 'tasa_rechazo'
        WHEN 'ERROR'      THEN 'tasa_error'
        WHEN 'IMPORTE'    THEN 'importe_total'
        ELSE 'tiempo_respuesta_promedio'
    END,
    f.severidad, f.severidad,
    CASE WHEN f.regla_metrica IN ('APROBACION', 'RECHAZO', 'ERROR') THEN ROUND(f.valor, 4) ELSE f.valor END,
    f.esperado,
    f.umbral,
    CASE WHEN f.regla_metrica IN ('APROBACION', 'RECHAZO', 'ERROR') THEN ROUND(f.valor - f.esperado, 4)
         ELSE ROUND((f.valor - f.esperado) / NULLIF(f.esperado, 0), 4) END,
    f.metrica_id, f.prediccion_id,
    prm.ahora_txt, prm.ahora_txt
FROM f
CROSS JOIN prm
WHERE f.largo >= f.ventanas_seguidas
`;
// Mismo ON CONFLICT que REGISTRAR (actualiza, sube severidad máxima y reabre si correspondía)
const REGISTRAR_PERSONALIZADAS_SQL = REGISTRAR_PERSONALIZADAS + REGISTRAR.slice(REGISTRAR.indexOf('ON CONFLICT ('));

// Nombres de las reglas personalizadas para el tablero
const Q_REGLAS_PERSONALIZADAS = `SELECT id, nombre, metrica, direccion, severidad, activa FROM alerta_reglas_personalizadas ORDER BY id`;
