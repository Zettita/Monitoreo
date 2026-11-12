let
    Origen = fnApi("incidentes", [desde = if Desde is date then Date.ToText(Desde, "yyyy-MM-dd") else Text.From(Desde)]),
    Tipos = Table.TransformColumnTypes(Origen, {
        {"tipo_alerta", type text}, {"clave_serie", type text},
        {"ambiente", type text}, {"cliente_id", type text}, {"servicio_id", type text},
        {"producto_id", type text}, {"canal_id", type text}, {"moneda_id", type text},
        {"duracion_ventana_minutos", Int64.Type},
        {"estado_incidente", type text},
        {"severidad_maxima", type text}, {"severidad_maxima_orden", Int64.Type},
        {"inicio", type datetime}, {"ultima_ventana_afectada", type datetime},
        {"primera_deteccion", type datetime}, {"fecha_resolucion", type datetime},
        {"motivo_resolucion", type text},
        {"ventanas_afectadas", Int64.Type}, {"duracion_minutos", type number}
    }, "en-US")
in
    Tipos
