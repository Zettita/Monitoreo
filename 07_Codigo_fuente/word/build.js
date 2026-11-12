// Arma el Word del inventario. Uso: node build.js salida.docx [paginas.json]
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, ImageRun, Header, Footer, PageNumber, PageBreak, Bookmark, InternalHyperlink,
  PositionalTab, PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader, LevelFormat, TableLayoutType, TabStopType,
} = require('docx');
const C = require('./contenido.js');
const [, , salida, archPag] = process.argv;
const paginas = archPag && fs.existsSync(archPag) ? JSON.parse(fs.readFileSync(archPag, 'utf8')) : {};

const FUENTE = 'Arial', MONO = 'Consolas';
const TEAL = '0F766E', TEAL_CLARO = 'E6F4F2', GRIS = '5E6C84', LINEA = 'C9D1D9';
const ANCHO = 9638; // A4 con márgenes de 2 cm

// Texto con `código` y **negrita**
function runs(texto, base = {}) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let i = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > i) out.push(new TextRun({ text: texto.slice(i, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: (base.size || 21) - 2, color: base.color || '1F3A44', ...(base.bold ? { bold: true } : {}) }));
    else out.push(new TextRun({ text: t.slice(2, -2), ...base, bold: true }));
    i = m.index + t.length;
  }
  if (i < texto.length) out.push(new TextRun({ text: texto.slice(i), ...base }));
  return out;
}
const p = (texto, op = {}) => new Paragraph({ children: runs(texto, op.run || {}), spacing: { after: 120, line: 276 }, ...op.par });

// Encabezados numerados con marcador para el índice
const indice = [];
function titulo(nivel, numero, texto) {
  const id = 'sec_' + numero.replace(/\./g, '_');
  indice.push({ nivel, numero, texto, id });
  return new Paragraph({
    heading: nivel === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    pageBreakBefore: nivel === 1 && numero !== '1',
    children: [new Bookmark({ id, children: [new TextRun({ text: numero + (nivel === 1 ? '. ' : ' ') + texto })] })],
  });
}

const borde = { style: BorderStyle.SINGLE, size: 4, color: LINEA };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };
function celda(texto, ancho, op = {}) {
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA }, borders: bordes,
    shading: op.fondo ? { fill: op.fondo, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: runs(texto, { size: 19, ...(op.run || {}) }), spacing: { after: 0, line: 252 } })],
  });
}
function tabla(cols, anchos, filas) {
  return new Table({
    width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: cols.map((c, i) => celda(c, anchos[i], { fondo: TEAL, run: { bold: true, color: 'FFFFFF' } })) }),
      ...filas.map((f, k) => new TableRow({ cantSplit: true, children: f.map((v, i) => celda(v, anchos[i], { fondo: k % 2 ? 'F6F8FA' : undefined })) })),
    ],
  });
}
// Ficha de una tabla: para qué, quién escribe, quién lee, filas
function ficha(t) {
  const a = [2200, ANCHO - 2200];
  const fila = (k, v) => new TableRow({ children: [celda(k, a[0], { fondo: TEAL_CLARO, run: { bold: true, color: '134E4A' } }), celda(v, a[1])] });
  return new Table({
    width: { size: ANCHO, type: WidthType.DXA }, columnWidths: a, layout: TableLayoutType.FIXED,
    rows: [fila('Para qué sirve', t.para), fila('Quién la escribe', t.escribe), fila('Quién la lee', t.lee), fila('Filas en la demo', t.filas)],
  });
}
const espacio = (n = 120) => new Paragraph({ spacing: { after: n }, children: [] });

