import { normalize } from '../categories';
import type { ParsedRow } from '../types';
import { parseAmount, parseDate } from './parse';

const DATE_RE = /^(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*/;
// Binlik ayraçlı ("12.500,00") ya da ayraçsız ("1234,56") tutar. Önünde rakam olmamalı: yoksa "1234,56"nın sadece
// "234,56" kısmını yakalıyordu. Arkasından gelen yabancı para kodu 1. grupta yakalanır (bkz. parseLines).
const AMOUNT_RE =
  /(?<![\d.,])[-+]?\(?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)\)?-?(?:\s?(?:TL|TRY|B|A)\b)?(\s?(?:USD|EUR|GBP|CHF|\$|€|£))?/g;

const CODES: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP' };

export interface PdfResult {
  rows: ParsedRow[];
  /** Ekstrede dikkat edilmesi gereken durumlar (ör. limit aşımı) */
  notes: string[];
}

/** Metne bakıp hangi bankanın düzeni olduğunu seçer. */
/** currency: kullanıcının seçtiği para birimi; yanında para kodu yazmayan tutarlar için geçerli. */
export function parseStatement(lines: string[], currency?: string): PdfResult {
  const text = lines.join('\n');
  if (/Aion Bank/i.test(text) || (/Booking date/.test(text) && /Operation title/.test(text))) return parseAion(lines);
  return parseLines(lines, currency);
}

/**
 * Genel amaçlı ekstre satır okuyucu: "tarih  açıklama  tutar ..." biçimindeki satırları yakalar.
 * Satırdaki ilk tutar işlem tutarı sayılır (sonrakiler genelde taksit/puan/mil).
 * Test edilen: İş Bankası Maximiles.
 */
export function parseLines(lines: string[], currency?: string): PdfResult {
  const rows: ParsedRow[] = [];
  const notes = new Set<string>();
  // Belgenin para birimi: TL hiç geçmiyor ama EUR/€ geçiyorsa (ör. Alman bankası) tutarlar EUR'dur.
  const text = lines.join('\n');
  const docCurrency = currency ?? (/\bTL\b|\bTRY\b|₺/.test(text) ? 'TRY' : /€|\bEUR\b/.test(text) ? 'EUR' : 'TRY');
  const codeOf = (a: RegExpMatchArray) => (a[1] ? (CODES[a[1].trim()] ?? a[1].trim()) : undefined);
  for (const line of lines) {
    const flat = normalize(line).replace(/\s/g, '');
    if (flat.includes('limitasimi')) notes.add('Bu dönemde kart limitini aşmışsın. Limit aşımı ek ücret ve faiz demek.');
    if (flat.includes('gecikmefaizi') && /\d,\d{2}/.test(line) && DATE_RE.test(line)) notes.add('Ekstrede gecikme faizi var.');

    const m = line.match(DATE_RE);
    if (!m) continue;
    const date = parseDate(m[1]);
    if (!date) continue;
    // Bazı ekstrelerde işlem tarihinin yanında bir de valör tarihi var
    const rest = line.slice(m[0].length).replace(DATE_RE, '');
    const amounts = [...rest.matchAll(AMOUNT_RE)];
    // Yurt dışı harcamada önce orijinal tutar ("12,99 USD"), sonra TL karşılığı yazılır: para kodu olmayanı al.
    // Satırda sadece kodlu tutar varsa ("2,29 EUR") o tutarı kendi para birimiyle al; asla TL sayma.
    // Kullanıcı para birimi seçtiyse ve satırda o para biriminde yazılmış tutar varsa önce onu al.
    const first =
      (currency && amounts.find((a) => codeOf(a) === currency)) || amounts.find((a) => !a[1]) || amounts[0];
    if (!first) continue;
    const cur = codeOf(first) ?? docCurrency;
    const amount = parseAmount(first[0].slice(0, first[0].length - (first[1]?.length ?? 0)).replace('+', ''));
    if (amount === null || amount === 0) continue;
    const description = rest.slice(0, amounts[0].index).replace(/\s+/g, ' ').trim() || '(açıklama yok)';
    // Kart ekstrelerinde başında "+" olan tutar alacaktır (iade, ödeme, önceki dönemden artan).
    rows.push({ date, description, amount, currency: cur, credit: first[0].trim().startsWith('+') || undefined });
  }
  return { rows, notes: [...notes] };
}

