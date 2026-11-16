# Parche 37 (etapa 3): revisión incremental. Cada revisión mira solo lo que llegó desde la anterior.
#
#   Antes: cada revisión (escena de la demo, cron) recorría las últimas 25 h de métricas (~6.500 filas) y, al abrir el
#   tablero, el caché recalculaba series de 25 h y pre-alertas de 49 h (~8.000 filas más).
#
#   Ahora, con la marca de agua alerta_parametros.revisado_hasta (hasta qué hora ya se revisó) y el índice
#   ix_observadas_recepcion (fecha_recepcion), en modo incremental:
#     - Reglas del sistema: solo las ventanas de los datos recibidos desde la marca (fecha_recepcion > marca).
#     - "Dejaron de llegar datos": solo las ventanas de las últimas 2,5 h desde la marca (gracia máxima: 120 min).
#     - Reglas personalizadas (N ventanas seguidas): ventanas desde 4 h antes de la marca.
#     - Cerrar normalizadas: solo alertas de series que recibieron datos nuevos.
#     - Cerrar "desaparecidas": solo en las ventanas que recibieron datos nuevos (dato corregido o dato tardío que
#       cierra un "dejaron de llegar datos"). Un cambio de umbrales, reglas o feriados no cierra nada hacia atrás:
#       para eso está "Recalcular últimas 24 h" (Administrador).
#     - Caché del tablero: se actualiza en la misma revisión (series: igual que antes; pre-alertas: solo episodios
#       recientes, recalculados con las últimas 6 h desde la marca); el tablero ya no recalcula al abrirse.
#   La revisión completa (como hasta ahora) queda para: sin marca, reloj que volvió atrás (Preparar demo), marca de
#   hace más de 24 h, falta el índice, "Recalcular últimas 24 h" y la ruta de pruebas /api/procesar.
#   Además, CERRAR_NORMALIZADAS usa el índice de la serie (antes recorría toda la historia de la serie por julianday).
#   Necesita el script 15 (índice + columna). Sin él, todo sigue en modo completo, como antes.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


