let
    Origen = fnApi("alertas", [desde = if Desde is date then Date.ToText(Desde, "yyyy-MM-dd") else Text.From(Desde)]),
    Tipos = Table.TransformColumnTypes(Origen, {
        {"alerta_id", type text}, {"tipo_alerta", type text}, {"grupo", type text},
        {"descripcion_regla", type text}, {"clave_serie", type text},
        {"ambiente", type text}, {"cliente_id", type text}, {"servicio_id", type text},
        {"producto_id", type text}, {"canal_id", type text}, {"moneda_id", type text},
        {"duracion_ventana_minutos", Int64.Type},
        {"ventana_inicio", type datetime}, {"ventana_fin", type datetime},
        {"metrica", type text},
        {"severidad", type text}, {"severidad_orden", Int64.Type},
        {"severidad_maxima", type text}, {"severidad_maxima_orden", Int64.Type},
        {"valor_observado", type number}, {"valor_esperado", type number},
        {"umbral", type number}, {"desvio", type number},
        {"estado", type text}, {"estado_orden", Int64.Type}, {"activa", Int64.Type},
        {"primera_deteccion", type datetime}, {"ultima_deteccion", type datetime},
        {"cantidad_detecciones", Int64.Type}, {"cantidad_reaperturas", Int64.Type},
        {"fecha_reconocimiento", type datetime}, {"reconocida_por", type text},
        {"fecha_resolucion", type datetime}, {"motivo_resolucion", type text},
        {"resuelta_por", type text}, {"comentario", type text},
        {"minutos_abierta", type number},
        {"metrica_id", type text}, {"prediccion_id", type text}
    }, "en-US"),
    ConFecha = Table.AddColumn(Tipos, "fecha", each DateTime.Date([ventana_inicio]), type date),
    ConHora  = Table.AddColumn(ConFecha, "hora", each Time.Hour([ventana_inicio]), Int64.Type)
in
    ConHora