const AION_TYPES = ['Card transactions', 'Outgoing transfer', 'Incoming transfer', 'Internal transfer', 'Direct debit', 'Standing order', 'Fee'];
const AION_DATE = /^\d{2}\.\d{2}\.\d{4}\b/;
const EUR_RE = /(-?\d{1,3}(?: \d{3})*\.\d{2}) EUR\b/g;

/**
 * UniCredit / Aion Bank (Almanya) hesap dökümü. Her işlem birkaç satıra yayılır:
 *   01.10.2026 <katılımcı> --- <başlık> <işlem tipi> -710.00 EUR 5 475.39 EUR   ← işlem tarihi, tutar, bakiye
 *   01.10.2026 <devamı> <işlem no>                                              ← kayıt tarihi
 *   <devamı>
 * Yabancı para kart harcamalarında EUR karşılığı ikinci satırdadır ("-28.95 TRY" / "-0.54 EUR").
 */
export function parseAion(lines: string[]): PdfResult {
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^Issued on|^Remark|^The document has been/.test(line)) continue;
    // Yeni işlem: tarihle başlayan ve ardından yine tarihle başlayan (kayıt tarihi) satır gelen satır
    if (AION_DATE.test(line) && AION_DATE.test(lines[i + 1]?.trim() ?? '')) {
      blocks.push([line, lines[i + 1].trim().replace(AION_DATE, '')]);
      i++;
    } else if (blocks.length) {
      blocks.at(-1)!.push(line);
    }
  }

  const rows: ParsedRow[] = [];
  for (const [first, ...rest] of blocks) {
    const date = parseDate(first.slice(0, 10));
    if (!date) continue;
    // İlk satırdaki son EUR tutarı bakiyedir; işlem tutarı ondan önceki ya da sonraki satırlardaki ilk EUR tutarı.
    const firstAmounts = [...first.matchAll(EUR_RE)];
    const candidates = [...firstAmounts.slice(0, -1), ...rest.flatMap((l) => [...l.matchAll(EUR_RE)])];
    if (!candidates.length) continue;
    const amount = Number(candidates[0][1].replace(/ /g, ''));
    if (!amount) continue;

    const all = [first.slice(10), ...rest].join(' ');
    const hint = AION_TYPES.find((t) => all.includes(t));
    const words = all
      .replace(/\b1 [A-Z]{3}=[\d.]+ EUR\b/g, ' ') // kur bilgisi
      .replace(/-?\d{1,3}(?: \d{3})*\.\d{2} (?:EUR|TRY|USD|GBP)\b/g, ' ') // tutarlar
      .replace(new RegExp(AION_TYPES.join('|'), 'g'), ' ')
      .split(/\s+/)
      .filter((w) => w && w !== '---' && !/^\*\d{4}$/.test(w)) // kart no
      .filter((w) => !/^[A-Z]{2}\d{6,}$/.test(w) && !/^[\d.,]+$/.test(w)) // IBAN parçası, sadece rakam
      .filter((w) => !(/\d/.test(w) && /^[0-9a-f-]{4,}$/i.test(w))); // işlem no (uuid parçaları)
    // Katılımcı ve işlem başlığı çoğu zaman aynı adı tekrarlar
    const seen = new Set<string>();
    const description = words.filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase())).join(' ') || '(açıklama yok)';
    rows.push({ date, description, amount, currency: 'EUR', hint });
  }
  return { rows, notes: [] };
}
