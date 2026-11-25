// Demo oficial, perfil GERENTE (Word, estilo Helios). Arma DOS documentos con el mismo contenido repartido:
//   1) Helios_demo_oficial_speech_gerente.docx                       solo el «qué decir» de cada sección y tarjeta o gráfico (para leer en vivo)
//   2) Helios_demo_oficial_preguntas_y_respuestas_gerente.docx       lo que se ve, lo que conviene destacar y las dudas del gerente con su respuesta (para consultar)
// Los números son los de la escena única (parche 83) y los textos, los de la pantalla real del Gerente.
// Uso: node demo_oficial_speech_gerente_build.js <carpeta de salida>
const path = require('path');
const H = require('./helios_docx.js');

const h = [], q = [];   // h: speech · q: preguntas y respuestas
const T1 = (t) => { h.push(H.titulo(1, t)); q.push(H.titulo(1, t)); };
const T2 = (t) => q.push(H.titulo(2, t));
const V = (t) => q.push(H.vineta(t));

// Un bloque por tarjeta o gráfico: qué se ve, qué decir (recuadro), ventaja y dudas posibles
function bloque(titulo, { ver, decir, ventaja, dudas }) {
  h.push(H.titulo(3, titulo), H.P(decir));
  q.push(H.titulo(3, titulo));
  q.push(H.vineta('**Qué se ve:** ' + ver));
  if (ventaja) q.push(H.vineta('**Para destacar:** ' + ventaja));
  for (const [pregunta, respuesta] of (dudas || [])) q.push(H.vineta('**«' + pregunta + '»** ' + respuesta));
}

h.push(...H.cabecera('Demo oficial de Helios', 'Speech para el perfil Gerente', 'Guion para la llamada'));
h.push(H.P('Para leer en voz alta, de corrido. Cada título es una tarjeta o un gráfico del Gerente; debajo, lo que se dice. Orden: resumen de arriba, Disponibilidad, Operaciones, Histórico y Asistente, unos 12 a 15 minutos. Las preguntas que pueda hacer el gerente y sus respuestas están en el documento de apoyo «Preguntas y respuestas del Gerente».'));
q.push(...H.cabecera('Demo oficial de Helios', 'Preguntas y respuestas del Gerente', 'Material de apoyo'));
q.push(H.P('Para **consultar** si hace falta, no para leer. Primero, las cifras de la escena y los puntos delicados. Después, para cada tarjeta o gráfico (en el mismo orden que el speech): qué se ve, qué conviene destacar y las preguntas que puede hacer el gerente con una respuesta lista. Al final, las preguntas generales. Los datos son los de la escena cargada (una mañana de operación, de 10:00 a 14:00) y son ficticios.'));

