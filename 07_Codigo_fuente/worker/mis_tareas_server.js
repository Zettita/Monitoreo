// =====================================================================
// MIS TAREAS (parche 81). Sin SQL.
//
// Las tareas de las salas de crisis que tiene asignadas una persona del perfil Analista (o un equipo suyo), con la misma vista que ya tiene Soporte dentro de
// «Mis alertas/tareas»: pendientes y en curso, y las hechas en las últimas 24 horas, con el enlace a cada sala. El Analista no recibe alertas (deriva), así que su
// página es solo de tareas. Soporte las ve en «Mis alertas/tareas».
//   GET /mis-tareas        la página (la arma el parche 81 a partir de «Mis alertas/tareas»)
//   GET /api/mis-tareas    las tareas (tareasDeMisSalas, de la sala de crisis)
// =====================================================================
async function rutasMisTareas(env, request, ruta, yo) {
  if (request.method !== 'GET') return null;
  if (ruta === '/mis-tareas') {
    if (!puede(yo, 'mis_tareas')) return Response.redirect(new URL(inicioDe(yo), request.url).toString(), 302);
    return new Response(MIS_TAREAS_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (ruta === '/api/mis-tareas') {
    if (!puede(yo, 'mis_tareas')) return jsonError('Tu perfil no tiene tareas de salas de crisis para mostrar acá.', 403);
    const tareas = await tareasDeMisSalas(env, yo);
    const ah = (await env.DB.prepare(`SELECT strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(ahora, 'now')) AS ahora, ahora AS simulado FROM alerta_parametros WHERE id = 1`).first()) || {};
    // Misma forma que «Mis alertas» (la página es la misma), sin alertas
    return Response.json({ ok: true, tareas, ahora: ah.ahora, reloj_simulado: !!ah.simulado, mis_pendientes: tareas.filter((t) => t.estado !== 'HECHA').length,
      abiertas: [], resueltas: [], eventos: [], equipos: [], miembros_lidero: [], mis_equipos: [], lidero: [], reglas_personalizadas: [], umbrales: [], incidentes: [] },
    { headers: { 'cache-control': 'no-store' } });
  }
  return null;
}
