// Arma el guion y el checklist de la DEMO OFICIAL (Word, estilo Helios): qué dejar listo antes, el relato de 14 escenas y qué decir y tocar con cada perfil
// (Gerente, Administrador, Analista, con Soporte como apoyo). Lo que dice coincide con demo_oficial_server.js (parche 82).
// Uso: node demo_oficial_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');
const h = [];
const V = (t) => h.push(H.vineta(t));
const P = (t) => h.push(H.P(t));
const T1 = (t) => h.push(H.titulo(1, t));
const T2 = (t) => h.push(H.titulo(2, t));
const NOTA = (tipo, et, t) => h.push(...H.nota(tipo, et, t));
let n = 0;
const paso = (t, subs) => { n += 1; h.push(H.P('**' + n + '.** ' + t, { par: { spacing: { before: 120, after: 50 } } })); (subs || []).forEach(V); };
const dice = (t) => '**Qué decir:** ' + t;

h.push(...H.cabecera('Demo oficial de Helios', 'Checklist previo y guion por perfil', 'Guion de la demo'));

// ---------------------------------------------------------------- 1
T1('1. De qué se trata');
P('La demo de siempre (22 escenas) termina con todo normalizado y las alertas cerradas, así que no deja nada para trabajar en vivo. La **demo oficial** es otra: un solo relato de **14 escenas** donde los incidentes importantes **quedan abiertos** y se trabajan con distintos perfiles. Tiene su propio botón y su propia dirección, y no se mezcla con la de siempre.');
h.push(...H.tabla(['', 'Demo de siempre', 'Demo oficial'], [1900, 4090, 4090], [
  ['**Dirección**', '`/?demo`', '`/?demo=oficial`'],
  ['**Botón**', 'Preparar demo', 'Preparar demo oficial'],
  ['**Escenas**', '22', '14'],
  ['**Arranca**', 'Lunes 26/10/2026 10:00', 'Martes 27/10/2026 10:00 (el reloj de la demo)'],
  ['**Al final**', 'Todo se normaliza', 'Quedan abiertos el gateway, el rechazo de CLI_004, la latencia de CLI_003 y el silencio de CLI_007'],
  ['**Para qué**', 'Pruebas y el video', 'Presentarle Helios a un cliente'],
], true));
P('Los tres actos que pidió la compañera se muestran con perfiles distintos, **sobre el mismo relato**:');
V('**Acto 1 · Gerente:** el dashboard gerencial (estado por cliente, incidentes activos, disponibilidad, distribución de fallas).');
V('**Acto 2 · Administrador:** lo parametrizable: umbrales y ancho de banda por cliente, reglas de alerta, plantillas de correo y usuarios con su correo.');
V('**Acto 3 · Analista:** pre-alertas, avisos push, el agente, el armado del correo, la sala de crisis y Teams. **Soporte** acompaña: recibe los avisos y trabaja lo que le derivan.');
NOTA('idea', 'Cómo se maneja', 'Una sola persona maneja las escenas (como **Analista** o **Administrador**: son los dos perfiles con demo) y muestra cada vista en otra ventana del navegador, con la sesión del perfil que corresponda. Conviene una ventana normal para quien maneja y una privada para el resto de los perfiles.');

