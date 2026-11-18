// Arma los dos Word de modelos de IA con el estilo Helios.
// Uso: node modelos_ia_build.js <carpeta de salida> cliente|tecnico
// Después: python indice_word.py <archivo.docx> (índice con números de página, usando Word)
const path = require('path');
const H = require('./helios_docx.js');
const D = require('./modelos_ia_datos.js');
const { M, ESCENARIOS: E, usdConsulta, usdMes, usdMesCorto, costoConsulta, costoMes, mil, nf } = D;

const salida = process.argv[2] || '.';
const w = H.ANCHO;
const cols = (...fr) => { const t = fr.reduce((a, b) => a + b, 0); const a = fr.map((f) => Math.floor((w * f) / t)); a[a.length - 1] += w - a.reduce((x, y) => x + y, 0); return a; };
const vinetas = (lista) => lista.map((t) => H.vineta(t));

// ───────────────────────────── Documento para el cliente ─────────────────────────────
async function documentoCliente() {
  const h = [];
  h.push(...H.cabecera('Inteligencia artificial en Helios', 'Opciones de modelo: beneficios, costos y privacidad', 'Propuesta'));
  h.push(...H.marcaIndice());

  h.push(H.titulo(1, '1. Resumen'));
  h.push(H.P('Helios ya tiene un asistente de inteligencia artificial que ayuda a las personas a entender qué está pasando con las alertas. Ahora hay que decidir **qué modelo de IA** lo hace funcionar. Comparamos cuatro caminos posibles y proponemos uno.'));
  h.push(...H.nota('idea', 'Lo que proponemos', 'seguir con el modelo actual mientras Helios esté en la nube y, cuando esté el servidor propio, **pasar a un modelo que corra dentro de la empresa**. Así los datos de los clientes no salen de la empresa y casi no hay costo mensual. Un proveedor externo queda como respaldo opcional, solo si ustedes lo aprueban.'));
  h.push(H.P('Lo que hay que saber en pocas líneas:'));
  h.push(...vinetas([
    '**La IA no decide ni ejecuta nada.** Propone y una persona confirma. Además, solo ve lo que el perfil de esa persona puede ver.',
    '**Hoy cuesta casi nada:** con el uso actual (150 consultas por día) el costo es USD 0 por mes.',
    '**Un servicio externo de primer nivel** responde mejor en casos difíciles, pero cuesta más a medida que crece el uso (de USD 5 a USD 99 por mes con el uso actual, según el modelo) y los datos salen de la empresa.',
    '**Un modelo propio** exige comprar una placa de video (GPU) y mantenerla, pero los datos no salen y el costo por consulta es prácticamente cero.',
    '**Antes de elegir definitivamente** hacemos una prueba comparativa con casos reales de Helios. Los modelos cambian rápido y conviene decidir con datos propios.',
  ]));

  h.push(H.titulo(1, '2. Qué hace la IA en Helios'));
  h.push(H.P('La IA trabaja en tareas de lectura y redacción. No cambia alertas, no deriva y no resuelve por sí sola.'));
  h.push(...H.tabla(['Función', 'Qué hace', 'Estado'], cols(3, 6, 2), [
    ['Asistente de preguntas', 'Responde preguntas como "¿Cómo está la operación?" o "¿Qué incidentes están activos y quién los trabaja?", según el perfil de quien pregunta.', 'Funcionando'],
    ['"¿Qué está pasando?"', 'Explica una alerta en palabras simples y sugiere qué mirar primero.', 'Funcionando'],
    ['Resumen del turno', 'Cuenta qué quedó pendiente, qué está demorado y qué conviene atender primero.', 'Funcionando'],
    ['Contexto de afuera', 'Avisa si hay feriados, eventos comerciales, incidentes de proveedores o noticias que puedan afectar la operación.', 'Funcionando'],
    ['Borradores de correo y comunicados', 'Redacta el texto del aviso a partir de los datos de la alerta, para que una persona lo revise.', 'Propuesto'],
    ['Análisis automático de cada alerta nueva', 'Deja una explicación breve y posibles causas apenas se abre una alerta.', 'Propuesto'],
  ], true));
  h.push(...H.nota('regla', 'Regla de seguridad', 'la IA solo propone acciones. Quien decide es siempre una persona, y cada pregunta queda registrada en la auditoría de Helios.'));

  h.push(H.titulo(1, '3. Las cuatro opciones'));
  h.push(H.P('Cada opción responde a una pregunta distinta: dónde corre el modelo y quién lo mantiene.'));

  h.push(H.titulo(2, 'Opción A. Servicio en la misma nube de Helios (hoy)'));
  h.push(H.P('El modelo corre en Cloudflare, la misma plataforma donde hoy está Helios. Es la opción que ya está funcionando, con un modelo de código abierto (Qwen3).'));
  h.push(H.titulo(3, 'Ventajas'));
  h.push(...vinetas(['Ya está instalada y probada con los cuatro perfiles.', 'Sin inversión inicial ni equipos que mantener.', 'Costo mínimo: gratis hasta unas 170 consultas por día y unos USD 16 por mes con 1.000 por día.']));
  h.push(H.titulo(3, 'A tener en cuenta'));
  h.push(...vinetas(['Los datos de las consultas se procesan en servidores de Cloudflare, fuera de la empresa.', 'Pierde sentido cuando Helios se mude al servidor propio: dependería de internet y de esa cuenta.', 'La calidad es buena para resumir y explicar, pero menor que la de los servicios de primer nivel en casos complejos.']));

  h.push(H.titulo(2, 'Opción B. Proveedor externo de primer nivel'));
  h.push(H.P('Se contrata el servicio de un proveedor especializado: Claude (Anthropic), GPT (OpenAI) o Gemini (Google). Cada uno ofrece modelos chicos y baratos y modelos grandes y más capaces.'));
  h.push(H.titulo(3, 'Ventajas'));
  h.push(...vinetas(['Las mejores respuestas disponibles: entienden mejor el contexto y redactan mejor en español.', 'No hay equipos propios: el proveedor se ocupa de la disponibilidad y de actualizar el modelo.', 'Se paga solo lo que se usa y se puede poner un tope de gasto.']));
  h.push(H.titulo(3, 'A tener en cuenta'));
  h.push(...vinetas(['Los datos de los clientes (nombres, servicios, métricas) viajan al proveedor. Requiere aprobación de la empresa y revisar el contrato.', 'El costo crece con el uso y los precios cambian. Por ejemplo, el de Gemini Flash se duplica el 1/1/2027.', 'Si no hay internet, el asistente deja de funcionar (el resto de Helios sigue igual).', 'Los proveedores retiran modelos viejos cada tanto y hay que migrar.']));

  h.push(H.titulo(2, 'Opción C. Modelo propio en el servidor de la empresa'));
  h.push(H.P('El modelo corre en un servidor de la empresa con una placa de video (GPU). Se usan modelos de código abierto, sin costo de licencia, que se pueden mantener fijos todo el tiempo que se quiera.'));
  h.push(H.titulo(3, 'Ventajas'));
  h.push(...vinetas(['**Los datos no salen de la empresa.** Es la mejor respuesta si hay cláusulas de confidencialidad con los clientes.', 'Costo por consulta prácticamente cero (solo electricidad), sin importar cuánto se use.', 'Funciona sin internet y no depende de ningún proveedor ni de sus cambios de precio.']));
  h.push(H.titulo(3, 'A tener en cuenta'));
  h.push(...vinetas(['Hay que comprar la GPU y mantenerla: cotizarla con un proveedor local. Hoy una placa de 32 GB de memoria cuesta entre USD 6.200 y USD 11.900 por la escasez (el precio de lanzamiento era USD 1.999).', 'Si el servidor falla, el asistente se detiene hasta repararlo. Helios sigue funcionando sin él.', 'La calidad es parecida a la de la opción A (los mismos modelos), pero menor que la de los servicios de primer nivel en casos complejos.', 'Necesita una persona del equipo que se ocupe de actualizarlo y vigilarlo.']));

  h.push(H.titulo(2, 'Opción D. Combinada: propio con respaldo externo'));
  h.push(H.P('El modelo propio atiende todas las consultas. Si hay un caso difícil o el servidor propio no está disponible, se puede usar un proveedor externo, solo con datos sin nombres de clientes y solo si la empresa lo habilita.'));
  h.push(H.titulo(3, 'Ventajas'));
  h.push(...vinetas(['Privacidad por defecto y mejor calidad cuando hace falta.', 'El asistente sigue funcionando si se cae el servidor propio.', 'El gasto externo es muy bajo porque se usa solo en una fracción de los casos.']));
  h.push(H.titulo(3, 'A tener en cuenta'));
  h.push(...vinetas(['Es lo más completo, pero también lo más trabajoso de armar y de explicar a los clientes.', 'Hay que definir y controlar qué datos pueden salir y cuáles no.']));

  h.push(H.titulo(1, '4. Comparación'));
  h.push(...H.tabla(['Criterio', 'A. Nube actual', 'B. Proveedor externo', 'C. Modelo propio', 'D. Combinada'], cols(2.4, 2, 2, 2, 2), [
    ['Datos de los clientes', 'Salen a Cloudflare', 'Salen al proveedor', '**No salen**', 'No salen (salvo respaldo aprobado)'],
    ['Calidad de las respuestas', 'Buena', '**La mejor**', 'Buena', 'Buena, y la mejor cuando hace falta'],
    ['Costo mensual con el uso actual', '**USD 0**', 'USD 5 a USD 99', 'Electricidad', 'Electricidad (más USD 0 a 5 si hay respaldo)'],
    ['Inversión inicial', '**Ninguna**', 'Ninguna', 'GPU y servidor', 'GPU y servidor'],
    ['Si crece el uso', 'Sube de a poco', 'Sube en proporción', '**No cambia el costo**', 'Casi no cambia'],
    ['Funciona sin internet', 'No', 'No', '**Sí**', 'Sí (sin respaldo)'],
    ['Quién lo mantiene', 'Cloudflare', 'El proveedor', 'Nuestro equipo y la empresa', 'Nuestro equipo y la empresa'],
    ['Listo para usar', '**Hoy**', 'Requiere una integración chica', 'Cuando esté la GPU', 'Cuando esté la GPU'],
  ], true));

  h.push(H.titulo(1, '5. Costos estimados'));
  h.push(H.P(`Calculamos el costo mensual con una consulta típica: unas 4.500 palabras de datos de entrada y 750 de respuesta. Son valores orientativos en dólares, sin impuestos, con los precios publicados al ${D.FECHA}.`));
  const filaE = (etq, ids) => [etq, ...E.map((e) => ids.map((id) => usdMesCorto(costoMes(M[id], e))).join(' a '))];
  h.push(...H.tabla(['Opción y modelo', ...E.map((e) => `${e.nombre} (${mil(e.porDia)} por día)`)], cols(3.4, 2, 2, 2), [
    ['**A.** Qwen3 30B-A3B en Cloudflare (hoy)', ...E.map((e) => usdMesCorto(costoMes(M.wai_qwen, e)))],
    ['**B.** Modelo chico de un proveedor (Claude Haiku, GPT Luna)', ...E.map((e) => usdMesCorto(costoMes(M.haiku, e)))],
    ['**B.** Modelo intermedio (GPT Terra, Gemini Flash)', ...E.map((e) => `${usdMesCorto(costoMes(M.terra, e))} a ${usdMesCorto(costoMes(M.gem_2027, e))}`)],
    ['**B.** Modelo grande (Claude Sonnet)', ...E.map((e) => usdMesCorto(costoMes(M.sonnet, e)))],
    ['**C.** Modelo propio', 'Electricidad', 'Electricidad', 'Electricidad'],
  ], true));
  h.push(H.P('El modelo propio no tiene costo por consulta, pero sí una inversión inicial y costos fijos:'));
  h.push(...H.tabla(['Concepto', 'Valor orientativo'], cols(4, 6), [
    ['Placa de video (GPU) de 32 GB', 'USD 6.200 a USD 11.900 hoy en el mercado (precio de lanzamiento: USD 1.999). Cotizar con un proveedor local.'],
    ['Placa profesional de 96 GB (para modelos más grandes)', 'A cotizar. Alquilada, ronda los USD 1.600 por mes.'],
    ['Servidor que la aloje', 'A cotizar. El servidor propio ya está previsto; hay que sumarle la GPU y una fuente de energía adecuada.'],
    ['Electricidad', 'Estimado: unos 150 kWh por mes en reposo; más cuando responde.'],
    ['Mantenimiento', 'Unas pocas horas por mes de una persona del equipo.'],
  ], true));
  h.push(...H.nota('idea', 'Cómo leerlo', 'con el uso actual, un modelo propio **no ahorra plata** frente a un modelo chico de un proveedor (USD 5 por mes). Lo que aporta es **privacidad y control**. Frente a un modelo grande con uso intenso (USD 3.300 por mes) sí se amortizaría en pocos meses (la GPU de 32 GB, en 2 a 4), siempre que el modelo propio alcance para ese uso, algo que hay que medir.'));

  h.push(H.titulo(1, '6. Privacidad y seguridad'));
  h.push(H.P('Cuando alguien le pregunta algo al asistente, Helios le arma al modelo un resumen con lo que esa persona puede ver: clientes, servicios, estado de las alertas y comentarios. No se le da acceso a la base de datos.'));
  h.push(...vinetas([
    '**Con un modelo propio (C)**, ese resumen nunca sale de la empresa.',
    '**Con Cloudflare (A) o un proveedor externo (B)**, el resumen se envía a un tercero. Los proveedores indican en sus condiciones comerciales cómo tratan esos datos. Por ejemplo, Google aclara que solo los planes pagos no usan los datos para mejorar sus productos. Hay que contratar el plan pago y revisar el contrato.',
    '**Los permisos se controlan en Helios**, no en el modelo: Soporte ve lo suyo, el Gerente lee, el Administrador configura.',
    '**Todo queda registrado:** quién preguntó, cuándo y qué.',
    '**Límites de uso** por persona y por día para evitar abusos y gastos inesperados.',
  ]));

  h.push(H.titulo(1, '7. Recomendación y plan por etapas'));
  h.push(...H.tabla(['Etapa', 'Qué se hace', 'Cuándo'], cols(1.6, 6, 2.4), [
    ['1. Ahora', 'Seguir con el modelo actual (A). Sin costo ni cambios. En paralelo, armar una prueba comparativa con casos reales de Helios.', 'Inmediato'],
    ['2. Con el servidor propio', 'Pasar a un modelo propio (C) con una GPU de 32 GB como mínimo. Si la prueba lo pide, evaluar una de 96 GB.', 'Cuando esté el servidor y la GPU'],
    ['3. Opcional', 'Sumar un proveedor externo como respaldo (D), solo con datos sin nombres de clientes y con aprobación expresa.', 'Si la empresa lo aprueba'],
  ], true));
  h.push(...H.nota('decision', 'Por qué esta secuencia', 'cuesta casi nada hoy, evita comprar equipos antes de saber cuál alcanza, y deja las decisiones sobre datos en manos de la empresa.'));

  h.push(H.titulo(1, '8. Qué necesitamos que nos definan'));
  h.push(...vinetas([
    '**Datos de clientes:** ¿pueden salir de la empresa hacia un proveedor externo? ¿Hay cláusulas de confidencialidad que lo impidan?',
    '**Presupuesto:** ¿hay fondos para una GPU? ¿Cuál es el tope mensual aceptable para un servicio externo?',
    '**Uso esperado:** ¿cuántas personas usarán el asistente y en qué turnos?',
    '**Nuevos usos:** ¿se aprueba el análisis automático de cada alerta nueva y los borradores de correo?',
    '**Servidor:** ¿cuándo estará disponible, qué características tiene y quién lo mantiene?',
    '**Proveedores aprobados:** si hay una lista de proveedores de IA que la empresa ya acepta, usarla.',
  ]));

  h.push(H.titulo(1, '9. Próximos pasos'));
  h.push(...vinetas([
    'Elegir con ustedes las preguntas y casos para la prueba comparativa (unos 40 casos reales de Helios).',
    'Probar los modelos candidatos con esos casos y compartir el resultado: calidad, velocidad y costo.',
    'Con el resultado y las respuestas de la sección anterior, cerrar la decisión y cotizar la GPU.',
  ]));
  h.push(H.P(`Los precios y modelos se verificaron el ${D.FECHA}. Cambian seguido: los volvemos a revisar antes de cerrar la decisión.`, { run: { size: 18, color: '5F5F5F' } }));

  return H.documento({ titulo: 'Inteligencia artificial en Helios: opciones de modelo', pie: 'Opciones de modelos de IA para Helios · Propuesta', hijos: h });
}

