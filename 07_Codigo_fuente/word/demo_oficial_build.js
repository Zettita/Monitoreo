// Arma los dos documentos de la DEMO OFICIAL (Word, estilo Helios):
//   1) Helios_demo_oficial_checklist.docx  lo que hay que dejar listo antes (una página y media)
//   2) Helios_demo_oficial_guion.docx      el guion para presentar: qué tocar y qué decir, escena por escena
// Lo que dicen coincide con demo_oficial_server.js (parche 82).
// Uso: node demo_oficial_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');

// ============================================================ 1 · CHECKLIST
{
  const h = [];
  const V = (t) => h.push(H.vineta(t));
  const T2 = (t) => h.push(H.titulo(2, t));
  h.push(...H.cabecera('Demo oficial de Helios', 'Qué dejar listo antes de presentar', 'Checklist previo'));
  h.push(H.P('La demo oficial se abre en `/?demo=oficial` (como **Analista** o **Administrador**) y tiene su propio botón, **Preparar demo oficial**. La de siempre (`/?demo`) no se toca. **Hacer una pasada completa el día anterior** con el guion (25 a 30 minutos).'));

  T2('Cloudflare');
  V('☐ Worker publicado con el parche 82 (pegado en «Edit code» y Deploy). Sin SQL.');
  V('☐ Scripts 23, 24 y 25 corridos (correo de los usuarios, sala de crisis, memoria del bot de Teams).');
  V('☐ El asistente responde: abrir «Asistente» como Analista y preguntar «Resumen del turno». Tope de 100 preguntas por día entre todos: no gastarlas en ensayos el mismo día.');

  T2('Personas');
  V('☐ Un Administrador, un Gerente, un Analista y dos de Soporte (Soporte1 y Soporte2), todos con el **correo cargado** (el mismo que en Teams) y la **contraseña ya cambiada**.');
  V('☐ Un equipo (por ejemplo «Mesa de ayuda») con Soporte1 y Soporte2.');

  T2('Push en el celular');
  V('☐ Entrar en el celular como **Soporte1**, abrir la campanita y tocar **Activar** (en iPhone, con Helios agregado a la pantalla de inicio).');
  V('☐ Probar derivándole una alerta y ver que el aviso llega con la pantalla bloqueada.');

  T2('Teams');
  V('☐ Administración > Equipos > «Avisos en Teams» dice **Conectado** y «Mandar aviso de prueba» llega al canal. Dejar el canal abierto en otra ventana.');
  V('☐ La app **Gemma** está instalada en un chat de prueba: `@Gemma hola` (elegida de la lista al escribir `@`) saluda una sola vez.');

  T2('Dejar de fábrica');
  V('☐ **CLI_001 · «Aprobaciones, rechazos y errores» en 100 %** (Administración > Umbrales). En la demo se sube a 140 % y ese cambio **queda guardado**: hay que volver a dejarlo en 100 % después de cada ensayo.');
  V('☐ Las 6 plantillas de correo de fábrica (borrar las de ensayo).');
  V('☐ Tickets: salen simulados (HEL-101 / INV-1001) salvo que Jira esté en real (`TICKETS_JIRA = real`): si lo está, «Generar ticket» crea uno de verdad en el proyecto KAN.');

  T2('Justo antes de empezar');
  V('☐ Ventana normal para quien maneja la demo (Analista) y una ventana privada para el resto de los perfiles (Gerente y Administrador).');
  V('☐ Tocar **Preparar demo oficial**: deja alertas, avisos, salas, tickets, comunicados, memoria del bot y métricas en cero (no toca usuarios, equipos, plantillas ni umbrales). El cartel tiene que decir «Próxima: escena 1 de 14».');
  V('☐ Cloudflare > Observability abierto en una pestaña, por si algo no responde.');

  h.push(...H.nota('regla', 'Después de la demo', 'Volver a dejar CLI_001 en 100 %, tocar «Preparar demo oficial» y cerrar sesión en el celular.'));

  T2('Si algo sale distinto');
  h.push(...H.tabla(['Qué pasa', 'Qué hacer'], [3400, 6680], [
    ['El cartel no dice la escena esperada', 'Muestra la **próxima** escena, no la actual. Para estar «en la 5» hay que haber tocado «Siguiente escena» cinco veces.'],
    ['No aparece el panel de la demo', 'Abrir `/?demo=oficial` con un usuario Analista o Administrador (Gerente y Soporte no tienen demo). Si se ve la demo de siempre, falta el `=oficial`.'],
    ['La alerta de CLI_001 no aparece en la escena 12', 'Quedó la banda en 140 % de un ensayo: volver a 100 % y repetir.'],
    ['La alerta de CLI_001 no se cierra al ajustar la banda', 'Falta tocar «Siguiente escena»: el cambio rige desde la próxima ventana.'],
    ['No llega el push', 'Entrar al celular como esa persona y tocar «Activar». Plan B: mostrar la campanita dentro de Helios.'],
    ['Gemma no contesta', 'Mencionarla eligiéndola de la lista y con el mismo correo en Teams y Helios. Plan B: el asistente del panel de Helios hace lo mismo.'],
    ['El asistente dice que no puede responder', 'Se acabó el cupo de la hora o del día. Probar con otra persona o seguir sin él.'],
    ['Quedó algo de un ensayo', 'Tocar «Preparar demo oficial».'],
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
