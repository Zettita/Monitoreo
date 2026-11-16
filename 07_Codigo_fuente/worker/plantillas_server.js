// =====================================================================
// PLANTILLAS DE CORREO (parche 40). Modelos para "Template correo alerta" según el tipo de incidente y el sector al que se escala.
//
//   GET  /api/admin/plantillas-correo          lista (Administrador)
//   POST /api/admin/plantillas-correo          alta o cambio: {id?, nombre, sector, tipos[], cuando, asunto, cuerpo, activa}
//   POST /api/admin/plantillas-correo/borrar   {id}
//   (el detalle de la alerta trae las activas en plantillas_correo)
//
// Se guardan en alerta_parametros.plantillas_correo (JSON {plantillas:[…]}; script 18). Sin la columna o vacía se usan las de
// fábrica (las de abajo). Los destinatarios no van en la plantilla: los pone quien envía el correo.
// Variables: {alerta} {problema} {cliente} {servicio} {ambiente} {desde} {duracion} {gravedad} {prioridad} {etiqueta}
//   {medicion} {estado} {responsable} {equipo} {ultima_novedad} {resolucion} {enlace} {firma}. Una línea con una variable
//   vacía (por ejemplo, sin última novedad) no se escribe.
// =====================================================================
const FALTA_SCRIPT_18 = 'Para guardar plantillas falta correr 18_plantillas_correo_d1.txt en la consola de D1 (mientras tanto se usan las de fábrica).';
const PLANTILLA_CUANDO = ['TODAS', 'ABIERTA', 'RESUELTA'];
const PLANTILLAS_MAX = 40;
const PLANTILLAS_FABRICA = [
  { id: 1, nombre: 'General', sector: 'Interno', tipos: [], cuando: 'TODAS', activa: 1,
    asunto: '[{etiqueta}] {cliente} · {servicio}: {problema}',
    cuerpo: 'Hola,\n\nLes escribimos por un problema que detectó Helios, el monitoreo de transacciones:\n\n- Qué pasa: {problema}\n- Cliente: {cliente}\n- Servicio: {servicio} (ambiente {ambiente})\n- Desde: {desde} (hora de Argentina)\n- Duración: {duracion}\n- Gravedad: {gravedad}, prioridad {prioridad}\n- Última medición: {medicion}\n- Estado: {estado}\n- Cómo se resolvió: {resolucion}\n- Última novedad: {ultima_novedad}\n\n[Completar: qué necesitamos de ustedes y próximos pasos]\n\nVer la alerta en Helios (para usuarios de Helios): {enlace}\n\nSaludos,\n{firma}' },
  { id: 2, nombre: 'Aviso al cliente', sector: 'Cliente', tipos: [], cuando: 'ABIERTA', activa: 1,
    asunto: '{cliente} · {servicio}: {problema}',
    cuerpo: 'Hola,\n\nDesde el {desde} (hora de Argentina) vemos un comportamiento fuera de lo normal en {servicio}: {problema}.\n\n- Última medición: {medicion}\n- Gravedad: {gravedad}\n\nYa lo estamos revisando. [Completar: qué necesitamos que verifiquen de su lado]\n\nLes avisamos apenas se normalice.\n\nSaludos,\n{firma}' },
  { id: 3, nombre: 'Escalar a proveedor o gateway', sector: 'Proveedor', tipos: ['SIN_EXITOS', 'ERROR_ALTO', 'RECHAZO_ALTO', 'APROBACION_BAJA', 'LATENCIA_ALTA'], cuando: 'ABIERTA', activa: 1,
    asunto: 'Incidente {prioridad} · {servicio} ({cliente}): {problema}',
    cuerpo: 'Hola,\n\nNecesitamos que revisen un problema que afecta a {servicio} del cliente {cliente} desde el {desde} (hora de Argentina).\n\n- Qué vemos: {problema}\n- Última medición: {medicion}\n- Duración hasta ahora: {duracion}\n- Gravedad: {gravedad}, prioridad {prioridad}\n\n[Completar: códigos de error, ejemplos de operaciones, horario exacto]\n\nPor favor, confírmennos si tienen un incidente abierto de su lado y el tiempo estimado de solución.\n\nSaludos,\n{firma}' },
  { id: 4, nombre: 'Caída: escalar a Mesa de ayuda', sector: 'Mesa de ayuda', tipos: ['VOLUMEN_BAJO', 'SIN_EXITOS', 'VENTANA_FALTANTE'], cuando: 'ABIERTA', activa: 1,
    asunto: 'URGENTE {prioridad} · {cliente} · {servicio}: {problema}',
    cuerpo: 'Hola,\n\nEscalamos un problema urgente que detectó Helios:\n\n- Qué pasa: {problema}\n- Cliente y servicio: {cliente} · {servicio}\n- Desde: {desde} (hora de Argentina), lleva {duracion}\n- Última medición: {medicion}\n- Estado: {estado}\n- Última novedad: {ultima_novedad}\n\n[Completar: qué se probó y qué se necesita]\n\nAlerta en Helios: {enlace}\n\nSaludos,\n{firma}' },
  { id: 5, nombre: 'Aviso a Comercial', sector: 'Comercial', tipos: ['VOLUMEN_ALTO', 'VOLUMEN_BAJO', 'IMPORTE_ALTO', 'IMPORTE_BAJO'], cuando: 'TODAS', activa: 1,
    asunto: '{cliente} · {servicio}: {problema}',
    cuerpo: 'Hola,\n\nLes compartimos un movimiento fuera de lo habitual en {cliente} ({servicio}) desde el {desde} (hora de Argentina): {problema}.\n\n- Última medición: {medicion}\n- Estado: {estado}\n\n[Completar: ¿hay alguna promoción, campaña o novedad del cliente que lo explique?]\n\nSaludos,\n{firma}' },
  { id: 6, nombre: 'Cierre del incidente', sector: 'Cliente', tipos: [], cuando: 'RESUELTA', activa: 1,
    asunto: 'Resuelto · {cliente} · {servicio}: {problema}',
    cuerpo: 'Hola,\n\nLes confirmamos que se normalizó el problema en {servicio} ({problema}).\n\n- Empezó: {desde} (hora de Argentina)\n- Duró: {duracion}\n- Cómo se resolvió: {resolucion}\n\n[Completar: si hace falta algo más de su lado]\n\nGracias por la colaboración.\n\nSaludos,\n{firma}' },
];

