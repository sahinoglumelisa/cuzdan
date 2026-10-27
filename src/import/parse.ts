/** "1.234,56" / "-1.234,56 TL" / "1,234.56" / 1234.56 -> sayı. Okunamazsa null. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/\s|TL|TRY|₺/gi, '');
  // Bazı bankalar "1.234,56-" ya da "(1.234,56)" ya da "1.234,56 B" (borç) yazar
  let negative = /^-|-$|^\(.*\)$/.test(s);
  if (/[Bb]$/.test(s)) { negative = true; s = s.slice(0, -1); }
  if (/[Aa]$/.test(s)) s = s.slice(0, -1);
  s = s.replace(/^[-+(]|[-)]$/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // hangisi sondaysa ondalık ayracı odur
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.234" Türkçe binlik
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "03.10.2026" / "03/10/26" / "2026-10-03" / Date / Excel seri no -> "2026-10-03". Okunamazsa null. */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    // Excel seri günü (1899-12-30 tabanlı)
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
