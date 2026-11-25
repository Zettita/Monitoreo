// Speech de la demo oficial para el perfil GERENTE (Word, estilo Helios): por sección y por tarjeta o gráfico, con lo que se ve,
// qué decir, la ventaja y las dudas que puede tener el gerente. Los números son los de la escena única (parche 83) y los textos,
// los de la pantalla real del Gerente.
// Uso: node demo_oficial_speech_gerente_build.js <carpeta de salida>
const path = require('path');
const H = require('./helios_docx.js');

const h = [];
const T1 = (t) => h.push(H.titulo(1, t));
const T2 = (t) => h.push(H.titulo(2, t));
const T3 = (t) => h.push(H.titulo(3, t));
const P = (t) => h.push(H.P(t));
const V = (t) => h.push(H.vineta(t));

// Un bloque por tarjeta o gráfico: qué se ve, qué decir (recuadro), ventaja y dudas posibles
function bloque(titulo, { ver, decir, ventaja, dudas }) {
  T3(titulo);
  V('**Qué se ve:** ' + ver);
  h.push(...H.nota('idea', 'Qué decir', decir));
  if (ventaja) V('**Ventaja:** ' + ventaja);
  if (dudas && dudas.length) {
    V('**Si preguntan:**');
    for (const [q, a] of dudas) h.push(H.vineta('   «' + q + '» ' + a));
  }
}

h.push(...H.cabecera('Demo oficial de Helios', 'Speech para el perfil Gerente', 'Guion para la llamada'));
P('Este documento sirve para **hablar en vivo**: por cada sección y por cada tarjeta o gráfico del Gerente dice qué se ve, qué comentar, qué ventaja tiene y qué puede preguntar el gerente del cliente, con una respuesta lista. Los números son los de la escena cargada (una mañana de operación, de 10:00 a 14:00); si se vuelve a cargar, dan lo mismo. Los datos son ficticios.');

T1('1. Antes de empezar');
T2('Cifras de la escena para tener a mano');
h.push(...H.tabla(['Dato', 'Valor en la escena'], [4200, 5880], [
  ['Disponibilidad real (global)', '**86,59 %**, contra un objetivo de **99,90 %**: desvío de **−13,31 puntos**'],
  ['Tiempo sin servicio', '**30 min** (el objetivo permite hasta 0,2 min en las 4 horas medidas)'],
  ['Servicios y clientes que cumplen', 'Servicios: **7 de 12**. Clientes: **3 de 8** (CLI_004, CLI_005 y CLI_008)'],
  ['Clientes que no cumplen', 'CLI_007 (62,50 %), CLI_001 (75 %), CLI_002 (75 %), CLI_003 (81,25 %) y CLI_006 (87,50 %)'],
  ['Alertas abiertas', '**9**: 5 sin asignar, 2 asignadas sin tomar, 1 en curso y 1 devuelta'],
  ['Problemas del período', '**14** problemas, 8 graves, 9 siguen abiertos (los otros 5 están resueltos)'],
  ['Resueltos', '5: dos a mano con causa (una «Falsa alarma» y un «Comportamiento esperado») y tres que se normalizaron solos'],
  ['Pre-alertas', '4 avisos: 2 confirmados, 1 no confirmado y 1 activo en observación (CLI_004, recarga de celular por web). Acierto: **67 %**; anticipación promedio **15 min**'],
  ['Tiempo promedio de resolución', '**40 min** (promedio de los 5 resueltos)'],
], true));

T2('Cómo moverse en la pantalla del Gerente');
V('El Gerente tiene **tres pestañas**: **Disponibilidad** (abre en esta), **Operaciones** e **Histórico**, y un resumen fijo arriba. Todo es de **solo lectura**.');
V('Orden sugerido: resumen de arriba, Disponibilidad, Operaciones, Histórico y, al final, el Asistente. Unos 12 a 15 minutos hablando.');
V('Todo lo que se toca tiene el mismo patrón: **tocar una barra o una fila abre el detalle**. Conviene hacerlo en vivo, porque es lo que muestra que no es una imagen fija.');

