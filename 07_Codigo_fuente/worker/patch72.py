# Parche 72: el asistente ya no muestra llamadas escritas como texto y el botón Escalar dice quién lo gestiona (sin SQL).
#
# Probado por Ale con Gemma (sala IM-4, Analista, "¿Escalo esto al proveedor?"):
#   - Gemma escribió la propuesta como texto: sugerir_accion(tipo="escalar", incidente_id=4, motivo="…"). Ahora una llamada
#     escrita así (nombre_de_herramienta(clave="valor", …)) se lee como llamada de verdad y se borra del texto; si quedara
#     alguna en la respuesta final, también se borra.
#   - La tarjeta decía "Escalar el incidente a Uriel Solnik" y parecía que Uriel era el proveedor. Escalar crea una tarea
#     para una persona de Soporte que contacta al proveedor: la tarjeta dice "Escalar el incidente · lo gestiona Uriel Solnik"
#     y el texto del botón armado por el servidor usa el motivo que escribió el modelo (sin repetirlo dos veces).
#   - La guía de la pregunta libre en la sala aclara que Soporte no es el proveedor y que no escriba la llamada ni pida "Hacerlo".
import json
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML', 'COMUNICADOS_HTML', 'SALA_CRISIS_HTML']


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


FUNCIONES = r"""
// ---------- Llamadas escritas como texto: nombre(clave="valor", …) (parche 72) ----------
const ASIST_ARG_TEXTO = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(-?\d+(?:\.\d+)?)|(true|false|null))/g;
function asistLlamadasEnTexto(texto, nombres) {
  const lista = [];
  if (!texto || !nombres || !nombres.length) return { texto, lista };
  const re = new RegExp('`*\\b(' + nombres.map((n) => n.replace(/\W/g, '')).join('|') + ')\\(((?:"(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|[^()"\'])*)\\)`*', 'g');
  const limpio = texto.replace(re, (m, nom, cuerpo) => {
    if (cuerpo.trim() && !/=/.test(cuerpo)) return m;   // texto común con paréntesis: no es una llamada
    const args = {};
    for (const a of cuerpo.matchAll(ASIST_ARG_TEXTO)) args[a[1]] = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? Number(a[4]) : a[5] === 'true' ? true : a[5] === 'false' ? false : null;
    lista.push({ id: 'texto_' + lista.length, nombre: nom, args });
    return '';
  });
  return { texto: limpio.replace(/\n{3,}/g, '\n\n').trim(), lista };
}
const asistBorrarLlamadasEnTexto = (t) => asistLlamadasEnTexto(t, Object.keys(ASIST_HERRAMIENTAS).concat(['sugerir_accion'])).texto;
"""


