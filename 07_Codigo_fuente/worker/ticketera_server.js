// =====================================================================
// TICKETERA (parche 30): detalle de cada alerta, evidencia adjunta y resolución con causa. Sin tablas nuevas.
//
//   GET  /alerta/<id>                                 página de detalle (Soporte y Analista)
//   GET  /api/alertas/<id>/detalle                    todo el problema: ventanas, conversación, evidencia, resolución
//   POST /api/alertas/<id>/adjuntos                   sube un archivo (cuerpo = el archivo; nombre en x-nombre-archivo)
//   GET  /api/alertas/<id>/adjuntos/<archivo>         descarga o muestra un archivo
//   POST /api/alertas/<id>/adjuntos/<archivo>/borrar  quien lo subió, mientras la alerta siga abierta
//   GET/POST /api/admin/catalogo-resolucion           causas y "qué se hizo" para elegir al resolver (Administrador)
//
// Dónde queda cada cosa (script 13: 3 columnas, ninguna tabla):
//   - Evidencia: solo en R2 (binding EVIDENCIA). Cada archivo va en alertas/<primera ventana del problema>/ y lleva
//     sus datos (nombre, quién, cuándo) como customMetadata; se listan por esa carpeta. En alerta_eventos queda un
//     comentario "Adjuntó el archivo «…»" para el historial de las otras pantallas.
//   - Resolución: alertas_historico.causa_resolucion y acciones_resolucion (nombres separados por " · "), en todas
//     las ventanas del problema, igual que resuelta_por y comentario.
//   - Opciones: alerta_parametros.opciones_resolucion (JSON {causas:[{id,nombre,activo}], acciones:[…]}).
// Sin R2, la evidencia va a la tabla evidencia_archivos de D1 (script 14, hasta 2 MB por archivo y 200 MB en total);
// si tampoco está esa tabla, Helios funciona igual y el botón de adjuntar avisa qué falta.
// =====================================================================
// Dónde van los archivos: R2 si el Worker tiene el binding EVIDENCIA; si no, la tabla evidencia_archivos de D1 (script 14),
// en texto base64 partido en pedazos de 90.000 caracteres (una sentencia de D1 acepta hasta 100 KB). Base64 y no BLOB porque
// D1 devuelve los BLOB como lista de números: leer 1 MB así gasta más CPU de la que da el plan gratuito (10 ms por pedido).
// Las dos opciones se usan igual (put/get/head/delete/list).
const ADJ_MAX_R2 = 10 * 1024 * 1024;              // 10 MB por archivo en R2
const ADJ_MAX_D1 = 1024 * 1024;                   // 1 MB por archivo en D1 (las capturas se achican en el navegador)
const EVIDENCIA_D1_TOTAL = 200 * 1024 * 1024;     // tope de toda la evidencia en D1 (la base entera tiene 500 MB)
const EVIDENCIA_D1_PARTE = 90000;                 // caracteres base64 por fila (múltiplo de 4)
const maxBytes = (env) => (env.EVIDENCIA ? ADJ_MAX_R2 : ADJ_MAX_D1);
const FALTA_SCRIPT_14 = 'Todavía no se puede adjuntar evidencia: falta correr 14_evidencia_d1.txt en la consola de D1 (o conectar R2 al Worker).';
function aBase64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768));
  return btoa(s);
}
function deBase64(txt) {
  const s = atob(txt), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
function almacenD1(env) {
  const fila = (x) => ({
    key: x.clave, size: x.tamano_bytes, uploaded: new Date(x.subido || 0),
    httpMetadata: { contentType: x.tipo_contenido }, customMetadata: x.metadatos ? JSON.parse(x.metadatos) : {},
  });
  return {
    async put(clave, datos, op) {
      const largo = datos.byteLength, txt = aBase64(datos);
      const pasos = [env.DB.prepare('DELETE FROM evidencia_archivos WHERE clave = ?1').bind(clave)];
      for (let i = 0, n = 0; i < Math.max(txt.length, 1); i += EVIDENCIA_D1_PARTE, n++) {
        const parte = txt.slice(i, i + EVIDENCIA_D1_PARTE);
        pasos.push(n === 0
          ? env.DB.prepare(`INSERT INTO evidencia_archivos (clave, parte, datos, tipo_contenido, metadatos, tamano_bytes, subido) VALUES (?1, 0, ?2, ?3, ?4, ?5, ?6)`)
            .bind(clave, parte, (op && op.httpMetadata && op.httpMetadata.contentType) || null, JSON.stringify((op && op.customMetadata) || {}), largo, Date.now())
          : env.DB.prepare('INSERT INTO evidencia_archivos (clave, parte, datos) VALUES (?1, ?2, ?3)').bind(clave, n, parte));
      }
      await env.DB.batch(pasos);
    },
    async head(clave) {
      const x = await env.DB.prepare('SELECT clave, tipo_contenido, metadatos, tamano_bytes, subido FROM evidencia_archivos WHERE clave = ?1 AND parte = 0').bind(clave).first();
      return x ? fila(x) : null;
    },
    async get(clave) {
      const r = (await env.DB.prepare('SELECT clave, parte, datos, tipo_contenido, metadatos, tamano_bytes, subido FROM evidencia_archivos WHERE clave = ?1 ORDER BY parte').bind(clave).all()).results;
      if (!r.length) return null;
      return Object.assign(fila(r[0]), { body: deBase64(r.map((x) => x.datos).join('')) });
    },
    async delete(clave) { await env.DB.prepare('DELETE FROM evidencia_archivos WHERE clave = ?1').bind(clave).run(); },
    async list(op) {
      const r = await env.DB.prepare(`SELECT clave, tipo_contenido, metadatos, tamano_bytes, subido FROM evidencia_archivos
                                      WHERE clave > ?1 AND clave < ?1 || '~' AND parte = 0`).bind(op.prefix).all();
      return { objects: r.results.map(fila), truncated: false };
    },
  };
}
const almacen = (env) => env.EVIDENCIA || almacenD1(env);
const ADJ_MAX_POR_ALERTA = 15;
// Solo estos tipos (nunca HTML ni SVG: el navegador los podría ejecutar). El tipo sale de la extensión, no de lo que diga el navegador.
const ADJ_TIPOS = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  json: 'application/json', har: 'application/json', zip: 'application/zip', eml: 'message/rfc822',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const ADJ_EN_LINEA = /^(image\/|application\/pdf|text\/plain)/;   // se muestran en el navegador; el resto se descarga
const ADJ_ARCHIVO = /^[A-Za-z0-9_-]{16}\.[a-z0-9]{1,5}$/;          // nombre interno en R2: 16 caracteres al azar + extensión
const MARCA_ADJUNTO = 'Adjuntó el archivo «';
// Opciones de fábrica (la lista de Ale); el script 13 las deja cargadas en alerta_parametros.opciones_resolucion
const OPCIONES_FABRICA = {
  causas: ['Falla del cliente', 'Falla nuestra', 'Proveedor o gateway', 'Comportamiento esperado (promo, feriado, campaña)', 'Falsa alarma'].map((n, i) => ({ id: i + 1, nombre: n, activo: 1 })),
  acciones: ['Se contactó al cliente', 'Se corrigió', 'Se escaló', 'No requirió acción'].map((n, i) => ({ id: i + 6, nombre: n, activo: 1 })),
};
const FALTA_SCRIPT_13 = 'Falta preparar la base para la ticketera: correr 13_ticketera_d1.txt en la consola de D1.';

// Ids de todas las ventanas del mismo problema que la alerta ?1 (misma serie y tipo; si está resuelto, misma resolución)
const GRUPO_IDS = `SELECT alerta_id FROM alertas_historico
  WHERE ${SERIE_GRUPO} = (SELECT tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, duracion_ventana_minutos FROM alertas_historico WHERE alerta_id = ?1)
    AND COALESCE(fecha_resolucion, '') = (SELECT COALESCE(fecha_resolucion, '') FROM alertas_historico WHERE alerta_id = ?1)`;

// ---------- Opciones para resolver ----------
async function leerOpciones(env) {
  let fila;
  try { fila = await env.DB.prepare('SELECT opciones_resolucion AS o FROM alerta_parametros WHERE id = 1').first(); }
  catch (e) { if (/no such column/i.test(e.message)) return { error: FALTA_SCRIPT_13 }; throw e; }
  let o = null;
  try { o = fila && fila.o ? JSON.parse(fila.o) : null; } catch (e) { o = null; }
  if (!o || !Array.isArray(o.causas) || !Array.isArray(o.acciones)) o = JSON.parse(JSON.stringify(OPCIONES_FABRICA));
  return o;
}
const accionesTxt = (lista) => lista.map((x) => x.charAt(0).toLowerCase() + x.slice(1)).join(', ');
// Lo que se antepone al comentario de la resolución, para que las otras pantallas lo lean sin cambios
function prefijoResolucion(causa, acciones) {
  const p = [];
  if (causa) p.push('Causa: ' + causa + '.');
  if (acciones && acciones.length) p.push('Se hizo: ' + accionesTxt(acciones) + '.');
  return p.join(' ');
}

// ---------- Quién es la persona frente a esta alerta ----------
// Soporte solo ve lo que tiene o tuvo asignado (ella o sus equipos) o en lo que intervino.
async function rolEnAlerta(env, yo, alertaId) {
  if (!puede(yo, 'detalle_alerta')) return { error: jsonError('Tu perfil no tiene acceso al detalle de las alertas.', 403) };
  const a = await env.DB.prepare(`SELECT alerta_id, estado, tipo_alerta, cliente_id, asignado_usuario_id, asignado_equipo_id, asignado_por
                                  FROM alertas_historico WHERE alerta_id = ?1`).bind(alertaId).first();
  if (!a) return { error: jsonError('La alerta no existe.', 404) };
  const eq = await misEquipos(env, yo.id);
  const rol = {
    a, analista: esAnalista(yo), abierta: a.estado !== 'RESUELTA',
    esMia: a.asignado_usuario_id === yo.id,
    deMiEquipo: a.asignado_equipo_id != null && eq.miembro.includes(a.asignado_equipo_id),
    loLidero: a.asignado_equipo_id != null && eq.lidero.includes(a.asignado_equipo_id),
  };
  if (!rol.analista && !rol.esMia && !rol.deMiEquipo && !rol.loLidero) {
    const intervino = await env.DB.prepare(`SELECT 1 FROM alerta_eventos WHERE usuario_id = ?2 AND alerta_id IN (${GRUPO_IDS}) LIMIT 1`).bind(alertaId, yo.id).first();
    if (!intervino) return { error: jsonError('Esa alerta no está asignada a vos ni a tu equipo.', 403) };
  }
  rol.trabaja = rol.analista || rol.esMia || rol.deMiEquipo || rol.loLidero;   // puede comentar y adjuntar
  // Carpeta de la evidencia: la primera ventana del problema (no cambia aunque se sumen ventanas)
  const rep = await env.DB.prepare(`SELECT alerta_id FROM alertas_historico WHERE alerta_id IN (${GRUPO_IDS}) ORDER BY ventana_inicio, alerta_id LIMIT 1`).bind(alertaId).first();
  rol.carpeta = 'alertas/' + (rep ? rep.alerta_id : alertaId) + '/';
  return rol;
}

// Qué botones mostrar (el servidor igual vuelve a controlar cada acción)
function botonesDe(rol, yo) {
  const a = rol.a, ab = rol.abierta, soporte = PERFILES_RECIBEN.includes(yo.perfil);
  return {
    tomar: ab && soporte && a.estado === 'ABIERTA' && (rol.esMia || (a.asignado_usuario_id == null && rol.deMiEquipo)),
    comentar: ab && rol.trabaja,
    adjuntar: ab && rol.trabaja,
    devolver: ab && soporte && (rol.esMia || (a.asignado_usuario_id == null && rol.deMiEquipo)),
    resolver: ab && (rol.analista || (rol.esMia && a.estado === 'RECONOCIDA')),
    derivar: ab && rol.analista,
    reasignar: ab && !rol.analista && rol.loLidero,
  };
}

// ---------- Evidencia en R2 ----------
const dec = (v) => { try { return decodeURIComponent(v || ''); } catch (e) { return v || ''; } };
// Devuelve null si no hay dónde guardar (ni R2 ni la tabla de D1)
async function listarAdjuntos(env, carpeta) {
  let r;
  try { r = await almacen(env).list({ prefix: carpeta, include: ['customMetadata', 'httpMetadata'] }); }
  catch (e) { if (/no such table/i.test(e.message)) return null; throw e; }
  return (r.objects || []).map((o) => {
    const m = o.customMetadata || {};
    return {
      id: o.key.slice(carpeta.length), nombre_archivo: dec(m.nombre) || o.key.slice(carpeta.length),
      tipo_contenido: (o.httpMetadata && o.httpMetadata.contentType) || 'application/octet-stream', tamano_bytes: o.size,
      fecha: m.fecha || (o.uploaded ? new Date(o.uploaded).toISOString().slice(0, 19) + 'Z' : null),
      usuario_id: m.usuario_id ? Number(m.usuario_id) : null, usuario_nombre: dec(m.usuario_nombre), descripcion: dec(m.descripcion) || null,
      _orden: Number(m.subido) || (o.uploaded ? new Date(o.uploaded).getTime() : 0),
    };
  }).sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x._orden - y._orden || (x.id < y.id ? -1 : 1)))   // mismo segundo (reloj de la demo): por la hora real de subida
    .map((x) => { delete x._orden; return x; });
}

