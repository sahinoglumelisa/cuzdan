import * as XLSX from 'xlsx';
import { normalize } from '../categories';
import type { ParsedRow } from '../types';
import { currencyOf, parseAmount, parseDate } from './parse';

const DATE_COLS = ['islem tarihi', 'tarih', 'date'];
// Not: tek başına 'islem' yazılmamalı; "içerir" aramasında "İşlem Tarihi" sütununu yakalayıp açıklama yerine tarihi okuyordu.
const DESC_COLS = ['aciklama', 'islem aciklamasi', 'isyeri adi', 'isyeri', 'islem detayi', 'detay', 'description', 'islem'];
const AMOUNT_COLS = ['islem tutari', 'tutar', 'tutar (tl)', 'amount'];
const DEBIT_COLS = ['borc', 'cikan', 'gider'];
const CREDIT_COLS = ['alacak', 'giren', 'gelir'];
const TYPE_COLS = ['islem tipi', 'operation type'];
const CURRENCY_COLS = ['para birimi', 'doviz cinsi', 'doviz kodu', 'currency', 'doviz'];

/** CSV'yi UTF-8 olarak, olmazsa Türkçe Windows kodlamasıyla (bankaların eski dışa aktarımları) çözer. */
function decodeText(buf: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1254').decode(buf);
  }
}

/** Başlık satırındaki sütunu bulur: önce tam eşleşme, sonra "içerir". */
function findCol(header: string[], names: string[], taken: number[] = []) {
  for (const n of names) {
    const i = header.findIndex((h, j) => h === n && !taken.includes(j));
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = header.findIndex((h, j) => h.includes(n) && !taken.includes(j));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Bankalardan indirilen Excel/CSV hesap hareketlerini okur.
 * Başlık satırını kendisi bulur (bankalar üste logo, hesap no vb. koyuyor).
 */
export async function parseSpreadsheet(file: File): Promise<ParsedRow[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // .xlsx (zip, "PK") ve eski .xls (OLE) ikili; geri kalanı CSV/metin.
  const binary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
  const wb = binary
    ? XLSX.read(buf, { type: 'array', cellDates: true })
    : // CSV'de kütüphanenin sayı tahminini kapat: "234,56"yı 23456, "12.500,00"ı 12,5 okuyordu.
      // Tutar ve tarihleri kendi Türkçe ayrıştırıcımız okusun.
      XLSX.read(decodeText(buf), { type: 'string', raw: true });
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
    const iAmount = findCol(header, AMOUNT_COLS);
    const iDebit = findCol(header, DEBIT_COLS);
    const iCredit = findCol(header, CREDIT_COLS);
    const iType = findCol(header, TYPE_COLS);
    // Açıklama sütunu tarih/tutar/tip sütunlarından biri olamaz.
    const iDesc = findCol(header, DESC_COLS, [iDate, iAmount, iDebit, iCredit, iType]);
    const iCur = findCol(header, CURRENCY_COLS, [iDate, iAmount, iDebit, iCredit, iType, iDesc]);
    // Varsayılan para birimi: tutar sütununun başlığı ("Tutar (EUR)"),
    // başlığın üstündeki bilgi satırları (ör. "Ürün-Döviz Tipi"), en son TL.
    const top = grid.slice(0, headerIdx).flat().join(' ');
    const amountHeader = String(grid[headerIdx][iAmount >= 0 ? iAmount : iDebit] ?? '');
    const sheetCurrency =
      currencyOf(amountHeader) ?? (/\bEUR\b|Euro/i.test(top) ? 'EUR' : /\bUSD\b|Dolar/i.test(top) ? 'USD' : 'TRY');

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
      // Karışık TL/EUR dökümler: satırın kendi para birimi sütunu ya da tutar hücresindeki işaret önce gelir.
      const cell = iAmount >= 0 ? r[iAmount] : amount < 0 ? r[iDebit] : r[iCredit];
      const currency = (iCur >= 0 ? currencyOf(r[iCur]) : undefined) ?? currencyOf(cell) ?? sheetCurrency;
      rows.push({ date, description, amount, currency, hint });
    }
  }
  return rows;
}
