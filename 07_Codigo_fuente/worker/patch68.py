# Parche 68 (18/11): correo de cada usuario y elegir destinatarios de una lista al enviar correos desde una alerta.
#   Pedido de Uriel: al crear un usuario se carga su casilla de correo, para que "Template correo alerta" tenga el listado de casillas
#   a mano y no haya que escribirlas, copiarlas ni pegarlas.
#   - Script 23 (usuarios.correo, una columna). Sin el script todo funciona como antes: crear usuarios no pide correo y Administración avisa.
#   - Administración > Usuarios: campo "Correo" al crear (obligatorio) y al editar; el correo se ve en la tabla. Los usuarios que ya
#     existían quedan sin correo hasta que el Administrador lo cargue; una vez cargado no se puede dejar vacío. No se repite entre usuarios.
#   - GET /api/alertas/<id>/correo/contactos (solo quien trabaja la alerta): personas activas con correo y equipos activos con los correos de sus miembros.
#   - Detalle de la alerta: "Elegir de la lista" en Para y CC del correo y en los destinatarios de "Confirmar envío": buscador, equipos
#     (suma o saca los correos de todos sus miembros) y personas. Los campos siguen aceptando direcciones escritas a mano (clientes, proveedores).
#   Reemplaza lo decidido el 16/11 con Ale ("los destinatarios del correo se escriben siempre a mano, sin agenda de contactos").
import json


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, viejo, nuevo, n=1):
    assert s.count(viejo) == n, ('patch68: se esperaban %d y hay %d de' % (n, s.count(viejo)), viejo[:90])
    return s.replace(viejo, nuevo)


# ---------- Servidor ----------
SERVIDOR = r"""// ---------- Correo de cada usuario (parche 68, script 23) ----------
const FALTA_SCRIPT_23 = 'Falta correr el script 23_correo_usuarios_d1.txt en la consola de D1 para poder guardar el correo.';
let CORREO_USUARIOS_OK = false, CORREO_USUARIOS_PROBADO = 0;
async function hayCorreoUsuarios(env) {
  if (CORREO_USUARIOS_OK) return true;
  if (Date.now() - CORREO_USUARIOS_PROBADO < 60000) return false;   // sin el script, se vuelve a mirar una vez por minuto
  CORREO_USUARIOS_PROBADO = Date.now();
  try { await env.DB.prepare('SELECT correo FROM usuarios LIMIT 1').all(); CORREO_USUARIOS_OK = true; }
  catch (e) { if (!/no such column/i.test(e.message)) throw e; }
  return CORREO_USUARIOS_OK;
}
const correoUsuario = (v) => String(v || '').trim().toLowerCase();
function correoUsuarioError(c) {
  return CORREO_RE.test(c) && c.length <= 120 ? null : 'El correo no es válido. Escribilo como nombre@empresa.com.';
}
async function correoEnUso(env, correo, exceptoId) {
  const o = await env.DB.prepare('SELECT nombre FROM usuarios WHERE lower(correo) = ?1 AND id <> ?2 LIMIT 1').bind(correo, exceptoId || 0).first();
  return o ? 'Ese correo ya lo tiene ' + o.nombre + '.' : null;
}
// Personas y equipos que se pueden elegir como destinatarios en el correo de una alerta (solo quien trabaja la alerta)
async function contactosCorreo(env, yo, alertaId) {
  const rol = await rolEnAlerta(env, yo, alertaId);
  if (rol.error) return rol.error;
  if (!rol.trabaja) return jsonError('Solo quien trabaja la alerta (o el analista) puede elegir destinatarios.', 403);
  if (!(await hayCorreoUsuarios(env))) return okJson({ personas: [], equipos: [], sin_correo: 0, falta_script: true });
  const r = await env.DB.batch([
    env.DB.prepare('SELECT id, nombre, correo FROM usuarios WHERE activo = 1 ORDER BY nombre COLLATE NOCASE'),
    env.DB.prepare('SELECT id, nombre FROM equipos WHERE activo = 1 ORDER BY nombre COLLATE NOCASE'),
    env.DB.prepare('SELECT equipo_id, usuario_id FROM equipo_miembros'),
  ]);
  const personas = r[0].results.filter((u) => u.correo).map((u) => ({ id: u.id, nombre: u.nombre, correo: u.correo }));
  const porId = new Map(personas.map((p) => [p.id, p]));
  const equipos = [];
  for (const e of r[1].results) {
    const correos = r[2].results.filter((m) => m.equipo_id === e.id && porId.has(m.usuario_id)).map((m) => porId.get(m.usuario_id).correo);
    if (correos.length) equipos.push({ id: e.id, nombre: e.nombre, correos });
  }
  return okJson({ personas, equipos, sin_correo: r[0].results.length - personas.length });
}

"""

