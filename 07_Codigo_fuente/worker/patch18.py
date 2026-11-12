# Paso 18 del build: tema claro/oscuro/sistema y estilo tipo Atlassian en las 4 páginas
import json, os, re
AQUI = os.path.dirname(os.path.abspath(__file__))
def aplicar(s):
    t = open(os.path.join(AQUI, 'tema.html')).read()
    parte = lambda a, b: t[t.index('<!--' + a + '-->') + len(a) + 7:(t.index('<!--' + b + '-->') if b else len(t))].strip()
    head, tokens, estilo, menu, script = parte('HEAD', 'TOKENS'), parte('TOKENS', 'ESTILO'), parte('ESTILO', 'MENU'), parte('MENU', 'SCRIPT'), parte('SCRIPT', None)
    patron = re.compile(r':root \{[^}]*\}\s*@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*\}\s*\}')
    def tema(h, nombre, con_menu):
        n = len(patron.findall(h)); assert n == 1, (nombre, 'bloques de color', n)
        h = patron.sub(lambda m: tokens, h, count=1)
        # Fuente: la del sistema (ya no se descarga Archivo de Google Fonts)
        h = re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>\n?', '', h)
        h = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?family=Archivo[^>]*>\n?', '', h)
        assert h.count('</style>') == 1, nombre
        h = h.replace('</style>', estilo + '\n</style>', 1)
        assert h.count('<meta charset="utf-8">') == 1, nombre
        h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + head, 1)
        if con_menu:
            a = '<button role="menuitem" id="btn-salir">Salir</button>'
            assert h.count(a) == 1, nombre
            h = h.replace(a, menu + '\n        ' + a, 1)
            assert h.count('</body>') == 1
            h = h.replace('</body>', script + '\n</body>', 1)
        return h
    for nombre, con_menu in [('HTML', True), ('ADMIN_HTML', True), ('MIS_ALERTAS_HTML', True), ('SEGUIMIENTO_HTML', True), ('LOGIN_HTML', False)]:
        i = s.index('const ' + nombre + ' = '); j = s.index(';\n', i)
        h = json.loads(s[i + len('const ' + nombre + ' = '):j])
        h = tema(h, nombre, con_menu)
        s = s[:i] + 'const ' + nombre + ' = ' + json.dumps(h, ensure_ascii=False) + s[j:]
    return s