// ---------------------------------------------------------------- 2
T1('2. Checklist previo (el día anterior)');
T2('2.1 Cloudflare y el Worker');
V('☐ **Worker publicado con el parche 82** (`01_Worker/worker_alertas_cron.js`, pegado en «Edit code» y Deploy). Sin SQL.');
V('☐ **Scripts de la base corridos:** 23 (correo de los usuarios), 24 (sala de crisis) y 25 (memoria del bot de Teams). Verificar en Administración > Equipos que dice que el bot recuerda la conversación.');
V('☐ **El asistente anda:** abrir el panel «Asistente» como Analista y preguntar «Resumen del turno». Límites: 20 preguntas por persona por hora y 100 por día en total; si se ensaya mucho el mismo día, subir `ASISTENTE_POR_DIA` o ensayar el día anterior.');
V('☐ **Cloudflare > Observability** abierto en una pestaña para mirar errores si algo no responde (`Bot de Teams:`, `Teams:`, `Asistente:`).');
T2('2.2 Personas y permisos');
V('☐ Un **Administrador**, un **Gerente**, un **Analista** (Analista1) y dos de **Soporte** (Soporte1 y Soporte2). Todos con **el correo cargado** en Administración > Usuarios, igual al de Teams (el bot identifica a cada persona por ese correo).');
V('☐ Un **equipo** (por ejemplo «Mesa de ayuda») con Soporte1 y Soporte2, para derivar a una persona o al equipo.');
V('☐ Todos con la **contraseña ya cambiada** (la primera vez Helios pide cambiarla y se pierde tiempo en vivo).');
T2('2.3 Avisos push en el celular');
V('☐ Entrar en el celular como **Soporte1**, abrir la campanita y tocar **Activar**. En Android alcanza con Chrome; en iPhone hay que agregar Helios a la pantalla de inicio (iOS 16.4 o más).');
V('☐ Probar: derivar cualquier alerta de la demo a Soporte1 y ver que llega el aviso con la pantalla bloqueada. Después «Preparar demo oficial» lo deja en cero.');
T2('2.4 Teams');
V('☐ **Canal de avisos** («Plataforma Monitoreo») abierto en otra ventana. Administración > Equipos > «Avisos en Teams» tiene que decir **Conectado**; tocar «Mandar aviso de prueba» y ver la tarjeta.');
V('☐ **La app Gemma instalada** y un chat de prueba donde esté Gemma. Escribir `@Gemma hola` (eligiéndola de la lista que aparece al escribir `@`) y ver que saluda **una sola vez**.');
V('☐ Los que van a preguntarle a Gemma tienen el **mismo correo** en Teams y en Helios.');
T2('2.5 Lo que hay que dejar «de fábrica» para que la demo salga igual cada vez');
V('☐ **Umbrales de CLI_001** (Administración > Umbrales > CLI_001): el campo **«Aprobaciones, rechazos y errores»** (ancho de banda de las tasas) en **100 %**. En el acto 2 se lo sube a 140 % y ese cambio **queda guardado**: «Preparar demo oficial» no lo deshace, porque es configuración y no datos de la demo.');
V('☐ **Plantillas de correo**: las 6 de fábrica (General, Aviso al cliente, Escalar a proveedor o gateway, Caída: escalar a Mesa de ayuda, Aviso a Comercial, Cierre del incidente). Si se creó una de ensayo, borrarla.');
V('☐ **Jira o InvGate:** el ticket sale **simulado** (HEL-101, INV-1001) salvo que Jira esté prendido en real (`TICKETS_JIRA = real`). Si está en real, el ticket se crea de verdad en el proyecto KAN: avisarlo antes de tocar «Generar ticket».');
NOTA('regla', 'Ojo con «Preparar demo oficial»', 'Borra las alertas, los avisos, las salas de crisis, los tickets, los comunicados, la memoria del bot de Teams y las métricas de la demo. No toca usuarios, equipos, plantillas ni umbrales. No hacerlo si en Cloudflare hay algo real que cuidar.');
T2('2.6 Ensayo general');
V('☐ Hacer **una pasada completa** el día anterior con este mismo guion y anotar el tiempo (30 a 40 minutos).');
V('☐ Al terminar, **volver a dejar CLI_001 en 100 %** y tocar «Preparar demo oficial» para empezar limpio.');

