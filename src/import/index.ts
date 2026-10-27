import { categorize } from '../categories';
import { db } from '../db';
import type { AccountKind, ParsedRow, Transaction } from '../types';
import { parseSpreadsheet } from './excel';
import { parsePdf } from './pdf';

export interface Preview {
  fileName: string;
  account: string;
  kind: AccountKind;
  fresh: Omit<Transaction, 'importId'>[];
  duplicates: number;
  notes: string[];
}

export async function readFile(file: File, account: string, kind: AccountKind): Promise<Preview> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let rows: ParsedRow[];
  let notes: string[] = [];
  if (isPdf) ({ rows, notes } = await parsePdf(file));
  else rows = await parseSpreadsheet(file);

  // Kart ekstrelerinde harcamalar genelde artı yazılır; bizde gider eksi olmalı.
  if (kind === 'kart') {
    const positives = rows.filter((r) => r.amount > 0 && !r.credit).length;
    if (positives > rows.length / 2) rows = rows.map((r) => ({ ...r, amount: r.credit ? Math.abs(r.amount) : -r.amount }));
  }

  const rules = await db.rules.toArray();
  const all = rows.map(({ date, description, amount, hint, currency = 'TRY' }) => {
    let category = categorize(hint ? `${description} ${hint}` : description, amount, rules);
    // Kartta artı tutar = karta yapılan ödeme ya da iade; gelir değil.
    if (kind === 'kart' && category === 'Gelir') category = 'Kart Ödemesi';
    return { date, description, amount, currency, account, kind, category, key: `${account}|${date}|${amount.toFixed(2)}|${description}` };
  });

  // Aynı dosyada gerçekten iki kez aynı işlem olabilir (ör. iki kahve): sıra no ile ayır.
  const seen = new Map<string, number>();
  for (const t of all) {
    const n = seen.get(t.key) ?? 0;
    seen.set(t.key, n + 1);
    if (n > 0) t.key += `#${n}`;
  }

  const existing = new Set((await db.transactions.where('key').anyOf(all.map((t) => t.key)).toArray()).map((t) => t.key));
  const fresh = all.filter((t) => !existing.has(t.key));
  return { fileName: file.name, account, kind, fresh, duplicates: all.length - fresh.length, notes };
}

export async function savePreview(p: Preview) {
  await db.transaction('rw', db.transactions, db.imports, async () => {
    const importId = await db.imports.add({
      at: new Date().toISOString(),
      fileName: p.fileName,
      account: p.account,
      kind: p.kind,
      count: p.fresh.length,
    });
    await db.transactions.bulkAdd(p.fresh.map((t) => ({ ...t, importId })));
  });
}
