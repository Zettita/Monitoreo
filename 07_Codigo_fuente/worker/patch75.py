# Parche 75 (20/11): el Administrador puede eliminar lo que crea y "Preparar demo" reinicia la numeración de las salas (sin SQL).
#   Pedido de Uriel (dos cambios):
#   1. Eliminar lo que el Administrador puede crear: usuarios, equipos, reglas de alerta personalizadas, reglas de derivación y causas / acciones
#      para resolver (plantillas de correo, eventos comerciales, feriados, excepciones de umbrales y listas de difusión ya se podían borrar).
#      Los servidores están en admin_server.js (usuarios y reglas), avisos_server.js (derivación) y ticketera_server.js (causas y acciones);
#      acá se relaja "Eliminar equipo" y se suman los botones y la confirmación de cada pantalla de Administración.
#      Se borra el registro y lo que cuelga de él; lo que ya pasó (alertas, conversaciones, auditoría) queda como historial. No se borra
#      lo que dejaría trabajo abierto sin dueño (alertas abiertas asignadas, tareas de una sala): primero se deriva o se cierra.
#   2. "Preparar demo" borraba las salas abiertas en Helios pero el contador de números seguía (la demo daba IM-7, IM-8…): ahora lo
#      deja en el último antecedente importado, y la primera sala de la demo vuelve a ser IM-4.
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, viejo, nuevo, n=1):
    assert s.count(viejo) == n, ('patch75: se esperaban %d y hay %d de' % (n, s.count(viejo)), viejo[:100])
    return s.replace(viejo, nuevo)


# ---------- Eliminar equipo: ahora también con historial ----------
BORRAR_EQUIPO = r"""// Eliminar un equipo (parche 75): se borra el equipo, sus integrantes y sus reglas de derivación; lo que ya pasó queda como historial.
// No se borra si tiene alertas abiertas asignadas o tareas abiertas en una sala (primero se derivan o se cierran).
async function adminBorrarEquipo(env, yo, id) {
  const e = await env.DB.prepare('SELECT id, nombre FROM equipos WHERE id = ?1').bind(id).first();
  if (!e) return jsonError('El equipo no existe.', 404);
  const alertas = (await env.DB.prepare(SQL_ABIERTAS_DE('asignado_equipo_id')).bind(id).first()).n;
  const tareas = await contarSiExiste(env, "SELECT COUNT(*) AS n FROM incidente_tareas WHERE equipo_id = ?1 AND estado IN ('PENDIENTE', 'EN_CURSO')", id);
  const pendientes = [alertas ? alertas + (alertas === 1 ? ' alerta abierta asignada' : ' alertas abiertas asignadas') : null,
    tareas ? tareas + (tareas === 1 ? ' tarea abierta en una sala de crisis' : ' tareas abiertas en salas de crisis') : null].filter(Boolean);
  if (pendientes.length) return jsonError('No se puede eliminar: tiene ' + pendientes.join(' y ') + '. Derivalas, resolvelas o cerralas primero (o desactivá el equipo).', 409);
  await limpiarSiExiste(env, 'UPDATE incidente_tareas SET equipo_id = NULL WHERE equipo_id = ?1', id);
  await limpiarSiExiste(env, 'UPDATE componentes_infraestructura SET equipo_id = NULL WHERE equipo_id = ?1', id);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM equipo_miembros WHERE equipo_id = ?1').bind(id),
    // Una regla de derivación que solo mandaba a este equipo se borra; si también tenía una persona, queda con la persona
    env.DB.prepare('DELETE FROM reglas_derivacion WHERE equipo_id = ?1 AND usuario_id IS NULL').bind(id),
    env.DB.prepare('UPDATE reglas_derivacion SET equipo_id = NULL WHERE equipo_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM equipos WHERE id = ?1').bind(id),
    env.DB.prepare('INSERT INTO auditoria (usuario_id, accion, detalle) VALUES (?1, ?2, ?3)').bind(yo.id, 'BORRAR_EQUIPO', e.nombre),
  ]);
  return okJson({});
}
// Personas a las que se les puede comunicar algo suelto"""


