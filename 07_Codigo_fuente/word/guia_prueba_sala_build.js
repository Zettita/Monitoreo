// Arma la guía de prueba de la sala de crisis y su integración con Teams (Word, estilo Helios).
// Uso: node guia_prueba_sala_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');
const w = H.ANCHO;
const C = [900, 3700, 4000, 1480];   // paso, qué hacer, qué tiene que pasar, resultado
const fila = (n, hacer, pasa) => [String(n), hacer, pasa, '☐ OK    ☐ Falla'];
const tabla = (filas) => H.tabla(['Paso', 'Qué hacer', 'Qué tiene que pasar', 'Resultado'], C, filas, false);
const h = [];
h.push(...H.cabecera('Probar la sala de crisis y Teams', 'Paso a paso, con lo que tiene que pasar en cada uno', 'Guía de prueba'));

h.push(H.titulo(1, '1. Antes de empezar'));
h.push(H.P('La prueba lleva unos 40 minutos. Se hace en Cloudflare con la demo, y la parte de Teams necesita el canal conectado.'));
h.push(H.vineta("**Script 24 corrido.** En la consola de D1: `SELECT COUNT(*) AS tablas FROM sqlite_master WHERE name = 'incidentes_mayores';` tiene que dar 1."));
h.push(H.vineta('**Worker publicado** con el parche 74 (trae todo lo de la sala, Teams y quitar alertas). Pegar `01_Worker/worker_alertas_cron.js` en Edit code y Deploy.'));
h.push(H.vineta('**Tres personas para probar:** un Analista, una persona de Soporte que esté en un equipo (con el correo cargado en Administración > Usuarios) y un Gerente. Para tener dos sesiones a la vez, abrir una en una ventana privada.'));
h.push(H.vineta('**Teams:** acceso al canal **Plataforma Monitoreo** para ver las tarjetas, y el secreto `TEAMS_WEBHOOK` cargado (se conectó el 20/11). Si hay que reconectarlo, está en `novedades_sala_teams.md`, sección 2.'));
h.push(...H.nota('regla', 'Ojo con la demo', '«Preparar demo» borra alertas, eventos, avisos y métricas de la demo. Hacerlo solo si en Cloudflare no hay nada real que cuidar.'));

h.push(H.titulo(1, '2. Dejar la demo lista'));
h.push(...tabla([
  fila(1, 'Entrar como **Analista** a `/?demo` y tocar **Preparar demo**.', 'El reloj queda en el lunes 26/10 a las 10:00 y la demo en la escena 0.'),
  fila(2, 'Tocar **Siguiente escena** hasta llegar a la escena 19 (Cierre de la guardia).', 'Hay alertas de varios clientes. Es lo que se ve en cualquier demo.'),
  fila(3, 'Seguir con la escena **20 · Se cae el gateway de pagos**.', 'Alertas graves nuevas: sin aprobaciones en CLI_006 y errores altos en CLI_002 y CLI_005.'),
]));

