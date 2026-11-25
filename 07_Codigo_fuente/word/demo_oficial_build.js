// Arma los dos documentos de la DEMO OFICIAL (Word, estilo Helios):
//   1) Helios_demo_oficial_checklist.docx  lo que hay que dejar listo antes (cada punto dice dónde se hace)
//   2) Helios_demo_oficial_guion.docx      el guion para presentar: qué tocar y qué decir, por perfil
// Lo que dicen coincide con demo_oficial_escena_server.js (parche 83: una sola escena).
// Uso: node demo_oficial_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');

// ============================================================ 1 · CHECKLIST
{
  const h = [];
  const T2 = (t) => h.push(H.titulo(2, t));
  const A = [2300, 7780];
  const ENC = ['Dónde', 'Qué hacer y cómo sé que está bien'];
  h.push(...H.cabecera('Demo oficial de Helios', 'Qué dejar listo antes de presentar', 'Checklist previo'));
  h.push(H.P('Cada renglón dice **dónde** hay que hacerlo: **Cloudflare** (el panel donde vive el sistema), **Helios** (nuestra app, con el usuario que se indica), **Teams** (Microsoft Teams) o **el celular**. Hacer una pasada completa con el guion el día anterior (25 a 30 minutos). La demo es **una sola escena** que se carga de una vez: no hay escenas que avanzar.'));

  T2('1 · Cloudflare (panel de Cloudflare, con tu cuenta)');
  h.push(...H.tabla(ENC, A, [
    ['Cloudflare > Workers y Pages > `worker-alertas-cron` > **Edit code**', '☐ Pegar el código de `01_Worker/worker_alertas_cron.js` (parche 83) y tocar **Deploy**. No lleva SQL.'],
    ['Cloudflare > Almacenamiento y bases de datos > D1 > `helios-monitoring-dev` > **Console**', '☐ Verificar los scripts 23, 24 y 25 con esta línea: `SELECT (SELECT COUNT(*) FROM sqlite_master WHERE name IN (\'incidentes_mayores\', \'teams_bot_memoria\')) AS tablas, (SELECT COUNT(*) FROM usuarios WHERE correo IS NOT NULL) AS con_correo;` Tiene que dar **tablas = 2** (y no dar error). Si da error o 1, falta correr el script de `02_Base_de_datos_D1` que corresponde.'],
    ['Cloudflare > `worker-alertas-cron` > **Settings** > Variables y secretos', '☐ Mirar `TICKETS_JIRA`. Si vale `real`, «Generar ticket» crea un ticket verdadero en Jira (proyecto KAN). Si no existe o es otro valor, el ticket sale simulado (HEL-101). Elegir cuál se quiere mostrar.'],
  ], true));

  T2('2 · Personas (Helios, entrando como Administrador)');
  h.push(...H.tabla(ENC, A, [
    ['Helios > menú de la foto de perfil > **Administración** > pestaña **Usuarios** > botón **Nuevo usuario**', '☐ Tienen que existir: un **Administrador**, un **Gerente**, un **Analista** y dos de **Soporte** con usuario **soporte1** y **soporte2** (la escena deja alertas asignadas a ellos; si no existen, usa las primeras personas de Soporte activas, y sin nadie de Soporte queda todo sin asignar). Cada uno con el campo **Correo** cargado (el mismo que usa en Teams). ☐ Al crear cada usuario, Helios muestra una **contraseña temporal**: entrar una vez con cada uno (en una ventana privada) y cambiarla, así no queda pendiente en plena demo.'],
    ['Helios > **Administración** > pestaña **Equipos** > botón **Nuevo equipo**', '☐ Un equipo (por ejemplo «Mesa de ayuda») con **Soporte1** y **Soporte2** tildados como integrantes. La escena le asigna al equipo los errores de CLI_002; sin equipo, esa alerta queda sin asignar.'],
  ], true));

  T2('3 · Push en el celular');
  h.push(...H.tabla(ENC, A, [
    ['El celular, en el navegador (iPhone: en Safari > Compartir > **Agregar a pantalla de inicio** y abrir desde ese ícono)', '☐ Entrar a Helios como **Soporte1**. Tocar la **campanita** (arriba a la derecha) y después el botón **Activar**; aceptar el permiso de notificaciones del celular.'],
    ['Helios, desde la compu', '☐ Probar: con el Analista, en el tablero, **Operaciones > Pre-alertas > Avisar a Soporte** a Soporte1 (o derivarle una alerta). Tiene que sonar el celular **con la pantalla bloqueada**.'],
  ], true));

  T2('4 · Teams');
  h.push(...H.tabla(ENC, A, [
    ['Helios > **Administración** > pestaña **Equipos** > recuadro **«Avisos en Teams»** (hay que ser Administrador)', '☐ Tiene que decir **«Conectado: las novedades de las salas de crisis… llegan al canal de Teams»**. Si dice **«Sin conectar»**, falta cargar el secreto `TEAMS_WEBHOOK` en Cloudflare. ☐ Tocar el botón **«Mandar aviso de prueba»**.'],
    ['Teams, canal **«Plataforma Monitoreo»** (equipo «Plataforma Monitoreo»)', '☐ Tiene que aparecer una tarjeta **«Aviso de prueba»** con el botón «Abrir Helios». ☐ Dejar este canal abierto en otra ventana: en la demo, al abrir la sala de crisis, ahí se ven llegar las novedades.'],
    ['Teams, en un chat de prueba (donde estén vos y alguien más)', '☐ Escribir `@Gemma hola`. Al escribir `@` elegir **Gemma** de la lista que aparece (si se escribe a mano, no le llega). Tiene que contestar con **un solo saludo**. Tu correo en Teams tiene que ser el mismo que el de tu usuario de Helios.'],
  ], true));

  T2('5 · Dejar de fábrica (Helios, como Administrador)');
  h.push(...H.tabla(ENC, A, [
    ['Helios > **Administración** > pestaña **Umbrales**', '☐ Si en **«Excepciones por cliente»** hay una de **CLI_001**, abrirla: en el grupo **«Ancho de la banda del modelo»**, el campo **«Aprobaciones, rechazos y errores»** tiene que estar en **100 %**. La escena trae una alerta de rechazos de CLI_001 Web en el borde del límite y solo aparece con la banda en 100 %. Si en la demo se prueba un cambio y se guarda, volver a dejarlo en 100 %.'],
    ['Helios > **Administración** > pestaña **Derivación**', '☐ Revisar las reglas de derivación: la escena deja a propósito varias alertas sin asignar, y una regla automática podría asignarlas antes de tiempo. Borrar o apagar las de ensayo.'],
    ['Helios > **Administración** > pestaña **Plantillas de correo**', '☐ Tienen que estar las 6 de fábrica (General, Aviso al cliente, Escalar a proveedor o gateway, Caída: escalar a Mesa de ayuda, Aviso a Comercial, Cierre del incidente). Borrar las de ensayo.'],
  ], true));

  T2('6 · Justo antes de empezar');
  h.push(...H.tabla(ENC, A, [
    ['La compu (navegador)', '☐ **Analista** en una ventana normal, **Gerente** en una ventana privada y **Administrador** en otro navegador (o cerrando sesión y entrando cuando toque). Una ventana privada no admite dos usuarios a la vez.'],
    ['Helios, como **Analista**: dirección `https://worker-alertas-cron.developers-hs-842.workers.dev/?demo=oficial`', '☐ Tocar **Preparar demo oficial**: deja alertas, avisos, salas, tickets, comunicados, memoria del bot y métricas en cero (no toca usuarios, equipos, plantillas ni umbrales). Arriba tiene que decir **«Escena única · Una mañana de operación con incidentes en todos los estados»**.'],
    ['Helios, como **Analista**, en el mismo panel', '☐ Tocar **Cargar escena** y esperar unos segundos: el botón va diciendo **«Cargando… N %»** y al final aparece **«Escena cargada: 9 alertas abiertas, 5 resueltas y 4 pre-alertas»**. Si se corta, tocar **Cargar escena** otra vez: sigue donde quedó.'],
    ['Helios > **Seguimiento** (menú de la foto de perfil)', '☐ Los contadores tienen que decir **5 sin asignar, 1 devuelta, 2 asignadas sin tomar, 1 en curso**. En el tablero, el titular dice **«7 clientes con problemas»**. Con eso la escena quedó bien. El reloj queda detenido: se puede cargar un rato antes y no cambia nada.'],
    ['Cloudflare > `worker-alertas-cron` > **Observability**', '☐ Dejar esta pestaña abierta, por si algo no responde.'],
  ], true));

  h.push(...H.nota('regla', 'Después de la demo', 'En Helios, como Analista, tocar «Preparar demo oficial» (deja todo en cero), volver a dejar CLI_001 en 100 % en Administración > Umbrales si se guardó otro valor, y en el celular cerrar sesión.'));

  T2('Si algo sale distinto');
  h.push(...H.tabla(['Qué pasa', 'Qué hacer'], [3400, 6680], [
    ['El botón queda en «Cargando…» o da un error', 'Tocar **Cargar escena** otra vez: retoma donde quedó. Si sigue igual, tocar **Preparar demo oficial**, volver a cargar y mirar Cloudflare > Observability.'],
    ['No aparece el panel de la demo', 'Abrir la dirección con `/?demo=oficial` con un usuario Analista o Administrador (Gerente y Soporte no tienen demo). Si se ve la demo de siempre, falta el `=oficial`.'],
    ['Todas las alertas están sin asignar', 'No hay personas de Soporte activas (o no existen soporte1 y soporte2): crearlas en Administración > Usuarios y repetir con **Preparar demo oficial** y **Cargar escena**.'],
    ['Alertas que deberían estar sin asignar aparecen asignadas', 'Hay una regla de derivación automática (Administración > Derivación). Apagarla y repetir con **Preparar demo oficial** y **Cargar escena**.'],
    ['Falta la alerta de rechazos de CLI_001 Web', 'Quedó la banda en 140 % de un ensayo: Administración > Umbrales, volver a 100 % y repetir con **Preparar demo oficial** y **Cargar escena**.'],
    ['No llega el push al celular', 'En el celular, entrar a Helios como esa persona, tocar la campanita y **Activar**. Plan B: mostrar la campanita dentro de Helios.'],
    ['Gemma no contesta en Teams', 'Mencionarla eligiéndola de la lista al escribir `@` y con el mismo correo en Teams y en Helios. Plan B: el asistente del panel de Helios (botón «Asistente», abajo a la derecha) hace lo mismo.'],
    ['El asistente dice que no puede responder', 'Se acabó el cupo de la hora o del día. Probar con otra persona o seguir sin él.'],
    ['Se derivó, resolvió o cerró algo y se quiere volver al principio', 'Tocar **Preparar demo oficial** y **Cargar escena** (30 segundos): vuelve todo a como estaba.'],
  ], true));

  const doc = H.documento({ titulo: 'Demo oficial de Helios: checklist', pie: 'Checklist de la demo oficial', hijos: h });
  H.guardar(doc, path.join(process.argv[2] || '.', 'Helios_demo_oficial_checklist.docx')).then(() => console.log('ok checklist'));
}

