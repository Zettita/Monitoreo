# Helios: avisos push, app instalable y logo nuevo (12/11/2026)

> **Para quien lo lea (persona o IA):** este archivo resume lo que se agregó el 12/11 sobre lo que describe `contexto_helios_para_ia.md` (que sigue siendo la fuente de verdad del sistema completo). Viene junto con `worker_alertas_cron.js`, el Worker completo que ya incluye todo esto. Ninguno de los dos archivos tiene contraseñas ni claves secretas.

---

## 1. Qué hay de nuevo

| Novedad | Qué hace |
|---|---|
| **Avisos push** | Los avisos de la campanita (te asignaron una alerta, comentaron, devolvieron, se resolvió, grave sin asignar, "Avisar a Soporte" de una pre-alerta) llegan al celular o a la PC **aunque Helios esté cerrado**, como cualquier aviso del sistema. Al tocarlo se abre Helios en Mis alertas (Soporte) o Seguimiento (Analista) |
| **Helios como app** | Se puede agregar a la pantalla de inicio del celular o instalar en la PC: abre sin la barra del navegador y con su propio ícono |
| **Logo nuevo** | El caballo de ajedrez del logo "Helios System" es el ícono de la app, el de los avisos y el logo de la barra superior de todas las páginas y del login |

Todo es **gratis**: usa el estándar Web Push de los navegadores. Los avisos los entrega el servicio de cada navegador (Google para Chrome y Android, Apple para iPhone, Mozilla para Firefox, Microsoft para Edge en Windows). No hay que contratar nada ni crear cuentas.

**Quién recibe avisos:** Soporte y Analista (los que tienen campanita). Gerente y Administrador no reciben, pero pueden instalar Helios como app.

---

## 2. Cómo se usa en cada dispositivo

**iPhone o iPad** (iOS 16.4 o más nuevo)
1. Abrir Helios en **Safari** (no en Chrome).
2. **Compartir** (cuadrado con flecha) → **Agregar a inicio** → **Agregar**.
3. Abrir Helios **desde ese ícono** e ingresar (el ícono tiene su propia sesión).
4. Campanita → **Activar** → **Permitir**. Llega un aviso de prueba.
5. Sin instalarlo, en iPhone los avisos no llegan: la campanita lo explica.

**Android** (Chrome o el navegador de Samsung)
1. Ingresar a Helios → campanita → **Activar** → **Permitir**. Ya llegan con todo cerrado.
2. Opcional: menú ⋮ → **Agregar a pantalla principal** / **Instalar app**.

**PC con Windows o Mac** (Chrome o Edge)
1. Ingresar → campanita → **Activar** → **Permitir**.
2. Opcional: el ícono de instalar en la barra de direcciones (o ⋮ → **Instalar Helios**).
3. **Importante (lo aprendimos probando):** con la ventana cerrada, Chrome tiene que **seguir corriendo en segundo plano**. Se activa en Chrome → Configuración → Sistema → "Seguir ejecutando aplicaciones en segundo plano al cerrar Google Chrome". Al cerrar la ventana tiene que quedar el ícono de Chrome al lado del reloj de Windows (a veces dentro de la flechita **^**). Si Chrome se cierra del todo, no recibe nada; los avisos se guardan hasta 24 h y llegan juntos al abrirlo.

**Cada equipo se activa por separado.** Al cerrar sesión, ese equipo deja de recibir los avisos de esa persona; al volver a entrar se reactiva solo (si el navegador ya tenía el permiso y nadie tocó "Desactivar").

---

## 3. Si algo no anda

| Síntoma | Qué revisar |
|---|---|
| Con Chrome cerrado no llega nada en la PC | Chrome no queda en segundo plano (ver arriba). En Windows **no** hay que tocar nada en Configuración → Apps: ese permiso es solo para apps de la Microsoft Store |
| No llega ni con Chrome abierto | Windows → Sistema → Notificaciones: activadas y **Google Chrome** activado. "No molestar" / "Concentración" apagados |
| La campanita dice "bloqueados" | Se tocó "Bloquear": habilitarlo desde el candado de la barra de direcciones (en iPhone: Configuración → Notificaciones → Helios) |
| En el iPhone no aparece "Activar" | Abrirlo desde el ícono de inicio, no desde Safari. Si igual no aparece: falta el script 10 o el secreto `VAPID_JWK` en el Worker |
| Chrome pide usuario y contraseña cada vez que se abre | Chrome borra los datos de los sitios al cerrarse: así el push con Chrome cerrado no puede funcionar. Agregar Helios en "Sitios que siempre pueden usar cookies" (Configuración → Privacidad y seguridad). En PCs de la empresa puede estar bloqueado por IT |
| Entra por otra dirección (otro dominio) | Para el navegador es otro sitio: hay que activar de nuevo |

**Diagnóstico rápido** (en la PC con el problema: abrir Helios, F12 → Console, pegar y Enter; solo lee):

```js
(async () => { const r = {}; r.permiso = Notification.permission; r.worker_nuevo = document.documentElement.innerHTML.includes('helios_push_apagado'); const reg = await navigator.serviceWorker.getRegistration(); r.service_worker = reg ? 'sí' : 'no'; r.suscripcion = reg ? ((await reg.pushManager.getSubscription()) ? 'sí' : 'no') : '-'; r.clave_servidor = (await (await fetch('/api/push/clave')).json()).clave ? 'sí' : 'no'; r.desactivado_a_mano = localStorage.getItem('helios_push_apagado'); console.table(r); })()
```

