# Sala de crisis (parche 69) — cómo publicarla y probarla

Primera etapa del AICIM: cuando varias alertas son parte de un mismo problema grande, el Analista abre una **sala de crisis** que las agrupa, con tareas, línea de tiempo y una guía de diagnóstico. El asistente de IA lee la sala y **propone** tareas, escalamientos y comunicados; siempre los confirma una persona. Microsoft Teams queda para la etapa 2.

Plan, decisiones y detalle técnico: `plan_sala_crisis_etapa1.md`.

## 1. Publicar (en este orden)

1. **Script 23** (correo de cada usuario, parche 68): ya se corrió el 20/11. Si alguna vez hay que rearmar la base, va antes del 24.
2. **Script 24:** `02_Base_de_datos_D1/24_sala_crisis_d1.txt` en la consola de D1, los 30 bloques en orden (cada uno es una línea). Se pueden repetir sin duplicar nada.
3. **Comprobar** con la consulta que está al principio del script 24 (solo lee). Tiene que dar **6, 9, 18 y 3** (tablas nuevas, componentes, dependencias y antecedentes).
4. **Worker:** pegar `01_Worker/worker_alertas_cron.js` en "Edit code" del Worker `worker-alertas-cron` y Deploy. Trae también los parches 64 a 68, si todavía no estaban publicados.

No hace falta tocar variables ni secretos. Si por error se publica el Worker antes del script 24, Helios anda igual y la sala avisa que falta el script.

**Para volver atrás:** `99_Archivo_viejo/worker_antes_parche69/` (ver su `LEEME.md`) o el Rollback del panel. Las tablas nuevas pueden quedar en la base.

## 2. Recorrer la demo (escenas 20 a 22)

"Preparar demo" y avanzar hasta la escena 19 como siempre. Después:

| Escena | Qué pasa | Qué hacer (como Analista) |
|---|---|---|
| 20 · Se cae el gateway de pagos | CLI_006 no aprueba pagos de servicios por API (3 alertas graves) y suben los errores en CLI_002 y CLI_005 | Abrir la alerta grave de CLI_006 → **Abrir sala de crisis**. En la sala, **Sumar alertas** → las de CLI_002 y CLI_005 |
| 21 · La sala de crisis trabaja | Sigue caído | Asistente → **¿Qué reviso primero?** → confirmar las tareas que propone. Entrar como Soporte: llega el aviso, **Empezar** y **Marcar hecha** con lo que se encontró |
| 22 · Servicio restablecido | Las alertas se cierran solas | **Comunicar** → **Cerrar con causa raíz** (por ejemplo, componente "Gateway de pagos") |

## 3. Probar el asistente con el modelo real (Gemma)

Las respuestas se probaron con un modelo simulado. Falta hacerlo con Workers AI. Dentro de la sala, como **Analista**:

- [ ] **¿Cómo vamos con este incidente?** Estado y desde cuándo, qué se sabe por las tareas hechas, qué falta y quién lo tiene. No inventa causas.
- [ ] **¿Qué reviso primero?** Empieza por el componente del antecedente parecido (IM-1, certificado vencido del gateway) y deja hasta 2 botones **Asignar tarea**. Tocar uno crea la tarea con la marca "Asistente".
- [ ] **¿Qué está demorado?** Si no hay nada, lo dice en una frase.
- [ ] Una pregunta libre, por ejemplo "¿Escalo esto al proveedor?". Tiene que responder con los datos (no "dejame consultar…") y, salvo que diga que no hace falta, dejar el botón **Escalar** (desde el parche 71). Si propone **Escalar** o **Comunicar**, el botón tiene que funcionar. Comunicar abre "Comunicar incidente" de la alerta con el mensaje armado.

Después, como **Gerente**: las mismas preguntas responden, pero sin botones. Como **Soporte** con una tarea en la sala: responde, sin botones.

Fuera de la sala, el asistente tiene que responder igual que antes. Probar una pregunta sugerida del tablero.

**Prueba completa:** el gold set `Helios_gold_set_asistente.docx` tiene 20 preguntas con la respuesta esperada y la planilla de puntaje.

**En Observability**, revisar que no aparezcan `Asistente: respuesta vacía` ni `no aceptó enable_thinking`. Si algo no responde bien, anotar la pregunta, el perfil y la respuesta, para ajustar la guía de esa pregunta (`SALA_SUGERENCIAS` en `sala_crisis_asistente.js`).

## 4. Qué puede hacer cada perfil

| | Analista | Soporte | Gerente / Administrador |
|---|---|---|---|
| Ver la lista y las salas | Todas | Solo donde tiene una tarea (suya o de su equipo) | Todas, en lectura |
| Abrir, sumar alertas, asignar tareas, escalar, cambiar estado, cerrar | Sí | No | No |
| Actualizar tareas | Todas | Las suyas o de su equipo (no las cancela) | No |
| Notas en la línea de tiempo | Sí | Si tiene una tarea | No |
| Propuestas del asistente en la sala | Sí | No | No |

Cada acción queda en la línea de tiempo de la sala y en la auditoría. La tarea nueva, el escalamiento, la tarea hecha y el cambio de estado llegan como aviso a la campanita y al celular, y llevan a la sala.

## 5. Problemas comunes

- **"Falta correr 24_sala_crisis_d1.txt…"**: falta el script 24 (paso 1.2).
- **"La alerta ya está en la sala IM-N"**: una alerta solo puede estar en una sala abierta. Cuando esa sala se cierra, se puede sumar a otra.
- **Soporte no ve la sala**: solo la ve si tiene una tarea asignada a su usuario o a su equipo.
- **No aparece "Abrir sala de crisis" en la alerta**: solo lo ve el Analista, con la alerta abierta y si no está ya en una sala abierta.
- **La guía dice "No hay componentes cargados"**: el catálogo de infraestructura es de ejemplo y cubre los 4 servicios de la demo. Uno real se carga por SQL (la pantalla para editarlo es de la etapa 2).
