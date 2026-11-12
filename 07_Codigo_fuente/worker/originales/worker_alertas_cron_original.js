// =====================================================================
// Worker de alertas - DEMO DE MONITOREO (Cloudflare D1)
//
// Hace dos cosas:
//   1. Cron Trigger: ejecuta el proceso de alertas (alertas_d1_proceso.sql)
//      y actualiza alertas_historico.
//   2. Dashboard: al abrir la URL del Worker muestra el tablero de alertas
//      y la predicción (vista v_prealertas: métricas que vienen empeorando).
//
// Rutas:
//   GET  /                               dashboard
//   GET  /api/dashboard                  datos del dashboard (JSON)
//   POST /api/procesar   o  GET /procesar ejecuta el proceso en el momento
//   POST /api/alertas/<id>/reconocer     reconoce una alerta
//   POST /api/alertas/<id>/resolver      resuelve una alerta a mano
//
// Configuración: binding de D1 llamado "DB" y un Cron Trigger
// (con ventanas de 15 minutos: 5-59/15 * * * *).
//
// IMPORTANTE: el SQL de abajo es copia de alertas_d1_proceso.sql y de
// alertas_d1_consultas.sql. Si se cambian, hay que regenerar este archivo.
// =====================================================================

const REGISTRAR = `
INSERT INTO alertas_historico (
    tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id,
    ventana_inicio, ventana_fin, duracion_ventana_minutos,
    metrica, severidad, severidad_maxima,
    valor_observado, valor_esperado, umbral, desvio,
    metrica_id, prediccion_id,
    primera_deteccion, ultima_deteccion
)
SELECT
    a.tipo_alerta, a.ambiente, a.cliente_id, a.servicio_id, a.producto_id, a.canal_id, a.moneda_id,
    strftime('%Y-%m-%dT%H:%M:%SZ', a.ventana_inicio),
    strftime('%Y-%m-%dT%H:%M:%SZ', a.ventana_inicio, '+' || a.duracion_ventana_minutos || ' minutes'),
    a.duracion_ventana_minutos,
    a.metrica, a.severidad, a.severidad,
    a.valor_observado, a.valor_esperado, a.umbral, a.desvio,
    a.metrica_id, a.prediccion_id,
    t.ahora, t.ahora
FROM v_alertas a
CROSS JOIN (
    SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora
    FROM alerta_parametros
    WHERE id = 1
) t
WHERE 1 = 1   -- requerido por SQLite para usar ON CONFLICT después de un SELECT
ON CONFLICT (
    tipo_alerta, ventana_inicio, duracion_ventana_minutos,
    ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id
)
DO UPDATE SET
    severidad            = excluded.severidad,
    severidad_maxima     = CASE
                               WHEN (CASE excluded.severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END)
                                  < (CASE alertas_historico.severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END)
                               THEN excluded.severidad
                               ELSE alertas_historico.severidad_maxima
                           END,
    valor_observado      = excluded.valor_observado,
    valor_esperado       = excluded.valor_esperado,
    umbral               = excluded.umbral,
    desvio               = excluded.desvio,
    metrica_id           = excluded.metrica_id,
    prediccion_id        = excluded.prediccion_id,
    ultima_deteccion     = excluded.ultima_deteccion,
    cantidad_detecciones = alertas_historico.cantidad_detecciones + 1,
    -- Reapertura: solo si se cerró porque la condición había desaparecido.
    -- Las resueltas a mano o por normalización no se reabren.
    cantidad_reaperturas = alertas_historico.cantidad_reaperturas
                           + CASE WHEN alertas_historico.motivo_resolucion = 'CONDICION_DESAPARECIDA' THEN 1 ELSE 0 END,
    estado               = CASE WHEN alertas_historico.motivo_resolucion = 'CONDICION_DESAPARECIDA'
                                THEN 'ABIERTA' ELSE alertas_historico.estado END,
    fecha_resolucion     = CASE WHEN alertas_historico.motivo_resolucion = 'CONDICION_DESAPARECIDA'
                                THEN NULL ELSE alertas_historico.fecha_resolucion END,
    resuelta_por         = CASE WHEN alertas_historico.motivo_resolucion = 'CONDICION_DESAPARECIDA'
                                THEN NULL ELSE alertas_historico.resuelta_por END,
    motivo_resolucion    = CASE WHEN alertas_historico.motivo_resolucion = 'CONDICION_DESAPARECIDA'
                                THEN NULL ELSE alertas_historico.motivo_resolucion END
`;

const CERRAR_NORMALIZADAS = `
UPDATE alertas_historico
SET estado            = 'RESUELTA',
    motivo_resolucion = 'NORMALIZADA',
    resuelta_por      = 'SISTEMA',
    -- Es la hora del hecho (fin de la ventana normal), no la de la corrida:
    -- en una carga histórica puede ser anterior a la detección, y así la
    -- duración del incidente refleja lo que realmente duró el problema.
    fecha_resolucion  = (
        SELECT MIN(strftime('%Y-%m-%dT%H:%M:%SZ', o.ventana_fin))
        FROM core_metricas_observadas o
        WHERE o.ambiente                 = alertas_historico.ambiente
          AND o.cliente_id               = alertas_historico.cliente_id
          AND o.servicio_id              = alertas_historico.servicio_id
          AND o.producto_id              = alertas_historico.producto_id
          AND o.canal_id                 = alertas_historico.canal_id
          AND o.moneda_id                = alertas_historico.moneda_id
          AND o.duracion_ventana_minutos = alertas_historico.duracion_ventana_minutos
          AND julianday(o.ventana_inicio) > julianday(alertas_historico.ventana_inicio)
          AND julianday(o.ventana_fin) <= (SELECT julianday(COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
          AND NOT EXISTS (
                SELECT 1
                FROM alertas_historico h2
                WHERE h2.tipo_alerta              = alertas_historico.tipo_alerta
                  AND h2.ambiente                 = o.ambiente
                  AND h2.cliente_id               = o.cliente_id
                  AND h2.servicio_id              = o.servicio_id
                  AND h2.producto_id              = o.producto_id
                  AND h2.canal_id                 = o.canal_id
                  AND h2.moneda_id                = o.moneda_id
                  AND h2.duracion_ventana_minutos = o.duracion_ventana_minutos
                  AND h2.ventana_inicio           = strftime('%Y-%m-%dT%H:%M:%SZ', o.ventana_inicio)
          )
    )
WHERE estado IN ('ABIERTA', 'RECONOCIDA')
  AND EXISTS (
        SELECT 1
        FROM core_metricas_observadas o
        WHERE o.ambiente                 = alertas_historico.ambiente
          AND o.cliente_id               = alertas_historico.cliente_id
          AND o.servicio_id              = alertas_historico.servicio_id
          AND o.producto_id              = alertas_historico.producto_id
          AND o.canal_id                 = alertas_historico.canal_id
          AND o.moneda_id                = alertas_historico.moneda_id
          AND o.duracion_ventana_minutos = alertas_historico.duracion_ventana_minutos
          AND julianday(o.ventana_inicio) > julianday(alertas_historico.ventana_inicio)
          AND julianday(o.ventana_fin) <= (SELECT julianday(COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
          AND NOT EXISTS (
                SELECT 1
                FROM alertas_historico h2
                WHERE h2.tipo_alerta              = alertas_historico.tipo_alerta
                  AND h2.ambiente                 = o.ambiente
                  AND h2.cliente_id               = o.cliente_id
                  AND h2.servicio_id              = o.servicio_id
                  AND h2.producto_id              = o.producto_id
                  AND h2.canal_id                 = o.canal_id
                  AND h2.moneda_id                = o.moneda_id
                  AND h2.duracion_ventana_minutos = o.duracion_ventana_minutos
                  AND h2.ventana_inicio           = strftime('%Y-%m-%dT%H:%M:%SZ', o.ventana_inicio)
          )
  )
`;

const CERRAR_DESAPARECIDAS = `
UPDATE alertas_historico
SET estado            = 'RESUELTA',
    motivo_resolucion = 'CONDICION_DESAPARECIDA',
    resuelta_por      = 'SISTEMA',
    fecha_resolucion  = (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
WHERE estado IN ('ABIERTA', 'RECONOCIDA')
  -- margen de 2 minutos: las alertas vistas en esta corrida tienen ultima_deteccion = ahora,
  -- y los pasos pueden ejecutarse en segundos distintos
  AND ultima_deteccion < (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-2 minutes') FROM alerta_parametros WHERE id = 1)
  AND julianday(ventana_fin) > (SELECT julianday(COALESCE(ahora, 'now')) - horizonte_horas / 24.0 FROM alerta_parametros WHERE id = 1)
`;

const Q_KPIS = `
SELECT
    (SELECT COUNT(*) FROM alertas_historico
      WHERE estado IN ('ABIERTA', 'RECONOCIDA'))                          AS alertas_abiertas,
    (SELECT COUNT(*) FROM alertas_historico
      WHERE estado IN ('ABIERTA', 'RECONOCIDA') AND severidad = 'CRITICA') AS criticas_abiertas,
    (SELECT COUNT(*) FROM v_incidentes
      WHERE estado_incidente = 'ABIERTO')                                 AS incidentes_en_curso,
    (SELECT COUNT(*) FROM v_incidentes
      WHERE julianday(inicio) >= p.ahora_jd - 1)                          AS incidentes_24h,
    (SELECT ROUND(AVG(duracion_minutos), 1) FROM v_incidentes
      WHERE estado_incidente = 'RESUELTO'
        AND julianday(inicio) >= p.ahora_jd - 7)                          AS mttr_minutos_7d
FROM (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
      FROM alerta_parametros WHERE id = 1) p
`;

