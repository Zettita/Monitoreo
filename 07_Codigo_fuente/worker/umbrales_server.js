// =====================================================================
// UMBRALES CONFIGURABLES (tabla umbrales_config, solo Administrador)
//
// Cada cliente ajusta cómo se evalúan sus alertas, sin tocar código:
//   - Criticidad del servicio y objetivo de disponibilidad -> prioridad P1 a P4 y "% del día bien".
//   - Cortes de severidad: desde qué desvío una alerta es Importante o Grave.
//   - Ancho de la banda: la banda del modelo es el 100 %. 150 % la ensancha (más tolerante),
//     80 % la angosta (más sensible). Límite = esperado + factor x (límite del modelo - esperado).
//   - Volumen mínimo y gracia de llegada de los datos.
//   - Silenciar alertas en feriados (ver FERIADOS).
// Alcance: una fila general (cliente_id = servicio_id = '*') y excepciones por cliente
// ('CLI_001', '*') o por cliente y servicio ('CLI_001', 'TRANSFERENCIAS'). En las excepciones,
// NULL = hereda del nivel de arriba. Las vistas v_alertas_* y v_prealertas toman el valor
// más específico. El volumen mínimo y la gracia generales siguen en alerta_parametros.
// El modelo se usa como recomendación: GET /api/admin/umbrales/recomendacion.
// =====================================================================
const UMBRAL_CAMPOS = {
  criticidad:              { tipo: 'texto', valores: ['ALTA', 'MEDIA', 'BAJA'] },
  objetivo_disponibilidad: { min: 0.9, max: 0.99999 },
  corte_pct_alta:          { min: 0.05, max: 3 },
  corte_pct_critica:       { min: 0.05, max: 5 },
  corte_tasa_alta:         { min: 0.005, max: 0.5 },
  corte_tasa_critica:      { min: 0.005, max: 1 },
  banda_volumen:           { min: 0.5, max: 3 },
  banda_tasas:             { min: 0.5, max: 3 },
  banda_importe:           { min: 0.5, max: 3 },
  banda_latencia:          { min: 0.5, max: 3 },
  volumen_minimo:          { min: 1, max: 100000, entero: true },
  gracia_minutos:          { min: 1, max: 120, entero: true },
  silenciar_feriados:      { min: 0, max: 1, entero: true },
};
const UMBRAL_FABRICA = {
  criticidad: 'MEDIA', objetivo_disponibilidad: 0.97, corte_pct_alta: 0.25, corte_pct_critica: 0.5, corte_tasa_alta: 0.05, corte_tasa_critica: 0.15,
  banda_volumen: 1, banda_tasas: 1, banda_importe: 1, banda_latencia: 1, volumen_minimo: 20, gracia_minutos: 5, silenciar_feriados: 0,
};
const UMBRAL_TEXTO = {
  criticidad: 'Criticidad', objetivo_disponibilidad: 'Objetivo de disponibilidad', corte_pct_alta: 'Importante desde', corte_pct_critica: 'Grave desde',
  corte_tasa_alta: 'Tasas: importante desde', corte_tasa_critica: 'Tasas: grave desde', banda_volumen: 'Banda de tráfico', banda_tasas: 'Banda de tasas',
  banda_importe: 'Banda de importe', banda_latencia: 'Banda de tiempo de respuesta', volumen_minimo: 'Volumen mínimo', gracia_minutos: 'Gracia',
  silenciar_feriados: 'Silenciar alertas en feriados',
};
const Q_UMBRALES_TABLERO = `SELECT cliente_id, servicio_id, criticidad, objetivo_disponibilidad FROM umbrales_config`;

