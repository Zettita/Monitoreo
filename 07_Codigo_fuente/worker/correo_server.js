// =====================================================================
// CORREO DESDE LA ALERTA (parche 39). Sin tablas nuevas: todo queda en alerta_eventos como comentario.
//
//   POST /api/alertas/<id>/correo           registra que se preparó un correo (asunto, para, cc y el texto armado)
//   POST /api/alertas/<id>/correo/envio     confirma qué pasó con ese correo: enviado tal cual, enviado con cambios
//                                           (con el texto final) o no enviado
//
// El correo lo arma la página (detalle de la alerta) y lo abre en Outlook web o de escritorio con un enlace:
// Helios no manda correos ni se conecta a Microsoft 365. Por eso no sabe si se envió: lo confirma la persona.
// Pueden hacerlo quienes trabajan la alerta (Analista; Soporte si es suya o de su equipo), abierta o resuelta.
//
// Formato de los comentarios (lo leen igual Seguimiento, el tablero y el asistente):
//   Preparó un correo «<asunto>» para a@x, b@y\n---\n<texto>
//   Envió el correo «<asunto>» sin cambios
//   Envió el correo «<asunto>» con cambios\n---\n<texto final>
//   No envió el correo «<asunto>»
// =====================================================================
const MARCA_CORREO = 'Preparó un correo «';
const MARCAS_ENVIO = { SIN_CAMBIOS: 'Envió el correo «', CON_CAMBIOS: 'Envió el correo «', NO_ENVIADO: 'No envió el correo «' };
const CORREO_SEPARADOR = '\n---\n';
const CORREO_TEXTO_MAX = 6000;
const CORREO_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

function correoDestinos(v) {
  const lista = (Array.isArray(v) ? v : String(v || '').split(/[;,\s]+/)).map((x) => String(x).trim()).filter(Boolean);
  const malos = lista.filter((x) => !CORREO_RE.test(x) || x.length > 120);
  return { lista: Array.from(new Set(lista.filter((x) => !malos.includes(x)))).slice(0, 20), malos };
}
const correoAsunto = (v) => String(v || '').replace(/[\u0000-\u001f\u007f«»]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
const correoTexto = (v) => String(v || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, CORREO_TEXTO_MAX);

async function registrarCorreo(env, request, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede preparar un correo desde Helios.', 403);
  const b = await leerCuerpo(request);
  const asunto = correoAsunto(b.asunto);
  if (asunto.length < 3) return jsonError('Escribí el asunto del correo.', 400);
  const para = correoDestinos(b.para), cc = correoDestinos(b.cc);
  if (para.malos.length || cc.malos.length) return jsonError('Revisá estas direcciones: ' + para.malos.concat(cc.malos).join(', ') + '.', 400);
  const texto = correoTexto(b.texto);
  const dest = para.lista.length ? ' para ' + para.lista.join(', ') : '';
  const copia = cc.lista.length ? ' (copia a ' + cc.lista.join(', ') + ')' : '';
  const comentario = MARCA_CORREO + asunto + '»' + dest + copia + (texto ? CORREO_SEPARADOR + texto : '');
  // Si la misma persona vuelve a abrir el mismo correo en los últimos 10 minutos, no se repite en la conversación
  const ya = await env.DB.prepare(`SELECT 1 FROM alerta_eventos WHERE alerta_id IN (${GRUPO_IDS}) AND usuario_id = ?2 AND accion = 'COMENTAR' AND comentario = ?3
                                   AND fecha >= strftime('%Y-%m-%dT%H:%M:%SZ', ${AHORA_SIM}, '-10 minutes') LIMIT 1`).bind(alertaId, yo.id, comentario).first();
  if (ya) return okJson({ repetido: true });
  const a = rol.a;
  await env.DB.batch([
    eventoComentario(env, yo, alertaId, comentario),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
      .bind(yo.id, 'PREPARAR_CORREO', a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + '): ' + asunto + dest),
  ]);
  return okJson({});
}

async function confirmarEnvioCorreo(env, request, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede confirmar el envío.', 403);
  const b = await leerCuerpo(request);
  const resultado = Object.prototype.hasOwnProperty.call(MARCAS_ENVIO, b.resultado) ? b.resultado : null;
  if (!resultado) return jsonError('Elegí qué pasó con el correo.', 400);
  const evId = aId(b.evento_id);
  const prep = evId ? await env.DB.prepare(`SELECT id, comentario FROM alerta_eventos WHERE id = ?2 AND accion = 'COMENTAR' AND alerta_id IN (${GRUPO_IDS})`).bind(alertaId, evId).first() : null;
  if (!prep || !prep.comentario || prep.comentario.indexOf(MARCA_CORREO) !== 0) return jsonError('No se encontró ese correo en la alerta. Actualizá la página.', 404);
  const asunto = prep.comentario.slice(MARCA_CORREO.length, prep.comentario.indexOf('»'));
  // Ya confirmado: las confirmaciones de un asunto se aparean en orden con los correos de ese asunto
  // (la primera confirmación es del primer correo): este es el correo número N de su asunto; está confirmado si ya hay N confirmaciones.
  const pre = MARCA_CORREO + asunto + '»', env1 = MARCAS_ENVIO.SIN_CAMBIOS + asunto + '»', env2 = MARCAS_ENVIO.NO_ENVIADO + asunto + '»';
  const c = await env.DB.prepare(`SELECT
      SUM(CASE WHEN id <= ?2 AND substr(comentario, 1, length(?3)) = ?3 THEN 1 ELSE 0 END) AS correos,
      SUM(CASE WHEN substr(comentario, 1, length(?4)) = ?4 OR comentario = ?5 THEN 1 ELSE 0 END) AS confirmados
    FROM alerta_eventos WHERE alerta_id IN (${GRUPO_IDS}) AND accion = 'COMENTAR'`).bind(alertaId, prep.id, pre, env1, env2).first();
  if (c && (c.confirmados || 0) >= (c.correos || 0)) return jsonError('Ese correo ya tiene el envío confirmado.', 409);
  let comentario;
  if (resultado === 'SIN_CAMBIOS') comentario = MARCAS_ENVIO.SIN_CAMBIOS + asunto + '» sin cambios';
  else if (resultado === 'NO_ENVIADO') comentario = MARCAS_ENVIO.NO_ENVIADO + asunto + '»';
  else {
    const texto = correoTexto(b.texto);
    if (texto.length < 3) return jsonError('Pegá el texto que se envió.', 400);
    comentario = MARCAS_ENVIO.CON_CAMBIOS + asunto + '» con cambios' + CORREO_SEPARADOR + texto;
  }
  const a = rol.a;
  await env.DB.batch([
    eventoComentario(env, yo, alertaId, comentario),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
      .bind(yo.id, 'CONFIRMAR_CORREO', a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + '): ' + asunto + ' → ' +
        ({ SIN_CAMBIOS: 'enviado sin cambios', CON_CAMBIOS: 'enviado con cambios', NO_ENVIADO: 'no enviado' })[resultado]),
  ]);
  return okJson({});
}

