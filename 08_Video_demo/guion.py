# Texto de la voz en off y de los subtítulos (es lo mismo). Una clave por frase.
# Se escribe como se dice: "CLI 004" y "P uno a P cuatro" para que la voz lo lea bien.
TEXTOS = {
    'intro1': 'Helios es una plataforma de monitoreo inteligente para servicios que procesan transacciones: bancos, billeteras y procesadores de pago. Detecta los problemas antes de que lo vean los clientes y ordena el trabajo para resolverlos.',
    'intro2': 'Les mostramos un incidente de punta a punta, desde el aviso anticipado hasta la resolución, la comunicación, la mirada de gerencia y el asistente de inteligencia artificial.',

    'login': 'Empezamos como analista de monitoreo. Cada persona entra con su usuario y ve solo lo que corresponde a su perfil.',
    'datos': 'Cada 15 minutos Helios compara lo que pasa en cada cliente y servicio con lo que se espera para ese momento. En esta demo los datos van llegando escena por escena.',
    'pre': 'Y acá aparece la primera ventaja: la pre-alerta. Los rechazos del cliente 4 vienen subiendo. Todavía no pasaron el límite, pero Helios calcula que lo cruzarían en unos 15 minutos. Avisa hasta media hora antes de que el cliente lo note.',
    'avisar': 'El analista puede avisar a Soporte para que se prepare. Es un aviso, no una alerta: no llena el historial.',
    'confirma': '15 minutos después el problema se confirma. Helios mide sus propios aciertos: acá todas las pre-alertas se confirmaron, con 15 minutos de anticipación.',

    'abiertas': 'Con varios problemas a la vez, Helios los ordena por prioridad, de P1 a P4, según gravedad e importancia del servicio. De un vistazo se ve qué está sin asignar y qué está en curso.',
    'derivar': 'El analista deriva cada alerta a una persona o a un equipo, con un comentario que le da contexto.',
    'regla': 'También se pueden armar reglas de derivación automática. Los campos del producto y sus funcionalidades son variables, modificables según la necesidad del cliente.',
    'auto': 'Por eso, cuando el cliente 6 empezó a fallar, la regla mandó las alertas a la Mesa de ayuda sin que nadie tuviera que intervenir.',
    'seguimiento': 'En Seguimiento se ve quién tiene cada alerta, desde cuándo y la carga de cada equipo. Lo que se demora, además, se marca en rojo.',

    'soporte1': 'Ahora, la vista de Soporte. Cada persona ve solo lo que se le asignó, a ella o a su equipo, ordenado por prioridad.',
    'tomar': 'Matías toma la alerta y pasa a estar en curso. En el detalle tiene toda la conversación: derivaciones, comentarios y evidencias.',
    'evidencia': 'Deja un comentario con lo que vio en los logs y adjunta una captura como evidencia. Todo queda registrado en el historial, sin planillas ni mensajes sueltos.',
    'ticket': 'Con un clic se crea el ticket en Jira, con los datos de la alerta ya cargados. Queda vinculado a la alerta.',
    'comunicar': 'Comunicar el incidente no requiere cargar nada a mano. Se eligen los equipos o personas, cada uno con su rol: informado, técnico o líder. El mensaje ya viene armado con la alerta y el ticket, y Helios envía el aviso push.',
    'push_tec': 'Así lo ve un técnico de la Mesa de ayuda en su celular. Con un toque en Recibido, confirma que ya está al tanto.',
    'push_ger': 'Y así le llega a Gerencia, aunque Helios esté cerrado.',
    'registro': 'En la conversación queda anotado a quién se avisó y cuántos técnicos ya confirmaron.',
    'correo': 'El correo también sale armado: asunto y texto con los datos de la alerta y el ticket.',
    'destinatarios': 'Los destinatarios se eligen de una lista de personas y equipos, sin copiar ni pegar. Si hace falta, se escriben a mano direcciones de clientes o proveedores. Lo elegido queda cargado en Para y en Copia.',
    'outlook': 'Se abre en Outlook, listo para enviar. Después se confirma en Helios que el correo se envió y queda anotado en la conversación.',
    'resolver': 'Cuando el problema se soluciona, se resuelve la alerta: se elige qué lo causó y qué se hizo con un clic, y se puede sumar un detalle. Esa información alimenta los reportes de causas y de tiempos, y todo el recorrido queda registrado.',

    'ger1': 'Pasamos a la vista de gerencia. Gabriela, la gerente, recibió el aviso y abre el comunicado. Ve el mensaje, el ticket y a quiénes se informó.',
    'ger_ops': 'En el tablero ve las alertas activas, quién las tiene y cuánto llevan, en solo lectura. Si un cliente consulta, ya sabe si alguien lo está trabajando.',
    'disp': 'En Disponibilidad ve cada cliente frente a su objetivo: cuántos cumplen, cuántos están en riesgo y cuánto tiempo estuvieron sin servicio. Abajo, la distribución de fallas por cliente, por tipo y por causa.',
    'hist': 'Y en el histórico, los tiempos de resolución por tipo de falla y los clientes más afectados, con filtros por cliente, servicio, gravedad y período.',

    'asis1': 'Ahora, el asistente de inteligencia artificial. Responde solo con lo que cada perfil puede ver. Le preguntamos qué está sin asignar y a quién derivarlo.',
    'asis2': 'Muestra lo pendiente y propone la derivación. Nada se ejecuta solo: el analista lo confirma con un clic.',
    'asis3': 'También muestra la carga de cada equipo para repartir mejor el trabajo. Se le puede preguntar en lenguaje natural, como a un compañero.',
    'asis4': 'Sobre una alerta explica qué pasa y se apoya en casos parecidos ya resueltos.',
    'asis5': 'Y suma contexto de afuera: feriados, incidentes de proveedores y noticias que pueden afectar la operación. Así el equipo entiende si una caída tiene una causa externa.',

    # Los dos primeros textos de este bloque son los de los audios que grabó una persona (carpeta audios/): se usan tal cual, con su duración.
    'aicim1': 'Y lo que viene: AICIM, un asistente inteligente que coordina la resolución de los incidentes mayores.',
    'sala1': 'Cuando varias alertas son parte del mismo problema, el analista abre una sala de crisis desde la alerta.',
    'sala2': 'Suma las alertas de los otros clientes afectados. La sala reúne alertas, tareas y una guía de diagnóstico en un solo lugar.',
    'sala3': 'El asistente propone qué revisar primero y a quién asignarle cada tarea. Nada se hace solo: el analista confirma.',
    'sala4': 'Soporte recibe su tarea, la empieza y, al terminar, la marca como hecha con lo que encontró.',
    'sala5': 'Cuando el servicio vuelve, el analista marca el incidente como mitigado y cierra la sala con la causa raíz.',
    'teams1': 'Conduce la sala de crisis desde Microsoft Teams, asigna tareas y sigue cada acción hasta restablecer el servicio. Siempre bajo supervisión humana.',
    'teams2': 'En el chat de la sala, el equipo le pregunta a Gemma cómo va el incidente, y Gemma responde con los datos de la sala.',
    'teams3': 'Si hay que actuar, por ejemplo escalar al proveedor, Gemma propone la acción y manda el enlace para confirmarla en Helios.',
    'teams4': 'Y cada novedad de la sala llega al canal de Teams, para que todo el equipo siga el incidente.',

    'fin': 'Helios: pre-alertas anticipadas, alertas priorizadas, comunicación sin carga manual, información para la gerencia y un asistente que ayuda a decidir. Enterate antes que tus clientes.',
}


