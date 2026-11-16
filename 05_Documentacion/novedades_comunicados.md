# Comunicar incidente por push (parche 46)

Guía para poner en marcha y usar **"Comunicar incidente"**: el aviso "Tenemos este incidente" que el analista manda desde la alerta al celular o la PC de las personas que se tienen que enterar, con el ticket incluido y la posibilidad de dar "Recibido" y responder.

## El flujo completo

1. Aparece una alerta y el analista la empieza a gestionar (la deriva, la toma Soporte).
2. Desde el detalle de la alerta toca **"Comunicar incidente"**, elige las listas de difusión y manda el aviso. El mensaje viene armado (qué pasa, cliente, servicio, desde cuándo, gravedad, prioridad y ticket) y se puede editar. Si todavía no hay ticket, se puede tildar **"Generar ticket ahora en InvGate / Jira"** y el número se suma al mensaje.
3. A cada persona le llega un aviso al celular o la PC (aunque Helios esté cerrado) y queda en su campanita.
4. Según su rol en la lista:
   - **Informado** (por ejemplo, atención al cliente): solo lee. Sirve para saber qué contestarle a un cliente que pregunte.
   - **Técnico**: el aviso trae **"Recibido"** (con un toque queda registrado, sin abrir Helios) y **"Responder"**.
   - **Líder / dueño de negocio**: el aviso trae **"Responder"**, para sumar información (por ejemplo: "además tengo este mensaje de error, ¿podrán verlo?").
5. Todo vuelve a la conversación de la alerta: el comunicado con el resumen ("Recibido: 2 de 3 técnicos · Lo vieron 5 de 8") y cada respuesta. A quien comunicó (y a quien tiene la alerta) le llega un aviso con cada respuesta.
6. El correo ("Template correo alerta") y el ticket siguen funcionando igual y llevan el mismo número de ticket.

## Cómo ponerlo en marcha

1. **Base:** correr `02_Base_de_datos_D1/21_comunicados_d1.txt` en la consola de D1 (6 bloques, uno por vez), antes de publicar el Worker.
2. **Personas que hoy no usan Helios** (por ejemplo, atención al cliente): Administración > Usuarios > crear el usuario con el perfil **"Solo comunicados"**. Al entrar, ven solo sus comunicados; nada del tablero ni de las alertas.
3. **Listas de difusión:** Administración > **Listas de difusión** (solo el Administrador). Cada lista tiene un nombre, sirve para **todas las alertas (general)** o **solo para las de un cliente** (esas se proponen primero), y cada persona tiene su rol: informado, técnico o líder. Pueden estar Analistas, Soporte, Gerentes y "Solo comunicados" (no los administradores).
4. **Activar los avisos en cada dispositivo:** cada persona entra una vez a Helios y toca la campanita > **Activar** (la página de comunicados lo recuerda). En iPhone, primero hay que agregar Helios a la pantalla de inicio (ver `novedades_avisos_push_y_app.md`).

## Qué cambia para cada perfil

| Perfil | Antes | Ahora |
|---|---|---|
| Analista | — | "Comunicar incidente" en el detalle de la alerta; puede estar en listas |
| Soporte | — | "Comunicar incidente" en lo suyo o de su equipo; puede estar en listas |
| Gerente | Sin campanita | **Con campanita y push**: solo le llegan los comunicados (puede ser líder en una lista) |
| Solo comunicados | No existía | Entra a `/comunicados`: la lista de lo que le llegó y cada comunicado completo |
| Administrador | — | Arma las listas de difusión. No recibe comunicados |

En el menú del usuario aparece **"Comunicados"** para quien los recibe.

## Límites

- Un comunicado llega a **hasta 100 personas** (si alguien está en varias listas elegidas, le llega una vez, con el rol que más puede: técnico > líder > informado).
- El push sale a **hasta 25 dispositivos por envío** (límite que ya tenía Helios por el plan gratuito de Cloudflare). Los demás lo ven igual en la campanita y en `/comunicados`.
- **Botones en el aviso:** Android y la PC con Chrome o Edge muestran "Recibido" y "Responder". En iPhone y en algunos navegadores el aviso no muestra botones: al tocarlo se abre el comunicado y ahí están los mismos botones.
- Responder desde el aviso abre la página del comunicado para escribir: los navegadores no permiten escribir la respuesta dentro del aviso de forma confiable.
- Las respuestas son de texto (hasta 1000 caracteres). Adjuntar una captura desde el comunicado queda para más adelante; mientras tanto, quien trabaja la alerta puede adjuntar evidencia en el detalle.

## Cómo se guarda

- `usuarios.solo_comunicados`: el perfil "Solo comunicados" se guarda como `perfil = 'GERENTE'` + `solo_comunicados = 1`, porque la columna `perfil` tiene una restricción con los 4 perfiles que D1 no deja cambiar sin rehacer la tabla de usuarios (de la que dependen sesiones, equipos y avisos). Helios lo lee siempre como perfil `COMUNICADOS`. Al migrar a PostgreSQL conviene pasarlo a un valor propio de `perfil`.
- `alerta_parametros.listas_difusion`: las listas (JSON).
- `comunicados_incidente`: cada comunicado (alerta, mensaje, listas, quién y cuándo).
- `comunicado_destinatarios`: a quién le llegó, con qué rol, cuándo lo vio y cuándo dio "Recibido".
- Avisos de la campanita: tipo `COMUNICADO_INFORMADO` / `COMUNICADO_TECNICO` / `COMUNICADO_LIDER`, con `alerta_id = 'c' + número del comunicado`.
- Conversación de la alerta (`alerta_eventos`): "Comunicó el incidente (comunicado N) a …" y "Respondió al comunicado N como líder/técnico: …".
- Auditoría: `COMUNICAR_INCIDENTE`, `RESPONDER_COMUNICADO`, `ALTA/EDITAR/BORRAR_LISTA_DIFUSION`.
- "Preparar demo" borra los comunicados.

## Problemas comunes

- **"Todavía no hay listas de difusión para esta alerta"**: no hay listas generales activas ni listas de ese cliente. Las arma el Administrador.
- **No llega el aviso al celular**: la persona no activó los avisos desde la campanita en ese dispositivo, o (en PC) Chrome no queda corriendo en segundo plano. Igual lo ve en la campanita y en `/comunicados`.
- **"Falta correr 21_comunicados_d1.txt"**: falta el script de la base; el resto de Helios funciona igual.