CREAR_VALIDAR = """  // Correo (parche 68): obligatorio al crear cuando existe el script 23; sin el script se crea como antes
  const conCorreo = await hayCorreoUsuarios(env);
  const correo = correoUsuario(b.correo);
  if (correo && !conCorreo) return jsonError(FALTA_SCRIPT_23, 503);
  if (conCorreo && !correo) return jsonError('Falta el correo del usuario. Se usa para elegirlo como destinatario al enviar correos desde Helios.', 400);
  if (correo) {
    const mal = correoUsuarioError(correo); if (mal) return jsonError(mal, 400);
    const uso = await correoEnUso(env, correo, 0); if (uso) return jsonError(uso, 409);
  }
"""

EDITAR_VALIDAR = """  // Correo (parche 68): se puede cambiar, pero no dejar vacío una vez cargado; los usuarios de antes pueden seguir sin correo hasta que se cargue
  const conCorreo = await hayCorreoUsuarios(env);
  const correoAntes = conCorreo ? correoUsuario((await env.DB.prepare('SELECT correo FROM usuarios WHERE id = ?1').bind(id).first() || {}).correo) : '';
  let correoNuevo = correoAntes;
  if (b.correo !== undefined && correoUsuario(b.correo) !== correoAntes) {
    const c = correoUsuario(b.correo);
    if (!conCorreo) return jsonError(FALTA_SCRIPT_23, 503);
    if (!c) return jsonError('El correo no se puede dejar vacío.', 400);
    const mal = correoUsuarioError(c); if (mal) return jsonError(mal, 400);
    const uso = await correoEnUso(env, c, id); if (uso) return jsonError(uso, 409);
    correoNuevo = c;
  }
"""


def servidor(s):
    s = _rep(s, "async function adminListarPersonas(env) {\n  const r = await conPerfil(() => adminListarPersonasLote(env), () => adminListarPersonasLote(env));",
             "async function adminListarPersonas(env) {\n  const conCorreo = await hayCorreoUsuarios(env);\n"
             "  const r = await conPerfil(() => adminListarPersonasLote(env, conCorreo), () => adminListarPersonasLote(env, conCorreo));")
    s = _rep(s, "falta_script_22: SIN_SCRIPT_22 });", "falta_script_22: SIN_SCRIPT_22, falta_script_23: !conCorreo });")
    s = _rep(s, "function adminListarPersonasLote(env) {\n  const perfil = SIN_COLUMNA_COMUNICADOS ? 'perfil' : SQL_PERFIL;",
             "function adminListarPersonasLote(env, conCorreo) {\n  const perfil = SIN_COLUMNA_COMUNICADOS ? 'perfil' : SQL_PERFIL;\n  const correo = conCorreo ? 'correo' : 'NULL AS correo';")
    s = _rep(s, "${perfil} AS perfil, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso", "${perfil} AS perfil, ${correo}, activo, debe_cambiar, bloqueado_hasta, creado, ultimo_ingreso")
    s = _rep(s, "async function adminCrearUsuario(env, request, yo) {", SERVIDOR + "async function adminCrearUsuario(env, request, yo) {")
    # Crear
    s = _rep(s, """  if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE usuario = ?1').bind(usuario).first()) return jsonError('Ya existe un usuario "' + usuario + '".', 409);\n""",
             """  if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE usuario = ?1').bind(usuario).first()) return jsonError('Ya existe un usuario "' + usuario + '".', 409);\n""" + CREAR_VALIDAR)
    s = _rep(s, "  if (perfil === 'COMUNICADOS') pasos.push(env.DB.prepare('UPDATE usuarios SET solo_comunicados = 1 WHERE usuario = ?1').bind(usuario));\n",
             "  if (perfil === 'COMUNICADOS') pasos.push(env.DB.prepare('UPDATE usuarios SET solo_comunicados = 1 WHERE usuario = ?1').bind(usuario));\n"
             "  if (correo) pasos.push(env.DB.prepare('UPDATE usuarios SET correo = ?2 WHERE usuario = ?1').bind(usuario, correo));\n")
    s = _rep(s, ".bind(yo.id, 'ALTA_USUARIO', usuario + ' (' + PERFILES_TXT[perfil] + ')'));", ".bind(yo.id, 'ALTA_USUARIO', usuario + ' (' + PERFILES_TXT[perfil] + ')' + (correo ? ', ' + correo : '')));")
    # Editar
    s = _rep(s, "  if (u.id === yo.id && (perfil !== u.perfil || !activo)) return jsonError('No podés cambiar tu propio perfil",
             EDITAR_VALIDAR + "  if (u.id === yo.id && (perfil !== u.perfil || !activo)) return jsonError('No podés cambiar tu propio perfil")
    s = _rep(s, "  if (activo !== u.activo) cambios.push(activo ? 'activado' : 'desactivado');\n",
             "  if (activo !== u.activo) cambios.push(activo ? 'activado' : 'desactivado');\n  if (correoNuevo !== correoAntes) cambios.push('correo');\n")
    s = _rep(s, "  // Si cambia el perfil o se desactiva, se cierran sus sesiones",
             "  if (correoNuevo !== correoAntes) pasos.splice(1, 0, env.DB.prepare('UPDATE usuarios SET correo = ?2 WHERE id = ?1').bind(id, correoNuevo));\n"
             "  // Si cambia el perfil o se desactiva, se cierran sus sesiones")
    # Ruta de los contactos
    s = _rep(s, "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo(\\/envio)?$/);\n",
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo\\/contactos$/);\n"
             "  if (x) return m === 'GET' ? await contactosCorreo(env, yo, x[1]) : null;\n"
             "  x = ruta.match(/^\\/api\\/alertas\\/([0-9a-f]{32})\\/correo(\\/envio)?$/);\n")
    return s


