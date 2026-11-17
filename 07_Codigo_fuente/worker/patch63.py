# Parche 63 (17/11): Equipos y listas de difusión unificados, pedido de Ale.
#   - Una sola cosa: el EQUIPO. Cada persona del equipo tiene un rol para los comunicados (técnico, líder o informado) y el
#     equipo puede ser general o de un cliente (como eran las listas). Las alertas se derivan a equipos o personas como
#     siempre (solo le llegan a la gente de Soporte del equipo); "Comunicar incidente" elige equipos y, si hace falta,
#     personas sueltas (les llega como técnicos).
#   - Desaparece la pestaña "Listas de difusión". El script 22 agrega las dos columnas y pasa las listas que ya había a
#     equipos (no borra alerta_parametros.listas_difusion: queda de respaldo). Sin el script, todo sigue como antes.
#   - El Analista crea, modifica y elimina equipos y plantillas de correo. Un equipo se puede eliminar solo si nunca tuvo
#     alertas ni reglas de derivación (para no perder el historial); si no, se desactiva.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _r(h, viejo, nuevo, n=1):
    c = h.count(viejo)
    if c != n:
        raise SystemExit('patch63: se esperaban %d y hay %d de: %r' % (n, c, viejo[:100]))
    return h.replace(viejo, nuevo)


def _entre(h, ini, fin, nuevo):
    if h.count(ini) != 1:
        raise SystemExit('patch63: el inicio no es único: %r' % ini[:80])
    i = h.index(ini); j = h.index(fin, i)
    return h[:i] + nuevo + h[j:]


SERVIDOR_22 = r"""// ---- Equipos con cliente y rol de comunicado (parche 63, script 22) ----
const FALTA_SCRIPT_22 = 'Para elegir el cliente del equipo y el rol de cada persona falta correr 22_equipos_y_comunicados_d1.txt en la consola de D1.';
let SIN_SCRIPT_22 = false;   // sin el script 22 se lee y se guarda como antes
async function conScript22(fnNueva, fnVieja) {
  if (!SIN_SCRIPT_22) {
    try { return await fnNueva(); } catch (e) { if (!/no such column/i.test(e.message)) throw e; SIN_SCRIPT_22 = true; }
  }
  return await fnVieja();
}
async function tieneScript22(env) {
  return conScript22(async () => { await env.DB.prepare('SELECT rol_comunicado FROM equipo_miembros LIMIT 1').all(); return true; }, async () => false);
}
// Eliminar un equipo: solo si nunca tuvo alertas, eventos ni reglas de derivación (si no, se pierde el historial: se desactiva)
async function adminBorrarEquipo(env, yo, id) {
  const e = await env.DB.prepare('SELECT id, nombre FROM equipos WHERE id = ?1').bind(id).first();
  if (!e) return jsonError('El equipo no existe.', 404);
  const uso = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM alertas_historico WHERE asignado_equipo_id = ?1) + (SELECT COUNT(*) FROM alerta_eventos WHERE equipo_destino_id = ?1)
                                      + (SELECT COUNT(*) FROM reglas_derivacion WHERE equipo_id = ?1) AS n`).bind(id).first();
  if (uso && uso.n) return jsonError('Este equipo ya tuvo alertas o reglas de derivación: no se puede eliminar sin perder el historial. Desactivalo.', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM equipo_miembros WHERE equipo_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM equipos WHERE id = ?1').bind(id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_EQUIPO', e.nombre),
  ]);
  return okJson({});
}
// Personas a las que se les puede comunicar algo suelto (además de los equipos)
async function personasComunicar(env) {
  const r = await conPerfil(() => env.DB.prepare(`SELECT id, nombre, ${SQL_PERFIL} AS perfil FROM usuarios WHERE activo = 1 AND perfil <> 'ADMIN' ORDER BY nombre COLLATE NOCASE`).all(),
    () => env.DB.prepare("SELECT id, nombre, perfil FROM usuarios WHERE activo = 1 AND perfil <> 'ADMIN' ORDER BY nombre COLLATE NOCASE").all());
  return r.results;
}

async function adminListarPersonas(env) {"""

