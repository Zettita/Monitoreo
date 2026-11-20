# Parche 69 (20/11): sala de crisis, etapa 1 del AICIM (plan: 05_Documentacion/plan_sala_crisis_etapa1.md; script 24).
#   Incidentes mayores que agrupan alertas, con tareas, línea de tiempo y guía de diagnóstico (componentes, dependencias y
#   antecedentes). El Analista abre y dirige; Soporte actualiza sus tareas; Gerente y Administrador leen.
#   Servidor: sala_crisis_server.js (rutas /api/incidentes...). Página: sala_crisis.html (/incidentes y /incidente/<id>).
#   El asistente suma herramientas de solo lectura de la sala y propone asignar tarea, comunicar o escalar (no ejecuta).
#   Teams queda para la etapa 2.
import json
import os
import re

AQUI = os.path.dirname(os.path.abspath(__file__))


def _rep(s, a, b, n=1):
    c = s.count(a)
    if c != n:
        raise SystemExit('patch69: se esperaban %d y hay %d de: %r' % (n, c, a[:100]))
    return s.replace(a, b)


def _leer(n):
    return open(os.path.join(AQUI, n), encoding='utf-8').read()


def _html(s, nombre, fn):
    i = s.index('const %s = ' % nombre); j = s.index(';\n', i)
    h = json.loads(s[i + len('const %s = ' % nombre):j])
    h = fn(h)
    return s[:i] + 'const %s = ' % nombre + json.dumps(h, ensure_ascii=False) + s[j:]


PAGINAS = ['HTML', 'MIS_ALERTAS_HTML', 'SEGUIMIENTO_HTML', 'ADMIN_HTML', 'ALERTA_HTML', 'COMUNICADOS_HTML']


# ---------- Campanita: los avisos de la sala llevan a /incidente/<id> ----------
def destino_avisos(h):
    if 'function destinoDe(a) { ' in h:
        h = _rep(h, 'function destinoDe(a) { ', "function destinoDe(a) { if (/^i\\d+$/.test(a.alerta_id || '')) return '/incidente/' + a.alerta_id.slice(1); ")
    return h


def servidor(s):
    s = _rep(s, "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // asistente de IA (responde según los permisos de cada perfil)\n",
             "  asistente: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // asistente de IA (responde según los permisos de cada perfil)\n"
             "  sala_crisis: ['ADMIN', 'GERENTE', 'ANALISTA', 'SOPORTE'],   // ver salas de crisis (Soporte, solo donde tiene tareas) (parche 69)\n"
             "  sala_crisis_dirigir: ['ANALISTA'],                 // abrir y dirigir una sala: alertas, tareas, estado, escalar\n"
             "  sala_crisis_tarea: ['ANALISTA', 'SOPORTE'],        // actualizar las tareas propias y dejar notas\n")
    pagina = _leer('sala_crisis.html') if os.path.exists(os.path.join(AQUI, 'sala_crisis.html')) else '<!doctype html><title>Sala de crisis</title>'
    s = _rep(s, "async function rutasComunicados(env, request, ruta, yo) {",
             _leer('sala_crisis_server.js') + 'const SALA_CRISIS_HTML = ' + json.dumps(pagina, ensure_ascii=False) + ';\n\n'
             + "async function rutasComunicados(env, request, ruta, yo) {")
    s = _rep(s, "      const comunicadosR = await rutasComunicados(env, request, ruta, yo);\n",
             "      // Sala de crisis (parche 69): controla sus propios permisos\n"
             "      const salaR = await rutasSalaCrisis(env, request, ruta, yo);\n"
             "      if (salaR) return salaR;\n"
             "      const comunicadosR = await rutasComunicados(env, request, ruta, yo);\n")
    # Un comunicado de una alerta que está en una sala abierta queda también en la línea de tiempo de la sala
    s = _rep(s, "  return okJson({ comunicado: { id: cid, personas: destinos.length, por_rol:",
             "  await lineaPorComunicado(env, yo, alertaId, cid, nombres, destinos.length);\n"
             "  return okJson({ comunicado: { id: cid, personas: destinos.length, por_rol:")
    # Detalle de la alerta: en qué salas está y si se puede abrir una
    s = _rep(s, "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),\n",
             "tickets: (await ticketsDeAlerta(env, alertaId)) || [], tickets_sistemas: ticketsSistemas(env),\n"
             "    incidentes_mayores: await incidentesDeAlerta(env, alertaId), puede_abrir_sala: puede(yo, 'sala_crisis_dirigir') && rol.abierta,\n")
    # Preparar demo: borra las salas abiertas en Helios (los antecedentes importados quedan)
    s = _rep(s, "  await env.DB.batch([env.DB.prepare('DELETE FROM comunicado_destinatarios'), env.DB.prepare('DELETE FROM comunicados_incidente')]).catch(() => {});\n",
             "  await env.DB.batch([env.DB.prepare('DELETE FROM comunicado_destinatarios'), env.DB.prepare('DELETE FROM comunicados_incidente')]).catch(() => {});\n"
             "  await env.DB.batch([\n"
             "    env.DB.prepare(\"DELETE FROM incidente_alertas WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidente_tareas WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidente_linea_tiempo WHERE incidente_id IN (SELECT id FROM incidentes_mayores WHERE origen = 'HELIOS')\"),\n"
             "    env.DB.prepare(\"DELETE FROM incidentes_mayores WHERE origen = 'HELIOS'\"),\n"
             "  ]).catch(() => {});\n")
    # Push: los avisos de la sala abren la sala
    s = _rep(s, "function avisoPush(a) {\n",
             "function avisoPush(a) {\n"
             "  if (/^i\\d+$/.test(a.alerta_id || '')) {\n"
             "    const id = Number(a.alerta_id.slice(1));\n"
             "    return { titulo: 'Helios · ' + a.texto, cuerpo: String(a.detalle || '').slice(0, 450), url: '/incidente/' + id, tag: 'helios-incidente-' + id + '-' + a.id };\n"
             "  }\n")
    return s


def aplicar(s):
    s = servidor(s)
    for n in PAGINAS:
        s = _html(s, n, destino_avisos)
    return s
