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

## Ajustes después de las pruebas reales (parche 29e, 13/11)

Sin SQL: solo publicar el Worker.
- Las preguntas sugeridas responden con una estructura fija y más corta (por ejemplo, el Resumen del turno: **Ahora**, **Quién tiene qué**, **Demoradas**, **Viene empeorando**, **Para hacer**).
- "¿Qué está sin asignar?" ya no confunde una alerta asignada sin tomar con una sin asignar.
- Soporte recibe el botón **Hacerlo** para tomar la primera alerta pendiente.
- Umbrales: 100 % se explica como "la banda del modelo, sin cambios".
- Contexto externo: títulos en español, en **Helios** solo lo que la afecta (Workers, D1, Workers AI), **Qué vigilar** concreto y calendario con la fecha real aunque esté el reloj de la demo. Para que el calendario siga el reloj de la demo (por ejemplo, para mostrar un feriado), agregar la variable `CONTEXTO_CALENDARIO` = `demo`.

## Contexto externo (parche 29, 13/11)

**Qué se le puede preguntar:** "¿Hay algo de afuera que pueda afectar hoy o mañana?", "¿qué eventos hay la semana que viene?", "¿mañana es feriado?", "¿hay problemas con algún proveedor?". También aparece como pregunta sugerida en los 4 perfiles.

**De dónde saca los datos** (nunca de memoria):

| Fuente | Qué trae | Costo |
|---|---|---|
| Calendario de Helios (tabla `feriados` y `eventos_comerciales`) | Feriados, fines de semana largos, primer día hábil después, cobro de sueldos (1.º a 4.º día hábil), aguinaldo, eventos comerciales | 1 consulta a la base |
| Páginas de estado de proveedores (Cloudflare y Twilio; se cambian con la variable `CONTEXTO_PROVEEDORES`) | Incidentes abiertos y mantenimientos de las próximas 48 h | Una vez por hora como mucho |
| Noticias (Google Noticias Argentina; si no responde, GDELT) | Titulares de Argentina de las últimas 48 h sobre paros bancarios, caídas, cortes de luz, BCRA, billeteras | Una vez por hora como mucho |

**Cómo activarlo:** correr `02_Base_de_datos_D1/12_contexto_externo_d1.txt` (5 bloques, uno por vez) y publicar el Worker. No hace falta ninguna clave.

**Variables opcionales del Worker** (Settings → Variables): `CONTEXTO_EXTERNO = apagado` (solo calendario, sin salir a internet); `CONTEXTO_PROVEEDORES = [{"nombre":"Mi proveedor","base":"https://status.miproveedor.com"}]` (páginas de estado tipo Statuspage, hasta 6); `CONTEXTO_NOTICIAS_CONSULTA` (la búsqueda de noticias, como en Google Noticias).

**Eventos comerciales:** Administración → Umbrales → "Eventos comerciales" → "Agregar evento". Nombre, desde, hasta, cliente y servicio (opcionales) y si se espera más o menos tráfico.

**Problemas comunes:**
- *"Cloudflare: no respondió a tiempo"*: la página de estado tardó más de 5 segundos. Se usa lo último guardado y se vuelve a probar en una hora.
- *Las noticias no tienen que ver*: son titulares automáticos; el asistente solo debería mencionar los que afectan pagos o transferencias. Se puede afinar la búsqueda con `CONTEXTO_NOTICIAS_CONSULTA`.
- *En la demo el calendario dice otra fecha*: el calendario usa el reloj de Helios (en la demo, el 26/10); proveedores y noticias son siempre de hoy.

**Qué muestra de los proveedores (desde el parche 29b):** primero, aparte, lo de Cloudflare Workers o D1, porque Helios corre ahí y puede afectar a la plataforma misma. Después, lo que menciona Argentina o la región. Lo global, solo si es de impacto importante o grave. Lo de otros países y lo menor sin lugar no se muestra.
