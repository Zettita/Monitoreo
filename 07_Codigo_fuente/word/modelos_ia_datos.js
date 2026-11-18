// Datos y cuentas compartidos por los dos documentos de modelos de IA.
// Precios en USD por millón de tokens, verificados el 18/11/2026 (ver fuentes en el documento técnico).
// Los dos Word (cliente e ingeniería) leen de acá, así los números siempre coinciden.

const FECHA = '18/11/2026';

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

const PRECIO_NEURONAS = 0.011 / 1000; // USD por neurona
const NEURONAS_GRATIS_DIA = 10000;

function costoConsulta(m) {
  return (SUPUESTO.entrada * m.ent + SUPUESTO.salida * m.sal) / 1e6;
}
function neuronasConsulta(m) {
  return (SUPUESTO.entrada * m.neur[0] + SUPUESTO.salida * m.neur[1]) / 1e6;
}
// Costo mensual para un escenario. Workers AI: se descuentan las 10.000 neuronas gratis por día.
function costoMes(m, esc) {
  if (m.neur) {
    const porDia = neuronasConsulta(m) * esc.porDia;
    return Math.max(0, porDia - NEURONAS_GRATIS_DIA) * PRECIO_NEURONAS * DIAS_MES;
  }
  return costoConsulta(m) * esc.porDia * DIAS_MES;
}
const nf = (n, d) => n.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
function usdConsulta(n) { return 'USD ' + nf(n, 4); }
function usdMes(n) {
  if (n === 0) return 'USD 0 (dentro del cupo gratis)';
  return 'USD ' + (n >= 100 ? nf(n, 0) : nf(n, 2));
}
function usdMesCorto(n) {
  if (n === 0) return 'USD 0';
  return 'USD ' + (n >= 100 ? nf(n, 0) : nf(n, 2));
}
const mil = (n) => nf(n, 0);

module.exports = { FECHA, SUPUESTO, ESCENARIOS, DIAS_MES, MODELOS, M, costoConsulta, neuronasConsulta, costoMes, usdConsulta, usdMes, usdMesCorto, mil, nf, NEURONAS_GRATIS_DIA };

if (require.main === module) {
  console.log('neuronas por consulta (Qwen):', neuronasConsulta(M.wai_qwen).toFixed(1));
  for (const m of MODELOS) {
    console.log(m.nombre.padEnd(44), usdConsulta(costoConsulta(m)), ESCENARIOS.map((e) => usdMesCorto(costoMes(m, e))).join(' | '));
  }
}