async function leerPlantillas(env) {
  let fila;
  try { fila = await env.DB.prepare('SELECT plantillas_correo AS p FROM alerta_parametros WHERE id = 1').first(); }
  catch (e) { if (/no such column/i.test(e.message)) return { plantillas: JSON.parse(JSON.stringify(PLANTILLAS_FABRICA)), falta_script: true }; throw e; }
  let o = null;
  try { o = fila && fila.p ? JSON.parse(fila.p) : null; } catch (e) { o = null; }
  if (!o || !Array.isArray(o.plantillas)) return { plantillas: JSON.parse(JSON.stringify(PLANTILLAS_FABRICA)), de_fabrica: true };
  return { plantillas: o.plantillas };
}
const plantillasActivas = async (env) => (await leerPlantillas(env)).plantillas.filter((x) => x.activa)
  .map((x) => ({ id: x.id, nombre: x.nombre, sector: x.sector || '', tipos: x.tipos || [], cuando: x.cuando || 'TODAS', asunto: x.asunto, cuerpo: x.cuerpo }));

async function adminPlantillas(env, request, yo, borrar) {
  const o = await leerPlantillas(env);
  if (request.method === 'GET') return okJson({ plantillas: o.plantillas, falta_script: !!o.falta_script });
  if (o.falta_script) return jsonError(FALTA_SCRIPT_18, 503);
  const b = await leerCuerpo(request);
  const lista = o.plantillas;
  const id = b.id == null || b.id === '' ? null : aId(b.id);
  let x = id ? lista.find((p) => p.id === id) : null;
  if (id && !x) return jsonError('Esa plantilla no existe.', 404);
  let accion, nombre;
  if (borrar) {
    if (!x) return jsonError('Esa plantilla no existe.', 404);
    if (lista.length === 1) return jsonError('Tiene que quedar al menos una plantilla.', 409);
    lista.splice(lista.indexOf(x), 1); accion = 'BORRAR_PLANTILLA_CORREO'; nombre = x.nombre;
  } else {
    nombre = opcional(b.nombre, 80);
    const sector = opcional(b.sector, 40) || '';
    const asunto = String(b.asunto || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    const cuerpo = String(b.cuerpo || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 6000);
    const cuando = PLANTILLA_CUANDO.includes(b.cuando) ? b.cuando : null;
    const tipos = Array.isArray(b.tipos) ? Array.from(new Set(b.tipos.map(String))).slice(0, 30) : [];
    if (!nombre || nombre.length < 2) return jsonError('Escribí el nombre de la plantilla (al menos 2 letras).', 400);
    if (!cuando) return jsonError('Elegí para qué alertas sirve: abiertas, resueltas o las dos.', 400);
    if (tipos.some((t) => !/^[A-Z][A-Z0-9_]{2,40}$/.test(t))) return jsonError('Hay un tipo de alerta que no existe.', 400);
    if (asunto.length < 3) return jsonError('Escribí el asunto.', 400);
    if (cuerpo.length < 3) return jsonError('Escribí el texto del correo.', 400);
    if (lista.some((p) => p.id !== id && p.nombre.toLowerCase() === nombre.toLowerCase() && (p.sector || '').toLowerCase() === sector.toLowerCase()))
      return jsonError('Ya hay una plantilla con ese nombre para ese sector.', 409);
    const activa = b.activa === 0 || b.activa === false || b.activa === '0' ? 0 : 1;
    const datos = { nombre, sector, tipos, cuando, asunto, cuerpo, activa, actualizada: new Date().toISOString().slice(0, 19) + 'Z', actualizada_por: yo.nombre };
    if (x) { Object.assign(x, datos); accion = 'EDITAR_PLANTILLA_CORREO'; }
    else {
      if (lista.length >= PLANTILLAS_MAX) return jsonError('Ya hay ' + PLANTILLAS_MAX + ' plantillas: borrá alguna antes de crear otra.', 409);
      x = Object.assign({ id: Math.max(0, ...lista.map((p) => p.id)) + 1 }, datos); lista.push(x); accion = 'ALTA_PLANTILLA_CORREO';
    }
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE alerta_parametros SET plantillas_correo = ?1 WHERE id = 1').bind(JSON.stringify({ plantillas: lista })),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, accion, nombre),
  ]);
  return okJson({ id: x ? x.id : null });
}

