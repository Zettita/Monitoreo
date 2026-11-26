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
  '<h2>De mis equipos</h2>', 'Qué parte de tus problemas', 'Todavía no hay movimientos', 'Llega como aviso al celular', 'Modo simulado: hasta que esté', 'Sumar personas sueltas', "'Comunicar incidente · '", "'Generar ticket · '", "'Template correo alerta «' +", 'No cumple · lejos', ' bajo el objetivo', 'Solo los problemas asignados a tu usuario', '>Operación ahora<', 'PALETA_FALLAS', 'class=\\"torta', 'data-act-corte=\\"'])
  ok('ya no está: ' + t, !s.includes(t));
for (const t of ['>Operaciones<', 'Tendencia al alza en la tasa de rechazo', 'Sin métricas con tendencia de deterioro', 'Superaría el umbral en aprox. ',
  'Valor actual: <b>', 'Efectividad de los avisos · últimas 48 h', 'de acierto', 'Desvío vs. objetivo: ', "amarillo: 'En riesgo', rojo: 'No cumple'", '<th>Cliente</th><th>Servicio</th>', 'id=\\"hf-srv\\"', 'k-listas-res', 'fl-filas', 'Problemas por cliente', 'Problemas por tipo de falla', 'data-act-corte-fila', "{ derivar: 'Derivar', tomar: 'Tomar'", '<h2>Equipos</h2>', 'id=\\"lnk-misal\\"',
  "PESTANAS = ['op', 'hist', 'disp']", 'Solo un analista puede derivar o reasignar una alerta.'])
  ok('está: ' + t, s.includes(t));
// Parche 84: en «Estado por cliente», el detalle largo pasa a un segundo renglón (el nombre del servicio no se parte letra por letra)
ok('Estado por cliente: la línea con detalle largo lleva la clase «largo»', s.includes("(det.length > 14 ? ' largo' : '')"));
ok('Estado por cliente: la clase «largo» pone el detalle bajo el nombre del servicio', s.includes('.pano-cli li.largo .pano-det { grid-column: 2; max-width: none; text-align: left; }'));
// Parche 85: la conversación del asistente recuerda de qué alerta se habla
ok('Asistente: la página manda la alerta de la conversación en las preguntas siguientes', s.includes('cuerpo.alerta_contexto = alertaCtx') && s.includes('alertaCtx = id;'));
ok('Asistente: una pregunta sugerida deja de hablar de esa alerta', s.includes('alertaCtx = null;'));
// Parche 86: el menú del usuario es el mismo en todas las páginas con menú y el login borra la pestaña recordada
ok('Menú del usuario: el script común está en las 8 páginas con menú (tablero, Administración, Mis alertas/tareas, Seguimiento, sala, Mis tareas, Comunicados y detalle de alerta)', s.split('Menú del usuario igual en todas las páginas (parche 86)').length - 1 === 8);
ok('Menú del usuario: lleva las 7 entradas de navegación en el mismo orden', s.includes("{ href: '/', texto: 'Tablero', permiso: 'tablero' }") && s.includes("{ href: '/admin', texto: 'Administración', permiso: 'admin_panel' }") && s.includes("{ href: '/comunicados', texto: 'Comunicados', permiso: 'comunicados' }"));
ok('Menú del usuario: «Cambiar contraseña» también en las páginas que no la tenían', s.includes("id=\"dlg-clave-comun\"") || s.includes("d.id = 'dlg-clave-comun'"));
ok('Login: cada ingreso borra la pestaña y el período que recordaba el navegador (el Analista abre en Operaciones)', s.includes("sessionStorage.removeItem('helios_pestana'); sessionStorage.removeItem('helios_periodo');"));
// Parche 89: botones de las listas de alertas en lugares fijos y «¿Qué está pasando?» en todas las filas
ok('Alertas abiertas: cada botón tiene su lugar fijo (Detalle, Historial y «¿Qué está pasando?» en las mismas columnas)', s.includes('.sl-det { width: 58px; }') && s.includes("sl('det', '<a class=\\\"btn chico\\\"") && s.includes("sl('his', botonHistorial)"));
ok('Alertas abiertas: «¿Qué está pasando?» se dibuja en todas las filas con acciones', s.includes("sl('exp', '<button type=\\\"button\\\" class=\\\"asis-explicar\\\" data-asis-alerta=\\\"'"));
ok('Seguimiento: mismos lugares fijos para Ver detalle, Historial y «¿Qué está pasando?»', s.includes("sl('detl',") && s.includes("sl('exp',") && s.includes('<div class=\\"acc-fila\\">'));
// Parche 90: un solo desplegable a la vez (campanita y menú del perfil)
ok('Desplegables: el menú del usuario y la campanita se cierran entre sí (clic en la fase de captura) en las 8 páginas con menú', s.split('Un solo desplegable a la vez (parche 90)').length - 1 === 8 && s.includes("t.closest('#btn-avatar') && panel && !panel.hidden") && s.includes("t.closest('.campana') && !menu.hidden"));
// Parche 91: franjas de Urgente y Pre-alerta, botones del correo y sala de crisis con una sola forma de cerrar
ok('Tablero: «Urgente» y «Pre-alerta» son franjas con ícono, detalle y botón («Ver detalle» y «Ver pre-alerta»)', s.includes('function franjaPortada(clase, icono, titulo, detalle, boton)') && s.includes('>Ver detalle</a>') && s.includes('data-ir-pre=\\"1\\">Ver pre-alerta</button>') && s.includes('.franja.urg') && s.includes('.franja.pre'));
ok('Tablero: ya no son dos renglones de texto con «⚠️ Pre-alerta» ni «alerta en ~…m»', !s.includes("'⚠️ Pre-alerta: <strong>'") && !s.includes("' | alerta en ~'"));
ok('Correo: los botones de «Confirmar envío» dicen «Se envió», «Se envió con cambios» y «No se envió» (no «tal cual»)', s.includes('<span>Se envió</span>') && s.includes('<span>Se envió con cambios</span>') && s.includes('<span>No se envió</span>') && !s.includes('Se envió tal cual') && !s.includes("'Enviado sin cambios'"));
ok('Sala de crisis: sin «Servicio restablecido (mitigado)» ni «Marcar resuelto»; queda «Cerrar con causa raíz» como botón principal', !s.includes('Servicio restablecido (mitigado)') && !s.includes('Marcar resuelto') && s.includes('<button class=\\"btn primario\\" data-est=\\"CERRADO\\">Cerrar con causa raíz</button>'));
console.log(fallas ? 'FALLAS: ' + fallas : 'TODO OK');