INCREMENTAL_JS = r"""

// =====================================================================
// REVISIÓN INCREMENTAL (parche 37, etapa 3)
// Variantes de las consultas del motor que miran solo lo recibido desde la marca de agua
// (alerta_parametros.revisado_hasta). Se arman a partir de las consultas completas, así no se separan:
// si una de las piezas no se encuentra, el Worker falla al arrancar (y las pruebas lo detectan).
// =====================================================================
function incReemplazar(txt, a, b, nombre) {
  if (!txt.includes(a)) throw new Error('Revisión incremental: no se encontró "' + nombre + '" en el SQL del motor.');
  return txt.split(a).join(b);
}
// Solape de 2 minutos: un dato que se recibió justo mientras corría la revisión anterior se vuelve a mirar
// (volver a revisar una ventana no cambia nada: el registro es idempotente)
const INC_MARCA = `(SELECT COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', revisado_hasta, '-2 minutes'), '') FROM alerta_parametros WHERE id = 1)`;
const INC_AHORA = `(SELECT strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)`;
// Hay datos nuevos (recibidos desde la marca) de la serie de la fila t
const incNuevosDeLaSerie = (t) => `EXISTS (SELECT 1 FROM core_metricas_observadas n INDEXED BY ix_observadas_recepcion
    WHERE n.fecha_recepcion > ${INC_MARCA} AND n.fecha_recepcion <= ${INC_AHORA}
      AND n.ambiente = ${t}.ambiente AND n.cliente_id = ${t}.cliente_id AND n.servicio_id = ${t}.servicio_id
      AND n.producto_id = ${t}.producto_id AND n.canal_id = ${t}.canal_id AND n.moneda_id = ${t}.moneda_id
      AND n.duracion_ventana_minutos = ${t}.duracion_ventana_minutos`;

// 1. Reglas del sistema: solo las ventanas de los datos recibidos desde la marca
const SQL_ALERTAS_OBSERVADAS_INC = incReemplazar(incReemplazar(SQL_ALERTAS_OBSERVADAS,
  'FROM prm CROSS JOIN core_metricas_observadas o LEFT JOIN feriados fp',
  'FROM prm CROSS JOIN core_metricas_observadas o INDEXED BY ix_observadas_recepcion LEFT JOIN feriados fp', 'observadas: FROM'),
  'WHERE o.ventana_inicio >= prm.desde_txt AND o.ventana_inicio < prm.hasta_txt ),',
  `WHERE o.fecha_recepcion > ${INC_MARCA} AND o.fecha_recepcion <= prm.hasta_txt AND o.ventana_inicio >= prm.desde_txt AND o.ventana_inicio < prm.hasta_txt ),`,
  'observadas: WHERE');
const REGISTRAR_INC = REGISTRAR.replace('FROM (' + SQL_ALERTAS_OBSERVADAS + ') a', () => 'FROM (' + SQL_ALERTAS_OBSERVADAS_INC + ') a');

// 2. Dejaron de llegar datos: ventanas desde 2,5 h antes de la marca (la gracia puede ser de hasta 120 min)
const SQL_ALERTAS_FALTANTES_INC = incReemplazar(incReemplazar(SQL_ALERTAS_FALTANTES,
  "CAST(strftime('%s', COALESCE(ahora, 'now')) AS INTEGER) AS ahora_s,",
  "CAST(strftime('%s', COALESCE(ahora, 'now')) AS INTEGER) AS ahora_s, CAST(strftime('%s', COALESCE(revisado_hasta, '1970-01-01T00:00:00Z')) AS INTEGER) AS marca_s,",
  'faltantes: prm'),
  'SELECT (ahora_s - (horizonte_horas + 1) * 3600) / 900 * 900 AS x FROM prm',
  'SELECT MAX(ahora_s - (horizonte_horas + 1) * 3600, marca_s - 9000) / 900 * 900 AS x FROM prm', 'faltantes: ventanas');
const REGISTRAR_FALTANTES_INC = REGISTRAR.replace('FROM (' + SQL_ALERTAS_OBSERVADAS + ') a', () => 'FROM (' + SQL_ALERTAS_FALTANTES_INC + ') a');

// 3. Reglas personalizadas (hasta 8 ventanas seguidas = 2 h): ventanas desde 4 h antes de la marca
const REGISTRAR_PERSONALIZADAS_INC = incReemplazar(REGISTRAR_PERSONALIZADAS_SQL,
  "strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now'), '-' || (horizonte_horas + 1) || ' hours') AS desde_txt",
  "MAX(strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now'), '-' || (horizonte_horas + 1) || ' hours'), strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(revisado_hasta, '1970-01-01T00:00:00Z'), '-240 minutes')) AS desde_txt",
  'personalizadas: desde');

// 4. Cerrar normalizadas: solo alertas de series con datos nuevos (una alerta solo se normaliza si llega una ventana)
const CERRAR_NORMALIZADAS_INC = incReemplazar(CERRAR_NORMALIZADAS,
  "WHERE estado IN ('ABIERTA', 'RECONOCIDA')\n  AND EXISTS (",
  "WHERE estado IN ('ABIERTA', 'RECONOCIDA')\n  AND " + incNuevosDeLaSerie('alertas_historico') + ")\n  AND EXISTS (", 'normalizadas: WHERE');

// 5. Cerrar "desaparecidas": solo en las ventanas que recibieron datos nuevos y no volvieron a dar la alerta
const CERRAR_DESAPARECIDAS_INC = `
UPDATE alertas_historico
SET estado            = 'RESUELTA',
    motivo_resolucion = 'CONDICION_DESAPARECIDA',
    resuelta_por      = 'SISTEMA',
    fecha_resolucion  = (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) FROM alerta_parametros WHERE id = 1)
WHERE estado IN ('ABIERTA', 'RECONOCIDA')
  -- no se volvió a detectar en esta revisión: su última detección es de la revisión anterior o de antes (la marca)
  AND ultima_deteccion <= (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', revisado_hasta) FROM alerta_parametros WHERE id = 1)
  AND julianday(ventana_fin) > (SELECT julianday(COALESCE(ahora, 'now')) - horizonte_horas / 24.0 FROM alerta_parametros WHERE id = 1)
  AND ${incNuevosDeLaSerie('alertas_historico')}
        AND strftime('%Y-%m-%dT%H:%M:%SZ', n.ventana_inicio) = alertas_historico.ventana_inicio)
`;

// 6. Caché del tablero en la misma revisión. Pre-alertas: se recalculan con las últimas 6 h desde la marca y se
//    reemplazan los episodios que terminaron en las últimas 4 h desde la marca (los anteriores ya no cambian);
//    se borran los de más de 49 h, como en el cálculo completo.
const SQL_PREALERTAS_INC = incReemplazar(SQL_PREALERTAS,
  "o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-49 hours') FROM alerta_parametros WHERE id = 1)",
  "o.ventana_inicio >= (SELECT MAX(strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-49 hours'), strftime('%Y-%m-%dT%H:%M:%S', COALESCE(revisado_hasta, '1970-01-01T00:00:00Z'), '-6 hours')) FROM alerta_parametros WHERE id = 1)",
  'pre-alertas: desde');
const INC_DESDE_EPISODIOS = `(SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(revisado_hasta, '1970-01-01T00:00:00Z'), '-4 hours') FROM alerta_parametros WHERE id = 1)`;
const Q_PREALERTAS_BORRAR_INC = `DELETE FROM prealertas_estado
  WHERE ultima_ventana >= ${INC_DESDE_EPISODIOS}
     OR ultima_ventana < (SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now'), '-49 hours') FROM alerta_parametros WHERE id = 1)`;
const Q_PREALERTAS_CALCULO_INC = Q_PREALERTAS_CALCULO.replace('FROM (' + SQL_PREALERTAS + ')',
  () => 'FROM (' + SQL_PREALERTAS_INC + ') x WHERE x.ultima_ventana >= ' + INC_DESDE_EPISODIOS);
const CACHE_AL_DIA = `UPDATE tablero_cache SET revision = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), calculado = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1`;
const GUARDAR_MARCA = `UPDATE alerta_parametros SET revisado_hasta = strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now')) WHERE id = 1`;
if (REGISTRAR_INC === REGISTRAR || REGISTRAR_FALTANTES_INC === REGISTRAR_FALTANTES || Q_PREALERTAS_CALCULO_INC === Q_PREALERTAS_CALCULO) {
  throw new Error('Revisión incremental: no se pudieron armar las consultas incrementales a partir de las completas.');
}

// ¿Completa o incremental? Completa si: se pide (Recalcular, pruebas), no hay marca, el reloj volvió atrás
// (Preparar demo), la marca tiene más de 24 h (horizonte), o falta el script 15 (sin índice o sin columna).
async function modoRevision(env, opciones) {
  let p;
  try {
    p = await env.DB.prepare(`SELECT revisado_hasta, strftime('%Y-%m-%dT%H:%M:%fZ', COALESCE(ahora, 'now')) AS ahora_txt, horizonte_horas,
                                (SELECT revision IS calculado FROM tablero_cache WHERE id = 1) AS cache_al_dia,
                                (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'ix_observadas_recepcion') AS hay_indice
                              FROM alerta_parametros WHERE id = 1`).first();
  } catch (e) {
    if (/no such column/i.test(e.message)) return { completa: true, conMarca: false, motivo: 'falta el script 15' };
    throw e;
  }
  if (!p) return { completa: true, conMarca: false, motivo: 'sin parámetros' };
  const forzada = !!(opciones && opciones.completa) || env.FORZAR_REVISION_COMPLETA === '1';
  const m = Date.parse(p.revisado_hasta || ''), a = Date.parse(p.ahora_txt);
  let motivo = null;
  if (forzada) motivo = 'pedida';
  else if (!p.hay_indice) motivo = 'falta el índice del script 15';
  else if (!p.revisado_hasta || isNaN(m)) motivo = 'primera revisión';
  else if (m > a) motivo = 'el reloj volvió atrás';
  else if (a - m > (p.horizonte_horas || 24) * 3600e3) motivo = 'la última revisión fue hace más de ' + (p.horizonte_horas || 24) + ' h';
  return { completa: !!motivo, conMarca: true, cacheAlDia: !!p.cache_al_dia, motivo };
}
"""

