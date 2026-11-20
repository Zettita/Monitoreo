// Arma el documento para IT: qué hay que hacer para registrar el bot de Helios en Microsoft Teams (Word, estilo Helios).
// Camino principal: Developer Portal de Teams (sin suscripción de Azure). Alternativa: Azure Bot.
// Uso: node pasos_it_bot_teams_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');
const w = H.ANCHO;
const h = [];
const cols = (...fr) => { const t = fr.reduce((a, b) => a + b, 0); const a = fr.map((f) => Math.floor((w * f) / t)); a[a.length - 1] += w - a.reduce((x, y) => x + y, 0); return a; };
const URL_BOT = 'https://worker-alertas-cron.developers-hs-842.workers.dev/api/teams/bot';

h.push(...H.cabecera('Bot de Helios en Microsoft Teams', 'Qué tiene que hacer IT, paso a paso, sin suscripción de Azure', 'Pedido a IT'));

h.push(H.titulo(1, '1. De qué se trata'));
h.push(H.P('Helios tiene un asistente de inteligencia artificial que ayuda a trabajar los incidentes. Queremos que se pueda **consultar desde un chat de Teams**: cuando se arma una sala de crisis, las personas que participan le preguntan por los detalles del incidente, qué revisar primero o si hubo casos parecidos antes. Para eso el asistente tiene que existir en Teams como **bot**, y el bot se registra en Microsoft con el área de IT.'));
h.push(H.P('Este documento usa el **Developer Portal de Teams**, que **no necesita una suscripción de Azure**. Al final está la alternativa con Azure Bot, por si IT prefiere esa.'));
h.push(...H.nota('idea', 'Lo que pedimos', 'tres datos del registro (**Bot ID**, **ID del tenant** y un **secreto**) y **publicar la aplicación en Teams** para quienes la van a usar. Todo el trabajo del lado de Helios lo hacemos nosotros.'));
h.push(H.titulo(2, 'Lo que no hace falta'));
h.push(H.vineta('**Una suscripción de Azure.**'));
h.push(H.vineta('**Nada dentro de la red de la empresa:** ni VPN, ni abrir puertos, ni instalar servidores. El bot vive en Cloudflare; Microsoft le manda los mensajes por internet.'));
h.push(H.vineta('**Permisos de Microsoft Graph:** la primera versión no los usa, así que no hay un consentimiento de administrador aparte del de publicar la aplicación.'));
h.push(H.vineta('**Un usuario de servicio:** el bot es una aplicación, no una persona con licencia.'));
h.push(H.titulo(2, 'Una limitación del Developer Portal'));
h.push(H.P('Según Microsoft, el Developer Portal **no está disponible en las nubes GCC High, DoD ni Teams operado por 21Vianet**. Si el tenant de la empresa es de esos tipos, hay que usar la alternativa con Azure Bot (punto 5).'));

h.push(H.titulo(1, '2. Qué necesitamos que nos entreguen'));
h.push(...H.tabla(['Dato', 'Dónde se obtiene', 'Cómo se entrega'], cols(2, 5, 4), [
  ['**Bot ID** (es el App ID del bot)', 'Developer Portal > Tools > Bot management > el bot', 'Se puede enviar por correo. Helios lo carga como `TEAMS_BOT_APP_ID`'],
  ['**ID del tenant**', 'Microsoft Entra admin center > Overview (Tenant ID)', 'Se puede enviar por correo. Helios lo carga como `TEAMS_BOT_TENANT`'],
  ['**Secreto de cliente**', 'Developer Portal > Bot management > el bot > Client secrets', '**No** por chat ni por correo. Lo carga IT directamente en Cloudflare como `TEAMS_BOT_SECRET`, o lo pasan por el gestor de secretos que usen'],
  ['**Fecha de vencimiento del secreto** (si el portal la muestra)', 'La que figure al crearlo', 'Por correo. Hay que renovarlo antes de que venza'],
], true));

