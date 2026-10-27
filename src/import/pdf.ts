import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseStatement, type PdfResult } from './lines';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** PDF'teki metni, aynı yükseklikteki parçaları birleştirerek satırlara çevirir. */
async function pdfLines(file: File): Promise<string[]> {
  // Sadece metin okuyoruz: PDF içinden kod üretilmesini (eval) kapat.
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; w: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 3); // ~3pt tolerans
      byY.set(y, [...(byY.get(y) ?? []), { x: item.transform[4], w: item.width, s: item.str }]);
    }
    for (const [, parts] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      parts.sort((a, b) => a.x - b.x);
      // Parçalar arasında gerçekten boşluk varsa boşluk koy; harf harf bölünmüş metni birleştir.
      let line = parts[0].s;
      for (let i = 1; i < parts.length; i++) {
        const gap = parts[i].x - (parts[i - 1].x + parts[i - 1].w);
        line += (gap > 1.5 ? ' ' : '') + parts[i].s;
      }
      lines.push(line);
    }
  }
  return lines;
}

export async function parsePdf(file: File): Promise<PdfResult> {
  return parseStatement(await pdfLines(file));
}
