let
    Tabla = #table(
        type table [severidad = text, severidad_orden = Int64.Type, color = text],
        {
            {"CRITICA", 1, "#C0392B"},
            {"ALTA",    2, "#E67E22"},
            {"MEDIA",   3, "#F1C40F"},
            {"BAJA",    4, "#95A5A6"}
        })
in
    Tabla
