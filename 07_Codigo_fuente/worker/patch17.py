# Paso 17 del build: etapa 4 (derivación automática + campanita de avisos)
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    leer = lambda n: open(os.path.join(AQUI, n)).read().strip()
    # --- Servidor ---
    k = s.index('export default {')
    s = s[:k] + leer('avisos_server.js') + '\n\n' + s[k:]
    s = rep(s, """      // Asignación de alertas y "Mis alertas": controla sus propios permisos
""", """      // Campanita de avisos (/api/avisos...)
      const avisosR = await rutasAvisos(env, request, ruta, yo);
      if (avisosR) return avisosR;
      // Asignación de alertas y "Mis alertas": controla sus propios permisos
""")
    s = rep(s, """  try {
    // Las reglas personalizadas se registran antes de los cierres, igual que las del sistema
""", """  try {
    // Alertas con dueño antes de revisar: si se cierran solas, se le avisa a la persona
    const antes = await asignadasAbiertas(env);
    // Las reglas personalizadas se registran antes de los cierres, igual que las del sistema
""")
    s = rep(s, """    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];
    return {
      ok: true,""", """    const pasos = [registrar, personalizadas, normalizadas, desaparecidas];
    // Derivación automática de lo que quedó sin asignar y avisos de la campanita
    const post = await derivarYAvisar(env, antes);
    return {
      ok: true,
      derivadas_automaticamente: post.derivadas_automaticamente,""")
    s = rep(s, "    env.DB.prepare('DELETE FROM alerta_eventos'),\n",
               "    env.DB.prepare('DELETE FROM alerta_eventos'),\n    env.DB.prepare('DELETE FROM avisos'),\n")
    s = rep(s, "//   GET  /mis-alertas, POST /api/alertas/<id>/(derivar|tomar|comentar|devolver|resolver)  asignación\n",
               "//   GET  /mis-alertas, POST /api/alertas/<id>/(derivar|tomar|comentar|devolver|resolver)  asignación\n"
               "//   GET  /api/avisos, /api/avisos/contador   campanita (ver DERIVACIÓN AUTOMÁTICA Y CAMPANITA)\n")

    # --- Campanita en las tres páginas ---
    c = leer('campanita.html')
    css = c[c.index('<!--CSS-->') + 10:c.index('<!--BOTON-->')].strip()
    boton = c[c.index('<!--BOTON-->') + 12:c.index('<!--SCRIPT-->')].strip()
    script = c[c.index('<!--SCRIPT-->') + 13:].strip()
    def campanita(h):
        h = rep(h, '</style>', css + '\n</style>')
        h = rep(h, '    <div class="usuario">', '    ' + boton.replace('\n', '\n    ') + '\n    <div class="usuario">')
        h = rep(h, '</body>', script + '\n</body>')
        return h
    for nombre in ['HTML', 'ADMIN_HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML']:
        i = s.index('const ' + nombre + ' = '); j = s.index(';\n', i)
        h = json.loads(s[i + len('const ' + nombre + ' = '):j])
        if '</style>' in h and h.count('</style>') > 1:
            raise Exception('más de un </style> en ' + nombre)
        h = campanita(h)
        s = s[:i] + 'const ' + nombre + ' = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
