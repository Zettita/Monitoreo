---
name: documentos-word-helios
description: Arma documentos Word (.docx) con el estilo Helios (paleta azul y verde azulado, título con línea, recuadros de código y de notas, encabezado y pie) e índice de Word real con números de página.
---

# Documentos Word con estilo Helios

Usala cuando Uriel pida un Word, un .docx, un informe o una especificación "como los de Helios" o "con índice y la paleta de siempre". El modelo de referencia es el documento "Alertas - modelo de datos" de su compañera.

## Estilo (sacado del documento modelo)

| Elemento | Formato |
| --- | --- |
| Página | Carta (12240 × 15840 DXA); márgenes sup. 1008, inf. 936, izq./der. 1080; encabezado y pie a 720 |
| Texto | Aptos 10,5 pt, color `2A2A2A`, interlineado 1,08 automático, 6 pt después |
| Título | Calibri 24 pt negrita `1F4E79`, centrado, línea inferior `4F81BD` |
| Subtítulo | Calibri 14 pt negrita `00707D`, centrado |
| Línea de identificación | "HELIOS \| Plataforma de Monitoreo \| <tipo de documento>", 10 pt `5F5F5F`, centrado |
| Título 1 | Calibri 16 pt negrita `1F4E79`, numerado a mano ("1. Resumen") |
| Título 2 | Calibri 12,5 pt negrita `00707D` ("2.1 Nombre") |
| Título 3 | Calibri 11 pt negrita `00707D` (por ejemplo "Ejemplo") |
| Viñetas | estilo List Bullet, 2 pt después |
| Bloque de código | tabla de una celda, fondo `F4F6F8`, sin bordes, Consolas 8 pt `282828` |
| Recuadro "Idea clave" / "Decisión funcional" | una celda fondo `EAF2F8`, etiqueta en negrita `1F4E79` |
| Recuadro "Regla obligatoria" (advertencia) | fondo `FFF2CC` |
| Recuadro "Decisión de infraestructura" (positivo) | fondo `E2F0D9` |
| Tablas de datos | encabezado `1F4E79` con letra blanca, bordes `D9D9D9`, filas alternas `F4F6F8` |
| Encabezado de página | "HELIOS \| Plataforma de Monitoreo", 8 pt `5F5F5F`, a la derecha |
| Pie | descripción del documento + "Página X de Y", 8 pt `5F5F5F`, centrado |
| Índice | campo TOC de Word (niveles 1 y 2) después de la portada, con puntos guía, vínculos y números de página ya calculados |

No usar otros colores ni fuentes. Nada de emojis. Textos en español, cortos, con el número o el dato primero.

## Cómo armarlo

1. Leer la skill `docx` (pasos de verificación y advertencias de docx-js).
2. Guardar los dos archivos de abajo (`helios_docx.js` e `indice.py`) en la carpeta de trabajo.
3. Escribir un script que use `helios_docx.js`:

```js
const H = require('./helios_docx.js');
const hijos = [
  ...H.cabecera('Título del documento', 'Subtítulo', 'Especificación técnica'),
  ...H.marcaIndice(),                       // acá va el índice
  H.titulo(1, '1. Resumen'),
  H.P('Texto con `código` y **negrita**.'),
  H.vineta('Un punto'),
  ...H.nota('idea', 'Idea clave', 'lo más importante en una frase.'),
  ...H.codigo(['CREATE TABLE x (', '    id INTEGER', ');']),
  ...H.tabla(['Columna', 'Qué guarda'], [4000, H.ANCHO - 4000], [['`id`', 'Identificador']]),
  H.titulo(2, '1.1 Detalle'),
];
H.guardar(H.documento({ titulo: 'Título del documento', pie: 'Descripción corta del documento', hijos }), 'salida.docx');
```

   - `H.nota(tipo, etiqueta, texto)`: tipo `idea` (azul), `regla` (amarillo) o `decision` (verde).
   - `H.tabla(cols, anchos, filas, junta)`: los anchos en DXA suman `H.ANCHO` (10080); `junta = true` para tablas cortas que no deben cortarse.
   - `H.imagen(ruta, anchoPx, altoPx, pie)` para figuras (PNG).
   - Los títulos llevan el número escrito en el texto, igual que el modelo.
