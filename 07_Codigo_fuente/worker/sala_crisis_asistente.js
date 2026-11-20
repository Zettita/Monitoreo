// ---------- Asistente dentro de la sala de crisis (parche 69) ----------
// Herramientas de solo lectura (permiso sala_crisis y, además, la misma regla de la sala: Soporte solo donde tiene tareas):
//   estado_incidente · tareas_incidente · guia_diagnostico
// Propuestas (nunca ejecuta): asignar_tarea, escalar y comunicar, solo para quien dirige la sala (sala_crisis_dirigir).
// La página de la sala manda incidente_id con cada pregunta y muestra sus propias preguntas sugeridas.
const salaIdArg = { incidente_id: { type: 'integer', description: 'Número del incidente (el de IM-N)' } };
async function salaRolAsist(env, yo, args) {
  const id = aId(args && args.incidente_id);
  if (!id) return { error: { error: 'Falta el número del incidente.' } };
  const rol = await rolEnIncidente(env, yo, id);
  if (rol.error) return { error: { error: 'Esa sala de crisis no está disponible para tu perfil.' } };
  return rol;
}
const salaAhoraMs = async (env) => Date.parse((await env.DB.prepare('SELECT ' + AHORA_SIM + ' AS a').first()).a);
const salaHace = (ahora, iso) => iso ? asistMinutos(Math.max(0, Math.round((ahora - Date.parse(iso)) / 60000))) : null;

