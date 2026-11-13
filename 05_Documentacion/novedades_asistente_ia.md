# Asistente de IA de Helios (parche 28, 13/11/2026)

## Qué es

Un chat dentro de Helios: el botón **Asistente**, abajo a la derecha en todas las páginas, y el botón **¿Qué está pasando?** al lado de las acciones de cada alerta. Responde en lenguaje simple con los datos de Helios, **solo con lo que el perfil de quien pregunta puede ver**, y **nunca hace nada solo**: si sugiere una acción, muestra una tarjeta con un botón **Hacerlo** y la persona decide.

Corre en **Workers AI**, dentro de Cloudflare. No hace falta otra cuenta ni clave, y los datos no salen de Cloudflare.

## Cómo activarlo (una sola vez)

1. **Base de datos.** En Cloudflare › Storage & databases › D1 › `helios-monitoring-dev` › Console, correr el bloque de `02_Base_de_datos_D1/11_asistente_d1.txt` (1 línea). Crea la tabla `asistente_uso`.
2. **Conectar Workers AI al Worker.** Compute › Workers › `worker-alertas-cron` › Settings › Bindings › **Add binding** › **Workers AI**. Nombre de la variable: **`AI`**. Guardar. No hay que tocar nada en la sección AI › Workers AI del panel: viene activada con la cuenta.
3. **Publicar** `01_Worker/worker_alertas_cron.js` (Edit code › pegar › Deploy).
4. **Probar:** entrar con cada perfil, abrir el Asistente y tocar las preguntas sugeridas.

Opcional, en Settings › Variables and Secrets (tipo Text):

| Variable | Para qué | Por defecto |
|---|---|---|
| `ASISTENTE_MODELO` | Modelo de Workers AI | `@cf/qwen/qwen3-30b-a3b-fp8` |
| `ASISTENTE_POR_HORA` | Preguntas por persona por hora | 20 |
| `ASISTENTE_POR_DIA` | Preguntas por día, entre todos | 150 |

Sin el enlace `AI`, Helios funciona igual y el panel avisa que el asistente todavía no está configurado.

## Qué puede preguntar cada perfil

| Perfil | Preguntas sugeridas | Qué datos puede usar | ¿Propone acciones? |
|---|---|---|---|
| **Soporte** | ¿Qué tengo pendiente y por dónde empiezo? · ¿Qué está pasando? en sus alertas | Sus alertas y las de sus equipos; el detalle y casos parecidos solo de lo suyo | Tomar, comentar, devolver, resolver (lo suyo) |
| **Analista** | Resumen del turno · ¿Qué está sin asignar y a quién lo derivo? · ¿Hay alertas relacionadas? · ¿Qué pre-alertas conviene avisar? | Alertas abiertas, pre-alertas, carga por equipo, equipos y personas para derivar, estado por cliente, incidentes | Derivar, comentar, resolver |
| **Gerente** | ¿Cómo está la operación ahora? · ¿Qué cliente tuvo más problemas este mes? | Estado por cliente, incidentes y tiempos de resolución, detalle de una alerta | No |
| **Administrador** | ¿Qué umbrales conviene revisar? · ¿Cómo está la operación ahora? | Lo del tablero en lectura, posibles falsas alarmas y umbrales configurados | No (recomienda; los cambios los hace en Administración) |

Si alguien pregunta algo que su perfil no ve (por ejemplo, el Gerente pide la lista de alertas abiertas), el asistente responde que esa información no está disponible para su perfil. El control está en el servidor: aunque el modelo intente pedir esos datos, el servidor no se los da.

## Cómo funciona por dentro

- El modelo **no consulta la base**. Usa "herramientas" del servidor, de solo lectura, y cada una exige el mismo permiso que la pantalla equivalente.
- Las **preguntas sugeridas** y **¿Qué está pasando?** traen los datos directo y hacen una sola llamada al modelo. Las preguntas libres usan hasta 3 llamadas y 5 herramientas.
- Las **acciones** son propuestas validadas (la alerta existe, el perfil puede hacerlo, el destino es de Soporte). Se ejecutan recién con **Hacerlo**, por las rutas de siempre: quedan en el historial y la auditoría a nombre de la persona.
- **Consumo de D1:** lee del caché del tablero y por índice; unas 15 a 20 consultas por pregunta. Escribe 2 filas por pregunta: el contador de uso y la auditoría (acción "Consultó al asistente", con el texto de la pregunta).
- **Consumo de Workers AI:** el cupo gratuito es de 10.000 neuronas por día para toda la cuenta. Con el modelo por defecto, una pregunta usa unas 30 a 70 neuronas, así que entran unas 150 a 300 preguntas por día. Por eso el tope de 150 por día.
- **Seguridad:** los comentarios y textos que vienen de la base se le pasan como datos, con la indicación de que no son órdenes. Aunque un texto intentara "convencerlo", no puede leer fuera del perfil ni ejecutar nada. La respuesta se muestra como texto (sin HTML).

## Problemas comunes

| Qué pasa | Qué revisar |
|---|---|
| "Falta conectar Workers AI al Worker" | El enlace `AI` (paso 2) y volver a publicar |
| "Falta crear la tabla asistente_uso" | Correr `11_asistente_d1.txt` (paso 1) |
| "Llegaste al máximo de preguntas por hora" / "de hoy" | Los límites; se pueden subir con las variables, cuidando el cupo de neuronas |
| "El asistente no pudo responder ahora" | Workers AI falló o se pasó el cupo diario de neuronas (se ve en AI › Workers AI › uso). Probar más tarde |
| Respuestas pobres o en otro idioma | Probar otro modelo con `ASISTENTE_MODELO`, por ejemplo `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (mejor en español, unas 5 veces más neuronas por pregunta: bajar `ASISTENTE_POR_DIA` a 30) |

## Probarlo en la PC sin Cloudflare

```bash
cd 07_Codigo_fuente/worker
node --no-warnings mkdb.mjs ../pruebas/base.sqlite prueba.sqlite
ASISTENTE_LOCAL=simulado node --no-warnings servidor_local.mjs prueba.sqlite
```

En modo simulado, el asistente no razona: muestra qué datos recibió. Sirve para ver la pantalla y comprobar los permisos de cada perfil. En Windows (cmd): `set ASISTENTE_LOCAL=simulado` antes del segundo comando.