h.push(H.titulo(1, '3. Paso a paso con el Developer Portal'));
h.push(H.titulo(2, 'Paso 1 · Abrir el Developer Portal'));
h.push(H.vineta('Entrar a **https://dev.teams.microsoft.com** (antes se llamaba App Studio) con una cuenta de la empresa, o abrir la aplicación **Developer Portal** dentro de Teams.'));
h.push(H.titulo(2, 'Paso 2 · Crear el bot'));
h.push(H.vineta('En el panel de la izquierda: **Tools** > **Bot management** > **+ New Bot**.'));
h.push(H.vineta('Escribir el nombre **Gemma** y tocar **Add**. Es el nombre con el que las personas lo van a mencionar en Teams (**@Gemma**), y tiene que ser el mismo que lleve la aplicación. Si prefieren otro nombre, avisennos antes de que armemos el paquete.'));
h.push(H.titulo(2, 'Paso 3 · Indicar adónde llegan los mensajes'));
h.push(H.vineta('Abrir el bot recién creado. En el campo de la **dirección del bot** (**Endpoint address**), pegar la siguiente y guardar:'));
h.push(...H.codigo([URL_BOT]));
h.push(H.titulo(2, 'Paso 4 · Crear el secreto'));
h.push(H.vineta('En el mismo bot, en **Client secrets**, tocar **Add a client secret for your bot** (o equivalente).'));
h.push(H.vineta('**Copiar el valor apenas se crea**: después el portal no lo vuelve a mostrar, y si se pierde hay que generar otro.'));
h.push(H.vineta('Cargarlo como secreto en Cloudflare (Worker `worker-alertas-cron` > Settings > Variables and Secrets) o pasarlo por el gestor de secretos. Avisarnos si figura una fecha de vencimiento.'));
h.push(H.titulo(2, 'Paso 5 · Anotar Bot ID y tenant'));
h.push(H.vineta('El **Bot ID** figura en la página del bot. El **ID del tenant** está en el Microsoft Entra admin center, en **Overview**. Pasárnoslos.'));
h.push(H.titulo(2, 'Paso 6 · Publicar la aplicación en Teams'));
h.push(H.vineta('Helios entrega un archivo **.zip** con la aplicación (el manifiesto con el Bot ID y los íconos). Lo armamos nosotros cuando tengamos el Bot ID.'));
h.push(H.vineta('**Opción A, desde el Developer Portal:** **Apps** > **Import app**, elegir el .zip > **Import**; después **Publish** > **Publish to org**. Microsoft indica que publicar a la organización **requiere la aprobación del administrador de Teams**: queda pendiente hasta que la apruebe en el Teams admin center.'));
h.push(H.vineta('**Opción B, directo en el Teams admin center:** **Teams apps** > **Manage apps** > **Upload new app** > **Upload**, y elegir el .zip. Hace falta el rol de **Teams Administrator** (o superior). Una aplicación subida por un administrador queda en el catálogo de la organización sin aprobación aparte.'));
h.push(H.vineta('La aplicación se ve para los usuarios **después de unas horas**. Para elegir quién la usa: en **Manage apps**, entrar a la aplicación y permitirla para **todos** o para **usuarios y grupos** puntuales (grupos de seguridad, de Microsoft 365, dinámicos o listas de distribución; los invitados no pueden usarla). Para el piloto alcanza con un grupo chico.'));
h.push(H.vineta('Ajuste general: **Manage apps** > **Actions** > **Org-wide app settings** > **Custom apps**, el interruptor **Let users install and use available apps by default**.'));
h.push(H.titulo(2, 'Paso 7 · Los correos tienen que coincidir'));
h.push(H.vineta('El bot sabe quién le escribe por su **correo de Teams** y lo busca entre los usuarios de Helios (Administración > Usuarios). Tiene que ser **el mismo correo**; si no, el bot le contesta que no encontró su usuario.'));
h.push(H.titulo(2, 'Paso 8 · Prueba en conjunto'));
h.push(H.vineta('Con alguien de Helios: agregar el bot a un chat, escribirle una pregunta mencionándolo (**@Gemma** elegido de la lista que aparece al escribir, para que quede como mención) y confirmar que contesta; probar con una persona que no esté en Helios y confirmar que no recibe datos.'));