const Q_ABIERTAS = `
SELECT
    h.alerta_id, h.tipo_alerta, h.severidad, h.severidad_maxima, h.estado,
    h.ambiente, h.cliente_id, h.servicio_id, h.producto_id, h.canal_id, h.moneda_id,
    h.ventana_inicio, h.metrica, h.valor_observado, h.valor_esperado, h.desvio,
    h.primera_deteccion,
    ROUND((p.ahora_jd - julianday(h.primera_deteccion)) * 1440) AS minutos_abierta,
    h.reconocida_por
FROM alertas_historico h
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE h.estado IN ('ABIERTA', 'RECONOCIDA')
ORDER BY
    CASE h.severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END,
    h.ventana_inicio DESC
`;

const Q_POR_DIA = `
SELECT
    date(h.ventana_inicio, '-3 hours') AS dia,
    h.severidad_maxima                 AS severidad,
    COUNT(*)                           AS alertas
FROM alertas_historico h
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE julianday(h.ventana_inicio) >= p.ahora_jd - 30
GROUP BY dia, h.severidad_maxima
ORDER BY dia,
    CASE h.severidad_maxima WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END
`;

const Q_INCIDENTES = `
SELECT
    i.tipo_alerta, i.severidad_maxima, i.estado_incidente,
    i.ambiente, i.cliente_id, i.servicio_id, i.producto_id, i.canal_id, i.moneda_id,
    i.inicio, i.ultima_ventana_afectada, i.fecha_resolucion, i.motivo_resolucion,
    i.ventanas_afectadas, i.duracion_minutos
FROM v_incidentes i
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE julianday(i.inicio) >= p.ahora_jd - 7
ORDER BY (i.estado_incidente = 'ABIERTO') DESC, i.duracion_minutos DESC
`;

const Q_MTTR = `
SELECT
    i.tipo_alerta,
    COUNT(*)                          AS incidentes_resueltos,
    ROUND(AVG(i.duracion_minutos), 1) AS mttr_minutos,
    MAX(i.duracion_minutos)           AS duracion_maxima_minutos
FROM v_incidentes i
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE i.estado_incidente = 'RESUELTO'
  AND julianday(i.inicio) >= p.ahora_jd - 30
GROUP BY i.tipo_alerta
ORDER BY mttr_minutos DESC
`;

const Q_CLIENTES = `
SELECT
    i.ambiente, i.cliente_id,
    COUNT(*)                                 AS incidentes,
    SUM(i.severidad_maxima = 'CRITICA')      AS criticos,
    SUM(i.estado_incidente = 'ABIERTO')      AS en_curso,
    ROUND(SUM(i.duracion_minutos) / 60.0, 1) AS horas_afectadas
FROM v_incidentes i
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE julianday(i.inicio) >= p.ahora_jd - 30
GROUP BY i.ambiente, i.cliente_id
ORDER BY criticos DESC, incidentes DESC
LIMIT 10
`;

const Q_POR_HORA = `
SELECT
    strftime('%Y-%m-%dT%H:00:00Z', h.ventana_inicio) AS hora,
    h.severidad_maxima                               AS severidad,
    COUNT(*)                                         AS alertas
FROM alertas_historico h
CROSS JOIN (SELECT julianday(COALESCE(ahora, 'now')) AS ahora_jd
            FROM alerta_parametros WHERE id = 1) p
WHERE julianday(h.ventana_inicio) >= p.ahora_jd - 1
GROUP BY hora, h.severidad_maxima
ORDER BY hora
`;

const Q_VIVO = `
SELECT *
FROM v_alertas
WHERE ambiente = 'PROD'
ORDER BY
    CASE severidad WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END,
    ventana_inicio DESC
`;

const Q_PARAMETROS = `
SELECT ahora, horizonte_horas,
       (SELECT COUNT(*) FROM alerta_reglas WHERE activa = 0) AS reglas_inactivas
FROM alerta_parametros
WHERE id = 1
`;

const Q_PREALERTAS = `
SELECT
    tipo_prealerta, tipo_previsto, severidad,
    ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id,
    metrica, inicio, ultima_ventana, ventanas,
    valor_observado, valor_esperado, umbral,
    margen_consumido, margen_consumido_max, minutos_estimados,
    activa, resultado, minutos_anticipacion
FROM v_prealertas
ORDER BY inicio DESC
`;

const Q_SERIES = `
SELECT
    o.ambiente, o.cliente_id, o.servicio_id, o.producto_id, o.canal_id, o.moneda_id,
    COUNT(*)                                             AS ventanas,
    strftime('%Y-%m-%dT%H:%M:%SZ', MAX(o.ventana_fin))   AS ultima_ventana_fin
FROM core_metricas_observadas o
WHERE o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-24 hours')
                           FROM alerta_parametros WHERE id = 1)
  AND julianday(o.ventana_fin) <= (SELECT julianday(COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
GROUP BY o.ambiente, o.cliente_id, o.servicio_id, o.producto_id, o.canal_id, o.moneda_id
ORDER BY o.cliente_id, o.servicio_id, o.canal_id
`;

const RECONOCER = `
UPDATE alertas_historico
SET estado               = 'RECONOCIDA',
    fecha_reconocimiento = (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1),
    reconocida_por       = ?2,
    comentario           = COALESCE(?3, comentario)
WHERE alerta_id = ?1
  AND estado = 'ABIERTA'
`;

const RESOLVER = `
UPDATE alertas_historico
SET estado            = 'RESUELTA',
    motivo_resolucion = 'MANUAL',
    fecha_resolucion  = (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1),
    resuelta_por      = ?2,
    comentario        = COALESCE(?3, comentario)
WHERE alerta_id = ?1
  AND estado IN ('ABIERTA', 'RECONOCIDA')
`;

