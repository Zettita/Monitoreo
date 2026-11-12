let
    Origen = fnApi("estado"),
    Tipos = Table.TransformColumnTypes(Origen, {
        {"datos_al", type datetime}, {"reloj_simulado", Int64.Type},
        {"generado_en", type datetime}, {"alertas_activas", Int64.Type},
        {"criticas_activas", Int64.Type}, {"ultima_ventana_recibida", type datetime},
        {"ultima_recepcion", type datetime}
    }, "en-US")
in
    Tipos
