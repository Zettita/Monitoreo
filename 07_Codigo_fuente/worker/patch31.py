# Parche 31: tono más profesional y Umbrales explicado.
#
#   - Textos: nada de "La resolvió vos", "La tenés vos", "Asignada a vos", "(vos)", "alertas tuyas" ni "Hola, Sol.":
#     se usa el nombre de la persona ("Resuelta por Sol Porte") y "(sesión actual)" en las listas. Las indicaciones
#     ("Elegí", "Tocá") siguen en español rioplatense, como pide la guía del proyecto. También los mensajes del servidor.
#   - Umbrales (Administración): recuadro "Cómo decide Helios" en 4 pasos (lo normal y su margen → ¿hay alerta? →
#     ¿qué tan grave? → ¿qué se atiende primero?), en la pestaña y en el diálogo; los grupos del diálogo siguen ese orden
#     y van numerados; cada campo dice qué pasa si se sube o se baja; las tarjetas de la pestaña, en frases simples.
#   - Solo textos y páginas: mismos datos, sin SQL.
import json


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _todas(s, a, b):
    assert s.count(a) >= 1, a[:120]
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _css(h, css):
    i = h.index('</style>')
    return h[:i] + css + h[i:]


PAGINAS = ['HTML', 'ADMIN_HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ALERTA_HTML']


# ---------- Tono ----------
def comunes(h):
    # Asistente (en todas las páginas)
    h = _todas(h, 'Puede equivocarse. No hace nada solo: las acciones las confirmás vos.',
               'Puede equivocarse. No ejecuta nada por su cuenta: cada acción se confirma con un botón.')
    h = _todas(h, "Preguntame sobre lo que ves en Helios. Si te sugiero hacer algo, lo confirmás vos con un botón.",
               "Consultame sobre lo que ves en Helios. Si sugiero una acción, se confirma con un botón.")
    h = h.replace("' (vos)'", "' (sesión actual)'").replace('<small>(vos)</small>', '<small>(sesión actual)</small>')
    return h


def tablero(h):
    return _rep(h, "mis ? mis + (mis === 1 ? ' alerta tuya' : ' alertas tuyas') : ''",
                "mis ? mis + (mis === 1 ? ' alerta asignada' : ' alertas asignadas') : ''")


def mis_alertas(h):
    h = _rep(h, "'La resolvió <b>' + esc(res.resuelta_por === yo.nombre ? 'vos' : res.resuelta_por) + '</b>'",
             "'Resuelta por <b>' + esc(res.resuelta_por) + '</b>'")
    h = _rep(h, "quien.push(g.tomada ? 'La tenés <b>vos</b>' : 'Asignada a <b>vos</b>');",
             "quien.push((g.tomada ? 'En curso: <b>' : 'Asignada a <b>') + esc(yo.nombre) + '</b>');")
    h = _rep(h, "quien.push((g.tomada ? 'La tiene ' : 'Asignada a ') + '<b>' + esc(a.asignado_nombre) + '</b>' + (g.tomada ? '' : ' (sin tomar)'));",
             "quien.push((g.tomada ? 'En curso: ' : 'Asignada a ') + '<b>' + esc(a.asignado_nombre) + '</b>' + (g.tomada ? '' : ' (sin tomar)'));")
    h = _rep(h, "quien.push('derivó ' + esc(a.asignado_por_nombre));", "quien.push('derivada por ' + esc(a.asignado_por_nombre));")
    h = _rep(h, 'Las que tomaste vos. Cuando esté solucionado, tocá "Resolver" y contá qué se hizo.',
             'Alertas tomadas por tu usuario. Cuando esté solucionado, tocá "Resolver" e indicá la causa y qué se hizo.')
    h = _rep(h, 'Asignadas a vos o a tus equipos que todavía no tomó nadie.', 'Asignadas a tu usuario o a tus equipos, todavía sin tomar.')
    h = _rep(h, "$('bajada').textContent = 'Hola, ' + yo.nombre.split(' ')[0] + '. ' + (", "$('bajada').textContent = (")
    return h


def alerta(h):
    return _rep(h, "a.asignado_nombre + (a.asignado_usuario_id === yo.id ? ' (sesión actual)' : '')", "a.asignado_nombre")


def servidor(s):
    s = _rep(s, "'Ya la tenés tomada vos.'", "'Ya está tomada por tu usuario.'")
    s = _rep(s, "'Solo podés tomar alertas asignadas a vos o a tu equipo.'", "'Solo se pueden tomar alertas asignadas a tu usuario o a tu equipo.'")
    s = _rep(s, "'Para resolverla primero tiene que estar asignada a vos.'", "'Para resolverla primero tiene que estar asignada a tu usuario.'")
    s = _todas(s, "'Esa alerta no está asignada a vos ni a tu equipo.'", "'Esa alerta no está asignada a tu usuario ni a tu equipo.'")
    return s


