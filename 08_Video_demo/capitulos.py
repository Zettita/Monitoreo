import os, json
AQUI = os.path.dirname(os.path.abspath(__file__))
# Capítulos de la demo en video. Cada función es un capítulo; la primera línea de su docstring es el título.
from guion import TEXTOS as T


def preparar_demo(g):
    g.entrar_como('lbenitez')
    r = g.api('POST', '/api/demo/preparar')
    assert r.get('ok'), r
    g.salir_sesion()


# ---------- ayudas ----------
def escena(g, espera=0.5):
    """Toca "Siguiente escena" (llega la próxima ventana de datos de la demo)."""
    g.desplazar_arriba()
    g.clic(g.L('#btn-demo-siguiente'), pausa=0.4)
    g.pg.wait_for_load_state('networkidle'); g.esperar(espera)


def cap1(g):
    """Presentación"""
    with g.decir(T['intro1']): pass
    g.tarjeta('Lo que vamos a ver', items=[
        'Pre-alertas anticipadas', 'Alertas priorizadas y derivadas desde un solo lugar', 'Comunicación del incidente sin carga manual',
        'Aviso push a nivel gerencial', 'Dashboard para Gerencia', 'Asistente de inteligencia artificial'])
    with g.decir(T['intro2']): pass
    g.quitar_tarjeta()


def cap2(g):
    """Pre-alertas anticipadas"""
    with g.decir(T['login']):
        g.escribir(g.L('#l-usuario'), 'lbenitez')
        g.escribir(g.L('#l-clave'), 'Helios2026!')
        g.clic(g.L('#l-boton'))
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.8)
    g.ir('/?demo', espera=1.2)
    with g.decir(T['datos']):
        for _ in range(5): escena(g)
    with g.decir(T['pre']):
        escena(g, espera=1.0)                               # escena 6: pre-alerta en CLI_004
        g.pasar(g.T('Pre-Alertas', exact=True), pausa=0.3)
        g.pasar(g.T('Tendencia al alza en la tasa de rechazo').first, pausa=1.0)
        g.pasar(g.T('79 % del camino'), pausa=1.5)
    with g.decir(T['avisar']):
        g.clic(g.R('button', name='Avisar a Soporte'))
        g.pasar(g.L('#p-persona'), pausa=0.4)
        g.L('#p-persona').select_option(index=1) if g.L('#p-persona option').count() > 1 else None
        g.escribir(g.L('#p-texto'), 'Rechazos en alza en CLI_004: prepárense por si se confirma.')
        g.clic(g.L('#p-guardar'), pausa=1.0)
    with g.decir(T['confirma']):
        escena(g, espera=1.2)                               # escena 7: se confirma
        g.pasar(g.T('Efectividad de los avisos', exact=False).first, pausa=0.5)
        g.pasar(g.T('Confirmada · 15 min antes'), pausa=1.5)


def cap3(g):
    """Alertas priorizadas y derivadas"""
    with g.decir(T['abiertas']):
        escena(g); escena(g, espera=1.0)                    # escenas 8 y 9: fallan CLI_002 y CLI_006 (esta se deriva sola por la regla)
        g.pasar(g.T('Alertas Abiertas', exact=True), pausa=0.5)
        g.pasar(g.T('Sin asignar', exact=True).first, pausa=0.8)
        g.pasar(g.L('table').first, pausa=2.0)
    with g.decir(T['derivar']):
        fila = g.L('tr', has_text='CLI_004')
        g.clic(fila.get_by_role('button', name='Derivar'))
        g.pasar(g.L('#d-persona'), pausa=0.4)
        g.L('#d-persona').select_option(label='Matías Ramos · Soporte')
        g.escribir(g.L('#d-texto'), 'Matías, revisá los rechazos del antifraude en CLI_004.')
        g.clic(g.L('#d-guardar'), pausa=1.0)
    with g.decir(T['regla']):
        g.ir('/admin', espera=0.8)
        g.clic(g.T('Derivación', exact=True).first)
        g.pasar(g.T('Caídas graves de CLI_006 a la Mesa de ayuda').first, pausa=1.5)
    g.ir('/?demo', espera=1.0)
    with g.decir(T['auto']):
        g.desplazar(g.pg.evaluate("document.querySelector('table').getBoundingClientRect().top + window.scrollY - 240"))
        g.pasar(g.L('tr', has_text='CLI_006').first, pausa=1.2)
        g.pasar(g.L('tr', has_text='CLI_004').first, pausa=1.5)
    with g.decir(T['seguimiento']):
        g.ir('/seguimiento', espera=1.0)
        g.pasar(g.L('#t-seg'), pausa=1.0)
        g.pasar(g.L('#equipos'), pausa=2.0)