T2('Puntos delicados: conviene saberlos antes');
h.push(...H.nota('regla', 'Una alerta resuelta como «Falsa alarma» igual descuenta disponibilidad', 'Hoy la disponibilidad cuenta por la **gravedad** de la alerta mientras estuvo, sin mirar cómo se resolvió. Por eso CLI_001 figura con 75 % aunque su alerta de importe alto se cerró como «Falsa alarma». Si lo notan: es así por diseño, los pesos son configurables, y excluir un tipo de alerta puntual no existe todavía (se puede evaluar).'));
h.push(...H.nota('regla', 'El objetivo de 99,9 % es muy exigente para 4 horas', 'Un objetivo de 99,9 % permite 43 minutos por mes, pero en 4 horas medidas permite apenas 0,2 minutos: cualquier ventana grave lo pone en rojo. Es la razón del «NO CUMPLE». Se explica solo y se puede cambiar el objetivo por cliente o servicio.'));
h.push(...H.nota('regla', '«Comparar con otro período» no tiene datos en la escena', 'La escena es de un solo día, así que al comparar contra un período anterior dice «No hay datos medidos». Mostrar la ventana solo para explicar qué hace (ver la sección 2.8) o saltearla.'));
h.push(...H.nota('regla', 'Las «Últimas 24 horas» muestran solo 4 horas con datos', 'El resto de la fila queda gris («Sin datos»). Decirlo antes de que lo pregunten: es porque la escena arranca a las 10:00.'));

// ------------------------------------------------------------ Resumen de arriba
T1('2. Resumen fijo de arriba');
bloque('2.0 Titular, «Urgente» y pre-alerta', {
  ver: 'Un titular («**7 clientes con problemas**»), debajo el problema más urgente (CLI_007, «Recarga app sin datos desde 12:30 (hace 1 h 36 m)», con su estado: «Devuelta al analista») y la pre-alerta activa (CLI_004, recarga web, «alerta en ~15 m»).',
  decir: '«Esta es la primera pantalla del día. En una línea el gerente sabe cuántos clientes están con problemas y cuál es el más urgente, con el tiempo que lleva y en qué estado está: no está asignado, lo tiene alguien o lo devolvieron. Y abajo, un aviso anticipado: algo que todavía no es alerta pero viene empeorando.»',
  ventaja: 'El gerente se entera del problema más importante y de si alguien lo está atendiendo sin llamar ni preguntar.',
  dudas: [
    ['¿Y cómo decide cuál es el más urgente?', 'Muestra el cliente con el problema más serio según su gravedad y la criticidad del servicio (prioridad P1 a P4).'],
    ['¿Qué quiere decir «devuelta al analista»?', 'Que Soporte la tomó, vio que no era de su lado y la devolvió con un motivo. Se ve el motivo en la lista de alertas abiertas.'],
  ],
});
bloque('2.1 Las tres cifras de la derecha', {
  ver: '**7** servicios afectados ahora · **1** aviso anticipado activo · **40 min** tarda en resolverse un problema, en promedio (7 días).',
  decir: '«Tres números para leer en cinco segundos: cuántos servicios están afectados ahora, cuántos avisos anticipados hay y cuánto tardamos en resolver, en promedio, los problemas de la última semana.»',
  ventaja: 'Medir el tiempo de resolución en forma automática: no hay planillas ni carga manual.',
  dudas: [
    ['¿Qué cuenta como «servicio afectado»?', 'Cada servicio de un cliente con una alerta abierta que hay que trabajar. Hoy son 7 (de CLI_001 a CLI_007). CLI_008 es un cliente nuevo, sin historia, y no cuenta.'],
    ['¿Los 40 minutos incluyen lo que se arregló solo?', 'Sí. Es el promedio de duración de todos los problemas resueltos en los últimos 7 días, sean resueltos a mano o normalizados solos. Hoy son 5: 30, 30, 30, 48 y 62 minutos.'],
    ['¿Es el MTTR del contrato?', 'Es un indicador operativo, medido desde que empieza el problema hasta que se cierra. Lo contractual se define con ustedes.'],
  ],
});

// ------------------------------------------------------------ Disponibilidad
T1('3. Pestaña Disponibilidad');
P('Es la pestaña que abre por defecto y la que más le interesa a un gerente: **¿cumplimos con el objetivo?**');