// ---------------------------------------------------------------- 3
T1('3. El relato en 14 escenas');
P('Cada escena es una ventana de 15 minutos. **El cartel del tablero siempre muestra la escena que viene** («Próxima: escena N»). Para mostrar lo que pasó en la escena 5 hay que haber tocado «Siguiente escena» cinco veces.');
h.push(...H.tabla(['Escena', 'Qué pasa', 'Perfil', 'Qué queda'], [700, 4300, 1700, 3380], [
  ['1', 'Arranca la guardia: las 13 series dentro de lo esperado.', 'Gerente', 'Todo en verde'],
  ['2', 'La app de CLI_001 se queda muda (transferencias mobile al 45 %).', 'Gerente', 'Alerta grave de volumen bajo'],
  ['3', 'CLI_001 se recupera solo. Los rechazos de CLI_004 empiezan a subir (todavía sin aviso).', 'Gerente', 'La alerta se cierra sola'],
  ['4', '**Pre-alerta** en CLI_004: los rechazos usan el 80 % del margen.', 'Analista', 'Pre-alerta activa'],
  ['5', '**Se confirma:** rechazo alto en CLI_004 (el antifraude).', 'Analista', 'Alerta abierta (leve), pre-alerta confirmada'],
  ['6', 'La latencia de CLI_003 empieza a subir.', 'Analista', 'Sigue abierto el rechazo'],
  ['7', '**Segunda pre-alerta:** recargas lentas en CLI_003.', 'Analista', 'Dos pre-alertas en el historial'],
  ['8', '**Se confirma:** latencia alta en CLI_003 (el proveedor).', 'Analista', 'Alerta grave abierta'],
  ['9', '**Se cae el gateway de pagos:** CLI_006 sin éxitos, errores en CLI_002 y CLI_005.', 'Analista', 'Tres clientes, un mismo origen: sala de crisis'],
  ['10', 'El gateway sigue caído.', 'Analista', 'La sala trabaja'],
  ['11', 'CLI_007 deja de enviar datos.', 'Gerente', 'Alerta grave de «dejaron de llegar datos»'],
  ['12', '**Una métrica en el borde:** los rechazos de CLI_001 Web pasan apenas el límite.', 'Administrador', 'Alerta leve discutible'],
  ['13', 'Llega un cliente nuevo (CLI_008). Si se ajustó la banda de CLI_001, su alerta se cierra sola.', 'Gerente', 'Aviso informativo de cliente nuevo'],
  ['14', '**Estado final:** nada se cierra solo.', 'Gerente', '9 problemas abiertos para trabajar'],
], false));
NOTA('idea', 'Dónde se pausa', 'No hace falta tocar «Siguiente escena» de corrido. Las pausas naturales son las escenas **3** (cierre automático), **5** (alerta con pre-alerta confirmada), **8** (proveedor lento), **10** (sala de crisis), **12** (el ajuste del Administrador) y **14** (dashboard final).');

// ---------------------------------------------------------------- 4
T1('4. Guion por perfil');
P('Lo que sigue está ordenado como se presenta, escena por escena. Cada bloque dice con qué perfil se muestra, qué tocar y qué decir.');

T2('Preparación (2 minutos)');
paso('Como **Analista**, abrir `/?demo=oficial` (o entrar al login con esa dirección: después del ingreso va solo). Tocar **Preparar demo oficial** y confirmar.', [
  'El cartel dice «Próxima: escena 1 de 14».',
  dice('«Todo lo que van a ver son datos ficticios, pero se comportan como los de un cliente que procesa transacciones: Helios compara cada 15 minutos lo observado contra lo esperado para cada cliente, servicio y canal.»'),
]);