def cap4(g):
    """Soporte trabaja la alerta y comunica el incidente"""
    g.tarjeta('Vista de Soporte', 'Matías Ramos · Mesa de ayuda'); g.esperar(1.0)
    g.salir_sesion(); g.entrar_como('lbenitez')
    for _ in range(5): g.api('POST', '/api/demo/siguiente')   # escenas 10 a 14, mientras se ve la tarjeta: llega la caída total de CLI_006
    g.salir_sesion(); g.entrar_como('mramos'); g.ir('/mis-alertas', espera=0.6); g.esperar(0.6); g.quitar_tarjeta()
    with g.decir(T['soporte1']):
        g.pasar(g.T('Para tomar').first, pausa=2.0)
    with g.decir(T['tomar']):
        botones = g.R('button', name='Tomar')
        txt = g.pg.evaluate("n => { const b = [...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Tomar')[n]; let e = b; for (let i = 0; i < 6 && e; i++, e = e.parentElement) if (/No se aprueba ninguna/.test(e.textContent) && e.querySelectorAll('button').length < 8) return e.textContent.slice(0, 60); return ''; }", 2)
        assert 'No se aprueba ninguna' in txt, txt
        g.clic(botones.nth(2), pausa=1.2)
        g.pg.wait_for_load_state('networkidle')
        g.clic(g.R('button', name='Ver detalle').first if g.R('button', name='Ver detalle').count() else g.T('Ver detalle').first)
        g.pg.wait_for_load_state('networkidle'); g.esperar(1.0)
        g.pasar(g.L('#hilo'), pausa=1.5)
    with g.decir(T['evidencia']):
        g.escribir(g.L('#c-texto'), 'Veo en los logs que el gateway cortó la conexión con el proveedor PSP-2. Adjunto la captura.')
        with g.pg.expect_file_chooser() as fc:
            g.clic(g.L('button', has_text='Adjuntar archivo').first, pausa=0.3)
        fc.value.set_files(os.path.join(AQUI, 'captura_logs_gateway.png'))
        g.esperar(1.0)
        g.clic(g.L('#c-enviar'), pausa=1.5)
        g.pg.wait_for_load_state('networkidle')
    with g.decir(T['ticket']):
        g.clic(g.L('#acciones button', has_text='Generar ticket'))
        g.clic(g.L('label.opcion', has_text='Jira'), pausa=0.8)
        g.pasar(g.L('#t-resumen'), pausa=1.2)
        g.clic(g.L('#t-guardar'), pausa=1.5)
        g.pg.wait_for_load_state('networkidle')
    with g.decir(T['comunicar']):
        g.clic(g.L('#acciones button', has_text='Comunicar incidente'))
        g.clic(g.L('#k-listas-res'), pausa=0.5)
        for equipo in ('Mesa de ayuda', 'Gerencia y negocio', 'Atención al cliente'):
            g.clic(g.L('#k-listas label', has_text=equipo).first, pausa=0.4)
        g.clic(g.L('#k-listas-res'), pausa=0.5)             # cierra la lista
        g.pasar(g.L('#k-mensaje'), pausa=1.2)
        g.clic(g.L('#k-enviar'), pausa=1.5)
        g.pg.wait_for_load_state('networkidle')
    # ---- Avisos push en el celular (simulación): el texto y los botones son los que arma el Worker para cada rol
    def aviso_de(usuario):
        av = g.api_como(usuario, 'GET', '/api/avisos')['avisos']
        return next(x for x in av if x['tipo'].startswith('COMUNICADO_'))
    tec, ger = aviso_de('nfunes'), aviso_de('gtorres')
    comunicado_id = int(tec['alerta_id'][1:])
    hora = lambda a: '16:35'.replace('16:35', '13:35')   # hora de Argentina del reloj de la demo
    with g.decir(T['push_tec']):
        g.pg.evaluate("o => window.__tel(o)", {'so': 'android', 'hora': '13:35', 'fecha': 'lunes 26 de octubre', 'rotulo': 'Aviso push en Android (simulación)'})
        g.esperar(1.0)
        g.pg.evaluate("n => window.__noti(n)", {'id': 'ph-n1', 'hora': 'ahora', 'titulo': 'Helios · ' + tec['texto'], 'cuerpo': tec['detalle'].replace(chr(10), '<br>'),
                                                'acciones': [{'id': 'ph-recibido', 'texto': 'Recibido', 'principal': True}, {'id': 'ph-responder', 'texto': 'Responder'}]})
        g.esperar(2.0); g.foto('push_android')
        g.clic(g.L('#ph-recibido'), pausa=0.4)
        g.pg.evaluate("document.getElementById('ph-recibido').textContent = '\u2714 Recibido'; document.getElementById('ph-recibido').disabled = true")
        g.api_como('nfunes', 'POST', '/api/comunicados/%d/recibido' % comunicado_id, {})
        g.esperar(1.2)
    g.pg.evaluate("window.__tel(null)"); g.esperar(0.8)
    with g.decir(T['push_ger']):
        g.pg.evaluate("o => window.__tel(o)", {'so': 'ios', 'hora': '13:35', 'fecha': 'lunes 26 de octubre', 'rotulo': 'Aviso push en iPhone (simulación)'})
        g.esperar(1.0)
        g.pg.evaluate("n => window.__noti(n)", {'id': 'ph-n2', 'hora': 'ahora', 'titulo': 'Helios · ' + ger['texto'], 'cuerpo': ger['detalle'].replace(chr(10), '<br>')})
        g.esperar(2.5); g.foto('push_ios')
    g.pg.evaluate("window.__tel(null)"); g.esperar(0.8)
    with g.decir(T['registro']):
        g.clic(g.L('#btn-actualizar'), pausa=1.0)
        g.pg.wait_for_load_state('networkidle')
        g.pasar(g.L('#hilo .com-estado, #hilo').first, pausa=1.0)
        g.pg.evaluate("document.querySelector('.com-estado') && document.querySelector('.com-estado').scrollIntoView({block: 'center', behavior: 'smooth'})"); g.esperar(1.2)
        g.foto('registro')
    with g.decir(T['correo']):
        g.pg.evaluate("window.scrollTo(0, 0)"); g.esperar(0.3)
        g.clic(g.L('#acciones button', has_text='Template correo'))
        g.pasar(g.L('#m-plantilla'), pausa=0.8)
        g.pasar(g.L('#m-asunto'), pausa=1.5)
    with g.decir(T['destinatarios']):
        g.clic(g.L('#dlg-correo button', has_text='Elegir de la lista').nth(0), pausa=0.6)
        g.clic(g.L('#dlg-correo .cont-fila:visible', has_text='Mesa de ayuda').first, pausa=0.8)
        g.clic(g.L('#dlg-correo button', has_text='Elegir de la lista').nth(0), pausa=0.5)   # cierra la lista
        g.clic(g.L('#dlg-correo button', has_text='Elegir de la lista').nth(1), pausa=0.6)
        g.clic(g.L('#dlg-correo .cont-fila:visible', has_text='Gerencia y negocio').first, pausa=0.8)
        g.clic(g.L('#dlg-correo button', has_text='Elegir de la lista').nth(1), pausa=0.5)
        g.escribir(g.L('#m-cc'), '; operaciones@cliente006.com.ar')
    with g.decir(T['outlook']):
        g.clic(g.L('#m-web'), pausa=0.5)
        g.esperar(2.5)
        g.clic(g.L('#__o-enviar'), pausa=1.5)
        g.pg.evaluate("window.__outlook(null)"); g.esperar(0.8)
        g.pg.wait_for_load_state('networkidle')
        g.clic(g.L('#hilo button', has_text='Confirmar envío').first, pausa=0.6)
        g.clic(g.L('#e-opciones').get_by_text('Se envió tal cual'), pausa=0.6)
        g.clic(g.L('#e-guardar'), pausa=1.2)
        g.pg.wait_for_load_state('networkidle')
    with g.decir(T['resolver']):
        g.clic(g.L('#acciones button', has_text='Resolver'))
        g.foto('resolver')
        print('RESOLVER', g.L('#dlg-resolver').inner_text()[:600])
        g.clic(g.L('#v-causas').get_by_text('Proveedor o gateway'), pausa=0.5)
        g.clic(g.L('#v-acciones').get_by_text('Se escaló'), pausa=0.4)
        g.clic(g.L('#v-acciones').get_by_text('Se contactó al cliente'), pausa=0.4)
        g.escribir(g.L('#v-texto'), 'El proveedor PSP-2 restableció la conexión y se normalizó la aprobación.')
        g.clic(g.L('#v-guardar'), pausa=1.5)
        g.pg.wait_for_load_state('networkidle')
        g.foto('resuelta')


