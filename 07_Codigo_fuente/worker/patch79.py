# Parche 79 (24/11): Gemma en Teams, ajustes de la primera prueba real (sin SQL).
#   - El saludo salía dos veces al instalar la app (Teams manda installationUpdate y conversationUpdate): ahora saluda uno solo por chat
#     (teams_bot_server.js, botSaludar).
#   - Cada perfil puede preguntar por lo suyo: las alertas que tiene asignadas o sin asignar (según el perfil), las tareas de las salas de crisis
#     (asignadas, sin tomar) y los casos parecidos ya cerrados. Herramientas nuevas, de solo lectura y con el permiso de cada perfil:
#       tareas_salas    (sala_crisis_asistente.js)  tareas abiertas de todas las salas abiertas; Soporte, solo las suyas y las de sus equipos
#       casos_parecidos (asistente_server.js)       alertas parecidas ya cerradas de los problemas abiertos que se pueden ver (Soporte, solo los suyos)
#     Fuera de una sala se eligen por las palabras de la pregunta (ASIST_PALABRAS). Este parche hace lo mismo DENTRO de una sala: la pregunta libre
#     suma lo propio del perfil (mis_alertas / alertas_abiertas, tareas_salas) y los casos parecidos (guia_diagnostico con los antecedentes de la sala
#     y casos_parecidos con las alertas).


def _rep(s, a, b, n=1):
    assert s.count(a) == n, ('patch79: se esperaban %d y hay %d de' % (n, s.count(a)), a[:110])
    return s.replace(a, b)


def aplicar(s):
    s = _rep(s, "const SALA_PALABRAS_GUIA = /escal|proveedor|revis|causa|componente|depend|antecedente|parecid|diagn|",
             "const SALA_PALABRAS_GUIA = /escal|proveedor|revis|causa|componente|depend|antecedente|parecid|similar|cerrad|anterior|antes\\b|otra vez|de nuevo|la [uú]ltima vez|diagn|")
    s = _rep(s, "const SALA_PALABRAS_AFUERA = ",
             "const SALA_PALABRAS_TAREAS = /tarea.*(tengo|mis?\\b|sin (tomar|asignar|responsable)|otras? salas)|(tengo|mis|sin (tomar|asignar|responsable)).*tarea|me (toc[oó]|asignaron)|otras? salas|todas las salas/i;\n"
             "const SALA_PALABRAS_MIS = /\\bmis (alertas|problemas)|alertas? (asignadas?|abiertas?|pendientes?|sin asignar)|sin asignar|tengo (asignad|pendiente)|me (toc[oó]|asignaron)/i;\n"
             "const SALA_PALABRAS_PARECIDAS = /parecid|similar|antes\\b|anterior|cerrad|antecedente|otra vez|de nuevo|la [uú]ltima vez/i;\n"
             "const SALA_PALABRAS_AFUERA = ")
    # Lo propio del perfil también dentro de la sala (máximo 5 datos en total)
    s = _rep(s, "  if (SALA_PALABRAS_AFUERA.test(pregunta)) out.push('contexto_externo');\n  return out.filter((n) => disponibles.includes(n)).slice(0, 4);",
             "  if (SALA_PALABRAS_AFUERA.test(pregunta)) out.push('contexto_externo');\n"
             "  if (SALA_PALABRAS_TAREAS.test(pregunta)) out.push('tareas_salas');\n"
             "  if (SALA_PALABRAS_MIS.test(pregunta)) out.push('mis_alertas', 'alertas_abiertas');   // cada perfil tiene una de las dos\n"
             "  if (SALA_PALABRAS_PARECIDAS.test(pregunta)) out.push('casos_parecidos');\n"
             "  return out.filter((n) => disponibles.includes(n)).slice(0, 5);")
    return s