LOTE = r"""function adminListarPersonasLote(env) {
  const perfil = SIN_COLUMNA_COMUNICADOS ? 'perfil' : SQL_PERFIL;
  const u = () => env.DB.prepare(`SELECT id, usuario, nombre, ${perfil} AS perfil, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso
                    FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`);
  const cli = () => env.DB.prepare('SELECT DISTINCT cliente_id FROM series_estado ORDER BY cliente_id');
  return conScript22(() => env.DB.batch([u(), env.DB.prepare('SELECT id, nombre, descripcion, responsable_id, activo, creado, alcance_cliente_id AS cliente_id FROM equipos ORDER BY activo DESC, nombre COLLATE NOCASE'),
      env.DB.prepare('SELECT equipo_id, usuario_id, rol_comunicado FROM equipo_miembros'), cli()]),
    () => env.DB.batch([u(), env.DB.prepare('SELECT id, nombre, descripcion, responsable_id, activo, creado FROM equipos ORDER BY activo DESC, nombre COLLATE NOCASE'),
      env.DB.prepare('SELECT equipo_id, usuario_id FROM equipo_miembros'), cli()]));
}
"""

LEER_LISTAS = r"""async function leerListas(env) {
  // Desde el parche 63 las "listas" son los equipos: cada persona con su rol de comunicado (sin rol = técnico)
  if (!SIN_SCRIPT_22) {
    try {
      const r = await env.DB.batch([
        env.DB.prepare('SELECT id, nombre, alcance_cliente_id AS cliente_id, activo FROM equipos ORDER BY nombre COLLATE NOCASE'),
        env.DB.prepare("SELECT m.equipo_id, m.usuario_id, COALESCE(m.rol_comunicado, 'TECNICO') AS rol FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.perfil <> 'ADMIN'"),
      ]);
      const ms = r[1].results;
      return { equipos: true, listas: r[0].results.map((e) => ({ id: e.id, nombre: e.nombre, cliente_id: e.cliente_id || null, activa: e.activo,
        miembros: ms.filter((m) => m.equipo_id === e.id).map((m) => ({ usuario_id: m.usuario_id, rol: m.rol })) })).filter((l) => l.miembros.length) };
    } catch (e) { if (!/no such column/i.test(e.message)) throw e; SIN_SCRIPT_22 = true; }
  }
  let fila;"""

CSS_ADMIN = """<style>/* Equipos con rol de comunicado (parche 63) */
.miembro-fila { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.miembro-fila label { flex: 1; min-width: 0; }
.miembro-fila select { width: auto; min-width: 120px; height: 32px; font-size: 13px; }
.miembro-fila select:disabled { opacity: .45; }
.chip small { color: var(--ink-3); margin-left: 3px; }
</style>
</head>"""

ABRIR_EQUIPO_MIEMBROS = r"""    var hayRoles = !personas.falta_script_22;
    lista = lista.filter(function (u) { return u.perfil !== 'ADMIN' || mios.indexOf(u.id) >= 0; });   // el Administrador no recibe alertas ni comunicados
    $('e-cliente-campo').hidden = !hayRoles;
    $('e-cliente').innerHTML = '<option value="">Todas las alertas (general)</option>' + (personas.clientes || []).map(function (c) { return '<option value="' + esc(c) + '">Solo alertas de ' + esc(c) + '</option>'; }).join('');
    $('e-cliente').value = e && e.cliente_id ? e.cliente_id : '';
    $('e-miembros').innerHTML = lista.map(function (u) {
      var en = mios.indexOf(u.id) >= 0, rol = e ? rolDe(e.id, u.id) : 'TECNICO';
      return '<div class="miembro-fila"><label><input type="checkbox" value="' + u.id + '"' + (en ? ' checked' : '') + '> ' + esc(u.nombre) +
        ' <small>' + esc(PERFIL_TXT[u.perfil]) + (u.activo ? '' : ', inactivo') + '</small></label>' +
        (hayRoles ? '<select data-rol="' + u.id + '" aria-label="Rol de ' + esc(u.nombre) + ' en los comunicados"' + (en ? '' : ' disabled') + '>' +
          [['TECNICO', 'Técnico'], ['LIDER', 'Líder'], ['INFORMADO', 'Informado']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === rol ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' : '') + '</div>';
    }).join('');
    $('e-borrar').hidden = !e;
"""


