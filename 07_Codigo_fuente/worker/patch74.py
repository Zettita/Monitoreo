# Parche 74 (20/11): ajustes del asistente y de la sala de crisis (sin SQL). Pedido de Uriel.
#   1. Las preguntas sugeridas del asistente quedan fijas abajo del panel, arriba del cuadro de texto: se pueden usar en cualquier
#      momento de la conversación sin subir a buscarlas (antes eran un mensaje más y se perdían al avanzar el chat).
#   2. Los saludos y agradecimientos sueltos ("hola", "gracias", "de nada") se contestan sin llamar al modelo: no gastan neuronas,
#      no cuentan en el límite de preguntas y no dejan registro. Lo hace asistente_server.js (asistCortesia); acá la página no
#      guarda esas respuestas en la historia que se le manda al modelo.
#   3. Quitar una alerta de una sala de crisis (POST /api/incidentes/<id>/alertas/<alerta_id>/quitar): lo hace sala_crisis_server.js
#      y el botón "Quitar de la sala" está en sala_crisis.html (que patch69 mete en el Worker).
import json

PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML', 'COMUNICADOS_HTML', 'SALA_CRISIS_HTML']


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _rep(s, viejo, nuevo, n=1):
    assert s.count(viejo) == n, ('patch74: se esperaban %d y hay %d de' % (n, s.count(viejo)), viejo[:90])
    return s.replace(viejo, nuevo)


def panel(h):
    if 'id="asis-form"' not in h:
        return h
    # Estilos: las sugerencias van en el pie, con altura limitada para que el chat siga teniendo lugar
    h = _rep(h, ".asis-sug button:hover { border-color: var(--accent); }\n",
             ".asis-sug button:hover { border-color: var(--accent); }\n"
             ".asis-pie .asis-sug { max-height: 108px; overflow-y: auto; margin: 0 0 8px; }\n"
             ".asis-pie .asis-sug[hidden] { display: none; }\n"
             ".asis-pie .asis-sug button { font-size: 12.5px; padding: 4px 10px; }\n")
    h = _rep(h, '<form id="asis-form">', '<div class="asis-sug" id="asis-sug" role="group" aria-label="Preguntas sugeridas" hidden></div>\n    <form id="asis-form">')
    # Se llenan al abrir el panel y quedan abajo; el clic es el mismo de siempre
    h = _rep(h, "var s = agregar('asis-sug', sugs.map(", "var s = $a('asis-sug'); s.hidden = false; s.innerHTML = sugs.map(")
    h = _rep(h, ".join(''));\n        s.addEventListener('click', function (ev) {", ".join('');\n        s.addEventListener('click', function (ev) {")
    # Una respuesta fija (saludo o gracias) no entra en la historia que se le manda al modelo
    h = _rep(h, "historia.push({ rol: 'usuario', texto: mostrar }, { rol: 'asistente', texto: r.respuesta });",
             "if (!r.sin_ia) historia.push({ rol: 'usuario', texto: mostrar }, { rol: 'asistente', texto: r.respuesta });")
    return h


def aplicar(s):
    for n in PAGINAS:
        s = _html(s, n, panel)
    return s