async function umbralesListar(env) {
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT c.*, u.nombre AS actualizado_por_nombre FROM umbrales_config c LEFT JOIN usuarios u ON u.id = c.actualizado_por
                    ORDER BY c.cliente_id = '*' DESC, c.cliente_id, c.servicio_id = '*' DESC, c.servicio_id`),
    env.DB.prepare('SELECT volumen_minimo, gracia_minutos FROM alerta_parametros WHERE id = 1'),
    // Clientes y servicios que tiene el modelo (último día de predicciones, por índice)
    env.DB.prepare(`SELECT DISTINCT cliente_id, servicio_id FROM core_metricas_esperadas
                    WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')
                    ORDER BY cliente_id, servicio_id`),
  ]);
  const filas = r[0].results;
  if (!filas.some((f) => f.cliente_id === '*')) throw new Error('Falta la fila general de umbrales: corran umbrales_d1_tablas.txt en la consola de D1.');
  return okJson({ filas, parametros: r[1].results[0] || {}, alcance: r[2].results, fabrica: UMBRAL_FABRICA });
}

// Qué recomienda el modelo para un alcance: cómo es hoy su banda y cuánto tardan en llegar los datos
async function umbralesRecomendacion(env, url) {
  const cli = url.searchParams.get('cliente') || null, srv = url.searchParams.get('servicio') || null;
  for (const t of [cli, srv]) if (t && !/^[A-Za-z0-9_.-]{1,40}$/.test(t)) return jsonError('Alcance inválido.', 400);
  const r = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS ventanas,
        AVG(cantidad_total_esperada) AS vol_esp, MIN(cantidad_total_esperada) AS vol_esp_min,
        AVG((cantidad_total_esperada - cantidad_total_minima) / NULLIF(cantidad_total_esperada, 0)) AS vol_abajo,
        AVG((cantidad_total_maxima - cantidad_total_esperada) / NULLIF(cantidad_total_esperada, 0)) AS vol_arriba,
        AVG(tasa_aprobacion_esperada) AS aprob_esp, AVG(tasa_aprobacion_esperada - tasa_aprobacion_minima) AS aprob_abajo,
        AVG(tasa_rechazo_esperada) AS rech_esp, AVG(tasa_rechazo_maxima - tasa_rechazo_esperada) AS rech_arriba,
        AVG(tasa_error_esperada) AS err_esp, AVG(tasa_error_maxima - tasa_error_esperada) AS err_arriba,
        AVG((importe_total_esperado - importe_total_minimo) / NULLIF(importe_total_esperado, 0)) AS imp_abajo,
        AVG((importe_total_maximo - importe_total_esperado) / NULLIF(importe_total_esperado, 0)) AS imp_arriba,
        AVG(tiempo_respuesta_esperado) AS lat_esp, AVG((tiempo_respuesta_maximo - tiempo_respuesta_esperado) / NULLIF(tiempo_respuesta_esperado, 0)) AS lat_arriba
      FROM core_metricas_esperadas
      WHERE ventana_inicio >= strftime('%Y-%m-%dT%H:%M:%fZ', (SELECT MAX(ventana_inicio) FROM core_metricas_esperadas), '-1 day')
        AND estado_prediccion = 'ACTIVA' AND (?1 IS NULL OR cliente_id = ?1) AND (?2 IS NULL OR servicio_id = ?2)`).bind(cli, srv),
    // Demora de llegada de las últimas 24 h (de las métricas que mandan los colectores por API)
    env.DB.prepare(`SELECT ROUND((julianday(fecha_recepcion) - julianday(ventana_fin)) * 1440, 1) AS demora
      FROM core_metricas_observadas
      WHERE ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now'), '-1 day') FROM alerta_parametros WHERE id = 1)
        AND origen_dato = 'API' AND fecha_recepcion IS NOT NULL AND (?1 IS NULL OR cliente_id = ?1) AND (?2 IS NULL OR servicio_id = ?2)`).bind(cli, srv),
  ]);
  const m = r[0].results[0] || {};
  const dem = r[1].results.map((x) => x.demora).filter((x) => x != null && x >= 0).sort((a, b) => a - b);
  const p95 = dem.length ? dem[Math.min(dem.length - 1, Math.floor(dem.length * 0.95))] : null;
  // Recomendaciones: la banda del modelo tal cual; gracia = demora habitual + 2 min; volumen mínimo = la mitad
  // del volumen esperado en la franja más tranquila (entre 5 y 20), para que las tasas se evalúen todo el día.
  const rec = Object.assign({}, UMBRAL_FABRICA);
  if (p95 != null) rec.gracia_minutos = Math.max(5, Math.min(120, Math.ceil(p95) + 2));
  if (m.vol_esp_min != null) rec.volumen_minimo = Math.max(5, Math.min(20, Math.round(m.vol_esp_min / 2)));
  return okJson({ modelo: m, demora_p95: p95, demoras: dem.length, recomendado: rec });
}

// Para la auditoría: como se ve en pantalla (25 %, 5 puntos, 150 %, 10 min)
function umbralTxt(k, v) {
  if (v == null) return 'como el nivel de arriba';
  if (k === 'criticidad') return v.toLowerCase();
  if (k === 'volumen_minimo') return String(v);
  if (k === 'gracia_minutos') return v + ' min';
  if (k === 'silenciar_feriados') return v ? 'sí' : 'no';
  return String(Math.round(v * 100000) / 1000).replace('.', ',') + (k.startsWith('corte_tasa') ? ' puntos' : ' %');
}

function umbralValor(campo, v) {
  if (v === null || v === undefined || v === '') return { ok: true, v: null };
  const d = UMBRAL_CAMPOS[campo];
  if (d.tipo === 'texto') return d.valores.includes(v) ? { ok: true, v } : { ok: false };
  const n = Number(v);
  if (!Number.isFinite(n) || n < d.min || n > d.max || (d.entero && !Number.isInteger(n))) return { ok: false };
  return { ok: true, v: n };
}

