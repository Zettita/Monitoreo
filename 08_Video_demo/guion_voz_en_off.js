// Guion para que una persona ponga su voz en off sobre el video de la demo (sin subtítulos ni audio).
// Uso: node guion_voz_en_off.js <carpeta de salida>      (hace falta `npm install docx --no-save` en 07_Codigo_fuente/word)
// Los tiempos salen de la grabación (tiempos.json) y el ritmo está pensado para hablar a unas 2,3 palabras por segundo.
const fs = require('fs');
const path = require('path');
const H = require('../07_Codigo_fuente/word/helios_docx.js');

const FRASE = 'los campos del producto y sus funcionalidades son variables modificables según necesidad del cliente';

// [desde, hasta, qué se ve, locución]
const SECCIONES = [
  ['1. Presentación', [
    ['0:00', '0:30', 'Dos tarjetas con el nombre y el resumen del recorrido.',
      'Helios es una plataforma de monitoreo inteligente para servicios que procesan transacciones: bancos, billeteras y procesadores de pagos. Detecta los problemas antes de que los vean los clientes y ordena el trabajo para resolverlos. Les mostramos un incidente de punta a punta: desde el aviso anticipado hasta la resolución, la comunicación, la mirada de gerencia y el asistente de inteligencia artificial.'],
  ]],
  ['2. Pre-alertas anticipadas', [
    ['0:30', '0:39', 'Pantalla de ingreso y tablero del analista.',
      'Empezamos como analista de monitoreo. Cada persona entra con su usuario y ve solo lo que corresponde a su perfil.'],
    ['0:39', '0:53', 'Tablero con los datos que van llegando.',
      'Cada quince minutos, Helios compara lo que pasa en cada cliente y servicio con lo que se espera para ese momento. En esta demo, los datos van llegando escena por escena.'],
    ['0:53', '1:11', 'Aparece la pre-alerta de rechazos del cliente CLI 004.',
      'Y acá aparece la primera ventaja: la pre-alerta. Los rechazos del cliente CLI 004 vienen subiendo. Todavía no pasaron el límite, pero Helios calcula que lo cruzarían en unos quince minutos. Avisa hasta media hora antes de que el cliente lo note.'],
    ['1:11', '1:23', 'Botón "Avisar a Soporte".',
      'El analista puede avisar a Soporte para que se prepare. Es un aviso, no una alerta: no llena el historial.'],
    ['1:23', '1:36', 'Resumen de efectividad de los avisos.',
      'Quince minutos después, el problema se confirma. Helios mide sus propios aciertos: acá, todas las pre-alertas se confirmaron, con quince minutos de anticipación.'],
  ]],
  ['3. Alertas priorizadas y derivadas', [
    ['1:36', '1:50', 'Lista de alertas abiertas, ordenadas de P1 a P4.',
      'Con varios problemas a la vez, Helios los ordena por prioridad, de P1 a P4, según gravedad e importancia del servicio. De un vistazo se ve qué está sin asignar y qué está en curso.'],
    ['1:50', '2:01', 'El analista deriva una alerta a una persona de Soporte.',
      'El analista deriva cada alerta a una persona o a un equipo, con un comentario que le da contexto.'],
    ['2:01', '2:13', 'Pantalla de Administración, reglas de derivación.',
      'También se pueden armar reglas de derivación automática. Y esto vale para todo Helios: **' + FRASE + '**.'],
    ['2:13', '2:22', 'Alertas de CLI 006 ya derivadas por la regla.',
      'Por eso, cuando CLI 006 empezó a fallar, la regla mandó las alertas a la Mesa de ayuda sin que nadie tuviera que intervenir.'],
    ['2:22', '2:33', 'Pantalla de Seguimiento.',
      'En Seguimiento se ve quién tiene cada alerta, desde cuándo y la carga de cada equipo. Lo que demora de más se marca en rojo.'],
  ]],
  ['4. Soporte trabaja la alerta y comunica el incidente', [
    ['2:33', '2:37', 'Tarjeta "Vista de Soporte".',
      'Ahora, la vista de Soporte.'],
    ['2:37', '2:45', 'Mis alertas de Matías.',
      'Cada persona ve solo lo que se le asignó, a ella o a su equipo, ordenado por prioridad.'],
    ['2:45', '2:54', 'Matías toma la alerta y abre el detalle.',
      'Matías toma la alerta y pasa a estar en curso. En el detalle tiene toda la conversación: derivaciones, comentarios y evidencia.'],
    ['2:54', '3:06', 'Comentario y captura adjunta.',
      'Deja un comentario con lo que vio en los logs y adjunta una captura como evidencia. Todo queda registrado en el historial, sin planillas ni mensajes sueltos.'],
    ['3:06', '3:16', 'Botón "Generar ticket" y ticket de Jira.',
      'Con un clic se crea el ticket en Jira, con los datos de la alerta ya cargados. Queda vinculado a la alerta.'],
    ['3:16', '3:34', 'Diálogo "Comunicar incidente".',
      'Comunicar el incidente no requiere cargar nada a mano. Se eligen equipos o personas, cada uno con su rol: informado, técnico o líder. El mensaje ya viene armado con la alerta y el ticket, y Helios envía el aviso push.'],
    ['3:34', '3:43', 'Celular Android con el aviso y botón "Recibido".',
      'Así lo ve un técnico de la Mesa de ayuda en su celular. Con un toque en Recibido, confirma que ya está al tanto.'],
    ['3:43', '3:49', 'iPhone con el aviso.',
      'Y así le llega a gerencia, aunque Helios esté cerrado.'],
    ['3:49', '3:56', 'Conversación de la alerta.',
      'En la conversación queda anotado a quién se avisó, cuándo y cuántos técnicos ya confirmaron.'],
    ['3:56', '4:03', 'Diálogo del correo.',
      'El correo también sale armado: asunto y texto con los datos de la alerta y el ticket.'],
    ['4:03', '4:21', 'Elegir destinatarios de la lista.',
      'Los destinatarios se eligen de una lista de personas y equipos, sin copiar ni pegar. Si hace falta, se escriben a mano direcciones de clientes o proveedores. Lo elegido queda cargado en Para y en copia.'],
    ['4:21', '4:37', 'Outlook con el borrador y confirmación del envío.',
      'Se abre en Outlook, listo para enviar. Después se confirma en Helios que el correo salió, y queda anotado en la conversación.'],
    ['4:37', '4:55', 'Diálogo "Resolver" con causa y acciones.',
      'Cuando el problema se soluciona, se resuelve la alerta. Se elige qué lo causó y qué se hizo, con un clic, y se puede sumar un detalle. Esa información alimenta los reportes de causas y de tiempos, y todo el recorrido queda registrado.'],
  ]],
  ['5. Aviso a gerencia y tablero gerencial', [
    ['4:55', '5:10', 'Comunicado abierto por la gerente.',
      'Pasamos a la vista de gerencia. Gabriela, la gerente, recibió el aviso y abre el comunicado: ve el mensaje, el ticket y a quiénes se informó.'],
    ['5:10', '5:21', 'Pestaña Operaciones del tablero.',
      'En el tablero ve las alertas activas, quién las tiene y cuánto llevan, en solo lectura. Si un cliente consulta, ya sabe si alguien lo está trabajando.'],
    ['5:21', '5:36', 'Pestaña Disponibilidad.',
      'En Disponibilidad ve cada cliente frente a su objetivo: cuántos cumplen, cuántos están en riesgo y cuánto tiempo estuvieron sin servicio. Abajo, la distribución de fallas por cliente, por tipo y por causa.'],
    ['5:36', '5:51', 'Pestaña Histórico.',
      'Y en el histórico, los tiempos de resolución por tipo de falla y los clientes más afectados, con filtros por cliente, servicio, gravedad y período.'],
  ]],
  ['6. Asistente de inteligencia artificial', [
    ['5:51', '6:07', 'Tarjeta del asistente y primera pregunta.',
      'Ahora, el asistente de inteligencia artificial. Responde solo con lo que cada perfil puede ver. Le preguntamos qué está sin asignar y a quién derivarlo.'],
    ['6:07', '6:16', 'Respuesta con el botón "Derivar".',
      'Muestra lo pendiente y propone la derivación. Nada se ejecuta solo: el analista lo confirma con un clic.'],
    ['6:16', '6:32', 'Pregunta sobre la carga de los equipos.',
      'También muestra la carga de cada equipo, para repartir mejor el trabajo. Se le puede preguntar en lenguaje natural, como a un compañero.'],
    ['6:32', '6:39', '"¿Qué está pasando?" sobre una alerta.',
      'Sobre una alerta, explica qué pasa y se apoya en casos parecidos ya resueltos.'],
    ['6:39', '6:55', 'Pregunta sobre el contexto externo.',
      'Y suma contexto de afuera: feriados, incidentes de proveedores y noticias que pueden afectar la operación. Así el equipo entiende si una caída tiene una causa externa.'],
  ]],
  ['7. Lo que viene: coordinación de incidentes mayores', [
    ['6:55', '7:19', 'Tarjeta "AICIM".',
      'Y lo que viene: el Asistente Inteligente de Coordinación de Incidentes Mayores. Un agente que dirige la resolución de los incidentes grandes. Conoce la infraestructura, sus dependencias y sus antecedentes. Conduce la sala de crisis, asigna tareas a los especialistas, indica qué componentes revisar y orienta el diagnóstico.'],
    ['7:19', '7:41', 'Tarjeta "Integrado con Microsoft Teams".',
      'La sala de crisis se integra con Microsoft Teams. Desde ahí, el asistente determina los escalamientos, supervisa avances, tiempos de respuesta y comunicaciones, y sigue las acciones hasta que el servicio se restablece. Siempre bajo supervisión humana.'],
  ]],
  ['8. Cierre', [
    ['7:41', '7:55', 'Tarjeta final.',
      'Helios: pre-alertas anticipadas, alertas priorizadas, comunicación sin carga manual, información para la gerencia y un asistente que ayuda a decidir. Enterate antes que tus clientes.'],
  ]],
];

