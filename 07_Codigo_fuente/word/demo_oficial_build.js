// Arma los dos documentos de la DEMO OFICIAL (Word, estilo Helios):
//   1) Helios_demo_oficial_checklist.docx  lo que hay que dejar listo antes (cada punto dice dónde se hace)
//   2) Helios_demo_oficial_guion.docx      el guion para presentar: qué tocar y qué decir, escena por escena
// Lo que dicen coincide con demo_oficial_server.js (parche 82).
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
  h.push(H.P('Cada renglón dice **dónde** hay que hacerlo: **Cloudflare** (el panel donde vive el sistema), **Helios** (nuestra app, con el usuario que se indica), **Teams** (Microsoft Teams) o **el celular**. Hacer una pasada completa con el guion el día anterior (25 a 30 minutos).'));

  T2('1 · Cloudflare (panel de Cloudflare, con tu cuenta)');
  h.push(...H.tabla(ENC, A, [
    ['Cloudflare > Workers y Pages > `worker-alertas-cron` > **Edit code**', '☐ Pegar el código de `01_Worker/worker_alertas_cron.js` (parche 82) y tocar **Deploy**. No lleva SQL.'],
    ['Cloudflare > Almacenamiento y bases de datos > D1 > `helios-monitoring-dev` > **Console**', '☐ Verificar los scripts 23, 24 y 25 con esta línea: `SELECT (SELECT COUNT(*) FROM sqlite_master WHERE name IN (\'incidentes_mayores\', \'teams_bot_memoria\')) AS tablas, (SELECT COUNT(*) FROM usuarios WHERE correo IS NOT NULL) AS con_correo;` Tiene que dar **tablas = 2** (y no dar error). Si da error o 1, falta correr el script de `02_Base_de_datos_D1` que corresponde.'],
    ['Cloudflare > `worker-alertas-cron` > **Settings** > Variables y secretos', '☐ Mirar `TICKETS_JIRA`. Si vale `real`, «Generar ticket» crea un ticket verdadero en Jira (proyecto KAN). Si no existe o es otro valor, el ticket sale simulado (HEL-101). Elegir cuál se quiere mostrar.'],
  ], true));

  T2('2 · Personas (Helios, entrando como Administrador)');
  h.push(...H.tabla(ENC, A, [
    ['Helios > menú de la foto de perfil > **Administración** > pestaña **Usuarios** > botón **Nuevo usuario**', '☐ Tienen que existir: un **Administrador**, un **Gerente**, un **Analista** y dos de **Soporte** (Soporte1 y Soporte2). Cada uno con el campo **Correo** cargado (el mismo que usa en Teams).\n☐ Al crear cada usuario, Helios muestra una **contraseña temporal**: entrar una vez con cada uno (en una ventana privada) y cambiarla, así no queda pendiente en plena demo.'],
    ['Helios > **Administración** > pestaña **Equipos** > botón **Nuevo equipo**', '☐ Un equipo (por ejemplo «Mesa de ayuda») con **Soporte1** y **Soporte2** tildados como integrantes.'],
  ], true));

  T2('3 · Push en el celular');
  h.push(...H.tabla(ENC, A, [
    ['El celular, en el navegador (iPhone: en Safari > Compartir > **Agregar a pantalla de inicio** y abrir desde ese ícono)', '☐ Entrar a Helios como **Soporte1**. Tocar la **campanita** (arriba a la derecha) y después el botón **Activar**; aceptar el permiso de notificaciones del celular.'],
    ['Helios, desde la compu', '☐ Probar: con el Analista, derivarle una alerta a Soporte1 (en la escena 5 del ensayo). Tiene que sonar el celular **con la pantalla bloqueada**.'],
  ], true));

  T2('4 · Teams');
  h.push(...H.tabla(ENC, A, [
    ['Helios > **Administración** > pestaña **Equipos** > recuadro **«Avisos en Teams»** (hay que ser Administrador)', '☐ Tiene que decir **«Conectado: las novedades de las salas de crisis… llegan al canal de Teams»**. Si dice **«Sin conectar»**, falta cargar el secreto `TEAMS_WEBHOOK` en Cloudflare.\n☐ Tocar el botón **«Mandar aviso de prueba»**.'],
    ['Teams, canal **«Plataforma Monitoreo»** (equipo «Plataforma Monitoreo»)', '☐ Tiene que aparecer una tarjeta **«Aviso de prueba»** con el botón «Abrir Helios». ☐ Dejar este canal abierto en otra ventana: en la demo (escenas 9 y 10) ahí se ven llegar las novedades de la sala de crisis.'],
    ['Teams, en un chat de prueba (donde estén vos y alguien más)', '☐ Escribir `@Gemma hola`. Al escribir `@` elegir **Gemma** de la lista que aparece (si se escribe a mano, no le llega). Tiene que contestar con **un solo saludo**. Tu correo en Teams tiene que ser el mismo que el de tu usuario de Helios.'],
  ], true));

  T2('5 · Dejar de fábrica (Helios, como Administrador)');
  h.push(...H.tabla(ENC, A, [
    ['Helios > **Administración** > pestaña **Umbrales**', '☐ Si en **«Excepciones por cliente»** hay una de **CLI_001**, abrirla: en el grupo **«Ancho de la banda del modelo»**, el campo **«Aprobaciones, rechazos y errores»** tiene que estar en **100 %**. En la demo se sube a 140 % y ese cambio **queda guardado**: hay que volver a dejarlo en 100 % después de cada ensayo.'],
    ['Helios > **Administración** > pestaña **Plantillas de correo**', '☐ Tienen que estar las 6 de fábrica (General, Aviso al cliente, Escalar a proveedor o gateway, Caída: escalar a Mesa de ayuda, Aviso a Comercial, Cierre del incidente). Borrar las de ensayo.'],
  ], true));

  T2('6 · Justo antes de empezar');
  h.push(...H.tabla(ENC, A, [
    ['La compu (navegador)', '☐ **Analista** en una ventana normal, **Gerente** en una ventana privada y **Administrador** en otro navegador (o cerrando sesión y entrando cuando toque, en la escena 12). Una ventana privada no admite dos usuarios a la vez.'],
    ['Helios, como **Analista**: dirección `https://worker-alertas-cron.developers-hs-842.workers.dev/?demo=oficial`', '☐ Tocar **Preparar demo oficial**: deja alertas, avisos, salas, tickets, comunicados, memoria del bot y métricas en cero (no toca usuarios, equipos, plantillas ni umbrales). Arriba tiene que decir **«Próxima: escena 1 de 14»**.'],
    ['Cloudflare > `worker-alertas-cron` > **Observability**', '☐ Dejar esta pestaña abierta, por si algo no responde.'],
  ], true));

  h.push(...H.nota('regla', 'Después de la demo', 'En Helios > Administración > Umbrales volver a dejar CLI_001 en 100 %, tocar «Preparar demo oficial» y, en el celular, cerrar sesión.'));

  T2('Si algo sale distinto');
  h.push(...H.tabla(['Qué pasa', 'Qué hacer'], [3400, 6680], [
    ['El cartel no dice la escena esperada', 'Muestra la **próxima** escena, no la actual. Para estar «en la 5» hay que haber tocado «Siguiente escena» cinco veces.'],
    ['No aparece el panel de la demo', 'Abrir la dirección con `/?demo=oficial` con un usuario Analista o Administrador (Gerente y Soporte no tienen demo). Si se ve la demo de siempre, falta el `=oficial`.'],
    ['La alerta de CLI_001 no aparece en la escena 12', 'Quedó la banda en 140 % de un ensayo: Helios > Administración > Umbrales, volver a 100 % y repetir con «Preparar demo oficial».'],
    ['La alerta de CLI_001 no se cierra al ajustar la banda', 'Falta tocar «Siguiente escena»: el cambio rige desde la próxima ventana.'],
    ['No llega el push al celular', 'En el celular, entrar a Helios como esa persona, tocar la campanita y **Activar**. Plan B: mostrar la campanita dentro de Helios.'],
    ['Gemma no contesta en Teams', 'Mencionarla eligiéndola de la lista al escribir `@` y con el mismo correo en Teams y en Helios. Plan B: el asistente del panel de Helios (botón «Asistente», abajo a la derecha) hace lo mismo.'],
    ['El asistente dice que no puede responder', 'Se acabó el cupo de la hora o del día. Probar con otra persona o seguir sin él.'],
    ['Quedó algo de un ensayo', 'En Helios, como Analista, tocar «Preparar demo oficial».'],
  ], true));

  const doc = H.documento({ titulo: 'Demo oficial de Helios: checklist', pie: 'Checklist de la demo oficial', hijos: h });
  H.guardar(doc, path.join(process.argv[2] || '.', 'Helios_demo_oficial_checklist.docx')).then(() => console.log('ok checklist'));
}