# ---------- Umbrales ----------
PASOS_HTML = """<div class="como-decide">
      <b class="como-titulo">Cómo decide Helios</b>
      <ol>
        <li><span>1</span><b>Lo normal</b>El modelo calcula, para cada 15 minutos, lo esperado y un margen (un mínimo y un máximo). <em>Lo ajusta: Sensibilidad.</em></li>
        <li><span>2</span><b>¿Hay alerta?</b>Si el dato sale del margen, o si no llega a tiempo. Con pocas operaciones no se miran las tasas. <em>Lo ajusta: Sensibilidad y Llegada de datos.</em></li>
        <li><span>3</span><b>¿Qué tan grave?</b>Según cuánto se alejó de lo esperado: Leve, Importante o Grave. <em>Lo ajusta: Gravedad.</em></li>
        <li><span>4</span><b>¿Qué se atiende primero?</b>La gravedad junto con la criticidad del servicio da la prioridad, de P1 a P4. <em>Lo ajusta: Importancia.</em></li>
      </ol>
    </div>
"""
PASOS_CSS = """/* Cómo decide Helios (parche 31) */
.como-decide { margin: 12px 0 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.como-titulo { display: block; font-size: 14px; margin-bottom: 8px; }
.como-decide ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 860px) { .como-decide ol { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .como-decide ol { grid-template-columns: minmax(0, 1fr); } }
.como-decide li { position: relative; padding: 2px 0 0 30px; font-size: 13px; line-height: 1.4; color: var(--ink-2); }
.como-decide li span { position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--sobre-accent, #fff); font-weight: 700; font-size: 12px; display: grid; place-items: center; }
.como-decide li b { display: block; color: var(--ink); font-size: 13.5px; margin-bottom: 2px; }
.como-decide li em { display: block; font-style: normal; color: var(--ink-3); font-size: 12.5px; margin-top: 3px; }
.fu .reco .efecto { display: block; color: var(--ink-3); margin-top: 3px; }
.fu .reco .efecto b { color: var(--ink-2); font-weight: 600; }
"""
# Qué pasa si se sube o se baja cada valor
EFECTO_JS = r"""  var EFECTO = {
    criticidad: ['Alta: sus alertas suben de prioridad (una grave es P1)', 'Baja: bajan de prioridad (una grave es P3). No cambia cuándo hay alerta'],
    objetivo_disponibilidad: ['el tablero exige más: con menos problemas ya marca al cliente debajo del objetivo', 'tolera más ventanas con problemas antes de marcarlo. No cambia las alertas'],
    corte_pct_alta: ['menos alertas Importantes: más quedan como Leves', 'más alertas pasan a Importante'],
    corte_pct_critica: ['menos alertas Graves (y menos P1 y P2)', 'más alertas pasan a Grave'],
    corte_tasa_alta: ['menos alertas Importantes por tasas', 'más alertas de tasas pasan a Importante'],
    corte_tasa_critica: ['menos alertas Graves por tasas', 'más alertas de tasas pasan a Grave'],
    banda_volumen: ['avisa menos: solo desvíos más grandes (menos falsas alarmas, se detecta más tarde)', 'avisa antes, con desvíos más chicos (más alertas y más falsas alarmas)'],
    banda_tasas: ['avisa menos: solo cambios de tasa más grandes', 'avisa antes, con cambios de tasa más chicos'],
    banda_importe: ['avisa menos: solo desvíos de importe más grandes', 'avisa antes, con desvíos de importe más chicos'],
    banda_latencia: ['avisa menos: solo demoras más grandes', 'avisa antes, con demoras más chicas'],
    volumen_minimo: ['en horarios tranquilos se dejan de mirar las tasas (menos falsas alarmas de madrugada)', 'se miran las tasas aun con pocas operaciones (más sensible, más ruido)'],
    gracia_minutos: ['espera más antes de avisar que no llegaron datos (menos avisos por demoras normales)', 'avisa antes si un dato no llega (puede avisar por demoras normales)'],
    silenciar_feriados: ['Sí: en feriados no se generan alertas ni pre-alertas de este servicio', 'No: el feriado se compara contra un domingo y se alerta igual']
  };
  function efectoHtml(k) {
    var e = EFECTO[k]; if (!e) return '';
    if (k === 'criticidad' || k === 'silenciar_feriados') return '<span class="efecto">' + e[0] + '. ' + e[1] + '.</span>';
    return '<span class="efecto"><b>↑ Si lo subís:</b> ' + e[0] + '. <b>↓ Si lo bajás:</b> ' + e[1] + '.</span>';
  }
"""