bloque('3.1 Selector de período (Desde / Hasta)', {
  ver: 'Dos campos de fecha. Por defecto, el mes en curso (01/10/2026 al 27/10/2026).',
  decir: '«Todo lo de esta pestaña se calcula para el período que elijan: un día, una semana o un mes. Si cambian las fechas, se recalcula todo, incluidos los gráficos. Hoy está el mes en curso, pero como la escena empezó a las 10:00, solo se mide lo que hay desde ahí: dice “período en curso”.»',
  ventaja: 'El mismo tablero sirve para la guardia de hoy y para el cierre del mes.',
  dudas: [
    ['¿Hasta cuánto puedo ir para atrás?', 'Hasta 366 días por consulta y hasta 400 días atrás.'],
  ],
});
bloque('3.2 Tarjeta «Disponibilidad real»', {
  ver: '**86,59 %**, la etiqueta roja «NO CUMPLE», «Objetivo 99,90 %» y «Desvío vs. objetivo: −13,31 puntos».',
  decir: '«Acá el gerente ve de un pantallazo la disponibilidad de toda la operación: 86,59 %. Al lado, el objetivo: 99,9 %, y de cuánto es el desvío: 13,31 puntos por debajo. Si cumple, la etiqueta es verde; si no, roja. Si viene cerca, amarilla: “en riesgo”. No tiene que interpretar nada.»',
  ventaja: 'Un solo número, con su objetivo y su desvío, en lugar de una planilla que alguien tiene que armar a fin de mes.',
  dudas: [
    ['¿Cómo se calcula ese 86,59 %?', 'Cada servicio se mide en ventanas de 15 minutos. Una ventana con una alerta **Grave** cuenta como no disponible (100 %), una **Importante** cuenta la mitad (50 %) y una **Leve** no descuenta. La disponibilidad de un cliente es el promedio de sus servicios, y la global, el promedio de todos, pesando más los servicios críticos (Alta 3, Media 2, Baja 1).'],
    ['¿Quién define el 99,9 %?', 'Es un valor de fábrica. El Administrador lo cambia por cliente o por servicio, con decimales. 99,9 % equivale a unos 43 minutos de falla por mes.'],
    ['¿Por qué dice «NO CUMPLE» si el día recién empieza?', 'Porque se compara lo medido con lo que permite el objetivo en ese mismo período. En 4 horas, 99,9 % permite 0,2 minutos. Con el mes completo, 43. Por eso, para un análisis serio conviene mirar el mes.'],
    ['¿Esto es el SLA que tenemos con el cliente?', 'Es un indicador operativo calculado con las alertas del monitoreo. El pacto contractual (qué cuenta, con qué peso) se ajusta con ustedes: los pesos y los objetivos son configurables.'],
    ['¿Cuándo pasa a amarillo?', 'Cuando no llega al objetivo pero el tiempo sin servicio es hasta 1,5 veces lo que permite. Ese 1,5 también se cambia.'],
  ],
});
bloque('3.3 Tarjeta «Tiempo sin servicio»', {
  ver: '**30 min**, «El objetivo permite hasta 0,2 min» y «Período en curso».',
  decir: '«Lo mismo, pero en minutos: el equivalente a haber estado 30 minutos sin servicio, contra 0,2 minutos que permitía el objetivo en este período. A veces es más claro hablar en minutos que en porcentaje.»',
  ventaja: 'Traduce el porcentaje a algo que cualquiera entiende.',
  dudas: [
    ['¿Son 30 minutos con todo caído?', 'Es un equivalente: el promedio ponderado de los minutos sin servicio de todos los servicios. Por cliente se ve el detalle.'],
  ],
});
bloque('3.4 Tarjeta «Servicios que cumplen el objetivo»', {
  ver: '**7 de 12** servicios y, abajo, «Clientes que cumplen: 3 de 8».',
  decir: '«De los 12 servicios que monitoreamos, 7 cumplen; y mirado por cliente, cumplen 3 de 8. Acá aparece algo importante: un cliente puede tener un servicio en rojo y otro en verde, y el cliente en conjunto no cumple.»',
  ventaja: 'Distingue lo que pasa con el cliente de lo que pasa con cada uno de sus servicios.',
  dudas: [
    ['CLI_004 y CLI_005 cumplen, pero tienen alertas abiertas. ¿Cómo es?', 'Sus alertas son **leves** y las leves no descuentan disponibilidad. Siguen abiertas y se trabajan, pero no afectan el servicio.'],
    ['¿Y CLI_008?', 'Es un cliente nuevo y todavía no tiene historia para compararse. Figura como cumple porque no tuvo ventanas con problema.'],
  ],
});
bloque('3.5 Gráfico «Cumplimiento del objetivo» (barras)', {
  ver: 'Tres barras: **3** cumplen el objetivo (verde), **0** en riesgo y **5** no cumplen (rojo). Las barras se pueden tocar.',
  decir: '«Acá agrupamos a los clientes: los que cumplen, los que están en riesgo y los que no cumplen. Si toco la barra roja, todo lo de abajo se recalcula solo con esos cinco clientes: pasan a 78,57 % de disponibilidad, 51 minutos sin servicio, y baja la lista de cuáles son y cuánto estuvo cada uno sin servicio.»',
  ventaja: 'Priorización: el gerente va directo a los clientes que no cumplen, en vez de recorrer todos.',
  dudas: [
    ['¿Cómo vuelvo a ver todos?', 'Con «Ver todos», arriba de la lista, o tocando de nuevo la barra.'],
  ],
});
bloque('3.6 Gráfico «Disponibilidad general» (línea de evolución)', {
  ver: 'Una línea que arranca en 100 % a las 10:15 y baja hasta 86,59 % a las 14:06, con una línea punteada en el objetivo (99,90 %). Debajo: «Está por debajo del objetivo desde 10:30 (86,59 %)».',
  decir: '«Esta línea cuenta la historia del período: cada punto es la disponibilidad acumulada hasta ese momento, cada 15 minutos. Se ve cuándo se cruzó el objetivo, a las 10:30, y cómo fue bajando con cada incidente. El último punto es exactamente el número de la tarjeta. Si paso el mouse por cualquier momento, me dice el valor.»',
  ventaja: 'Muestra cuándo y cómo se perdió la disponibilidad, no solo cuánto.',
  dudas: [
    ['¿Por qué la línea baja de a escalones?', 'Cada vez que una ventana de 15 minutos con alerta grave se suma, baja un poco más el acumulado.'],
    ['¿Para un mes qué intervalo usa?', 'Se adapta: cada 15 minutos para un día, cada hora para una semana y cada día para un mes.'],
  ],
});
bloque('3.7 Lista por cliente y detalle por servicio (tocar un cliente)', {
  ver: 'Una fila por cliente con su disponibilidad, la etiqueta, una barra y un texto («Estuvo 90 min sin servicio; el objetivo permite hasta 0,2 min»). Al tocar uno, se abre su evolución y una tabla por servicio: criticidad, disponibilidad, objetivo, ventanas con problema y minutos sin servicio. Ejemplo, CLI_003: Recarga transporte **62,50 %** (6 graves, 90 min) y Recarga **100 %** (sin problemas).',
  decir: '«Si quiero saber por qué un cliente no cumple, lo abro. Acá CLI_003: tiene dos servicios y solo uno falla, Recarga de transporte, con seis ventanas graves. La recarga de celular está en 100 %. Con esto el gerente puede llegar a su equipo y decirle exactamente de qué servicio hablar.»',
  ventaja: 'De un número global a la causa concreta en dos toques.',
  dudas: [
    ['¿Qué significa la criticidad?', 'Qué tan importante es el servicio para el negocio (Alta, Media o Baja). Pesa más en el promedio y sube la prioridad de las alertas.'],
    ['¿La criticidad quién la define?', 'El Administrador, por cliente o por servicio.'],
  ],
});
bloque('3.8 Botón «Comparar con otro período»', {
  ver: 'Una ventana que pone dos períodos lado a lado: las tres tarjetas de cada uno, el cumplimiento, las dos líneas de evolución y una tabla por cliente con quién mejoró y quién empeoró. Atajos: «Período anterior», «Mismo período del mes anterior» y «Mismo período del año anterior». **En esta escena dice «No hay datos medidos» porque solo hay un día.**',
  decir: '«Con el histórico real, acá comparamos un mes con el anterior, o con el mismo mes del año pasado, y vemos qué clientes mejoraron y cuáles empeoraron. Hoy no se ve porque la demo tiene un solo día de datos.»',
  ventaja: 'Respuesta directa a «¿estamos mejor o peor que antes?».',
  dudas: [
    ['¿Se puede comparar contra cualquier fecha?', 'Sí: dos rangos de fechas libres, hasta 366 días cada uno.'],
  ],
});
bloque('3.9 «Distribución de fallas»', {
  ver: 'Encabezado: «**14** problemas · 8 graves · 9 siguen abiertos». Tres listas con barras, ordenadas de mayor a menor: **por cliente** (CLI_006 y CLI_001, 21 % cada uno), **por tipo de falla** («Suben los errores técnicos», 21 %; «Suben los rechazos», 14 %; «Otros (5)») y **por causa** («Comportamiento esperado» y «Falsa alarma», 50 % cada una). Abajo: «Sin causa: 9 siguen abiertos · 3 se normalizaron solos».',
  decir: '«Acá respondemos tres preguntas: ¿dónde se concentran los problemas?, ¿de qué tipo son? y, lo más interesante, ¿qué los causó? La causa la elige la persona que resuelve, con un clic, y con el tiempo se convierte en la base para actuar sobre lo que más se repite: si la mayoría fuera falla del proveedor, la conversación es con el proveedor.»',
  ventaja: 'Convierte cada incidente en información: con el tiempo se ve qué cliente, qué tipo de falla y qué causa se repiten.',
  dudas: [
    ['¿Quién carga la causa?', 'La persona que resuelve la alerta: elige una causa de una lista (por ejemplo «Falla del cliente», «Falla nuestra», «Proveedor o gateway», «Comportamiento esperado» o «Falsa alarma») y qué se hizo. La lista la edita el Administrador.'],
    ['¿Por qué «por causa» tiene solo dos?', 'Porque son los dos únicos problemas resueltos a mano. Los 9 abiertos todavía no tienen causa, y los 3 que se normalizaron solos tampoco.'],
    ['¿Cómo sé cuántas son falsas alarmas?', 'Esa barra lo dice. Y si hay muchas, se ajusta el margen del modelo por cliente, desde Umbrales.'],
  ],
});