h.push(H.titulo(1, '4. Seguridad y datos (para que IT lo evalúe)'));
h.push(...H.tabla(['Tema', 'Cómo funciona'], cols(2, 8), [
  ['**Quién puede escribirle al bot**', 'Solo quienes tengan la aplicación disponible en Teams. Además, el bot responde solo a personas con usuario activo en Helios.'],
  ['**Qué ve cada persona**', 'Lo mismo que ve en Helios según su perfil (Analista, Soporte, Gerente…). Un Gerente recibe lectura, sin acciones. Quien no tenga usuario no recibe datos.'],
  ['**Qué puede hacer el bot**', 'Solo leer y proponer. **No ejecuta nada**: las acciones se hacen desde Helios, con sus permisos y su auditoría.'],
  ['**Cómo se valida que el mensaje viene de Microsoft**', 'Helios verifica la firma de cada mensaje que le llega (el token del servicio de bots de Microsoft) y descarta cualquier otro. El secreto solo está en Cloudflare.'],
  ['**Qué datos viajan**', 'Las preguntas y respuestas del chat: alertas, clientes, servicios, estado y tareas de la sala. Quedan en el Microsoft 365 de la empresa. En la demo todos los datos son ficticios.'],
  ['**Límites de uso**', 'Los mismos del asistente de Helios: preguntas por persona y por hora, y un tope diario total. Cada consulta queda en la auditoría de Helios.'],
  ['**Conexiones de red**', 'Entrante: Microsoft le envía los mensajes al punto de Cloudflare indicado arriba. Saliente: Helios llama a los servicios públicos de Microsoft para responder. No toca la red interna.'],
], true));

h.push(H.titulo(1, '5. Alternativa: Azure Bot (si hay suscripción de Azure)'));
h.push(H.P('Si el tenant no puede usar el Developer Portal, o IT prefiere tener el bot como recurso propio en Azure, el registro cambia así; el resto (publicar la aplicación, correos, prueba) es igual.'));
h.push(H.vineta('En el **portal de Azure**: **Create a resource** > **Azure Bot** > **Create**. En **Microsoft App ID** elegir **Single tenant** con una identidad nueva (Microsoft informa que los bots multi-tenant nuevos ya no se pueden crear desde julio de 2025).'));
h.push(H.vineta('En el recurso: **Configuration** > **Messaging endpoint**, pegar la misma dirección de arriba, y habilitar el canal en **Channels** > **Microsoft Teams**.'));
h.push(H.vineta('El **Microsoft App ID** y el **App Tenant ID** están en **Configuration**. El secreto se crea en **Configuration** > **Manage** > **Certificates + secrets** > **New client secret**; el valor se ve una sola vez.'));

h.push(H.titulo(1, '6. Preguntas para saber si es viable'));
h.push(H.vineta('¿Se pueden crear bots en el Developer Portal en su tenant? ¿Quién puede hacerlo? ¿El tenant es uno de los tipos donde el portal no está disponible (GCC High, DoD, 21Vianet)?'));
h.push(H.vineta('¿Quién publica aplicaciones en el Teams admin center? ¿Hay un circuito de aprobación o revisión de seguridad?'));
h.push(H.vineta('¿Se puede hacer un piloto con un grupo chico antes de abrirlo a más gente?'));
h.push(H.vineta('¿Cuál es su política de vencimiento de secretos? ¿Quién va a renovarlo?'));
h.push(H.vineta('¿Seguridad aprueba que datos de alertas (clientes, servicios, estado) se muestren dentro de Teams?'));
h.push(H.vineta('¿El correo de cada persona en Teams es el mismo que usa para trabajar en Helios?'));

h.push(...H.nota('regla', 'A confirmar con IT', 'los pasos 2 a 4 del Developer Portal están confirmados en la documentación de Microsoft solo hasta crear el bot con su nombre. No pudimos verificar en ella: (1) el nombre exacto de los campos y botones del bot (dirección del bot y secreto), (2) si el bot queda de un solo tenant o multi-tenant (Helios funciona con cualquiera de los dos), (3) la vigencia del secreto, (4) quién puede agregar la aplicación a un chat grupal. Las pantallas pueden variar: si algo no coincide, mandarnos una captura.'));
const salida = process.argv[2] || '.';
H.guardar(H.documento({ titulo: 'Bot de Helios en Microsoft Teams', pie: 'Pasos para IT: registro del bot de Helios en Microsoft Teams', hijos: h }), path.join(salida, 'Helios_pasos_para_IT_bot_de_Teams.docx')).then(() => console.log('ok'));