def admin(h):
    h = _css(h, PASOS_CSS)
    # Recuadro en la pestaña y en el diálogo
    h = _rep(h, '    <div class="fichas" id="fichas-umbrales"></div>', '    ' + PASOS_HTML + '    <div class="fichas" id="fichas-umbrales"></div>')
    h = _rep(h, '    <div class="modelo-dice" id="um-modelo">', '    ' + PASOS_HTML.replace('<div class="como-decide">', '<div class="como-decide como-dlg">') + '    <div class="modelo-dice" id="um-modelo">')
    # Grupos del diálogo en el orden de los pasos, numerados
    a = h.index('    <fieldset class="grupo">\n      <legend>Importancia para el negocio</legend>')
    b = h.index('    <p class="error-form" id="um-error" hidden></p>')
    bloques = ['    <fieldset class="grupo">\n' + x for x in h[a:b].split('    <fieldset class="grupo">\n') if x.strip()]
    assert len(bloques) == 4, len(bloques)
    imp, grav, sens, lleg = bloques
    nuevo = [
        sens.replace('<legend>Sensibilidad: cuánto margen se tolera</legend>', '<legend>1 · Sensibilidad: cuánto margen se tolera antes de avisar</legend>'),
        lleg.replace('<legend>Llegada de datos y feriados</legend>', '<legend>2 · Llegada de datos y feriados</legend>\n      <p class="bajada">Cuándo se evalúan las tasas, cuánto se espera un dato antes de avisar que no llegó y qué pasa en los feriados.</p>'),
        grav.replace('<legend>Gravedad de la alerta: Leve, Importante o Grave</legend>', '<legend>3 · Gravedad: Leve, Importante o Grave</legend>'),
        imp.replace('<legend>Importancia para el negocio</legend>', '<legend>4 · Importancia: qué se atiende primero</legend>'),
    ]
    assert all(x != y for x, y in zip(nuevo, [sens, lleg, grav, imp]))
    h = h[:a] + ''.join(nuevo) + h[b:]
    # Subir o bajar
    h = _rep(h, '  function umRecos() {', EFECTO_JS + '  function umRecos() {')
    h = _rep(h, "el.innerHTML = (p ? '<span class=\"practica\"><b>En la práctica:</b> ' + p + '</span>' : '') + (r ? '<span>' + r + '.</span>' : '');",
             "el.innerHTML = (p ? '<span class=\"practica\"><b>En la práctica:</b> ' + p + '</span>' : '') + (r ? '<span>' + r + '.</span>' : '') + efectoHtml(k);")
    # Tarjetas de la pestaña, en frases simples y en el orden de los pasos
    i = h.index("    var f = [\n      ['Criticidad de los servicios'"); j = h.index("    ];\n", i) + len("    ];\n")
    h = h[:i] + r"""    var vent = Math.floor(96 * (1 - g.objetivo_disponibilidad) + 1e-9);
    var f = [
      ['1 · Sensibilidad', iguales ? nTxt(g.banda_volumen * 100) + ' %' : bandas.map(function (k) { return nTxt(g[k] * 100) + ' %'; }).join(' · '),
        iguales ? (g.banda_volumen === 1 ? 'Avisa cuando el dato sale del margen que calcula el modelo, sin cambios' : (g.banda_volumen > 1 ? 'Margen más amplio que el del modelo: avisa menos' : 'Margen más angosto que el del modelo: avisa antes'))
          : 'Operaciones · tasas · importe · tiempo de respuesta'],
      ['2 · Llegada de datos', nTxt(g.gracia_minutos) + ' min de espera', 'Si un dato no llega en ese tiempo, avisa. Las tasas se miran con ' + nTxt(g.volumen_minimo) + ' operaciones o más en 15 minutos'],
      ['2 · Feriados', g.silenciar_feriados ? 'No se alerta' : 'Se alerta igual', g.silenciar_feriados ? 'En feriados no se generan alertas' : 'El feriado se compara contra un domingo. Cada servicio puede tener su excepción'],
      ['3 · Gravedad por desvío', 'Importante ' + nTxt(g.corte_pct_alta * 100) + ' % · Grave ' + nTxt(g.corte_pct_critica * 100) + ' %', 'Cuánto se alejan de lo esperado las operaciones, el importe o el tiempo de respuesta'],
      ['3 · Gravedad por tasas', 'Importante ' + nTxt(g.corte_tasa_alta * 100) + ' · Grave ' + nTxt(g.corte_tasa_critica * 100) + ' puntos', 'Cuánto cambia la aprobación, los rechazos o los errores (de 95 % a 90 % son 5 puntos)'],
      ['4 · Criticidad', esc(CRIT_TXT[g.criticidad] || g.criticidad), 'Una alerta grave sale como P' + ({ ALTA: 1, MEDIA: 2, BAJA: 3 })[g.criticidad] + ' (P1 se atiende primero)'],
      ['4 · Objetivo de disponibilidad', nTxt(g.objetivo_disponibilidad * 100) + ' %', vent ? 'Se toleran hasta ' + vent + ' ventanas de 15 minutos con problemas por día' : 'No se tolera ninguna ventana con problemas']
    ];
""" + h[j:]
    return h


def aplicar(s):
    for n in PAGINAS:
        s = _html(s, n, comunes)
    s = _html(s, 'HTML', tablero)
    s = _html(s, 'MIS_ALERTAS_HTML', mis_alertas)
    s = _html(s, 'ALERTA_HTML', alerta)
    s = _html(s, 'ADMIN_HTML', admin)
    s = servidor(s)
    return s