T2('Acto 1 · Gerente: el dashboard (escenas 1 a 3)');
paso('Tocar **Siguiente escena** (escena 1). En una ventana privada, entrar como **Gerente**.', [
  '**Mostrar:** el tablero, «Estado por cliente» con todos los clientes en verde y la pestaña **Disponibilidad** (100 %).',
  dice('«El Gerente ve el negocio en una sola pantalla: qué clientes están bien, qué servicios y canales tienen problemas, y la disponibilidad contra el objetivo del mes. Todo en solo lectura.»'),
]);
paso('Escena 2: **se cae CLI_001**. Actualizar el tablero del Gerente (se actualiza solo cada 2 minutos).', [
  '**Mostrar:** «Estado por cliente» (CLI_001 en rojo con el servicio y el canal afectados), «Incidentes activos ahora» y la lista de alertas abiertas con **quién la tiene** (todavía nadie).',
  dice('«El gerente puede ver, sin preguntarle a un analista, si alguien ya está trabajando el incidente. Acá todavía nadie: lo va a derivar el Analista.»'),
]);
paso('Escena 3: **CLI_001 se recupera solo.**', [
  '**Mostrar:** la alerta se cerró sola; en **Histórico** aparece como «se normalizó solo». Pestaña **Disponibilidad**: el cliente bajó del 100 % por esa ventana.',
  dice('«No todo requiere intervención: cuando el servicio vuelve, la alerta se cierra sola y queda en el histórico con cuánto duró.»'),
]);

T2('Acto 3 · Analista: pre-alertas, push y el agente (escenas 4 a 8)');
paso('Escena 4: **pre-alerta en CLI_004.** Como **Analista**: pestaña **Operaciones > Pre-alertas**.', [
  '**Mostrar:** «Tendencia al alza en la tasa de rechazo», «Superaría el umbral en aprox. 15 minutos», valor actual, esperado y umbral. Todavía **no hay alerta**.',
  '**Tocar «Avisar a Soporte»** y elegir a **Soporte1**: llega el **aviso push** al celular (mostrar el celular con la pantalla bloqueada).',
  dice('«Helios no espera a que el problema ocurra: avisa antes de que se cruce el límite. Y el aviso le llega a la persona correcta, al celular, aunque no tenga Helios abierto.»'),
  '**Agente:** abrir «Asistente» y tocar la pregunta fija **«¿Qué pre-alertas conviene avisar a Soporte?»**.',
]);
paso('Escena 5: **se confirma el rechazo en CLI_004.**', [
  '**Mostrar:** la alerta nueva con su prioridad (P1 a P4) y, en pre-alertas, el resultado «Confirmada» con los minutos de anticipación.',
  '**Derivar** la alerta a Soporte1 (botón «Derivar»). Mostrar el **push** en el celular: «Te asignaron una alerta».',
  '**Agente:** en la alerta, tocar **«¿Qué está pasando?»**: explica el problema con los datos y los casos parecidos ya cerrados.',
  dice('«El agente solo lee con los permisos de quien pregunta y **propone**: nunca ejecuta. Los botones los confirma una persona.»'),
]);
paso('Escenas 6, 7 y 8: **la latencia de CLI_003 se confirma.**', [
  'En la 7 aparece la segunda pre-alerta; en la 8 se abre la alerta **grave** (el proveedor tarda casi el doble).',
  '**Agente:** preguntas fijas **«Resumen del turno»** y **«¿Qué está sin asignar y a quién lo derivo?»** (deja los botones «Derivar»; mostrar uno sin tocarlo).',
  dice('«En el resumen del turno el agente ordena lo urgente y sugiere a quién derivar según la carga de cada persona de Soporte.»'),
]);
paso('**Armar el correo al proveedor** (en la alerta de latencia de CLI_003). Tocar **«Template correo»**.', [
  '**Mostrar:** el borrador ya armado con los datos de la alerta (qué pasa, cliente, desde cuándo, última medición, estado, enlace). Elegir la plantilla **«Escalar a proveedor o gateway»**.',
  '**«Elegir de la lista»**: buscar personas y equipos por nombre o correo (también se pueden escribir direcciones externas a mano).',
  '**Abrir en Outlook web**, o copiar el texto. Volver y tocar **«Confirmar envío»** (se envió tal cual, con cambios o no se envió): queda en la conversación de la alerta.',
  '**«Generar ticket»** (Jira o InvGate): el número va al asunto y a la conversación.',
  dice('«Helios no manda el correo solo: lo deja armado en segundos y deja constancia de si se envió y a quién. Así no se escribe todo a mano en medio de un incidente.»'),
]);