h.push(H.titulo(1, '3. La sala de crisis'));
h.push(H.titulo(2, '3.1 Abrir la sala y sumar alertas (Analista)'));
h.push(...tabla([
  fila(4, 'En **Operaciones**, abrir el detalle de la alerta grave de CLI_006 y tocar **Abrir sala de crisis**.', 'Se abre una sala nueva (IM-4 si es la primera) con el título armado, estado Abierto, gravedad Grave y esa alerta. Si la alerta ya estaba en una sala, no aparece el botón.'),
  fila(5, 'En la sala, tocar **Sumar alertas** y elegir las de CLI_002 y CLI_005.', 'Quedan 3 alertas. En la línea de tiempo aparece «Sumó la alerta: …» por cada una.'),
  fila(6, 'Entrar al detalle de una de esas alertas.', 'Dice que está en la sala. Una alerta no puede estar en dos salas abiertas.'),
  fila(7, 'Mirar **Guía de diagnóstico**.', 'Muestra los componentes del servicio (por ejemplo Autenticación, Gateway de pagos, Balanceador), de qué dependen, qué revisar y los antecedentes parecidos (IM-1 a IM-3).'),
]));
h.push(H.titulo(2, '3.2 Quitar una alerta de la sala (nuevo, parche 74)'));
h.push(...tabla([
  fila(8, 'En la alerta de CLI_005 tocar **Quitar de la sala**, escribir «Es de otro problema» y confirmar.', 'La sala queda con 2 alertas. En la línea de tiempo: «Quitó la alerta: … Motivo: Es de otro problema».'),
  fila(9, 'Abrir esa alerta de CLI_005 desde su detalle.', 'Sigue abierta y sin sala. En su conversación figura que se quitó de la sala.'),
  fila(10, 'Volver a la sala y **Sumar alertas** con la de CLI_005.', 'Se puede volver a sumar. La sala vuelve a tener 3 alertas.'),
  fila(11, 'Quitar de a una hasta que quede una sola.', 'Con una sola alerta el botón **Quitar de la sala** ya no aparece. Si se intenta por la API, el servidor dice que la sala necesita al menos una alerta.'),
  fila(12, 'Volver a sumar las otras dos para seguir con la prueba.', 'La sala tiene de nuevo 3 alertas.'),
]));
h.push(H.titulo(2, '3.3 Tareas y trabajo de Soporte'));
h.push(...tabla([
  fila(13, 'Como Analista: **Nueva tarea**, elegir a la persona de Soporte, un componente (por ejemplo «Gateway de pagos») y guardar.', 'La tarea figura Pendiente con su responsable. En la línea de tiempo: «Asignó la tarea …».'),
  fila(14, 'Entrar como **Soporte** (ventana privada).', 'En la campanita (y en el celular, si tiene push) hay un aviso «Tarea nueva en IM-…». Soporte ve la sala solo porque tiene una tarea.'),
  fila(15, 'Soporte: **Empezar** la tarea y después **Marcar hecha**, contando lo que encontró.', 'No deja marcarla hecha sin contar qué se encontró. En la línea de tiempo queda el resultado y el Analista recibe un aviso.'),
  fila(16, 'Como Soporte, buscar **Sumar alertas**, **Escalar**, **Quitar de la sala** o **Cerrar**.', 'No tiene esos botones: solo el Analista dirige la sala.'),
  fila(17, 'Entrar como **Gerente** y abrir la sala.', 'La ve completa, en solo lectura, sin botones de acción ni propuestas del asistente.'),
]));
h.push(H.titulo(2, '3.4 Escalar y comunicar'));
h.push(...tabla([
  fila(18, 'Como Analista: **Escalar**, elegir a quién se asigna y escribir un motivo (por ejemplo «Hay que avisar al proveedor del gateway»).', 'Se crea una tarea «Escalamiento: …» para esa persona de Soporte, que recibe el aviso. En la línea de tiempo figura en rojo.'),
  fila(19, 'Tocar **Comunicar** en la sala.', 'Abre «Comunicar incidente» de la alerta. Elegir equipos o personas, revisar el mensaje armado y enviar. En la sala queda «Comunicó el incidente…».'),
]));
h.push(H.titulo(2, '3.5 Asistente dentro de la sala (Analista)'));
h.push(H.P('Las preguntas sugeridas de la sala están ahora **fijas abajo del panel**, arriba del cuadro de texto.'));
h.push(...tabla([
  fila(20, 'Abrir el **Asistente** dentro de la sala y tocar **¿Cómo vamos con este incidente?**', 'Cuenta desde cuándo está, qué se sabe por las tareas hechas, qué falta y quién lo tiene. No inventa causas.'),
  fila(21, 'Tocar **¿Qué reviso primero?**', 'Empieza por el componente del antecedente parecido (IM-1: certificado vencido del gateway) y deja hasta 2 botones **Asignar tarea**. Tocar uno crea la tarea con la marca «Asistente».'),
  fila(22, 'Escribir «¿Escalo esto al proveedor?»', 'Responde con los datos de la sala y deja el botón **Escalar** (a la persona de Soporte con menos tareas). No dice «dejame consultar…» sin consultar.'),
  fila(23, 'Escribir «hola» y después «gracias».', 'Responde al instante con una frase fija, sin llamar al modelo y **sin bajar el contador** de preguntas.'),
  fila(24, 'Como Gerente, hacer la misma pregunta de la sala.', 'Responde pero sin botones de acción.'),
]));
h.push(H.titulo(2, '3.6 Cierre (escena 22)'));
h.push(...tabla([
  fila(25, 'Volver a la demo y tocar **Siguiente escena** dos veces: **21 · La sala de crisis trabaja** (el gateway sigue caído) y **22 · Servicio restablecido**.', 'Las alertas del gateway se cierran solas.'),
  fila(26, 'En la sala: **Servicio restablecido (mitigado)**.', 'El estado pasa a Mitigado y quienes tienen tareas abiertas reciben aviso.'),
  fila(27, 'Tocar **Cerrar con causa raíz**: escribir al menos 10 letras, elegir el componente «Gateway de pagos» y confirmar.', 'La sala queda Cerrada, las tareas abiertas se cancelan y deja de aceptar cambios. Pasa a la lista de antecedentes.'),
]));

