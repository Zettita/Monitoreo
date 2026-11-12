// =====================================================================
// Consultas de Power Query para el tablero de alertas
//
// En Power BI Desktop: Inicio → Transformar datos → Editor de Power Query.
// Crear cada bloque como una consulta nueva (Nuevo origen → Consulta en
// blanco → Editor avanzado → pegar) con el nombre indicado en el título.
//
// Orden: 1) parámetros, 2) fnApi, 3) tablas de datos, 4) dimensiones.
// =====================================================================


// ---------------------------------------------------------------------
// 1) PARÁMETROS  (Inicio → Administrar parámetros → Nuevo, tipo Texto)
//
//   ApiUrl    https://api-alertas.<tu-subdominio>.workers.dev   (sin / final)
//   ApiToken  el mismo valor que cargaste con  wrangler secret put API_TOKEN
//   Desde     2026-10-01        (fecha UTC desde la que se traen los datos)
// ---------------------------------------------------------------------


// ---------------------------------------------------------------------
// 2) fnApi   (función: llama al Worker y arma la tabla)
// ---------------------------------------------------------------------
(endpoint as text, optional consulta as record) as table =>
let
    Respuesta = Web.Contents(
        ApiUrl,
        [
            RelativePath = "api/" & endpoint,
            Query        = if consulta = null then [] else consulta,
            Headers      = [Authorization = "Bearer " & ApiToken]
        ]
    ),
    Json  = Json.Document(Respuesta),
    Tabla = Table.FromRows(Json[rows], Json[columns])
in
    Tabla


// ---------------------------------------------------------------------
// 3a) Alertas
// ---------------------------------------------------------------------
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
        {"minutos_abierta", type number}, {"minutos_resolucion", type number},
        {"vigente", Int64.Type},
        {"metrica_id", type text}, {"prediccion_id", type text}
    }, "en-US"),
    ConFecha = Table.AddColumn(Tipos, "fecha", each DateTime.Date([ventana_inicio]), type date),
    ConHora  = Table.AddColumn(ConFecha, "hora", each Time.Hour([ventana_inicio]), Int64.Type)
in
    ConHora


// ---------------------------------------------------------------------
// 3b) Incidentes
// ---------------------------------------------------------------------
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


// ---------------------------------------------------------------------
// 3c) Comparacion   (observado vs esperado por ventana)
// ---------------------------------------------------------------------
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


// ---------------------------------------------------------------------
// 3d) Actualizacion   (una fila: "datos al", última ventana, etc.)
// ---------------------------------------------------------------------
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


// ---------------------------------------------------------------------
// 4a) Series   (dimensión: una fila por cliente/servicio/producto/canal/moneda)
// ---------------------------------------------------------------------
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


// ---------------------------------------------------------------------
// 4b) Severidad   (dimensión fija: orden y color)
// ---------------------------------------------------------------------
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


// ---------------------------------------------------------------------
// 4c) Estado alerta   (dimensión fija)
// ---------------------------------------------------------------------
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
