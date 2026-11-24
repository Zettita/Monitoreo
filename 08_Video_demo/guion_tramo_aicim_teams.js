// Guion de voz en off del tramo nuevo (AICIM, sala de crisis y Gemma en Teams) para que una persona lo grabe sobre el video.
// Uso: node guion_tramo_aicim_teams.js <carpeta con tramo_AICIM_Teams.json> [carpeta de salida]   (hace falta `npm install docx --no-save` en 07_Codigo_fuente/word)
// El JSON lo deja armar.py con los tiempos de la grabación; las frases que ya tienen audio grabado se marcan para no volver a leerlas.
const fs = require('fs');
const path = require('path');
const H = require('../07_Codigo_fuente/word/helios_docx.js');

const entrada = process.argv[2] || '.';
const salida = process.argv[3] || entrada;
const J = JSON.parse(fs.readFileSync(path.join(entrada, 'tramo_AICIM_Teams.json'), 'utf-8'));
const POR_CLAVE = Object.fromEntries(J.filas.map((f) => [f.clave, f]));

// qué se ve en pantalla en cada frase
const VE = {
  aicim1: 'Tarjeta «AICIM».',
  sala1: 'Escena 20: se cae el gateway de pagos. El analista abre el detalle de la alerta y toca «Abrir sala de crisis».',
  sala2: 'Ya en la sala: suma las alertas de CLI 002 y CLI 005. Se ven las alertas, la línea de tiempo y la guía de diagnóstico con incidentes parecidos.',
  sala3: 'Asistente dentro de la sala: «¿Qué reviso primero?». El analista confirma las dos tareas que propone.',
  sala4: 'Vista de Soporte (Matías): empieza su tarea y la marca como hecha, con lo que encontró.',
  teams1: 'Microsoft Teams: el chat de la sala. El analista le escribe a @Gemma y responde con el estado del incidente.',
  teams2: 'Se lee la respuesta de Gemma (estado, alertas y tareas de la sala).',
  teams3: 'Segunda pregunta: «¿Escalo esto al proveedor?». Gemma propone escalar y manda el enlace para confirmarlo en Helios.',
  sala5: 'De vuelta en Helios: servicio restablecido (mitigado) y cierre de la sala con la causa raíz.',
  teams4: 'Canal de Teams «Plataforma Monitoreo»: van llegando las novedades de la sala, hasta el cierre.',
};
const SECCIONES = [
  ['A. Presentación de AICIM', ['aicim1']],
  ['B. La sala de crisis en Helios', ['sala1', 'sala2', 'sala3', 'sala4']],
  ['C. Gemma en Microsoft Teams', ['teams1', 'teams2', 'teams3']],
  ['D. Cierre de la sala y novedades en Teams', ['sala5', 'teams4']],
];
const mmss = (s) => { const t = Math.max(0, Math.round(s)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const palabras = (t) => t.split(/\s+/).filter(Boolean).length;

let aLeer = 0, grabadas = 0; const apretados = [];
for (const [, claves] of SECCIONES) for (const c of claves) {
  const f = POR_CLAVE[c]; if (!f) continue;
  if (f.audio_grabado) { grabadas++; continue; }
  aLeer += palabras(f.texto);
  const v = palabras(f.texto) / (f.hasta - f.desde); if (v > 2.7) apretados.push(c + ' ' + v.toFixed(2) + ' palabras/s');
}

const w = H.ANCHO; const hijos = [];
hijos.push(...H.cabecera('Guion de voz en off · tramo nuevo', 'AICIM, sala de crisis y Gemma en Microsoft Teams', 'Guion para locución'));
hijos.push(H.titulo(1, 'Cómo usar este guion'));
hijos.push(H.vineta('Este tramo **reemplaza a las dos tarjetas de «lo que viene»** (AICIM y Microsoft Teams) del video de la demo. Dura ' + mmss(J.duracion) + ' y se lee mirando **`Helios_tramo_AICIM_Teams_sin_subtitulos_ni_audio.mp4`**.'));
hijos.push(H.vineta('Los tiempos son **del tramo** (arranca en 0:00). Para ubicarlo en el video completo, sumá el minuto en que empieza la tarjeta AICIM.'));
hijos.push(H.vineta('Dos bloques **ya tienen audio grabado** (AICIM y Microsoft Teams): figuran marcados como «AUDIO YA GRABADO» y **no hay que leerlos**. El resto, unas ' + aLeer + ' palabras, se lee a ritmo tranquilo, de 2 a 2,5 palabras por segundo.'));
hijos.push(H.vineta('La pantalla de Microsoft Teams es una **maqueta armada para el video**: Gemma contesta con los datos reales de la sala de Helios. No hace falta aclararlo al hablar.'));
hijos.push(...H.nota('idea', 'Dónde van los audios ya grabados', 'AICIM suena sobre la tarjeta del principio; el de Microsoft Teams, cuando aparece el chat de la sala. Ya están colocados en la versión `con_audios_y_subtitulos`.'));
let n = 0;
for (const [titulo, claves] of SECCIONES) {
  const filas = claves.map((c) => POR_CLAVE[c]).filter(Boolean);
  hijos.push(H.titulo(1, titulo));
  hijos.push(...H.tabla(['Tiempo', 'En pantalla', 'Texto para leer'], [1000, 2900, w - 3900],
    filas.map((f) => [mmss(f.desde) + ' – ' + mmss(f.hasta), VE[f.clave] || '', f.audio_grabado ? 'AUDIO YA GRABADO: «' + f.texto + '»' : f.texto]), false));
  n += filas.length;
}
hijos.push(H.titulo(1, 'Versión corrida para leer de seguido'));
hijos.push(H.P('Es solo el texto que hay que grabar, sin tiempos y en el orden del video.'));
const corrido = [];
for (const [titulo, claves] of SECCIONES) {
  const t = claves.map((c) => POR_CLAVE[c]).filter((f) => f && !f.audio_grabado).map((f) => f.texto);
  if (!t.length) continue;
  hijos.push(H.titulo(2, titulo.replace(/^[A-Z]\. /, '')));
  hijos.push(H.P(t.join(' '))); corrido.push(titulo.replace(/^[A-Z]\. /, '').toUpperCase() + '\n' + t.join('\n'));
}
fs.mkdirSync(salida, { recursive: true });
(async () => {
  await H.guardar(H.documento({ titulo: 'Guion de voz en off · tramo nuevo', pie: 'Guion del tramo AICIM, sala de crisis y Gemma en Teams', hijos }), path.join(salida, 'Helios_guion_tramo_AICIM_Teams.docx'));
  fs.writeFileSync(path.join(salida, 'Helios_guion_tramo_AICIM_Teams.txt'), corrido.join('\n\n') + '\n', 'utf-8');
  console.log('Bloques:', n, '· ya grabados:', grabadas, '· palabras a grabar:', aLeer, '· bloques apretados (>2,7 p/s):', apretados.length ? apretados : 'ninguno');
})();
