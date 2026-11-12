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
        {"alerta_real_ventana_fin", type datetime}, {"minutos_anticipacion", Int64.Type}
    }, "en-US"),
    ConSerie = Table.AddColumn(Tipos, "serie", each [cliente_id] & " · " & [servicio_id] & " · " & [canal_id], type text),
    ConCruce = Table.AddColumn(ConSerie, "cruza_en", each if [activa] = 1 then "~" & Text.From([minutos_estimados]) & " min" else null, type text),
    // "Confirmada", "No se cumplió", "En observación"
    ConResultado = Table.AddColumn(ConCruce, "resultado_txt", each
        if [resultado] = "CONFIRMADA" then "Confirmada"
        else if [resultado] = "NO_SE_CUMPLIO" then "No se cumplió"
        else "En observación", type text),
    // "avisó 30 min antes"
    ConAnticipo = Table.AddColumn(ConResultado, "anticipacion_txt", each
        if [minutos_anticipacion] = null then "—" else Text.From([minutos_anticipacion]) & " min", type text)
in
    ConAnticipo
