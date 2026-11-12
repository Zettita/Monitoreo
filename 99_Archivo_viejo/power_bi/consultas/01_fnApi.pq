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