const HTML = "<!doctype html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>Monitoreo de operaciones</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800&display=swap\" rel=\"stylesheet\">\n<style>\n:root {\n  --bg: #EDF1F0;\n  --panel: #FFFFFF;\n  --ink: #13262E;\n  --ink-2: #4A5D66;\n  --ink-3: #7C8D94;\n  --line: #D5DEDC;\n  --track: #E3EAE8;\n  --accent: #1E5A73;\n  --ok: #23876A;\n  --ok-bg: #E2F2EC;\n  --pre: #2A74C2;\n  --pre-bg: #E4EEF9;\n  --critica: #C8203A;\n  --critica-bg: #FBE6E9;\n  --alta: #DB661C;\n  --alta-bg: #FCEDE2;\n  --media: #B88A00;\n  --media-bg: #F8F0D6;\n  --baja: #8193A0;\n  --baja-bg: #EBEFF2;\n  --shadow: 0 1px 2px rgba(19, 38, 46, .06);\n  --sobre-accent: #FFFFFF;\n  --ok-suave: #A9D8C6;\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --bg: #0F1B21;\n    --panel: #15252D;\n    --ink: #E5EEF0;\n    --ink-2: #A9BAC0;\n    --ink-3: #7F939A;\n    --line: #263A43;\n    --track: #1D3039;\n    --accent: #6FB3CF;\n    --ok: #4CC49B;\n    --ok-bg: #133229;\n    --pre: #6AA8EE;\n    --pre-bg: #172C44;\n    --critica: #FF5D72;\n    --critica-bg: #3A1720;\n    --alta: #FF9150;\n    --alta-bg: #3A2316;\n    --media: #E5BE3F;\n    --media-bg: #332B12;\n    --baja: #95A6B2;\n    --baja-bg: #22313A;\n    --shadow: none;\n    --sobre-accent: #0F1B21;\n    --ok-suave: #2A5E4E;\n  }\n}\n* { box-sizing: border-box; }\nhtml, body { margin: 0; }\nbody {\n  background: var(--bg);\n  color: var(--ink);\n  font-family: \"Archivo\", system-ui, -apple-system, \"Segoe UI\", sans-serif;\n  font-size: 15px;\n  line-height: 1.5;\n  font-variant-numeric: tabular-nums;\n}\nbutton { font: inherit; }\n:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }\n.wrap { max-width: 1240px; margin: 0 auto; padding: 18px 24px 56px; }\n\n/* Encabezado */\n.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }\n.marca { display: flex; align-items: baseline; gap: 10px; }\n.marca b { font-weight: 800; font-stretch: 112%; font-size: 17px; letter-spacing: -.01em; }\n.marca span { color: var(--ink-2); font-size: 14px; }\n.top .derecha { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n.reloj { color: var(--ink-3); font-size: 13px; }\n.btn { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; padding: 7px 14px; cursor: pointer; font-size: 14px; }\n.btn:hover { border-color: var(--ink-3); }\n.btn.primario { background: var(--accent); border-color: var(--accent); color: var(--sobre-accent); font-weight: 600; }\n.btn.primario:hover { filter: brightness(1.08); }\n.btn.chico { padding: 3px 10px; font-size: 13px; }\n.btn:disabled { opacity: .55; cursor: default; }\n.aviso { margin: 14px 0 0; padding: 9px 13px; border-radius: 6px; background: var(--media-bg); color: var(--ink); font-size: 14px; }\n\n/* Portada: el estado en una frase */\n.portada { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 40px; align-items: end; padding: 34px 0 30px; border-bottom: 1px solid var(--line); }\n.portada h1 { margin: 0; font-weight: 750; font-stretch: 115%; font-size: clamp(30px, 4.4vw, 50px); line-height: 1.04; letter-spacing: -.02em; max-width: 21ch; }\n.portada .semaforo { display: inline-block; width: .5em; height: .5em; border-radius: 50%; margin-right: .3em; vertical-align: .12em; background: var(--ok); }\n.portada.critico .semaforo { background: var(--critica); }\n.portada.atencion .semaforo { background: var(--alta); }\n.portada.riesgo .semaforo { background: var(--pre); }\n.portada .relato { margin: 16px 0 0; font-size: 17px; color: var(--ink-2); max-width: 62ch; }\n.portada .relato strong { color: var(--ink); font-weight: 600; }\n.cifras { display: flex; flex-direction: column; gap: 12px; }\n.cifra { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: baseline; gap: 12px; }\n.cifra b.texto { font-size: 24px; }\n.cifra b { font-size: 30px; font-weight: 700; font-stretch: 110%; line-height: 1; text-align: right; }\n.cifra span { color: var(--ink-2); font-size: 14px; line-height: 1.3; }\n\n/* Secciones */\nsection.bloque { margin-top: 34px; }\n.bloque > h2 { margin: 0; font-size: 21px; font-weight: 700; font-stretch: 108%; letter-spacing: -.01em; }\n.bloque > .bajada { margin: 4px 0 14px; color: var(--ink-2); max-width: 70ch; }\n.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; box-shadow: var(--shadow); min-width: 0; }\n.dos { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 20px; align-items: start; }\n.dos > div > h2 { margin: 0; font-size: 21px; font-weight: 700; font-stretch: 108%; letter-spacing: -.01em; }\n.dos > div > .bajada { margin: 4px 0 14px; color: var(--ink-2); }\n.vacio { color: var(--ink-2); font-size: 14px; padding: 6px 0; }\n\n/* Cómo estuvo cada cliente: barras de 30 minutos */\n.dia { display: grid; grid-template-columns: 190px minmax(0, 1fr) 170px; column-gap: 18px; row-gap: 14px; align-items: center; }\n.dia .cli b { display: block; font-weight: 650; font-size: 15px; }\n.dia .cli span { color: var(--ink-3); font-size: 12.5px; }\n.barras { display: grid; grid-template-columns: repeat(48, minmax(0, 1fr)); gap: 3px; height: 34px; }\n.barras i { display: block; border-radius: 3px; background: var(--ok-suave); }\n.barras i.sd { background: var(--track); }\n.barras i.PRE { background: var(--pre); }\n.barras i.MEDIA { background: var(--media); }\n.barras i.ALTA { background: var(--alta); }\n.barras i.CRITICA { background: var(--critica); }\n.barras i:hover { outline: 2px solid var(--ink); outline-offset: 1px; }\n.dia .resumen { font-size: 13.5px; color: var(--ink-2); line-height: 1.3; }\n.dia .resumen b { display: block; font-size: 15px; color: var(--ink); font-weight: 650; }\n.dia .resumen.mal b { color: var(--critica); }\n.dia .resumen.regular b { color: var(--alta); }\n.dia .resumen.empeora b { color: var(--pre); }\n.eje-dia { grid-column: 2; position: relative; height: 18px; margin-top: -6px; }\n.eje-dia span { position: absolute; top: 0; font-size: 12px; color: var(--ink-3); transform: translateX(-50%); white-space: nowrap; }\n.eje-dia span:first-child { transform: none; }\n.eje-dia span:last-child { transform: translateX(-100%); color: var(--ink); font-weight: 600; }\n.leyenda { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 13px; color: var(--ink-2); }\n.leyenda i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }\n@media (prefers-reduced-motion: no-preference) {\n  .dia.animar .barras i { animation: aparecer .45s ease-out both; }\n  @keyframes aparecer { from { opacity: 0; transform: scaleY(.3); } to { opacity: 1; transform: none; } }\n}\n\n/* Incidentes en curso */\n.caso { border: 1px solid var(--line); border-left: 5px solid var(--baja); border-radius: 8px; padding: 13px 15px; background: var(--panel); margin-bottom: 10px; box-shadow: var(--shadow); }\n.caso.CRITICA { border-left-color: var(--critica); }\n.caso.ALTA { border-left-color: var(--alta); }\n.caso.MEDIA { border-left-color: var(--media); }\n.caso .cab { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }\n.caso h3 { margin: 0; font-size: 16.5px; font-weight: 650; line-height: 1.3; }\n.caso .quien { color: var(--ink-2); font-size: 14px; margin-top: 2px; }\n.caso .quien b { color: var(--ink); font-weight: 600; }\n.caso .cuando { font-size: 13.5px; color: var(--ink-2); white-space: nowrap; }\n.caso .sintomas { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }\n.chip { font-size: 12.5px; padding: 2px 9px; border-radius: 999px; background: var(--baja-bg); color: var(--ink-2); }\n.caso .pie { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 13.5px; color: var(--ink-2); }\n.caso .acc { display: flex; gap: 6px; }\n.sev { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }\n.sev.CRITICA { color: var(--critica); background: var(--critica-bg); }\n.sev.ALTA { color: var(--alta); background: var(--alta-bg); }\n.sev.MEDIA { color: var(--media); background: var(--media-bg); }\n.sev.BAJA { color: var(--baja); background: var(--baja-bg); }\n.mas { margin-top: 4px; }\n\n/* Lo que se viene */\n.pronostico { border: 1.5px solid var(--pre); border-radius: 10px; background: var(--pre-bg); padding: 15px 16px; margin-bottom: 12px; }\n.pronostico .cuenta { font-size: 13px; color: var(--pre); font-weight: 650; }\n.pronostico h3 { margin: 2px 0 2px; font-size: 17px; font-weight: 650; line-height: 1.3; }\n.pronostico .quien { color: var(--ink-2); font-size: 14px; }\n.pronostico .valores { margin-top: 8px; font-size: 14px; }\n.camino { margin-top: 10px; }\n.camino .barra { position: relative; height: 10px; border-radius: 5px; background: var(--panel); border: 1px solid var(--line); overflow: hidden; }\n.camino .relleno { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--ok), var(--pre)); }\n.camino .extremos { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); margin-top: 3px; }\n.balance { font-size: 14.5px; color: var(--ink-2); margin: 4px 0 10px; }\n.balance strong { color: var(--ink); font-weight: 600; }\n.historial { list-style: none; margin: 0; padding: 0; }\n.historial li { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px; padding: 7px 0; border-top: 1px solid var(--line); font-size: 13.5px; align-items: baseline; }\n.historial .ic { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }\n.historial .ic.CONFIRMADA { background: var(--ok); }\n.historial .ic.NO_SE_CUMPLIO { background: var(--baja); }\n.historial .ic.EN_OBSERVACION { background: var(--pre); }\n.historial .sub { color: var(--ink-3); font-size: 12.5px; }\n.historial .res { color: var(--ink-2); white-space: nowrap; text-align: right; }\n\n/* Lo que ya pasó */\n.tres { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 4fr); gap: 20px; align-items: start; }\n.panel h3 { margin: 0 0 10px; font-size: 15px; font-weight: 650; }\n.resuelto { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 14px; align-items: center; }\n.resuelto .sub { color: var(--ink-3); font-size: 12.5px; }\n.dur { display: flex; align-items: center; gap: 8px; }\n.dur .b { height: 8px; border-radius: 4px; min-width: 3px; background: var(--baja); }\n.dur .b.CRITICA { background: var(--critica); } .dur .b.ALTA { background: var(--alta); } .dur .b.MEDIA { background: var(--media); }\n.dur span { white-space: nowrap; color: var(--ink-2); font-size: 13px; }\n.hbar { display: grid; grid-template-columns: 170px minmax(0, 1fr) 84px; gap: 8px; align-items: center; font-size: 13.5px; padding: 4px 0; }\n.hbar .pista2 { height: 8px; background: var(--track); border-radius: 4px; overflow: hidden; }\n.hbar .relleno { height: 100%; background: var(--accent); border-radius: 4px; }\n.hbar .v { text-align: right; color: var(--ink-2); }\ntable { width: 100%; border-collapse: collapse; font-size: 13.5px; }\nth { text-align: left; font-weight: 500; color: var(--ink-3); font-size: 12.5px; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }\ntd { padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }\ntr:last-child td { border-bottom: 0; }\ntd.num, th.num { text-align: right; }\n.tabla-scroll { overflow-x: auto; }\n.punto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--critica); margin-left: 4px; vertical-align: 1px; }\n\n/* Detalle técnico */\ndetails.detalle { margin-top: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }\ndetails.detalle summary { cursor: pointer; padding: 13px 18px; font-weight: 600; font-size: 14.5px; }\ndetails.detalle .cuerpo { padding: 0 18px 16px; }\n.nota { color: var(--ink-3); font-size: 12.5px; margin-top: 28px; }\n\n.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--ink); color: var(--panel); padding: 10px 16px; border-radius: 8px; font-size: 14px; max-width: calc(100% - 32px); display: none; z-index: 10; }\n.toast.error { background: var(--critica); color: #fff; }\n\n@media (max-width: 980px) {\n  .portada { grid-template-columns: 1fr; gap: 22px; }\n  .dos, .tres { grid-template-columns: 1fr; }\n  .dia { grid-template-columns: 130px minmax(0, 1fr); }\n  .dia .resumen { grid-column: 2; margin-top: -8px; }\n}\n@media (max-width: 560px) {\n  .wrap { padding: 14px 16px 40px; }\n  .dia { grid-template-columns: 1fr; row-gap: 6px; }\n  .dia .resumen { grid-column: 1; margin: 0 0 10px; }\n  .eje-dia { grid-column: 1; }\n  .barras { gap: 2px; height: 28px; }\n  .cifra b.texto { font-size: 20px; }\n  .hbar { grid-template-columns: 120px minmax(0, 1fr) 54px; }\n  .resuelto { grid-template-columns: 1fr; gap: 4px; }\n  .cifra { grid-template-columns: 86px minmax(0, 1fr); }\n}\n</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <header class=\"top\">\n    <div class=\"marca\"><b>Helios</b><span>Monitoreo de operaciones</span></div>\n    <div class=\"derecha\">\n      <span class=\"reloj\" id=\"reloj\">Cargando…</span>\n      <button class=\"btn\" id=\"btn-actualizar\">Actualizar</button>\n      <button class=\"btn primario\" id=\"btn-procesar\">Revisar alertas ahora</button>\n    </div>\n  </header>\n  <p class=\"aviso\" id=\"aviso\" hidden></p>\n\n  <section class=\"portada\" id=\"portada\" aria-live=\"polite\">\n    <div>\n      <h1 id=\"titular\"><span class=\"semaforo\"></span>Cargando el estado de la operación…</h1>\n      <p class=\"relato\" id=\"relato\"></p>\n    </div>\n    <div class=\"cifras\" id=\"cifras\"></div>\n  </section>\n\n  <section class=\"bloque\">\n    <h2>Cómo estuvo cada cliente en las últimas 24 horas</h2>\n    <p class=\"bajada\">Cada barrita es media hora. Verde, todo bien; azul, avisamos que algo venía empeorando; amarillo, naranja y rojo, hubo un problema leve, importante o grave. Pasá el mouse por una barrita para ver qué pasó.</p>\n    <div class=\"panel\">\n      <div class=\"dia\" id=\"dia\"></div>\n      <div class=\"leyenda\">\n        <span><i style=\"background:var(--ok-suave)\"></i>Todo bien</span>\n        <span><i style=\"background:var(--pre)\"></i>Aviso anticipado</span>\n        <span><i style=\"background:var(--media)\"></i>Problema leve</span>\n        <span><i style=\"background:var(--alta)\"></i>Importante</span>\n        <span><i style=\"background:var(--critica)\"></i>Grave</span>\n        <span><i style=\"background:var(--track)\"></i>Sin datos</span>\n      </div>\n    </div>\n  </section>\n\n  <div class=\"dos bloque\" style=\"margin-top:34px\">\n    <div>\n      <h2>Qué está pasando ahora</h2>\n      <p class=\"bajada\" id=\"bajada-ahora\">Los problemas en curso, del más grave al más leve.</p>\n      <div id=\"casos\"></div>\n    </div>\n    <div>\n      <h2>Qué podría pasar</h2>\n      <p class=\"bajada\">Métricas que todavía están bien pero vienen empeorando. Avisamos antes de que se conviertan en alerta.</p>\n      <div id=\"pronosticos\"></div>\n      <div class=\"panel\">\n        <p class=\"balance\" id=\"balance\"></p>\n        <ul class=\"historial\" id=\"historial\"></ul>\n      </div>\n    </div>\n  </div>\n\n  <section class=\"bloque\">\n    <h2>Qué ya pasó</h2>\n    <p class=\"bajada\" id=\"bajada-pasado\">Problemas que se resolvieron y cuánto tardaron.</p>\n    <div class=\"tres\">\n      <div class=\"panel\">\n        <h3>Resueltos en las últimas 24 horas</h3>\n        <div id=\"resueltos\"></div>\n      </div>\n      <div>\n        <div class=\"panel\">\n          <h3>Cuánto tarda en resolverse cada tipo de problema</h3>\n          <div id=\"mttr\"></div>\n        </div>\n        <div class=\"panel\" style=\"margin-top:20px\">\n          <h3>Clientes con más problemas en 30 días</h3>\n          <p class=\"vacio\" style=\"margin:-6px 0 6px;font-size:12.5px\"><span class=\"punto\" style=\"margin:0 6px 0 0\"></span>con problemas en este momento</p>\n          <div class=\"tabla-scroll\"><table id=\"t-clientes\"></table></div>\n        </div>\n      </div>\n    </div>\n  </section>\n\n  <details class=\"detalle\" id=\"det-abiertas\">\n    <summary id=\"sum-abiertas\">Ver todas las alertas abiertas, una por una</summary>\n    <div class=\"cuerpo\"><div class=\"tabla-scroll\"><table id=\"t-abiertas\"></table></div></div>\n  </details>\n  <details class=\"detalle\">\n    <summary>Ver las alertas calculadas en este momento (antes de guardarse)</summary>\n    <div class=\"cuerpo\"><div class=\"tabla-scroll\"><table id=\"t-vivo\"></table></div></div>\n  </details>\n\n  <p class=\"nota\" id=\"nota\"></p>\n</div>\n<div class=\"toast\" id=\"toast\" role=\"status\"></div>\n\n<script>\n(function () {\n  var TZ = 'America/Argentina/Buenos_Aires';\n  // Qué le pasa al servicio, en palabras\n  var FRASE = {\n    VOLUMEN_BAJO: 'Entra menos tráfico de lo normal', VOLUMEN_ALTO: 'Entra mucho más tráfico de lo normal',\n    APROBACION_BAJA: 'Se aprueban menos operaciones', RECHAZO_ALTO: 'Suben los rechazos',\n    ERROR_ALTO: 'Suben los errores técnicos', IMPORTE_BAJO: 'Se opera menos dinero de lo normal',\n    IMPORTE_ALTO: 'Se opera más dinero de lo normal', LATENCIA_ALTA: 'El servicio responde lento',\n    SIN_EXITOS: 'No se aprueba ninguna operación', DATO_TARDIO: 'Los datos llegan con demora',\n    DATO_INCONSISTENTE: 'Los datos informados no cierran', SIN_PREDICCION: 'Cliente nuevo, todavía sin historia para comparar',\n    VENTANA_FALTANTE: 'Dejaron de llegar datos'\n  };\n  var CORTA = {\n    VOLUMEN_BAJO: 'menos tráfico', VOLUMEN_ALTO: 'pico de tráfico', APROBACION_BAJA: 'menos aprobaciones',\n    RECHAZO_ALTO: 'más rechazos', ERROR_ALTO: 'más errores', IMPORTE_BAJO: 'menos importe', IMPORTE_ALTO: 'más importe',\n    LATENCIA_ALTA: 'lentitud', SIN_EXITOS: 'sin aprobaciones', DATO_TARDIO: 'datos tardíos',\n    DATO_INCONSISTENTE: 'datos inconsistentes', SIN_PREDICCION: 'sin historia', VENTANA_FALTANTE: 'sin datos'\n  };\n  var TENDENCIA = {\n    cantidad_total: 'El tráfico viene bajando', tasa_aprobacion: 'Las aprobaciones vienen bajando',\n    tasa_rechazo: 'Los rechazos vienen subiendo', tasa_error: 'Los errores vienen subiendo',\n    tiempo_respuesta_promedio: 'El servicio se está poniendo lento'\n  };\n  var SERVICIO = { TRANSFERENCIAS: 'Transferencias', PAGO_SERVICIOS: 'Pago de servicios', RECARGA_CELULAR: 'Recarga de celular', RECARGA_TRANSPORTE: 'Recarga de transporte' };\n  var CANAL = { MOBILE: 'app', WEB: 'web', API: 'API' };\n  var SEV_TXT = { CRITICA: 'Grave', ALTA: 'Importante', MEDIA: 'Leve', BAJA: 'Informativo' };\n  var SEV_N = { CRITICA: 1, ALTA: 2, MEDIA: 3, BAJA: 4 };\n  // Qué síntoma contar primero cuando un servicio tiene varios (de la causa al efecto)\n  var PRIORIDAD = { VENTANA_FALTANTE: 1, SIN_EXITOS: 2, VOLUMEN_BAJO: 3, ERROR_ALTO: 4, RECHAZO_ALTO: 5, LATENCIA_ALTA: 6,\n    APROBACION_BAJA: 7, VOLUMEN_ALTO: 8, IMPORTE_BAJO: 9, IMPORTE_ALTO: 10, DATO_TARDIO: 11, DATO_INCONSISTENTE: 12, SIN_PREDICCION: 13 };\n  function prioridad(s) { return s.tipo === 'VOLUMEN_BAJO' && s.ult && s.ult.valor_observado === 0 ? 0 : (PRIORIDAD[s.tipo] || 20); }\n  var datos = null, primeraVez = true;\n\n  function $(id) { return document.getElementById(id); }\n  function esc(v) {\n    return String(v == null ? '' : v).replace(/[&<>\"']/g, function (c) {\n      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c];\n    });\n  }\n  function aFecha(iso) {\n    if (!iso) return null;\n    var s = String(iso).replace(' ', 'T');\n    return new Date(s + (/[zZ]|[+-]\\d\\d:?\\d\\d$/.test(s) ? '' : 'Z'));\n  }\n  function hora(iso) {\n    var d = aFecha(iso); if (!d || isNaN(d)) return '';\n    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });\n  }\n  function diaHora(iso) {\n    var d = aFecha(iso); if (!d || isNaN(d)) return '';\n    var hoy = new Date().toLocaleDateString('es-AR', { timeZone: TZ });\n    var dia = d.toLocaleDateString('es-AR', { timeZone: TZ });\n    var ayer = new Date(Date.now() - 864e5).toLocaleDateString('es-AR', { timeZone: TZ });\n    var pre = dia === hoy ? 'hoy' : dia === ayer ? 'ayer' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone: TZ });\n    return pre + ' a las ' + hora(iso);\n  }\n  function minutos(m) {\n    if (m == null || isNaN(m)) return '';\n    m = Math.round(m);\n    if (m < 60) return m + ' min';\n    var h = Math.floor(m / 60), r = m % 60;\n    return h + ' h' + (r ? ' ' + r + ' min' : '');\n  }\n  function num(v, dec) {\n    if (v == null || v === '') return '';\n    return Number(v).toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 2 : dec });\n  }\n  function valor(metrica, v) {\n    if (v == null) return '—';\n    if (/^tasa/.test(metrica)) return num(v * 100, 1) + ' %';\n    if (/tiempo/.test(metrica)) return num(v, 0) + ' ms';\n    if (/demora/.test(metrica)) return num(v, 0) + ' min';\n    if (/importe/.test(metrica)) return '$ ' + num(v, 0);\n    return num(v, 0);\n  }\n  function servicio(r) {\n    var s = SERVICIO[r.servicio_id] || String(r.servicio_id || '').toLowerCase().replace(/_/g, ' ');\n    var c = CANAL[r.canal_id] || r.canal_id;\n    return s + ' por ' + c;\n  }\n  function clave(r) { return [r.ambiente, r.cliente_id, r.servicio_id, r.producto_id, r.canal_id, r.moneda_id].join('|'); }\n  function frase(tipo, r) {\n    if (tipo === 'VOLUMEN_BAJO' && r && r.valor_observado === 0) return 'No está entrando tráfico';\n    return FRASE[tipo] || tipo;\n  }\n  function sev(s) { return '<span class=\"sev ' + esc(s) + '\">' + esc(SEV_TXT[s] || s) + '</span>'; }\n  function toast(msg, error) {\n    var t = $('toast');\n    t.textContent = msg; t.className = 'toast' + (error ? ' error' : ''); t.style.display = 'block';\n    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, error ? 7000 : 3500);\n  }\n  function ahoraMs(d) {\n    var p = d.parametros || {};\n    return p.ahora ? aFecha(p.ahora).getTime() : Date.now();\n  }\n\n  // ---- Armado: problemas en curso agrupados por servicio ----\n  function casosEnCurso(d) {\n    var ultimaAlerta = {};\n    (d.abiertas || []).forEach(function (a) {\n      var k = clave(a) + '|' + a.tipo_alerta;\n      if (!ultimaAlerta[k] || a.ventana_inicio > ultimaAlerta[k].ventana_inicio) ultimaAlerta[k] = a;\n    });\n    var grupos = {};\n    (d.incidentes || []).filter(function (i) { return i.estado_incidente === 'ABIERTO'; }).forEach(function (i) {\n      var k = clave(i);\n      var g = grupos[k] || (grupos[k] = { serie: i, sintomas: [], alertas: [], inicio: i.inicio, sev: 'BAJA' });\n      var ult = ultimaAlerta[k + '|' + i.tipo_alerta];\n      g.sintomas.push({ tipo: i.tipo_alerta, sev: i.severidad_maxima, ult: ult, inicio: i.inicio, dur: i.duracion_minutos });\n      if (i.inicio < g.inicio) g.inicio = i.inicio;\n      if (SEV_N[i.severidad_maxima] < SEV_N[g.sev]) g.sev = i.severidad_maxima;\n    });\n    (d.abiertas || []).forEach(function (a) { var g = grupos[clave(a)]; if (g) g.alertas.push(a); });\n    var lista = Object.keys(grupos).map(function (k) {\n      var g = grupos[k];\n      g.sintomas.sort(function (a, b) { return SEV_N[a.sev] - SEV_N[b.sev] || prioridad(a) - prioridad(b); });\n      g.principal = g.sintomas[0];\n      g.dur = Math.max.apply(null, g.sintomas.map(function (s) { return s.dur || 0; }));\n      g.reconocida = g.alertas.length && g.alertas.every(function (a) { return a.estado === 'RECONOCIDA'; });\n      g.quien = (g.alertas.filter(function (a) { return a.reconocida_por; })[0] || {}).reconocida_por;\n      return g;\n    });\n    lista.sort(function (a, b) { return SEV_N[a.sev] - SEV_N[b.sev] || prioridad(a.principal) - prioridad(b.principal) || b.dur - a.dur; });\n    return lista;\n  }\n\n  // ---- Portada ----\n  function pintarPortada(d, casos, activas) {\n    var problemas = casos.filter(function (c) { return c.sev !== 'BAJA'; });\n    var clientes = {};\n    problemas.forEach(function (c) { clientes[c.serie.cliente_id] = 1; });\n    var nCli = Object.keys(clientes).length;\n    var el = $('portada'), titular, relato = '', clase;\n    if (nCli > 0) {\n      clase = problemas[0].sev === 'CRITICA' ? 'critico' : 'atencion';\n      titular = nCli === 1 ? 'Un cliente tiene problemas en este momento.' : nCli + ' clientes tienen problemas en este momento.';\n      var c = problemas[0];\n      relato = 'Lo más urgente es <strong>' + esc(c.serie.cliente_id) + '</strong>: ' +\n        esc(frase(c.principal.tipo, c.principal.ult).toLowerCase()) + ' en ' + esc(servicio(c.serie)) +\n        ' desde las ' + hora(c.inicio) + ' (hace ' + minutos(c.dur) + ').';\n      var tomados = problemas.filter(function (x) { return x.reconocida; }).length;\n      relato += tomados ? ' El equipo ya está trabajando en ' + (tomados === 1 ? 'uno' : tomados) + ' de ellos.' : ' Nadie los tomó todavía.';\n    } else if (activas.length) {\n      clase = 'riesgo';\n      titular = 'Todo funciona, pero hay algo para mirar.';\n    } else {\n      clase = 'ok';\n      titular = 'Todo funciona dentro de lo esperado.';\n      relato = 'Ningún servicio está fuera de su comportamiento normal.';\n    }\n    if (activas.length) {\n      var a = activas[0];\n      relato += (relato ? ' ' : '') + 'Además, <strong>' + esc(a.cliente_id) + '</strong> viene empeorando en ' + esc(servicio(a)) +\n        ' y podría generar una alerta en unos ' + a.minutos_estimados + ' minutos.';\n    }\n    el.className = 'portada ' + clase;\n    $('titular').innerHTML = '<span class=\"semaforo\"></span>' + esc(titular);\n    $('relato').innerHTML = relato;\n    var k = d.kpis || {};\n    var cifras = [\n      [problemas.length, problemas.length === 1 ? 'servicio afectado ahora' : 'servicios afectados ahora'],\n      [activas.length, activas.length === 1 ? 'aviso anticipado activo' : 'avisos anticipados activos'],\n      [k.mttr_minutos_7d == null ? '—' : minutos(k.mttr_minutos_7d), 'tarda en resolverse un problema, en promedio (7 días)']\n    ];\n    $('cifras').innerHTML = cifras.map(function (c) {\n      return '<div class=\"cifra\"><b' + (typeof c[0] === 'string' && c[0].length > 3 ? ' class=\"texto\"' : '') + '>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';\n    }).join('');\n  }\n\n  // ---- Cómo estuvo cada cliente: 48 barras de 30 minutos ----\n  function finDeIncidente(i, d) {\n    if (i.estado_incidente !== 'ABIERTO') return aFecha(i.ultima_ventana_afectada).getTime();\n    // abierto: hasta la última ventana con la alerta (no hasta \"ahora\": si dejaron de llegar datos, no se inventa)\n    var k = clave(i), fin = aFecha(i.inicio).getTime() + 15 * 60e3;\n    (d.abiertas || []).forEach(function (a) {\n      if (clave(a) === k && a.tipo_alerta === i.tipo_alerta) {\n        var f = aFecha(a.ventana_inicio).getTime() + (a.duracion_ventana_minutos || 15) * 60e3;\n        if (f > fin) fin = f;\n      }\n    });\n    return fin;\n  }\n  function pintarDia(d) {\n    var fin = Math.ceil(ahoraMs(d) / 1800e3) * 1800e3, N = 48, paso = 1800e3, ini = fin - N * paso;\n    var RANGO = { PRE: 1, MEDIA: 2, ALTA: 3, CRITICA: 4 };\n    var cli = {}, orden = [];\n    function cliente(id) {\n      if (!cli[id]) { cli[id] = { id: id, servicios: {}, ultima: 0, primera: Infinity, slots: [], abierto: null, aviso: false }; orden.push(id); for (var n = 0; n < N; n++) cli[id].slots.push({ st: null, txt: [] }); }\n      return cli[id];\n    }\n    (d.series || []).forEach(function (s) {\n      var c = cliente(s.cliente_id); c.servicios[servicio(s)] = 1;\n      var u = aFecha(s.ultima_ventana_fin).getTime(); if (u > c.ultima) c.ultima = u;\n      var pr = u - (s.ventanas || 0) * 15 * 60e3; if (pr < c.primera) c.primera = pr;   // aprox.: ventanas de 15 min seguidas\n    });\n    function marcar(c, a, b, st, txt) {\n      for (var n = 0; n < N; n++) {\n        var sa = ini + n * paso, sb = sa + paso;\n        if (b <= sa || a >= sb) continue;\n        var sl = c.slots[n];\n        if (!sl.st || RANGO[st] > RANGO[sl.st]) sl.st = st;\n        if (sl.txt.indexOf(txt) < 0) sl.txt.push(txt);\n      }\n    }\n    (d.incidentes || []).forEach(function (i) {\n      if (i.severidad_maxima === 'BAJA') return;   // cliente nuevo sin historia: no es un problema\n      var a = aFecha(i.inicio).getTime(), b = finDeIncidente(i, d);\n      if (b < ini) return;\n      var c = cliente(i.cliente_id);\n      marcar(c, a, b, i.severidad_maxima, frase(i.tipo_alerta) + ' en ' + servicio(i));\n      if (i.estado_incidente === 'ABIERTO' && (!c.abierto || RANGO[i.severidad_maxima] > RANGO[c.abierto])) c.abierto = i.severidad_maxima;\n    });\n    (d.prealertas || []).forEach(function (p) {\n      var a = aFecha(p.inicio).getTime(), b = aFecha(p.ultima_ventana).getTime() + (p.duracion_ventana_minutos || 15) * 60e3;\n      if (b < ini) return;\n      if (p.activa === 1) cliente(p.cliente_id).aviso = true;\n      marcar(cliente(p.cliente_id), a, b, 'PRE', 'Aviso: ' + (TENDENCIA[p.metrica] || '').toLowerCase() + ' en ' + servicio(p));\n    });\n    orden.sort();\n    var html = orden.map(function (id) {\n      var c = cli[id], conDatos = 0, bien = 0;\n      var barras = c.slots.map(function (sl, n) {\n        var sa = ini + n * paso, hayDatos = sa < c.ultima && sa + paso > c.primera;\n        var cls = sl.st || (hayDatos ? '' : 'sd');\n        if (hayDatos || sl.st) { conDatos++; if (!sl.st || sl.st === 'PRE') bien++; }\n        var t = hora(new Date(sa).toISOString()) + ' a ' + hora(new Date(sa + paso).toISOString()) + ': ' +\n          (sl.txt.length ? sl.txt.join('; ') : hayDatos ? 'todo bien' : 'sin datos');\n        return '<i class=\"' + cls + '\" title=\"' + esc(t) + '\" style=\"animation-delay:' + (n * 10) + 'ms\"></i>';\n      }).join('');\n      var pct = conDatos ? Math.round(100 * bien / conDatos) : null;\n      var nServ = Object.keys(c.servicios).length;\n      var nuevo = c.primera > ini + paso;\n      var resumen = c.abierto\n        ? '<div class=\"resumen ' + (c.abierto === 'CRITICA' ? 'mal' : 'regular') + '\"><b>Con problemas ahora</b>' + (pct != null ? 'bien el ' + pct + ' % del día' : '') + '</div>'\n        : c.aviso\n        ? '<div class=\"resumen empeora\"><b>Viene empeorando</b>hay un aviso anticipado activo</div>'\n        : nuevo\n        ? '<div class=\"resumen\"><b>Cliente nuevo</b>con datos desde las ' + hora(new Date(c.primera).toISOString()) + '</div>'\n        : '<div class=\"resumen\"><b>' + (pct == null ? 'Sin datos' : pct === 100 ? 'Todo el día bien' : 'Bien el ' + pct + ' % del día') + '</b>' + (pct != null && pct < 100 ? 'ya resuelto' : '') + '</div>';\n      return '<div class=\"cli\"><b>' + esc(id) + '</b><span>' + (nServ === 1 ? '1 servicio' : nServ + ' servicios') + '</span></div>' +\n        '<div class=\"barras\">' + barras + '</div>' + resumen;\n    }).join('');\n    if (!orden.length) html = '<div class=\"vacio\" style=\"grid-column:1/-1\">Todavía no llegaron métricas en las últimas 24 horas.</div>';\n    var eje = [0, 12, 24, 36, 48].map(function (n) {\n      var t = new Date(ini + n * paso).toISOString();\n      return '<span style=\"left:' + (n / N * 100) + '%\">' + (n === N ? 'ahora' : hora(t)) + '</span>';\n    }).join('');\n    html += '<div class=\"eje-dia\">' + eje + '</div>';\n    var el = $('dia');\n    el.className = 'dia' + (primeraVez ? ' animar' : '');\n    el.innerHTML = html;\n  }\n\n  // ---- Qué está pasando ahora ----\n  function pintarCasos(casos) {\n    var reales = casos.filter(function (c) { return c.sev !== 'BAJA'; });\n    var info = casos.filter(function (c) { return c.sev === 'BAJA'; });\n    $('bajada-ahora').textContent = reales.length\n      ? 'Los problemas en curso, del más grave al más leve. Tomá uno para avisarle al resto del equipo que lo estás mirando.'\n      : 'No hay problemas en curso.';\n    if (!casos.length) { $('casos').innerHTML = '<div class=\"panel vacio\">Todo en orden: ningún servicio tiene problemas en este momento.</div>'; return; }\n    $('casos').innerHTML = reales.concat(info).map(function (c) {\n      var p = c.principal, s = c.serie;\n      var otros = c.sintomas.slice(1).map(function (x) { return '<span class=\"chip\">' + esc(CORTA[x.tipo] || x.tipo) + '</span>'; }).join('');\n      var detalle = p.tipo === 'VENTANA_FALTANTE'\n        ? 'Faltan los datos de ' + Math.max(1, Math.round((p.dur || 0) / 15)) + ' ventanas de 15 minutos.'\n        : p.ult && p.ult.valor_esperado != null && p.ult.valor_observado != null && p.ult.metrica\n          ? 'Ahora ' + valor(p.ult.metrica, p.ult.valor_observado) + ', lo normal es ' + valor(p.ult.metrica, p.ult.valor_esperado) + '.'\n          : '';\n      var estado = c.sev === 'BAJA' ? 'No es una falla: el modelo necesita unos días de datos para aprender cómo se comporta.' : c.reconocida ? 'Lo está mirando <b>' + esc(c.quien || 'el equipo') + '</b>.' : 'Nadie lo tomó todavía.';\n      var ids = c.alertas.map(function (a) { return a.alerta_id; });\n      var abiertas = c.alertas.filter(function (a) { return a.estado === 'ABIERTA'; }).map(function (a) { return a.alerta_id; });\n      var acc = ids.length && c.sev !== 'BAJA' ? '<div class=\"acc\">' +\n        (abiertas.length ? '<button class=\"btn chico\" data-accion=\"reconocer\" data-ids=\"' + esc(abiertas.join(',')) + '\">Tomar</button>' : '') +\n        '<button class=\"btn chico\" data-accion=\"resolver\" data-ids=\"' + esc(ids.join(',')) + '\">Marcar como resuelto</button></div>' : '';\n      return '<article class=\"caso ' + esc(c.sev) + '\"><div class=\"cab\"><div><h3>' + esc(frase(p.tipo, p.ult)) + '</h3>' +\n        '<div class=\"quien\"><b>' + esc(s.cliente_id) + '</b>, ' + esc(servicio(s)) + '</div></div>' +\n        '<div class=\"cuando\">' + sev(c.sev) + ' desde las ' + hora(c.inicio) + ', hace ' + minutos(c.dur) + '</div></div>' +\n        (detalle || otros ? '<div class=\"sintomas\">' + (detalle ? '<span class=\"chip\">' + esc(detalle) + '</span>' : '') + otros + '</div>' : '') +\n        '<div class=\"pie\"><span>' + estado + '</span>' + acc + '</div></article>';\n    }).join('');\n  }\n\n  // ---- Qué podría pasar ----\n  function pintarPronostico(todas) {\n    var activas = todas.filter(function (r) { return r.activa === 1; });\n    activas.sort(function (a, b) { return a.minutos_estimados - b.minutos_estimados || b.margen_consumido - a.margen_consumido; });\n    $('pronosticos').innerHTML = activas.length ? activas.map(function (r) {\n      var pct = Math.max(0, Math.min(100, Math.round((r.margen_consumido || 0) * 100)));\n      var subir = !/aprobacion|cantidad/.test(r.metrica);\n      return '<div class=\"pronostico\"><div class=\"cuenta\">Podría pasar en unos ' + r.minutos_estimados + ' minutos</div>' +\n        '<h3>' + esc(TENDENCIA[r.metrica] || r.tipo_prealerta) + '</h3>' +\n        '<div class=\"quien\"><b>' + esc(r.cliente_id) + '</b>, ' + esc(servicio(r)) + '</div>' +\n        '<div class=\"valores\">Ahora ' + valor(r.metrica, r.valor_observado) + '. Lo normal es ' + valor(r.metrica, r.valor_esperado) +\n        ' y la alerta salta ' + (subir ? 'por encima de ' : 'por debajo de ') + valor(r.metrica, r.umbral) + '.</div>' +\n        '<div class=\"camino\"><div class=\"barra\" title=\"Ya recorrió el ' + pct + ' % del camino hasta la alerta\"><div class=\"relleno\" style=\"width:' + pct + '%\"></div></div>' +\n        '<div class=\"extremos\"><span>normal</span><span>' + pct + ' % del camino</span><span>alerta</span></div></div></div>';\n    }).join('') : '<div class=\"panel vacio\" style=\"margin-bottom:12px\">Ninguna métrica viene empeorando en este momento.</div>';\n\n    var conf = todas.filter(function (r) { return r.resultado === 'CONFIRMADA'; });\n    var noc = todas.filter(function (r) { return r.resultado === 'NO_SE_CUMPLIO'; });\n    var ant = conf.length ? Math.round(conf.reduce(function (t, r) { return t + (r.minutos_anticipacion || 0); }, 0) / conf.length) : null;\n    $('balance').innerHTML = todas.length\n      ? 'En las últimas 48 horas avisamos <strong>' + todas.length + ' veces</strong>. <strong>' + conf.length + '</strong> terminaron en alerta, en promedio <strong>' + minutos(ant) + ' antes</strong> de que pasara' +\n        (noc.length ? ', y ' + noc.length + (noc.length === 1 ? ' no se cumplió.' : ' no se cumplieron.') : '.')\n      : 'Todavía no hubo avisos anticipados en las últimas 48 horas.';\n    var RES = { CONFIRMADA: function (r) { return 'avisó ' + minutos(r.minutos_anticipacion) + ' antes'; }, NO_SE_CUMPLIO: function () { return 'no se cumplió'; }, EN_OBSERVACION: function () { return 'en curso'; } };\n    $('historial').innerHTML = todas.slice(0, 6).map(function (r) {\n      return '<li><span class=\"ic ' + esc(r.resultado) + '\"></span><span>' + esc(TENDENCIA[r.metrica] || r.tipo_prealerta) +\n        '<div class=\"sub\">' + esc(r.cliente_id) + ', ' + esc(servicio(r)) + ', ' + diaHora(r.inicio) + '</div></span>' +\n        '<span class=\"res\">' + esc((RES[r.resultado] || function () { return r.resultado; })(r)) + '</span></li>';\n    }).join('');\n    return activas;\n  }\n\n  // ---- Qué ya pasó ----\n  function pintarPasado(d) {\n    var fin = ahoraMs(d);\n    var res = (d.incidentes || []).filter(function (i) {\n      return i.estado_incidente === 'RESUELTO' && aFecha(i.inicio).getTime() >= fin - 24 * 3600e3;\n    }).sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });\n    $('bajada-pasado').textContent = res.length\n      ? 'En las últimas 24 horas se resolvieron ' + res.length + (res.length === 1 ? ' problema.' : ' problemas.')\n      : 'En las últimas 24 horas no hubo problemas resueltos.';\n    var max = Math.max.apply(null, res.map(function (r) { return r.duracion_minutos || 0; }).concat([1]));\n    $('resueltos').innerHTML = res.length ? res.slice(0, 10).map(function (r) {\n      return '<div class=\"resuelto\"><div>' + esc(frase(r.tipo_alerta)) + '<div class=\"sub\">' + esc(r.cliente_id) + ', ' + esc(servicio(r)) + ', ' + diaHora(r.inicio) + '</div></div>' +\n        '<div class=\"dur\"><div class=\"b ' + esc(r.severidad_maxima) + '\" style=\"width:' + Math.max(3, Math.round(90 * (r.duracion_minutos || 0) / max)) + 'px\"></div><span>' + minutos(r.duracion_minutos) + '</span></div></div>';\n    }).join('') + (res.length > 10 ? '<div class=\"vacio\">y ' + (res.length - 10) + ' más</div>' : '') : '<div class=\"vacio\">Nada para mostrar.</div>';\n    var m = (d.mttr || []).filter(function (r) { return r.tipo_alerta !== 'SIN_PREDICCION'; });\n    var mx = Math.max.apply(null, m.map(function (r) { return r.mttr_minutos || 0; }).concat([1]));\n    $('mttr').innerHTML = m.length ? m.map(function (r) {\n      return '<div class=\"hbar\" title=\"' + r.incidentes_resueltos + ' problemas resueltos\"><span>' + esc(CORTA[r.tipo_alerta] ? CORTA[r.tipo_alerta].charAt(0).toUpperCase() + CORTA[r.tipo_alerta].slice(1) : r.tipo_alerta) + '</span>' +\n        '<div class=\"pista2\"><div class=\"relleno\" style=\"width:' + Math.max(2, 100 * r.mttr_minutos / mx) + '%\"></div></div><span class=\"v\">' + minutos(r.mttr_minutos) + '</span></div>';\n    }).join('') : '<div class=\"vacio\">Todavía no hay problemas resueltos.</div>';\n    var c = d.clientes || [];\n    $('t-clientes').innerHTML = c.length ? '<thead><tr><th>Cliente</th><th class=\"num\">Problemas</th><th class=\"num\">Graves</th><th class=\"num\">Horas afectadas</th></tr></thead><tbody>' +\n      c.map(function (r) {\n        return '<tr><td>' + esc(r.cliente_id) + (r.en_curso ? ' <span class=\"punto\" title=\"Tiene problemas en este momento\"></span>' : '') + '</td><td class=\"num\">' + r.incidentes + '</td><td class=\"num\">' + (r.criticos || 0) + '</td><td class=\"num\">' + num(r.horas_afectadas, 1) + '</td></tr>';\n      }).join('') + '</tbody>' : '<tr><td class=\"vacio\">Sin problemas en los últimos 30 días.</td></tr>';\n  }\n\n  // ---- Detalle técnico ----\n  function pintarDetalle(d) {\n    var a = d.abiertas || [];\n    $('sum-abiertas').textContent = 'Ver las ' + a.length + ' alertas abiertas, una por una';\n    $('t-abiertas').innerHTML = a.length ? '<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Ventana</th><th class=\"num\">Observado</th><th class=\"num\">Esperado</th><th>Estado</th></tr></thead><tbody>' +\n      a.map(function (r) {\n        return '<tr><td>' + sev(r.severidad) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) +\n          '</td><td>' + diaHora(r.ventana_inicio) + '</td><td class=\"num\">' + valor(r.metrica, r.valor_observado) + '</td><td class=\"num\">' + valor(r.metrica, r.valor_esperado) +\n          '</td><td>' + (r.estado === 'RECONOCIDA' ? 'Tomada por ' + esc(r.reconocida_por || '') : 'Abierta') + '</td></tr>';\n      }).join('') + '</tbody>' : '<tr><td class=\"vacio\">No hay alertas abiertas.</td></tr>';\n    var v = d.vivo || [];\n    $('t-vivo').innerHTML = v.length ? '<thead><tr><th>Alerta</th><th>Cliente y servicio</th><th>Ventana</th></tr></thead><tbody>' +\n      v.slice(0, 30).map(function (r) {\n        return '<tr><td>' + sev(r.severidad) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td><td>' + esc(r.cliente_id) + ', ' + esc(servicio(r)) + '</td><td>' + diaHora(r.ventana_inicio) + '</td></tr>';\n      }).join('') + (v.length > 30 ? '<tr><td colspan=\"3\" class=\"vacio\">y ' + (v.length - 30) + ' más</td></tr>' : '') + '</tbody>'\n      : '<tr><td class=\"vacio\">No hay alertas en este momento.</td></tr>';\n  }\n\n  function pintar(d) {\n    datos = d;\n    var p = d.parametros || {};\n    var ultima = (d.series || []).reduce(function (m, s) { return s.ultima_ventana_fin > m ? s.ultima_ventana_fin : m; }, '');\n    $('reloj').textContent = (ultima ? 'Datos hasta las ' + hora(ultima) : 'Sin datos recientes') + (p.ahora ? ' (reloj de demostración)' : '');\n    var avisos = [];\n    if (ultima && ahoraMs(d) - aFecha(ultima).getTime() > 45 * 60e3)\n      avisos.push('Los últimos datos recibidos son de ' + diaHora(ultima) + '. Lo que ves es el estado a esa hora: los problemas \"en curso\" pueden ya no estar pasando.');\n    if (p.reglas_inactivas > 0) avisos.push(p.reglas_inactivas === 1 ? 'Hay 1 regla de alerta apagada.' : 'Hay ' + p.reglas_inactivas + ' reglas de alerta apagadas.');\n    if (!(d.abiertas || []).length && !(d.incidentes || []).length && (d.vivo || []).length)\n      avisos.push('Hay alertas calculadas que todavía no se guardaron. Tocá \"Revisar alertas ahora\".');\n    $('aviso').hidden = !avisos.length; $('aviso').textContent = avisos.join(' ');\n    var casos = casosEnCurso(d);\n    var activas = pintarPronostico(d.prealertas || []);\n    pintarPortada(d, casos, activas);\n    pintarDia(d);\n    pintarCasos(casos);\n    pintarPasado(d);\n    pintarDetalle(d);\n    $('nota').textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }) +\n      '. Se actualiza solo cada 5 minutos mientras la página está a la vista.' + (d.filas_leidas ? ' Esta consulta leyó ' + num(d.filas_leidas, 0) + ' filas de la base.' : '');\n    primeraVez = false;\n  }\n\n  function pedir(url, opciones) {\n    return fetch(url, opciones).then(function (r) {\n      return r.json().then(function (j) {\n        if (!r.ok || j.ok === false) throw new Error(j.error || ('Error ' + r.status));\n        return j;\n      });\n    });\n  }\n  function cargar() {\n    return pedir('/api/dashboard').then(pintar).catch(function (e) {\n      $('reloj').textContent = 'No se pudieron cargar los datos.';\n      toast(e.message, true);\n    });\n  }\n  function usuario() {\n    var u = null;\n    try { u = localStorage.getItem('alertas_usuario'); } catch (e) {}\n    if (!u) {\n      u = window.prompt('¿Con qué nombre registramos la acción?');\n      if (!u) return null;\n      try { localStorage.setItem('alertas_usuario', u); } catch (e) {}\n    }\n    return u;\n  }\n\n  document.addEventListener('click', function (ev) {\n    var b = ev.target.closest('button[data-accion]');\n    if (!b) return;\n    var u = usuario(); if (!u) return;\n    var accion = b.getAttribute('data-accion');\n    var comentario = accion === 'resolver' ? window.prompt('¿Qué se hizo? (opcional)', '') : null;\n    if (accion === 'resolver' && comentario === null) return;\n    var ids = b.getAttribute('data-ids').split(',').filter(Boolean);\n    b.disabled = true;\n    ids.reduce(function (pr, id) {\n      return pr.then(function () {\n        return pedir('/api/alertas/' + encodeURIComponent(id) + '/' + accion, {\n          method: 'POST', headers: { 'content-type': 'application/json' },\n          body: JSON.stringify({ usuario: u, comentario: comentario || null })\n        }).catch(function (e) { if (!/ya cambió de estado/.test(e.message)) throw e; });\n      });\n    }, Promise.resolve()).then(function () {\n      toast(accion === 'reconocer' ? 'Tomado: el resto del equipo ve que lo estás mirando.' : 'Marcado como resuelto.');\n      return cargar();\n    }).catch(function (e) { b.disabled = false; toast(e.message, true); });\n  });\n\n  $('btn-actualizar').addEventListener('click', function () {\n    var b = this; b.disabled = true; b.textContent = 'Actualizando…';\n    cargar().then(function () { if (datos) toast('Datos actualizados.'); })\n      .then(function () { b.disabled = false; b.textContent = 'Actualizar'; });\n  });\n  $('btn-procesar').addEventListener('click', function () {\n    var b = this; b.disabled = true; b.textContent = 'Revisando…';\n    pedir('/api/procesar', { method: 'POST' }).then(function (r) {\n      toast('Alertas revisadas: ' + r.registradas_o_actualizadas + ' registradas o actualizadas, ' + r.resueltas + ' resueltas.');\n      return cargar();\n    }).catch(function (e) { toast(e.message, true); })\n      .then(function () { b.disabled = false; b.textContent = 'Revisar alertas ahora'; });\n  });\n\n  // Actualización automática: cada 5 minutos y solo con la página a la vista,\n  // para no consumir lecturas de D1 en segundo plano.\n  var ultimaCarga = Date.now();\n  function cargarYMarcar() { ultimaCarga = Date.now(); return cargar(); }\n  cargar();\n  setInterval(function () { if (!document.hidden) cargarYMarcar(); }, 300000);\n  document.addEventListener('visibilitychange', function () {\n    if (!document.hidden && Date.now() - ultimaCarga > 300000) cargarYMarcar();\n  });\n})();\n</script>\n</body>\n</html>\n";