T2('Acto 3 · Analista: sala de crisis y Teams (escenas 9 y 10)');
paso('Escena 9: **se cae el gateway de pagos.** En el tablero: tres clientes con problemas a la vez.', [
  dice('«Tres clientes con errores en el mismo momento: es el mismo origen, el gateway de pagos. Esto ya no es una alerta, es un incidente mayor.»'),
  'En la alerta grave de CLI_006 tocar **«Abrir sala de crisis»**, sumar las alertas de CLI_002 y CLI_005 y poner un título. Es la sala **IM-4**.',
  '**En Teams:** llega la tarjeta de apertura al canal. Tocar **«Chat en Teams»** (arma un chat con las personas de la sala).',
]);
paso('Escena 10: **la sala trabaja.**', [
  '**Mostrar:** la guía de diagnóstico (componentes de los que depende el servicio, qué revisar en cada uno, **incidentes parecidos ya cerrados con su causa raíz**) y la línea de tiempo.',
  '**Agente de la sala:** **«¿Qué reviso primero?»**: propone tareas por componente. **Confirmar** una (asignar a Soporte1) y ver el aviso push; otras preguntas: **«¿Cómo vamos con este incidente?»** y **«¿Qué está demorado?»**.',
  '**Soporte1** (en el celular o en otra ventana): abrir **«Mis alertas/tareas»**, ver la tarea en «Tareas de salas de crisis», tocar **«Abrir la sala»**, **Empezar** y **Marcar hecha** contando qué encontró. En la sala y en Teams se ve cada novedad.',
  '**«Comunicar incidente»** a los equipos (técnicos dan «Recibido» desde el aviso, líderes responden).',
  '**Gemma en Teams:** en el chat, `@Gemma IM-4 ¿qué reviso primero?`, después `@Gemma ¿hubo algo parecido antes?` y `@Gemma ¿qué tareas tengo?`.',
  dice('«El agente también está donde ya trabaja el equipo: en Teams. Contesta con lo que cada persona puede ver en Helios y, si propone algo, manda el enlace para confirmarlo: nunca hace cambios por su cuenta.»'),
]);
NOTA('regla', 'Si Teams o el agente no responden', 'Seguir sin ellos: la sala funciona igual. Mirar Observability (`Bot de Teams:` / `Asistente:`) después de la demo. Si el límite de preguntas se agotó, el panel lo dice con un mensaje claro.');

T2('Acto 1 · Gerente, otra vez (escena 11)');
paso('Escena 11: **CLI_007 deja de enviar.** Volver a la ventana del **Gerente** y actualizar.', [
  '**Mostrar:** «Incidentes activos ahora» (barras por cliente y por gravedad; tocar una barra filtra la lista), la **lista de alertas** con su estado y **quién las tiene** (Soporte1 con la de CLI_004, la sala con el gateway) y abrir el **detalle** de una alerta: conversación completa, **en solo lectura**.',
  '**Agente del Gerente:** **«¿Qué incidentes están activos y quién los está trabajando?»**.',
  dice('«El silencio también es una alerta: un cliente que deja de enviar datos es un problema aunque no haya números malos. Y el gerente ve todo el estado sin llamar a nadie.»'),
]);