def reemplazar(g, loc, texto):
    g.clic(loc, pausa=0.2)
    g.pg.keyboard.press('Control+a')
    for ch in texto:
        g.pg.keyboard.type(ch)
        if g.grabar: g.pg.wait_for_timeout(70)
    g.esperar(0.4)


def cap5(g):
    """Aviso a gerencia y tablero gerencial"""
    g.tarjeta('Vista de gerencia', 'Gabriela Torres · Gerente'); g.esperar(1.0)
    g.salir_sesion(); g.entrar_como('gtorres'); g.ir('/comunicados', espera=0.6); g.esperar(0.6); g.quitar_tarjeta()
    with g.decir(T['ger1']):
        g.clic(g.L('a[href^="/comunicado/"]').first if g.L('a[href^="/comunicado/"]').count() else g.T('No se aprueba ninguna operación').first, pausa=1.0)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.8)
        g.pasar(g.T('Ticket', exact=True).first, pausa=0.8)
        g.pasar(g.T('A quiénes les llegó'), pausa=2.0)
    g.ir('/', espera=1.0)
    with g.decir(T['ger_ops']):
        g.clic(g.L('#tab-op'), pausa=1.0)
        g.pasar(g.T('Alertas Abiertas', exact=True), pausa=0.5)
        g.pasar(g.L('table').first, pausa=1.5)
        g.pasar(g.L('table tr', has_text='sin tomar').first, pausa=1.5)
    with g.decir(T['disp']):
        g.clic(g.L('#tab-disp'), pausa=1.0)
        g.pasar(g.T('Disponibilidad real'), pausa=1.5)
        g.clic(g.T('No cumplen el objetivo').first, pausa=1.5)
        g.pasar(g.T('Distribución de fallas', exact=True), pausa=1.0)
        g.pasar(g.T('Por causa', exact=True), pausa=1.5)
    with g.decir(T['hist']):
        g.clic(g.L('#tab-hist'), pausa=0.8)
        reemplazar(g, g.L('#hist-desde'), '01102026')
        g.pg.wait_for_load_state('networkidle'); g.esperar(1.0)
        g.pasar(g.T('Tiempo de resolución por tipo'), pausa=2.0)
        g.pasar(g.T('Clientes con más problemas', exact=True), pausa=2.0)