def servidor(s):
    s = _rep(s, '\n// Una pregunta completa: datos permitidos + hasta 3 vueltas con el modelo.', FUNCIONES + '\n// Una pregunta completa: datos permitidos + hasta 3 vueltas con el modelo.')
    # La llamada escrita como texto se lee como llamada
    s = _rep(s, "  // Hay modelos que devuelven la llamada como texto JSON en vez de usar tool_calls\n",
             "  // Llamada escrita como texto: sugerir_accion(tipo=\"escalar\", …) (parche 72)\n"
             "  if (!n.llamadas.length && nombres) { const x = asistLlamadasEnTexto(n.texto, nombres); if (x.lista.length) return { texto: x.texto, llamadas: x.lista }; }\n"
             "  // Hay modelos que devuelven la llamada como texto JSON en vez de usar tool_calls\n")
    # Y si queda alguna en la respuesta final, se borra
    s = _rep(s, "  texto = asistLimpiarTexto(texto);\n  if (Object.keys(enlaces).length) texto = asistEnlaces(texto, enlaces);",
             "  texto = asistLimpiarTexto(asistBorrarLlamadasEnTexto(texto));\n  if (Object.keys(enlaces).length) texto = asistEnlaces(texto, enlaces);")
    # Motivo que escribió el modelo para escalar (aunque le faltara a quién): lo usa el botón armado por el servidor
    s = _rep(s, "  const acciones = [], usadas = [], enlaces = {};\n  let consultas = 0;\n  const correrHerramienta = async (nombre, args) => {",
             "  const acciones = [], usadas = [], enlaces = {};\n  let consultas = 0, motivoEscalar = null;\n  const correrHerramienta = async (nombre, args) => {")
    s = _rep(s, "      const p = await asistValidarAccion(env, yo, args || {});\n      if (p.error) return p;\n      if (!acciones.some((x) => x.tipo === p.tipo && (x.clave",
             "      const p = await asistValidarAccion(env, yo, args || {});\n"
             "      if (p.error) { if (args && args.tipo === 'escalar' && (args.motivo || args.comentario)) motivoEscalar = String(args.comentario || args.motivo).slice(0, 600); return p; }\n"
             "      if (!acciones.some((x) => x.tipo === p.tipo && (x.clave")
    s = _rep(s, "    const p = salaProponerEscalar(datosDirectos, entrada.incidente_id);",
             "    const p = salaProponerEscalar(datosDirectos, entrada.incidente_id, motivoEscalar);")
    s = _rep(s, "    if (acciones.length > antes && texto) texto += '\\n\\nTe dejo el botón para escalar: revisá a quién y el texto antes de confirmarlo.';",
             "    if (acciones.length > antes && texto) texto += '\\n\\nTe dejo el botón para escalar: queda como tarea para quien lo gestiona (revisá a quién y el texto antes de confirmarlo).';")
    # Botón armado por el servidor: el texto es el motivo del modelo, o uno armado; el motivo explica qué hace la tarea
    s = _rep(s, """function salaProponerEscalar(d, incidenteId) {""", """function salaProponerEscalar(d, incidenteId, motivoModelo) {""")
    s = _rep(s, """  const motivo = (e.sala || 'La sala') + ' sigue ' + String(e.estado || 'abierta').toLowerCase() + (e.problema_desde ? '; el problema empezó ' + e.problema_desde : '') + '.';
  return { tipo: 'escalar', incidente_id: incidenteId, usuario_id: personas[0].usuario_id, motivo, comentario: motivo + ' Hace falta escalarlo (por ejemplo, al proveedor).' };""",
             """  const situacion = (e.sala || 'La sala') + ' sigue ' + String(e.estado || 'abierta').toLowerCase() + (e.problema_desde ? '; el problema empezó ' + e.problema_desde : '') + '.';
  return { tipo: 'escalar', incidente_id: incidenteId, usuario_id: personas[0].usuario_id,
    motivo: 'Queda como tarea para una persona de Soporte, que contacta al proveedor y anota la respuesta en la sala.',
    comentario: motivoModelo ? motivoModelo + ' ' + situacion : situacion + ' Hay que escalarlo al proveedor.' };""")
    s = _rep(s, "'Si preguntan si conviene escalar: decidilo con las tareas hechas y abiertas, las dependencias de la guía (por ejemplo, el proveedor) y, si está, lo de afuera; si conviene, proponelo con sugerir_accion (tipo escalar).';",
             "'Si preguntan si conviene escalar: decidilo con las tareas hechas y abiertas, las dependencias de la guía (por ejemplo, el proveedor) y, si está, lo de afuera; si conviene, proponelo con sugerir_accion (tipo escalar). ' +\n"
             "  'Escalar crea una tarea para una persona de Soporte de Helios, que es quien contacta al proveedor: las personas de Soporte no son el proveedor. ' +\n"
             "  'No escribas la llamada a sugerir_accion en el texto ni pidas tocar \"Hacerlo\": el botón aparece solo.';")
    return s


def tarjeta(h):
    return _rep(h, "(p.destino ? ' a ' + escA(p.destino) : '')",
                "(p.destino ? (p.tipo === 'escalar' ? ' · lo gestiona ' : ' a ') + escA(p.destino) : '')")


def aplicar(s):
    s = servidor(s)
    for n in PAGINAS:
        s = _html(s, n, tarjeta)
    return s