// ------------------------------------------------------------ Operaciones
T1('4. Pestaña Operaciones');
P('Es la vista de **lo que está pasando ahora**.');

bloque('4.1 «Estado por cliente»', {
  ver: 'Una tarjeta por cliente (8), con un color por la peor situación: **Leve**, **Grave** o **Sin historia**. Dentro, cada servicio y canal con un texto corto («Bien», «Más rechazos», «Lentitud», «Menos aprobaciones, más errores, sin aprobaciones», «Sin datos»). Una leyenda de colores abajo: Bien, Viene empeorando, Problema leve, Importante, Grave y Sin datos o sin historia.',
  decir: '«Esta es la foto de la operación: una tarjeta por cliente, con sus servicios y canales. Verde, bien; amarillo, un problema leve; rojo, grave. Fíjense en CLI_006: en rojo, “sin aprobaciones”, el servicio de pago por API no aprueba nada; y la transferencia por la app está bien. En CLI_004 hay un punto azul: es la pre-alerta, el servicio todavía anda pero viene empeorando.»',
  ventaja: 'En 10 segundos el gerente sabe qué cliente, qué servicio y qué canal están con problemas, con palabras y no con códigos.',
  dudas: [
    ['¿Qué es «sin historia»?', 'Un cliente nuevo (CLI_008) al que todavía no se le puede comparar con un comportamiento habitual. Se avisa, pero no se le asigna gravedad.'],
    ['¿Los colores qué miden?', 'La gravedad de la alerta abierta: Leve, Importante o Grave, según cuánto se aparta lo observado de lo esperado.'],
  ],
});
bloque('4.2 «Últimas 24 horas»', {
  ver: 'Una fila por cliente, con cuadraditos de 15 minutos de color (todo bien, aviso anticipado, leve, importante, grave, sin datos). A la derecha de cada fila: «Con problemas ahora» y «bien el 62,5 % desde las 10:00». CLI_008 dice «Cliente nuevo, con datos desde las 13:15».',
  decir: '«Acá vemos el día de cada cliente, ventana por ventana. Cada cuadradito son 15 minutos. Se ve cuándo empezó cada problema y cuánto duró: CLI_007 pasó de verde a rojo a las 12:30 y no volvió. Esto también sirve para ver si un cliente tiene problemas siempre a la misma hora.»',
  ventaja: 'La historia del día de cada cliente en una sola imagen, con horario.',
  dudas: [
    ['¿Por qué solo se ven las últimas horas?', 'Porque la demo arranca a las 10:00. En la operación real se llena con las 24 horas.'],
    ['CLI_004 dice «bien el 43,7 %» pero en Disponibilidad cumple con 100 %. ¿Cómo es?', 'Esta fila marca cualquier desvío, incluso los leves y los avisos anticipados. La Disponibilidad solo descuenta lo que afecta el servicio: graves al 100 %, importantes al 50 % y leves nada.'],
  ],
});
bloque('4.3 «Alertas por estado» (dona)', {
  ver: 'Una dona con el total (**9 alertas**) y su leyenda: **5** sin asignar, **2** asignadas sin tomar, **1** en curso y **1** devuelta. Se puede tocar un estado.',
  decir: '«Esto responde la pregunta que se hace todo gerente cuando hay un incidente: ¿alguien lo está atendiendo? De nueve alertas, cinco no tienen dueño, dos están asignadas pero nadie las tomó, una la está trabajando una persona y una la devolvieron. Antes esta información la tenía el analista en su cabeza o en un chat; ahora la ve cualquiera con permiso.»',
  ventaja: 'Visibilidad de quién tiene cada incidente, sin preguntar. Es lo que motivó pedir esta vista para el gerente.',
  dudas: [
    ['¿Qué diferencia hay entre «asignada sin tomar» y «en curso»?', 'Asignada sin tomar: el analista la derivó a una persona o equipo, pero todavía nadie dijo «la estoy trabajando». En curso: alguien la tomó.'],
    ['¿Puedo asignarla yo desde acá?', 'No. El gerente solo mira; derivar y tomar son del analista y de Soporte.'],
  ],
});
bloque('4.4 «Problemas por cliente» y «Problemas por tipo de falla»', {
  ver: 'Dos gráficos de barras. **Por cliente:** CLI_006 con 3 graves, CLI_003 y CLI_007 con 1 grave cada uno, y 4 clientes con 1 leve. **Por tipo de falla:** «Suben los errores técnicos» (1 grave y 2 leves), «Se aprueban menos operaciones», «El servicio responde lento», «No se aprueba ninguna operación», «Dejaron de llegar datos» y «Suben los rechazos». Cada barra se puede tocar para filtrar la lista de abajo.',
  decir: '«Los mismos nueve problemas, vistos de dos maneras: por cliente y por tipo de falla. Rojo es grave y amarillo, leve. CLI_006 concentra tres graves a la vez: es el patrón de una falla de infraestructura común, como el gateway de pagos. Si toco una barra, la lista de abajo se filtra a eso.»',
  ventaja: 'Se detectan patrones (muchos clientes con el mismo tipo de falla) que apuntan a un origen común.',
  dudas: [
    ['¿Qué es «dejaron de llegar datos»?', 'Que el cliente dejó de enviar la información de su operación y ya pasó el tiempo de gracia. El silencio también es una alerta.'],
  ],
});
bloque('4.5 Lista de alertas abiertas', {
  ver: 'Una fila por problema: prioridad (P2, P4), gravedad, nombre del problema, cliente y servicio, inicio, cantidad de ventanas, valor observado contra esperado, estado (sin asignar, asignada sin tomar, en curso, devuelta) y asignación (quién la tiene o por qué la devolvieron). Botones **Detalle**, **Historial** y **¿Qué está pasando?**.',
  decir: '«Esta es la lista de trabajo. Fíjense en la primera: CLI_007 dejó de enviar datos, está devuelta, y se lee el motivo que dio Soporte: el problema está del lado del cliente. En la tercera, CLI_006: no se aprueba ninguna operación, desde las 13:00, y sigue sin asignar. Es exactamente lo que el gerente necesita ver, y lo ve sin pedírselo a nadie. Y debajo, lo observado contra lo esperado: cero operaciones aprobadas cuando se esperaban 360.»',
  ventaja: 'Cada fila trae el dato objetivo (observado contra esperado), la prioridad y el responsable. No hay que interpretar.',
  dudas: [
    ['¿Qué significa P2 o P4?', 'La prioridad de atención, de P1 (más urgente) a P4. Sale de la gravedad y de la criticidad del servicio.'],
    ['¿Qué significa «ventanas: 6»?', 'La cantidad de ventanas de 15 minutos seguidas con el problema. Seis son 90 minutos.'],
    ['¿Y «¿Qué está pasando?»', 'Le pregunta al asistente de inteligencia artificial por esa alerta. Responde solo con lo que el gerente puede ver y no ejecuta nada.'],
  ],
});
bloque('4.6 Detalle de la alerta (botón «Detalle»)', {
  ver: 'Una página con la etiqueta «**Solo lectura**». A la izquierda, la **conversación** (por ejemplo: «Ana Lista derivó la alerta a Soporte 2», «Soporte 2 la tomó», «Soporte 2 comentó: Le escribí al proveedor…»). A la derecha, los **datos de la alerta** (cliente, servicio, desde cuándo, cuánto lleva, prioridad, quién la tiene y quién la derivó), la **evidencia** adjunta y las **ventanas con problema** (observado, esperado y límite).',
  decir: '«Si quiero profundizar, abro el detalle: tengo toda la conversación del equipo, en orden: quién la derivó, quién la tomó, qué hicieron. Y los datos: cuánto lleva, qué se observó contra lo esperado. Es de solo lectura: el gerente audita, no interfiere.»',
  ventaja: 'Trazabilidad completa de cada incidente: queda quién hizo qué y cuándo.',
  dudas: [
    ['¿Esto queda registrado?', 'Sí. Cada paso queda en el historial de la alerta y en la auditoría del sistema.'],
    ['¿Se pueden adjuntar capturas o logs?', 'Sí, el equipo adjunta evidencia a la alerta (capturas, logs, PDF) y el gerente la puede ver.'],
  ],
});
bloque('4.7 «Pre-alertas»', {
  ver: 'Una tarjeta azul con la pre-alerta activa: «Superaría el umbral en aprox. 15 minutos», «Tendencia al alza en la tasa de rechazo», CLI_004 recarga de celular por web, «Valor actual: 5,4 % · Esperado: 2,8 % · Umbral de alerta: más de 5,8 %» y una barra con el 84 % del camino. A la derecha, «**Efectividad de los avisos · últimas 48 h**»: **67 %** de acierto, 4 avisos (2 confirmados, 1 no confirmado y 1 en observación), anticipación promedio de 15 minutos, y la lista de cada aviso con su resultado.',
  decir: '«Esto es lo que nos diferencia de un monitoreo común: no esperamos a que falle. Acá el servicio todavía está dentro de lo normal, pero la tasa de rechazo viene subiendo y, al ritmo actual, cruzaría el límite en unos 15 minutos. El equipo puede actuar antes de que el cliente final se entere. Y a la derecha medimos si acertamos: 67 %, y avisamos en promedio 15 minutos antes.»',
  ventaja: 'Anticipación medible: no se promete, se mide cuántas pre-alertas se confirmaron.',
  dudas: [
    ['¿Es inteligencia artificial?', 'Es estadística por tendencia: compara contra el comportamiento esperado de cada cliente y proyecta si el ritmo actual cruza el límite. No es una caja negra y se puede explicar cada aviso.'],
    ['¿Anticipa todo?', 'No. No anticipa problemas súbitos, como una caída de golpe, ni tendencias con muy poco volumen (de madrugada).'],
    ['¿Qué es «no confirmado»?', 'Que el servicio empeoró pero no llegó a cruzar el límite: se avisó y no pasó nada. Cuenta contra el porcentaje de acierto.'],
  ],
});

