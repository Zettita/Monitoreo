# Parche 71: el asistente dentro de la sala responde las preguntas libres (sin SQL).
#
# Probado con Gemma en Cloudflare (20/11, Ale, Analista, sala IM-4): a "¿Escalo esto al proveedor?" respondió
# "dejame consultar la herramienta de contexto externo…" y no consultó nada ni dejó el botón Escalar.
#   - Pregunta libre dentro de la sala: además de estado_incidente van tareas_incidente siempre, guia_diagnostico si la
#     pregunta habla de escalar, revisar, causas o componentes, y contexto_externo si habla de proveedores o de afuera
#     (máximo 4). Con una guía corta: responder con esos datos y no anunciar consultas.
#   - "Escalo…?": si el modelo no dejó la propuesta y no dijo que no hace falta, el servidor arma el botón "Escalar"
#     (a la persona de Soporte con menos tareas abiertas en salas; se puede cambiar el texto antes de confirmar).
#   - En cualquier pregunta (no solo en la sala): si el modelo contesta "dejame consultar…" sin pedir la herramienta,
#     se le pide una vez más que use las herramientas o responda con lo que tiene.
import os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


FUNCIONES = r"""
// ---------- Pregunta libre dentro de la sala (parche 71) ----------
const SALA_PALABRAS_GUIA = /escal|proveedor|revis|causa|componente|depend|antecedente|parecid|diagn|por d[oó]nde|empiez|qu[eé] hago|qu[eé] miro|tercer/i;
const SALA_PALABRAS_AFUERA = /proveedor|extern|afuera|cloudflare|twilio|tercer|noticia|paro|corte/i;
function salaElegir(pregunta, disponibles) {
  const out = ['estado_incidente', 'tareas_incidente'];
  if (SALA_PALABRAS_GUIA.test(pregunta)) out.push('guia_diagnostico');
  if (SALA_PALABRAS_AFUERA.test(pregunta)) out.push('contexto_externo');
  return out.filter((n) => disponibles.includes(n)).slice(0, 4);
}
const SALA_GUIA_LIBRE = 'Respondé con estos datos de la sala, en pocas frases y en español. No digas que vas a consultar algo: ya lo tenés. Si falta un dato, decí cuál. ' +
  'Si preguntan si conviene escalar: decidilo con las tareas hechas y abiertas, las dependencias de la guía (por ejemplo, el proveedor) y, si está, lo de afuera; si conviene, proponelo con sugerir_accion (tipo escalar).';
// "¿Escalo…?": botón armado por el servidor si el modelo no lo dejó (a la persona de Soporte con menos tareas abiertas en salas)
function salaProponerEscalar(d, incidenteId) {
  const t = (d && d.tareas_incidente) || {}, e = (d && d.estado_incidente) || {};
  const personas = ((t.opciones_asignacion || {}).personas_soporte || []).slice().sort((x, y) => x.tareas_abiertas - y.tareas_abiertas);
  if (!personas.length) return null;
  const motivo = (e.sala || 'La sala') + ' sigue ' + String(e.estado || 'abierta').toLowerCase() + (e.problema_desde ? '; el problema empezó ' + e.problema_desde : '') + '.';
  return { tipo: 'escalar', incidente_id: incidenteId, usuario_id: personas[0].usuario_id, motivo, comentario: motivo + ' Hace falta escalarlo (por ejemplo, al proveedor).' };
}
// El modelo anunció que iba a consultar algo en vez de pedir la herramienta
const ASIST_PROMESA = /\b(d[eé]jame|voy a|necesito|tengo que|perm[ií]teme|d[eé]jenme|vamos a)\s+(consultar|revisar|buscar|usar|chequear|verificar|mirar|ver)\b/i;
"""


def aplicar(s):
    s = _rep(s, '\n// ---------- Propuestas de la sala ----------', FUNCIONES + '\n// ---------- Propuestas de la sala ----------')
    # Pregunta libre en la sala: más datos según la pregunta, y una guía corta
    s = _rep(s, "  if (entrada.incidente_id && !entrada.sugerencia) directas.push(['estado_incidente', { incidente_id: entrada.incidente_id }]);   // pregunta libre dentro de la sala\n",
             "  const salaLibre = !!(entrada.incidente_id && !entrada.sugerencia);\n"
             "  if (salaLibre) for (const n of salaElegir(entrada.pregunta, disponibles))   // pregunta libre dentro de la sala (parche 71)\n"
             "    directas.push([n, n === 'contexto_externo' ? ASIST_ARGS.contexto_externo(entrada.pregunta) : { incidente_id: entrada.incidente_id }]);\n")
    s = _rep(s, "    if (entrada.sugerencia && entrada.sugerencia.guia) pregunta += '\\n\\nCómo responder: '",
             "    if (salaLibre) pregunta += '\\n\\nCómo responder: ' + SALA_GUIA_LIBRE;\n"
             "    if (entrada.sugerencia && entrada.sugerencia.guia) pregunta += '\\n\\nCómo responder: '")
    # Anunció una consulta sin hacerla: una vuelta más
    s = _rep(s, "  let texto = '', crudo = '';\n  for (let vuelta = 0; vuelta < ASIST_MAX_VUELTAS; vuelta++) {",
             "  let texto = '', crudo = '', insistio = false;\n  for (let vuelta = 0; vuelta < ASIST_MAX_VUELTAS; vuelta++) {")
    s = _rep(s, "    if (!r.llamadas.length || ultima) { texto = r.texto; break; }",
             "    if (!r.llamadas.length && !ultima && !insistio && ASIST_PROMESA.test(r.texto || '')) {\n"
             "      insistio = true;\n"
             "      mensajes.push({ role: 'assistant', content: r.texto }, { role: 'user', content: 'No anuncies consultas: si te falta un dato, pedí la herramienta ahora; si no, respondé ya con lo que tenés.' });\n"
             "      continue;\n"
             "    }\n"
             "    if (!r.llamadas.length || ultima) { texto = r.texto; break; }")
    # "¿Escalo…?" en la sala: el botón lo deja el servidor si el modelo no lo hizo
    s = _rep(s, "  texto = asistLimpiarTexto(texto);\n  if (Object.keys(enlaces).length) texto = asistEnlaces(texto, enlaces);",
             "  if (salaLibre && /escal/i.test(entrada.pregunta) && !acciones.some((a) => a.tipo === 'escalar') && !/no (hace falta|conviene|es necesario|corresponde|har[ií]a falta) escalar/i.test(texto || '')) {\n"
             "    const p = salaProponerEscalar(datosDirectos, entrada.incidente_id);\n"
             "    const antes = acciones.length;\n"
             "    if (p) await correrHerramienta('sugerir_accion', p);\n"
             "    if (acciones.length > antes && texto) texto += '\\n\\nTe dejo el botón para escalar: revisá a quién y el texto antes de confirmarlo.';\n"
             "  }\n"
             "  texto = asistLimpiarTexto(texto);\n  if (Object.keys(enlaces).length) texto = asistEnlaces(texto, enlaces);")
    return s
