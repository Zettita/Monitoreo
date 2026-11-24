# Video de demostración de Helios

Graba la app de punta a punta (como lo haría una persona usándola) y arma el video con subtítulos y voz en off. Todo corre en la PC, sin Cloudflare: usa el mismo Worker de siempre (`07_Codigo_fuente/worker/w.mjs`) sobre una base SQLite, igual que `servidor_local.mjs`.

## Qué muestra (≈ 7 min 55 s)
1. Presentación.
2. **Pre-alertas anticipadas** (aviso hasta 30 minutos antes, "Avisar a Soporte", efectividad de los avisos).
3. **Alertas priorizadas y derivadas** (P1 a P4, derivar a mano, regla automática, Seguimiento).
4. **Soporte** toma la alerta, comenta y adjunta evidencia, genera el ticket de Jira, **comunica el incidente por push**, arma el **correo** (con destinatarios elegidos de la lista) y resuelve con causa.
5. **Gerencia**: abre el comunicado y mira el tablero (Operaciones, Disponibilidad con distribución de fallas, Histórico).
6. **Asistente de inteligencia artificial** (sin asignar y derivación con un clic, carga de equipos, explicación de una alerta con casos parecidos, contexto externo).
7. **AICIM: la sala de crisis** (24/11): tarjeta AICIM, el analista abre la sala desde una alerta grave, suma las alertas de los otros clientes, el asistente propone qué revisar primero y a quién asignarlo, Soporte hace su tarea y la marca hecha, y la sala se cierra con la causa raíz.
8. **Gemma en Microsoft Teams** (24/11): el chat de la sala y el canal "Plataforma Monitoreo" (maqueta de Teams; Gemma contesta con los datos reales de la sala).
9. Cierre.

## Lo que es simulación (y no es la app)
- **Microsoft Teams (24/11):** la pantalla es una **maqueta** (`overlays.js`, `window.__teams`) con el cartel "Simulación para el video". Lo que contesta Gemma **no es inventado**: sale de la misma ruta del asistente de Helios (`POST /api/asistente` con la sala, con el usuario de quien pregunta) y se muestra con el mismo formato que arma el bot (`respuesta_bot` en `capitulos.py`); las tarjetas del canal salen de la línea de tiempo real de la sala. El modelo es el "con guion" (`ia_guion.mjs`, que ahora también sabe contestar las preguntas de la sala). El bot real (parches 76 a 78) ya está programado y la app se subió al Teams de la empresa, pero todavía no se probó de punta a punta en Teams.
- **La sala de crisis** (capítulo 7) es la de Helios de verdad: se usa la pantalla real y las escenas 20 a 22 de la demo.
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

## Armado en Linux y audios grabados (24/11)
- El video se puede grabar en Linux (contenedor): hace falta `pip install playwright imageio-ffmpeg pillow`, un Chromium (variable `HELIOS_CHROMIUM` con su ruta si no es el de Playwright), el ffmpeg de Playwright y `127.0.0.1 helios.localhost` en `/etc/hosts` (Windows ya lo resuelve). Sin la voz de Windows, `voz.py` deja **pausas en silencio** del largo que llevaría leer cada frase (unos 14 caracteres por segundo): marcan el ritmo para que una persona ponga su voz.
- **Audios grabados por una persona:** van en `audios/` y se declaran en `guion.py` (`AUDIOS`: clave de la frase → archivo). Se usan tal cual, con su duración real, y reemplazan a la voz sintética en esa frase. Hoy: `demo_AICIM.mp4` (frase `aicim1`) y `demo_Microsoft_Teams.mp4` (frase `teams1`).
- **Tramo nuevo (AICIM, sala de crisis y Teams):** `armar.py` deja, además de los videos completos, el tramo que reemplaza a las dos tarjetas de «lo que viene»: `Helios_tramo_AICIM_Teams_con_audios_y_subtitulos.mp4`, `..._con_subtitulos_sin_audio.mp4`, `..._sin_subtitulos_ni_audio.mp4`, `..._audios.wav`, `..._subtitulos.srt` y `tramo_AICIM_Teams.json` (tiempos de cada frase). `node guion_tramo_aicim_teams.js <carpeta de salida>` arma `Helios_guion_tramo_AICIM_Teams.docx` (y `.txt`) para grabar la voz de lo que no tiene audio.

## Guion para que una persona ponga su voz (19/11)
`node guion_voz_en_off.js salida/video` arma `Helios_guion_voz_en_off.docx` (tabla con tiempo, qué se ve en pantalla y texto) y un `.txt` corrido, para locutar sobre `Helios_demo_sin_subtitulos_ni_audio.mp4`. Lleva la frase pedida: «los campos del producto y sus funcionalidades son variables modificables según necesidad del cliente» (minuto 2:01). Los tiempos son los de la grabación actual: si se vuelve a grabar y cambian, hay que ajustarlos. Hace falta `npm install docx --no-save` en `07_Codigo_fuente/word`.

## Audios grabados (24/11)
`audios/voz_<clave>.m4a` (una por frase de `guion.py`, ya limpiados con ffmpeg: `highpass=80`, `afftdn`, `loudnorm=-18 LUFS`). Con `python grabar.py` + `python armar.py <ruta absoluta de salida/trabajo> <ruta absoluta de salida>` el video usa esas voces y el tiempo en pantalla sigue su duración. Sin audio: `sala1` a `sala5` y `teams2` a `teams4` (voz de relleno en silencio); el guion para grabarlos está en `Helios_guion_tramo_AICIM_Teams.docx`. Para grabar sin la voz de Windows en Linux hace falta `/etc/hosts` con `127.0.0.1 helios.localhost`.

## Archivos que genera `armar.py`
- `Helios_demo_completo_con_voz_y_subtitulos.mp4`
- `Helios_demo_con_subtitulos_sin_audio.mp4`
- `Helios_demo_sin_subtitulos_ni_audio.mp4` (la franja de abajo queda vacía)
- `Helios_demo_voz_en_off.wav` y `.mp3` (la voz sola, sincronizada con el video)
- `Helios_demo_subtitulos.srt`

## Código
`grabar.py` (arranque) · `capitulos.py` (los pasos de cada capítulo) · `guion.py` (el texto de la voz y de los subtítulos) · `grab.py` (navegador, cursor, esperas) · `overlays.js` (cursor, tarjetas, teléfono y Outlook simulados) · `voz.py` (voz de Windows) · `armar.py` (montaje) · `preparar_base.mjs` (personas, equipos y regla de la demo) · `historial.py` (historial y contexto de ejemplo) · `servidor_demo.mjs` e `ia_guion.mjs`.
Para cambiar lo que se dice, se edita `guion.py`; para cambiar lo que se hace, `capitulos.py`.

## Audios limpios, nivel y música de fondo (24/11)
- Los 42 audios de `audios/` se limpiaron de nuevo: se recorta el arranque hasta la primera voz (sin zumbido, golpes ni ruido ambiente), resta espectral de fondo y compuerta suave. Todos quedan en **-22 LUFS** (picos ≤ -3 dBFS), el mismo nivel.
- `musica.py` sintetiza una música base suave (propia, sin derechos). `armar.py` la mezcla con la voz bajándola sola cuando habla (`sidechaincompress`) y deja `Helios_demo_voz_y_musica.wav`; la voz sola sigue aparte (`Helios_demo_voz_en_off.*`).
- Si cambia la duración de un audio hay que volver a correr `grabar.py` (cada escena dura lo que su voz).