PROCESAR_NUEVO = """async function procesarAlertas(env, opciones = {}) {
  if (!env.DB) {
    throw new Error(
      'No se encontró la base D1. En la configuración del Worker agreguen un binding ' +
      'de D1 con el nombre de variable "DB" (en mayúsculas) apuntando a su base.'
    );
  }
  try {
    // Alertas con dueño antes de revisar: si se cierran solas, se le avisa a la persona
    const antes = await asignadasAbiertas(env);
    // Revisión completa (las últimas 24 h, como antes del parche 37) o incremental (solo lo recibido desde la marca)
    const modo = await modoRevision(env, opciones);
    const p = (sql) => env.DB.prepare(sql);
    const lote = modo.completa
      ? [p(REGISTRAR), p(REGISTRAR_FALTANTES), p(REGISTRAR_PERSONALIZADAS_SQL), p(HEREDAR_ASIGNACION), p(CERRAR_NORMALIZADAS), p(CERRAR_DESAPARECIDAS), p(MARCAR_TABLERO)]
      : [p(REGISTRAR_INC), p(REGISTRAR_FALTANTES_INC), p(REGISTRAR_PERSONALIZADAS_INC), p(HEREDAR_ASIGNACION), p(CERRAR_NORMALIZADAS_INC), p(CERRAR_DESAPARECIDAS_INC)]
        // Caché del tablero en la misma revisión: incremental si estaba al día; si no, completo (una vez)
        .concat(modo.cacheAlDia
          ? [p('DELETE FROM series_estado'), p(Q_SERIES_CALCULO), p(Q_PREALERTAS_BORRAR_INC), p(Q_PREALERTAS_CALCULO_INC), p(CACHE_AL_DIA)]
          : [p('DELETE FROM series_estado'), p(Q_SERIES_CALCULO), p('DELETE FROM prealertas_estado'), p(Q_PREALERTAS_CALCULO), p(CACHE_AL_DIA)]);
    if (modo.conMarca) lote.push(p(GUARDAR_MARCA));
    const r = await env.DB.batch(lote);
    const [registrar, faltantes, personalizadas, , normalizadas, desaparecidas] = r;
    // Derivación automática de lo que quedó sin asignar y avisos de la campanita
    const post = await derivarYAvisar(env, antes);
    return {
      ok: true,
      modo: modo.completa ? 'completa' : 'incremental',
      motivo_completa: modo.motivo || undefined,
      derivadas_automaticamente: post.derivadas_automaticamente,
      registradas_o_actualizadas: registrar.meta.changes + faltantes.meta.changes + personalizadas.meta.changes,
      resueltas: normalizadas.meta.changes + desaparecidas.meta.changes,
      filas_leidas: r.reduce((t, x) => t + ((x.meta && x.meta.rows_read) || 0), 0),
      filas_escritas: r.reduce((t, x) => t + ((x.meta && x.meta.rows_written) || 0), 0),
    };
  } catch (err) {
    throw new Error('Error en el proceso de alertas: ' + explicar(err));
  }
}
"""