# ---------- Administración > Usuarios ----------
CAMPO_ADMIN = """    <label class="campo" id="u-correo-campo"><span>Correo</span><input type="text" id="u-correo" maxlength="120" autocomplete="off" autocapitalize="none" spellcheck="false" inputmode="email" placeholder="nombre@empresa.com">
      <small class="ayuda" id="u-correo-ayuda">Se usa para elegir a la persona como destinatario al enviar correos desde Helios.</small></label>
"""

JS_ADMIN_ABRIR = """    var sinCorreo = !!personas.falta_script_23;
    $('u-correo').value = u ? (u.correo || '') : ''; $('u-correo').disabled = sinCorreo; $('u-correo').required = !sinCorreo && !u;
    $('u-correo-ayuda').textContent = sinCorreo ? 'Para guardar el correo falta correr el script 23 en la consola de D1.' : (u && !u.correo ? 'Todavía no tiene correo cargado: sin él no aparece para elegir como destinatario.' : 'Se usa para elegir a la persona como destinatario al enviar correos desde Helios.');
"""

JS_ADMIN_GUARDAR = r"""    if (!personas.falta_script_23) {
      var correo = $('u-correo').value.trim();
      if (correo && !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/.test(correo)) { errorForm('u-error', 'El correo no es válido. Escribilo como nombre@empresa.com.'); return; }
      datos.correo = correo;
    }
"""


def admin(h):
    h = _rep(h, '    <label class="campo"><span>Perfil</span><select id="u-perfil">', CAMPO_ADMIN + '    <label class="campo"><span>Perfil</span><select id="u-perfil">')
    h = _rep(h, "    $('u-perfil').value = u ? u.perfil : 'SOPORTE';\n", "    $('u-perfil').value = u ? u.perfil : 'SOPORTE';\n" + JS_ADMIN_ABRIR)
    h = _rep(h, "    var datos = { nombre: $('u-nombre').value.trim(), perfil: $('u-perfil').value, equipos: equipos };\n",
             "    var datos = { nombre: $('u-nombre').value.trim(), perfil: $('u-perfil').value, equipos: equipos };\n" + JS_ADMIN_GUARDAR)
    h = _rep(h, "'<br><small>' + esc(u.usuario) + '</small></td>' +",
             "'<br><small>' + esc(u.usuario) + '</small>' + (personas.falta_script_23 ? '' : '<br><small>' + (u.correo ? esc(u.correo) : '<span class=\"gris\">Sin correo cargado</span>') + '</small>') + '</td>' +")
    return h