async function detalleAlerta(env, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  const opciones = await leerOpciones(env);
  if (opciones.error) return jsonError(opciones.error, 500);
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLUMNAS_ALERTA}, h.ventana_fin, h.umbral, h.comentario, h.causa_resolucion, h.acciones_resolucion, h.cantidad_detecciones, h.ultima_deteccion
                    FROM alertas_historico h ${JOIN_NOMBRES} WHERE h.alerta_id IN (${GRUPO_IDS}) ORDER BY h.ventana_inicio DESC LIMIT 200`).bind(alertaId),
    env.DB.prepare(`SELECT e.id, e.fecha, e.alerta_id, e.accion, e.comentario, e.usuario_id, u.nombre AS usuario_nombre, ud.nombre AS destino_nombre, ed.nombre AS equipo_destino_nombre
                    FROM alerta_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id LEFT JOIN usuarios ud ON ud.id = e.usuario_destino_id LEFT JOIN equipos ed ON ed.id = e.equipo_destino_id
                    WHERE e.alerta_id IN (${GRUPO_IDS}) ORDER BY e.fecha, e.id`).bind(alertaId),
    env.DB.prepare('SELECT strftime(\'%Y-%m-%dT%H:%M:%SZ\', COALESCE(ahora, \'now\')) AS ahora, ahora AS simulado FROM alerta_parametros WHERE id = 1'),
    env.DB.prepare(Q_REGLAS_PERSONALIZADAS),
    env.DB.prepare(Q_UMBRALES_TABLERO),
  ]);
  const ventanas = r[0].results, p = r[2].results[0] || {};
  const adjuntos = await listarAdjuntos(env, rol.carpeta);
  // Resolución: causa y acciones de sus columnas; el comentario sin el texto armado que se le antepuso
  let resolucion = null;
  const u = ventanas[0];
  if (u && u.estado === 'RESUELTA' && u.motivo_resolucion === 'MANUAL') {
    const acciones = u.acciones_resolucion ? u.acciones_resolucion.split(' · ') : [];
    const pre = prefijoResolucion(u.causa_resolucion, acciones);
    let libre = u.comentario || '';
    if (pre && libre.startsWith(pre)) libre = libre.slice(pre.length).trim();
    resolucion = { fecha: u.fecha_resolucion, usuario_nombre: u.resuelta_por, causa: u.causa_resolucion || null, acciones, comentario: libre || null };
  }
  return okJson({
    ventanas, eventos: r[1].results, adjuntos: adjuntos || [], resolucion,
    causas: opciones.causas.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre })),
    acciones: opciones.acciones.filter((x) => x.activo).map((x) => ({ id: x.id, nombre: x.nombre })),
    ahora: p.ahora, reloj_simulado: !!p.simulado, reglas_personalizadas: r[3].results, umbrales: r[4].results,
    puedo: botonesDe(rol, yo), evidencia_habilitada: adjuntos !== null, adjuntos_max: ADJ_MAX_POR_ALERTA, adjunto_max_mb: maxBytes(env) / 1048576,
    tipos_permitidos: Object.keys(ADJ_TIPOS), marca_adjunto: MARCA_ADJUNTO,
  });
}

function nombreArchivoLimpio(v) {
  return dec(String(v || '')).replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f"<>|*?:«»]/g, '').trim().slice(-120);
}
// A quiénes avisar de un archivo nuevo: quien la tiene (o su equipo) y quien la derivó
async function aQuienesAvisar(env, a) {
  const q = a.asignado_usuario_id != null ? [a.asignado_usuario_id] : a.asignado_equipo_id != null ? await miembrosActivos(env, a.asignado_equipo_id) : [];
  if (a.asignado_por != null && !q.includes(a.asignado_por)) q.push(a.asignado_por);
  return q;
}
const eventoComentario = (env, yo, alertaId, txt) => env.DB.prepare(`INSERT INTO alerta_eventos (fecha, alerta_id, usuario_id, accion, comentario)
    VALUES (${AHORA_SIM}, ?1, ?2, 'COMENTAR', ?3)`).bind(alertaId, yo.id, txt);

async function subirAdjunto(env, request, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.abierta) return jsonError('La alerta ya está resuelta: no se le puede agregar evidencia.', 409);
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede adjuntar evidencia.', 403);
  const nombre = nombreArchivoLimpio(request.headers.get('x-nombre-archivo'));
  const ext = ((nombre.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '').toLowerCase();
  const tipo = ADJ_TIPOS[ext];
  if (!nombre || !tipo) return jsonError('Ese tipo de archivo no se puede adjuntar. Se aceptan: ' + Object.keys(ADJ_TIPOS).join(', ') + '.', 400);
  const largo = Number(request.headers.get('content-length') || 0);
  const max = maxBytes(env);
  if (largo > max) return jsonError('El archivo pesa más de ' + max / 1048576 + ' MB.', 413);
  const ya = await listarAdjuntos(env, rol.carpeta);
  if (ya === null) return jsonError(FALTA_SCRIPT_14, 503);
  if (ya.length >= ADJ_MAX_POR_ALERTA) return jsonError('Esta alerta ya tiene ' + ADJ_MAX_POR_ALERTA + ' archivos: borrá alguno antes de subir otro.', 409);
  const datos = await request.arrayBuffer();
  if (!datos.byteLength) return jsonError('El archivo está vacío.', 400);
  if (datos.byteLength > max) return jsonError('El archivo pesa más de ' + max / 1048576 + ' MB.', 413);
  if (!env.EVIDENCIA) {
    const t = await env.DB.prepare('SELECT COALESCE(SUM(tamano_bytes), 0) AS b FROM evidencia_archivos WHERE parte = 0').first();
    if (t && t.b + datos.byteLength > EVIDENCIA_D1_TOTAL) return jsonError('Se llenó el espacio para evidencia (' + EVIDENCIA_D1_TOTAL / 1048576 + ' MB en la base). Hay que activar R2 o borrar archivos viejos.', 507);
  }
  const descripcion = nombreArchivoLimpio(request.headers.get('x-descripcion')).slice(0, 300);
  const ahora = (await env.DB.prepare(`SELECT ${AHORA_SIM} AS f`).first()) || {};
  const archivo = aB64url(crypto.getRandomValues(new Uint8Array(12))) + '.' + ext;
  const clave = rol.carpeta + archivo;
  await almacen(env).put(clave, datos, {
    httpMetadata: { contentType: tipo },
    customMetadata: { nombre: encodeURIComponent(nombre), usuario_id: String(yo.id), usuario_nombre: encodeURIComponent(yo.nombre),
      fecha: ahora.f || new Date().toISOString().slice(0, 19) + 'Z', subido: String(Date.now()), descripcion: encodeURIComponent(descripcion), alerta_id: alertaId },
  });
  const a = rol.a;
  try {
    await env.DB.batch([
      eventoComentario(env, yo, alertaId, MARCA_ADJUNTO + nombre + '»'),
      env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'ADJUNTAR_EVIDENCIA', a.tipo_alerta + ' ' + a.cliente_id + ' (' + alertaId.slice(0, 8) + '): ' + nombre),
    ].concat(avisoStmts(env, (await aQuienesAvisar(env, a)).filter((x) => x !== yo.id), 'COMENTARIO', alertaId, yo.nombre + ' adjuntó evidencia a una alerta', nombre)));
  } catch (e) {
    await almacen(env).delete(clave).catch(() => {});
    throw e;
  }
  return okJson({ id: archivo, nombre, tamano_bytes: datos.byteLength });
}

async function verAdjunto(env, yo, alertaId, archivo) {
  if (!ADJ_ARCHIVO.test(archivo) || !ADJ_TIPOS[archivo.split('.').pop()]) return jsonError('El archivo no existe.', 404);
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  let obj;
  try { obj = await almacen(env).get(rol.carpeta + archivo); }
  catch (e) { if (/no such table/i.test(e.message)) return jsonError('El archivo no existe.', 404); throw e; }
  if (!obj) return jsonError('El archivo no existe.', 404);
  const tipo = ADJ_TIPOS[archivo.split('.').pop()];   // de la lista cerrada, nunca de lo guardado
  const nombre = dec((obj.customMetadata || {}).nombre) || archivo;
  const ascii = nombre.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(obj.body, {
    headers: {
      'content-type': tipo,
      'content-disposition': (ADJ_EN_LINEA.test(tipo) ? 'inline' : 'attachment') + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(nombre),
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  });
}

async function borrarAdjunto(env, yo, alertaId, archivo) {
  if (!ADJ_ARCHIVO.test(archivo)) return jsonError('El archivo no existe.', 404);
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  let obj;
  try { obj = await almacen(env).head(rol.carpeta + archivo); }
  catch (e) { if (/no such table/i.test(e.message)) return jsonError('El archivo no existe.', 404); throw e; }
  if (!obj) return jsonError('El archivo no existe.', 404);
  const m = obj.customMetadata || {};
  if (Number(m.usuario_id) !== yo.id) return jsonError('Solo quien subió el archivo lo puede borrar.', 403);
  if (!rol.abierta) return jsonError('La alerta ya está resuelta: su evidencia no se puede borrar.', 409);
  const nombre = dec(m.nombre) || archivo;
  await almacen(env).delete(rol.carpeta + archivo);
  await env.DB.batch([
    eventoComentario(env, yo, alertaId, 'Borró el archivo «' + nombre + '»'),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_EVIDENCIA', alertaId.slice(0, 8) + ': ' + nombre),
  ]);
  return okJson({});
}

// ---------- Resolver con causa ----------
// Causa (una) y "qué se hizo" (una o más), de las opciones activas. El texto libre es opcional si se eligieron las dos.
// Devuelve { error } o { causa, acciones, texto }; texto es el comentario de la resolución (lo ven las otras pantallas).
async function datosResolucion(env, b, comentario) {
  const causaId = b.causa_id == null || b.causa_id === '' ? null : aId(b.causa_id);
  const accIds = Array.isArray(b.acciones_ids) ? Array.from(new Set(b.acciones_ids.map(aId).filter(Boolean))).slice(0, 10) : [];
  let causa = null; const acciones = [];
  if (causaId || accIds.length) {
    const o = await leerOpciones(env);
    if (o.error) return { error: o.error };
    if (causaId) { causa = o.causas.find((x) => x.id === causaId && x.activo); if (!causa) return { error: 'Esa causa ya no está disponible. Actualizá la página.' }; }
    for (const id of accIds) { const x = o.acciones.find((c) => c.id === id && c.activo); if (!x) return { error: 'Una de las acciones ya no está disponible. Actualizá la página.' }; acciones.push(x); }
  }
  const conDetalle = comentario && comentario.length >= 3;
  if (!conDetalle && !(causa && acciones.length)) return { error: causa || acciones.length ? 'Elegí la causa y qué se hizo, o contá en el detalle qué se hizo.' : 'Contá qué se hizo para resolverla.' };
  const nombres = acciones.map((x) => x.nombre);
  const texto = [prefijoResolucion(causa && causa.nombre, nombres), conDetalle ? comentario : ''].filter(Boolean).join(' ').slice(0, 1000);
  return { causa: causa ? causa.nombre : null, acciones: nombres.length ? nombres.join(' · ') : null, texto };
}

// ---------- Opciones (Administración > Reglas de alerta) ----------
async function catalogoResolucion(env, request, yo) {
  const o = await leerOpciones(env);
  if (o.error) return jsonError(o.error, 500);
  if (request.method === 'GET') {
    // Cuántos problemas resueltos eligieron cada opción (una fila por problema, no por ventana)
    const r = await env.DB.prepare(`SELECT causa_resolucion AS c, acciones_resolucion AS a, COUNT(*) AS n FROM (
        SELECT DISTINCT tipo_alerta, ambiente, cliente_id, servicio_id, producto_id, canal_id, moneda_id, fecha_resolucion, causa_resolucion, acciones_resolucion
        FROM alertas_historico WHERE estado = 'RESUELTA' AND (causa_resolucion IS NOT NULL OR acciones_resolucion IS NOT NULL))
      GROUP BY causa_resolucion, acciones_resolucion`).all();
    const usos = (tipo, nombre) => r.results.reduce((t, x) => t + (tipo === 'CAUSA' ? (x.c === nombre ? x.n : 0) : ((x.a || '').split(' · ').includes(nombre) ? x.n : 0)), 0);
    const items = [].concat(
      o.causas.map((x, i) => ({ id: x.id, tipo: 'CAUSA', nombre: x.nombre, orden: i + 1, activo: x.activo ? 1 : 0, usos: usos('CAUSA', x.nombre) })),
      o.acciones.map((x, i) => ({ id: x.id, tipo: 'ACCION', nombre: x.nombre, orden: i + 1, activo: x.activo ? 1 : 0, usos: usos('ACCION', x.nombre) })));
    return okJson({ items });
  }
  const b = await leerCuerpo(request);
  const tipo = b.tipo === 'CAUSA' || b.tipo === 'ACCION' ? b.tipo : null;
  const nombre = opcional(b.nombre, 80);
  const id = b.id == null || b.id === '' ? null : aId(b.id);
  const activo = b.activo === 0 || b.activo === false || b.activo === '0' ? 0 : 1;
  if (!nombre || nombre.length < 2) return jsonError('Escribí el nombre (al menos 2 letras).', 400);
  if (/·/.test(nombre)) return jsonError('El nombre no puede tener el signo "·".', 400);
  let lista, x = null;
  if (id) {
    lista = o.causas.find((c) => c.id === id) ? o.causas : o.acciones.find((c) => c.id === id) ? o.acciones : null;
    if (!lista) return jsonError('Esa opción no existe.', 404);
    x = lista.find((c) => c.id === id);
  } else {
    if (!tipo) return jsonError('Elegí si es una causa o algo que se hizo.', 400);
    lista = tipo === 'CAUSA' ? o.causas : o.acciones;
  }
  if (lista.some((c) => c.id !== id && c.nombre.toLowerCase() === nombre.toLowerCase())) return jsonError('Ya existe una opción con ese nombre.', 409);
  if (x) { x.nombre = nombre; x.activo = activo; }
  else lista.push({ id: Math.max(0, ...o.causas.map((c) => c.id), ...o.acciones.map((c) => c.id)) + 1, nombre, activo: 1 });
  await env.DB.batch([
    env.DB.prepare('UPDATE alerta_parametros SET opciones_resolucion = ?1 WHERE id = 1').bind(JSON.stringify({ causas: o.causas, acciones: o.acciones })),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
      .bind(yo.id, 'EDITAR_CATALOGO_RESOLUCION', (x ? 'Cambió' : 'Agregó') + ' "' + nombre + '"' + (activo ? '' : ' (desactivada)')),
  ]);
  return okJson({});
}

async function rutasTicketera(env, request, ruta, yo) {
  const m = request.method;
  let x = ruta.match(/^\/alerta\/([0-9a-f]{32})$/);
  if (x) {
    if (m !== 'GET') return null;
    if (!puede(yo, 'detalle_alerta')) return Response.redirect(new URL(inicioDe(yo), request.url).toString(), 302);
    return new Response(ALERTA_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  x = ruta.match(/^\/api\/alertas\/([0-9a-f]{32})\/(detalle|adjuntos)(?:\/([^/]+?)(\/borrar)?)?$/);
  if (x) {
    if (x[2] === 'detalle' && !x[3] && m === 'GET') return await detalleAlerta(env, yo, x[1]);
    if (x[2] === 'adjuntos' && !x[3] && m === 'POST') return await subirAdjunto(env, request, yo, x[1]);
    if (x[2] === 'adjuntos' && x[3] && !x[4] && m === 'GET') return await verAdjunto(env, yo, x[1], x[3]);
    if (x[2] === 'adjuntos' && x[3] && x[4] && m === 'POST') return await borrarAdjunto(env, yo, x[1], x[3]);
    return null;
  }
  if (ruta === '/api/admin/catalogo-resolucion') {
    if (!puede(yo, 'admin_reglas')) return jsonError('Tu perfil no tiene permiso para esta acción.', 403);
    if (m !== 'GET' && m !== 'POST') return null;
    return await catalogoResolucion(env, request, yo);
  }
  return null;
}