// ------------------------------------------------------------ Histórico
T1('5. Pestaña Histórico');
bloque('5.1 «Histórico de Alertas» (filtros y problemas resueltos)', {
  ver: 'Filtros **Desde / Hasta**, **Cliente**, **Servicio**, **Gravedad** y **Problema**, y un desplegable «Ver los 5 problemas resueltos del 26/10 al 27/10» con una tabla: gravedad, problema, cliente, servicio, inicio, duración y «Ver detalle».',
  decir: '«Acá está todo lo que ya se resolvió. Se puede filtrar por cliente, por servicio, por gravedad o por tipo de problema, y por fechas. Y de cada uno se puede abrir el detalle y ver cómo se resolvió, con la causa y lo que se hizo. Es la memoria de la operación.»',
  ventaja: 'Base para reuniones de seguimiento y revisiones posteriores: qué pasó, cuánto duró y cómo se resolvió.',
  dudas: [
    ['¿Cuánto tiempo guarda?', 'El histórico del tablero trae los últimos 30 días de problemas y se filtra por fechas; la base conserva más.'],
  ],
});
bloque('5.2 «Tiempo de resolución por tipo»', {
  ver: 'Barras horizontales con el tiempo promedio de resolución de cada tipo de problema: «Menos importe» 1 h 2 min, «Más importe» 48 min, «Datos inconsistentes» 30 min, «Datos tardíos» 30 min y «Menos tráfico» 30 min.',
  decir: '«Acá vemos cuánto tardamos en resolver cada tipo de problema. Es la base para mejorar: ver cuáles se resuelven rápido y cuáles se demoran, y hablar con el equipo de los que más tardan.»',
  ventaja: 'Mide la mejora del equipo con datos y por tipo de problema.',
  dudas: [
    ['¿Se puede ver por analista o por equipo?', 'Hoy el cuadro es por tipo de problema. El detalle de quién resolvió cada uno queda en cada alerta.'],
  ],
});
bloque('5.3 «Clientes con más problemas»', {
  ver: 'Una tabla con **Cliente**, **Problemas**, **Graves** y **Horas afectadas**. Un punto rojo marca a los que tienen problemas en este momento. CLI_006 es el primero: 3 problemas, 3 graves, 3,3 horas afectadas.',
  decir: '«Este es el ranking para la reunión comercial o de seguimiento: qué clientes tuvieron más problemas, cuántos fueron graves y cuántas horas estuvieron afectados. El punto rojo dice quiénes tienen algo abierto en este momento.»',
  ventaja: 'Un ranking listo para conversar con cada cliente o con el proveedor, sin armar nada.',
  dudas: [
    ['¿Qué son las «horas afectadas»?', 'La suma del tiempo de las ventanas con problema de ese cliente en el período.'],
    ['¿Se filtra por fecha?', 'Sí, usa el mismo Desde / Hasta y los mismos filtros del histórico.'],
  ],
});