Object.assign(ASIST_HERRAMIENTAS, {
  estado_incidente: {
    permiso: 'sala_crisis', soloSala: true,   // se le ofrece al modelo solo si la pregunta se hace dentro de una sala
    descripcion: 'Estado de una sala de crisis: qué pasa, desde cuándo, quién la dirige, qué alertas agrupa y los últimos hechos de su línea de tiempo.',
    parametros: salaIdArg, requeridos: ['incidente_id'],
    async ejecutar(env, yo, args) {
      const rol = await salaRolAsist(env, yo, args); if (rol.error) return rol.error;
      const inc = rol.inc, ahora = await salaAhoraMs(env);
      const r = await env.DB.batch([
        env.DB.prepare(`SELECT ia.tipo_alerta, ia.cliente_id, ia.servicio_id, ia.canal_id, h.estado, h.severidad_maxima FROM incidente_alertas ia
          LEFT JOIN alertas_historico h ON h.alerta_id = ia.alerta_id WHERE ia.incidente_id = ?1 ORDER BY ia.sumada LIMIT ${IM_MAX_ALERTAS}`).bind(inc.id),
        env.DB.prepare(`SELECT l.fecha, l.tipo, l.texto, u.nombre FROM incidente_linea_tiempo l LEFT JOIN usuarios u ON u.id = l.usuario_id
          WHERE l.incidente_id = ?1 ORDER BY l.fecha DESC, l.id DESC LIMIT 8`).bind(inc.id),
        env.DB.prepare('SELECT nombre FROM usuarios WHERE id = ?1').bind(inc.responsable_usuario_id || 0),
        env.DB.prepare(`SELECT estado, COUNT(*) AS n FROM incidente_tareas WHERE incidente_id = ?1 GROUP BY estado`).bind(inc.id),
      ]);
      const t = {}; for (const x of r[3].results) t[x.estado] = x.n;
      return {
        sala: imCodigo(inc.id) + ' · ' + inc.titulo,
        estado: IM_ESTADO_TXT[inc.estado] + (inc.estado === 'CERRADO' && inc.causa_raiz ? ' (causa raíz: ' + inc.causa_raiz + ')' : ''),
        gravedad: ASIST_SEV[inc.severidad] || inc.severidad,
        afecta: [inc.cliente_id || 'varios clientes', inc.servicio_id ? ASIST_SERVICIO[inc.servicio_id] || inc.servicio_id : null].filter(Boolean).join(', '),
        problema_desde: asistFecha(inc.inicio) + ' (hace ' + salaHace(ahora, inc.inicio) + ')',
        sala_abierta_a_las: asistHora(inc.abierto), mitigado_a_las: inc.mitigado ? asistHora(inc.mitigado) : undefined,
        dirige: (r[2].results[0] || {}).nombre || 'sin responsable',
        alertas: r[0].results.map((a) => (ASIST_FRASE[a.tipo_alerta] || a.tipo_alerta) + ' en ' + asistDonde(a) + ' (' + (ASIST_SEV[a.severidad_maxima] || '') +
          ', ' + (a.estado === 'RESUELTA' ? 'ya resuelta' : 'sigue abierta') + ')'),
        tareas: (t.PENDIENTE || 0) + ' pendientes, ' + (t.EN_CURSO || 0) + ' en curso, ' + (t.HECHA || 0) + ' hechas',
        ultimos_hechos: r[1].results.map((l) => asistHora(l.fecha) + ' ' + (l.nombre ? l.nombre + ': ' : '') + l.texto),
      };
    },
  },
  tareas_incidente: {
    permiso: 'sala_crisis', soloSala: true,   // se le ofrece al modelo solo si la pregunta se hace dentro de una sala
    descripcion: 'Tareas de una sala de crisis: quién hace qué, en qué estado, cuánto llevan, cuáles están demoradas y qué encontraron las que ya se hicieron.',
    parametros: salaIdArg, requeridos: ['incidente_id'],
    async ejecutar(env, yo, args) {
      const rol = await salaRolAsist(env, yo, args); if (rol.error) return rol.error;
      const inc = rol.inc, ahora = await salaAhoraMs(env);
      const r = await env.DB.batch([
        env.DB.prepare(`SELECT t.id, t.titulo, t.estado, t.resultado, t.creada, t.actualizada, t.vence, t.componente_id, u.nombre AS persona, e.nombre AS equipo
          FROM incidente_tareas t LEFT JOIN usuarios u ON u.id = t.responsable_usuario_id LEFT JOIN equipos e ON e.id = t.equipo_id
          WHERE t.incidente_id = ?1 ORDER BY t.id LIMIT ${IM_MAX_TAREAS}`).bind(inc.id),
        rol.dirige ? env.DB.prepare(`SELECT u.id, u.nombre, (SELECT COUNT(*) FROM incidente_tareas t WHERE t.responsable_usuario_id = u.id AND t.estado IN ('PENDIENTE', 'EN_CURSO')) AS tareas_abiertas
          FROM usuarios u WHERE u.activo = 1 AND u.perfil = 'SOPORTE' ORDER BY tareas_abiertas, u.nombre LIMIT 20`) : env.DB.prepare('SELECT 1 AS x LIMIT 0'),
        rol.dirige ? env.DB.prepare('SELECT id, nombre FROM equipos WHERE activo = 1 ORDER BY nombre LIMIT 20') : env.DB.prepare('SELECT 1 AS x LIMIT 0'),
      ]);
      // Demorada: pendiente hace más de 20 min, en curso hace más de 60 min, o pasada su hora límite
      const quien = (t) => [t.persona, t.equipo ? 'equipo ' + t.equipo : null].filter(Boolean).join(' · ') || 'sin responsable';
      const frase = (t) => '«' + t.titulo + '» → ' + quien(t) + ' (' + TAREA_ESTADO_TXT[t.estado].toLowerCase() + (t.estado === 'PENDIENTE' || t.estado === 'EN_CURSO' ? ' hace ' + salaHace(ahora, t.actualizada) : '') + ')';
      const demorada = (t) => (t.estado === 'PENDIENTE' && ahora - Date.parse(t.actualizada) > 20 * 60000) || (t.estado === 'EN_CURSO' && ahora - Date.parse(t.actualizada) > 60 * 60000)
        || ((t.estado === 'PENDIENTE' || t.estado === 'EN_CURSO') && t.vence && Date.parse(t.vence) < ahora);
      const ts = r[0].results;
      const abiertas = ts.filter((t) => t.estado === 'PENDIENTE' || t.estado === 'EN_CURSO');
      const out = {
        cuantas: { pendientes: ts.filter((t) => t.estado === 'PENDIENTE').length, en_curso: ts.filter((t) => t.estado === 'EN_CURSO').length,
          hechas: ts.filter((t) => t.estado === 'HECHA').length, demoradas: abiertas.filter(demorada).length },
        abiertas: abiertas.map((t) => frase(t) + (demorada(t) ? ' — DEMORADA' : '')),
        hechas: ts.filter((t) => t.estado === 'HECHA').map((t) => frase(t) + (t.resultado ? ': ' + t.resultado : '')),
        componentes_ya_revisados_o_en_revision: ts.filter((t) => t.estado !== 'CANCELADA').map((t) => t.componente_id).filter(Boolean),
      };
      if (rol.dirige) out.opciones_asignacion = { personas_soporte: r[1].results.map((p) => ({ usuario_id: p.id, nombre: p.nombre, tareas_abiertas: p.tareas_abiertas })),
        equipos: r[2].results.map((e) => ({ equipo_id: e.id, nombre: e.nombre })) };
      return out;
    },
  },
  guia_diagnostico: {
    permiso: 'sala_crisis', soloSala: true,   // se le ofrece al modelo solo si la pregunta se hace dentro de una sala
    descripcion: 'Guía de diagnóstico de una sala de crisis: de qué componentes depende el servicio afectado, qué revisar en cada uno, quién lo atiende, y los incidentes parecidos ya cerrados con su causa raíz.',
    parametros: salaIdArg, requeridos: ['incidente_id'],
    async ejecutar(env, yo, args) {
      const rol = await salaRolAsist(env, yo, args); if (rol.error) return rol.error;
      const g = await guiaDiagnostico(env, rol.inc);
      return {
        componentes: g.componentes.map((c) => ({ componente_id: c.id, componente: c.nombre, lo_atiende: c.area || undefined, que_revisar: c.que_revisar || undefined,
          depende_de: c.depende_de.length ? c.depende_de.map((d) => d.nombre + (d.que_revisar ? ' (revisar: ' + d.que_revisar + ')' : '')) : undefined })),
        antecedentes: g.antecedentes.map((a) => imCodigo(a.id) + ' (' + asistFecha(a.inicio).slice(0, 5) + ', ' + a.cliente_id + '): ' + a.titulo + '. Causa raíz: ' + (a.causa_raiz || 'sin cargar') +
          (a.componente ? ' (componente: ' + a.componente + ')' : '') + (a.resumen_cierre ? '. ' + a.resumen_cierre : '')),
        causas_frecuentes_de_alertas: g.causas_alertas.length ? g.causas_alertas.map((c) => c.causa + ' (' + c.veces + (c.veces === 1 ? ' vez' : ' veces') + ' en 30 días)') : undefined,
        sin_catalogo: g.componentes.length ? undefined : 'No hay componentes cargados para este servicio: la guía depende del catálogo de infraestructura.',
      };
    },
  },
});

