// Consulta "Prealertas"  (Nuevo origen → Consulta en blanco → Editor avanzado → pegar)
// Trae v_prealertas (últimas 48 h) desde el Worker API.
let
    Origen = fnApi("prealertas", [desde = if Desde is date then Date.ToText(Desde, "yyyy-MM-dd") else Text.From(Desde)]),
    Tipos = Table.TransformColumnTypes(Origen, {
        {"tipo_prealerta", type text}, {"tipo_previsto", type text}, {"descripcion", type text},
        {"clave_serie", type text}, {"ambiente", type text}, {"cliente_id", type text},
        {"servicio_id", type text}, {"producto_id", type text}, {"canal_id", type text},
        {"moneda_id", type text}, {"duracion_ventana_minutos", Int64.Type}, {"metrica", type text},
        {"inicio", type datetime}, {"ultima_ventana", type datetime}, {"ventanas", Int64.Type},
        {"severidad", type text}, {"severidad_orden", Int64.Type},
        {"valor_observado", type number}, {"valor_esperado", type number}, {"umbral", type number},
        {"margen_consumido", type number}, {"margen_consumido_max", type number},
        {"minutos_estimados", Int64.Type}, {"activa", Int64.Type},
        {"resultado", type text}, {"resultado_orden", Int64.Type},
        {"alerta_real_ventana_fin", type datetime}, {"minutos_anticipacion", type number}
    }, "en-US"),
    // Texto corto para la tabla: "CLI_005 · PAGO_SERVICIOS · MOBILE"
    ConSerie = Table.AddColumn(Tipos, "serie", each [cliente_id] & " · " & [servicio_id] & " · " & [canal_id], type text),
    // "Cruza en ~15 min" solo para las activas
    ConCruce = Table.AddColumn(ConSerie, "cruza_en", each if [activa] = 1 then "~" & Text.From([minutos_estimados]) & " min" else null, type text)
in
    ConCruce
