let
    Origen = fnApi("comparacion", [desde = if Desde is date then Date.ToText(Desde, "yyyy-MM-dd") else Text.From(Desde)]),
    Texto  = {"metrica_id", "prediccion_id", "clave_serie", "ambiente", "cliente_id",
              "servicio_id", "producto_id", "canal_id", "moneda_id", "origen_dato",
              "modelo_id", "modelo_version"},
    Fechas = {"ventana_inicio", "ventana_fin", "fecha_recepcion"},
    Numeros = List.Difference(Table.ColumnNames(Origen), Texto & Fechas),
    Tipos = Table.TransformColumnTypes(Origen,
        List.Transform(Texto,   each {_, type text}) &
        List.Transform(Fechas,  each {_, type datetime}) &
        List.Transform(Numeros, each {_, type number}),
        "en-US")
in
    Tipos
