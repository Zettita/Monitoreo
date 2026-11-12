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
