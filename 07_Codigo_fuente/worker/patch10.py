# Paso 10 del build: línea de tiempo con barritas de 15 minutos (96 en 24 h)
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    # La consulta de series trae la primera ventana real y cubre 25 h (la primera barrita queda dentro)
    s = rep(s, "    COUNT(*)                                             AS ventanas,\n    strftime('%Y-%m-%dT%H:%M:%SZ', MAX(o.ventana_fin))   AS ultima_ventana_fin\nFROM core_metricas_observadas o\nWHERE o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-24 hours')",
               "    COUNT(*)                                             AS ventanas,\n    strftime('%Y-%m-%dT%H:%M:%SZ', MAX(o.ventana_fin))   AS ultima_ventana_fin,\n    strftime('%Y-%m-%dT%H:%M:%SZ', MIN(o.ventana_inicio)) AS primera_ventana_inicio\nFROM core_metricas_observadas o\nWHERE o.ventana_inicio >= (SELECT strftime('%Y-%m-%dT%H:%M:%S', COALESCE(ahora, 'now'), '-25 hours')")
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])
    h = rep(h, "grid-template-columns: repeat(48, minmax(0, 1fr)); gap: 3px;", "grid-template-columns: repeat(96, minmax(0, 1fr)); gap: 1px;")
    h = rep(h, ".barras i { display: block; border-radius: 3px;", ".barras i { display: block; border-radius: 2px;")
    h = rep(h, ".barras { gap: 2px; height: 28px; }", ".barras { gap: 1px; height: 28px; }")
    h = rep(h, "Cada barrita es media hora.", "Cada barrita es una ventana de 15 minutos.")
    h = rep(h, "// ---- Cómo estuvo cada cliente: 48 barras de 30 minutos ----", "// ---- Cómo estuvo cada cliente: 96 barras de 15 minutos ----")
    h = rep(h, "    // Termina en la media hora de los últimos datos que ya tenían que llegar (ahora menos la gracia)\n    var fin = Math.ceil((ahoraMs(d) - gracia) / 1800e3) * 1800e3, N = 48, paso = 1800e3,",
               "    // La última barrita es la última ventana que ya tenía que llegar (ahora menos la gracia)\n    var fin = Math.floor((ahoraMs(d) - gracia) / 900e3) * 900e3, N = 96, paso = 900e3,")
    h = rep(h, "var pr = u - (s.ventanas || 0) * 15 * 60e3; if (pr < c.primera) c.primera = pr;   // aprox.: ventanas de 15 min seguidas",
               "var pr = s.primera_ventana_inicio ? aFecha(s.primera_ventana_inicio).getTime() : u - (s.ventanas || 0) * 15 * 60e3; if (pr < c.primera) c.primera = pr;")
    h = rep(h, "var eje = [0, 12, 24, 36, 48].map(", "var eje = [0, 24, 48, 72, 96].map(")
    h = rep(h, "style=\"animation-delay:' + (n * 10) + 'ms\"", "style=\"animation-delay:' + (n * 5) + 'ms\"")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
