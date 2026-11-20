// Resumen breve de Helios para enviar junto con el video de la demo (sin datos técnicos).
// Uso: node resumen_app.js <carpeta de salida>   (hace falta `npm install docx --no-save` en 07_Codigo_fuente/word)
const path = require('path');
const fs = require('fs');
const H = require('../07_Codigo_fuente/word/helios_docx.js');

const CLAVES = [
  '**Avisa antes.** Las pre-alertas anticipan hasta 30 minutos un problema que viene en camino, para que el equipo se prepare antes de que lo note el cliente.',
  '**Prioriza y deriva desde un solo lugar.** Las alertas se ordenan de P1 a P4 según su gravedad y la importancia del servicio, y se asignan a la persona o al equipo indicado, a mano o con reglas automáticas.',
  '**Comunica sin carga manual.** Con pocos clics se avisa del incidente a los equipos con una notificación en el celular, se arma el correo y se genera el ticket en Jira, todo con los datos de la alerta ya cargados.',
  '**Mantiene informada a la gerencia.** Recibe el aviso al instante y tiene un tablero con lo que está activo, quién lo trabaja, la disponibilidad de cada cliente frente a su objetivo y el histórico.',
  '**Deja todo registrado.** Cada acción queda en la conversación de la alerta, con su causa y su resolución, y esa información alimenta los reportes.',
  '**Asistente de inteligencia artificial.** Responde preguntas, explica qué está pasando en una alerta apoyándose en casos parecidos, sugiere a quién derivar y suma contexto de afuera: feriados, incidentes de proveedores y noticias. Propone, pero nunca ejecuta solo, y cada persona ve únicamente lo que su perfil permite.',
];
const hijos = [
  ...H.cabecera('Helios · Monitoreo inteligente', 'Resumen de la plataforma', 'Resumen'),
  H.titulo(1, 'Qué es'),
  H.P('Helios es una plataforma de monitoreo inteligente para servicios que procesan transacciones, como bancos, billeteras y procesadores de pagos. Detecta los problemas antes de que los vean los clientes y ordena el trabajo de todo el equipo para resolverlos.'),
  H.titulo(1, 'Puntos clave'),
  ...CLAVES.map((t) => H.vineta(t)),
  H.titulo(1, 'Se adapta a cada cliente'),
  H.P('Los campos del producto y sus funcionalidades son variables modificables según necesidad del cliente.'),
  H.titulo(1, 'Lo que viene'),
  H.P('Un asistente de coordinación de incidentes mayores que dirija la sala de crisis, asigne tareas a los especialistas, oriente el diagnóstico y supervise las acciones hasta restablecer el servicio, integrado con Microsoft Teams y siempre bajo supervisión humana.'),
  H.titulo(1, 'Sobre el video'),
  H.P('Recorre un incidente de punta a punta, en unos 8 minutos, con datos ficticios. La notificación en el celular, el correo en Outlook y las respuestas del asistente están simulados para la demostración.'),
];
const salida = process.argv[2] || '.';
fs.mkdirSync(salida, { recursive: true });
H.guardar(H.documento({ titulo: 'Helios · Resumen', pie: 'Resumen de Helios para acompañar el video de demostración', hijos }), path.join(salida, 'Helios_resumen_de_la_app.docx')).then(() => {
  console.log('ok');
});
