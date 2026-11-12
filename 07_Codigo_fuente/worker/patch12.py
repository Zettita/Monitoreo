# Paso 12 del build: sin actualización automática y fechas de los filtros en DD/MM/AAAA
import json
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i+len('const HTML = '):j])

    # 1) Sin actualización automática: solo al abrir la página, con "Actualizar" y con las acciones
    a = h.index("  // Actualización automática: cada 5 minutos")
    b = h.index("})();\n</script>", a)
    h = h[:a] + "  // Sin actualización automática: los datos se cargan al abrir la página, con el botón\n  // \"Actualizar\", con los botones de la demo y al tomar o resolver una alerta.\n  cargar();\n" + h[b:]
    h = rep(h, "'. Se actualiza solo cada 5 minutos mientras la página está a la vista.'",
               "'. Para ver datos nuevos tocá \"Actualizar\".'")

    # 2) Filtros de fecha como texto DD/MM/AAAA
    h = h.replace('<input type="date" data-lado="desde">', '<input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-lado="desde">')
    h = h.replace('<input type="date" data-lado="hasta">', '<input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" data-lado="hasta">')
    assert h.count('placeholder="DD/MM/AAAA"') == 4
    h = rep(h, "      inp.min = min; inp.max = hoy; inp.value = filtros[k][inp.getAttribute('data-lado')];",
               "      inp.value = aDMA(filtros[k][inp.getAttribute('data-lado')]); inp.classList.remove('error');\n      inp.title = 'Entre el ' + aDMA(min) + ' y el ' + aDMA(hoy);")
    h = rep(h, "  function enRango(i, r) {", """  // AAAA-MM-DD <-> DD/MM/AAAA
  function aDMA(f) { return f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) : ''; }
  function deDMA(t) {
    var m = /^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/.exec(t || ''); if (!m) return null;
    var f = m[3] + '-' + m[2] + '-' + m[1], d = new Date(f + 'T12:00:00Z');
    return isNaN(d) || d.toISOString().slice(0, 10) !== f ? null : f;
  }
  function enRango(i, r) {""")
    a = h.index("  document.addEventListener('change', function (ev) {\n    var inp = ev.target.closest('.filtro-fechas input[data-lado]');")
    b = h.index("  });\n", a) + 6
    h = h[:a] + r"""  // Mientras se escribe, agrega las barras: 26102026 -> 26/10/2026
  document.addEventListener('input', function (ev) {
    var inp = ev.target.closest('.filtro-fechas input[data-lado]');
    if (!inp) return;
    var n = inp.value.replace(/\D/g, '').slice(0, 8);
    inp.value = n.length > 4 ? n.slice(0, 2) + '/' + n.slice(2, 4) + '/' + n.slice(4) : n.length > 2 ? n.slice(0, 2) + '/' + n.slice(2) : n;
    if (n.length === 8) aplicarFecha(inp);
  });
  document.addEventListener('change', function (ev) {
    var inp = ev.target.closest('.filtro-fechas input[data-lado]');
    if (inp) aplicarFecha(inp);
  });
  function aplicarFecha(inp) {
    var k = inp.parentNode.parentNode.getAttribute('data-filtro'), r = filtros[k], f = deDMA(inp.value);
    if (!r || !datos) return;
    var hoy = fechaArg(ahoraMs(datos)), min = corrDias(hoy, -29);
    if (!f || f < min || f > hoy) { inp.classList.add('error'); return; }
    inp.classList.remove('error');
    r[inp.getAttribute('data-lado')] = f;
    if (r.desde > r.hasta) { if (inp.getAttribute('data-lado') === 'desde') r.hasta = r.desde; else r.desde = r.hasta; }
    pintarPasado(datos);
  }
""" + h[b:]
    h = rep(h, ".filtro-fechas input {", ".filtro-fechas input.error { border-color: var(--critica); outline: 1px solid var(--critica); }\n.filtro-fechas input {")
    h = rep(h, "padding: 3px 6px; color-scheme: light dark; }", "padding: 3px 8px; width: 8.2em; text-align: center; font-variant-numeric: tabular-nums; }")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