# Audios grabados por una persona: clave del texto -> archivo (carpeta audios/). Reemplazan a la voz sintética en esas frases.
AUDIOS = {'intro1': 'audios/voz_intro1.m4a', 'intro2': 'audios/voz_intro2.m4a', 'login': 'audios/voz_login.m4a', 'datos': 'audios/voz_datos.m4a', 'pre': 'audios/voz_pre.m4a', 'avisar': 'audios/voz_avisar.m4a', 'confirma': 'audios/voz_confirma.m4a', 'abiertas': 'audios/voz_abiertas.m4a', 'derivar': 'audios/voz_derivar.m4a', 'regla': 'audios/voz_regla.m4a', 'auto': 'audios/voz_auto.m4a', 'seguimiento': 'audios/voz_seguimiento.m4a', 'soporte1': 'audios/voz_soporte1.m4a', 'tomar': 'audios/voz_tomar.m4a', 'evidencia': 'audios/voz_evidencia.m4a', 'ticket': 'audios/voz_ticket.m4a', 'comunicar': 'audios/voz_comunicar.m4a', 'push_tec': 'audios/voz_push_tec.m4a', 'push_ger': 'audios/voz_push_ger.m4a', 'registro': 'audios/voz_registro.m4a', 'correo': 'audios/voz_correo.m4a', 'destinatarios': 'audios/voz_destinatarios.m4a', 'outlook': 'audios/voz_outlook.m4a', 'resolver': 'audios/voz_resolver.m4a', 'ger1': 'audios/voz_ger1.m4a', 'ger_ops': 'audios/voz_ger_ops.m4a', 'disp': 'audios/voz_disp.m4a', 'hist': 'audios/voz_hist.m4a', 'asis1': 'audios/voz_asis1.m4a', 'asis2': 'audios/voz_asis2.m4a', 'asis3': 'audios/voz_asis3.m4a', 'asis4': 'audios/voz_asis4.m4a', 'asis5': 'audios/voz_asis5.m4a', 'fin': 'audios/voz_fin.m4a', 'aicim1': 'audios/voz_AICIM.m4a', 'teams1': 'audios/voz_Microsoft_Teams.m4a'}