async function umbralesGuardar(env, request, yo) {
  const b = await leerCuerpo(request);
  const cli = b.cliente_id ? String(b.cliente_id) : '*', srv = b.servicio_id ? String(b.servicio_id) : '*';
  for (const t of [cli, srv]) if (t !== '*' && !/^[A-Za-z0-9_.-]{1,40}$/.test(t)) return jsonError('Alcance inválido.', 400);
  if (cli === '*' && srv !== '*') return jsonError('Para un servicio elegí también el cliente.', 400);
  const general = cli === '*';
  const vals = {};
  for (const k of Object.keys(UMBRAL_CAMPOS)) {
    const x = umbralValor(k, b[k]);
    if (!x.ok) return jsonError('Revisá el valor de "' + UMBRAL_TEXTO[k] + '".', 400);
    if (general && x.v === null) return jsonError('En los valores generales hay que completar todo ("' + UMBRAL_TEXTO[k] + '").', 400);
    vals[k] = x.v;
  }
  // Valores efectivos (con lo heredado) para validar que Grave sea más que Importante
  const filas = (await env.DB.prepare(`SELECT * FROM umbrales_config WHERE (cliente_id = '*' AND servicio_id = '*') OR (cliente_id = ?1 AND servicio_id = '*')`).bind(cli).all()).results;
  const g = filas.find((f) => f.cliente_id === '*') || UMBRAL_FABRICA, c = srv !== '*' ? filas.find((f) => f.cliente_id === cli) || {} : {};
  const ef = (k) => (vals[k] != null ? vals[k] : c[k] != null ? c[k] : g[k]);
  if (ef('corte_pct_critica') <= ef('corte_pct_alta')) return jsonError('"Grave" tiene que ser un desvío mayor que "Importante" (tráfico, importe y tiempo de respuesta).', 400);
  if (ef('corte_tasa_critica') <= ef('corte_tasa_alta')) return jsonError('"Grave" tiene que ser un desvío mayor que "Importante" (tasas).', 400);
  const previo = await env.DB.prepare('SELECT * FROM umbrales_config WHERE cliente_id = ?1 AND servicio_id = ?2').bind(cli, srv).first();
  const cols = Object.keys(UMBRAL_CAMPOS).filter((k) => !(general && (k === 'volumen_minimo' || k === 'gracia_minutos')));
  const pasos = [
    env.DB.prepare(`INSERT INTO umbrales_config (cliente_id, servicio_id, ${cols.join(', ')}, actualizado, actualizado_por)
                    VALUES (?1, ?2, ${cols.map((_, i) => '?' + (i + 3)).join(', ')}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?${cols.length + 3})
                    ON CONFLICT (cliente_id, servicio_id) DO UPDATE SET ${cols.map((k) => k + ' = excluded.' + k).join(', ')},
                    actualizado = excluded.actualizado, actualizado_por = excluded.actualizado_por`)
      .bind(cli, srv, ...cols.map((k) => vals[k]), yo.id),
  ];
  // Los generales de volumen mínimo y gracia viven en alerta_parametros (los usan también otras consultas)
  if (general) pasos.push(env.DB.prepare('UPDATE alerta_parametros SET volumen_minimo = ?1, gracia_minutos = ?2 WHERE id = 1').bind(vals.volumen_minimo, vals.gracia_minutos));
  const alcance = general ? 'General' : cli + (srv !== '*' ? ' / ' + srv : '');
  const cambios = cols.filter((k) => (previo ? previo[k] !== vals[k] : vals[k] != null)).map((k) => UMBRAL_TEXTO[k] + ' ' + umbralTxt(k, vals[k]));
  if (general) {
    const prm = await env.DB.prepare('SELECT volumen_minimo, gracia_minutos FROM alerta_parametros WHERE id = 1').first() || {};
    for (const k of ['volumen_minimo', 'gracia_minutos']) if (prm[k] !== vals[k]) cambios.push(UMBRAL_TEXTO[k] + ' ' + umbralTxt(k, vals[k]));
  }
  pasos.push(env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)')
    .bind(yo.id, previo ? 'EDITAR_UMBRALES' : 'ALTA_UMBRALES', (alcance + ': ' + (cambios.join(', ') || 'sin cambios')).slice(0, 500)));
  pasos.push(env.DB.prepare(MARCAR_TABLERO));
  await env.DB.batch(pasos);
  return okJson({});
}

async function umbralesBorrar(env, request, yo) {
  const b = await leerCuerpo(request);
  const cli = String(b.cliente_id || ''), srv = b.servicio_id ? String(b.servicio_id) : '*';
  if (!cli || cli === '*') return jsonError('Los valores generales no se pueden borrar.', 400);
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM umbrales_config WHERE cliente_id = ?1 AND servicio_id = ?2').bind(cli, srv),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_UMBRALES', cli + (srv !== '*' ? ' / ' + srv : '')),
    env.DB.prepare(MARCAR_TABLERO),
  ]);
  if (!r[0].meta.changes) return jsonError('Esa excepción ya no existe.', 404);
  return okJson({});
}

async function rutasUmbrales(env, request, p, url, yo) {
  const m = request.method;
  if (m === 'GET' && p === '/umbrales') return await umbralesListar(env);
  if (m === 'GET' && p === '/umbrales/recomendacion') return await umbralesRecomendacion(env, url);
  if (m === 'POST' && p === '/umbrales') return await umbralesGuardar(env, request, yo);
  if (m === 'POST' && p === '/umbrales/borrar') return await umbralesBorrar(env, request, yo);
  return null;
}
