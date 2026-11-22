import { normalize } from './categories';

/**
 * Kullanıcının kategorilediği işlemlerden öğrenen basit bir Naive Bayes sınıflandırıcı.
 * Aynı işyeri olmasa da ortak kelimelerden ("eczanesi", "gida", "petrol", "ltd") ve
 * tutar büyüklüğünden tahmin yapar. Her şey cihazda, işlemlerin kendisinden hesaplanır.
 */

// Hemen her açıklamada geçen, kategori hakkında bilgi vermeyen kelimeler
const STOP = new Set([
  'pos', 'satis', 'harcama', 'alisveris', 'islem', 'odeme', 'kart', 'karti', 'kredi', 'banka', 'bankasi',
  'tic', 'ticaret', 'san', 'ltd', 'sti', 'anonim', 'sirketi', 'limited', 'www', 'com', 'net', 'org',
  'istanbul', 'ankara', 'izmir', 'tur', 'turkiye', 'card', 'transactions', 'the', 'and', 'gmbh', 'ref',
]);

export function features(description: string, amount: number): string[] {
  const words = normalize(description)
    .replace(/[^a-z ]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w));
  const unique = [...new Set(words)];
  // Tutar büyüklüğü: 1-2, 2-4, 4-8… şeklinde kaba aralık (ör. kira hep büyük, kahve hep küçük)
  const bucket = Math.round(Math.log2(Math.abs(amount) + 1));
  return [...unique, `#tutar${amount < 0 ? '-' : '+'}${bucket}`];
}

export interface Model {
  /** kategori → kaç örnek */
  docs: Map<string, number>;
  /** kategori → kelime → kaç kez */
  counts: Map<string, Map<string, number>>;
  /** kategori → toplam kelime sayısı */
  totals: Map<string, number>;
  vocab: Set<string>;
  n: number;
}

/** Bunlar başka sinyallerden (karttaki artı tutar, kurallar) belirlenir; tahmin edilmemeli. */
const NOT_LEARNED = new Set(['Diğer', 'Gelir', 'Kart Ödemesi']);

export function train(examples: { description: string; amount: number; category: string }[]): Model {
  const m: Model = { docs: new Map(), counts: new Map(), totals: new Map(), vocab: new Set(), n: 0 };
  for (const e of examples) {
    if (NOT_LEARNED.has(e.category)) continue;
    m.n++;
    m.docs.set(e.category, (m.docs.get(e.category) ?? 0) + 1);
    const c = m.counts.get(e.category) ?? new Map<string, number>();
    m.counts.set(e.category, c);
    for (const f of features(e.description, e.amount)) {
      c.set(f, (c.get(f) ?? 0) + 1);
      m.totals.set(e.category, (m.totals.get(e.category) ?? 0) + 1);
      m.vocab.add(f);
    }
  }
  return m;
}

// Az veriyle de öğrenebilsin diye küçük yumuşatma (1 olunca birkaç örnekte hiç emin olamıyordu)
const ALPHA = 0.1;

/** Yeterince emin değilse null döner (o zaman işlem "Diğer"de kalır). */
export function predict(m: Model, description: string, amount: number): string | null {
  if (m.n < 10) return null;
  const fs = features(description, amount);
  // Sadece tutara bakarak tahmin yapma: en az bir kelime daha önce görülmüş olmalı.
  const known = fs.filter((f) => !f.startsWith('#') && m.vocab.has(f));
  if (!known.length) return null;

  const V = m.vocab.size;
  const scores: [string, number][] = [];
  for (const [cat, d] of m.docs) {
    if (d < 2) continue;
    const c = m.counts.get(cat)!;
    const total = m.totals.get(cat)!;
    let s = Math.log(d / m.n);
    for (const f of fs) if (m.vocab.has(f)) s += Math.log(((c.get(f) ?? 0) + ALPHA) / (total + ALPHA * V));
    scores.push([cat, s]);
  }
  if (scores.length < 2) return null;
  // Olasılığa çevir (softmax) ve sadece en iyisi belirgin şekilde öndeyse kabul et
  const max = Math.max(...scores.map(([, s]) => s));
  const sum = scores.reduce((a, [, s]) => a + Math.exp(s - max), 0);
  const [best, bestScore] = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  return Math.exp(bestScore - max) / sum >= 0.7 ? best : null;
}