def servidor(s):
    i = s.index('// Eliminar un equipo: solo si nunca tuvo alertas')
    j = s.index('// Personas a las que se les puede comunicar algo suelto', i)
    s = s[:i] + BORRAR_EQUIPO + s[j + len('// Personas a las que se les puede comunicar algo suelto'):]
    # Preparar demo: las salas vuelven a empezar en el número que sigue a los antecedentes importados
    s = _rep(s, "    env.DB.prepare(\"DELETE FROM incidentes_mayores WHERE origen = 'HELIOS'\"),\n  ]).catch(() => {});\n",
             "    env.DB.prepare(\"DELETE FROM incidentes_mayores WHERE origen = 'HELIOS'\"),\n  ]).catch(() => {});\n"
             "  // El contador de números (IM-N) vuelve al último antecedente importado: la primera sala de la demo es siempre la misma (IM-4)\n"
             "  await env.DB.batch([\n"
             "    env.DB.prepare(\"UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM incidentes_mayores) WHERE name = 'incidentes_mayores'\"),\n"
             "    env.DB.prepare(\"UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM incidente_tareas) WHERE name = 'incidente_tareas'\"),\n"
             "    env.DB.prepare(\"UPDATE sqlite_sequence SET seq = (SELECT COALESCE(MAX(id), 0) FROM incidente_linea_tiempo) WHERE name = 'incidente_linea_tiempo'\"),\n"
             "  ]).catch((e) => console.error('Preparar demo: no se pudo reiniciar la numeración de las salas: ' + e.message));\n")
    return s


