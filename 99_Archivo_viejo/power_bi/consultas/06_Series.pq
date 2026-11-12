let
    Cols  = {"clave_serie", "ambiente", "cliente_id", "servicio_id", "producto_id",
             "canal_id", "moneda_id", "duracion_ventana_minutos"},
    Union = Table.Combine({
        Table.SelectColumns(Alertas, Cols),
        Table.SelectColumns(Comparacion, Cols),
        Table.SelectColumns(Incidentes, Cols)
    }),
    Distintas = Table.Distinct(Union, {"clave_serie"}),
    Etiqueta  = Table.AddColumn(Distintas, "serie",
        each [cliente_id] & " · " & [servicio_id] & " · " & [canal_id], type text)
in
    Etiqueta
