// Datos y cuentas compartidos por los dos documentos de modelos de IA.
// Precios en USD por millón de tokens, verificados el 18/11/2026 (ver fuentes en el documento técnico).
// Criterio del 20/11/2026: siempre plan pago. No se descuenta ningún cupo gratuito.
// Los dos Word (cliente e ingeniería) leen de acá, así los números siempre coinciden.

const FECHA_PRECIOS = '18/11/2026';
const FECHA = '20/11/2026';

// Supuesto de una consulta del asistente: lo que el servidor le arma al modelo (datos del perfil + instrucciones) y lo que contesta.
// Coincide con lo medido en Workers AI con Qwen3 30B-A3B: 30 a 70 neuronas por pregunta (con estos números da 58).
const SUPUESTO = { entrada: 6000, salida: 1000 };

const ESCENARIOS = [
  { id: 'chico', nombre: 'Uso actual', porDia: 150, detalle: '150 consultas por día (el tope de hoy)' },
  { id: 'medio', nombre: 'Uso medio', porDia: 1000, detalle: '1.000 consultas por día' },
  { id: 'grande', nombre: 'Uso intenso', porDia: 5000, detalle: '5.000 por día, con análisis automático de cada alerta' },
];
const DIAS_MES = 30;

// neur = neuronas por millón de tokens [entrada, salida] (solo Workers AI)
const MODELOS = [
  { id: 'wai_qwen', nombre: 'Qwen3 30B-A3B', via: 'Workers AI (Cloudflare)', ent: 0.051, sal: 0.335, neur: [4625, 30475] },
  { id: 'wai_gemma', nombre: 'Gemma 4 26B-A4B', via: 'Workers AI (Cloudflare)', ent: 0.10, sal: 0.30, neur: [9091, 27273] },
  { id: 'wai_gptoss', nombre: 'gpt-oss-120b', via: 'Workers AI (Cloudflare)', ent: 0.35, sal: 0.75, neur: [31818, 68182] },
  { id: 'haiku', nombre: 'Claude Haiku 5.5', via: 'API de Anthropic', ent: 0.10, sal: 0.50 },
  { id: 'sonnet', nombre: 'Claude Sonnet 5.5', via: 'API de Anthropic', ent: 2, sal: 10 },
  { id: 'luna', nombre: 'GPT-6 Luna', via: 'API de OpenAI', ent: 0.10, sal: 0.50 },
  { id: 'terra', nombre: 'GPT-6.1 Terra', via: 'API de OpenAI', ent: 1, sal: 5 },
  { id: 'gem_hoy', nombre: 'Gemini 3.8 Flash (hasta el 31/12/2026)', via: 'API de Google', ent: 0.75, sal: 3.75 },
  { id: 'gem_2027', nombre: 'Gemini 3.8 Flash (desde el 1/1/2027)', via: 'API de Google', ent: 1.5, sal: 7.5 },
];
const M = Object.fromEntries(MODELOS.map((m) => [m.id, m]));

function costoConsulta(m) {
  return (SUPUESTO.entrada * m.ent + SUPUESTO.salida * m.sal) / 1e6;
}
function neuronasConsulta(m) {
  return (SUPUESTO.entrada * m.neur[0] + SUPUESTO.salida * m.neur[1]) / 1e6;
}
// Costo mensual en plan pago, sin descontar cupos gratuitos.
function costoMes(m, esc) {
  return costoConsulta(m) * esc.porDia * DIAS_MES;
}
const nf = (n, d) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
function usdConsulta(n) { return 'USD ' + nf(n, 4); }
function usdMes(n) {
  return 'USD ' + (n >= 100 ? nf(n, 0) : nf(n, 2));
}
function usdMesCorto(n) {
  return 'USD ' + (n >= 100 ? nf(n, 0) : nf(n, 2));
}
const mil = (n) => nf(n, 0);

// Hosting de la GPU. Precios de lista al 20/11/2026, Linux, regiones baratas (AWS us-east-1, GCP us-central1), sin impuestos.
// 730 h = un mes prendido. 220 h = horario de trabajo (10 h x 22 días). El "resto" del servidor local es una estimación, no una cotización.
const HORAS_MES = 730;
const HORAS_HABIL = 220;
const LOCAL_GPU = { min: 6200, max: 11900 };
const LOCAL_RESTO = { min: 1500, max: 2500 };
const LOCAL_MESES = 36;
const NUBE = {
  awsL4: 0.8048,       // g6.xlarge, 1x L4 de 24 GB
  awsL4_3a: 0.3694,    // la misma, reservada 3 años sin pago inicial
  gcpL4: 0.7068,       // g2-standard-4, 1x L4 de 24 GB
  gcpL4_3a: 0.318,     // la misma, compromiso a 3 años
  awsL40: 1.861,       // g6e.xlarge, 1x L40S de 48 GB
  awsL40_3a: 0.804,    // la misma, reservada 3 años sin pago inicial
  gcp96: 4.50,         // g4-standard-48, 1x RTX PRO 6000 de 96 GB
};
const localMes = (alto) => ((alto ? LOCAL_GPU.max : LOCAL_GPU.min) + (alto ? LOCAL_RESTO.max : LOCAL_RESTO.min)) / LOCAL_MESES;
const porHoras = (precioHora, horas) => precioHora * horas;

module.exports = { FECHA, FECHA_PRECIOS, SUPUESTO, ESCENARIOS, DIAS_MES, MODELOS, M, costoConsulta, neuronasConsulta, costoMes, usdConsulta, usdMes, usdMesCorto, mil, nf, HORAS_MES, HORAS_HABIL, NUBE, localMes, porHoras };

if (require.main === module) {
  console.log('neuronas por consulta (Qwen):', neuronasConsulta(M.wai_qwen).toFixed(1));
  for (const m of MODELOS) {
    console.log(m.nombre.padEnd(44), usdConsulta(costoConsulta(m)), ESCENARIOS.map((e) => usdMesCorto(costoMes(m, e))).join(' | '));
  }
}