# ---------- Administración: botones de eliminar ----------
def admin(h):
    if 'id="dlg-usuario"' not in h:
        return h
    h = _rep(h, "BORRAR_UMBRALES: 'Quitó una excepción de umbrales',",
             "BORRAR_UMBRALES: 'Quitó una excepción de umbrales',\n"
             "    BORRAR_USUARIO: 'Eliminó un usuario', BORRAR_EQUIPO: 'Eliminó un equipo', BORRAR_REGLA: 'Eliminó una regla', BORRAR_DERIVACION: 'Eliminó una regla de derivación',\n"
             "    BORRAR_CATALOGO_RESOLUCION: 'Eliminó una causa o una acción',")
    # Usuarios
    h = _rep(h, '<button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="u-guardar">',
             '<button type="button" class="btn peligro" id="u-borrar" style="margin-right:auto" hidden>Eliminar usuario</button><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="u-guardar">')
    h = _rep(h, "    $('u-activo-campo').hidden = !u;\n",
             "    $('u-activo-campo').hidden = !u;\n    $('u-borrar').hidden = !u || !!soy;\n")
    h = _rep(h, "  $('u-activo').addEventListener('change',",
             "  $('u-borrar').addEventListener('click', function () {\n"
             "    var u = editandoUsuario; if (!u || u.id === yo.id) return;\n"
             "    if (!confirm('¿Eliminar a «' + u.nombre + '»? Se borra su usuario y se cierran sus sesiones. Lo que hizo queda en el historial, sin su nombre. No se puede deshacer.')) return;\n"
             "    pedir('/api/admin/usuarios/' + u.id + '/borrar', {}).then(function () { $('dlg-usuario').close(); toast('Usuario eliminado.'); return cargarPersonas(); })\n"
             "      .catch(function (e) { errorForm('u-error', e.message); });\n"
             "  });\n"
             "  $('u-activo').addEventListener('change',")
    # Equipos: el aviso explica qué se borra
    h = _rep(h, "confirm('¿Eliminar el equipo «' + editandoEquipo.nombre + '»?')",
             "confirm('¿Eliminar el equipo «' + editandoEquipo.nombre + '»? Se borran sus integrantes y sus reglas de derivación. Lo que ya pasó queda en el historial. No se puede deshacer.')")
    # Reglas de alerta personalizadas
    h = _rep(h, '<button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="r-guardar">',
             '<button type="button" class="btn peligro" id="r-borrar" style="margin-right:auto" hidden>Eliminar regla</button><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="r-guardar">')
    h = _rep(h, "    $('r-activa-campo').hidden = !r;\n",
             "    $('r-activa-campo').hidden = !r;\n    $('r-borrar').hidden = !r;\n")
    h = _rep(h, "  $('r-activa').addEventListener('change',",
             "  $('r-borrar').addEventListener('click', function () {\n"
             "    if (!editandoRegla || !confirm('¿Eliminar la regla «' + editandoRegla.nombre + '»? También se borran las reglas de derivación que la usan. Las alertas que ya avisó quedan en el historial. No se puede deshacer.')) return;\n"
             "    pedir('/api/admin/reglas/' + editandoRegla.id + '/borrar', {}).then(function () { $('dlg-regla').close(); toast('Regla eliminada.'); return cargarReglas(); })\n"
             "      .catch(function (e) { errorForm('r-error', e.message); });\n"
             "  });\n"
             "  $('r-activa').addEventListener('change',")
    # Reglas de derivación
    h = _rep(h, '<button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="dv-guardar">',
             '<button type="button" class="btn peligro" id="dv-borrar" style="margin-right:auto" hidden>Eliminar regla</button><button type="button" class="btn" data-cerrar>Cancelar</button><button type="submit" class="btn primario" id="dv-guardar">')
    h = _rep(h, "    $('dv-activa-campo').hidden = !r;\n",
             "    $('dv-activa-campo').hidden = !r;\n    $('dv-borrar').hidden = !r;\n")
    h = _rep(h, "  $('dv-activa').addEventListener('change',",
             "  $('dv-borrar').addEventListener('click', function () {\n"
             "    if (!editandoDeriv || !confirm('¿Eliminar la regla de derivación «' + editandoDeriv.nombre + '»? Las alertas que ya derivó quedan como están. No se puede deshacer.')) return;\n"
             "    pedir('/api/admin/derivacion/' + editandoDeriv.id + '/borrar', {}).then(function () { $('dlg-deriv').close(); toast('Regla eliminada.'); return cargarDerivacion(); })\n"
             "      .catch(function (e) { errorForm('dv-error', e.message); });\n"
             "  });\n"
             "  $('dv-activa').addEventListener('change',")
    # Causas y qué se hizo
    h = _rep(h, "'<button class=\"btn chico\" data-cat-renombrar=\"' + x.id + '\">Renombrar</button><button class=\"btn chico\" data-cat-activo=\"' + x.id + '\">' + (x.activo ? 'Desactivar' : 'Activar') + '</button></li>';",
             "'<button class=\"btn chico\" data-cat-renombrar=\"' + x.id + '\">Renombrar</button><button class=\"btn chico\" data-cat-activo=\"' + x.id + '\">' + (x.activo ? 'Desactivar' : 'Activar') + '</button>' +\n"
             "          '<button class=\"btn chico peligro\" data-cat-borrar=\"' + x.id + '\">Eliminar</button></li>';")
    h = _rep(h, "  // Plantillas de correo (parche 40): reemplaza {variables};",
             "  document.addEventListener('click', function (ev) {\n"
             "    var b = ev.target.closest('[data-cat-borrar]'); if (!b) return;\n"
             "    var x = CAT.filter(function (c) { return String(c.id) === b.getAttribute('data-cat-borrar'); })[0]; if (!x) return;\n"
             "    if (!confirm('¿Eliminar «' + x.nombre + '»? Las alertas ya resueltas conservan el nombre. No se puede deshacer.')) return;\n"
             "    guardarCat({ id: x.id, borrar: true }, 'Opción eliminada.');\n"
             "  });\n"
             "  // Plantillas de correo (parche 40): reemplaza {variables};")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ADMIN_HTML', admin)
    return s