Bien configurado da: permiso `granted` y todo lo demás `true` / `sí` (desactivado `0` o vacío). Si todo da bien y no llega con Chrome cerrado, es el segundo plano de Chrome.

---

## 4. Cómo funciona por dentro (para la IA o para quien siga el desarrollo)

- **Service worker** (`/sw.js`): el navegador lo mantiene aunque la página esté cerrada; recibe el push, muestra el aviso y al tocarlo abre la página que corresponde. **Manifiesto** (`/manifest.webmanifest`) e íconos (`/icono-192.png`, `/icono-512.png`, `/apple-touch-icon.png`, `/icono-insignia.png`): permiten instalar Helios como app. Son rutas **públicas** (el navegador las pide sin sesión).
- **Tabla nueva `suscripciones_push`** (una fila por dispositivo): `endpoint` (PK, la dirección del dispositivo en el servicio de push), `usuario_id`, `clave_p256dh` y `clave_auth` (claves del navegador para cifrar), `creada`, `actualizada`; índice por `usuario_id`. Quedan **21 tablas**. Se crea con `02_Base_de_datos_D1/10_avisos_push_d1.txt` (2 sentencias).
- **Secreto nuevo del Worker `VAPID_JWK`**: la clave que identifica al servidor ante Google, Apple, etc. (JSON de una clave P-256). Se genera con `07_Codigo_fuente/worker/generar_clave_push.mjs`, se carga en Cloudflare (worker → Settings → Variables and Secrets, tipo **Secret**) y **no se guarda en el proyecto ni se comparte**. Si se pierde, se genera otra y cada persona vuelve a tocar "Activar". Sin el secreto el sistema funciona como antes (avisos solo con la página abierta).
- **Envío:** después de cada pedido POST que crea avisos (derivar, comentar, devolver, resolver, revisar alertas, escenas de la demo, "Avisar a Soporte") el Worker busca los avisos nuevos de personas con dispositivos y manda **un push por dispositivo** con hasta 3 avisos (y "Y N avisos más"). El texto va **cifrado** (RFC 8291, aes128gcm: solo lo lee el dispositivo, no Google ni Apple) y firmado (VAPID, JWT ES256). Todo con `crypto.subtle`, sin librerías. Tope: 25 dispositivos por pedido (el plan gratuito permite 50 subpedidos). Costo: 2 consultas más por POST, solo si hay secreto.
- **Limpieza:** si el servicio responde 404/410 (dispositivo que ya no existe) se borra la suscripción. Al cerrar sesión o tocar "Desactivar" también (`POST /api/push/desuscribir`, que no pide sesión: la dirección del dispositivo solo la conoce ese navegador).
- **Se rehace sola:** si el navegador ya tiene el permiso pero perdió la suscripción (cerrar sesión y volver a entrar, datos borrados, clave del servidor cambiada), al abrir Helios se vuelve a suscribir sin tocar nada, salvo que la persona haya tocado "Desactivar". Una vez por día la página le recuerda al servidor el dispositivo.
- **Seguridad:** solo se aceptan direcciones de servicios de push conocidos (Google, Apple, Mozilla, Microsoft), así el Worker no le manda pedidos a cualquier dirección. Solo Soporte y Analista se pueden suscribir.
- **API nueva:** `GET /api/push/clave` (clave pública; `null` sin secreto o sin campanita), `POST /api/push/suscribir` (body `{suscripcion, anterior?}`), `POST /api/push/desuscribir` (body `{endpoint}`, pública).
- **Pruebas:** `07_Codigo_fuente/pruebas/pushtest.mjs` simula dispositivos, descifra cada push como lo haría el navegador y verifica la firma; la demo de 19 escenas da las mismas alertas que antes y pasan las 9 pruebas. Probado de punta a punta en una PC con Chrome.
- **Código fuente:** parche `07_Codigo_fuente/worker/patch26.py`, con `push_server.js`, `sw.js` e `iconos.py` (arma los íconos con Pillow a partir de `iconos/logo_helios_system.png`).

---

## 5. Estado y cómo publicarlo

**Ya está aplicado en Cloudflare (12/11):** tabla creada, secreto cargado y Worker publicado. Se probó en una PC con Chrome (el aviso llega con la ventana cerrada, con Chrome en segundo plano). El `worker_alertas_cron.js` que acompaña a este archivo es la última versión: suma que la campanita muestre "Revisando…" en vez de "Activar" mientras comprueba si el equipo ya está suscripto.

Para armarlo desde cero (otro ambiente), en este orden:

1. Correr en la consola de D1 los 2 bloques de `10_avisos_push_d1.txt` (2 escrituras; se pueden repetir).
2. Cargar el secreto `VAPID_JWK` en el Worker.
3. Publicar `worker_alertas_cron.js` (Edit code → pegar todo → Deploy).

---

## 6. Mail, SMS o app propia (lo que estás investigando)

El push ya cubre el celular y la PC sin costo. Si además se quiere mail, SMS o WhatsApp, el servicio elegido tiene que tener una **API HTTP simple** (un `POST` con un token), porque el Worker solo puede hacer `fetch`. Se engancharía en el mismo punto que el push: después de cada pedido que crea avisos, con los mismos textos. Haría falta guardar el mail o el teléfono de cada persona (hoy `usuarios` no los tiene) y una preferencia por persona de qué canales quiere.
