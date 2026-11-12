# Paso 20 del build: umbrales configurables por cliente (servidor + tablero: prioridad P1-P4 y objetivo de disponibilidad)
import json, os
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    def rep(txt, a, b):
        assert txt.count(a) == 1, ('no encontrado/duplicado', a[:90])
        return txt.replace(a, b, 1)
    leer = lambda n: open(os.path.join(AQUI, n)).read().strip()
    k = s.index('export default {')
    s = s[:k] + leer('umbrales_server.js') + '\n\n' + s[k:]
    s = rep(s, "//   GET  /admin, /api/admin/...          administración (ver ADMINISTRACIÓN)\n",
               "//   GET  /admin, /api/admin/...          administración (ver ADMINISTRACIÓN y UMBRALES CONFIGURABLES)\n")
    # El tablero trae la criticidad y el objetivo de cada cliente (unas pocas filas)
    s = rep(s, """      env.DB.prepare(Q_EVENTOS_ABIERTAS),
    ]);
    return {""", """      env.DB.prepare(Q_EVENTOS_ABIERTAS),
      env.DB.prepare(Q_UMBRALES_TABLERO),
    ]);
    return {""")
    s = rep(s, "      eventos: r[6].results,\n      cache_recalculado", "      eventos: r[6].results,\n      umbrales: r[7].results,\n      cache_recalculado")

    i = s.index('const HTML = '); j = s.index(';\n', i)
    h = json.loads(s[i + len('const HTML = '):j])
    css = """/* Prioridad (severidad x criticidad del servicio) y objetivo de disponibilidad */
.prio { display: inline-block; min-width: 30px; padding: 0 6px; border-radius: 3px; border: 1px solid; font-size: 12px; font-weight: 700; line-height: 18px; text-align: center; }
.prio.p1 { background: var(--critica-bg); color: var(--critica-txt); border-color: var(--critica); }
.prio.p2 { background: var(--alta-bg); color: var(--alta-txt); border-color: var(--alta); }
.prio.p3 { background: var(--media-bg); color: var(--media-txt); border-color: var(--media); }
.prio.p4 { background: var(--baja-bg); color: var(--baja-txt); border-color: var(--line); }
.dia .resumen .obj { display: block; margin-top: 2px; font-size: 12px; }
.dia .resumen .obj.ok { color: var(--ok-txt); }
.dia .resumen .obj.mal { color: var(--critica-txt); font-weight: 600; }
"""
    h = rep(h, '.toast {', css + '.toast {')
    js = """  // ---- Umbrales del cliente (criticidad y objetivo): el más específico gana ----
  var CRIT_TXT = { ALTA: 'alta', MEDIA: 'media', BAJA: 'baja' };
  var MATRIZ_PRIORIDAD = { CRITICA: { ALTA: 1, MEDIA: 2, BAJA: 3 }, ALTA: { ALTA: 2, MEDIA: 3, BAJA: 3 }, MEDIA: { ALTA: 3, MEDIA: 4, BAJA: 4 }, BAJA: { ALTA: 4, MEDIA: 4, BAJA: 4 } };
  function umbralDe(d, cli, srv, campo) {
    var u = d.umbrales || [], f;
    if (srv) { f = u.filter(function (x) { return x.cliente_id === cli && x.servicio_id === srv; })[0]; if (f && f[campo] != null) return f[campo]; }
    f = u.filter(function (x) { return x.cliente_id === cli && x.servicio_id === '*'; })[0]; if (f && f[campo] != null) return f[campo];
    f = u.filter(function (x) { return x.cliente_id === '*'; })[0]; return f ? f[campo] : null;
  }
  function prioridadUmbral(d, r, s) {
    var c = umbralDe(d, r.cliente_id, r.servicio_id, 'criticidad') || 'MEDIA';
    return { p: (MATRIZ_PRIORIDAD[s] || MATRIZ_PRIORIDAD.BAJA)[c] || 4, crit: c };
  }
  function prioChip(x, s) {
    return '<span class="prio p' + x.p + '" title="' + esc((SEV_TXT[s] || s) + ' en un servicio de criticidad ' + CRIT_TXT[x.crit]) + '">P' + x.p + '</span>';
  }
  function pctTxt(v) { return (Math.round(v * 1000) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }); }

  // ---- Qué está pasando ahora ----
"""
    h = rep(h, "  // ---- Qué está pasando ahora ----\n", js)
    h = rep(h, """    a.forEach(function (g) {
      g.eventos = (d.eventos || []).filter(function (e) { return g.ids.indexOf(e.alerta_id) >= 0; });""",
               """    a.forEach(function (g) {
      g.prio = prioridadUmbral(d, g.ult, g.sev);
      g.eventos = (d.eventos || []).filter(function (e) { return g.ids.indexOf(e.alerta_id) >= 0; });""")
    h = rep(h, "    a.sort(function (x, y) { return SEV_N[x.sev] - SEV_N[y.sev] || (x.desde < y.desde ? -1 : 1); });",
               "    a.sort(function (x, y) { return x.prio.p - y.prio.p || SEV_N[x.sev] - SEV_N[y.sev] || (x.desde < y.desde ? -1 : 1); });")
    h = rep(h, "'<thead><tr><th>Alerta</th><th>Cliente y servicio</th>", "'<thead><tr><th>Prioridad</th><th>Alerta</th><th>Cliente y servicio</th>")
    h = rep(h, "        return '<tr><td>' + sev(g.sev) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td>",
               "        return '<tr><td>' + prioChip(g.prio, g.sev) + '</td><td>' + sev(g.sev) + ' ' + esc(frase(r.tipo_alerta, r)) + '</td>")
    h = rep(h, "      ? 'Las alertas en curso, de la más grave a la más leve.", "      ? 'Las alertas en curso, por prioridad (gravedad y criticidad del servicio).")
    # Disponibilidad del día contra el objetivo del cliente
    h = rep(h, """      var pct = conDatos ? Math.round(100 * bien / conDatos) : null;""",
               """      var real = conDatos ? 100 * bien / conDatos : null;
      var pct = real == null ? null : real === 100 ? 100 : Math.floor(real * 10) / 10;
      var obj = umbralDe(d, id, null, 'objetivo_disponibilidad');
      var objTxt = real != null && obj != null && c.primera <= ini + paso
        ? '<small class="obj ' + (real >= obj * 100 ? 'ok">Objetivo ' + pctTxt(obj * 100) + ' %: cumplido' : 'mal">Objetivo ' + pctTxt(obj * 100) + ' %: no cumplido') + '</small>' : '';""")
    h = rep(h, """(pct != null ? 'bien el ' + pct + ' % del día' : '') + '</div>'""",
               """(pct != null ? 'bien el ' + pctTxt(pct) + ' % del día' : '') + objTxt + '</div>'""")
    h = rep(h, """? '<div class="resumen empeora"><b>Viene empeorando</b>hay un aviso anticipado activo</div>'""",
               """? '<div class="resumen empeora"><b>Viene empeorando</b>hay un aviso anticipado activo' + objTxt + '</div>'""")
    h = rep(h, """'Bien el ' + pct + ' % del día') + '</b>' + (pct != null && pct < 100 ? 'ya resuelto' : '') + '</div>';""",
               """'Bien el ' + pctTxt(pct) + ' % del día') + '</b>' + (pct != null && pct < 100 ? 'ya resuelto' : '') + objTxt + '</div>';""")
    s = s[:i] + 'const HTML = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
