# Texto de la voz en off y de los subtítulos (es lo mismo). Una clave por frase.
# Se escribe como se dice: "CLI 004" y "P uno a P cuatro" para que la voz lo lea bien.
TEXTOS = {
    'intro1': 'Helios es una plataforma de monitoreo inteligente para servicios que procesan transacciones, como bancos, billeteras y procesadores de pagos. Detecta los problemas antes de que los vean los clientes y ordena el trabajo para resolverlos.',
    'intro2': 'En este recorrido seguimos un incidente de punta a punta: pre-alertas, priorización y derivación, comunicación del incidente, aviso a gerencia, el tablero gerencial y el asistente de inteligencia artificial.',

    'login': 'Cada persona entra con su usuario y ve solo lo que corresponde a su perfil. Empezamos como analista de monitoreo.',
    'datos': 'Helios compara cada ventana de quince minutos de cada cliente y servicio contra su comportamiento esperado. En la demo, los datos llegan escena por escena.',
    'pre': 'Acá aparece la primera ventaja: la pre-alerta. Los rechazos del cliente CLI 004 vienen subiendo y todavía no cruzaron el límite, pero Helios proyecta que lo harían en unos quince minutos. Así avisa hasta treinta minutos antes de que el incidente impacte.',
    'avisar': 'El analista puede avisar a Soporte para que se anticipe. Es un aviso, no una alerta: no ensucia el historial.',
    'confirma': 'Un cuarto de hora después, el problema se confirma. Helios mide cuántas pre-alertas se confirmaron y con cuánta anticipación: acá, cien por ciento de acierto y quince minutos antes.',

    'abiertas': 'Con más problemas en curso, las alertas se ordenan por gravedad y por la criticidad del servicio, de P uno a P cuatro. De un vistazo se ve cuántas están sin asignar, cuáles tienen dueño y cuáles ya están en curso.',
    'derivar': 'El analista deriva cada alerta a una persona o a un equipo de Soporte, con un comentario que da contexto.',
    'regla': 'También se puede derivar automáticamente con reglas. Por ejemplo, las caídas graves del cliente CLI 006 van directo a la Mesa de ayuda.',
    'auto': 'Y así ocurrió: apenas CLI 006 empezó a fallar, la regla derivó las alertas a la Mesa de ayuda, sin intervención del analista.',
    'seguimiento': 'En Seguimiento, el analista ve quién tiene cada alerta y desde cuándo, y la carga de cada equipo. Lo que lleva demasiado tiempo sin atención se marca en rojo.',

    'soporte1': 'Ahora, la vista de Soporte. Cada persona ve solo lo asignado a ella o a su equipo, ordenado por prioridad.',
    'tomar': 'Diego toma la alerta y pasa a estar en curso. En el detalle tiene toda la conversación: derivaciones, comentarios y evidencia.',
    'evidencia': 'Deja un comentario con lo que vio en los logs y adjunta una captura como evidencia. Todo queda registrado en el historial de la alerta.',
    'ticket': 'Con un clic se genera el ticket en Jira, con los datos de la alerta ya cargados. Queda vinculado a la alerta.',
    'comunicar': 'Comunicar el incidente no requiere cargar nada a mano. Se eligen los equipos o las personas a avisar, cada uno con su rol: informado, técnico o líder. El mensaje ya viene armado con los datos de la alerta y el ticket, y Helios envía el aviso push.',
    'push_tec': 'Así lo ve un técnico de la Mesa de ayuda en su celular Android. Con un toque en Recibido, confirma que ya está al tanto.',
    'push_ger': 'Y así lo recibe la gerencia en su iPhone, aunque Helios esté cerrado.',
    'registro': 'En la conversación queda registrado a quién se informó, cuándo, y cuántos técnicos ya confirmaron.',
    'correo': 'El correo también sale armado. Helios completa el asunto y el texto con los datos de la alerta y el ticket.',
    'destinatarios': 'Los destinatarios se eligen de una lista de personas y equipos, sin copiar ni pegar. También se pueden escribir a mano direcciones de clientes o proveedores. Lo elegido queda cargado en Para y en copia.',
    'outlook': 'Se abre en Outlook, listo para enviar. Después se confirma en Helios que el correo se envió, y queda registrado en la conversación.',
    'resolver': 'Cuando el problema se soluciona, se resuelve la alerta. Se elige qué lo causó y qué se hizo con un clic, y se puede sumar un detalle. Esa información alimenta los reportes de causas y de tiempos. Con eso la alerta queda resuelta y todo el recorrido registrado en la conversación.',

    'ger1': 'Pasamos a la vista de gerencia. Gabriela, la gerente, recibió el aviso y puede abrir el comunicado: ve el mensaje, el ticket y a quiénes se informó.',
    'ger_ops': 'En el tablero ve las alertas activas, quién las tiene y cuánto llevan, en solo lectura. Si un cliente pregunta, ya sabe si alguien lo está trabajando.',
    'disp': 'La pestaña Disponibilidad muestra cada cliente frente a su objetivo: cuántos cumplen, cuántos están en riesgo y cuánto tiempo estuvieron sin servicio. Abajo, la distribución de fallas por cliente, por tipo y por causa.',
    'hist': 'El histórico muestra los tiempos de resolución por tipo de falla y los clientes más afectados. Se puede filtrar por cliente, servicio, gravedad y problema, y elegir el período que se quiere analizar.',

    'asis1': 'Ahora, el asistente de inteligencia artificial. Responde solo con lo que cada perfil puede ver. Le preguntamos qué está sin asignar y a quién derivarlo.',
    'asis2': 'Muestra lo pendiente y propone la derivación. Nada se ejecuta solo: con un clic de confirmación, el analista la hace.',
    'asis3': 'También muestra la carga de cada persona y equipo, para repartir mejor el trabajo. Se puede preguntar en lenguaje natural, como a un compañero.',
    'asis4': 'Sobre una alerta, explica qué está pasando y usa casos parecidos ya resueltos para orientar la solución.',
    'asis5': 'Y suma contexto externo: feriados, incidentes de proveedores y noticias que puedan afectar la operación. Así el equipo entiende si un pico o una caída tiene una causa de afuera.',

    'aicim1': 'Y la próxima capacidad: el Asistente Inteligente de Coordinación de Incidentes Mayores. Es un agente que dirige y coordina la resolución de los incidentes mayores. Con conocimiento de la infraestructura, sus dependencias y sus antecedentes operativos, conduce la sala de crisis, asigna tareas a los especialistas, indica qué componentes revisar y orienta el diagnóstico.',
    'aicim2': 'La sala de crisis se integra con Microsoft Teams. Desde ahí el asistente determina los escalamientos necesarios y supervisa los avances, los tiempos de respuesta, las comunicaciones y el seguimiento de las acciones hasta el restablecimiento del servicio. Transforma la información técnica en acciones concretas, siempre bajo supervisión humana.',

    'fin': 'Helios: pre-alertas anticipadas, alertas priorizadas, comunicación sin carga manual, información para la gerencia y un asistente que ayuda a decidir. Enterate antes que tus clientes.',
}