def preguntar(g, texto):
    g.escribir(g.L('#asis-txt'), texto)
    g.clic(g.L('#asis-enviar'), pausa=1.0)
    g.pg.wait_for_function("!document.querySelector('#asis-msgs').innerText.includes('Pensando')", timeout=60000)
    g.esperar(1.0)


def leer_respuesta(g, segundos):
    """Deja la respuesta a la vista y la recorre despacio (el panel se desplaza solo hacia abajo)."""
    g.esperar(1.0)
    alto = g.pg.evaluate("document.querySelector('#asis-msgs').scrollHeight - document.querySelector('#asis-msgs').clientHeight")
    if alto > 20 and g.grabar:
        g.pg.evaluate("([a, ms]) => new Promise(ok => { const m = document.querySelector('#asis-msgs'), t0 = performance.now(), y0 = m.scrollTop; const f = (t) => { const k = Math.min(1, (t - t0) / ms); m.scrollTop = y0 + (a - y0) * k; k < 1 ? requestAnimationFrame(f) : ok(); }; requestAnimationFrame(f); })", [alto, segundos * 700])
    else:
        g.esperar(segundos * 0.7)


def cap6(g):
    """Asistente de inteligencia artificial"""
    g.tarjeta('Asistente de inteligencia artificial', 'De nuevo en la vista del analista'); g.esperar(1.0)
    g.salir_sesion(); g.entrar_como('lbenitez')
    g.api('POST', '/api/demo/siguiente')                           # escena 15: quedan alertas sin asignar y otras sin tomar
    g.ir('/?demo', espera=0.6); g.clic(g.L('#tab-op'), pausa=0.4); g.quitar_tarjeta()
    with g.decir(T['asis1']):
        g.clic(g.L('#asis-boton'), pausa=1.0)
        g.clic(g.L('#asis-panel button', has_text='sin asignar').first, pausa=1.0)
        g.pg.wait_for_function("!document.querySelector('#asis-msgs').innerText.includes('Pensando')", timeout=60000)
        leer_respuesta(g, 6)
    with g.decir(T['asis2']):
        g.pasar(g.L('#asis-msgs button', has_text='Derivar').first, pausa=1.0)
        g.clic(g.L('#asis-msgs button', has_text='Derivar').first, pausa=2.0)
        g.pg.wait_for_load_state('networkidle'); g.esperar(1.0)
    with g.decir(T['asis3']):
        preguntar(g, '¿Cómo está la carga de cada persona y equipo?')
        leer_respuesta(g, 6)
    g.clic(g.L('#asis-cerrar'), pausa=0.6)
    with g.decir(T['asis4']):
        fila = g.L('tr', has_text='El servicio responde lento')
        g.clic(fila.get_by_role('button', name='¿Qué está pasando?'), pausa=1.0)
        g.pg.wait_for_function("!document.querySelector('#asis-msgs').innerText.includes('Pensando')", timeout=60000)
        leer_respuesta(g, 6)
    with g.decir(T['asis5']):
        preguntar(g, '¿Hay algo de afuera que pueda afectar hoy o mañana?')
        leer_respuesta(g, 6)
    g.clic(g.L('#asis-cerrar'), pausa=0.8)