async function procesarAlertas(env) {
  if (!env.DB) {
    throw new Error(
      'No se encontró la base D1. En la configuración del Worker agreguen un binding ' +
      'de D1 con el nombre de variable "DB" (en mayúsculas) apuntando a su base.'
    );
  }
  try {
    const [registrar, normalizadas, desaparecidas] = await env.DB.batch([
      env.DB.prepare(REGISTRAR),
      env.DB.prepare(CERRAR_NORMALIZADAS),
      env.DB.prepare(CERRAR_DESAPARECIDAS),
    ]);
    const pasos = [registrar, normalizadas, desaparecidas];
    return {
      ok: true,
      registradas_o_actualizadas: registrar.meta.changes,
      resueltas: normalizadas.meta.changes + desaparecidas.meta.changes,
      filas_leidas: pasos.reduce((t, p) => t + (p.meta.rows_read || 0), 0),
      filas_escritas: pasos.reduce((t, p) => t + (p.meta.rows_written || 0), 0),
    };
  } catch (err) {
    throw new Error('Error en el proceso de alertas: ' + explicar(err));
  }
}

// Mensaje de error legible, con una pista si faltan objetos en la base
function explicar(err) {
  const detalle = (err && (err.cause?.message || err.message)) || String(err);
  if (/no such table|no such view/i.test(detalle)) {
    return detalle + ' -> Falta crear objetos en la base: ejecuten alertas_d1_objetos.sql y ' +
      'después alertas_d1_historico.sql (con --remote si la base es la de Cloudflare).';
  }
  return detalle;
}