4. Generar el índice: `python3 indice.py salida.docx --soffice <ruta de la skill docx>/scripts/office/soffice.py`. Convierte a PDF, busca la página de cada título y escribe un índice de Word de verdad, ya completo (en Word, clic derecho > Actualizar campo lo regenera).
5. Verificar como dice la skill `docx`: `validate.py`, convertir a PDF y mirar las páginas (portada, índice, una página con tabla y una con recuadros). Revisar que el encabezado no pise el título y que las imágenes se vean.
6. Entregar el .docx y, si hay una carpeta conectada, guardarlo ahí sin pisar archivos existentes.

## helios_docx.js

```js
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
```

## indice.py

```python
#!/usr/bin/env python3
"""indice.py — pone un índice de Word de verdad (campo TOC) en el lugar de [[INDICE]],
ya completo con los números de página, así se ve aunque Word no actualice campos.
En Word: clic derecho > Actualizar campo lo regenera.
Uso: python3 indice.py doc.docx [--soffice RUTA_soffice.py]
Necesita doc.docx.marcas.json (lo escribe helios_docx.guardar)."""
import json, os, re, subprocess, sys, tempfile, zipfile, shutil
from xml.sax.saxutils import escape

doc = sys.argv[1]
soffice = sys.argv[sys.argv.index('--soffice') + 1] if '--soffice' in sys.argv else None
marcas = json.load(open(doc + '.marcas.json'))

def entradas(paginas):
    xml = []
    for k, m in enumerate(marcas):
        if m['nivel'] > 2:
            continue
        estilo = 'TOC1' if m['nivel'] == 1 else 'TOC2'
        pag = str(paginas.get(m['id'], ''))
        inicio = ('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>'
                  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>') if k == 0 else ''
        xml.append(
            f'<w:p><w:pPr><w:pStyle w:val="{estilo}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="10070"/></w:tabs></w:pPr>{inicio}'
            f'<w:hyperlink w:anchor="{m["id"]}" w:history="1"><w:r><w:t xml:space="preserve">{escape(m["texto"])}</w:t></w:r><w:r><w:tab/></w:r>'
            f'<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF {m["id"]} \\h </w:instrText></w:r>'
            f'<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>{pag}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>')
    xml.append('<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    return ''.join(xml)

def escribir(paginas, salida):
    with zipfile.ZipFile(doc) as z:
        archivos = {n: z.read(n) for n in z.namelist()}
    d = archivos['word/document.xml'].decode('utf8')
    i = d.index('[[INDICE]]')
    a = d.rfind('<w:p>', 0, i); a2 = d.rfind('<w:p ', 0, i); a = max(a, a2)
    b = d.index('</w:p>', i) + len('</w:p>')
    d = d[:a] + entradas(paginas) + d[b:]
    archivos['word/document.xml'] = d.encode('utf8')
    with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, v in archivos.items():
            if not n.endswith('/'):
                z.writestr(n, v)

def paginas_de(docx):
    """Convierte a PDF y busca en qué página aparece cada título (después del índice)."""
    tmp = tempfile.mkdtemp()
    cmd = ([sys.executable, soffice] if soffice else ['soffice']) + ['--headless', '--convert-to', 'pdf', '--outdir', tmp, docx]
    subprocess.run(cmd, capture_output=True)
    pdf = os.path.join(tmp, os.path.splitext(os.path.basename(docx))[0] + '.pdf')
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
    textos = [subprocess.run(['pdftotext', '-layout', '-f', str(p), '-l', str(p), pdf, '-'], capture_output=True, text=True).stdout for p in range(1, n + 1)]
    inicio_cuerpo = next((p for p, t in enumerate(textos) if 'Índice' in t), 0) + 1
    res, desde = {}, inicio_cuerpo
    for m in marcas:
        for p in range(desde, n):
            if any(l.strip() == m['texto'] for l in textos[p].splitlines()):
                res[m['id']] = p + 1; desde = p; break
    shutil.rmtree(tmp, ignore_errors=True)
    return res, n

tmp = doc + '.tmp.docx'
escribir({m['id']: 0 for m in marcas}, tmp)        # pase 1: mismo largo que el final
pag, n = paginas_de(tmp)
escribir(pag, doc)                                   # pase 2: números reales
os.remove(tmp)
faltan = [m['texto'] for m in marcas if m['nivel'] <= 2 and m['id'] not in pag]
print(f'índice listo: {len([m for m in marcas if m["nivel"] <= 2])} entradas, {n} páginas' + (f'; sin página: {faltan}' if faltan else ''))
```
