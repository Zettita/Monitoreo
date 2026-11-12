// helios_docx.js — estilo de documentos Helios (modelo: "Alertas - modelo de datos")
const fs = require('fs');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, Header, Footer, PageNumber, LevelFormat, TableLayoutType, ImageRun, Bookmark, LineRuleType } = d;
const AUTO = LineRuleType.AUTO;

const PALETA = {
  azul: '1F4E79',      // título, títulos 1, etiquetas de recuadros, encabezado de tablas
  verdeAzul: '00707D', // subtítulo, títulos 2 y 3
  lineaTitulo: '4F81BD',
  texto: '2A2A2A', gris: '5F5F5F', codigo: '282828',
  fondoCodigo: 'F4F6F8', idea: 'EAF2F8', regla: 'FFF2CC', decision: 'E2F0D9', borde: 'D9D9D9',
};
const CARTA = { width: 12240, height: 15840 }, MARGEN = { top: 1008, right: 1080, bottom: 936, left: 1080, header: 720, footer: 720 };
const ANCHO = CARTA.width - MARGEN.left - MARGEN.right; // 10080

// Texto en línea: `código` y **negrita**
function runs(t, base = {}) {
  const out = [], re = /(`[^`]+`|\*\*[^*]+\*\*)/g; let i = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(new TextRun({ text: t.slice(i, m.index), ...base }));
    const x = m[0];
    out.push(x[0] === '`' ? new TextRun({ text: x.slice(1, -1), font: 'Consolas', size: (base.size || 21) - 2, color: base.color || PALETA.codigo, bold: base.bold })
                          : new TextRun({ text: x.slice(2, -2), ...base, bold: true }));
    i = m.index + x.length;
  }
  if (i < t.length) out.push(new TextRun({ text: t.slice(i), ...base }));
  return out;
}
const P = (t, op = {}) => new Paragraph({ children: runs(t, op.run), ...op.par });
const vineta = (t) => new Paragraph({ style: 'ListBullet', numbering: { reference: 'vinetas', level: 0 }, spacing: { after: 40 }, children: runs(t) });

// Títulos numerados con marcador (_Toc…) para el índice de Word
let nToc = 0;
const marcas = [];
function titulo(nivel, texto) {
  const id = '_Toc' + String(100000 + (++nToc));
  marcas.push({ nivel, texto, id });
  const h = nivel === 1 ? HeadingLevel.HEADING_1 : nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({ heading: h, children: [new Bookmark({ id, children: [new TextRun(texto)] })] });
}