// Todos los datos del dashboard en un solo viaje a la base
async function datosDashboard(env) {
  if (!env.DB) throw new Error('No se encontró la base D1: falta el binding "DB".');
  try {
    const r = await env.DB.batch([
      env.DB.prepare(Q_KPIS),
      env.DB.prepare(Q_ABIERTAS),
      env.DB.prepare(Q_POR_DIA),
      env.DB.prepare(Q_INCIDENTES),
      env.DB.prepare(Q_MTTR),
      env.DB.prepare(Q_CLIENTES),
      env.DB.prepare(Q_VIVO),
      env.DB.prepare(Q_PARAMETROS),
      env.DB.prepare(Q_POR_HORA),
      env.DB.prepare(Q_PREALERTAS),
      env.DB.prepare(Q_SERIES),
    ]);
    return {
      ok: true,
      kpis: r[0].results[0] || {},
      abiertas: r[1].results,
      por_dia: r[2].results,
      incidentes: r[3].results,
      mttr: r[4].results,
      clientes: r[5].results,
      vivo: r[6].results,
      parametros: r[7].results[0] || {},
      por_hora: r[8].results,
      prealertas: r[9].results,
      series: r[10].results,
      filas_leidas: r.reduce((t, x) => t + ((x.meta && x.meta.rows_read) || 0), 0),
    };
  } catch (err) {
    throw new Error('Error al leer los datos del dashboard: ' + explicar(err));
  }
}

