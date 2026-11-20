// Resumen breve de Helios para enviar junto con el video de la demo (sin datos técnicos).
// Uso: node resumen_app.js <carpeta de salida>   (hace falta `npm install docx --no-save` en 07_Codigo_fuente/word)
const path = require('path');
const fs = require('fs');
const H = require('../07_Codigo_fuente/word/helios_docx.js');

const CLAVES = [
  '**Avisa antes.** Las pre-alertas anticipan hasta 30 minutos un problema que viene en camino, antes de que lo note el cliente.',
  '**Prioriza y deriva desde un solo lugar.** Las alertas se ordenan de P1 a P4 según su gravedad y la importancia del servicio, y se asignan a la persona o al equipo indicado, a mano o con reglas automáticas.',
  '**Comunica sin carga manual.** Con pocos clics se avisa del incidente a los equipos con una notificación en el celular, se arma el correo y se genera el ticket en Jira, todo con los datos de la alerta ya cargados.',
  '**Mantiene informada a la gerencia.** Recibe el aviso al instante y tiene un tablero con lo que está activo, quién lo trabaja, la disponibilidad de cada cliente frente a su objetivo y el histórico.',
  '**Deja todo registrado.** Cada acción queda en la conversación de la alerta, con su causa y resolución, y alimenta los reportes.',
  '**Asistente de inteligencia artificial.** Responde preguntas, explica qué está pasando en una alerta apoyándose en casos parecidos, sugiere a quién derivar y suma contexto de afuera: feriados, incidentes de proveedores y noticias. Propone, nunca ejecuta solo, y cada persona ve solo lo que su perfil permite.',
  '**Sala de crisis para incidentes mayores (en implementación).** Reúne las alertas del incidente, las tareas de cada especialista y la línea de tiempo, con una guía de diagnóstico (qué revisar, de qué depende y qué antecedentes hay). El asistente propone asignar tareas, comunicar o escalar al proveedor, siempre con confirmación de una persona. Se integra con Microsoft Teams: los avisos llegan a un canal y se abre un chat con los involucrados.',
];
const hijos = [
  ...H.cabecera('Helios · Monitoreo inteligente', 'Resumen de la plataforma', 'Resumen'),
  H.titulo(1, 'Qué es'),
  H.P('Helios es una plataforma de monitoreo inteligente para servicios que procesan transacciones, como bancos, billeteras y procesadores de pagos. Detecta los problemas antes de que los vean los clientes y ordena el trabajo de todo el equipo para resolverlos.'),
  H.titulo(1, 'Puntos clave'),
  ...CLAVES.map((t) => H.vineta(t)),
  H.titulo(1, 'Se adapta a cada cliente'),
  H.P('Los campos del producto y sus funcionalidades son variables modificables según necesidad del cliente.'),
  H.titulo(1, 'Sobre el video'),
  H.P('Recorre un incidente de punta a punta, en unos 8 minutos, con datos ficticios. La notificación en el celular, el correo en Outlook y las respuestas del asistente están simulados para la demostración. La sala de crisis se presenta al final como la próxima capacidad.'),
];
const salida = process.argv[2] || '.';
fs.mkdirSync(salida, { recursive: true });
H.guardar(H.documento({ titulo: 'Helios · Resumen', pie: 'Resumen de Helios para acompañar el video de demostración', hijos }), path.join(salida, 'Helios_resumen_de_la_app.docx')).then(() => {
  console.log('ok');
});
