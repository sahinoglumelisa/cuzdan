import { HABIT, NOT_SPENDING, merchantKey, normalize } from './categories';
import { money, monthName, shiftMonth } from './format';
import type { Transaction } from './types';

export interface Insight {
  id: string;
  tone: 'tasarruf' | 'uyari' | 'bilgi';
  title: string;
  /** büyük yazılacak rakam */
  amount: number;
  detail: string;
  tip?: string;
  items?: { label: string; amount: number }[];
}

const inMonth = (t: Transaction, ym: string) => t.date.startsWith(ym);
const isSpending = (t: Transaction) => !NOT_SPENDING.has(t.category);
/** Harcama toplamı: giderler artı, iadeler düşülür. */
const spend = (txs: Transaction[]) => -txs.filter(isSpending).reduce((s, t) => s + t.amount, 0);

export function monthSummary(all: Transaction[], ym: string) {
  const txs = all.filter((t) => inMonth(t, ym));
  const byCat = new Map<string, number>();
  for (const t of txs.filter(isSpending)) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
  const categories = [...byCat.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));
  const income = txs.filter((t) => t.category === 'Gelir').reduce((s, t) => s + t.amount, 0);
  return { total: spend(txs), income, categories, count: txs.length };
}

export function insights(all: Transaction[], ym: string): Insight[] {
  const out: Insight[] = [];
  const month = all.filter((t) => inMonth(t, ym));

  // 1) Düzenli ödemeler / abonelikler
  const recentMonths = [0, 1, 2, 3].map((d) => shiftMonth(ym, -d));
  const recent = all.filter((t) => t.amount < 0 && recentMonths.some((m) => inMonth(t, m)) && isSpending(t) && t.category !== 'Faturalar');
  const groups = new Map<string, Transaction[]>();
  for (const t of recent) {
    const k = merchantKey(t.description);
    if (k) groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const subs: { label: string; amount: number }[] = [];
  for (const txs of groups.values()) {
    const thisMonth = txs.filter((t) => inMonth(t, ym));
    if (!thisMonth.length) continue;
    const months = new Set(txs.map((t) => t.date.slice(0, 7)));
    const amounts = txs.map((t) => -t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const steady = amounts.every((a) => Math.abs(a - median) <= median * 0.15);
    const recurring = months.size >= 2 && steady && txs.length <= months.size * 2;
    if (recurring || thisMonth[0].category === 'Abonelik') {
      subs.push({ label: thisMonth[0].description, amount: -thisMonth.reduce((s, t) => s + t.amount, 0) });
    }
  }
  if (subs.length) {
    const total = subs.reduce((s, x) => s + x.amount, 0);
    out.push({
      id: 'abonelik',
      tone: 'tasarruf',
      title: `${subs.length} düzenli ödeme`,
      amount: total,
      detail: `Her ay kendiliğinden çekiliyor. Yılda ${money(total * 12)} ediyor.`,
      tip: 'Listeye bak: son bir ayda kullanmadığın varsa iptal et.',
      items: subs.sort((a, b) => b.amount - a.amount),
    });
  }

  // 2) Banka masrafları ve faizler
  const fees = month.filter((t) => t.category === 'Banka Masrafı' && t.amount < 0);
  if (fees.length) {
    const total = -fees.reduce((s, t) => s + t.amount, 0);
    const text = normalize(fees.map((t) => t.description).join(' ')).replace(/\s/g, '');
    const tips: string[] = [];
    if (/aidat|yillikucret|kartucreti/.test(text)) tips.push('Kart aidatı için bankayı ara ve iadesini iste, çoğu banka geri ödüyor.');
    if (/gecikme|faiz/.test(text)) tips.push('Gecikme faizi ödememek için kartı otomatik ödeme talimatına bağla.');
    if (/hesapisletim/.test(text)) tips.push('Hesap işletim ücreti almayan bir dijital hesaba geçebilirsin.');
    out.push({
      id: 'masraf',
      tone: 'uyari',
      title: 'Banka masrafları ve faizler',
      amount: total,
      detail: `${fees.length} kalem. Bu para karşılığında hiçbir şey almadın.`,
      tip: tips.join(' ') || 'Bu masrafların çoğu bankayla konuşarak ya da ürün değiştirerek kalkıyor.',
      items: fees.map((t) => ({ label: t.description, amount: -t.amount })),
    });
  }

  // 3) Küçük ama sık alışkanlıklar
  for (const cat of HABIT) {
    const txs = month.filter((t) => t.category === cat && t.amount < 0);
    if (txs.length < 6) continue;
    const total = -txs.reduce((s, t) => s + t.amount, 0);
    const target = 8; // ayda 8 kez = haftada 2
    const saving = txs.length > target ? total * (1 - target / txs.length) : 0;
    out.push({
      id: `aliskanlik-${cat}`,
      tone: 'tasarruf',
      title: `${cat}: bu ay ${txs.length} kez`,
      amount: total,
      detail: `Tanesi ortalama ${money(total / txs.length)}. Tek tek küçük görünüyor ama toplamı büyük.`,
      tip: saving > 0 ? `Haftada 2'ye indirirsen ayda yaklaşık ${money(saving)} cebinde kalır.` : undefined,
    });
  }

  // 4) Geçmiş aylara göre artan kategoriler
  const prev = [1, 2, 3].map((d) => shiftMonth(ym, -d)).filter((m) => all.some((t) => inMonth(t, m)));
  if (prev.length) {
    const now = monthSummary(all, ym);
    const avg = new Map<string, number>();
    for (const m of prev) for (const c of monthSummary(all, m).categories) avg.set(c.name, (avg.get(c.name) ?? 0) + c.amount / prev.length);
    const rises = now.categories
      .filter((c) => c.name !== 'Banka Masrafı') // zaten kendi kartı var
      .map((c) => ({ ...c, before: avg.get(c.name) ?? 0 }))
      .filter((c) => c.before > 0 && c.amount > c.before * 1.3 && c.amount - c.before > Math.max(500, now.total * 0.03))
      .sort((a, b) => b.amount - b.before - (a.amount - a.before))
      .slice(0, 2);
    for (const c of rises) {
      out.push({
        id: `artis-${c.name}`,
        tone: 'uyari',
        title: `${c.name} arttı`,
        amount: c.amount - c.before,
        detail: `${monthName(ym)} ayında ${money(c.amount)}. Önceki ${prev.length === 1 ? 'ay' : `${prev.length} ayın ortalaması`} ${money(c.before)} idi (%${Math.round((c.amount / c.before - 1) * 100)} fazla).`,
        tip: 'İşlemler sekmesinde bu kategoriye bakarak nereden geldiğini görebilirsin.',
      });
    }
  }

  // 5) Kalan taksitler
  const installments: { label: string; amount: number }[] = [];
  for (const t of month) {
    const text = normalize(t.description);
    const m = text.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!m || !/taksit|tks|tak\b/.test(text) || t.amount >= 0) continue;
    const [k, n] = [Number(m[1]), Number(m[2])];
    if (k < n && n <= 36) installments.push({ label: `${t.description} (${n - k} ay kaldı)`, amount: -t.amount * (n - k) });
  }
  if (installments.length) {
    out.push({
      id: 'taksit',
      tone: 'bilgi',
      title: 'Önümüzdeki aylara kalan taksitler',
      amount: installments.reduce((s, x) => s + x.amount, 0),
      detail: 'Bu tutar önümüzdeki ekstrelerine eklenecek. Yeni taksit açmadan önce bunu hesaba kat.',
      items: installments.sort((a, b) => b.amount - a.amount),
    });
  }

  return out;
}