# ---------- AICIM: sala de crisis y Gemma en Teams ----------
SALA = {}      # id de la sala, para la maqueta de Teams


def respuesta_bot(g, usuario, pregunta, origen='https://worker-alertas-cron.developers-hs-842.workers.dev'):
    """Lo que contestaría Gemma en Teams: la misma ruta del asistente de Helios (con el usuario de quien pregunta) y el mismo formato del bot."""
    j = g.api_como(usuario, 'POST', '/api/asistente', {'pregunta': pregunta, 'incidente_id': SALA['id']})
    assert j.get('ok'), j
    t = (j.get('respuesta') or '').strip()
    acc = j.get('acciones') or []
    if acc:
        t += '\n\n**Propuestas (no se hizo nada)**\n' + '\n'.join('- ' + ' · '.join(x for x in [(a.get('titulo') or a.get('tipo')) + (' → ' + a['destino'] if a.get('destino') else ''), a.get('alerta'), a.get('motivo')] if x) for a in acc)
        t += '\n\nPara hacerlo, abrilo en Helios: ' + origen + '/incidente/%d' % SALA['id']
    else:
        t += '\n\n[Abrir la sala IM-%d en Helios](%s/incidente/%d)' % (SALA['id'], origen, SALA['id'])
    return t


def cap7(g):
    """AICIM: la sala de crisis"""
    g.tarjeta('AICIM', 'Asistente Inteligente de Coordinación de Incidentes Mayores', items=[
        'Dirige y coordina la resolución de incidentes mayores',
        'Conoce la infraestructura, sus dependencias y antecedentes operativos',
        'Conduce la sala de crisis y asigna tareas a los especialistas',
        'Indica qué componentes revisar y orienta el diagnóstico'])
    with g.decir(T['aicim1']):
        g.esperar(0.3)
    g.quitar_tarjeta()
    g.salir_sesion(); g.entrar_como('lbenitez')
    for _ in range(4): g.api('POST', '/api/demo/siguiente')       # escenas 16 a 19, sin mostrar
    g.ir('/?demo', espera=0.8); g.clic(g.L('#tab-op'), pausa=0.4)
    with g.decir(T['sala1']):
        escena(g, espera=1.2)                                    # escena 20: se cae el gateway de pagos
        g.pasar(g.L('tr', has_text='CLI_006').first, pausa=1.0)
        fila = g.L('tr', has_text='No se aprueba ninguna operación').first
        g.clic(fila.get_by_role('link', name='Detalle'), pausa=0.8)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.8)
        g.clic(g.L('#acciones button', has_text='Abrir sala de crisis'), pausa=1.0)
        g.pg.wait_for_url('**/incidente/*'); g.pg.wait_for_load_state('networkidle'); g.esperar(0.8)
    SALA['id'] = int(g.pg.url.rstrip('/').split('/')[-1])
    with g.decir(T['sala2']):
        g.clic(g.L('#u-acc button', has_text='Sumar alertas'), pausa=0.8)
        g.pg.wait_for_function("document.querySelectorAll('#al-lista input').length > 0")
        for cli in ('CLI_002', 'CLI_005'):
            g.clic(g.L('#al-lista label', has_text=cli).first, pausa=0.5)
        g.clic(g.L('#al-ok'), pausa=1.2)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.pasar(g.L('#u-alertas'), pausa=1.2)
        g.pasar(g.L('#u-guia'), pausa=2.5)
        g.pasar(g.T('Incidentes parecidos', exact=True), pausa=2.0)
    with g.decir(T['sala3']):
        g.clic(g.L('#asis-boton'), pausa=1.0)
        g.clic(g.L('#asis-sug button', has_text='Qué reviso primero').first, pausa=1.0)
        g.pg.wait_for_function("!document.querySelector('#asis-msgs').innerText.includes('Pensando')", timeout=60000)
        leer_respuesta(g, 5)
        for _ in range(2):                                       # las dos tareas propuestas (el botón de cada propuesta dice «Hacerlo»)
            g.clic(g.L('#asis-msgs .asis-btn.prim:not([disabled])', has_text='Hacerlo').first, pausa=1.2)
            g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.clic(g.L('#asis-cerrar'), pausa=0.8)
        g.pg.reload(wait_until='load'); g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.pasar(g.L('#u-tareas'), pausa=2.0)
    with g.decir(T['sala4']):
        g.salir_sesion(); g.entrar_como('mramos'); g.ir('/incidentes', espera=0.8)
        g.clic(g.L('a[href^="/incidente/"]').first, pausa=0.8)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.pasar(g.L('#u-tareas'), pausa=0.8)
        mia = g.L('#u-tareas li.mia').first
        g.clic(mia.get_by_role('button', name='Empezar'), pausa=1.0)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.clic(g.L('#u-tareas li.mia').first.get_by_role('button', name='Marcar hecha'), pausa=0.6)
        g.escribir(g.L('#he-res'), 'El certificado del enlace con el proveedor de cobranza venció a las 14:40. Se pidió la renovación.')
        g.clic(g.L('#f-hecha button[type=submit]'), pausa=1.2)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.pasar(g.L('#u-linea'), pausa=1.5)
    g.salir_sesion(); g.entrar_como('lbenitez')


