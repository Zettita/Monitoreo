let
    Tabla = #table(
        type table [estado = text, estado_orden = Int64.Type],
        {
            {"ABIERTA",    1},
            {"RECONOCIDA", 2},
            {"RESUELTA",   3}
        })
in
    Tabla
