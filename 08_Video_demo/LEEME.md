# Video de demostración de Helios

Graba la app de punta a punta (como lo haría una persona usándola) y arma el video con subtítulos y voz en off. Todo corre en la PC, sin Cloudflare: usa el mismo Worker de siempre (`07_Codigo_fuente/worker/w.mjs`) sobre una base SQLite, igual que `servidor_local.mjs`.

## Qué muestra (≈ 7 min 55 s)
1. Presentación.
2. **Pre-alertas anticipadas** (aviso hasta 30 minutos antes, "Avisar a Soporte", efectividad de los avisos).
3. **Alertas priorizadas y derivadas** (P1 a P4, derivar a mano, regla automática, Seguimiento).
4. **Soporte** toma la alerta, comenta y adjunta evidencia, genera el ticket de Jira, **comunica el incidente por push**, arma el **correo** (con destinatarios elegidos de la lista) y resuelve con causa.
5. **Gerencia**: abre el comunicado y mira el tablero (Operaciones, Disponibilidad con distribución de fallas, Histórico).
6. **Asistente de inteligencia artificial** (sin asignar y derivación con un clic, carga de equipos, explicación de una alerta con casos parecidos, contexto externo), y al final dos tarjetas con **AICIM** (Asistente Inteligente de Coordinación de Incidentes Mayores) integrado con Microsoft Teams.
7. Cierre.

## Lo que es simulación (y no es la app)
- **AICIM y la integración con Teams:** todavía no existen. En el video se presentan como "próxima capacidad" en dos tarjetas con la voz en off; no se muestra una pantalla.
- **Aviso push en el celular (Android y iPhone):** es un dibujo de teléfono (`overlays.js`). El texto y los botones son los reales que arma el Worker para cada rol (se leen de `/api/avisos`); tocar "Recibido" registra el "Recibido" de verdad. Lleva el rótulo "simulación".
- **Outlook:** Helios abre el borrador en Outlook; en el video se muestra un Outlook de mentira con los datos reales del correo (lleva una nota que lo aclara).
- **Asistente de IA:** `ia_guion.mjs` reemplaza a Workers AI. No inventa datos: redacta con plantillas lo que Helios le pasaría al modelo real (alertas abiertas, carga, casos parecidos, contexto externo). Con el modelo real las palabras pueden variar.
- **Ticket de Jira:** el Worker corre en modo simulado (HEL-101), como cuando no está `TICKETS_JIRA = real`.
- **Contexto externo:** proveedores y noticias son datos de ejemplo guardados en la caché (`historial.py`, `sembrar_contexto`); el calendario sale de la base con el reloj de la demo.
- **Datos:** personas, clientes, alertas de días anteriores (para los casos parecidos y el Histórico) y la captura de logs (`captura_logs_gateway.png`) son ficticios.
- **Llegada de datos:** se avanza escena por escena con "Siguiente escena" (la demo de siempre).

## Cómo se usa
Hace falta: Python 3.11+ con `pip install playwright imageio-ffmpeg pillow` (y `python -m playwright install chromium`), Node 22.5+, el Worker construido (`07_Codigo_fuente/worker/w.mjs`, ver `CLAUDE.md`) y Windows con la voz "Microsoft Helena" (la de la voz en off).

```powershell
python grabar.py --salida .\salida\trabajo           # graba (≈ 9 min): pantalla.webm + tiempos.json
python armar.py .\salida\trabajo .\salida\video      # arma los mp4, la voz y los subtítulos
python grabar.py --seco                              # pasada de prueba rápida, sin video
```

## Archivos que genera `armar.py`
- `Helios_demo_completo_con_voz_y_subtitulos.mp4`
- `Helios_demo_con_subtitulos_sin_audio.mp4`
- `Helios_demo_sin_subtitulos_ni_audio.mp4` (la franja de abajo queda vacía)
- `Helios_demo_voz_en_off.wav` y `.mp3` (la voz sola, sincronizada con el video)
- `Helios_demo_subtitulos.srt`

## Código
`grabar.py` (arranque) · `capitulos.py` (los pasos de cada capítulo) · `guion.py` (el texto de la voz y de los subtítulos) · `grab.py` (navegador, cursor, esperas) · `overlays.js` (cursor, tarjetas, teléfono y Outlook simulados) · `voz.py` (voz de Windows) · `armar.py` (montaje) · `preparar_base.mjs` (personas, equipos y regla de la demo) · `historial.py` (historial y contexto de ejemplo) · `servidor_demo.mjs` e `ia_guion.mjs`.
Para cambiar lo que se dice, se edita `guion.py`; para cambiar lo que se hace, `capitulos.py`.