const aSeg = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
const limpio = (t) => t.replace(/\*\*/g, '');
const palabras = (t) => limpio(t).split(/\s+/).filter(Boolean).length;
let totalPalabras = 0;
for (const [, filas] of SECCIONES) for (const f of filas) totalPalabras += palabras(f[3]);

// Revisión de ritmo: palabras por segundo de cada bloque
const avisos = [];
for (const [nombre, filas] of SECCIONES) for (const f of filas) {
  const seg = aSeg(f[1]) - aSeg(f[0]); const v = palabras(f[3]) / seg;
  if (v > 2.7) avisos.push(`${f[0]} ${v.toFixed(2)} palabras/s: ${limpio(f[3]).slice(0, 50)}`);
}

const w = H.ANCHO;
const hijos = [];
hijos.push(...H.cabecera('Guion de voz en off', 'Demostración de Helios · Monitoreo inteligente', 'Guion para locución'));
hijos.push(H.titulo(1, 'Cómo usar este guion'));
hijos.push(H.vineta('Se lee mirando el video **sin subtítulos ni audio** (`Helios_demo_sin_subtitulos_ni_audio.mp4`). Dura 7 minutos 55 segundos.'));
hijos.push(H.vineta('Cada fila indica **de qué minuto a qué minuto** va el texto y **qué se ve en pantalla** en ese momento. Si se lee a ritmo tranquilo, entra justo.'));
hijos.push(H.vineta(`El texto tiene unas ${totalPalabras} palabras, a ritmo de 2 a 2,5 palabras por segundo. Conviene una pausa corta entre bloques.`));
hijos.push(H.vineta('Lo que se muestra en el celular (Android y iPhone), en Outlook y el asistente de inteligencia artificial son **simulaciones** armadas para el video; no hace falta aclararlo al hablar.'));
hijos.push(H.vineta('La parte de coordinación de incidentes mayores y Microsoft Teams **todavía no está desarrollada**: se presenta como lo que viene.'));
hijos.push(...H.nota('regla', 'Frase obligatoria', 'en el minuto 2:01, mientras se ve Administración, hay que decir tal cual: «' + FRASE + '».'));
let n = 0;
for (const [titulo, filas] of SECCIONES) {
  hijos.push(H.titulo(1, titulo));
  hijos.push(...H.tabla(['Tiempo', 'En pantalla', 'Texto para leer'], [1000, 2700, w - 3700],
    filas.map((f) => [f[0] + ' – ' + f[1], f[2], f[3]]), false));
  n += filas.length;
}
hijos.push(H.titulo(1, 'Versión corrida para leer de seguido'));
hijos.push(H.P('Es el mismo texto, sin tiempos, por si se prefiere leerlo de corrido.'));
for (const [titulo, filas] of SECCIONES) {
  hijos.push(H.titulo(2, titulo.replace(/^\d+\. /, '')));
  hijos.push(H.P(filas.map((f) => f[3]).join(' ')));
}

const salida = process.argv[2] || '.';
fs.mkdirSync(salida, { recursive: true });
(async () => {
  await H.guardar(H.documento({ titulo: 'Guion de voz en off', pie: 'Guion de voz en off del video de demostración', hijos }), path.join(salida, 'Helios_guion_voz_en_off.docx'));
  const txt = SECCIONES.map(([t, filas]) => t.replace(/^\d+\. /, '').toUpperCase() + '\n' + filas.map((f) => limpio(f[3])).join('\n')).join('\n\n') + '\n';
  fs.writeFileSync(path.join(salida, 'Helios_guion_voz_en_off.txt'), txt, 'utf-8');
  console.log('Palabras:', totalPalabras, '· bloques:', n, '· ritmo medio:', (totalPalabras / 475).toFixed(2), 'palabras/s');
  console.log('Bloques apretados (>2,7 p/s):', avisos.length ? avisos : 'ninguno');
})();
