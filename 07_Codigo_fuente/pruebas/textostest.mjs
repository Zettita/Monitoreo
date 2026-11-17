// Parche 60: textos que se sacaron y textos nuevos (mira el Worker armado, sin base)
import fs from 'fs';
const s = fs.readFileSync(new URL('../worker/w.mjs', import.meta.url), 'utf8');
let fallas = 0; const ok = (t, c) => { console.log((c ? 'OK  ' : 'FALLA ') + t); if (!c) fallas++; };
for (const t of ['Elegí desde qué día y hasta qué día mirar', 'tocá una barra para ver los clientes de cada grupo', 'El último día todavía no terminó',
  'Amarillo: no llega, pero el tiempo sin servicio es hasta', 'Cuenta como sin servicio: alerta Grave', 'Qué parte de los problemas del período',
  'Cada problema es una alerta de un servicio y canal', 'Responde con lo que tu perfil puede ver', 'Cómo está ahora cada servicio de cada cliente',
  'Tocá una barra para ver solo esos', "'Los rechazos vienen subiendo'", 'Ninguna métrica viene empeorando', '<small>Elegí una.</small>',
  'Podés elegir más de una', 'opcional si elegiste la causa', 'Podría pasar en unos', 'En las últimas 48 horas avisamos',
  'Usuarios, equipos, reglas de alerta, derivación automática', 'Quién puede entrar y con qué perfil', 'Grupos de personas a los que',
  'Avisos propios: qué métrica mirar', 'Cada vez que se revisan las alertas, las que están sin asignar', 'Cómo se evalúan las alertas de todos los clientes',
  'Modelos para \\"Template correo alerta\\"', 'Solo lectura. Muestra contra qué perfil', 'Quién hizo qué y cuándo',
  'Asignadas a tu usuario o a tus equipos, todavía sin tomar', 'Alertas tomadas por tu usuario', 'Sos responsable de estos equipos',
  '<h2>De mis equipos</h2>', 'Qué parte de tus problemas', 'Todavía no hay movimientos', 'Llega como aviso al celular', 'Modo simulado: hasta que esté', 'Sumar personas sueltas', "'Comunicar incidente · '", "'Generar ticket · '", "'Template correo alerta «' +", 'No cumple · lejos', ' bajo el objetivo', 'Solo los problemas asignados a tu usuario', '>Operación ahora<'])
  ok('ya no está: ' + t, !s.includes(t));
for (const t of ['>Operaciones<', 'Tendencia al alza en la tasa de rechazo', 'Sin métricas con tendencia de deterioro', 'Superaría el umbral en aprox. ',
  'Valor actual: <b>', 'Efectividad de los avisos · últimas 48 h', 'de acierto', 'Desvío vs. objetivo: ', "amarillo: 'En riesgo', rojo: 'No cumple'", '<th>Cliente</th><th>Servicio</th>', 'id=\\"hf-srv\\"', 'k-listas-res', 'PALETA_FALLAS', "{ derivar: 'Derivar', tomar: 'Tomar'", '<h2>Equipos</h2>', 'id=\\"lnk-misal\\"',
  "PESTANAS = ['op', 'hist', 'disp']", 'Solo un analista puede derivar o reasignar una alerta.'])
  ok('está: ' + t, s.includes(t));
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
