# Parche 28: asistente de IA (Workers AI).
#
#   - Chat en todas las páginas (botón "Asistente") y "¿Qué está pasando?" junto a las acciones de cada alerta.
#   - Responde solo con lo que el perfil de quien pregunta puede ver: el modelo usa herramientas del servidor
#     y cada una exige el permiso de la pantalla equivalente (tabla PERMISOS).
#   - No ejecuta nada: propone acciones y la página muestra "Hacerlo"; con ese clic se llama a la ruta de siempre.
#   - Cuida D1: lee del caché y por índice, 2 escrituras por pregunta (asistente_uso y auditoría), límite por hora y por día.
#   - Necesita el enlace "AI" (Workers AI) en el Worker y la tabla asistente_uso (script 11). Sin eso, el resto sigue igual.
#   - No cambia nada de lo que ya existía: solo agrega el permiso "asistente", una ruta, el módulo y el panel.
import json, os

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def aplicar(s):
    s = _rep(s, "  admin_umbrales: ['ADMIN'],                           // umbrales por cliente (criticidad, cortes, bandas, gracia)\n",
             "  admin_umbrales: ['ADMIN'],                           // umbrales por cliente (criticidad, cortes, bandas, gracia)\n"
             "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // asistente de IA (responde según los permisos de cada perfil)\n")
    s = _rep(s, '\nconst TRABAJADOR = {', '\n' + _leer('asistente_server.js').strip() + '\n\nconst TRABAJADOR = {')
    s = _rep(s, "      const pushR = await rutasPush(env, request, ruta, yo);\n      if (pushR) return pushR;\n",
             "      const pushR = await rutasPush(env, request, ruta, yo);\n      if (pushR) return pushR;\n"
             "      // Asistente de IA (/api/asistente): solo lee y propone, según los permisos del perfil\n"
             "      const asistenteR = await rutasAsistente(env, request, ruta, yo);\n      if (asistenteR) return asistenteR;\n")
    panel = _leer('asistente.html')
    for n in ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML']:
        s = _html(s, n, lambda h: _rep(h, '</body>', panel + '</body>'))
    s = _html(s, 'ADMIN_HTML', lambda h: _rep(h, "    LOGIN: 'Ingresó', LOGIN_FALLIDO:", "    ASISTENTE: 'Consultó al asistente', LOGIN: 'Ingresó', LOGIN_FALLIDO:"))
    return s
