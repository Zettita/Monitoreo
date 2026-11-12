# Paso 23 del build: feriados (tabla, API argentinadatos, silenciar alertas por servicio) + aviso en el tablero
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    k = s.index('export default {')
    s = s[:k] + open(os.path.join(AQUI, 'feriados_server.js')).read().strip() + '\n\n' + s[k:]
    # El cron mantiene los feriados al día (también con el reloj de la demo)
    s = rep(s, """    try {
      // Con el reloj simulado (alerta_parametros.ahora) el tiempo no avanza solo:""", """    try {
      // Feriados: si falta el año en curso (o el siguiente, desde octubre), se traen de la API
      try { const f = await feriadosAlDia(env); if (f.length) console.log('Feriados: ' + JSON.stringify(f)); } catch (e) { console.error('Feriados: ' + e.message); }
      // Con el reloj simulado (alerta_parametros.ahora) el tiempo no avanza solo:""")
    # El tablero sabe si hoy (hora de Argentina) es feriado
    s = rep(s, """      env.DB.prepare(Q_UMBRALES_TABLERO),
    ]);
    return {""", """      env.DB.prepare(Q_UMBRALES_TABLERO),
      env.DB.prepare(`SELECT f.fecha, f.nombre FROM feriados f WHERE f.fecha = (SELECT date(COALESCE(ahora, 'now'), '-3 hours') FROM alerta_parametros WHERE id = 1)`),
    ]);
    return {
      feriado_hoy: r[8].results[0] || null,""")
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    h = rep(h, "    $('aviso').hidden = !avisos.length; $('aviso').textContent = avisos.join(' ');",
               "    if (d.feriado_hoy) avisos.push('Hoy es feriado (' + d.feriado_hoy.nombre + '): los servicios con las alertas silenciadas en feriados no generan alertas.');\n"
               "    $('aviso').hidden = !avisos.length; $('aviso').textContent = avisos.join(' ');")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