// Recuadro de una celda: código o nota destacada
function caja(fondo, parrafos, margen) {
  return new Table({
    width: { size: ANCHO, type: WidthType.DXA }, columnWidths: [ANCHO], alignment: AlignmentType.CENTER,
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows: [new TableRow({ children: [new TableCell({ width: { size: ANCHO, type: WidthType.DXA }, shading: { fill: fondo, type: ShadingType.CLEAR, color: 'auto' }, margins: margen, children: parrafos })] })],
  });
}
const despues = (n = 160) => new Paragraph({ spacing: { after: n }, children: [] });
function codigo(lineas) {
  return [caja(PALETA.fondoCodigo, [new Paragraph({ style: 'CodeBlock', children: lineas.flatMap((l, i) => [new TextRun({ text: l, break: i ? 1 : 0 })]) })], { top: 80, bottom: 80, left: 100, right: 100 }), despues()];
}
// tipo: 'idea' (Idea clave / Decisión funcional), 'regla' (Regla obligatoria / advertencia), 'decision' (Decisión de infraestructura)
function nota(tipo, etiqueta, texto) {
  return [caja(PALETA[tipo], [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: etiqueta + ': ', bold: true, color: PALETA.azul }), ...runs(texto)] })], { top: 100, bottom: 100, left: 120, right: 120 }), despues()];
}
// Tabla de datos: encabezado azul, filas alternadas
// junta = true: la tabla no se corta entre páginas (para tablas cortas)
function tabla(cols, anchos, filas, junta) {
  const b = { style: BorderStyle.SINGLE, size: 4, color: PALETA.borde };
  const celda = (t, w, op = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: { top: b, bottom: b, left: b, right: b },
    shading: op.fondo ? { fill: op.fondo, type: ShadingType.CLEAR, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ keepNext: !!op.junta, spacing: { after: 0, line: 240, lineRule: AUTO }, children: runs(t, { size: 19, ...(op.run || {}) }) })] });
  return [new Table({ width: { size: ANCHO, type: WidthType.DXA }, columnWidths: anchos, layout: TableLayoutType.FIXED, rows: [
    new TableRow({ tableHeader: true, children: cols.map((c, i) => celda(c, anchos[i], { fondo: PALETA.azul, junta: true, run: { bold: true, color: 'FFFFFF' } })) }),
    ...filas.map((f, k) => new TableRow({ cantSplit: true, children: f.map((v, i) => celda(v, anchos[i], { fondo: k % 2 ? PALETA.fondoCodigo : undefined, junta: junta && k < filas.length - 1 })) })),
  ] }), despues()];
}
function imagen(ruta, anchoPx, altoPx, pie) {
  return [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 80, after: 60, line: 240, lineRule: AUTO }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(ruta), transformation: { width: anchoPx, height: altoPx }, altText: { title: pie, description: pie, name: 'figura' } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: pie, italics: true, size: 18, color: PALETA.gris })] })];
}
// Portada del modelo: título, subtítulo y línea HELIOS
function cabecera(tituloDoc, subtitulo, tipoDoc) {
  return [
    new Paragraph({ style: 'Title', alignment: AlignmentType.CENTER, children: [new TextRun(tituloDoc)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: subtitulo, bold: true, color: PALETA.verdeAzul, size: 28 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'HELIOS | Plataforma de Monitoreo | ' + tipoDoc, color: PALETA.gris, size: 20 })] }),
  ];
}
// Marca donde va el índice (lo completa indice.py)
const marcaIndice = () => [new Paragraph({ style: 'TOCHeading', children: [new TextRun('Índice')] }), new Paragraph({ children: [new TextRun('[[INDICE]]')] })];

function documento({ titulo: t, pie, hijos }) {
  return new Document({
    creator: 'Helios', title: t,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: 'Aptos', size: 21, color: PALETA.texto }, paragraph: { spacing: { after: 120, line: 259, lineRule: AUTO } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Calibri', size: 48, bold: true, color: PALETA.azul }, paragraph: { spacing: { after: 120, line: 240, lineRule: AUTO }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: PALETA.lineaTitulo, space: 4 } } } },
        { id: 'Heading1', name: 'heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 32, bold: true, color: PALETA.azul }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, keepLines: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 25, bold: true, color: PALETA.verdeAzul }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
        { id: 'Heading3', name: 'heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 22, bold: true, color: PALETA.verdeAzul }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, keepLines: true, outlineLevel: 2 } },
        { id: 'ListBullet', name: 'List Bullet', basedOn: 'Normal', run: {}, paragraph: { spacing: { after: 40 } } },
        { id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', run: { font: 'Consolas', size: 16, color: PALETA.codigo }, paragraph: { spacing: { after: 0, line: 240, lineRule: AUTO } } },
        { id: 'TOCHeading', name: 'TOC Heading', basedOn: 'Normal', next: 'Normal', run: { font: 'Calibri', size: 32, bold: true, color: PALETA.azul }, paragraph: { spacing: { before: 120, after: 160 } } },
        { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { bold: true, color: PALETA.azul }, paragraph: { spacing: { before: 120, after: 40 } } },
        { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { size: 20 }, paragraph: { spacing: { after: 20 }, indent: { left: 360 } } },
      ],
    },
    numbering: { config: [{ reference: 'vinetas', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } }] }] },
    sections: [{
      properties: { page: { size: CARTA, margin: MARGEN } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'HELIOS | Plataforma de Monitoreo', size: 16, color: PALETA.gris })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [pie + '  ·  Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 16, color: PALETA.gris })] })] }) },
      children: hijos,
    }],
  });
}
async function guardar(doc, ruta) {
  fs.writeFileSync(ruta, await Packer.toBuffer(doc));
  fs.writeFileSync(ruta + '.marcas.json', JSON.stringify(marcas));
}
module.exports = { PALETA, ANCHO, runs, P, vineta, titulo, codigo, nota, tabla, imagen, cabecera, marcaIndice, documento, guardar };
