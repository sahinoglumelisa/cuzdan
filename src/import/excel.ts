import * as XLSX from 'xlsx';
import { normalize } from '../categories';
import type { ParsedRow } from '../types';
import { parseAmount, parseDate } from './parse';

const DATE_COLS = ['islem tarihi', 'tarih', 'date'];
const DESC_COLS = ['aciklama', 'islem aciklamasi', 'islem', 'isyeri', 'description'];
const AMOUNT_COLS = ['islem tutari', 'tutar', 'tutar (tl)', 'amount'];
const DEBIT_COLS = ['borc', 'cikan', 'gider'];
const CREDIT_COLS = ['alacak', 'giren', 'gelir'];
const TYPE_COLS = ['islem tipi', 'operation type'];

/** Başlık satırındaki sütunu bulur: önce tam eşleşme, sonra "içerir". */
function findCol(header: string[], names: string[]) {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = header.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Bankalardan indirilen Excel/CSV hesap hareketlerini okur.
 * Başlık satırını kendisi bulur (bankalar üste logo, hesap no vb. koyuyor).
 */
export async function parseSpreadsheet(file: File): Promise<ParsedRow[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const rows: ParsedRow[] = [];

  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });

    const headerIdx = grid.findIndex((r) => {
      const h = r.map((c) => normalize(String(c)));
      return findCol(h, DATE_COLS) >= 0 && (findCol(h, AMOUNT_COLS) >= 0 || findCol(h, DEBIT_COLS) >= 0);
    });
    if (headerIdx < 0) continue;

    const header = grid[headerIdx].map((c) => normalize(String(c)));
    const iDate = findCol(header, DATE_COLS);
    const iDesc = findCol(header, DESC_COLS);
    const iAmount = findCol(header, AMOUNT_COLS);
    const iDebit = findCol(header, DEBIT_COLS);
    const iCredit = findCol(header, CREDIT_COLS);
    const iType = findCol(header, TYPE_COLS);
    // Başlığın üstündeki bilgi satırlarında (ör. "Ürün-Döviz Tipi") geçen para birimi; yoksa TL
    const top = grid.slice(0, headerIdx).flat().join(' ');
    const currency = /\bEUR\b|Euro/i.test(top) ? 'EUR' : /\bUSD\b|Dolar/i.test(top) ? 'USD' : 'TRY';

    for (const r of grid.slice(headerIdx + 1)) {
      const date = parseDate(r[iDate]);
      if (!date) continue;
      let amount: number | null;
      if (iAmount >= 0) {
        amount = parseAmount(r[iAmount]);
      } else {
        const debit = parseAmount(r[iDebit]) ?? 0;
        const credit = iCredit >= 0 ? parseAmount(r[iCredit]) ?? 0 : 0;
        amount = credit - Math.abs(debit);
      }
      if (amount === null || amount === 0) continue;
      const description = String(iDesc >= 0 ? r[iDesc] : '').replace(/\s+/g, ' ').trim() || '(açıklama yok)';
      const hint = iType >= 0 ? String(r[iType]).trim() || undefined : undefined;
      rows.push({ date, description, amount, currency, hint });
    }
  }
  return rows;
}