// ------------------------------------------------------------ Asistente
T1('6. Asistente de inteligencia artificial');
bloque('6.1 Botón «Asistente» (abajo a la derecha)', {
  ver: 'Un chat con preguntas sugeridas para el Gerente: «¿Qué incidentes están activos y quién los está trabajando?», «¿Cómo está la operación ahora?», «¿Qué cliente tuvo más problemas este mes?» y «¿Hay algo de afuera que pueda afectar hoy o mañana?». Quedan 20 preguntas por hora.',
  decir: '«Para quien no quiere recorrer pantallas, le preguntan en lenguaje común. Por ejemplo: “¿qué incidentes están activos y quién los está trabajando?” y responde con los datos de la pantalla. Y la última es especial: cruza la operación con el calendario (feriados, cobro de sueldos, Cyber Monday), el estado de los proveedores y las noticias de Argentina, para avisar si hay algo de afuera que pueda afectar.»',
  ventaja: 'Responde solo con lo que el perfil puede ver y **nunca ejecuta nada**: para el gerente es consulta, sin riesgo.',
  dudas: [
    ['¿Puede equivocarse?', 'Como cualquier asistente, puede. Por eso solo lee, cita los datos de la pantalla y no hace cambios por su cuenta. Lo que propone lo confirma una persona.'],
    ['¿Los datos salen de la empresa?', 'Corre dentro de la misma plataforma en la nube donde está Helios, con los permisos del usuario. Qué proveedor de modelo se usa se define con ustedes y con su área de seguridad.'],
    ['¿Y si pregunto de otra cosa?', 'Solo responde sobre la operación y las alertas de Helios.'],
  ],
});
P('**Recomendación:** probar las cuatro preguntas el día anterior con el usuario Gerente, porque dependen del servicio de IA y no se pueden garantizar en vivo. Si no responde, mostrar el panel y explicar que en la demo está fuera de servicio.');