q.push(H.titulo(1, 'Antes de empezar'));
T2('Cifras de la escena para tener a mano');
q.push(...H.tabla(['Dato', 'Valor en la escena'], [4200, 5880], [
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
q.push(...H.nota('regla', 'Una alerta resuelta como «Falsa alarma» igual descuenta disponibilidad', 'Hoy la disponibilidad cuenta por la **gravedad** de la alerta mientras estuvo, sin mirar cómo se resolvió. Por eso CLI_001 figura con 75 % aunque su alerta de importe alto se cerró como «Falsa alarma». Si lo notan: es así por diseño, los pesos son configurables, y excluir un tipo de alerta puntual no existe todavía (se puede evaluar).'));
q.push(...H.nota('regla', 'El objetivo de 99,9 % es muy exigente para 4 horas', 'Un objetivo de 99,9 % permite 43 minutos por mes, pero en 4 horas medidas permite apenas 0,2 minutos: cualquier ventana grave lo pone en rojo. Es la razón del «NO CUMPLE». Se explica solo y se puede cambiar el objetivo por cliente o servicio.'));
q.push(...H.nota('regla', '«Comparar con otro período» no tiene datos en la escena', 'La escena es de un solo día, así que al comparar contra un período anterior dice «No hay datos medidos». Mostrar la ventana solo para explicar qué hace (ver 2.8 «Botón Comparar con otro período») o saltearla.'));
q.push(...H.nota('regla', 'Las «Últimas 24 horas» muestran solo 4 horas con datos', 'El resto de la fila queda gris («Sin datos»). Decirlo antes de que lo pregunten: es porque la escena arranca a las 10:00.'));

// ------------------------------------------------------------ Resumen de arriba
T1('1. Resumen fijo de arriba');
h.push(H.P('Empecemos por lo primero que se ve al entrar: el resumen de arriba, que queda siempre a la vista, sin importar en qué pestaña estemos.'));
bloque('1.1 Titular, «Urgente» y pre-alerta', {
  ver: 'Un titular («**7 clientes con problemas**»), debajo el problema más urgente (CLI_007, «Recarga app sin datos desde 12:30 (hace 1 h 36 m)», con su estado: «Devuelta al analista») y la pre-alerta activa (CLI_004, recarga web, «alerta en ~15 m»).',
  decir: 'Lo primero que ve el gerente cuando entra es esto. Arriba, en una sola frase, cuántos clientes están con problemas: hoy son siete. Justo abajo aparece el problema más urgente, con el cliente, qué le pasa, desde qué hora y hace cuánto, y también en qué estado está: si nadie lo tomó, si lo está trabajando alguien o, como acá, que Soporte lo devolvió. Y más abajo hay un aviso anticipado, que es algo que todavía no es una alerta pero viene empeorando. O sea que en diez segundos ya sabe cómo viene el día.',
  ventaja: 'El gerente se entera del problema más importante y de si alguien lo está atendiendo sin llamar ni preguntar.',
  dudas: [
    ['¿Y cómo decide cuál es el más urgente?', 'Muestra el cliente con el problema más serio según su gravedad y la criticidad del servicio (prioridad P1 a P4).'],
    ['¿Qué quiere decir «devuelta al analista»?', 'Que Soporte la tomó, vio que no era de su lado y la devolvió con un motivo. Se ve el motivo en la lista de alertas abiertas.'],
  ],
});
bloque('1.2 Las tres cifras de la derecha', {
  ver: '**7** servicios afectados ahora · **1** aviso anticipado activo · **40 min** tarda en resolverse un problema, en promedio (7 días).',
  decir: 'A la derecha hay tres números para leer de un vistazo. El primero, cuántos servicios están afectados ahora mismo. El segundo, cuántos avisos anticipados hay activos. Y el tercero, cuánto tardamos en resolver un problema, en promedio, durante la última semana. Lo bueno es que ese tiempo se mide solo: nadie tiene que cargar nada en una planilla.',
  ventaja: 'Medir el tiempo de resolución en forma automática: no hay planillas ni carga manual.',
  dudas: [
    ['¿Qué cuenta como «servicio afectado»?', 'Cada servicio de un cliente con una alerta abierta que hay que trabajar. Hoy son 7 (de CLI_001 a CLI_007). CLI_008 es un cliente nuevo, sin historia, y no cuenta.'],
    ['¿Los 40 minutos incluyen lo que se arregló solo?', 'Sí. Es el promedio de duración de todos los problemas resueltos en los últimos 7 días, sean resueltos a mano o normalizados solos. Hoy son 5: 30, 30, 30, 48 y 62 minutos.'],
    ['¿Es el MTTR del contrato?', 'Es un indicador operativo, medido desde que empieza el problema hasta que se cierra. Lo contractual se define con ustedes.'],
  ],
});

// ------------------------------------------------------------ Disponibilidad
T1('2. Pestaña Disponibilidad');
h.push(H.P('Ahora vamos a la pestaña de Disponibilidad. Es la que se abre por defecto y la que más le interesa a un gerente, porque responde la pregunta de fondo: estamos cumpliendo con el objetivo o no.'));

bloque('2.1 Selector de período (Desde / Hasta)', {
  ver: 'Dos campos de fecha. Por defecto, el mes en curso (01/10/2026 al 27/10/2026).',
  decir: 'Todo lo que vemos en esta pestaña se calcula para el período que ustedes elijan: puede ser un día, una semana o un mes entero. Cambian las fechas y se recalcula todo, incluso los gráficos. Ahora está puesto el mes en curso, pero como la demo arranca hoy a las 10:00, solo se mide lo que hay desde ese momento. Por eso dice período en curso.',
  ventaja: 'El mismo tablero sirve para la guardia de hoy y para el cierre del mes.',
  dudas: [
    ['¿Hasta cuánto puedo ir para atrás?', 'Hasta 366 días por consulta y hasta 400 días atrás.'],
  ],
});
bloque('2.2 Tarjeta «Disponibilidad real»', {
  ver: '**86,59 %**, la etiqueta roja «NO CUMPLE», «Objetivo 99,90 %» y «Desvío vs. objetivo: −13,31 puntos».',
  decir: 'Esta es la tarjeta que más mira un gerente. Nos dice, de un pantallazo, cuál es la disponibilidad de toda la operación: hoy, 86,59 por ciento. Al lado está el objetivo, que es 99,9, y justo abajo, de cuánto es el desvío: estamos 13,31 puntos por debajo. Si se cumple, la etiqueta es verde; si viene cerca, amarilla, que significa en riesgo; y si no se cumple, roja, como acá. No hay que interpretar nada: el sistema ya hizo la cuenta y nos dice si estamos bien o mal contra lo que nos propusimos.',
  ventaja: 'Un solo número, con su objetivo y su desvío, en lugar de una planilla que alguien tiene que armar a fin de mes.',
  dudas: [
    ['¿Cómo se calcula ese 86,59 %?', 'Cada servicio se mide en ventanas de 15 minutos. Una ventana con una alerta **Grave** cuenta como no disponible (100 %), una **Importante** cuenta la mitad (50 %) y una **Leve** no descuenta. La disponibilidad de un cliente es el promedio de sus servicios, y la global, el promedio de todos, pesando más los servicios críticos (Alta 3, Media 2, Baja 1).'],
    ['¿Quién define el 99,9 %?', 'Es un valor de fábrica. El Administrador lo cambia por cliente o por servicio, con decimales. 99,9 % equivale a unos 43 minutos de falla por mes.'],
    ['¿Por qué dice «NO CUMPLE» si el día recién empieza?', 'Porque se compara lo medido con lo que permite el objetivo en ese mismo período. En 4 horas, 99,9 % permite 0,2 minutos. Con el mes completo, 43. Por eso, para un análisis serio conviene mirar el mes.'],
    ['¿Esto es el SLA que tenemos con el cliente?', 'Es un indicador operativo calculado con las alertas del monitoreo. El pacto contractual (qué cuenta, con qué peso) se ajusta con ustedes: los pesos y los objetivos son configurables.'],
    ['¿Cuándo pasa a amarillo?', 'Cuando no llega al objetivo pero el tiempo sin servicio es hasta 1,5 veces lo que permite. Ese 1,5 también se cambia.'],
  ],
});
bloque('2.3 Tarjeta «Tiempo sin servicio»', {
  ver: '**30 min**, «El objetivo permite hasta 0,2 min» y «Período en curso».',
  decir: 'Esto es lo mismo, pero dicho en minutos, que a veces se entiende mejor que un porcentaje. En este período es como si hubiéramos estado unos 30 minutos sin servicio, cuando el objetivo permitía apenas dos décimas de minuto. Es la misma historia, contada de otra forma.',
  ventaja: 'Traduce el porcentaje a algo que cualquiera entiende.',
  dudas: [
    ['¿Son 30 minutos con todo caído?', 'Es un equivalente: el promedio ponderado de los minutos sin servicio de todos los servicios. Por cliente se ve el detalle.'],
  ],
});
bloque('2.4 Tarjeta «Servicios que cumplen el objetivo»', {
  ver: '**7 de 12** servicios y, abajo, «Clientes que cumplen: 3 de 8».',
  decir: 'Acá vemos cuántos servicios cumplen el objetivo: siete de doce. Y abajo, mirado por cliente, cumplen tres de ocho. Esto es importante porque un cliente puede tener un servicio en verde y otro en rojo, y el cliente en conjunto no cumple. Así el gerente distingue enseguida si el problema es de todo el cliente o de un servicio puntual.',
  ventaja: 'Distingue lo que pasa con el cliente de lo que pasa con cada uno de sus servicios.',
  dudas: [
    ['CLI_004 y CLI_005 cumplen, pero tienen alertas abiertas. ¿Cómo es?', 'Sus alertas son **leves** y las leves no descuentan disponibilidad. Siguen abiertas y se trabajan, pero no afectan el servicio.'],
    ['¿Y CLI_008?', 'Es un cliente nuevo y todavía no tiene historia para compararse. Figura como cumple porque no tuvo ventanas con problema.'],
  ],
});
bloque('2.5 Gráfico «Cumplimiento del objetivo» (barras)', {
  ver: 'Tres barras: **3** cumplen el objetivo (verde), **0** en riesgo y **5** no cumplen (rojo). Las barras se pueden tocar.',
  decir: 'Acá agrupamos a los clientes en tres: los que cumplen, los que están en riesgo y los que no cumplen. Y esto se puede tocar. Si toco la barra roja, todo lo de abajo se recalcula solo con esos cinco clientes: la disponibilidad baja a 78,57, el tiempo sin servicio sube a unos 51 minutos, y aparece la lista de quiénes son y cuánto estuvo cada uno sin servicio. Sirve para ir directo a lo que importa, sin recorrer cliente por cliente.',
  ventaja: 'Priorización: el gerente va directo a los clientes que no cumplen, en vez de recorrer todos.',
  dudas: [
    ['¿Cómo vuelvo a ver todos?', 'Con «Ver todos», arriba de la lista, o tocando de nuevo la barra.'],
  ],
});
bloque('2.6 Gráfico «Disponibilidad general» (línea de evolución)', {
  ver: 'Una línea que arranca en 100 % a las 10:15 y baja hasta 86,59 % a las 14:06, con una línea punteada en el objetivo (99,90 %). Debajo: «Está por debajo del objetivo desde 10:30 (86,59 %)».',
  decir: 'Esta línea es la historia del período. Cada punto es la disponibilidad acumulada hasta ese momento, medida cada 15 minutos. Arranca en 100 y se ve clarito cuándo cruzó el objetivo, a las 10:30, y cómo fue bajando con cada incidente. El último punto es justo el número que vimos en la tarjeta. Y si paso el mouse por cualquier momento, me muestra el valor exacto. O sea que no solo vemos cuánto perdimos, sino también cuándo.',
  ventaja: 'Muestra cuándo y cómo se perdió la disponibilidad, no solo cuánto.',
  dudas: [
    ['¿Por qué la línea baja de a escalones?', 'Cada vez que una ventana de 15 minutos con alerta grave se suma, baja un poco más el acumulado.'],
    ['¿Para un mes qué intervalo usa?', 'Se adapta: cada 15 minutos para un día, cada hora para una semana y cada día para un mes.'],
  ],
});
bloque('2.7 Lista por cliente y detalle por servicio (tocar un cliente)', {
  ver: 'Una fila por cliente con su disponibilidad, la etiqueta, una barra y un texto («Estuvo 90 min sin servicio; el objetivo permite hasta 0,2 min»). Al tocar uno, se abre su evolución y una tabla por servicio: criticidad, disponibilidad, objetivo, ventanas con problema y minutos sin servicio. Ejemplo, CLI_003: Recarga transporte **62,50 %** (6 graves, 90 min) y Recarga **100 %** (sin problemas).',
  decir: 'Si el gerente quiere saber por qué un cliente no cumple, lo abre. Tomemos CLI_003: tiene dos servicios y solo uno falla, que es la recarga de transporte, con seis ventanas graves, o sea unos 90 minutos. La recarga de celular está al 100. Con esto el gerente puede llamar a su equipo y decirle exactamente de qué servicio tiene que hablar, sin andar buscando.',
  ventaja: 'De un número global a la causa concreta en dos toques.',
  dudas: [
    ['¿Qué significa la criticidad?', 'Qué tan importante es el servicio para el negocio (Alta, Media o Baja). Pesa más en el promedio y sube la prioridad de las alertas.'],
    ['¿La criticidad quién la define?', 'El Administrador, por cliente o por servicio.'],
  ],
});
bloque('2.8 Botón «Comparar con otro período»', {
  ver: 'Una ventana que pone dos períodos lado a lado: las tres tarjetas de cada uno, el cumplimiento, las dos líneas de evolución y una tabla por cliente con quién mejoró y quién empeoró. Atajos: «Período anterior», «Mismo período del mes anterior» y «Mismo período del año anterior». **En esta escena dice «No hay datos medidos» porque solo hay un día.**',
  decir: 'Este botón sirve para comparar dos períodos lado a lado: un mes contra el anterior, o contra el mismo mes del año pasado, por ejemplo. Muestra las dos disponibilidades, las dos líneas de evolución y una tabla que dice qué clientes mejoraron y cuáles empeoraron. Hoy no lo vamos a ver con datos porque la demo tiene un solo día, pero con el histórico real responde la pregunta de siempre: estamos mejor o peor que antes.',
  ventaja: 'Respuesta directa a «¿estamos mejor o peor que antes?».',
  dudas: [
    ['¿Se puede comparar contra cualquier fecha?', 'Sí: dos rangos de fechas libres, hasta 366 días cada uno.'],
  ],
});
bloque('2.9 «Distribución de fallas»', {
  ver: 'Encabezado: «**14** problemas · 8 graves · 9 siguen abiertos». Tres listas con barras, ordenadas de mayor a menor: **por cliente** (CLI_006 y CLI_001, 21 % cada uno), **por tipo de falla** («Suben los errores técnicos», 21 %; «Suben los rechazos», 14 %; «Otros (5)») y **por causa** («Comportamiento esperado» y «Falsa alarma», 50 % cada una). Abajo: «Sin causa: 9 siguen abiertos · 3 se normalizaron solos».',
  decir: 'Esta sección responde tres preguntas. Primero, dónde se concentran los problemas: por cliente. Segundo, de qué tipo son: acá vemos que lo que más se repite son los errores técnicos. Y tercero, la más interesante: qué los causó. Esa causa la elige la persona que resuelve, con un clic, de una lista. Con el tiempo esto se vuelve muy valioso, porque si la mayoría de los problemas fueran falla del proveedor, por ejemplo, la conversación que hay que tener es con el proveedor. Ahora hay solo dos causas porque solo dos problemas se resolvieron a mano; el resto sigue abierto o se normalizó solo.',
  ventaja: 'Convierte cada incidente en información: con el tiempo se ve qué cliente, qué tipo de falla y qué causa se repiten.',
  dudas: [
    ['¿Quién carga la causa?', 'La persona que resuelve la alerta: elige una causa de una lista (por ejemplo «Falla del cliente», «Falla nuestra», «Proveedor o gateway», «Comportamiento esperado» o «Falsa alarma») y qué se hizo. La lista la edita el Administrador.'],
    ['¿Por qué «por causa» tiene solo dos?', 'Porque son los dos únicos problemas resueltos a mano. Los 9 abiertos todavía no tienen causa, y los 3 que se normalizaron solos tampoco.'],
    ['¿Cómo sé cuántas son falsas alarmas?', 'Esa barra lo dice. Y si hay muchas, se ajusta el margen del modelo por cliente, desde Umbrales.'],
  ],
});

// ------------------------------------------------------------ Operaciones
T1('3. Pestaña Operaciones');
h.push(H.P('Pasemos a Operaciones. Esta es la vista de lo que está pasando ahora mismo.'));

bloque('3.1 «Estado por cliente»', {
  ver: 'Una tarjeta por cliente (8), con un color por la peor situación: **Leve**, **Grave** o **Sin historia**. Dentro, cada servicio y canal con un texto corto («Bien», «Más rechazos», «Lentitud», «Menos aprobaciones, más errores, sin aprobaciones», «Sin datos»). Una leyenda de colores abajo: Bien, Viene empeorando, Problema leve, Importante, Grave y Sin datos o sin historia.',
  decir: 'Esta es la foto de la operación en este momento: una tarjeta por cliente, con sus servicios y canales. Verde es que está bien, amarillo un problema leve y rojo uno grave. Miren CLI_006: está en rojo y dice que no se aprueba ninguna operación en el pago de servicios por API, mientras que las transferencias por la app están bien. Y en CLI_004 hay un puntito azul: es una pre-alerta, o sea, el servicio todavía anda pero viene empeorando. Todo con palabras y no con códigos, así que se entiende a primera vista.',
  ventaja: 'En 10 segundos el gerente sabe qué cliente, qué servicio y qué canal están con problemas, con palabras y no con códigos.',
  dudas: [
    ['¿Qué es «sin historia»?', 'Un cliente nuevo (CLI_008) al que todavía no se le puede comparar con un comportamiento habitual. Se avisa, pero no se le asigna gravedad.'],
    ['¿Los colores qué miden?', 'La gravedad de la alerta abierta: Leve, Importante o Grave, según cuánto se aparta lo observado de lo esperado.'],
  ],
});
bloque('3.2 «Últimas 24 horas»', {
  ver: 'Una fila por cliente, con cuadraditos de 15 minutos de color (todo bien, aviso anticipado, leve, importante, grave, sin datos). A la derecha de cada fila: «Con problemas ahora» y «bien el 62,5 % desde las 10:00». CLI_008 dice «Cliente nuevo, con datos desde las 13:15».',
  decir: 'Acá vemos el día de cada cliente, ventana por ventana: cada cuadradito son 15 minutos. Se ve cuándo empezó cada problema y cuánto duró. Por ejemplo, CLI_007 estaba bien y a las 12:30 pasó a rojo y ya no volvió. Esto también sirve para detectar si a un cliente le pasan cosas siempre a la misma hora. Una aclaración: acá solo se ven las últimas horas porque la demo arrancó a las 10:00; en la operación real se llena con las 24 horas completas.',
  ventaja: 'La historia del día de cada cliente en una sola imagen, con horario.',
  dudas: [
    ['¿Por qué solo se ven las últimas horas?', 'Porque la demo arranca a las 10:00. En la operación real se llena con las 24 horas.'],
    ['CLI_004 dice «bien el 43,7 %» pero en Disponibilidad cumple con 100 %. ¿Cómo es?', 'Esta fila marca cualquier desvío, incluso los leves y los avisos anticipados. La Disponibilidad solo descuenta lo que afecta el servicio: graves al 100 %, importantes al 50 % y leves nada.'],
  ],
});
bloque('3.3 «Alertas por estado» (dona)', {
  ver: 'Una dona con el total (**9 alertas**) y su leyenda: **5** sin asignar, **2** asignadas sin tomar, **1** en curso y **1** devuelta. Se puede tocar un estado.',
  decir: 'Esta dona responde la pregunta que se hace cualquier gerente cuando hay un incidente: ¿alguien lo está atendiendo? De las nueve alertas abiertas, cinco todavía no tienen dueño, dos están asignadas pero nadie las tomó, una la está trabajando una persona y una la devolvieron. Antes esto lo sabía el analista de memoria o por un chat; ahora lo ve cualquiera que tenga permiso, sin tener que preguntar.',
  ventaja: 'Visibilidad de quién tiene cada incidente, sin preguntar. Es lo que motivó pedir esta vista para el gerente.',
  dudas: [
    ['¿Qué diferencia hay entre «asignada sin tomar» y «en curso»?', 'Asignada sin tomar: el analista la derivó a una persona o equipo, pero todavía nadie dijo «la estoy trabajando». En curso: alguien la tomó.'],
    ['¿Puedo asignarla yo desde acá?', 'No. El gerente solo mira; derivar y tomar son del analista y de Soporte.'],
  ],
});
bloque('3.4 «Problemas por cliente» y «Problemas por tipo de falla»', {
  ver: 'Dos gráficos de barras. **Por cliente:** CLI_006 con 3 graves, CLI_003 y CLI_007 con 1 grave cada uno, y 4 clientes con 1 leve. **Por tipo de falla:** «Suben los errores técnicos» (1 grave y 2 leves), «Se aprueban menos operaciones», «El servicio responde lento», «No se aprueba ninguna operación», «Dejaron de llegar datos» y «Suben los rechazos». Cada barra se puede tocar para filtrar la lista de abajo.',
  decir: 'Estos dos gráficos muestran los mismos problemas pero vistos de dos maneras: por cliente y por tipo de falla. El rojo es grave y el amarillo, leve. Fíjense que CLI_006 tiene tres graves a la vez: eso suele ser señal de una falla de infraestructura común, como un gateway de pagos, y no de tres problemas distintos. Y si toco cualquier barra, la lista de abajo se filtra sola.',
  ventaja: 'Se detectan patrones (muchos clientes con el mismo tipo de falla) que apuntan a un origen común.',
  dudas: [
    ['¿Qué es «dejaron de llegar datos»?', 'Que el cliente dejó de enviar la información de su operación y ya pasó el tiempo de gracia. El silencio también es una alerta.'],
  ],
});
bloque('3.5 Lista de alertas abiertas', {
  ver: 'Una fila por problema: prioridad (P2, P4), gravedad, nombre del problema, cliente y servicio, inicio, cantidad de ventanas, valor observado contra esperado, estado (sin asignar, asignada sin tomar, en curso, devuelta) y asignación (quién la tiene o por qué la devolvieron). Botones **Detalle**, **Historial** y **¿Qué está pasando?**.',
  decir: 'Esta es la lista de trabajo. Miren la primera: CLI_007 dejó de enviar datos, está devuelta, y se lee el motivo que puso Soporte: el problema está del lado del cliente. Ahora miren las de CLI_006: no se aprueba ninguna operación, desde las 13:00, y siguen sin asignar. Eso es justo lo que un gerente necesita ver, y lo ve sin pedirle nada a nadie. Cada fila trae además lo observado contra lo esperado: acá, cero operaciones aprobadas cuando se esperaban 360. Y de ahí se puede abrir el detalle o preguntarle al asistente qué está pasando.',
  ventaja: 'Cada fila trae el dato objetivo (observado contra esperado), la prioridad y el responsable. No hay que interpretar.',
  dudas: [
    ['¿Qué significa P2 o P4?', 'La prioridad de atención, de P1 (más urgente) a P4. Sale de la gravedad y de la criticidad del servicio.'],
    ['¿Qué significa «ventanas: 6»?', 'La cantidad de ventanas de 15 minutos seguidas con el problema. Seis son 90 minutos.'],
    ['¿Y «¿Qué está pasando?»', 'Le pregunta al asistente de inteligencia artificial por esa alerta. Responde solo con lo que el gerente puede ver y no ejecuta nada.'],
  ],
});
bloque('3.6 Detalle de la alerta (botón «Detalle»)', {
  ver: 'Una página con la etiqueta «**Solo lectura**». A la izquierda, la **conversación** (por ejemplo: «Ana Lista derivó la alerta a Soporte 2», «Soporte 2 la tomó», «Soporte 2 comentó: Le escribí al proveedor…»). A la derecha, los **datos de la alerta** (cliente, servicio, desde cuándo, cuánto lleva, prioridad, quién la tiene y quién la derivó), la **evidencia** adjunta y las **ventanas con problema** (observado, esperado y límite).',
  decir: 'Si el gerente quiere profundizar, abre el detalle. A la izquierda tiene toda la conversación del equipo, en orden: quién la derivó, quién la tomó, qué comentó. A la derecha, los datos: cuánto lleva, qué se observó contra lo esperado, quién la tiene. Fíjense que dice solo lectura: el gerente audita, pero no interfiere en el trabajo del equipo. Y todo queda registrado: quién hizo qué y cuándo.',
  ventaja: 'Trazabilidad completa de cada incidente: queda quién hizo qué y cuándo.',
  dudas: [
    ['¿Esto queda registrado?', 'Sí. Cada paso queda en el historial de la alerta y en la auditoría del sistema.'],
    ['¿Se pueden adjuntar capturas o logs?', 'Sí, el equipo adjunta evidencia a la alerta (capturas, logs, PDF) y el gerente la puede ver.'],
  ],
});
bloque('3.7 «Pre-alertas»', {
  ver: 'Una tarjeta azul con la pre-alerta activa: «Superaría el umbral en aprox. 15 minutos», «Tendencia al alza en la tasa de rechazo», CLI_004 recarga de celular por web, «Valor actual: 5,4 % · Esperado: 2,8 % · Umbral de alerta: más de 5,8 %» y una barra con el 84 % del camino. A la derecha, «**Efectividad de los avisos · últimas 48 h**»: **67 %** de acierto, 4 avisos (2 confirmados, 1 no confirmado y 1 en observación), anticipación promedio de 15 minutos, y la lista de cada aviso con su resultado.',
  decir: 'Acá está lo que nos diferencia de un monitoreo común: no esperamos a que algo falle. En esta tarjeta el servicio todavía está dentro de lo normal, pero la tasa de rechazo viene subiendo y, al ritmo actual, cruzaría el límite en unos 15 minutos. Eso le da tiempo al equipo para actuar antes de que se entere el cliente final. Y a la derecha medimos si acertamos: 67 por ciento de acierto, y en promedio avisamos 15 minutos antes. O sea, no lo prometemos, lo medimos.',
  ventaja: 'Anticipación medible: no se promete, se mide cuántas pre-alertas se confirmaron.',
  dudas: [
    ['¿Es inteligencia artificial?', 'Es estadística por tendencia: compara contra el comportamiento esperado de cada cliente y proyecta si el ritmo actual cruza el límite. No es una caja negra y se puede explicar cada aviso.'],
    ['¿Anticipa todo?', 'No. No anticipa problemas súbitos, como una caída de golpe, ni tendencias con muy poco volumen (de madrugada).'],
    ['¿Qué es «no confirmado»?', 'Que el servicio empeoró pero no llegó a cruzar el límite: se avisó y no pasó nada. Cuenta contra el porcentaje de acierto.'],
  ],
});

// ------------------------------------------------------------ Histórico
T1('4. Pestaña Histórico');
h.push(H.P('Ahora el Histórico, que es la memoria de todo lo que ya pasó.'));
bloque('4.1 «Histórico de Alertas» (filtros y problemas resueltos)', {
  ver: 'Filtros **Desde / Hasta**, **Cliente**, **Servicio**, **Gravedad** y **Problema**, y un desplegable «Ver los 5 problemas resueltos del 26/10 al 27/10» con una tabla: gravedad, problema, cliente, servicio, inicio, duración y «Ver detalle».',
  decir: 'Acá está todo lo que ya se resolvió: es la memoria de la operación. Se puede filtrar por cliente, por servicio, por gravedad, por tipo de problema o por fechas. Y de cada uno se puede abrir el detalle para ver cómo se resolvió, con la causa y lo que se hizo. Sirve mucho para las reuniones de seguimiento: qué pasó, cuánto duró y cómo se resolvió.',
  ventaja: 'Base para reuniones de seguimiento y revisiones posteriores: qué pasó, cuánto duró y cómo se resolvió.',
  dudas: [
    ['¿Cuánto tiempo guarda?', 'El histórico del tablero trae los últimos 30 días de problemas y se filtra por fechas; la base conserva más.'],
  ],
});
bloque('4.2 «Tiempo de resolución por tipo»', {
  ver: 'Barras horizontales con el tiempo promedio de resolución de cada tipo de problema: «Menos importe» 1 h 2 min, «Más importe» 48 min, «Datos inconsistentes» 30 min, «Datos tardíos» 30 min y «Menos tráfico» 30 min.',
  decir: 'Este gráfico nos dice cuánto tardamos en resolver cada tipo de problema. Por ejemplo, lo del importe nos llevó más de una hora, y los datos tardíos, media hora. Es la base para mejorar: ver cuáles se resuelven rápido, cuáles se demoran y conversarlo con el equipo.',
  ventaja: 'Mide la mejora del equipo con datos y por tipo de problema.',
  dudas: [
    ['¿Se puede ver por analista o por equipo?', 'Hoy el cuadro es por tipo de problema. El detalle de quién resolvió cada uno queda en cada alerta.'],
  ],
});
bloque('4.3 «Clientes con más problemas»', {
  ver: 'Una tabla con **Cliente**, **Problemas**, **Graves** y **Horas afectadas**. Un punto rojo marca a los que tienen problemas en este momento. CLI_006 es el primero: 3 problemas, 3 graves, 3,3 horas afectadas.',
  decir: 'Y esta tabla es el ranking para la reunión de seguimiento: qué clientes tuvieron más problemas, cuántos fueron graves y cuántas horas estuvieron afectados. Arriba está CLI_006, con tres problemas, los tres graves. El puntito rojo marca quiénes tienen algo abierto en este momento. Es material que ya viene listo para conversar con el cliente o con el proveedor, sin armar nada.',
  ventaja: 'Un ranking listo para conversar con cada cliente o con el proveedor, sin armar nada.',
  dudas: [
    ['¿Qué son las «horas afectadas»?', 'La suma del tiempo de las ventanas con problema de ese cliente en el período.'],
    ['¿Se filtra por fecha?', 'Sí, usa el mismo Desde / Hasta y los mismos filtros del histórico.'],
  ],
});

// ------------------------------------------------------------ Asistente
T1('5. Asistente de inteligencia artificial');
h.push(H.P('Para terminar, una ayuda más para quien no quiere recorrer pantallas.'));
bloque('5.1 Botón «Asistente» (abajo a la derecha)', {
  ver: 'Un chat con preguntas sugeridas para el Gerente: «¿Qué incidentes están activos y quién los está trabajando?», «¿Cómo está la operación ahora?», «¿Qué cliente tuvo más problemas este mes?» y «¿Hay algo de afuera que pueda afectar hoy o mañana?». Quedan 20 preguntas por hora.',
  decir: 'Y para quien no quiere ir recorriendo pantallas, está el asistente. Se le pregunta en lenguaje normal, por ejemplo qué incidentes están activos y quién los está trabajando, y responde con los datos que vimos. La última pregunta es especial: cruza la operación con el calendario, los feriados, el cobro de sueldos, el estado de los proveedores y las noticias, para avisar si hay algo de afuera que pueda afectar. Y algo importante para el gerente: solo responde con lo que su perfil puede ver y nunca ejecuta nada, así que es pura consulta, sin riesgo.',
  ventaja: 'Responde solo con lo que el perfil puede ver y **nunca ejecuta nada**: para el gerente es consulta, sin riesgo.',
  dudas: [
    ['¿Puede equivocarse?', 'Como cualquier asistente, puede. Por eso solo lee, cita los datos de la pantalla y no hace cambios por su cuenta. Lo que propone lo confirma una persona.'],
    ['¿Los datos salen de la empresa?', 'Corre dentro de la misma plataforma en la nube donde está Helios, con los permisos del usuario. Qué proveedor de modelo se usa se define con ustedes y con su área de seguridad.'],
    ['¿Y si pregunto de otra cosa?', 'Solo responde sobre la operación y las alertas de Helios.'],
  ],
});
q.push(H.P('**Recomendación:** probar las cuatro preguntas el día anterior con el usuario Gerente, porque dependen del servicio de IA y no se pueden garantizar en vivo. Si no responde, mostrar el panel y explicar que en la demo está fuera de servicio.'));

// ------------------------------------------------------------ Preguntas generales
q.push(H.titulo(1, 'Preguntas generales que puede hacer un gerente'));
q.push(...H.tabla(['Pregunta', 'Respuesta corta'], [3600, 6480], [
  ['¿Qué tan en vivo está esto?', 'Los datos llegan en ventanas de 15 minutos. El tablero se actualiza solo cada 2 minutos mientras está abierto, y se detecta un problema unos 20 minutos después de que empieza.'],
  ['¿Puedo hacer algo desde acá?', 'El gerente mira y audita: no deriva ni resuelve (eso es del analista y de Soporte). Sí puede consultar al asistente y recibir comunicados de incidentes en el celular si está en una lista de difusión.'],
  ['¿Y quién ve qué?', 'Cada perfil ve solo lo que usa. Gerente: el negocio, en solo lectura. Analista: todo el tablero y deriva. Soporte: solo lo que tiene asignado. Administrador: la configuración.'],
  ['¿Funciona en el celular?', 'Sí, la pantalla se adapta y se puede instalar como aplicación. Los avisos llegan al celular aunque Helios esté cerrado.'],
  ['¿Cómo se define qué es una alerta?', 'Helios compara lo observado contra lo esperado de cada cliente para ese día, esa franja horaria y esa parte del mes. Los límites los calcula el modelo; la persona decide cuánto margen darle, por cliente.'],
  ['¿Se puede exportar a Excel?', 'No está en esta versión. Hoy el análisis es el propio tablero.'],
  ['¿Los datos son los nuestros?', 'En esta demo son ficticios. Conectar los datos reales de ustedes es el paso siguiente del proyecto.'],
  ['¿Podemos cambiar los objetivos, la criticidad y los pesos?', 'Sí: el objetivo de disponibilidad, la criticidad de cada servicio y cuánto pesa cada gravedad se configuran sin tocar código.'],
], true));

h.push(...H.nota('decision', 'Cierre sugerido', 'Para cerrar: el gerente puede ver de un vistazo si estamos cumpliendo el objetivo, quién tiene cada incidente, qué viene empeorando antes de que falle y qué cliente o qué causa se repite. Todo sin armar una planilla y sin tener que preguntarle a nadie.'));

const salida = process.argv[2] || '.';
const doc = H.documento({ titulo: 'Demo oficial de Helios: speech del Gerente', pie: 'Speech del perfil Gerente', hijos: h });
H.guardar(doc, path.join(salida, 'Helios_demo_oficial_speech_gerente.docx')).then(() => console.log('ok speech gerente'));
const docQ = H.documento({ titulo: 'Demo oficial de Helios: preguntas y respuestas del Gerente', pie: 'Preguntas y respuestas del perfil Gerente', hijos: q });
H.guardar(docQ, path.join(salida, 'Helios_demo_oficial_preguntas_y_respuestas_gerente.docx')).then(() => console.log('ok preguntas y respuestas'));
