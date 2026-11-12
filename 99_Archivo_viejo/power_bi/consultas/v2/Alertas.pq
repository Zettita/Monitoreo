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
    ConHora  = Table.AddColumn(ConFecha, "hora", each Time.Hour([ventana_inicio]), Int64.Type),
    // ---- Columnas "para humanos" (solo para mostrar en tablas) ----
    Nombres = [VOLUMEN_BAJO = "Volumen bajo", VOLUMEN_ALTO = "Volumen alto", APROBACION_BAJA = "Aprobación baja",
               RECHAZO_ALTO = "Rechazo alto", ERROR_ALTO = "Error alto", IMPORTE_ALTO = "Importe alto",
               IMPORTE_BAJO = "Importe bajo", LATENCIA_ALTA = "Latencia alta", SIN_EXITOS = "Sin éxitos",
               DATO_TARDIO = "Dato tardío", DATO_INCONSISTENTE = "Dato inconsistente",
               SIN_PREDICCION = "Sin predicción", VENTANA_FALTANTE = "Ventana faltante"],
    // minutos -> "2 d 3 h 15 min"
    Duracion = (m as nullable number) as nullable text =>
        if m = null then null else
        let t = Number.Round(m), d = Number.IntegerDivide(t, 1440),
            h = Number.IntegerDivide(Number.Mod(t, 1440), 60), mi = Number.Mod(t, 60)
        in (if d > 0 then Text.From(d) & " d " else "") & (if d > 0 or h > 0 then Text.From(h) & " h " else "") & Text.From(mi) & " min",
    // valor según la métrica: tasas en %, importe en $ M, latencia en ms
    Valor = (v as nullable number, metrica as nullable text) as text =>
        if v = null then "—"
        else if metrica <> null and Text.StartsWith(metrica, "tasa") then Number.ToText(v * 100, "N1", "es-AR") & " %"
        else if metrica = "importe_total" then "$ " & Number.ToText(v / 1000000, "N1", "es-AR") & " M"
        else if metrica = "tiempo_respuesta_promedio" then Number.ToText(v, "N0", "es-AR") & " ms"
        else if metrica = "demora_recepcion_minutos" then Number.ToText(v, "N0", "es-AR") & " min"
        else Number.ToText(v, "N0", "es-AR"),
    // desvío: en puntos para tasas, en % para el resto
    Desvio = (v as nullable number, metrica as nullable text) as text =>
        if v = null then "—"
        else if metrica <> null and Text.StartsWith(metrica, "tasa") then Number.ToText(v * 100, "+0.0;-0.0", "es-AR") & " pts"
        else Number.ToText(v * 100, "+0;-0", "es-AR") & " %",
    C1 = Table.AddColumn(ConHora, "alerta", each Record.FieldOrDefault(Nombres, [tipo_alerta], [tipo_alerta]), type text),
    C2 = Table.AddColumn(C1, "observado_txt", each Valor([valor_observado], [metrica]), type text),
    C3 = Table.AddColumn(C2, "esperado_txt", each Valor([valor_esperado], [metrica]), type text),
    C4 = Table.AddColumn(C3, "umbral_txt", each if [tipo_alerta] = "DATO_INCONSISTENTE" then "± " & Number.ToText([umbral] * 100, "N1", "es-AR") & " pts" else Valor([umbral], [metrica]), type text),
    C5 = Table.AddColumn(C4, "desvio_txt", each Desvio([desvio], [metrica]), type text),
    C6 = Table.AddColumn(C5, "tiempo_abierta", each Duracion([minutos_abierta]), type text),
    C7 = Table.AddColumn(C6, "estado_txt", each Text.Proper([estado]), type text)
in
    C7
