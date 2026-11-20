// Arma el documento para IT: qué hay que hacer para registrar el bot de Helios en Microsoft Teams (Word, estilo Helios).
// Uso: node pasos_it_bot_teams_build.js <carpeta de salida>      (hace falta `npm install docx --no-save` en esta carpeta)
const path = require('path');
const H = require('./helios_docx.js');
const w = H.ANCHO;
const h = [];
const cols = (...fr) => { const t = fr.reduce((a, b) => a + b, 0); const a = fr.map((f) => Math.floor((w * f) / t)); a[a.length - 1] += w - a.reduce((x, y) => x + y, 0); return a; };
const URL_BOT = 'https://worker-alertas-cron.developers-hs-842.workers.dev/api/teams/bot';

h.push(...H.cabecera('Bot de Helios en Microsoft Teams', 'Qué tiene que hacer IT, paso a paso', 'Pedido a IT'));

h.push(H.titulo(1, '1. De qué se trata'));
h.push(H.P('Helios tiene un asistente de inteligencia artificial que ayuda a trabajar los incidentes. Queremos que se pueda **consultar desde un chat de Teams**: cuando se arma una sala de crisis, las personas que participan le preguntan por los detalles del incidente, qué revisar primero o si hubo casos parecidos antes. Para eso el asistente tiene que existir en Teams como **bot**, y el bot se registra en Microsoft con el área de IT.'));
h.push(...H.nota('idea', 'Lo que pedimos', 'tres datos del registro (**App ID**, **ID del tenant** y un **secreto**) y **publicar la aplicación en Teams** para quienes la van a usar. Todo el trabajo del lado de Helios lo hacemos nosotros.'));
h.push(H.titulo(2, 'Lo que no hace falta'));
h.push(H.vineta('**Nada dentro de la red de la empresa:** ni VPN, ni abrir puertos, ni instalar servidores. El bot vive en Cloudflare; Microsoft le manda los mensajes por internet.'));
h.push(H.vineta('**Permisos de Microsoft Graph:** la primera versión no los usa, así que no hay un consentimiento de administrador aparte del de publicar la aplicación.'));
h.push(H.vineta('**Un usuario de servicio:** el bot es una aplicación, no una persona con licencia.'));

h.push(H.titulo(1, '2. Qué necesitamos que nos entreguen'));
h.push(...H.tabla(['Dato', 'Dónde se obtiene', 'Cómo se entrega'], cols(2, 5, 4), [
  ['**App ID** (Microsoft App ID)', 'Recurso del bot en Azure > Configuration', 'Se puede enviar por correo'],
  ['**ID del tenant**', 'Recurso del bot en Azure > Configuration (o Microsoft Entra)', 'Se puede enviar por correo'],
  ['**Secreto de cliente**', 'Recurso del bot > Configuration > Manage > Certificates + secrets', '**No** por chat ni por correo. Lo carga IT directamente en Cloudflare, o lo pasan por el gestor de secretos que usen'],
  ['**Fecha de vencimiento del secreto**', 'La que elijan al crearlo', 'Por correo. Hay que renovarlo antes de que venza'],
], true));