// ============================================================ 2 · GUION
{
  const h = [];
  const T2 = (t) => h.push(H.titulo(2, t));
  const A = [1250, 5130, 3700];
  const ENC = ['Perfil', 'Qué tocar', 'Qué decir'];
  h.push(...H.cabecera('Demo oficial de Helios', 'Guion: qué tocar y qué decir', 'Guion de la demo'));
  h.push(H.P('Duración: 25 a 30 minutos. Todo sale de **una sola escena** que se carga de una vez (una mañana de operación, de 10:00 a 14:00): no hay que avanzar nada, así que se puede ir y venir entre perfiles y mostrar cada cosa las veces que haga falta. Se maneja desde `/?demo=oficial` como **Analista**; el Gerente y el Administrador van en otras ventanas.'));

  T2('Arranque (1 minuto)');
  h.push(...H.tabla(ENC, A, [
    ['Analista', 'Abrir `/?demo=oficial`, tocar **Preparar demo oficial** y después **Cargar escena** (unos segundos: «Cargando… N %»). Tiene que decir «Escena cargada: 9 alertas abiertas, 5 resueltas y 4 pre-alertas».', '«Los datos son ficticios, pero se comportan como los de un cliente que procesa transacciones. Es una mañana de operación y hay de todo: alertas sin asignar, asignadas, en curso, devueltas y resueltas.»'],
  ], true));

  T2('Acto 1 · Gerente: el dashboard (5 minutos)');
  h.push(...H.tabla(ENC, A, [
    ['Gerente', 'Pestaña **Operaciones:** **Estado por cliente** (7 clientes con problemas) e **Incidentes activos ahora**; tocar una barra para filtrar la lista. Abrir el **detalle** de la latencia de CLI_003 (solo lectura).', '«El gerente ve el negocio en una sola pantalla: qué está caído y quién lo está trabajando, sin preguntarle a nadie.»'],
    ['Gerente', 'Pestaña **Disponibilidad:** las tarjetas contra el objetivo, la evolución del día y **Distribución de fallas** (por cliente, por tipo y **por causa**). Pestaña **Histórico:** lo resuelto solo y lo resuelto a mano.', '«Mide contra el objetivo de cada cliente, y cada causa que se carga al resolver alimenta el análisis.»'],
  ], true));

  T2('Acto 2 · Administrador: lo parametrizable (4 minutos)');
  h.push(...H.tabla(ENC, A, [
    ['Administrador', '**Umbrales > CLI_001:** abrir el diálogo, mostrar **«Aprobaciones, rechazos y errores»** con el ejemplo **«En la práctica»** y subirlo de 100 % a 140 % para ver cómo cambia el límite. **Cerrar sin guardar.** La alerta leve de rechazos de CLI_001 Web es justo de las que dependen de ese margen.', '«Los límites los calcula el modelo; la persona decide cuánto margen darle, por cliente y sin tocar código. El cambio vale para los datos que lleguen desde ese momento.»'],
    ['Administrador', 'Abrir una **plantilla de correo** (con el ejemplo en vivo), las **reglas de alerta** y de **derivación**, y **Usuarios** con su correo.', '«Los correos, las derivaciones y los avisos se configuran acá, sin pedirle nada a un desarrollador.»'],
  ], true));

  T2('Acto 3 · Analista: del aviso a la resolución (15 minutos)');
  h.push(...H.tabla(ENC, A, [
    ['Analista', '**Seguimiento:** los contadores (5 sin asignar, 1 devuelta, 2 asignadas sin tomar, 1 en curso). Señalar lo demorado en rojo (la grave de CLI_006 lleva 46 minutos sin asignar; el rechazo de CLI_004, más de 30 sin tomar) y la devuelta de CLI_007 con su motivo.', '«De un vistazo: quién tiene cada alerta, desde cuándo y qué se está demorando.»'],
    ['Analista', '**Operaciones > Pre-alertas:** la activa de CLI_004 (recarga de celular) → **Avisar a Soporte** → Soporte1. Mostrar el **push** en el celular. Mencionar las otras tres: dos confirmadas y una que no se cumplió.', '«Helios avisa antes de que se cruce el límite, y al celular de la persona correcta.»'],
    ['Analista', 'Alerta grave de CLI_006 (sin asignar): **Derivar** a Soporte2 (otro push) y **¿Qué está pasando?**. En el **Asistente:** **Resumen del turno** y **¿Qué está sin asignar y a quién lo derivo?** (mostrar un botón Derivar sin tocarlo).', '«El agente lee con los permisos de quien pregunta y propone: nunca ejecuta.»'],
    ['Analista', 'Latencia de CLI_003: **Template correo** → plantilla «Escalar a proveedor o gateway» → **Elegir de la lista** → **Confirmar envío** → **Generar ticket**. Después, la de CLI_007 (devuelta): leer el motivo y **Comunicar incidente**.', '«El correo queda armado en segundos y con constancia de si se envió y a quién.»'],
    ['Analista', 'Alerta grave de CLI_006: **Abrir sala de crisis** (IM-4), sumar las de CLI_002 y CLI_005 y tocar **Chat en Teams**; mostrar la tarjeta en el canal. En la sala, al agente: **¿Qué reviso primero?** → confirmar una tarea para Soporte1.', '«Tres clientes caídos con el mismo origen: ya no es una alerta, es un incidente mayor. El agente propone tareas con la guía de diagnóstico; una persona las confirma.»'],
    ['Soporte1', 'En el celular u otra ventana: **Mis alertas/tareas** → **Tomar** el rechazo de CLI_004 → **Resolver** con **¿Qué lo causó?** y **¿Qué se hizo?**. Abrir la sala, **Empezar** la tarea y **Marcar hecha**.', '«Soporte trabaja solo lo suyo y cada paso queda en la conversación de la alerta.»'],
    ['Teams', '`@Gemma IM-4 ¿qué reviso primero?` y después `@Gemma ¿qué tareas tengo?`.', '«El agente también está donde ya trabaja el equipo, con lo que cada persona puede ver.»'],
  ], true));

  T2('Cierre (2 minutos)');
  h.push(...H.tabla(ENC, A, [
    ['Gerente', 'Actualizar: la alerta de CLI_004 pasó a resuelta y **Distribución de fallas** tiene esa causa nueva. En la sala (Analista): **Mitigado** y cerrar con la **causa raíz**.', '«Helios no solo avisa: ordena el trabajo, deja constancia y aprende de cada incidente.»'],
  ], true));

  h.push(...H.nota('regla', 'Si algo no responde', 'Teams, el push o el agente pueden fallar sin que se frene la demo: la sala y las alertas funcionan igual. Para volver al principio: **Preparar demo oficial** y **Cargar escena** (30 segundos).'));

  const doc = H.documento({ titulo: 'Demo oficial de Helios: guion', pie: 'Guion de la demo oficial', hijos: h });
  H.guardar(doc, path.join(process.argv[2] || '.', 'Helios_demo_oficial_guion.docx')).then(() => console.log('ok guion'));
}