def cap8(g):
    """Gemma en Microsoft Teams"""
    id_ = SALA['id']; sala = g.api('GET', '/api/incidentes/%d' % id_)
    titulo = 'IM-%d · %s' % (id_, sala['incidente']['titulo'])
    r_como = respuesta_bot(g, 'lbenitez', '¿Cómo vamos con este incidente?')
    r_esc = respuesta_bot(g, 'lbenitez', '¿Escalo esto al proveedor?')
    g.pg.evaluate("o => window.__teams(o)", {'titulo': titulo, 'miembros': ['Laura Benítez', 'Matías Ramos', 'Carolina Vega', 'Gemma'], 'yo': 'Laura Benítez', 'vista': 'chat'})

    def escribir_en_teams(texto, hora):
        for k in range(1, len(texto) + 1):
            g.pg.evaluate("t => window.__tmsCompose(t)", texto[:k])
            if g.grabar: g.pg.wait_for_timeout(32)
        g.esperar(0.4)
        g.pg.evaluate("a => window.__tmsEnviar(a[0], a[1], a[2])", ['Laura Benítez', hora, texto])
    with g.decir(T['teams1']):
        g.esperar(1.0)
        escribir_en_teams('@Gemma ¿Cómo vamos con este incidente?', '15:21')
        g.pg.evaluate("window.__tmsBot(true)"); g.esperar(1.6); g.pg.evaluate("window.__tmsBot(false)")
        g.pg.evaluate("m => window.__tmsMsg(m)", {'quien': 'Gemma', 'bot': True, 'hora': '15:21', 'md': r_como})
        g.esperar(1.5)
    with g.decir(T['teams2']):
        g.esperar(2.0)
    with g.decir(T['teams3']):
        escribir_en_teams('@Gemma ¿Escalo esto al proveedor?', '15:23')
        g.pg.evaluate("window.__tmsBot(true)"); g.esperar(1.6); g.pg.evaluate("window.__tmsBot(false)")
        g.pg.evaluate("m => window.__tmsMsg(m)", {'quien': 'Gemma', 'bot': True, 'hora': '15:23', 'md': r_esc})
        g.esperar(2.0)
    g.pg.evaluate("window.__teams(null)"); g.esperar(0.6)


