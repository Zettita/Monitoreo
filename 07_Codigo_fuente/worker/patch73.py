# Parche 73: el aviso de prueba de Teams ya no parece una sala (sin SQL).
#
# Ale conectó el canal "Plataforma Monitoreo" (20/11) y el aviso de prueba salió como "IM-0 · Aviso de prueba / Abierto ·
# Importante", porque usaba la misma tarjeta que las salas. Ahora es una tarjeta propia: "Helios · Aviso de prueba", quién lo
# mandó y que el canal quedó conectado, con el botón "Abrir Helios". Las tarjetas de las salas no cambian.
import os


def _rep(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:120])
    return s.replace(a, b)


TARJETA = r"""
// Aviso de prueba (parche 73): tarjeta propia, sin número de sala ni estado
function teamsTarjetaPrueba(nombre, origen) {
  const tarjeta = { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: [
    { type: 'TextBlock', text: 'Helios · Monitoreo', size: 'Small', isSubtle: true, spacing: 'None' },
    { type: 'TextBlock', text: 'Aviso de prueba', weight: 'Bolder', size: 'Medium', wrap: true, spacing: 'None' },
    { type: 'TextBlock', text: 'Lo mandó **' + nombre + '** desde Administración. El canal quedó conectado: acá van a llegar las novedades de las salas de crisis.', wrap: true, spacing: 'Small' },
  ] };
  if (/^https:\/\//.test(origen || '')) tarjeta.actions = [{ type: 'Action.OpenUrl', title: 'Abrir Helios', url: origen + '/inicio' }];
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: tarjeta }] };
}
"""


def aplicar(s):
    s = _rep(s, "\nasync function teamsMandar(url, mensaje) {", TARJETA + "\nasync function teamsMandar(url, mensaje) {")
    s = _rep(s, "    const prueba = { id: 0, titulo: 'Aviso de prueba', estado: 'ABIERTO', severidad: 'ALTA' };\n"
                "    const msg = teamsTarjetaSala(prueba, [{ usuario: yo.nombre, texto: 'Mandó un aviso de prueba desde Administración. Si lo ves, las novedades de las salas de crisis ya llegan a este canal.' }], 0, null);\n",
             "    const msg = teamsTarjetaPrueba(yo.nombre, new URL(request.url).origin);\n")
    return s