def _servidor(s):
    s = _r(s, "  admin_listas: ['ADMIN'],                             // listas de difusión (parche 46)",
           "  admin_listas: [],                                    // desde el parche 63 las listas de difusión son los equipos")
    s = _r(s, "  admin_equipos: ['ADMIN'],                            // equipos", "  admin_equipos: ['ADMIN', 'ANALISTA'],               // equipos (parche 63: también el Analista)")
    s = _r(s, "  admin_plantillas: ['ADMIN'],                         // plantillas de correo (parche 40)",
           "  admin_plantillas: ['ADMIN', 'ANALISTA'],             // plantillas de correo (parche 40; desde el 63 también el Analista)")
    # Listado de personas y equipos (con cliente, rol y la lista de clientes)
    s = _r(s, 'async function adminListarPersonas(env) {', SERVIDOR_22)
    s = _r(s, "  return okJson({ usuarios, equipos: r[1].results, miembros: r[2].results });\n}\nfunction adminListarPersonasLote(env) {",
           "  return okJson({ usuarios, equipos: r[1].results, miembros: r[2].results, clientes: r[3].results.map((x) => x.cliente_id), falta_script_22: SIN_SCRIPT_22 });\n}\nfunction adminListarPersonasLote(env) {")
    s = _entre(s, 'function adminListarPersonasLote(env) {', '\nasync function ', LOTE)
    # Guardar equipo: cliente y rol de cada persona
    s = _r(s, "  let miembros = b.miembros === undefined ? null : (Array.isArray(b.miembros) ? b.miembros : []).map(aId).filter(Boolean).slice(0, 200);",
           "  const roles = new Map();\n"
           "  let miembros = b.miembros === undefined ? null : (Array.isArray(b.miembros) ? b.miembros : []).map((m) => {\n"
           "    const uid = aId(m && typeof m === 'object' ? m.usuario_id : m);\n"
           "    if (uid && m && typeof m === 'object' && ROLES_LISTA[m.rol]) roles.set(uid, m.rol);\n"
           "    return uid;\n"
           "  }).filter(Boolean).slice(0, 200);\n"
           "  const clienteEq = b.cliente_id === undefined ? (previo && previo.alcance_cliente_id ? previo.alcance_cliente_id : null) : opcional(b.cliente_id, 40);\n"
           "  if (clienteEq && !/^[A-Za-z0-9_.-]+$/.test(clienteEq)) return jsonError('El cliente no es válido.', 400);\n"
           "  const con22 = await tieneScript22(env);\n"
           "  if (!con22 && (clienteEq || roles.size)) return jsonError(FALTA_SCRIPT_22, 503);")
    s = _r(s, "      pasos.push(env.DB.prepare(`INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id) SELECT (${idEquipo}), id FROM usuarios WHERE id = ?2`).bind(nombre, m));\n    }\n  }",
           "      pasos.push(con22\n"
           "        ? env.DB.prepare(`INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id, rol_comunicado) SELECT (${idEquipo}), id, ?3 FROM usuarios WHERE id = ?2`).bind(nombre, m, roles.get(m) || null)\n"
           "        : env.DB.prepare(`INSERT OR IGNORE INTO equipo_miembros (equipo_id, usuario_id) SELECT (${idEquipo}), id FROM usuarios WHERE id = ?2`).bind(nombre, m));\n    }\n  }\n"
           "  if (con22) pasos.push(env.DB.prepare(`UPDATE equipos SET alcance_cliente_id = ?2 WHERE id = (${idEquipo})`).bind(nombre, clienteEq));")
    s = _r(s, "    if (m === 'POST' && (x = p.match(/^\\/equipos\\/(\\d+)$/))) return await adminGuardarEquipo(env, request, yo, Number(x[1]));",
           "    if (m === 'POST' && (x = p.match(/^\\/equipos\\/(\\d+)\\/borrar$/))) return await adminBorrarEquipo(env, yo, Number(x[1]));\n"
           "    if (m === 'POST' && (x = p.match(/^\\/equipos\\/(\\d+)$/))) return await adminGuardarEquipo(env, request, yo, Number(x[1]));")
    # Las "listas" de "Comunicar incidente" salen de los equipos
    s = _r(s, "async function leerListas(env) {\n  let fila;", LEER_LISTAS)
    # Comunicar: equipos y/o personas sueltas
    s = _r(s, "  if (!elegidas.length || elegidas.length !== idsListas.length) return jsonError('Elegí al menos una lista de difusión que sirva para esta alerta.', 400);",
           "  const idsPersonas = Array.from(new Set((Array.isArray(b.personas) ? b.personas : []).map(aId).filter(Boolean))).slice(0, COMUNICADO_MAX_PERSONAS);\n"
           "  if (elegidas.length !== idsListas.length) return jsonError('Hay equipos elegidos que no sirven para esta alerta.', 400);\n"
           "  if (!elegidas.length && !idsPersonas.length) return jsonError('Elegí al menos un equipo o una persona.', 400);\n"
           "  const sueltas = idsPersonas.length ? (await env.DB.prepare(\"SELECT id, nombre FROM usuarios WHERE activo = 1 AND perfil <> 'ADMIN' AND id IN (SELECT value FROM json_each(?1))\")\n"
           "    .bind(JSON.stringify(idsPersonas)).all()).results : [];\n"
           "  if (sueltas.length !== idsPersonas.length) return jsonError('Hay personas elegidas que no pueden recibir el comunicado.', 400);")
    s = _r(s, "    if (!ant || ROL_PESO[m.rol] > ROL_PESO[ant]) porUsuario.set(m.usuario_id, m.rol);\n  }",
           "    if (!ant || ROL_PESO[m.rol] > ROL_PESO[ant]) porUsuario.set(m.usuario_id, m.rol);\n  }\n"
           "  for (const p of sueltas) if (p.id !== yo.id) porUsuario.set(p.id, 'TECNICO');   // personas sueltas: como técnicos (Recibido y responder)")
    s = _r(s, "  if (!destinos.length) return jsonError('Las listas elegidas no tienen a nadie activo (además de quien comunica).', 400);\n  const nombres = elegidas.map((l) => l.nombre);",
           "  if (!destinos.length) return jsonError('Los equipos y personas elegidos no tienen a nadie activo (además de quien comunica).', 400);\n  const nombres = elegidas.map((l) => l.nombre).concat(sueltas.map((p) => p.nombre));")
    s = _r(s, "    listas_difusion: rol.trabaja ? await listasParaAlerta(env, rol.a.cliente_id) : [],",
           "    listas_difusion: rol.trabaja ? await listasParaAlerta(env, rol.a.cliente_id) : [], personas_comunicar: rol.trabaja ? await personasComunicar(env) : [],")
    # Las alertas derivadas a un equipo solo le llegan a su gente de Soporte (en el equipo puede haber gerentes o "Solo comunicados")
    s = _r(s, "const r = await env.DB.prepare('SELECT u.id FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 WHERE m.equipo_id = ?1').bind(equipoId).all();",
           "const r = await env.DB.prepare(\"SELECT u.id FROM equipo_miembros m JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 AND u.perfil = 'SOPORTE' WHERE m.equipo_id = ?1\").bind(equipoId).all();")
    s = _r(s, "                    JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 ORDER BY u.nombre`),",
           "                    JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 AND u.perfil = 'SOPORTE' ORDER BY u.nombre`),")
    s = _r(s, "    env.DB.prepare('SELECT m.equipo_id, m.usuario_id FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1 JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1'),",
           "    env.DB.prepare(\"SELECT m.equipo_id, m.usuario_id FROM equipo_miembros m JOIN equipos e ON e.id = m.equipo_id AND e.activo = 1 JOIN usuarios u ON u.id = m.usuario_id AND u.activo = 1 AND u.perfil = 'SOPORTE'\"),")
    return s