# ---------- Detalle de la alerta: elegir destinatarios ----------
CSS = """/* Elegir destinatarios de la lista (parche 68) */
.cont-sel { margin-top: 6px; }
.cont-panel { margin-top: 6px; border: 1px solid var(--line); border-radius: 4px; background: var(--panel); padding: 8px; }
.cont-buscar { display: block; width: 100%; background: var(--input-bg, var(--panel)); color: var(--ink); border: 1px solid var(--line-input, var(--line)); padding: 6px 12px; }
.cont-lista { max-height: 232px; overflow-y: auto; margin-top: 8px; }
.cont-tit { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; color: var(--ink-3); padding: 8px 4px 4px; }
.cont-fila { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border: 0; background: transparent; color: var(--ink); border-radius: 3px; padding: 6px 8px; cursor: pointer; font: inherit; }
.cont-fila:hover { background: var(--btn-bg); }
.cont-fila:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cont-txt { min-width: 0; display: flex; flex-direction: column; }
.cont-txt b { font-size: 14px; font-weight: 600; }
.cont-txt small { font-size: 12.5px; color: var(--ink-3); overflow-wrap: anywhere; }
.cont-marca { flex: none; width: 18px; height: 18px; border: 1.5px solid var(--line-input, var(--ink-3)); border-radius: 3px; position: relative; background: var(--panel); }
.cont-marca.si, .cont-marca.parte { background: var(--accent); border-color: var(--accent); }
.cont-marca.si::after { content: ''; position: absolute; left: 5px; top: 1px; width: 5px; height: 10px; border: solid var(--sobre-accent); border-width: 0 2px 2px 0; transform: rotate(45deg); }
.cont-marca.parte::after { content: ''; position: absolute; left: 3px; top: 7px; width: 9px; height: 2px; background: var(--sobre-accent); }
.cont-nota, .cont-vacio { margin: 8px 4px 0; font-size: 12.5px; color: var(--ink-3); }
.cont-nota:empty { display: none; }
"""