// ───────────────────────────── Documento para ingeniería ─────────────────────────────
async function documentoIngenieria() {
  const h = [];
  const q = (id) => usdConsulta(costoConsulta(M[id]));
  h.push(...H.cabecera('Modelos de IA para los agentes de Helios', 'Análisis técnico: opciones, costos, pros y contras', 'Documento para ingeniería'));
  h.push(...H.marcaIndice());

  h.push(H.titulo(1, '1. Resumen'));
  h.push(H.P('Hoy el asistente (parche 28 en adelante) corre en Workers AI con `@cf/qwen/qwen3-30b-a3b-fp8`. Cuando Helios se mude al servidor propio, ese camino deja de ser natural. Este documento compara seis opciones para el modelo de los agentes y deja una recomendación a validar con una prueba propia.'));
  h.push(...H.tabla(['#', 'Opción', 'Modelos de ejemplo', 'Datos', 'Costo con 150 por día', 'Inversión'], cols(0.5, 2.6, 3.4, 1.8, 1.8, 1.6), [
    ['1', 'Workers AI (hoy)', 'Qwen3 30B-A3B, gpt-oss-120b, Gemma 4 26B', 'Salen a Cloudflare', usdMesCorto(costoMes(M.wai_qwen, E[0])) + ' a ' + usdMesCorto(costoMes(M.wai_gptoss, E[0])), 'Ninguna'],
    ['2', 'API de Anthropic', 'Claude Haiku 5.5, Sonnet 5.5', 'Salen al proveedor', usdMesCorto(costoMes(M.haiku, E[0])) + ' a ' + usdMesCorto(costoMes(M.sonnet, E[0])), 'Ninguna'],
    ['3', 'API de OpenAI', 'GPT-6 Luna, GPT-6.1 Terra', 'Salen al proveedor', usdMesCorto(costoMes(M.luna, E[0])) + ' a ' + usdMesCorto(costoMes(M.terra, E[0])), 'Ninguna'],
    ['4', 'API de Google', 'Gemini 3.8 Flash', 'Salen al proveedor', usdMesCorto(costoMes(M.gem_hoy, E[0])) + ' a ' + usdMesCorto(costoMes(M.gem_2027, E[0])), 'Ninguna'],
    ['5', 'Local en el servidor propio', 'Qwen3.6-35B-A3B, gpt-oss-120b, GLM-4.7-Flash', '**No salen**', 'Electricidad', 'GPU y servidor'],
    ['6', 'Híbrido', 'Local por defecto y API como respaldo', 'No salen (salvo respaldo)', 'Electricidad + poco', 'GPU y servidor'],
  ], true));
  h.push(...H.nota('decision', 'Recomendación', '(a) mantener Workers AI con Qwen3 mientras Helios siga en Cloudflare; (b) con el servidor propio, pasar a un **modelo local de la misma familia (Qwen3.6-35B-A3B) servido con vLLM**, porque conserva el comportamiento sobre el que ya ajustamos las instrucciones (parches 28b a 29e); (c) dejar la interfaz del modelo desacoplada para poder sumar una API externa como respaldo (opción 6) si el cliente lo aprueba. Todo sujeto a la prueba comparativa de la sección 9.'));
  h.push(...H.nota('regla', 'Supuestos que conviene validar', 'los costos usan 6.000 tokens de entrada y 1.000 de salida por consulta (coincide con lo medido en Workers AI: unas 58 neuronas). Los precios son de la fecha del documento. Los rendimientos de los modelos locales vienen de pruebas de terceros chicas; los confirmamos con nuestro propio set.'));

  h.push(H.titulo(1, '2. Punto de partida: cómo funciona hoy'));
  h.push(...vinetas([
    '**Modelo:** variable `ASISTENTE_MODELO` (por defecto `@cf/qwen/qwen3-30b-a3b-fp8`) y enlace `AI` de Workers AI. Cambiar de modelo dentro de Workers AI es cambiar la variable.',
    '**El modelo no consulta la base.** Usa herramientas de solo lectura del servidor (`asistente_server.js`); cada una exige un permiso de `PERMISOS`. Si el modelo pide una que el perfil no tiene, el servidor la rechaza.',
    '**Nunca ejecuta:** propone con `sugerir_accion` (validada en el servidor) y la página muestra "Hacerlo".',
    '**Datos que llegan al modelo:** datos principales del perfil (`ASIST_BASE`), más hasta 3 herramientas según las palabras de la pregunta (`ASIST_PALABRAS`), ya resumidos en frases, con horas de Argentina y enlaces cambiados por códigos cortos (`[E1]`, `[N1]`).',
    '**Límites:** 600 caracteres por pregunta, 6 mensajes de historia, 20 por persona por hora (`ASISTENTE_POR_HORA`) y 150 por día en total (`ASISTENTE_POR_DIA`), para quedar bajo las 10.000 neuronas gratis por día.',
    '**Formato de respuesta:** el código acepta el formato OpenAI y el propio de Workers AI, y reintenta con los datos como texto si un modelo no acepta mensajes de herramienta. Esto facilita enchufar otros proveedores.',
  ]));
  h.push(H.titulo(2, '2.1 Lo que aprendimos con el modelo actual'));
  h.push(H.P('Estos problemas marcan qué pedirle al modelo siguiente:'));
  h.push(...H.tabla(['Problema visto', 'Qué hicimos', 'Qué implica para elegir modelo'], cols(3.3, 3.5, 3.2), [
    ['Qwen3 escribía la definición de las herramientas (`<tools>…</tools>`) en vez de usarlas (28b).', 'Datos base siempre incluidos, lectura de `<tool_call>` y reintento sin herramientas si hay eco.', 'Un modelo con llamadas a herramientas más confiables reduce el andamiaje.'],
    ['Negativas falsas ("no tengo acceso") y respuestas fuera de tema (28c, 28d).', 'Datos extra según la pregunta, regla de hablar solo de Helios.', 'Un modelo que sigue mejor las instrucciones largas.'],
    ['Datos mal interpretados ("sin asignar" de una alerta asignada), títulos `###`, falta de voseo (29e).', 'El servidor arma los datos en frases y cada pregunta lleva una guía de respuesta.', 'Cuanto más armado viene el dato, menos importa el tamaño del modelo.'],
    ['Enlaces largos rotos y respuestas cortadas (29d).', 'Códigos cortos y respuesta de hasta 900 tokens.', 'Contexto y longitud de salida suficientes.'],
  ], true));
  h.push(...H.nota('idea', 'Idea clave', 'la mayor parte de la calidad hoy viene del servidor (datos armados, guía por pregunta, permisos), no del modelo. Eso hace viable un modelo mediano y es la razón por la que probar antes de gastar en uno grande.'));

  h.push(H.titulo(1, '3. Qué le pedimos al modelo'));
  h.push(...H.tabla(['Requisito', 'Por qué importa en Helios', 'Cómo lo medimos'], cols(2.4, 4.2, 3.4), [
    ['Llamadas a herramientas confiables', 'Sin ellas hay que inyectar todos los datos en cada pregunta (más tokens, más costo).', 'Tasa de selección correcta y de argumentos válidos en el set de prueba.'],
    ['No inventar datos', 'Una alerta mal descrita lleva a una mala derivación.', 'Cero respuestas con datos que no estén en lo recibido.'],
    ['Español rioplatense', 'Texto de interfaz: voseo, sin jerga.', 'Revisión ciega por Ale y Hugo.'],
    ['Contexto de 16.000 a 64.000 tokens', 'Datos del perfil, historial de 6 mensajes y guía. Para agentes que encadenan herramientas, Ollama recomienda al menos 64.000.', 'Prueba con los casos más largos (Analista, 19 escenas).'],
    ['Latencia razonable', 'El asistente es interactivo.', 'Mediana y p95 por consulta. Meta propuesta: mediana menor a 8 s y p95 menor a 20 s.'],
    ['Costo previsible', 'Plan gratuito de Cloudflare hoy; presupuesto del cliente después.', 'Costo por consulta con los tokens reales.'],
    ['Privacidad y control', 'Los datos incluyen clientes, servicios y comentarios.', 'Dónde se procesa y quién conserva los datos.'],
    ['Estabilidad del modelo', 'Las instrucciones se ajustan a un modelo concreto.', 'Se puede fijar la versión o el proveedor la retira.'],
  ], true));

  h.push(H.titulo(1, '4. Precios y supuestos de consumo'));
  h.push(H.P(`Una consulta típica del asistente: ${mil(D.SUPUESTO.entrada)} tokens de entrada (instrucciones, definición de herramientas, datos del perfil e historial) y ${mil(D.SUPUESTO.salida)} de salida (incluye el razonamiento en los modelos que lo cobran como salida). Tres escenarios de uso mensual (30 días):`));
  h.push(...H.tabla(['Escenario', 'Consultas por día', 'Consultas por mes'], cols(3, 4, 3), E.map((e) => [e.nombre, e.detalle, mil(e.porDia * D.DIAS_MES)]), true));
  h.push(H.titulo(2, '4.1 Precio por millón de tokens'));
  h.push(...H.tabla(['Modelo', 'Vía', 'Entrada', 'Salida', 'Costo por consulta'], cols(3.6, 2.4, 1.2, 1.2, 1.8), D.MODELOS.map((m) => [m.nombre, m.via, 'USD ' + nf(m.ent, m.ent < 1 ? 3 : 2), 'USD ' + nf(m.sal, m.sal < 1 ? 3 : 2), usdConsulta(costoConsulta(m))])));
  h.push(H.titulo(2, '4.2 Costo mensual por escenario'));
  h.push(...H.tabla(['Modelo', ...E.map((e) => `${e.nombre} (${mil(e.porDia)} por día)`)], cols(3.8, 2, 2, 2), D.MODELOS.map((m) => [m.nombre, ...E.map((e) => usdMesCorto(costoMes(m, e)))])));
  h.push(...H.nota('regla', 'Cómo leer la tabla', 'en Workers AI se descuentan las 10.000 neuronas diarias gratis (alcanzan para unas 170 consultas por día con Qwen3 30B-A3B) y, al pasar ese cupo, hace falta el plan Workers Paid. En el resto no hay cupo gratis. No incluye impuestos ni percepciones sobre servicios del exterior.'));
  h.push(H.titulo(2, '4.3 Qué mueve el costo'));
  h.push(...vinetas([
    '**Tokens de entrada:** son cerca de la mitad del gasto (48 a 55 % con este supuesto). Bajarlos con datos más resumidos rinde más que cambiar de modelo.',
    '**Razonamiento:** Gemini 3.8 Flash y otros cobran los tokens de razonamiento como salida. Con razonamiento medio, una consulta puede duplicar los 1.000 tokens de salida supuestos y el costo sube cerca de un 45 %.',
    '**Caché de prompt:** las instrucciones y la definición de herramientas se repiten en cada consulta. Anthropic y OpenAI descuentan alrededor del 90 % sobre la parte cacheada. No lo restamos acá: es una mejora a medir.',
    '**Lotes (batch):** 50 % de descuento en Anthropic y OpenAI para tareas que no necesitan respuesta inmediata, como el análisis nocturno de alertas del día.',
    '**Promociones:** Gemini 3.8 Flash cuesta la mitad hasta el 31/12/2026. GPT-5.6 Sol tiene precio promocional hasta el 30/11/2026.',
  ]));

  h.push(H.titulo(1, '5. Opciones, una por una'));

  h.push(H.titulo(2, '5.1 Workers AI (Cloudflare), modelos abiertos'));
  h.push(H.P('Es lo que corre hoy. Cloudflare aloja modelos de código abierto y cobra en neuronas ($0,011 cada 1.000, con 10.000 gratis por día). Se llama desde el Worker con el enlace `AI` o desde afuera con la API REST.'));
  h.push(...H.tabla(['Modelo', 'Entrada / salida (USD por millón)', 'Comentario'], cols(2.6, 2.4, 5), [
    ['`@cf/qwen/qwen3-30b-a3b-fp8` (hoy)', '0,051 / 0,335', 'MoE de 30 mil millones de parámetros con 3 mil millones activos. El más barato y el que ya está probado con los 4 perfiles.'],
    ['`@cf/google/gemma-4-26b-a4b-it`', '0,10 / 0,30', 'Alternativa del mismo tamaño y costo. Habría que reajustar instrucciones y probar herramientas.'],
    ['`@cf/openai/gpt-oss-120b`', '0,35 / 0,75', 'Más grande; unas 4,5 veces más caro que Qwen3 por consulta. Menos "eco" de herramientas es una hipótesis a probar.'],
    ['`@cf/qwen/qwen3.8-27b`', '0,45 / 3,20', 'La salida cuesta casi 10 veces la de Qwen3 30B-A3B. Solo si la prueba muestra una mejora clara.'],
  ], true));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['Ya integrado y probado: cambiar de modelo es cambiar `ASISTENTE_MODELO`.', 'Costo prácticamente nulo hasta unas 170 consultas por día.', 'Sin servidores, sin GPU, sin parches de drivers.', 'Los modelos también están disponibles para correr localmente: se puede migrar a la opción 5 con el mismo modelo.']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['Los datos se procesan en Cloudflare; hay que revisar sus condiciones para el cliente.', 'Lo ata a una cuenta de Cloudflare. Si Helios se muda, el asistente depende de internet y de esa cuenta.', 'El cupo gratis de 10.000 neuronas por día es compartido por toda la cuenta; al pasarlo, las llamadas fallan hasta las 00:00 UTC (o hay que pasar al plan pago).', 'Los modelos del catálogo cambian y algunos requieren plan pago.', 'Calidad de modelos medianos: más "andamiaje" del lado del servidor.']));
  h.push(...H.nota('idea', 'Cuándo conviene', 'mientras Helios siga en Cloudflare y el cliente acepte que los resúmenes se procesen allí.'));

  h.push(H.titulo(2, '5.2 API de Anthropic (Claude)'));
  h.push(...H.tabla(['Modelo', 'Entrada / salida (USD por millón)', 'Comentario'], cols(2.6, 2.4, 5), [
    ['Claude Haiku 5.5', '0,10 / 0,50 (sube a 0,50 / 2,50 con prompts de más de 100.000 tokens)', 'Contexto de 1 millón de tokens. El precio es el mismo que GPT-6 Luna y bastante parecido al de Workers AI.'],
    ['Claude Sonnet 5.5', '2 / 10', 'Contexto de 1 millón. Costo por consulta unas 20 veces el de Haiku. Para razonamiento complejo (causa probable, correlación entre incidentes).'],
    ['Claude Opus 5.5', '4 / 20', 'Solo si una tarea concreta lo justifica; no lo usaríamos en el chat.'],
  ], true));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['Muy buenas llamadas a herramientas y seguimiento de instrucciones largas (a confirmar con nuestro set).', 'Caché de prompt con lectura al 5 al 10 % del precio de entrada.', 'Haiku es del mismo precio que los modelos abiertos baratos con más capacidad esperada.', 'API estable y documentada, con tope de gasto configurable en el panel.']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['Los datos salen al proveedor: revisar retención, uso de datos y si se puede pedir retención cero.', 'Sonnet y superiores pueden volverse caros con uso intenso (USD 3.300 por mes en 5.000 consultas por día).', 'Los modelos se retiran (Claude Sonnet 4 y Opus 4 figuran como retirados, salvo en algunas nubes de terceros): hay que migrar periódicamente.', 'Sin internet o con una caída del proveedor, el asistente se cae.', 'Requiere guardar la clave de API como secreto del Worker o del servidor, y rotarla.']));
  h.push(...H.nota('idea', 'Cuándo conviene', 'para las tareas que necesitan más razonamiento (analizar una alerta con historial) o como respaldo de un modelo local.'));

  h.push(H.titulo(2, '5.3 API de OpenAI'));
  h.push(...H.tabla(['Modelo', 'Entrada / salida (USD por millón)', 'Comentario'], cols(2.6, 2.4, 5), [
    ['GPT-6 Luna', '0,10 / 0,50', 'El más barato de la línea actual; recomendado por OpenAI para tareas rápidas y de alto volumen.'],
    ['GPT-6.1 Terra', '1 / 5', 'Intermedio. OpenAI lo recomienda para bajo costo y baja latencia en alto volumen.'],
    ['GPT-6.1 Sol', '2 / 10', 'Gama alta; mismo precio que Claude Sonnet 5.5.'],
  ], true));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['Amplio ecosistema; el formato OpenAI es el estándar que además hablan vLLM y Ollama, así que el código sirve para la opción 5.', 'Precio de Luna igual al de Haiku.', 'Procesamiento regional (residencia de datos) con un 10 % adicional.', 'Descuentos por caché y por lotes.']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['Los datos salen al proveedor, igual que en la opción 2.', 'Retiran modelos con frecuencia: GPT-5 mini y GPT-5 nano figuran como "Deprecated" en su propia página.', 'La numeración y los nombres de modelos cambian rápido; hay que revisar cada tanto.', 'La residencia regional encarece un 10 %.']));
  h.push(...H.nota('idea', 'Cuándo conviene', 'si la empresa ya tiene contrato con OpenAI o si la prueba da mejores resultados con Luna o Terra para algún rol.'));

  h.push(H.titulo(2, '5.4 API de Google (Gemini)'));
  h.push(...H.tabla(['Modelo', 'Entrada / salida (USD por millón)', 'Comentario'], cols(2.6, 2.4, 5), [
    ['Gemini 3.8 Flash', '0,75 / 3,75 hasta el 31/12/2026; 1,50 / 7,50 desde el 1/1/2027', 'La salida incluye los tokens de razonamiento. Razonamiento medio por defecto.'],
    ['Gemini 3.5 Flash-Lite', '0,30 / 2,50 (Google Cloud)', 'Opción económica; ver disponibilidad en la API para desarrolladores.'],
  ], true));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['Plan gratuito para probar sin costo.', 'Caché de contexto y descuentos por lotes.', 'Si la empresa ya usa Google Cloud, hay facturación unificada y residencia regional.']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['**El plan gratuito usa los datos para mejorar los productos de Google:** nunca debe usarse con datos reales. El plan pago no los usa.', 'El precio se duplica el 1/1/2027, así que el costo de hoy no sirve para presupuestar.', 'El razonamiento se cobra como salida y puede encarecer cada consulta.', 'Los datos salen al proveedor.']));
  h.push(...H.nota('idea', 'Cuándo conviene', 'solo si el cliente ya usa Google Cloud. Si no, ofrece menos ventajas que las opciones 2 y 3 para este caso.'));

  h.push(H.titulo(2, '5.5 Modelo local en el servidor propio'));
  h.push(H.P('El modelo corre en un servidor de la empresa con GPU y se sirve con una API compatible con OpenAI. Los modelos son de código abierto con licencias permisivas (Apache 2.0 en Qwen, gpt-oss y Gemma 4; MIT en GLM-4.7-Flash).'));
  h.push(...H.tabla(['Modelo', 'Tamaño en 4 bits', 'Dato de interés', 'Comentario'], cols(2.4, 1.6, 3, 3), [
    ['Qwen3.6-35B-A3B', '20,4 GB', 'MoE: 3 mil millones activos. Contexto nativo de 262.000.', '**Candidato principal.** Misma familia que el Qwen3 de hoy: conserva el comportamiento. Analizador de herramientas de vLLM: `qwen3_coder`.'],
    ['GLM-4.7-Flash', '18,2 GB', 'Licencia MIT. 95 % en una prueba independiente de herramientas.', 'Buena alternativa; menos cabida de procesos en paralelo por su caché.'],
    ['gpt-oss-20b', '12,1 GB', '65 tokens por segundo en una prueba independiente.', 'Rápido y liviano. Una prueba independiente mostró que a veces no llama herramientas (selección del 60 %).'],
    ['Gemma 4 26B-A4B', '14,6 GB', 'Contexto de 256.000.', 'Alternativa MoE con llamadas nativas a herramientas.'],
    ['gpt-oss-120b', '63,4 GB', 'Hace falta una GPU de 96 GB.', 'Más capacidad. Para el nivel 2 de hardware.'],
    ['Mistral Small 4', '72 GB', '119 mil millones, 6,5 mil millones activos.', 'Alternativa del nivel 2; revisar su calidad en español rioplatense.'],
  ], true));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['**Los datos nunca salen del servidor.** Es la única opción que lo garantiza.', 'Costo marginal por consulta cercano a cero; no cambia con el volumen.', 'Se fija la versión del modelo: no hay retiros inesperados ni cambios de precio.', 'Funciona sin internet. Si cae internet, el asistente sigue (salvo el contexto externo).', 'Mismo formato de API que usan OpenAI y la mayoría de los proveedores: el cambio en el código es chico.', 'Ajustable a futuro (afinar el modelo con casos propios).']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['**Inversión inicial y escasez de GPU:** una RTX 5090 de 32 GB se consigue hoy entre USD 6.199 y USD 11.896 (lanzamiento: USD 1.999). Las GPU profesionales de 96 GB se cotizan aparte.', 'Calidad menor que los modelos de primer nivel en razonamiento complejo y matices del español. Se mitiga con datos armados por el servidor.', 'Operarlo es trabajo: drivers, versión del runtime, monitoreo de GPU, energía, temperatura, actualizaciones de modelo.', 'Punto único de falla: sin redundancia, si la GPU cae el asistente se detiene.', 'La VM actual prevista (4 vCPU, 8 a 16 GB de RAM) no alcanza: hace falta GPU. En CPU sola solo andan modelos de 4 a 9 mil millones de parámetros y con demoras largas para 6.000 tokens de entrada.', 'Los resultados de herramientas varían por modelo y versión del runtime: hay que probar con nuestro código.']));
  h.push(...H.nota('regla', 'Si el Worker sigue en Cloudflare', 'un modelo local en la LAN no es accesible desde el Worker. Haría falta un túnel (`cloudflared`), y entonces los datos pasan igual por Cloudflare. El modelo local tiene sentido cuando Helios corre también en el servidor propio.'));

  h.push(H.titulo(2, '5.6 Híbrido: local por defecto, API como respaldo'));
  h.push(H.P('El servidor local atiende todo. Un proveedor externo se usa en dos casos: cuando el modelo local no responde, o para tareas de razonamiento pesado que el administrador habilita. Antes de salir, los datos pasan por un filtro que reemplaza nombres de clientes y personas por códigos.'));
  h.push(H.titulo(3, 'Pros'));
  h.push(...vinetas(['Privacidad por defecto y respaldo ante una falla de la GPU.', 'Gasto externo bajo: solo una fracción de las consultas.', 'Permite medir con datos reales si el modelo externo mejora algo que importe.']));
  h.push(H.titulo(3, 'Contras'));
  h.push(...vinetas(['Más piezas: dos integraciones, filtro de datos, reglas de qué sale y qué no, y auditoría de cada salida.', 'El filtro nunca es perfecto: el texto libre de comentarios puede contener nombres. Por eso la salida se habilita aparte y queda registrada.', 'Hay que mantener las instrucciones funcionando con dos modelos distintos.', 'Es más difícil de explicarle al cliente.']));

  h.push(H.titulo(1, '6. Comparación general'));
  h.push(...H.tabla(['Criterio', '1. Workers AI', '2. Anthropic', '3. OpenAI', '4. Google', '5. Local', '6. Híbrido'], cols(2.2, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5), [
    ['Privacidad', 'Media: Cloudflare', 'Media: proveedor', 'Media: proveedor', 'Media (solo plan pago)', '**Alta**', 'Alta (con respaldo, media)'],
    ['Calidad esperada*', 'Buena', '**Muy alta**', 'Muy alta', 'Muy alta', 'Buena', 'Buena a muy alta'],
    ['Llamadas a herramientas', 'A reforzar', 'Fuertes', 'Fuertes', 'Fuertes', 'Depende del modelo', 'Depende'],
    ['Costo por consulta', '**USD 0,0006 a 0,0029**', 'USD 0,0011 a 0,022', 'USD 0,0011 a 0,011', 'USD 0,0083 a 0,0165', '**Casi cero**', 'Casi cero + poco'],
    ['Inversión inicial', '**Ninguna**', 'Ninguna', 'Ninguna', 'Ninguna', 'Alta', 'Alta'],
    ['Esfuerzo de operación', 'Bajo', 'Bajo', 'Bajo', 'Bajo', '**Alto**', 'Alto'],
    ['Funciona sin internet', 'No', 'No', 'No', 'No', '**Sí**', 'Sí (sin respaldo)'],
    ['Riesgo de retiro de modelo', 'Medio', 'Medio', 'Medio', 'Medio', '**Nulo**', 'Bajo'],
    ['Estado hoy', '**Funcionando**', 'A integrar', 'A integrar', 'A integrar', 'Requiere GPU', 'Requiere GPU'],
  ], true));
  h.push(H.P('* Calidad esperada: hipótesis basada en el tamaño de los modelos y pruebas de terceros. No está medida sobre Helios; se mide en la sección 9.', { run: { size: 18, color: '5F5F5F' } }));

  h.push(H.titulo(1, '7. Modelo por rol de agente'));
  h.push(H.P('Los agentes de Helios no hacen todos el mismo trabajo. Usar el modelo más barato que alcance para cada rol baja el costo y deja el razonamiento caro para lo que lo necesita.'));
  h.push(...H.tabla(['Rol', 'Qué exige', 'Modelo sugerido', 'Estado'], cols(2.6, 3.4, 2.6, 1.4), [
    ['Asistente de preguntas', 'Herramientas, permisos, voseo, no inventar.', 'Local de 30 a 35 mil millones (Qwen3.6-35B-A3B); hoy Qwen3 30B-A3B.', 'Hoy'],
    ['Explicar una alerta ("¿Qué está pasando?")', 'Contexto de la alerta e historial.', 'El mismo del asistente.', 'Hoy'],
    ['Resumen del turno', 'Resumir y ordenar prioridades.', 'El mismo del asistente.', 'Hoy'],
    ['Borrador de correo o comunicado', 'Redacción en español con datos fijos.', 'Un modelo chico (Haiku-class o local liviano) alcanza.', 'Propuesto'],
    ['Análisis automático de cada alerta nueva', 'Volumen alto, sin respuesta inmediata.', 'Local o lotes (batch) con descuento del 50 %.', 'Propuesto'],
    ['Causa probable y correlación entre incidentes', 'Razonamiento sobre varias series y el historial.', 'Un modelo de primer nivel (Sonnet-class) o local grande, solo si la prueba lo justifica.', 'Propuesto'],
  ], true));

  h.push(H.titulo(1, '8. Consideraciones del despliegue local'));
  h.push(H.titulo(2, '8.1 Hardware: la memoria de la GPU manda'));
  h.push(H.P('La memoria de la GPU (VRAM) tiene que alojar el modelo más la memoria de trabajo de cada consulta (caché KV). Cada consulta en paralelo suma caché, y esa caché crece con el contexto.'));
  h.push(...H.tabla(['Nivel', 'GPU', 'Modelos que entran', 'Consultas en paralelo (contexto de 64.000)'], cols(1.2, 2.2, 3.8, 2.8), [
    ['0. Pruebas', '8 a 16 GB', 'Qwen3.5-9B (5,6 GB), gpt-oss-20b (12,1 GB)', 'Pocas; para ensayos y tareas livianas.'],
    ['1. Producción chica', '24 a 32 GB (por ejemplo RTX 5090 de 32 GB)', 'Qwen3.6-35B-A3B (20,4 GB), GLM-4.7-Flash (18,2 GB), Gemma 4 26B-A4B (14,6 GB)', 'Con 32 GB, Qwen3.6-35B-A3B admite 5 consultas de 64.000 tokens (11 con caché de 8 bits). gpt-oss-20b admite 10.'],
    ['2. Producción con margen', '96 GB (por ejemplo RTX PRO 6000 Blackwell)', 'gpt-oss-120b (63,4 GB), Mistral Small 4 (72 GB), Qwen3.5-122B-A10B', 'Más holgura para varias consultas a la vez; medir con el modelo elegido.'],
  ], true));
  h.push(H.P('Los tamaños y la concurrencia salen de un cálculo de terceros (vdf.ai). Los confirmamos con la GPU y el modelo elegidos.', { run: { size: 18, color: '5F5F5F' } }));
  h.push(...vinetas([
    '**Consumer o profesional:** una RTX 5090 tiene 32 GB, 1.792 GB/s de ancho de banda y 575 W, sin ECC. Para un servicio 24 por 7, preferimos una placa profesional (con ECC y pensada para uso continuo). Las de 96 GB no tienen NVLink.',
    '**Energía y refrigeración:** una GPU de 575 W necesita fuente y ventilación acordes. Estimamos entre 600 y 900 W para el servidor a plena carga. Prever UPS.',
    '**Comparación con alquilar:** una RTX 5090 alquilada cuesta unos USD 0,78 por hora (USD 570 por mes si está siempre prendida) y una RTX PRO 6000 unos USD 2,19 (USD 1.600 por mes). Una RTX 5090 comprada a precio de hoy (USD 6.199 a 11.896) se paga frente al alquiler en 11 a 21 meses, pero no frente a una API barata (ver 4.2).',
    '**Cotización local:** pedir precio y plazo de entrega a proveedores del país, con impuestos incluidos; el precio de mercado actual está de 3 a 6 veces sobre el de lanzamiento.',
  ]));

  h.push(H.titulo(2, '8.2 Servir el modelo'));
  h.push(...H.tabla(['Opción', 'Para qué sirve', 'Contras'], cols(2, 4, 4), [
    ['vLLM', '**Producción.** Atiende varias consultas a la vez, API compatible con OpenAI y analizadores de herramientas por modelo (`qwen3_coder`, `openai`, `glm47`).', 'Más configuración. Es sensible a la versión de driver y de CUDA.'],
    ['Ollama', 'Prototipo y pruebas en una PC. Un comando para bajar el modelo.', 'Menos control de concurrencia. Ollama recomienda al menos 64.000 de contexto para agentes.'],
    ['llama.cpp', 'Máquinas chicas o sin GPU; lanzamiento liviano.', 'Menor rendimiento con muchas consultas simultáneas.'],
  ], true));
  h.push(H.P('Ejemplo de arranque con Docker Compose (nombre del modelo y versión de imagen a confirmar al momento de armarlo):'));
  h.push(...H.codigo([
    'services:',
    '  modelo:',
    '    image: vllm/vllm-openai:<versión fijada>',
    '    command: ["--model", "<modelo elegido>", "--max-model-len", "65536",',
    '              "--enable-auto-tool-choice", "--tool-call-parser", "qwen3_coder"]',
    '    ports: ["127.0.0.1:8000:8000"]   # solo visible dentro del servidor',
    '    deploy:',
    '      resources:',
    '        reservations:',
    '          devices: [{ driver: nvidia, count: 1, capabilities: [gpu] }]',
    '    restart: unless-stopped',
  ]));

  h.push(H.titulo(2, '8.3 Integración con el código de Helios'));
  h.push(...vinetas([
    '**Interfaz única:** una función `llamarModelo(mensajes, herramientas)` que lea `ASISTENTE_PROVEEDOR` (`workers_ai` o `compatible_openai`), `ASISTENTE_URL`, `ASISTENTE_CLAVE` (secreto) y `ASISTENTE_MODELO`. `asistente_server.js` ya acepta respuestas en formato OpenAI.',
    '**Anthropic y Google** ofrecen una capa de compatibilidad con el formato OpenAI (confirmar que siga vigente); si no, un adaptador chico.',
    '**Los permisos, los límites y la auditoría no cambian:** siguen en el servidor de Helios, no en el modelo.',
    '**Respaldo:** `ASISTENTE_PROVEEDOR_RESPALDO` para pasar al segundo modelo cuando el primero falla o se demora más de un tiempo definido.',
    '**Tope de gasto:** además de los límites de Helios (por hora y por día), configurar el tope mensual en el panel del proveedor.',
    '**Probar sin proveedor:** se mantiene `ASISTENTE_LOCAL=simulado` para ver pantallas y permisos.',
  ]));

  h.push(H.titulo(2, '8.4 Operación y seguridad'));
  h.push(...vinetas([
    '**Red:** el modelo escucha solo en la interfaz local o en una red interna; Helios lo llama con una clave. Nada de exponerlo a internet.',
    '**Versiones fijas:** imagen del runtime, driver y modelo con versión y huella (hash). Actualizar de a una pieza y probando con el set.',
    '**Copia de los pesos del modelo** en el almacenamiento interno: el repositorio original puede retirarlo.',
    '**Monitoreo de la GPU:** temperatura, memoria, uso, errores. Alertar a Helios por sus propios medios (es un servicio más para monitorear).',
    '**Qué se registra:** hoy la auditoría guarda la pregunta con la acción `ASISTENTE`. No guardar el contenido enviado al modelo salvo para depurar, y con vencimiento.',
    '**Texto libre como vector:** comentarios y evidencia pueden incluir instrucciones ("ignorá lo anterior"). La defensa es la actual: el modelo solo lee y propone, y el servidor valida cada acción. Con modelos más chicos hay que probarlo explícitamente.',
    '**Falla de la GPU:** el asistente avisa que no está disponible y Helios sigue igual (hoy ya es así sin el enlace `AI`). Con respaldo externo, solo si está habilitado.',
    '**Licencias:** guardar la licencia de cada modelo usado (Apache 2.0 o MIT en los candidatos); revisar las políticas de uso de gpt-oss.',
  ]));

  h.push(H.titulo(1, '9. Plan de prueba comparativa'));
  h.push(H.P('Las comparaciones de terceros ordenan los candidatos pero no reemplazan una prueba con nuestros datos. Proponemos:'));
  h.push(H.titulo(2, '9.1 Set de prueba'));
  h.push(...vinetas([
    '**40 casos:** 10 por perfil (Soporte, Analista, Gerente, Administrador), armados con las 19 escenas de la demo.',
    'Cada caso tiene los datos esperados (qué alertas existen, quién las tiene, cuánto llevan) para comparar objetivamente.',
    '**5 casos adversos:** comentarios con instrucciones, preguntas fuera de tema, pedir lo que el perfil no puede ver, preguntas ambiguas y datos vacíos.',
    '**Casos para los roles propuestos:** análisis de alerta nueva (10) y borrador de correo (10).',
  ]));
  h.push(H.titulo(2, '9.2 Qué se mide y criterio de aceptación propuesto'));
  h.push(...H.tabla(['Medida', 'Cómo', 'Criterio propuesto'], cols(3, 4, 3), [
    ['Exactitud de los datos', 'Comparar cada respuesta contra lo esperado, a mano.', '0 datos inventados en los 40 casos y 90 % o más de respuestas correctas.'],
    ['Uso de herramientas', 'Registrar qué herramientas pide y si los argumentos son válidos.', '90 % o más de selección correcta; 0 respuestas con `<tools>` o `<tool_call>` a la vista.'],
    ['Permisos', 'Casos donde se pide algo que el perfil no ve.', '0 filtraciones.'],
    ['Tono y formato', 'Revisión ciega por Ale y Hugo.', 'Voseo, sin jerga, sin títulos `###` ni nombres de campos.'],
    ['Latencia', 'Mediana y p95 por consulta, con la GPU o el proveedor reales.', 'Mediana menor a 8 s; p95 menor a 20 s.'],
    ['Costo por consulta', 'Tokens reales de entrada y salida por precio.', 'Dentro del presupuesto que fije el cliente.'],
    ['Robustez', 'Respuestas cortadas, ecos, reintentos y errores.', 'Menos del 2 % de consultas con problemas.'],
  ], true));
  h.push(H.titulo(2, '9.3 Candidatos a medir'));
  h.push(...vinetas([
    'Qwen3 30B-A3B en Workers AI (línea base).',
    'Qwen3.6-35B-A3B en una GPU local de 32 GB (o alquilada por horas para la prueba, a USD 0,78 por hora).',
    'gpt-oss-120b y GLM-4.7-Flash, para ver si mejoran las herramientas.',
    'Claude Haiku 5.5 y GPT-6 Luna (mismo precio), como referencia de calidad barata.',
    'Claude Sonnet 5.5 o GPT-6.1 Sol, como techo de calidad y para el rol de razonamiento.',
  ]));
  h.push(...H.nota('idea', 'Costo de la prueba', '40 casos cuestan menos de USD 1 por modelo, incluso con el más caro (unos USD 0,88 con Claude Sonnet 5.5). El tiempo grande está en armar y corregir el set.'));

  h.push(H.titulo(1, '10. Riesgos'));
  h.push(...H.tabla(['Riesgo', 'Impacto', 'Mitigación'], cols(3.2, 2.8, 4), [
    ['Los datos de clientes salen a un proveedor sin aprobación', 'Incumplimiento contractual', 'Local por defecto; salida externa solo con filtro y habilitación expresa.'],
    ['GPU cara o difícil de conseguir', 'Retraso del servidor propio', 'Seguir en Workers AI; alquilar GPU por horas para la prueba.'],
    ['El modelo local rinde menos de lo esperado', 'Respuestas flojas', 'Prueba previa; respaldo externo (opción 6); más trabajo del servidor armando datos.'],
    ['Un proveedor retira o cambia un modelo', 'Hay que reajustar instrucciones', 'Interfaz desacoplada; set de prueba para revalidar rápido.'],
    ['Costo externo fuera de control', 'Gasto inesperado', 'Límites de Helios y tope de gasto en el proveedor.'],
    ['Falla de la GPU o del servidor', 'Asistente caído', 'Helios sigue sin el asistente; respaldo opcional; monitoreo de la GPU.'],
    ['Inyección de instrucciones desde texto libre', 'Respuestas manipuladas', 'El modelo solo lee y propone; el servidor valida; casos adversos en la prueba.'],
    ['Aumento de precios (por ejemplo Gemini el 1/1/2027)', 'Presupuesto desactualizado', 'Revisar precios antes de decidir y cada trimestre.'],
  ], true));

  h.push(H.titulo(1, '11. Recomendación y próximos pasos'));
  h.push(...vinetas([
    '**Ahora:** dejar Qwen3 30B-A3B en Workers AI. Costo cero con el uso actual.',
    '**Ahora, en paralelo:** armar el set de prueba (sección 9) y desacoplar la llamada al modelo (sección 8.3). Es trabajo que sirve para cualquier opción.',
    '**Con el servidor propio:** modelo local Qwen3.6-35B-A3B servido con vLLM en una GPU de 32 GB como mínimo; evaluar 96 GB si la prueba pide un modelo mayor o más consultas en paralelo.',
    '**Opcional:** respaldo externo con filtro de datos, si el cliente lo aprueba.',
    '**Decisiones que dependen del cliente:** si los datos pueden salir, presupuesto de GPU y tope mensual de un servicio externo, uso esperado, y cuándo estará el servidor.',
  ]));
  h.push(...H.nota('regla', 'Pendiente de confirmar', 'cotización real de la GPU en el mercado local, disponibilidad del servidor, y qué proveedores de IA ya acepta la empresa. Nada de esto está definido todavía.'));

  h.push(H.titulo(1, '12. Fuentes consultadas'));
  h.push(H.P(`Precios y modelos verificados el ${D.FECHA}. Los precios cambian seguido.`));
  h.push(...vinetas([
    'Anthropic, página de precios y de modelos (platform.claude.com/docs/en/about-claude/pricing).',
    'OpenAI, página de precios de la API (developers.openai.com/api/docs/pricing).',
    'Google, precios de la API de Gemini y de Agent Platform (ai.google.dev/gemini-api/docs/pricing, cloud.google.com/model-garden/pricing).',
    'Cloudflare, precios de Workers AI (developers.cloudflare.com/workers-ai/platform/pricing), actualizada el 12/11/2026.',
    'Modelos locales y herramientas: vdf.ai (mejores modelos locales para agentes), zenn.dev (prueba de herramientas con modelos locales), jdhodges.com y alyx.pink (pruebas independientes de llamadas a herramientas). Son pruebas chicas de terceros, no concluyentes.',
    'GPU: thundercompute.com (precio de la RTX 5090), cloud-gpus.com y novapod.io (alquiler de GPU), inferencehub.org y gpurentalprices.com (L40S).',
    'Interno: `05_Documentacion/contexto_helios_para_ia.md` (secciones 7 y 14) y `novedades_asistente_ia.md`.',
  ]));

  return H.documento({ titulo: 'Modelos de IA para los agentes de Helios', pie: 'Modelos de IA para los agentes de Helios · Documento para ingeniería', hijos: h });
}

// Un documento por corrida (helios_docx.js guarda los títulos del índice en el módulo)
(async () => {
  const cual = process.argv[3];
  if (cual === 'cliente') await H.guardar(await documentoCliente(), path.join(salida, 'Helios_modelos_IA_propuesta_cliente.docx'));
  else if (cual === 'tecnico') await H.guardar(await documentoIngenieria(), path.join(salida, 'Helios_modelos_IA_analisis_tecnico.docx'));
  else { console.log('Uso: node modelos_ia_build.js <carpeta> cliente|tecnico'); process.exit(1); }
  console.log('listo', cual);
})();