// ---------- Propuestas de la sala ----------
const SALA_ACCIONES = {
  asignar_tarea: { titulo: 'Asignar una tarea en la sala' },
  escalar: { titulo: 'Escalar el incidente' },
  comunicar: { titulo: 'Comunicar el incidente' },
};
for (const k of Object.keys(SALA_ACCIONES)) ASIST_ACCIONES[k] = { ok: (yo) => puede(yo, 'sala_crisis_dirigir'), titulo: SALA_ACCIONES[k].titulo, soloSala: true };
async function asistValidarAccionSala(env, yo, a) {
  const tipo = String(a.tipo);
  if (!puede(yo, 'sala_crisis_dirigir')) return { error: 'Esa acción no está disponible para tu perfil.' };
  const id = aId(a.incidente_id);
  if (!id) return { error: 'Para ' + tipo + ' hace falta el incidente_id de la sala.' };
  const rol = await rolEnIncidente(env, yo, id);
  if (rol.error || !rol.dirige) return { error: 'Esa sala no está disponible.' };
  if (!rol.abierto) return { error: 'La sala está cerrada.' };
  const cod = imCodigo(id);
  const p = { tipo, incidente_id: id, titulo: SALA_ACCIONES[tipo].titulo, alerta: cod + ' · ' + rol.inc.titulo, motivo: a.motivo ? String(a.motivo).slice(0, 300) : '',
    comentario: a.comentario ? String(a.comentario).slice(0, 1500) : '' };
  if (tipo === 'comunicar') {
    const al = await env.DB.prepare(`SELECT ia.alerta_id FROM incidente_alertas ia JOIN alertas_historico h ON h.alerta_id = ia.alerta_id
      WHERE ia.incidente_id = ?1 ORDER BY CASE WHEN h.estado = 'RESUELTA' THEN 1 ELSE 0 END, ia.sumada LIMIT 1`).bind(id).first();
    if (!al) return { error: 'La sala no tiene alertas para comunicar.' };
    p.alerta_id = al.alerta_id; p.clave = 'comunicar' + id;
    if (!p.comentario) p.comentario = 'Incidente ' + cod + ': ' + rol.inc.titulo + '. Estado: ' + IM_ESTADO_TXT[rol.inc.estado].toLowerCase() + '. Estamos trabajando para restablecer el servicio.';
    return p;
  }
  const d = await destinoTarea(env, { responsable_usuario_id: a.usuario_id, equipo_id: a.equipo_id });
  if (d.error) return { error: 'Para ' + (tipo === 'escalar' ? 'escalar' : 'asignar') + ' hace falta una persona de Soporte (usuario_id) o un equipo (equipo_id) que exista; usá tareas_incidente.' };
  const r = await env.DB.batch([env.DB.prepare('SELECT nombre FROM usuarios WHERE id = ?1').bind(d.uid || 0), env.DB.prepare('SELECT nombre FROM equipos WHERE id = ?1').bind(d.eid || 0)]);
  p.usuario_id = d.uid; p.equipo_id = d.eid;
  p.destino = [(r[0].results[0] || {}).nombre, (r[1].results[0] || {}).nombre ? 'equipo ' + r[1].results[0].nombre : null].filter(Boolean).join(' · ');
  if (tipo === 'asignar_tarea') {
    const t = String(a.titulo_tarea || a.titulo || '').trim().slice(0, 160);
    if (t.length < 4) return { error: 'Para asignar una tarea hace falta titulo_tarea (qué hay que hacer).' };
    p.tarea = t; p.alerta = cod + ' · ' + t; p.clave = 'tarea' + id + ':' + t.toLowerCase();
    const comp = aId(a.componente_id);
    if (comp && (await env.DB.prepare('SELECT 1 FROM componentes_infraestructura WHERE id = ?1').bind(comp).first())) p.componente_id = comp;
  } else {
    if (!p.comentario) p.comentario = p.motivo;
    if (String(p.comentario || '').trim().length < 5) return { error: 'Para escalar hace falta el motivo.' };
    p.clave = 'escalar' + id + ':' + (d.uid || '') + ':' + (d.eid || '');
  }
  return p;
}
// "¿Qué reviso primero?": el servidor arma hasta 2 tareas para los componentes que nadie revisó ni está revisando, a la persona de Soporte con menos tareas
function salaProponerTareas(d, incidenteId) {
  const g = d.guia_diagnostico || {}, t = d.tareas_incidente || {};
  const op = t.opciones_asignacion; if (!op) return [];
  const ocupados = new Set(t.componentes_ya_revisados_o_en_revision || []);
  const personas = (op.personas_soporte || []).slice().sort((x, y) => x.tareas_abiertas - y.tareas_abiertas);
  const out = [];
  for (const c of g.componentes || []) {
    if (out.length >= 2 || ocupados.has(c.componente_id) || !personas.length) continue;
    const p = personas[out.length % personas.length];
    out.push({ tipo: 'asignar_tarea', incidente_id: incidenteId, titulo_tarea: 'Revisar ' + c.componente, componente_id: c.componente_id, usuario_id: p.usuario_id,
      comentario: c.que_revisar || '', motivo: 'Es uno de los componentes de los que depende el servicio y todavía nadie lo revisó.' });
  }
  return out;
}
const SALA_SUGERENCIAS = [
  { id: 'sala_como_vamos', texto: '¿Cómo vamos con este incidente?', herramientas: ['estado_incidente', 'tareas_incidente'],
    guia: 'En 5 renglones como mucho: estado y desde cuándo (una frase), qué se sabe hasta ahora según las tareas hechas, qué falta (tareas abiertas y quién las tiene) y si algo está demorado. Si no hay tareas, decí que todavía no se asignó ninguna. No inventes causas.' },
  { id: 'sala_que_reviso', texto: '¿Qué reviso primero?', herramientas: ['guia_diagnostico', 'tareas_incidente'],
    guia: 'Ordená qué revisar primero: si un antecedente tuvo la causa en un componente de esta guía, empezá por ese y nombrá el antecedente (código y causa) en una frase. Para cada componente (como mucho 3), una frase con qué mirar. No repitas lo que ya se revisó o tiene una tarea abierta (componentes_ya_revisados_o_en_revision). Si te dejamos botones para asignar tareas, decí "Te dejo los botones para asignarlas".',
    proponer: (d, id) => salaProponerTareas(d, id) },
  { id: 'sala_demorado', texto: '¿Qué está demorado?', herramientas: ['tareas_incidente'],
    guia: 'Mirá cuantas.demoradas. Si es 0, decí "No hay nada demorado." y en una frase cuántas tareas siguen abiertas. Si hay, listá cada una con quién la tiene y cuánto lleva, y sugerí en una frase pedir novedades o escalar.' },
];
const ASIST_REGLA_SALA = '9. Estás dentro de una sala de crisis (incidente_id {ID}). Usá estado_incidente, tareas_incidente y guia_diagnostico con ese incidente_id. Si conviene asignar una tarea, escalar o comunicar, proponelo con sugerir_accion (tipo asignar_tarea con titulo_tarea y usuario_id o equipo_id de opciones_asignacion; escalar con usuario_id o equipo_id y el motivo en comentario; comunicar con el mensaje en comentario). Nunca digas que ya se hizo.';