h.push(H.titulo(1, '4. Teams'));
h.push(H.titulo(2, '4.1 Canal conectado (avisos)'));
h.push(...tabla([
  fila(28, 'Como **Administrador**: Administración > Equipos, bloque **Avisos en Teams**.', 'Dice «Conectado».'),
  fila(29, 'Tocar **Mandar aviso de prueba**.', 'En el canal **Plataforma Monitoreo** llega una tarjeta «Aviso de prueba» con el nombre de quien lo mandó y el botón **Abrir Helios** (sin «IM-0» ni estado de sala). Teams agrega abajo «… used a Workflow template…»: es normal.'),
]));
h.push(H.P('Mientras se hace la parte 3, mirar el canal. Cada acción de la sala tiene que llegar como tarjeta con el botón **Abrir sala en Helios**:'));
h.push(...H.tabla(['Acción en Helios', 'Lo que llega al canal'], [4000, w - 4000], [
  ['Abrir la sala de crisis (paso 4)', 'La sala nueva, en rojo si es grave, con «Abrió la sala…» y las alertas sumadas'],
  ['Sumar alertas (pasos 5, 10 y 12)', '«Sumó la alerta: …»'],
  ['Quitar una alerta (pasos 8 y 11)', '«Quitó la alerta: … Motivo: …»'],
  ['Asignar una tarea (pasos 13 y 21)', '«Asignó la tarea «…» a …»'],
  ['Soporte marca la tarea hecha (paso 15)', '«Tarea «…»: hecha» con lo que encontró'],
  ['Escalar (paso 18)', '«Escaló a …: <motivo>»'],
  ['Comunicar (paso 19)', '«Comunicó el incidente…»'],
  ['Mitigado y cierre (pasos 26 y 27)', 'El estado nuevo y, al cerrar, la causa raíz'],
  ['**No tienen que llegar**', 'Las notas de la línea de tiempo y «empezó la tarea» (paso 15, primera mitad)'],
], true));
h.push(H.titulo(2, '4.2 Chat en Teams'));
h.push(...tabla([
  fila(30, 'Con la sala abierta (antes del paso 26), tocar **Chat en Teams**.', 'Se abre Teams (el navegador puede preguntar si abre la app) con un chat grupal ya armado: título del incidente y enlace a la sala. Participan quien abrió la sala, quien la dirige, los responsables de tareas y Soporte de los equipos con tareas.'),
  fila(31, 'Probar con alguien sin correo cargado en Administración > Usuarios.', 'El botón avisa quién no tiene correo. Con una sola persona más, Teams arma un chat de a dos y no usa el título.'),
]));
h.push(H.titulo(2, '4.3 Con Teams caído (opcional)'));
h.push(...tabla([
  fila(32, 'En Cloudflare, cargar una dirección que no sea de Teams en `TEAMS_WEBHOOK` y hacer una acción en la sala.', 'La acción en Helios se hace igual. No llega nada al canal y en Observability queda un renglón que empieza con `Teams:`. Volver a cargar el secreto bueno al terminar.'),
]));

h.push(H.titulo(1, '5. Si algo no anda'));
h.push(...H.tabla(['Qué se ve', 'Qué revisar'], [3600, w - 3600], [
  ['«Falta correr 24_sala_crisis_d1.txt…»', 'Falta el script 24 en D1. Correrlo y volver a probar.'],
  ['No aparece **Abrir sala de crisis** en la alerta', 'Solo lo ve el Analista, con la alerta abierta y si no está ya en una sala abierta.'],
  ['Soporte no ve la sala', 'Solo la ve si tiene una tarea asignada a su usuario o a su equipo.'],
  ['No llega nada al canal', 'Administración > Equipos: tiene que decir «Conectado». Mandar el aviso de prueba. Si llega la prueba pero no las novedades, mirar Observability (`Teams:`).'],
  ['«Teams respondió 400»', 'El flujo de Workflows se borró o se cambió. Crearlo de nuevo y actualizar el secreto.'],
  ['**Chat en Teams** está gris', 'Nadie más de la sala tiene correo cargado, o todavía no hay otras personas en la sala.'],
  ['El asistente responde raro', 'Anotar la pregunta, el perfil y la respuesta. El gold set (`Helios_gold_set_asistente.docx`) tiene 20 preguntas con la respuesta esperada para puntuar.'],
], true));
h.push(...H.nota('idea', 'Para volver atrás', 'Cloudflare > Deployments > Rollback, o el Worker anterior en `99_Archivo_viejo/worker_antes_parche74/`. Las tablas del script 24 pueden quedar en la base.'));
const salida = process.argv[2] || '.';
H.guardar(H.documento({ titulo: 'Probar la sala de crisis y Teams', pie: 'Guía de prueba de la sala de crisis y de su integración con Teams', hijos: h }), path.join(salida, 'Helios_guia_prueba_sala_de_crisis_y_teams.docx')).then(() => console.log('ok'));