// ---------- Portada ----------
const portada = [
  new Paragraph({ spacing: { before: 2600, after: 0 }, children: [new TextRun({ text: 'HELIOS · PLATAFORMA DE OBSERVABILIDAD', font: FUENTE, size: 20, bold: true, color: TEAL, characterSpacing: 40 })] }),
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 8 } }, spacing: { before: 200, after: 240 },
    children: [new TextRun({ text: C.titulo, font: FUENTE, size: 56, bold: true, color: '172B4D' })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: C.subtitulo, font: FUENTE, size: 24, color: GRIS })] }),
  new Paragraph({ spacing: { after: 1600 }, children: [new TextRun({ text: 'Qué tablas y vistas hay, para qué sirve cada una, quién las escribe, quién las lee y qué guardan sus columnas.', font: FUENTE, size: 22, color: GRIS })] }),
  tabla(['Dato', 'Valor'], [3000, ANCHO - 3000], [
    ['Base', '`helios-monitoring-dev` (Cloudflare D1, SQLite)'],
    ['Contenido', '24 tablas y 7 vistas, en seis grupos'],
    ['Versión del sistema', 'Worker de alertas con umbrales por cliente, Seguimiento y prioridad P1–P4'],
    ['Fecha', C.fecha],
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

// ---------- Cuerpo ----------
const cuerpo = [];
C.secciones.forEach((s, i) => {
  const n = String(i + 1);
  cuerpo.push(titulo(1, n, s.titulo));
  if (s.intro) cuerpo.push(p(s.intro));
  (s.bloques || []).forEach((b) => {
    if (b.p) cuerpo.push(p(b.p));
    if (b.nota) cuerpo.push(p(b.nota, { run: { italics: true, color: GRIS, size: 19 } }));
    if (b.li) cuerpo.push(new Paragraph({ numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 100, line: 276 }, children: runs(b.li) }));
    if (b.tabla) { cuerpo.push(tabla(b.tabla.cols, b.tabla.anchos, b.tabla.filas)); cuerpo.push(espacio(200)); }
    if (b.imagen) {
      const ancho = 600, alto = Math.round(600 * 1216 / 1344);
      cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, keepNext: true,
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(path.join(__dirname, b.imagen)), transformation: { width: ancho, height: alto },
          altText: { title: 'Diagrama', description: b.pie, name: 'diagrama' } })] }));
      cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: b.pie, italics: true, size: 18, color: GRIS })] }));
    }
  });
  (s.tablas || []).forEach((t, j) => {
    cuerpo.push(titulo(2, n + '.' + (j + 1), t.nombre));
    cuerpo.push(ficha(t));
    cuerpo.push(new Paragraph({ spacing: { before: 160, after: 80 }, keepNext: true, children: [new TextRun({ text: 'Columnas', bold: true, size: 20, color: '134E4A' })] }));
    cuerpo.push(tabla(['Columnas', 'Qué guardan'], [3900, ANCHO - 3900], t.columnas));
    cuerpo.push(espacio(160));
  });
});

// ---------- Índice (números de página del pase anterior) ----------
const idx = [
  new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: TEAL, space: 6 } },
    children: [new TextRun({ text: 'Índice', font: FUENTE, size: 36, bold: true, color: '172B4D' })] }),
  ...indice.map((e) => new Paragraph({
    spacing: { before: e.nivel === 1 ? 140 : 20, after: 20 },
    indent: { left: e.nivel === 1 ? 0 : 400 },
    tabStops: [{ type: TabStopType.RIGHT, position: ANCHO, leader: 'dot' }],
    children: [new InternalHyperlink({ anchor: e.id, children: [
      new TextRun({ text: e.numero + (e.nivel === 1 ? '. ' : '  ') + e.texto, bold: e.nivel === 1, font: e.nivel === 1 ? FUENTE : MONO, size: e.nivel === 1 ? 22 : 19, color: '172B4D' }),
      new TextRun({ text: '\t' + String(paginas[e.numero] || '00'), size: e.nivel === 1 ? 22 : 19, bold: e.nivel === 1, color: '172B4D' }),
    ] })],
  })),
  new Paragraph({ children: [new PageBreak()] }),
];

const doc = new Document({
  creator: 'Helios', title: C.titulo, description: C.subtitulo,
  styles: {
    default: { document: { run: { font: FUENTE, size: 21, color: '172B4D' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FUENTE, size: 34, bold: true, color: TEAL }, paragraph: { spacing: { before: 120, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: MONO, size: 26, bold: true, color: '172B4D' }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 260 } } } }] }] },
  sections: [
    { properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: portada },
    { properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 600, footer: 600 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Helios · Inventario de tablas de la base', size: 16, color: GRIS })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: GRIS })] })] }) },
      children: [...idx, ...cuerpo] },
  ],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(salida, b); fs.writeFileSync(salida + '.indice.json', JSON.stringify(indice)); console.log('ok', salida); });