T2('Acto 2 · Administrador: lo parametrizable (escena 12)');
paso('Escena 12: **una métrica en el borde.** Aparece una alerta leve de rechazo alto en CLI_001 Web. Entrar como **Administrador**.', [
  dice('«¿Esta alerta es un problema real o el límite está muy ajustado para este cliente? Eso lo decide el negocio, y Helios lo deja configurar sin tocar código.»'),
  '**Administración > Umbrales > CLI_001:** mostrar «Cómo decide Helios» (4 pasos) y los campos: **criticidad**, **objetivo de disponibilidad**, **cortes de gravedad**, **ancho de banda**, volumen mínimo y gracia. Cada uno tiene su explicación y un ejemplo «En la práctica» que se actualiza al escribir. El modelo muestra lo que espera para ese cliente y una recomendación.',
  '**Cambiar «Aprobaciones, rechazos y errores» (el ancho de banda de las tasas) de 100 % a 140 %** y guardar. Queda en la auditoría.',
  '**Volver a la demo** (`/?demo=oficial` como Analista) y tocar **«Siguiente escena»** (escena 13): con la banda nueva esa métrica ya no alerta y **la alerta de CLI_001 se cierra sola**. Si se quiere aplicar el cambio también a lo que ya pasó: Umbrales, al final, «Recalcular 24 h».',
  dice('«Los límites los calcula el modelo a partir del histórico del cliente; la persona solo decide cuánto margen darle. Con los valores de fábrica el sistema se comporta igual que antes.»'),
]);
paso('**Plantillas de correo y reglas** (Administración).', [
  '**Plantillas de correo:** abrir «Escalar a proveedor o gateway» y mostrar el asunto y el texto con las variables entre llaves (`{cliente}`, `{problema}`, `{desde}`, `{medicion}`, `{firma}`…), el sector, los tipos de alerta a los que aplica y el **ejemplo en vivo**. Crear una nueva de 3 líneas («Aviso a Comercial») y borrarla.',
  '**Reglas de alerta:** las 12 del sistema (se pueden apagar) y las **personalizadas** (elegir métrica, dirección, ventanas seguidas, cliente y gravedad). **Reglas de derivación:** a quién le llega cada tipo de alerta de forma automática.',
  '**Usuarios y equipos:** perfiles (Administrador, Gerente, Analista, Soporte, «Solo comunicados»), el **correo** de cada persona (se usa para elegir destinatarios y para identificar a quien le pregunta a Gemma en Teams) y los equipos con el rol de cada uno para los comunicados.',
  dice('«Todo lo que ven en el correo, en las derivaciones y en los avisos se configura desde acá, sin pedirle nada a un desarrollador.»'),
]);

T2('Cierre · Gerente y Soporte (escenas 13 y 14)');
paso('Escenas 13 y 14: **cliente nuevo y estado final.**', [
  '**Mostrar** (Gerente): «Estado por cliente» con CLI_008 como **cliente nuevo** (todavía sin historia para comparar), las alertas que siguen abiertas y la pestaña **Disponibilidad**: disponibilidad global y por cliente contra el objetivo, tiempo sin servicio contra lo que permite el objetivo, semáforo (Cumple / En riesgo / No cumple) y la evolución por cliente.',
  '**Resolver en vivo** (Soporte1 o el Analista): resolver la alerta de CLI_004 eligiendo **«¿Qué lo causó?»** y **«¿Qué se hizo?»** de las listas. Volver al Gerente: **Distribución de fallas** ahora muestra esa causa.',
  '**Sala de crisis:** pasarla a **Mitigado**, y **cerrar con la causa raíz**: queda como antecedente para la próxima vez (lo van a ver las próximas salas en la guía de diagnóstico).',
  dice('«Helios no solo avisa: ordena el trabajo, deja constancia de qué se hizo y aprende de cada incidente.»'),
]);

