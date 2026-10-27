const formatters = new Map<string, Intl.NumberFormat>();
let display = 'TRY';

/** Özetlerde kullanılacak para birimi (ayarlardan gelir). */
export const setDisplayCurrency = (c: string) => (display = c);

export function money(n: number, currency = display) {
  let f = formatters.get(currency);
  if (!f) formatters.set(currency, (f = new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: currency === 'TRY' ? 0 : 2 })));
  return f.format(currency === 'TRY' ? Math.round(n) : n);
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2026-10" -> "Ekim 2026" */
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

/** "2026-10-03" -> "3 Ekim" */
export const dayLabel = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export function shiftMonth(ym: string, delta: number) {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