JS = r"""  // ---- Elegir destinatarios de la lista de personas y equipos (parche 68) ----
  var contactos = null, contactosPed = null, SELECTORES = {};
  function cargarContactos() {
    if (contactos) return Promise.resolve(contactos);
    if (!contactosPed) contactosPed = pedir('/api/alertas/' + ID + '/correo/contactos').then(function (r) { contactos = r; return r; }).catch(function () { contactosPed = null; return null; });
    return contactosPed;
  }
  function correosDe(inp) { return listaCorreos(inp.value).map(function (x) { return x.toLowerCase(); }); }
  function ponerCorreos(inp, lista) { inp.value = lista.join('; '); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  function montarSelector(idInp) {
    if (SELECTORES[idInp]) return SELECTORES[idInp];
    var inp = $(idInp), lab = inp && inp.closest('label'); if (!lab) return null;
    var box = document.createElement('div'); box.className = 'cont-sel'; box.hidden = true;
    box.innerHTML = '<button type="button" class="btn chico cont-abrir" aria-expanded="false">Elegir de la lista</button>' +
      '<div class="cont-panel" hidden><input type="text" class="cont-buscar" autocomplete="off" placeholder="Buscar por nombre, equipo o correo" aria-label="Buscar personas o equipos">' +
      '<div class="cont-lista" role="group" aria-label="Personas y equipos"></div><p class="cont-nota"></p></div>';
    lab.parentNode.insertBefore(box, lab.nextSibling);
    var abrir = box.querySelector('.cont-abrir'), panel = box.querySelector('.cont-panel'), buscar = box.querySelector('.cont-buscar'), lista = box.querySelector('.cont-lista'), nota = box.querySelector('.cont-nota');
    function pintar() {
      var c = contactos; if (!c) return;
      var q = buscar.value.trim().toLowerCase(), en = correosDe(inp), h = '';
      var es = c.equipos.filter(function (e) { return !q || e.nombre.toLowerCase().indexOf(q) >= 0; });
      var ps = c.personas.filter(function (p) { return !q || p.nombre.toLowerCase().indexOf(q) >= 0 || p.correo.toLowerCase().indexOf(q) >= 0; });
      if (es.length) h += '<div class="cont-tit">Equipos</div>' + es.map(function (e) {
        var n = e.correos.filter(function (x) { return en.indexOf(x.toLowerCase()) >= 0; }).length, est = n === e.correos.length ? 'si' : n ? 'parte' : 'no';
        return '<button type="button" class="cont-fila" data-e="' + e.id + '" aria-pressed="' + (est === 'si' ? 'true' : est === 'parte' ? 'mixed' : 'false') + '"><span class="cont-marca ' + est + '"></span>' +
          '<span class="cont-txt"><b>' + esc(e.nombre) + '</b><small>' + e.correos.length + (e.correos.length === 1 ? ' persona' : ' personas') + '</small></span></button>';
      }).join('');
      if (ps.length) h += '<div class="cont-tit">Personas</div>' + ps.map(function (p) {
        var si = en.indexOf(p.correo.toLowerCase()) >= 0;
        return '<button type="button" class="cont-fila" data-p="' + p.id + '" aria-pressed="' + si + '"><span class="cont-marca ' + (si ? 'si' : 'no') + '"></span>' +
          '<span class="cont-txt"><b>' + esc(p.nombre) + '</b><small>' + esc(p.correo) + '</small></span></button>';
      }).join('');
      lista.innerHTML = h || '<p class="cont-vacio">' + (q ? 'No hay coincidencias.' : 'Todavía no hay personas con correo cargado.') + '</p>';
      nota.textContent = c.sin_correo ? c.sin_correo + (c.sin_correo === 1 ? ' persona todavía no tiene' : ' personas todavía no tienen') + ' correo cargado: lo completa el Administrador en Usuarios.' : '';
    }
    abrir.addEventListener('click', function () {
      var ab = panel.hidden; panel.hidden = !ab; abrir.setAttribute('aria-expanded', ab ? 'true' : 'false');
      if (ab) { pintar(); buscar.focus(); }
    });
    buscar.addEventListener('input', pintar);
    buscar.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') ev.preventDefault(); });   // Enter no envía el formulario
    inp.addEventListener('input', function () { if (!panel.hidden) pintar(); });
    lista.addEventListener('click', function (ev) {
      var b = ev.target.closest('.cont-fila'); if (!b || !contactos) return;
      var actual = listaCorreos(inp.value), minus = actual.map(function (x) { return x.toLowerCase(); }), cs;
      if (b.getAttribute('data-e')) cs = (contactos.equipos.filter(function (e) { return e.id === Number(b.getAttribute('data-e')); })[0] || { correos: [] }).correos;
      else cs = contactos.personas.filter(function (p) { return p.id === Number(b.getAttribute('data-p')); }).map(function (p) { return p.correo; });
      var csMin = cs.map(function (x) { return x.toLowerCase(); }), estan = csMin.every(function (x) { return minus.indexOf(x) >= 0; });
      if (estan) ponerCorreos(inp, actual.filter(function (x) { return csMin.indexOf(x.toLowerCase()) < 0; }));
      else ponerCorreos(inp, actual.concat(cs.filter(function (x) { return minus.indexOf(x.toLowerCase()) < 0; })));
      pintar();
    });
    var sel = {
      mostrar: function (c) { box.hidden = !c || !!c.falta_script; panel.hidden = true; abrir.setAttribute('aria-expanded', 'false'); buscar.value = ''; pintar(); }
    };
    SELECTORES[idInp] = sel; return sel;
  }
  function selectoresCorreo(ids) {
    var ms = ids.map(montarSelector).filter(Boolean);
    cargarContactos().then(function (c) { ms.forEach(function (m) { m.mostrar(c); }); });
  }
"""


def alerta(h):
    i = h.index('</style>'); h = h[:i] + CSS + h[i:]
    h = _rep(h, "  function listaCorreos(v) {", JS + "  function listaCorreos(v) {")
    h = _rep(h, "    $('dlg-correo').showModal(); $('m-para').focus();", "    $('dlg-correo').showModal(); $('m-para').focus(); selectoresCorreo(['m-para', 'm-cc']);")
    h = _rep(h, "    $('dlg-envio').showModal();", "    $('dlg-envio').showModal(); selectoresCorreo(['e-para', 'e-cc']);")
    return h


def aplicar(s):
    s = servidor(s)
    s = _html(s, 'ADMIN_HTML', admin)
    s = _html(s, 'ALERTA_HTML', alerta)
    return s