h.push(H.titulo(1, '3. Paso a paso'));
h.push(H.titulo(2, 'Paso 1 · Crear el bot en Azure'));
h.push(H.vineta('En el **portal de Azure**: **Create a resource**, buscar «bot», elegir la tarjeta **Azure Bot** y tocar **Create**.'));
h.push(H.vineta('En **Microsoft App ID**, elegir el tipo **Single tenant** (de un solo tenant, solo para la empresa) y que se cree una identidad nueva. Microsoft informa que los bots multi-tenant nuevos ya no se pueden crear desde julio de 2025.'));
h.push(H.vineta('En la residencia de datos puede ir la global. Después **Review + create** y **Create**; al terminar, **Go to resource**.'));
h.push(H.vineta('Necesita una **suscripción de Azure**. Si no quieren usar una, ver la alternativa del punto 5.'));
h.push(H.titulo(2, 'Paso 2 · Indicar adónde llegan los mensajes'));
h.push(H.vineta('En el recurso del bot: **Configuration** > **Messaging endpoint**, y pegar:'));
h.push(...H.codigo([URL_BOT]));
h.push(H.titulo(2, 'Paso 3 · Habilitar el canal de Teams'));
h.push(H.vineta('En el recurso del bot: **Channels** > **Microsoft Teams**, aceptar las condiciones y guardar.'));
h.push(H.titulo(2, 'Paso 4 · Anotar App ID y tenant'));
h.push(H.vineta('En **Configuration** figuran el **Microsoft App ID** y el **App Tenant ID**. Pasarlos a Helios.'));
h.push(H.titulo(2, 'Paso 5 · Crear el secreto'));
h.push(H.vineta('En **Configuration**, junto a **Microsoft App ID**, tocar **Manage**. Se abre **Certificates + secrets**.'));
h.push(H.vineta('**New client secret**, elegir el vencimiento que indique su política y copiar el **valor** apenas se crea: después Azure lo oculta.'));
h.push(H.vineta('Cargarlo como secreto en Cloudflare (Worker `worker-alertas-cron` > Settings > Variables and Secrets) o pasarlo por el gestor de secretos. Avisarnos la fecha de vencimiento.'));
h.push(H.titulo(2, 'Paso 6 · Publicar la aplicación en Teams'));
h.push(H.vineta('Helios entrega un archivo **.zip** con la aplicación (el manifiesto con el App ID y los íconos). Lo armamos nosotros cuando tengamos el App ID.'));
h.push(H.vineta('En el **Teams admin center**: **Teams apps** > **Manage apps** > **Upload new app** > **Upload**, y elegir el .zip. Hace falta el rol de **Teams Administrator** (o uno superior).'));
h.push(H.vineta('Una aplicación subida por un administrador queda en el catálogo de la organización sin pasar por aprobación, y se ve para los usuarios **después de unas horas**.'));
h.push(H.vineta('Para elegir quién la usa: en **Manage apps**, entrar a la aplicación y permitirla para **todos** o para **usuarios y grupos** puntuales (grupos de seguridad, de Microsoft 365, dinámicos o listas de distribución; los invitados no pueden usarla). Para una prueba piloto alcanza con un grupo chico.'));
h.push(H.vineta('Ajuste general: en **Manage apps** > **Actions** > **Org-wide app settings** > **Custom apps**, el interruptor **Let users install and use available apps by default**.'));
h.push(H.titulo(2, 'Paso 7 · Los correos tienen que coincidir'));
h.push(H.vineta('El bot sabe quién le escribe por su **correo de Teams** y lo busca entre los usuarios de Helios (Administración > Usuarios). Tiene que ser **el mismo correo**; si no, el bot le contesta que no encontró su usuario.'));
h.push(H.titulo(2, 'Paso 8 · Prueba en conjunto'));
h.push(H.vineta('Con alguien de Helios: agregar el bot a un chat, escribirle una pregunta y confirmar que contesta; probar con una persona que no esté en Helios y confirmar que no recibe datos.'));

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

h.push(H.titulo(1, '5. Si prefieren no usar Azure'));
h.push(H.P('Teams también permite registrar el bot desde el **Developer Portal de Teams**, que no pide suscripción de Azure. Entrega los mismos tres datos (App ID, tenant y secreto) y el resto de los pasos es igual. IT elige la opción que corresponda a su política.'));

h.push(H.titulo(1, '6. Preguntas para saber si es viable'));
h.push(H.vineta('¿Se pueden crear bots en su tenant (con Azure Bot o con el Developer Portal)? ¿Quién puede hacerlo?'));
h.push(H.vineta('¿Quién publica aplicaciones en el Teams admin center? ¿Hay un circuito de aprobación o revisión de seguridad?'));
h.push(H.vineta('¿Se puede hacer un piloto con un grupo chico antes de abrirlo a más gente?'));
h.push(H.vineta('¿Cuál es su política de vencimiento de secretos? ¿Quién va a renovarlo?'));
h.push(H.vineta('¿Seguridad aprueba que datos de alertas (clientes, servicios, estado) se muestren dentro de Teams?'));
h.push(H.vineta('¿El correo de cada persona en Teams es el mismo que usa para trabajar en Helios?'));

h.push(...H.nota('regla', 'A confirmar con IT', 'estos puntos no los pudimos verificar en la documentación de Microsoft y dependen de las políticas de su tenant: (1) el paso exacto para habilitar el canal de Teams en el bot, (2) los pasos del Developer Portal como alternativa a Azure, (3) la vigencia máxima del secreto de cliente, (4) quién puede agregar la aplicación a un chat grupal. Los pasos pueden variar en su portal.'));
const salida = process.argv[2] || '.';
H.guardar(H.documento({ titulo: 'Bot de Helios en Microsoft Teams', pie: 'Pasos para IT: registro del bot de Helios en Microsoft Teams', hijos: h }), path.join(salida, 'Helios_pasos_para_IT_bot_de_Teams.docx')).then(() => console.log('ok'));
