# Parche 47: "Comunicar incidente" sin el texto "Le llega a hasta N personas…" (pedido de Ale, 16/11). Solo la página de detalle.
import json, re


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


def alerta(h):
    h = _rep(h, '    <p class="nota-gris" id="k-resumen"></p>\n', '')
    i = h.index('  function resumenComunicar() {'); j = h.index('  function pintarTicketComunicado() {')
    h = h[:i] + h[j:]
    h = _rep(h, "  $('k-listas').addEventListener('change', resumenComunicar);\n", '')
    h = _rep(h, '    resumenComunicar();\n', '')
    assert 'k-resumen' not in h and 'resumenComunicar' not in h
    return h


def aplicar(s):
    return _html(s, 'ALERTA_HTML', alerta)