def cap9a(g):
    """Cierre de la sala y novedades en el canal de Teams"""
    g.api('POST', '/api/demo/siguiente')                             # escena 21: sigue caído
    g.ir('/incidente/%d' % SALA['id'], espera=0.8)
    with g.decir(T['sala5']):
        g.api('POST', '/api/demo/siguiente')                         # escena 22: servicio restablecido
        g.pg.reload(wait_until='load'); g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.clic(g.L('#u-acc button', has_text='Servicio restablecido'), pausa=1.0)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.6)
        g.clic(g.L('#u-acc button', has_text='Cerrar con causa raíz'), pausa=0.8)
        g.escribir(g.L('#ce-causa'), 'Certificado vencido en el enlace entre el gateway de pagos y el proveedor de cobranza.')
        g.L('#ce-comp').select_option(label='Gateway de pagos')
        g.escribir(g.L('#ce-res'), 'Se renovó el certificado y se reinició el gateway. Se suma un aviso 30 días antes de cada vencimiento.')
        g.clic(g.L('#f-cerrar button[type=submit]'), pausa=1.5)
        g.pg.wait_for_load_state('networkidle'); g.esperar(0.8)
    # Novedades de la sala tal como las manda Helios al canal de Teams (se arman con la línea de tiempo real)
    sala = g.api('GET', '/api/incidentes/%d' % SALA['id']); inc = sala['incidente']
    cron = list(reversed(sala['linea']))                             # la API da lo más nuevo primero
    elegir = lambda f: next(x for x in cron if f(x))
    linea = [elegir(lambda x: x['tipo'] == 'APERTURA'), elegir(lambda x: x['tipo'] == 'TAREA' and ': hecha' in (x.get('texto') or '')),
             elegir(lambda x: x['tipo'] == 'ESTADO' and 'mitig' in (x.get('texto') or '').lower()), elegir(lambda x: x['tipo'] == 'CIERRE')]
    g.pg.evaluate("o => window.__teams(o)", {'titulo': 'IM-%d · %s' % (SALA['id'], inc['titulo']), 'miembros': [], 'yo': 'Laura Benítez', 'vista': 'canal'})
    hora = lambda iso: '%02d:%02d' % ((int(iso[11:13]) - 3) % 24, int(iso[14:16]))
    with g.decir(T['teams4']):
        g.esperar(1.0)
        for x in linea:
            est = 'Cerrado' if x['tipo'] == 'CIERRE' else 'Mitigado' if 'mitig' in (x.get('texto') or '').lower() else 'Abierto'
            g.pg.evaluate("t => window.__tmsTarjeta(t)", {'titulo': ('🔴 ' if est == 'Abierto' else '') + 'IM-%d · %s' % (SALA['id'], inc['titulo']), 'hora': hora(x['fecha']),
                'sub': est + ' · Grave · CLI_006 · Pago de servicios', 'filas': [[x.get('usuario') or 'Helios', (x['texto'] if len(x['texto']) <= 170 else x['texto'][:167].rstrip() + '…')]],
                'color': '#C4314B' if est == 'Abierto' else '#0F766E', 'boton': 'Abrir sala en Helios'})
            g.esperar(1.6)
        g.esperar(1.0)
    g.pg.evaluate("window.__teams(null)"); g.esperar(0.6)


def cap9(g):
    """Cierre"""
    g.tarjeta('Helios', 'Enterate antes que tus clientes', items=[
        'Pre-alertas anticipadas', 'Alertas priorizadas y derivadas desde un solo lugar', 'Comunicación del incidente sin carga manual',
        'Aviso push a nivel gerencial', 'Dashboard para Gerencia', 'Asistente de inteligencia artificial', 'Sala de crisis con el asistente en Microsoft Teams'])
    with g.decir(T['fin']):
        g.esperar(0.5)
    g.esperar(1.0)


CAPITULOS = [cap1, cap2, cap3, cap4, cap5, cap6, cap7, cap8, cap9a, cap9]
