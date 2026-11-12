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
    }, "en-US"),
    Nombres = [VOLUMEN_BAJO = "Volumen bajo", VOLUMEN_ALTO = "Volumen alto", APROBACION_BAJA = "Aprobación baja",
               RECHAZO_ALTO = "Rechazo alto", ERROR_ALTO = "Error alto", IMPORTE_ALTO = "Importe alto",
               IMPORTE_BAJO = "Importe bajo", LATENCIA_ALTA = "Latencia alta", SIN_EXITOS = "Sin éxitos",
               DATO_TARDIO = "Dato tardío", DATO_INCONSISTENTE = "Dato inconsistente",
               SIN_PREDICCION = "Sin predicción", VENTANA_FALTANTE = "Ventana faltante"],
    Duracion = (m as nullable number) as nullable text =>
        if m = null then null else
        let t = Number.Round(m), d = Number.IntegerDivide(t, 1440),
            h = Number.IntegerDivide(Number.Mod(t, 1440), 60), mi = Number.Mod(t, 60)
        in (if d > 0 then Text.From(d) & " d " else "") & (if d > 0 or h > 0 then Text.From(h) & " h " else "") & Text.From(mi) & " min",
    C1 = Table.AddColumn(Tipos, "alerta", each Record.FieldOrDefault(Nombres, [tipo_alerta], [tipo_alerta]), type text),
    C2 = Table.AddColumn(C1, "duracion_txt", each Duracion([duracion_minutos]), type text),
    C3 = Table.AddColumn(C2, "estado_txt", each Text.Proper([estado_incidente]), type text)
in
    C3