async function accionAlerta(env, alertaId, accion, request) {
  let cuerpo = {};
  try { cuerpo = await request.json(); } catch (e) { /* cuerpo vacío */ }
  const usuario = String(cuerpo.usuario || '').trim().slice(0, 80);
  if (!usuario) return Response.json({ ok: false, error: 'Falta el nombre de usuario.' }, { status: 400 });
  const comentario = cuerpo.comentario ? String(cuerpo.comentario).slice(0, 500) : null;
  const sql = accion === 'reconocer' ? RECONOCER : RESOLVER;
  const r = await env.DB.prepare(sql).bind(alertaId, usuario, comentario).run();
  if (!r.meta.changes) {
    return Response.json({ ok: false, error: 'La alerta no existe o ya cambió de estado. Actualicen la página.' }, { status: 409 });
  }
  return Response.json({ ok: true });
}

export default {
  // Cron Trigger: registra las alertas en el histórico
  async scheduled(controller, env, ctx) {
    try {
      const r = await procesarAlertas(env);
      console.log(`Alertas: ${r.registradas_o_actualizadas} registradas o actualizadas, ${r.resueltas} resueltas automáticamente (${r.filas_leidas} filas leídas, ${r.filas_escritas} escritas)`);
    } catch (err) {
      console.error(err.message);
      throw err;
    }
  },

  // Dashboard y API.
  // Para la demo la página es pública; en producción conviene protegerla
  // con Cloudflare Access.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && ruta === '/') {
        return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && ruta === '/api/dashboard') {
        return Response.json(await datosDashboard(env), { headers: { 'cache-control': 'no-store' } });
      }
      // Ejecutar el proceso a mano (POST desde el botón; GET para abrirlo en el navegador)
      if ((request.method === 'POST' && ruta === '/api/procesar') || (request.method === 'GET' && ruta === '/procesar')) {
        return Response.json(await procesarAlertas(env));
      }
      const m = ruta.match(/^\/api\/alertas\/([0-9a-f]{32})\/(reconocer|resolver)$/);
      if (request.method === 'POST' && m) {
        if (!env.DB) throw new Error('No se encontró la base D1: falta el binding "DB".');
        return await accionAlerta(env, m[1], m[2], request);
      }
      return Response.json({ ok: false, error: 'Ruta no encontrada: ' + ruta }, { status: 404 });
    } catch (err) {
      console.error(err.message);
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};