def _admin(h):
    h = _r(h, "      : 'Como ' + (PERFIL_TXT[yo.perfil] || yo.perfil).toLowerCase() + ' podés gestionar la derivación automática y ver el estado del modelo.';", "      : '';")
    h = _r(h, "    return pedir('/api/admin/usuarios').then(function (d) { personas = d; pintarUsuarios(); pintarEquipos(); });",
           "    return pedir(puedo('admin_usuarios') ? '/api/admin/usuarios' : '/api/admin/equipos').then(function (d) { personas = d; if (puedo('admin_usuarios')) pintarUsuarios(); pintarEquipos(); });")
    # Diálogo del equipo: cliente, rol de cada persona y "Eliminar equipo"
    h = _r(h, '    <div class="campo"><span>Miembros</span><div class="lista-check" id="e-miembros"></div></div>',
           '    <label class="campo" id="e-cliente-campo"><span>Alertas</span><select id="e-cliente"></select></label>\n'
           '    <div class="campo"><span>Personas y su rol en los comunicados</span><div class="lista-check" id="e-miembros"></div></div>')
    i = h.index('<dialog id="dlg-equipo">'); j = h.index('<button type="button" class="btn" data-cerrar>Cancelar</button>', i)
    h = h[:j] + '<button type="button" class="btn peligro" id="e-borrar" style="margin-right:auto">Eliminar equipo</button>' + h[j:]
    h = _entre(h, "    $('e-miembros').innerHTML = lista.map(function (u) {", "    $('e-activo-campo').hidden = !e;", ABRIR_EQUIPO_MIEMBROS)
    h = _r(h, "  function miembrosDe(eid) {",
           "  function rolDe(eid, uid) { var m = personas.miembros.filter(function (x) { return x.equipo_id === eid && x.usuario_id === uid; })[0]; return (m && m.rol_comunicado) || 'TECNICO'; }\n"
           "  var ROL_TXT = { TECNICO: 'Técnico', LIDER: 'Líder', INFORMADO: 'Informado' };\n"
           "  $('e-miembros').addEventListener('change', function (ev) {\n"
           "    if (ev.target.type !== 'checkbox') return;\n"
           "    var sel = $('e-miembros').querySelector('select[data-rol=\"' + ev.target.value + '\"]'); if (sel) sel.disabled = !ev.target.checked;\n"
           "  });\n"
           "  $('e-borrar').addEventListener('click', function () {\n"
           "    if (!editandoEquipo || !confirm('¿Eliminar el equipo «' + editandoEquipo.nombre + '»?')) return;\n"
           "    pedir('/api/admin/equipos/' + editandoEquipo.id + '/borrar', {}).then(function () { $('dlg-equipo').close(); toast('Equipo eliminado.'); return cargarPersonas(); })\n"
           "      .catch(function (e) { errorForm('e-error', e.message); });\n"
           "  });\n"
           "  function miembrosDe(eid) {")
    h = _r(h, "      miembros: Array.prototype.map.call($('e-miembros').querySelectorAll('input:checked'), function (i) { return Number(i.value); })\n    };",
           "      miembros: Array.prototype.map.call($('e-miembros').querySelectorAll('input:checked'), function (i) {\n"
           "        var sel = $('e-miembros').querySelector('select[data-rol=\"' + i.value + '\"]');\n"
           "        return sel ? { usuario_id: Number(i.value), rol: sel.value } : Number(i.value);\n"
           "      })\n    };\n"
           "    if (!personas.falta_script_22) datos.cliente_id = $('e-cliente').value || null;")
    # Tabla de equipos: para qué alertas y el rol de cada persona
    h = _r(h, "(e.descripcion ? '<br><small>' + esc(e.descripcion) + '</small>' : '') + '</td>' +",
           "(e.descripcion ? '<br><small>' + esc(e.descripcion) + '</small>' : '') + (personas.falta_script_22 ? '' : '<br><small>' + (e.cliente_id ? 'Alertas de ' + esc(e.cliente_id) : 'Todas las alertas') + '</small>') + '</td>' +")
    h = _r(h, "(ms.length ? ms.map(function (u) { return '<span class=\"chip\">' + esc(u.nombre) + '</span>'; }).join('')",
           "(ms.length ? ms.map(function (u) { return '<span class=\"chip\">' + esc(u.nombre) + (personas.falta_script_22 ? '' : '<small>' + ROL_TXT[rolDe(e.id, u.id)] + '</small>') + '</span>'; }).join('')")
    h = _r(h, '</head>', CSS_ADMIN)
    return h