// ---------------------------------------------------------------- 5
T1('5. Preguntas para el agente, por perfil');
h.push(...H.tabla(['Perfil', 'Preguntas fijas (abajo del panel)', 'Para qué'], [1500, 4800, 3780], [
  ['**Analista**', 'Resumen del turno · ¿Qué está sin asignar y a quién lo derivo? · ¿Hay alertas relacionadas entre sí? · ¿Qué pre-alertas conviene avisar a Soporte? · ¿Qué alertas llevan más tiempo abiertas? · ¿Hay algo de afuera que pueda afectar hoy o mañana?', 'Escenas 4 a 8 y 11'],
  ['**Analista, en la sala**', '¿Cómo vamos con este incidente? · ¿Qué reviso primero? · ¿Qué está demorado?', 'Escena 10'],
  ['**Gerente**', '¿Cómo está la operación ahora? · ¿Qué cliente tuvo más problemas este mes? · ¿Qué incidentes están activos y quién los está trabajando?', 'Escenas 11, 13 y 14'],
  ['**Soporte**', '¿Qué tengo pendiente y por dónde empiezo?', 'Cuando recibe la derivación'],
  ['**Administrador**', '¿Qué umbrales conviene revisar? · ¿Cómo está la operación ahora?', 'Escena 12'],
  ['**En Teams (Gemma)**', '@Gemma IM-4 ¿qué reviso primero? · ¿hubo algo parecido antes? · ¿qué tareas tengo? · ¿qué alertas tengo asignadas?', 'Escena 10'],
], true));
NOTA('idea', 'Cuidar las preguntas', 'Cada persona tiene 20 preguntas por hora y entre todos hay un tope diario. Los saludos sueltos («hola», «gracias») no cuentan. Cada pregunta nueva conviene hacerla en una conversación nueva (cerrar y abrir el panel).');

// ---------------------------------------------------------------- 6
T1('6. Si algo sale distinto');
h.push(...H.tabla(['Qué pasa', 'Qué hacer'], [3600, 6480], [
  ['El cartel no dice la escena esperada', 'Es la **próxima** escena, no la actual. Para estar «en la 5», hay que haber tocado «Siguiente escena» cinco veces.'],
  ['No aparece el panel de la demo', 'Abrir `/?demo=oficial` con un usuario **Analista o Administrador**. El Gerente y Soporte no tienen demo.'],
  ['Se ve el panel de la demo de siempre', 'La dirección tiene que terminar en `?demo=oficial` (no solo `?demo`).'],
  ['La alerta de CLI_001 no se cierra al ajustar la banda', 'Falta tocar «Siguiente escena»: el cambio rige desde la próxima ventana. «Recalcular 24 h» aplica el cambio a lo anterior, pero con el reloj de la demo detenido la última ventana solo se cierra con otra.'],
  ['La banda de CLI_001 quedó en 140 % de un ensayo anterior', 'La alerta de la escena 12 no aparece. Volver a dejar el ancho de banda de las tasas en 100 % y repetir.'],
  ['No llega el push al celular', 'Entrar al celular como esa persona y tocar «Activar» en la campanita. En PC, Chrome tiene que quedar corriendo en segundo plano. Plan B: mostrar la campanita dentro de Helios.'],
  ['Gemma no contesta', 'Mencionarla eligiéndola de la lista (`@` y elegir), con el correo de Teams igual al de Helios. Mirar Observability (`Bot de Teams:`). Plan B: usar el asistente del panel de Helios, que hace lo mismo.'],
  ['El asistente dice que no puede responder', 'Se acabaron las preguntas de la hora o del día. Esperar o usar otra persona. Las respuestas siguen siendo las de siempre cuando vuelve.'],
  ['Quedó algo de un ensayo anterior', 'Tocar **Preparar demo oficial**: borra alertas, avisos, salas, tickets y comunicados. No toca usuarios, plantillas ni umbrales.'],
], true));
NOTA('regla', 'Después de la demo', 'Volver a dejar CLI_001 en 100 %, tocar «Preparar demo oficial» y, si se instaló el celular con push, cerrar sesión en el celular.');

const salida = process.argv[2] || '.';
H.guardar(H.documento({ titulo: 'Demo oficial de Helios', pie: 'Guion y checklist de la demo oficial', hijos: h }), path.join(salida, 'Helios_demo_oficial_guion_y_checklist.docx')).then(() => console.log('ok, pasos:', n));