RECALCULAR_HTML = """    <div class="cab-seccion" id="recalcular">
      <div><h2>Recalcular las últimas 24 horas</h2><p class="bajada">Helios revisa solo lo que va llegando. Un cambio de umbrales, reglas de alerta o feriados vale para lo que llegue después; para aplicarlo también a las últimas 24 horas, recalculá. Lee bastante más de la base que una revisión normal: usalo solo después de un cambio.</p></div>
      <button class="btn" id="btn-recalcular">Recalcular 24 h</button>
    </div>
"""
RECALCULAR_JS = """  // Recalcular las últimas 24 horas (parche 37): revisión completa, solo Administrador
  (function () {
    var b = document.getElementById('btn-recalcular'); if (!b) return;
    b.addEventListener('click', function () {
      if (!confirm('¿Recalcular las alertas de las últimas 24 horas con la configuración actual? Puede cerrar o cambiar la gravedad de alertas abiertas.')) return;
      b.disabled = true; b.textContent = 'Recalculando…';
      pedir('/api/admin/recalcular', {}).then(function (r) {
        toast('Listo: ' + r.registradas_o_actualizadas + ' alertas registradas o actualizadas y ' + r.resueltas + ' cerradas.');
      }).catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; b.textContent = 'Recalcular 24 h'; });
    });
  })();
"""