def _alerta(h):
    h = _r(h, '    <div class="campo"><span>Listas de difusión</span><div class="listas-com" id="k-listas"></div></div>',
           '    <div class="campo"><span>Equipos</span><div class="listas-com" id="k-listas"></div></div>\n'
           '    <div class="campo"><span>Personas</span><details class="k-personas"><summary>Sumar personas sueltas</summary><div class="listas-com" id="k-personas"></div></details></div>')
    h = _r(h, "    if (!ls.length) { toast('Todavía no hay listas de difusión para esta alerta: las arma el Administrador en Administración > Listas de difusión.', true); return; }",
           "    var ps = d.personas_comunicar || [];\n"
           "    if (!ls.length && !ps.length) { toast('Todavía no hay equipos para comunicar: se arman en Administración > Equipos.', true); return; }")
    h = _r(h, "esc((l.cliente_id ? 'Lista de ' + l.cliente_id : 'General') + ' · ' + rolesTxt(l.por_rol)) + '</small></span></label>';\n    }).join('');",
           "esc((l.cliente_id ? 'Equipo de ' + l.cliente_id : 'General') + ' · ' + rolesTxt(l.por_rol)) + '</small></span></label>';\n    }).join('') || '<small class=\"gris\">No hay equipos para esta alerta.</small>';\n"
           "    $('k-personas').innerHTML = ps.map(function (p) {\n"
           "      return '<label><input type=\"checkbox\" value=\"' + p.id + '\"><span><b>' + esc(p.nombre) + '</b><small>' + esc({ ANALISTA: 'Analista', SOPORTE: 'Soporte', GERENTE: 'Gerente', COMUNICADOS: 'Solo comunicados' }[p.perfil] || p.perfil) + ' · como técnico</small></span></label>';\n"
           "    }).join('');")
    h = _r(h, "    if (!ids.length) { errorForm('k-error', 'Elegí al menos una lista.'); return; }",
           "    var pids = Array.prototype.map.call(document.querySelectorAll('#k-personas input:checked'), function (x) { return Number(x.value); });\n"
           "    if (!ids.length && !pids.length) { errorForm('k-error', 'Elegí al menos un equipo o una persona.'); return; }")
    h = _r(h, "{ listas: ids, mensaje: $('k-mensaje').value }", "{ listas: ids, personas: pids, mensaje: $('k-mensaje').value }")
    return h


def aplicar(s):
    s = _servidor(s)
    s = _html(s, 'ADMIN_HTML', _admin)
    s = _html(s, 'ALERTA_HTML', _alerta)
    return s