// ============================================================ 2 · GUION
{
  const h = [];
  const T2 = (t) => h.push(H.titulo(2, t));
  const A = [900, 5380, 3800];
  const ENC = ['Escena', 'Qué tocar', 'Qué decir'];
  h.push(...H.cabecera('Demo oficial de Helios', 'Guion: qué tocar y qué decir', 'Guion de la demo'));
  h.push(H.P('Duración: 25 a 30 minutos. **Escena N** significa haber tocado «Siguiente escena» N veces (el cartel del tablero muestra la escena que viene). Se maneja desde `/?demo=oficial` como **Analista**; los otros perfiles se muestran en la otra ventana. No hace falta tocar todas las escenas seguidas: pausar en la 3, 5, 8, 10, 12 y 14.'));

  T2('Arranque');
  h.push(...H.tabla(ENC, A, [
    ['—', '**Analista:** abrir `/?demo=oficial` y tocar **Preparar demo oficial**.', '«Los datos son ficticios, pero se comportan como los de un cliente que procesa transacciones: cada 15 minutos Helios compara lo observado contra lo esperado.»'],
  ], true));

  T2('Acto 1 · Gerente: el dashboard');
  h.push(...H.tabla(ENC, A, [
    ['1', '**Gerente:** Estado por cliente en verde y pestaña **Disponibilidad** (100 %).', '«El Gerente ve el negocio en una sola pantalla y en solo lectura.»'],
    ['2', '**Gerente** (actualizar): CLI_001 en rojo, **Incidentes activos ahora** y la lista de alertas con **quién la tiene** (nadie todavía).', '«Sin preguntarle a nadie, el gerente ve si alguien ya está trabajando el incidente.»'],
    ['3', '**Gerente:** la alerta se cerró sola; mostrar el **Histórico**.', '«Si el servicio vuelve, la alerta se cierra sola y queda registrado cuánto duró.»'],
  ], true));

  T2('Acto 3 · Analista: pre-alertas, push y agente');
  h.push(...H.tabla(ENC, A, [
    ['4', '**Operaciones > Pre-alertas:** abrir la de CLI_004 y tocar **Avisar a Soporte** → Soporte1. Mostrar el **push** en el celular.', '«Helios avisa antes de que se cruce el límite, y al celular de la persona correcta.»'],
    ['5', 'Alerta de CLI_004: **Derivar** a Soporte1 (otro push). Tocar **¿Qué está pasando?**.', '«El agente lee con los permisos de quien pregunta y propone: nunca ejecuta.»'],
    ['8', 'Agente: **Resumen del turno** y **¿Qué está sin asignar y a quién lo derivo?** (mostrar un botón Derivar sin tocarlo).', '«Ordena lo urgente y sugiere a quién derivar según la carga de cada persona.»'],
    ['8', 'Alerta de latencia de CLI_003: **Template correo** → plantilla «Escalar a proveedor o gateway» → **Elegir de la lista** → **Confirmar envío** → **Generar ticket**.', '«El correo queda armado en segundos y con constancia de si se envió y a quién.»'],
  ], true));

  T2('Acto 3 · Analista: sala de crisis y Teams');
  h.push(...H.tabla(ENC, A, [
    ['9', 'Alerta grave de CLI_006: **Abrir sala de crisis** (IM-4), sumar las de CLI_002 y CLI_005 y tocar **Chat en Teams**. Mostrar la tarjeta en el canal.', '«Tres clientes caídos a la vez con el mismo origen: ya no es una alerta, es un incidente mayor.»'],
    ['10', 'En la sala: agente **¿Qué reviso primero?** → confirmar una tarea para Soporte1. **Soporte1** (celular): Mis alertas/tareas → Abrir la sala → Empezar → Marcar hecha. Tocar **Comunicar incidente**.', '«El agente propone tareas con la guía de diagnóstico y los casos parecidos; una persona las confirma.»'],
    ['10', '**Teams:** `@Gemma IM-4 ¿qué reviso primero?` y después `@Gemma ¿qué tareas tengo?`.', '«El agente también está donde ya trabaja el equipo, con lo que cada persona puede ver.»'],
  ], true));

  T2('Acto 1 · Gerente, otra vez');
  h.push(...H.tabla(ENC, A, [
    ['11', '**Gerente** (actualizar): barras de Incidentes activos, lista con quién tiene cada alerta y el **detalle** de una (solo lectura). Agente: **¿Qué incidentes están activos y quién los está trabajando?**', '«El silencio de un cliente también es una alerta, y el gerente ve todo el estado sin llamar a nadie.»'],
  ], true));

  T2('Acto 2 · Administrador: lo parametrizable');
  h.push(...H.tabla(ENC, A, [
    ['12', '**Administrador:** Umbrales > CLI_001. Mostrar los campos y **«Aprobaciones, rechazos y errores»: 100 % → 140 %**, guardar. Volver al Analista y tocar **Siguiente escena** (13): la alerta de CLI_001 se cierra sola.', '«Los límites los calcula el modelo; la persona solo decide cuánto margen darle, sin tocar código.»'],
    ['12', '**Administrador:** abrir una plantilla de correo (con el ejemplo en vivo), las reglas de alerta y de derivación, y Usuarios con su correo.', '«Los correos, las derivaciones y los avisos se configuran desde acá, sin pedirle nada a un desarrollador.»'],
  ], true));

  T2('Cierre');
  h.push(...H.tabla(ENC, A, [
    ['14', '**Gerente:** CLI_008 como cliente nuevo y pestaña **Disponibilidad** (semáforo y evolución).', '«Helios muestra cómo viene cada cliente contra su objetivo.»'],
    ['14', '**Analista:** resolver la alerta de CLI_004 con **¿Qué lo causó?** y **¿Qué se hizo?**. Gerente: **Distribución de fallas** con esa causa. En la sala: **Mitigado** y **cerrar con la causa raíz**.', '«Helios no solo avisa: ordena el trabajo, deja constancia y aprende de cada incidente.»'],
  ], true));

  h.push(...H.nota('regla', 'Si algo no responde', 'Teams, el push o el agente pueden fallar sin que se frene la demo: la sala y las alertas funcionan igual. Seguir con lo siguiente y mirar Observability después.'));

  const doc = H.documento({ titulo: 'Demo oficial de Helios: guion', pie: 'Guion de la demo oficial', hijos: h });
  H.guardar(doc, path.join(process.argv[2] || '.', 'Helios_demo_oficial_guion.docx')).then(() => console.log('ok guion'));
}
