// Modelo "con guion" para la demo en video: reemplaza a Workers AI solo en la PC.
// No inventa datos: arma cada respuesta con los mismos datos que Helios le pasaría al modelo real (alertas abiertas, carga,
// casos parecidos ya resueltos, contexto externo) y los redacta con plantillas. La respuesta real de Workers AI puede variar en las palabras.
import fs from 'node:fs';

function datosDe(texto) {
  const marca = 'Datos de Helios para responder (JSON):\n';
  const i = texto.indexOf(marca); if (i < 0) return null;
  const ini = texto.indexOf('{', i + marca.length); let prof = 0, enTexto = false, esc = false;
  for (let k = ini; k < texto.length; k++) {
    const c = texto[k];
    if (enTexto) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') enTexto = true; else if (c === '{') prof++; else if (c === '}' && --prof === 0) return JSON.parse(texto.slice(ini, k + 1));
  }
  return null;
}
const lista = (xs) => xs.map((x) => '- ' + x).join('\n');
const pl = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

function respSinAsignar(d) {
  const a = d.alertas_abiertas, sin = a.problemas.filter((p) => p.estado === 'Sin asignar'), tom = a.problemas.filter((p) => p.estado === 'Asignada sin tomar');
  if (!sin.length) return 'No hay nada sin asignar.' + (tom.length ? ' Hay ' + pl(tom.length, 'alerta asignada que nadie tomó', 'alertas asignadas que nadie tomó') + ' todavía.' : '');
  const filas = sin.map((p) => '**' + p.prioridad + ' · ' + p.gravedad + '** — ' + p.problema + ' en ' + p.donde + '. ' + (p.demorada ? 'Lleva ' + p.lleva_en_este_estado + ' sin asignar: ' + p.demorada.toLowerCase().replace('lleva ', '') + '.' : 'Recién empieza.'));
  const personas = (d.opciones_derivacion && d.opciones_derivacion.personas_de_soporte || []).filter((x) => x.problemas_abiertos === 0).map((x) => x.nombre);
  let t = 'Hay ' + pl(sin.length, 'alerta sin asignar', 'alertas sin asignar') + ':\n' + lista(filas) + '\n\n';
  t += 'Conviene derivarlas a ' + (personas.length ? personas.join(', ') : 'las personas de Soporte con menos carga') + ', que no tienen problemas abiertos, repartiendo una a cada uno para que ninguno se sature.';
  if (tom.length) t += '\n\nAdemás, ' + pl(tom.length, 'alerta está asignada', 'alertas están asignadas') + ' a ' + tom[0].asignada_a + ' y nadie las tomó todavía (llevan ' + tom[0].lleva_en_este_estado + ' o menos).';
  return t + '\n\nTe dejo los botones para derivarlas.';
}

function respCarga(d) {
  const c = d.carga_equipos, a = d.alertas_abiertas && d.alertas_abiertas.cuantas;
  const filas = (c.por_responsable || []).map((r) => '**' + r.asignada_a.replace(/^equipo /, 'Equipo ') + '**: ' + pl(r.sin_tomar, 'alerta sin tomar', 'alertas sin tomar') + ' y ' + pl(r.en_curso, 'en curso', 'en curso') + (r.p1_p2 ? ' (' + (r.p1_p2 === r.sin_tomar + r.en_curso ? 'todas' : r.p1_p2) + ' de prioridad P1 o P2)' : '') + '.');
  filas.push('**Sin asignar**: ' + c.sin_asignar + (c.sin_asignar_p1_p2 ? ' (' + c.sin_asignar_p1_p2 + ' de prioridad P1 o P2)' : '') + '.');
  let t = '**Carga actual**\n' + lista(filas);
  if (c.demoradas && c.demoradas.length) t += '\n\n**Para atender primero**\n' + lista(c.demoradas.map((x) => x.charAt(0).toUpperCase() + x.slice(1) + '.'));
  t += '\n\nNinguna otra persona o equipo de Soporte tiene alertas abiertas' + (c.sin_asignar ? ', así que hay lugar para derivarles lo que está sin asignar.' : '.');
  return t;
}

