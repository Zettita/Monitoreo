# Biblioteca de grabación: maneja el navegador (Playwright), graba la pantalla, muestra subtítulos y cursor,
# y anota en qué segundo empieza cada frase de la voz en off para armar el audio aparte.
import json, math, os, random, time
from contextlib import contextmanager
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
ANCHO, ALTO, ESCALA = 1600, 825, 1.2          # se ve a 1600 x 825 y se graba en 1920 x 990; abajo quedan 90 px para los subtítulos (se agregan al armar el video)
SUBS_EN_PAGINA = False
PAUSA_DESPUES_DE_FRASE = 0.5


class Grabador:
    def __init__(self, base, voces, carpeta_trabajo, grabar=True):
        """voces: {texto: (wav, duracion)}. grabar=False hace una pasada en seco (sin video y con esperas cortas)."""
        self.base, self.voces, self.trabajo, self.grabar = base, voces, carpeta_trabajo, grabar
        self.t0 = None
        self.frases = []        # (segundo, texto, wav)
        self.capitulos = []     # (segundo, titulo)
        self.pw = self.nav = self.ctx = self.pg = None
        self.mx, self.my = 800, 450
        self.video = os.path.join(carpeta_trabajo, 'pantalla.webm')

    # ---- ciclo de vida
    def abrir(self):
        self.pw = sync_playwright().start()
        self.nav = self.pw.chromium.launch(args=['--force-device-scale-factor=%s' % ESCALA, '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'])
        self.ctx = self.nav.new_context(viewport={'width': ANCHO, 'height': ALTO}, device_scale_factor=ESCALA, locale='es-AR', timezone_id='America/Argentina/Buenos_Aires')
        with open(os.path.join(AQUI, 'overlays.js'), encoding='utf-8') as f:
            self.ctx.add_init_script(f.read())
        self.pg = self.pw_page = self.ctx.new_page()
        self.errores = []
        self.pg.on('console', lambda m: self.errores.append(m.text) if m.type == 'error' else None)
        self.pg.on('pageerror', lambda e: self.errores.append('pageerror: ' + str(e)))

    def empezar(self):
        if self.grabar:
            os.makedirs(self.trabajo, exist_ok=True)
            if os.path.exists(self.video): os.remove(self.video)
            self.pg.screencast.start(path=self.video, fps=30, quality=95, size={'width': int(ANCHO * ESCALA), 'height': int(ALTO * ESCALA)})
        self.t0 = time.perf_counter()

    def cerrar(self):
        if self.grabar:
            try: self.pg.screencast.stop()
            except Exception as e: print('screencast.stop:', e)
        self.ctx.close(); self.nav.close(); self.pw.stop()

    def t(self):
        return time.perf_counter() - self.t0

    # ---- tiempo y voz
    def esperar(self, s):
        self.pg.wait_for_timeout(int(s * 1000 * (1 if self.grabar else 0.05)))

    @contextmanager
    def decir(self, texto, pausa=PAUSA_DESPUES_DE_FRASE):
        """Muestra el subtítulo y reproduce la frase; lo que se haga adentro ocurre mientras se habla.
        Al salir espera a que termine la frase."""
        wav, dur = self.voces[texto]
        ini = self.t()
        self.frases.append((round(ini, 3), texto, wav, round(dur, 3)))
        if SUBS_EN_PAGINA: self.subtitulo(texto)
        try:
            yield
        finally:
            resto = ini + dur + pausa - self.t()
            if self.grabar and resto > 0: self.pg.wait_for_timeout(int(resto * 1000))
            if SUBS_EN_PAGINA: self.subtitulo('')

    def subtitulo(self, texto):
        try: self.pg.evaluate('t => window.__sub && window.__sub(t)', texto)
        except Exception: pass

    def capitulo(self, titulo):
        self.capitulos.append((round(self.t(), 3), titulo))

    def tarjeta(self, titulo, sub=None, items=None):
        self.pg.evaluate('o => window.__card(o)', {'titulo': titulo, 'sub': sub, 'items': items})

    def quitar_tarjeta(self):
        self.pg.evaluate('window.__card(null)'); self.esperar(0.7)

    # ---- navegación
    def entrar_como(self, usuario, clave='Helios2026!'):
        r = self.ctx.request.post(self.base + '/api/login', data={'usuario': usuario, 'clave': clave})
        assert r.ok and r.json().get('ok'), r.text()

    def salir_sesion(self):
        try: self.ctx.request.post(self.base + '/api/logout')
        except Exception: pass

    def ir(self, ruta, espera=1.0):
        self.pg.goto(self.base + ruta, wait_until='load')
        self.pg.wait_for_load_state('networkidle')
        self.esperar(espera)

    def api(self, metodo, ruta, datos=None):
        r = self.ctx.request.fetch(self.base + ruta, method=metodo, data=datos)
        return r.json() if 'json' in (r.headers.get('content-type') or '') else r.text()

    def api_como(self, usuario, metodo, ruta, datos=None, clave='Helios2026!'):
        ctx = self.pw.request.new_context(base_url=self.base)
        try:
            r = ctx.post('/api/login', data={'usuario': usuario, 'clave': clave}); assert r.ok, r.text()
            r = ctx.fetch(ruta, method=metodo, data=datos)
            return r.json() if 'json' in (r.headers.get('content-type') or '') else r.text()
        finally:
            ctx.dispose()

    # ---- mouse natural
    def _punto(self, loc):
        loc.first.wait_for(state='visible', timeout=15000)
        cuadro = loc.first.bounding_box()
        return cuadro['x'] + cuadro['width'] / 2, cuadro['y'] + cuadro['height'] / 2

    def mover_a(self, x, y, dur=None):
        d = math.hypot(x - self.mx, y - self.my)
        dur = dur or min(1.1, max(0.35, d / 1400))
        n = max(8, int(dur * 45))
        x0, y0 = self.mx, self.my
        for i in range(1, n + 1):
            k = i / n; e = k * k * (3 - 2 * k)                      # suavizado de salida y llegada
            self.pg.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            if self.grabar: self.pg.wait_for_timeout(int(dur * 1000 / n))
        self.mx, self.my = x, y

    def ver(self, loc, margen=140):
        """Desplaza la página, con suavidad, hasta que el elemento quede visible."""
        loc.first.wait_for(state='attached', timeout=15000)
        if loc.first.evaluate("e => !!e.closest('dialog[open]')"):          # dentro de un diálogo se desplaza el diálogo, no la página
            if self.grabar: self.suave_en_dialogo(loc)
            else: loc.first.scroll_into_view_if_needed()
            return
        if loc.first.evaluate("e => !!e.closest('#asis-msgs')"):            # panel del asistente: se desplaza el panel
            loc.first.evaluate("e => e.scrollIntoView({ block: 'center', behavior: 'smooth' })"); self.esperar(0.7); return
        c = loc.first.bounding_box()
        if c is None:
            loc.first.scroll_into_view_if_needed(); return
        if c['y'] < margen or c['y'] + c['height'] > ALTO - margen:
            destino = self.pg.evaluate('y => Math.max(0, window.scrollY + y)', c['y'] - 220)
            self.desplazar(destino)

    def suave_en_dialogo(self, loc):
        loc.first.evaluate('''e => { const d = e.closest('dialog[open]'); const r = e.getBoundingClientRect(), dr = d.getBoundingClientRect();
          if (r.top < dr.top + 60 || r.bottom > Math.min(dr.bottom, innerHeight) - 30) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }''')
        self.esperar(0.7)

    def desplazar(self, y, dur=0.9):
        if not self.grabar:
            self.pg.evaluate('y => window.scrollTo(0, y)', y); return
        self.pg.evaluate('''([y, ms]) => new Promise(ok => { const y0 = window.scrollY, t0 = performance.now();
          const f = (t) => { const k = Math.min(1, (t - t0) / ms), e = k * k * (3 - 2 * k); window.scrollTo(0, y0 + (y - y0) * e); k < 1 ? requestAnimationFrame(f) : ok(); };
          requestAnimationFrame(f); })''', [y, dur * 1000])

    def desplazar_arriba(self):
        if self.pg.evaluate('window.scrollY') > 40: self.desplazar(0)

    def pasar(self, loc, pausa=0.6):
        """Lleva el cursor sobre el elemento (sin hacer clic)."""
        self.ver(loc); x, y = self._punto(loc); self.mover_a(x, y); self.esperar(pausa)

    def clic(self, loc, pausa=0.7):
        self.ver(loc); x, y = self._punto(loc); self.mover_a(x, y); self.esperar(0.25)
        self.pg.mouse.down(); self.esperar(0.08); self.pg.mouse.up(); self.esperar(pausa)

    def escribir(self, loc, texto, demora=0.042):
        self.clic(loc, pausa=0.2)
        self.pg.keyboard.press('Control+End')
        for ch in texto:
            self.pg.keyboard.type(ch)
            if self.grabar: self.pg.wait_for_timeout(int(demora * 1000 * random.uniform(0.7, 1.4)))
        self.esperar(0.3)

    def foto(self, nombre):
        d = os.path.join(self.trabajo, 'fotos'); os.makedirs(d, exist_ok=True)
        self.pg.screenshot(path=os.path.join(d, nombre + '.png'))

    # ---- aliases
    def L(self, *a, **k): return self.pg.locator(*a, **k)
    def T(self, texto, **k): return self.pg.get_by_text(texto, **k)
    def R(self, rol, **k): return self.pg.get_by_role(rol, **k)

    def guardar_tiempos(self):
        with open(os.path.join(self.trabajo, 'tiempos.json'), 'w', encoding='utf-8') as f:
            json.dump({'frases': self.frases, 'capitulos': self.capitulos, 'duracion': round(self.t(), 3)}, f, ensure_ascii=False, indent=1)
