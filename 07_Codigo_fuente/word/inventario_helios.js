// Inventario de tablas con el estilo de documentos Helios
const H = require('./helios_docx.js');
const C = require('./contenido.js');
const path = require('path');
const salida = process.argv[2] || 'Helios_inventario_de_tablas.docx';

const hijos = [
  ...H.cabecera('Inventario de tablas de la base', 'Cloudflare D1 · helios-monitoring-dev', 'Inventario de datos'),
  ...H.marcaIndice(),
];
C.secciones.forEach((s, i) => {
  const n = i + 1;
  hijos.push(H.titulo(1, n + '. ' + s.titulo));
  if (s.intro) hijos.push(H.P(s.intro));
  (s.bloques || []).forEach((b) => {
    if (b.p) hijos.push(H.P(b.p));
    if (b.li) hijos.push(H.vineta(b.li));
    if (b.nota) hijos.push(...H.nota('idea', 'Nota', b.nota));
    if (b.tabla) {
      const total = b.tabla.anchos.reduce((a, x) => a + x, 0);
      hijos.push(...H.tabla(b.tabla.cols, b.tabla.anchos.map((x) => Math.round(x * H.ANCHO / total)), b.tabla.filas));
    }
    if (b.imagen) hijos.push(...H.imagen(path.join(__dirname, b.imagen), 560, Math.round(560 * 1216 / 1344), b.pie));
  });
  if (n === 1) hijos.push(...H.nota('idea', 'Idea clave', 'las vistas deciden qué está alertando; `alertas_historico` recuerda qué pasó y qué se hizo; el cache solo existe para que abrir el tablero sea barato.'));
  (s.tablas || []).forEach((t, j) => {
    hijos.push(H.titulo(2, `${n}.${j + 1} ${t.nombre}`));
    hijos.push(H.P(t.para));
    hijos.push(...H.tabla(['Dato', 'Detalle'], [2300, H.ANCHO - 2300], [['**Quién la escribe**', t.escribe], ['**Quién la lee**', t.lee], ['**Filas en la demo**', t.filas]], true));
    hijos.push(H.titulo(3, 'Columnas'));
    hijos.push(...H.tabla(['Columnas', 'Qué guardan'], [4000, H.ANCHO - 4000], t.columnas));
  });
  if (s.titulo === 'Notas para migrar') hijos.push(...H.nota('regla', 'Regla obligatoria', 'toda ingesta nueva tiene que escribir las fechas con el mismo formato de texto UTC; si no, las vistas dejan de usar los índices y las lecturas se disparan.'));
});
H.guardar(H.documento({ titulo: 'Inventario de tablas de la base', pie: 'Inventario de tablas · helios-monitoring-dev', hijos }), salida).then(() => console.log('ok', salida));