def admin(h):
    h = _rep(h, '      </ol>\n    </div>\n  </section>\n\n  <!-- MODELO -->',
             '      </ol>\n    </div>\n' + RECALCULAR_HTML + '  </section>\n\n  <!-- MODELO -->')
    h = _rep(h, '  // Causas y acciones para resolver (parche 30)\n', RECALCULAR_JS + '  // Causas y acciones para resolver (parche 30)\n')
    # Los cambios ya no se aplican solos hacia atrás
    assert h.count('Vale desde la próxima revisión de alertas.') >= 1
    h = h.replace('Vale desde la próxima revisión de alertas.', 'Vale para lo que llegue desde ahora (para las últimas 24 h: "Recalcular 24 h", al final de Umbrales).')
    return h


def aplicar(s):
    # Normalizadas: usar el índice de la serie (antes julianday recorría toda la historia de la serie). Mismo resultado.
    s = _rep(s, "AND julianday(o.ventana_inicio) > julianday(alertas_historico.ventana_inicio)",
             "AND julianday(o.ventana_inicio) > julianday(alertas_historico.ventana_inicio)\n          AND strftime('%Y-%m-%dT%H:%M:%S', o.ventana_inicio) > substr(alertas_historico.ventana_inicio, 1, 19)", n=2)
    # Variantes incrementales, después de la última consulta del motor que usan
    a = "const REGISTRAR_PERSONALIZADAS_SQL = REGISTRAR_PERSONALIZADAS + REGISTRAR.slice(REGISTRAR.indexOf('ON CONFLICT ('));\n"
    s = _rep(s, a, a + INCREMENTAL_JS)
    # procesarAlertas con los dos modos
    i = s.index('async function procesarAlertas(env) {'); j = s.index('\n// Mensaje de error legible', i)
    s = s[:i] + PROCESAR_NUEVO + s[j:]
    # La ruta de pruebas siempre hace la revisión completa
    s = _rep(s, "      if (env.PERMITIR_REVISION_MANUAL === '1' && request.method === 'POST' && ruta === '/api/procesar') {\n        const r = await procesarAlertas(env);",
             "      if (env.PERMITIR_REVISION_MANUAL === '1' && request.method === 'POST' && ruta === '/api/procesar') {\n"
             "        // Completa, salvo ?incremental=1 (para probar la revisión incremental como la haría el cron)\n"
             "        const r = await procesarAlertas(env, { completa: url.searchParams.get('incremental') !== '1' });")
    # Recalcular últimas 24 h (Administrador)
    s = _rep(s, '      // Ticketera: detalle de una alerta, evidencia y catálogo de resolución (controla sus propios permisos)\n',
             "      // Recalcular las últimas 24 h (parche 37): revisión completa, solo Administrador\n"
             "      if (ruta === '/api/admin/recalcular' && request.method === 'POST') {\n"
             "        if (!puede(yo, 'admin_umbrales')) return jsonError('Solo el Administrador puede recalcular.', 403);\n"
             "        const r = await procesarAlertas(env, { completa: true });\n"
             "        await auditar(env, yo.id, 'RECALCULAR_24H', r.registradas_o_actualizadas + ' registradas o actualizadas, ' + r.resueltas + ' cerradas');\n"
             "        return okJson(r);\n"
             "      }\n"
             '      // Ticketera: detalle de una alerta, evidencia y catálogo de resolución (controla sus propios permisos)\n')
    s = _html(s, 'ADMIN_HTML', admin)
    return s
