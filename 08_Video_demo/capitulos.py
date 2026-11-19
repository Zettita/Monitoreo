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
        g.L('#d-persona').select_option(label='Diego Ramos · Soporte')
        g.escribir(g.L('#d-texto'), 'Diego, revisá los rechazos del antifraude en CLI_004.')
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
    g.tarjeta('Vista de Soporte', 'Diego Ramos · Mesa de ayuda'); g.esperar(1.0)
    g.salir_sesion(); g.entrar_como('lbenitez')
    for _ in range(5): g.api('POST', '/api/demo/siguiente')   # escenas 10 a 14, mientras se ve la tarjeta: llega la caída total de CLI_006
    g.salir_sesion(); g.entrar_como('dramos'); g.ir('/mis-alertas', espera=0.6); g.esperar(0.6); g.quitar_tarjeta()
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
    # Próxima capacidad (no está construida: se presenta como lo que viene)
    g.tarjeta('AICIM', 'Asistente Inteligente de Coordinación de Incidentes Mayores · próxima capacidad', items=[
        'Dirige y coordina la resolución de incidentes mayores',
        'Conoce la infraestructura, sus dependencias y antecedentes operativos',
        'Conduce la sala de crisis y asigna tareas a los especialistas',
        'Indica qué componentes revisar y orienta el diagnóstico'])
    with g.decir(T['aicim1']):
        g.esperar(0.3)
    g.tarjeta('Integrado con Microsoft Teams', 'La sala de crisis, coordinada desde donde ya trabaja el equipo', items=[
        'Determina los escalamientos necesarios',
        'Supervisa avances, tiempos de respuesta y comunicaciones',
        'Sigue las acciones hasta el restablecimiento del servicio',
        'Siempre bajo supervisión humana'])
    with g.decir(T['aicim2']):
        g.esperar(0.3)


def cap7(g):
    """Cierre"""
    g.tarjeta('Helios', 'Enterate antes que tus clientes', items=[
        'Pre-alertas anticipadas', 'Alertas priorizadas y derivadas desde un solo lugar', 'Comunicación del incidente sin carga manual',
        'Aviso push a nivel gerencial', 'Dashboard para Gerencia', 'Asistente de inteligencia artificial'])
    with g.decir(T['fin']):
        g.esperar(0.5)
    g.esperar(1.0)


CAPITULOS = [cap1, cap2, cap3, cap4, cap5, cap6, cap7]