// ------------------------------------------------------------ Preguntas generales
T1('7. Preguntas generales que puede hacer un gerente');
h.push(...H.tabla(['Pregunta', 'Respuesta corta'], [3600, 6480], [
  ['¿Qué tan en vivo está esto?', 'Los datos llegan en ventanas de 15 minutos. El tablero se actualiza solo cada 2 minutos mientras está abierto, y se detecta un problema unos 20 minutos después de que empieza.'],
  ['¿Puedo hacer algo desde acá?', 'El gerente mira y audita: no deriva ni resuelve (eso es del analista y de Soporte). Sí puede consultar al asistente y recibir comunicados de incidentes en el celular si está en una lista de difusión.'],
  ['¿Y quién ve qué?', 'Cada perfil ve solo lo que usa. Gerente: el negocio, en solo lectura. Analista: todo el tablero y deriva. Soporte: solo lo que tiene asignado. Administrador: la configuración.'],
  ['¿Funciona en el celular?', 'Sí, la pantalla se adapta y se puede instalar como aplicación. Los avisos llegan al celular aunque Helios esté cerrado.'],
  ['¿Cómo se define qué es una alerta?', 'Helios compara lo observado contra lo esperado de cada cliente para ese día, esa franja horaria y esa parte del mes. Los límites los calcula el modelo; la persona decide cuánto margen darle, por cliente.'],
  ['¿Se puede exportar a Excel?', 'No está en esta versión. Hoy el análisis es el propio tablero.'],
  ['¿Los datos son los nuestros?', 'En esta demo son ficticios. Conectar los datos reales de ustedes es el paso siguiente del proyecto.'],
  ['¿Podemos cambiar los objetivos, la criticidad y los pesos?', 'Sí: el objetivo de disponibilidad, la criticidad de cada servicio y cuánto pesa cada gravedad se configuran sin tocar código.'],
], true));

h.push(...H.nota('decision', 'Cierre sugerido', '«En resumen, el gerente puede ver de un pantallazo si cumplimos el objetivo, quién tiene cada incidente, qué viene empeorando antes de que falle, y qué cliente o qué causa se repite, sin armar una planilla y sin preguntarle a nadie.»'));

const doc = H.documento({ titulo: 'Demo oficial de Helios: speech del Gerente', pie: 'Speech del perfil Gerente', hijos: h });
H.guardar(doc, path.join(process.argv[2] || '.', 'Helios_demo_oficial_speech_gerente.docx')).then(() => console.log('ok speech gerente'));
