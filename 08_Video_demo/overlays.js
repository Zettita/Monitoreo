// Capas que se inyectan en cada página al grabar la demo: cursor visible, subtítulos, tarjetas de capítulo,
// teléfono simulado (Android / iPhone) para los avisos push y un Outlook simulado.
// Nada de esto es parte de Helios: solo existe en el video.
(function () {
  if (window.__demoCapas) return; window.__demoCapas = true;
  var css = document.createElement('style');
  css.textContent = [
    '[popover].__capa{inset:auto;margin:0;border:0;padding:0;overflow:visible;background:none;color:inherit;max-width:none;max-height:none}',
    '#__cur{position:fixed;z-index:2147483647;left:0;top:0;width:28px;height:28px;pointer-events:none;transform:translate(-100px,-100px);transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}',
    '#__cur .r{position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:3px solid #0F766E;opacity:0;transform:scale(.3)}',
    '#__cur.clic .r{animation:__rip .5s ease-out}',
    '@keyframes __rip{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(2.2)}}',
    '#__sub{position:fixed;z-index:2147483646;left:50%;padding:12px 22px;overflow:visible;bottom:26px;transform:translateX(-50%);max-width:1050px;width:max-content;padding:12px 22px;border-radius:8px;background:rgba(9,30,66,.88);color:#fff;font:500 25px/1.35 "Segoe UI",system-ui,sans-serif;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s;box-shadow:0 4px 18px rgba(0,0,0,.3)}',
    '#__sub.v{opacity:1}',
    '#__card{position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;z-index:2147483645;background:linear-gradient(135deg,#0b3b3a 0%,#0F766E 60%,#14a89a 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:"Segoe UI",system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .5s}',
    '#__card.v{opacity:1}',
    '#__card img{width:92px;height:92px;border-radius:20px;margin-bottom:26px;box-shadow:0 8px 30px rgba(0,0,0,.3)}',
    '#__card h1{margin:0 0 14px;font-size:58px;font-weight:700;letter-spacing:-.5px}',
    '#__card p{margin:0;font-size:28px;font-weight:400;opacity:.92;max-width:1100px;line-height:1.4}',
    '#__card ul{list-style:none;padding:0;margin:26px 0 0;text-align:left;font-size:26px;line-height:1.7}',
    '#__card li:before{content:"\\2713";margin-right:14px;color:#9ff3e6;font-weight:700}',
    // teléfono
    '.__tel-on #asis-boton{visibility:hidden}',
    '#__tel{position:fixed;z-index:2147483644;right:46px;top:50%;width:330px;height:690px;transform:translate(420px,-50%);transition:transform .6s cubic-bezier(.2,.8,.2,1);pointer-events:none;font-family:"Segoe UI",Roboto,system-ui,sans-serif}',
    '#__tel.v{transform:translate(0,-50%)}',
    '#__tel .marco{position:absolute;inset:0;border-radius:44px;background:#111;box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 0 0 3px #333;padding:12px}',
    '#__tel .pant{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:linear-gradient(160deg,#1f3a5f,#2b2d6e 55%,#4a2c6e);color:#fff}',
    '#__tel.ios .pant{background:linear-gradient(170deg,#0d2b45,#1f6f7a 60%,#3a9d8f)}',
    '#__tel .isla{position:absolute;left:50%;top:10px;width:96px;height:26px;margin-left:-48px;background:#000;border-radius:14px;z-index:3}',
    '#__tel .barra{position:absolute;left:0;right:0;top:12px;padding:0 24px;display:flex;justify-content:space-between;font-size:13px;font-weight:600;z-index:2}',
    '#__tel .reloj{position:absolute;left:0;right:0;top:76px;text-align:center}',
    '#__tel .reloj b{display:block;font-size:76px;font-weight:300;letter-spacing:-2px;line-height:1}',
    '#__tel .reloj span{display:block;margin-top:8px;font-size:15px;opacity:.85}',
    '#__tel .notis{position:absolute;left:12px;right:12px;top:230px;display:flex;flex-direction:column;gap:10px}',
    '#__tel .noti{background:rgba(255,255,255,.93);color:#111;border-radius:18px;padding:12px 14px;box-shadow:0 6px 18px rgba(0,0,0,.25);transform:translateY(-30px) scale(.96);opacity:0;transition:all .5s cubic-bezier(.2,.8,.2,1)}',
    '#__tel .noti.v{transform:none;opacity:1}',
    '#__tel.ios .noti{background:rgba(245,245,247,.82);backdrop-filter:blur(14px);border-radius:22px}',
    '#__tel .noti .cab{display:flex;align-items:center;gap:8px;font-size:12px;color:#555;margin-bottom:5px}',
    '#__tel .noti .cab img{width:20px;height:20px;border-radius:5px}',
    '#__tel .noti .cab span.h{margin-left:auto}',
    '#__tel .noti .ti{font-size:15px;font-weight:700;margin-bottom:2px;line-height:1.25}',
    '#__tel .noti .cu{font-size:14px;line-height:1.35;color:#222}',
    '#__tel .noti .acc{display:flex;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(0,0,0,.1)}',
    '#__tel .noti .acc button{flex:1;border:0;background:rgba(15,118,110,.12);color:#0b5f58;font:700 14px "Segoe UI",system-ui,sans-serif;border-radius:10px;padding:9px 6px;pointer-events:auto;cursor:pointer}',
    '#__tel .noti .acc button.ok{background:#0F766E;color:#fff}',
    '#__tel .pie{position:absolute;bottom:10px;left:50%;width:120px;margin-left:-60px;height:5px;border-radius:3px;background:rgba(255,255,255,.7)}',
    '#__tel .rotulo{position:absolute;left:0;right:0;bottom:-34px;text-align:center;color:#fff;font:600 17px "Segoe UI",sans-serif;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
    // outlook simulado
    '#__out{position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;z-index:2147483643;background:#f3f2f1;font-family:"Segoe UI",system-ui,sans-serif;display:none;flex-direction:column}',
    '#__out.v{display:flex}',
    '#__out .top{height:48px;background:#0f6cbd;color:#fff;display:flex;align-items:center;padding:0 18px;font-size:17px;font-weight:600;gap:14px}',
    '#__out .top i{font-style:normal;background:#fff;color:#0f6cbd;border-radius:4px;padding:1px 7px;font-weight:700}',
    '#__out .top em{margin-left:auto;font-style:normal;font-size:13px;opacity:.85;font-weight:400}',
    '#__out .cuerpo{flex:1;padding:22px 90px;display:flex;flex-direction:column;gap:0;overflow:hidden}',
    '#__out .hoja{background:#fff;border:1px solid #e1dfdd;border-radius:6px;display:flex;flex-direction:column;flex:1;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden}',
    '#__out .fila{display:flex;align-items:center;border-bottom:1px solid #edebe9;padding:9px 16px;font-size:16px;gap:14px}',
    '#__out .fila b{width:70px;color:#605e5c;font-weight:400}',
    '#__out .txt{flex:1;padding:16px;font-size:16px;line-height:1.5;white-space:pre-wrap;overflow:hidden;color:#201f1e}',
    '#__out .enviar{align-self:flex-start;margin:14px 0 0;background:#0f6cbd;color:#fff;border:0;border-radius:4px;padding:10px 28px;font:600 16px "Segoe UI",sans-serif;cursor:pointer}',
    '#__out .nota{position:absolute;right:24px;top:58px;background:#fff8e1;color:#7a5b00;border:1px solid #ffe08a;border-radius:6px;padding:6px 12px;font-size:13px}',
    '#__out .ok{position:absolute;inset:48px 0 0 0;background:rgba(255,255,255,.94);display:none;align-items:center;justify-content:center;font-size:34px;color:#107c10;font-weight:600}',
    '#__out .ok.v{display:flex}',
  ].join('\n');
  function montar() {
    if (!document.documentElement) return setTimeout(montar, 20);
    document.documentElement.appendChild(css);
    var c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<div class="r"></div><svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.5 20z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    var s = document.createElement('div'); s.id = '__sub';
    var k = document.createElement('div'); k.id = '__card';
    var t = document.createElement('div'); t.id = '__tel';
    var o = document.createElement('div'); o.id = '__out';
    var m = document.createElement('div'); m.id = '__tms';
    var tcss = document.createElement('style'); tcss.id = '__tms-css'; tcss.textContent = window.__tmsCss || ''; document.documentElement.appendChild(tcss);
    var capas = [o, m, t, k, s, c];   // de abajo hacia arriba
    capas.forEach(function (e) { e.classList.add('__capa'); e.setAttribute('popover', 'manual'); document.documentElement.appendChild(e); });
    function promover() { capas.forEach(function (e) { try { e.hidePopover(); } catch (x) {} try { e.showPopover(); } catch (x) {} }); }
    window.__promover = promover; promover();
    new MutationObserver(function (m) { for (var i = 0; i < m.length; i++) if (m[i].target.tagName === 'DIALOG' && m[i].target.open) { promover(); return; } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['open'], subtree: true });
    var pos = null; try { pos = JSON.parse(sessionStorage.__pos || 'null'); } catch (x) {}
    if (pos) c.style.transform = 'translate(' + pos[0] + 'px,' + pos[1] + 'px)';
    document.addEventListener('mousemove', function (e) { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; try { sessionStorage.__pos = JSON.stringify([e.clientX, e.clientY]); } catch (x) {} }, true);
    document.addEventListener('mousedown', function () { c.classList.remove('clic'); void c.offsetWidth; c.classList.add('clic'); }, true);
    var sub = null; try { sub = sessionStorage.__sub; } catch (x) {}
    if (sub) { s.textContent = sub; s.classList.add('v'); }
  }
  montar();
  window.__sub = function (txt) {
    var s = document.getElementById('__sub'); if (!s) return;
    try { sessionStorage.__sub = txt || ''; } catch (x) {}
    if (txt) { s.textContent = txt; s.classList.add('v'); } else s.classList.remove('v');
  };
  window.__card = function (o) {
    var k = document.getElementById('__card'); if (!k) return;
    if (!o) { k.classList.remove('v'); return; }
    k.innerHTML = '<img src="/icono-192.png" alt="">' + '<h1>' + o.titulo + '</h1>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + (o.items ? '<ul>' + o.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>' : '');
    k.classList.add('v');
  };
  // Teléfono: __tel({so:'android'|'ios', rotulo, hora, fecha}); __noti({titulo, cuerpo, hora, acciones:[{id,texto,principal}]})
  window.__tel = function (o) {
    var t = document.getElementById('__tel'); if (!t) return;
    if (!o) { t.classList.remove('v'); document.documentElement.classList.remove('__tel-on'); return; }
    document.documentElement.classList.add('__tel-on');
    t.classList.remove('ios', 'v'); if (o.so === 'ios') t.classList.add('ios');
    t.innerHTML = '<div class="marco"><div class="pant"><div class="isla"></div><div class="barra"><span>' + (o.so === 'ios' ? '' : 'Movistar') + '</span><span>' + (o.so === 'ios' ? '5G ▮▮▮ 87%' : '▮▮▮ 87%') + '</span></div>' +
      '<div class="reloj"><b>' + o.hora + '</b><span>' + o.fecha + '</span></div><div class="notis" id="__notis"></div><div class="pie"></div></div></div>' +
      '<div class="rotulo">' + o.rotulo + '</div>';
    void t.offsetWidth; t.classList.add('v');
  };
  window.__noti = function (n) {
    var box = document.getElementById('__notis'); if (!box) return;
    var d = document.createElement('div'); d.className = 'noti'; if (n.id) d.id = n.id;
    d.innerHTML = '<div class="cab"><img src="/icono-192.png" alt=""><span>Helios</span><span class="h">' + n.hora + '</span></div><div class="ti">' + n.titulo + '</div><div class="cu">' + n.cuerpo + '</div>' +
      (n.acciones ? '<div class="acc">' + n.acciones.map(function (a) { return '<button id="' + a.id + '" class="' + (a.principal ? 'ok' : '') + '">' + a.texto + '</button>'; }).join('') + '</div>' : '');
    box.insertBefore(d, box.firstChild); void d.offsetWidth; d.classList.add('v');
  };
  // Outlook simulado: __outlook({para, cc, asunto, texto}); lo abre el botón "Abrir en Outlook web" de Helios (window.open)
  window.__outlook = function (o) {
    var x = document.getElementById('__out'); if (!x) return;
    if (!o) { x.classList.remove('v'); return; }
    x.innerHTML = '<div class="top"><i>O</i> Outlook <em>Simulación para el video: Helios no envía correos, abre el borrador en Outlook</em></div>' +
      '<div class="cuerpo"><div class="hoja"><div class="fila"><b>Para</b><span id="__o-para"></span></div><div class="fila"><b>Cc</b><span id="__o-cc"></span></div><div class="fila"><b>Asunto</b><span id="__o-asu" style="font-weight:600"></span></div><div class="txt" id="__o-txt"></div></div>' +
      '<button class="enviar" id="__o-enviar">Enviar</button></div><div class="ok" id="__o-ok">✔ Mensaje enviado</div>';
    document.getElementById('__o-para').textContent = (o.para || '').split(/[;,]/).join('; ');
    document.getElementById('__o-cc').textContent = (o.cc || '').split(/[;,]/).join('; ');
    document.getElementById('__o-asu').textContent = o.asunto || '';
    document.getElementById('__o-txt').textContent = o.texto || '';
    document.getElementById('__o-enviar').addEventListener('click', function () { document.getElementById('__o-ok').classList.add('v'); });
    x.classList.add('v');
  };
  // El botón de Helios abre Outlook en otra pestaña: en el video se muestra el Outlook simulado encima de la página
  window.open = function (url) {
    try {
      var u = new URL(url, location.href);
      if (/outlook|mailto/.test(u.href)) {
        var q = u.protocol === 'mailto:' ? new URLSearchParams(u.search) : u.searchParams;
        window.__outlook({ para: u.protocol === 'mailto:' ? decodeURIComponent(u.pathname) : (q.get('to') || ''), cc: q.get('cc') || '', asunto: q.get('subject') || '', texto: q.get('body') || '' });
      }
    } catch (x) {}
    return null;
  };

  // ---------- Microsoft Teams simulado ----------
  // __teams({titulo, miembros:[iniciales...], yo, vista:'chat'|'canal'}), __tmsCompose(texto), __tmsEnviar(), __tmsBot(true|false),
  // __tmsMsg({quien, bot, hora, md}), __tmsTarjeta({titulo, filas:[[k,v]], boton}), __tmsVista('chat'|'canal'). Solo existe en el video.
  window.__tmsCss = String.raw`
#__tms{position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;z-index:2147483643;background:#f5f5f5;font-family:"Segoe UI",system-ui,sans-serif;color:#242424;display:none;flex-direction:column}
#__tms.v{display:flex}
#__tms .top{height:48px;background:#ebebeb;border-bottom:1px solid #e0e0e0;display:flex;align-items:center;padding:0 16px;gap:14px;font-size:15px}
#__tms .top .bus{margin:0 auto;width:520px;height:32px;border-radius:6px;background:#fff;border:1px solid #d1d1d1;display:flex;align-items:center;padding:0 12px;color:#707070;font-size:14px}
#__tms .top .nota{background:#fff8e1;color:#7a5b00;border:1px solid #ffe08a;border-radius:6px;padding:5px 12px;font-size:13px}
#__tms .top .tlogo{font-weight:700;color:#464EB8;letter-spacing:-.3px;white-space:nowrap}
#__tms .cuerpo{flex:1;display:flex;min-height:0}
#__tms .riel{width:68px;background:#ebebeb;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;align-items:center;padding-top:10px;gap:6px}
#__tms .riel div{width:56px;padding:8px 0 6px;text-align:center;font-size:11px;color:#424242;border-radius:6px}
#__tms .riel div i{display:block;font-style:normal;font-size:20px;margin-bottom:2px}
#__tms .riel div.on{color:#464EB8;font-weight:600;background:#fff}
#__tms .lista{width:330px;background:#fafafa;border-right:1px solid #e0e0e0;display:flex;flex-direction:column}
#__tms .lista h3{margin:0;padding:14px 16px;font-size:20px;font-weight:700}
#__tms .lista .it{display:flex;gap:10px;padding:10px 16px;font-size:14px;align-items:center}
#__tms .lista .it.on{background:#e8ebfa;border-left:3px solid #464EB8;padding-left:13px}
#__tms .lista .it b{display:block;font-weight:600}
#__tms .lista .it small{color:#616161;font-size:12px}
#__tms .av{width:36px;height:36px;border-radius:50%;background:#7b83eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex:none}
#__tms .av.bot{background:#0F766E;overflow:hidden;padding:0}
#__tms .av.bot img{width:100%;height:100%;object-fit:cover}
#__tms .av.p2{background:#c239b3}#__tms .av.p3{background:#038387}#__tms .av.p4{background:#ca5010}
#__tms .panel{flex:1;display:flex;flex-direction:column;background:#fff;min-width:0}
#__tms .cab{display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #e0e0e0}
#__tms .cab h2{margin:0;font-size:17px;font-weight:700}
#__tms .cab .mi{margin-left:auto;display:flex}
#__tms .cab .mi .av{width:28px;height:28px;font-size:11px;margin-left:-6px;border:2px solid #fff}
#__tms .msgs{flex:1;overflow:hidden;padding:18px 28px 6px;display:flex;flex-direction:column;gap:14px;justify-content:flex-end}
#__tms .msg{display:flex;gap:12px;max-width:980px}
#__tms .msg .bur{background:#f5f5f5;border-radius:6px;padding:9px 14px;font-size:15px;line-height:1.5}
#__tms .msg.yo .bur{background:#e8ebfa}
#__tms .msg .qn{font-size:12.5px;color:#424242;margin-bottom:3px}
#__tms .msg .qn b{font-weight:600}
#__tms .msg .qn em{font-style:normal;color:#707070;margin-left:8px}
#__tms .msg .bur p{margin:0 0 8px}#__tms .msg .bur p:last-child{margin:0}
#__tms .msg .bur ul{margin:2px 0 8px;padding-left:22px}
#__tms .msg .bur li{margin:2px 0}
#__tms .msg .bur a{color:#464EB8;text-decoration:underline}
#__tms .men{background:#dfe2fb;color:#3c44a7;border-radius:4px;padding:0 4px;font-weight:600}
#__tms .msg .ap{display:inline-block;margin-left:8px;font-size:11px;font-weight:700;color:#0F766E;border:1px solid #0F766E;border-radius:3px;padding:0 4px;vertical-align:1px}
#__tms .escr{font-size:13px;color:#616161;padding:0 28px 6px;height:22px;display:flex;align-items:center;gap:8px}
#__tms .escr i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#616161;animation:__pt 1s infinite}
#__tms .escr i:nth-child(2){animation-delay:.2s}#__tms .escr i:nth-child(3){animation-delay:.4s}
@keyframes __pt{0%,60%,100%{opacity:.25}30%{opacity:1}}
#__tms .comp{margin:0 28px 18px;border:1px solid #d1d1d1;border-radius:6px;padding:12px 14px;min-height:46px;font-size:15px;background:#fff}
#__tms .comp.vacio{color:#8a8a8a}
#__tms .tar{border:1px solid #e0e0e0;border-left:4px solid #C4314B;border-radius:6px;background:#fff;padding:12px 16px;max-width:620px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
#__tms .tar h4{margin:0 0 8px;font-size:15px;font-weight:700}
#__tms .tar .fi{display:flex;gap:12px;font-size:14px;margin:3px 0}#__tms .tar .fi b{width:110px;color:#616161;font-weight:400}
#__tms .tar .bt{display:inline-block;margin-top:10px;background:#464EB8;color:#fff;border-radius:4px;padding:6px 14px;font-size:14px;font-weight:600}
#__tms .rot{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:12px;color:#8a8a8a}
`;
  (function () { var e = document.getElementById('__tms-css'); if (e) e.textContent = window.__tmsCss; })();   // la capa se monta antes de que este bloque defina el CSS
  window.__tms = function () { return document.getElementById('__tms'); };
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function md(t) {
    var b = String(t || '').split(/\n{2,}/).map(function (par) {
      var ls = par.split('\n'), out = '', lista = [];
      function cierra() { if (lista.length) { out += '<ul>' + lista.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; lista = []; } }
      function en(x) { return esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\s][^_]*?)_(?=$|[\s.,;:])/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a>$1</a>').replace(/(https?:\/\/[^\s<]+)/g, '<a>$1</a>'); }
      ls.forEach(function (l) { if (/^- /.test(l)) lista.push(en(l.slice(2))); else { cierra(); if (l.trim()) out += '<p>' + en(l) + '</p>'; } });
      cierra(); return out;
    }).join('');
    return b;
  }
  function ini(n) { return String(n || '?').split(' ').map(function (x) { return x.charAt(0); }).slice(0, 2).join('').toUpperCase(); }
  var PERS = ['', 'p2', 'p3', 'p4'];
  function avatar(quien, bot) {
    if (bot) return '<div class="av bot"><img src="/icono-192.png" alt=""></div>';
    var k = 0; for (var i = 0; i < quien.length; i++) k += quien.charCodeAt(i);
    return '<div class="av ' + PERS[k % 4] + '">' + esc(ini(quien)) + '</div>';
  }
  window.__teams = function (o) {
    var x = document.getElementById('__tms'); if (!x) return;
    if (!o) { x.classList.remove('v'); return; }
    window.__tmsYo = o.yo || 'Laura Benítez';
    x.innerHTML = '<div class="top"><span class="tlogo">Microsoft Teams</span><div class="bus">Buscar</div><span class="nota">Simulación para el video: Gemma responde con los datos reales de Helios</span></div>' +
      '<div class="cuerpo"><div class="riel"><div><i>🔔</i>Actividad</div><div class="on"><i>💬</i>Chat</div><div><i>👥</i>Equipos</div><div><i>📅</i>Calendario</div><div><i>⋯</i>Más</div></div>' +
      '<div class="lista"><h3>Chat</h3><div class="it on" id="__tms-it1">' + avatar('IM', false) + '<div><b id="__tms-it1t"></b><small>Gemma: …</small></div></div>' +
      '<div class="it" id="__tms-it2"><div class="av p3">PM</div><div><b>Plataforma Monitoreo</b><small>Canal · General</small></div></div>' +
      '<div class="it"><div class="av p2">MR</div><div><b>Matías Ramos</b><small>Ok, ya lo miro</small></div></div></div>' +
      '<div class="panel"><div class="cab"><h2 id="__tms-t"></h2><div class="mi" id="__tms-mi"></div></div>' +
      '<div class="msgs" id="__tms-msgs"></div><div class="escr" id="__tms-escr"></div><div class="comp vacio" id="__tms-comp">Escribí un mensaje nuevo</div></div></div>';
    window.__tmsDatos = o; window.__tmsVista(o.vista || 'chat');
    x.classList.add('v');
  };
  window.__tmsVista = function (v) {
    var o = window.__tmsDatos || {}; var chat = v !== 'canal';
    document.getElementById('__tms-it1').classList.toggle('on', chat); document.getElementById('__tms-it2').classList.toggle('on', !chat);
    document.getElementById('__tms-it1t').textContent = o.titulo || 'IM-4 · Sala de crisis';
    document.getElementById('__tms-t').textContent = chat ? (o.titulo || 'IM-4 · Sala de crisis') : 'Plataforma Monitoreo › General';
    document.getElementById('__tms-mi').innerHTML = chat ? (o.miembros || []).map(function (m) { return m === 'Gemma' ? avatar('', true) : avatar(m, false); }).join('') : '';
    document.getElementById('__tms-msgs').innerHTML = ''; window.__tmsCompose('');
  };
  window.__tmsCompose = function (t) {
    var c = document.getElementById('__tms-comp'); if (!c) return;
    if (!t) { c.className = 'comp vacio'; c.textContent = 'Escribí un mensaje nuevo'; return; }
    c.className = 'comp'; c.innerHTML = esc(t).replace(/@(\w+)/g, '<span class="men">@$1</span>');
  };
  window.__tmsMsg = function (m) {
    var box = document.getElementById('__tms-msgs'); if (!box) return;
    var d = document.createElement('div'); d.className = 'msg' + (m.quien === window.__tmsYo ? ' yo' : '');
    d.innerHTML = avatar(m.quien, m.bot) + '<div><div class="qn"><b>' + esc(m.quien) + '</b><em>' + esc(m.hora || '') + '</em></div><div class="bur">' +
      (m.md ? md(m.md) : '') + '</div></div>';
    if (m.mencion) d.querySelector('.bur').innerHTML = md(m.md).replace(/@(\w+)/g, '<span class="men">@$1</span>');
    box.appendChild(d);
  };
  window.__tmsEnviar = function (quien, hora, texto) {
    window.__tmsCompose(''); window.__tmsMsg({ quien: quien, hora: hora, md: texto, mencion: true });
  };
  window.__tmsBot = function (si) {
    var e = document.getElementById('__tms-escr'); if (!e) return;
    e.innerHTML = si ? 'Gemma está escribiendo <i></i><i></i><i></i>' : '';
  };
  window.__tmsTarjeta = function (t) {
    var box = document.getElementById('__tms-msgs'); if (!box) return;
    var d = document.createElement('div'); d.className = 'msg';
    d.innerHTML = avatar('Helios', true) + '<div><div class="qn"><b>Helios</b><em>' + esc(t.hora || '') + '</em></div><div class="tar" style="border-left-color:' + (t.color || '#C4314B') + '">' +
      '<div style="font-size:12px;color:#707070">Helios · Sala de crisis</div><h4>' + esc(t.titulo) + '</h4><div style="font-size:13px;color:#707070;margin-bottom:6px">' + esc(t.sub || '') + '</div>' +
      (t.filas || []).map(function (f) { return '<div class="fi" style="border-top:1px solid #eee;padding-top:6px"><span><b style="width:auto;color:#242424;font-weight:600">' + esc(f[0]) + '</b>: ' + esc(f[1]) + '</span></div>'; }).join('') +
      '<span class="bt">' + esc(t.boton || 'Abrir sala en Helios') + '</span></div></div>';
    box.appendChild(d);
  };
})();