function respDetalle(d) {
  const x = d.detalle_alerta, v = x.ultimas_ventanas || [], casos = x.casos_parecidos_resueltos || [];
  const u = v[0];
  let t = '**Qué pasa**\n' + lista([
    x.problema + ' en ' + x.donde + '. Es **' + x.gravedad + '** (' + x.prioridad + ') y está ' + x.estado.toLowerCase() + '.',
    u ? 'En las últimas ' + v.length + ' ventanas viene en ' + u.observado + ' contra ' + u.esperado + ' esperados (el límite es ' + u.limite + ').' : null,
  ].filter(Boolean));
  if (casos.length) {
    const causas = {}; const acciones = {};
    for (const c of casos) {
      const m = (c.comentario || '').match(/^Causa: ([^.]+)\. Se hizo: ([^.]+)\./);
      if (m) { causas[m[1]] = (causas[m[1]] || 0) + 1; m[2].split(' · ').forEach((a) => { acciones[a] = (acciones[a] || 0) + 1; }); }
    }
    const top = (o) => Object.entries(o).sort((p, q) => q[1] - p[1])[0];
    const c1 = top(causas), a1 = top(acciones);
    t += '\n\n**Casos parecidos ya resueltos**\n' + lista(casos.map((c) => c.empezo + ': ' + c.como_termino + '. ' + (c.comentario || '').replace(/^Causa: [^.]+\. Se hizo: [^.]+\. /, '')));
    if (c1) t += '\n\nEn ' + (c1[1] === casos.length ? 'los ' + casos.length + ' casos' : c1[1] + ' de ' + casos.length + ' casos') + ' la causa fue **' + c1[0] + '**' + (a1 ? ' y lo que funcionó fue **' + a1[0].toLowerCase() + '**' : '') + '.';
  }
  const otros = x.otros_problemas_del_cliente || [];
  t += '\n\n**Qué revisaría primero**\n' + lista([
    casos.length ? 'Confirmar con el proveedor si hay una demora o un mantenimiento, como en los casos anteriores.' : 'Revisar cómo viene el servicio en las últimas ventanas.',
    otros.length ? 'Mirar si lo de ' + x.donde.split(',')[0] + ' (' + otros[0].charAt(0).toLowerCase() + otros[0].slice(1) + ') tiene el mismo origen.' : null,
  ].filter(Boolean));
  if (x.estado === 'Sin asignar') t += '\n\n**Sugerencia**: derivarla a Soporte para que la escale al proveedor.';
  return t;
}

function respContexto(d) {
  const pk = d.contexto_externo.puntos_clave || [];
  const por = (pre) => (pk.find((p) => p.startsWith(pre)) || '').replace(/^[^:]+:\s*/, '');
  const trozos = (s) => s.split(' | ').map((x) => x.trim()).filter(Boolean);
  const cal = trozos(por('CALENDARIO')), pro = trozos(por('PROVEEDORES')), not = trozos(por('NOTICIAS')).map((x) => x.split(' — mencioná')[0]), vig = trozos(por('QUÉ VIGILAR'));
  const primeraMayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  let t = '**Calendario**\n' + lista(cal);
  t += '\n\n**Proveedores**\n' + lista(pro.length ? pro : ['Sin novedades.']);
  t += '\n\n**Noticias**\n' + lista(not.length ? not : ['Sin novedades.']);
  t += '\n\n**Qué vigilar**\n' + lista(vig.map(primeraMayus));
  return t;
}

export const AI_GUION = {
  async run(modelo, p) {
    const usuario = [...p.messages].reverse().find((m) => m.role === 'user');
    const texto = (usuario && usuario.content) || '';
    const pregunta = texto.split('\n')[0];
    const d = datosDe(texto);
    let r = '(No tengo una respuesta preparada para esa pregunta.)';
    try {
      if (d) {
        if (d.detalle_alerta) r = respDetalle(d);
        else if (d.contexto_externo) r = respContexto(d);
        else if (/sin asignar/i.test(pregunta) && d.alertas_abiertas) r = respSinAsignar(d);
        else if (/carga/i.test(pregunta) && d.carga_equipos) r = respCarga(d);
      }
    } catch (e) { r = '(Error del modelo con guion: ' + e.message + ')'; }
    if (process.env.IA_LOG) fs.appendFileSync(new URL('./ia_log.jsonl', import.meta.url), JSON.stringify({ pregunta, r }) + '\n');
    return { choices: [{ message: { content: r } }] };
  },
};
