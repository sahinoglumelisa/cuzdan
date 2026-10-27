import { useState } from 'react';
import { CATEGORIES, merchantKey, normalize } from '../categories';
import { db } from '../db';
import { dayLabel, money } from '../format';
import type { Transaction, ViewTransaction } from '../types';
import MonthPicker from './MonthPicker';

interface Props {
  all: ViewTransaction[];
  ym: string | null;
  setYm: (ym: string) => void;
  category: string | null;
  setCategory: (c: string | null) => void;
}

/** Kategori düzeltmesini kural olarak kaydeder ve aynı işyerinin tüm işlemlerine uygular. */
async function recategorize(t: Transaction, category: string) {
  const match = merchantKey(t.description);
  await db.transaction('rw', db.transactions, db.rules, async () => {
    if (!match) {
      await db.transactions.update(t.id!, { category });
      return;
    }
    const existing = await db.rules.where('match').equals(match).first();
    if (existing) await db.rules.update(existing.id!, { category });
    else await db.rules.add({ match, category });
    await db.transactions.filter((x) => merchantKey(x.description) === match).modify({ category });
  });
}

export default function Transactions({ all, ym, setYm, category, setCategory }: Props) {
  const [q, setQ] = useState('');
  const month = ym ?? new Date().toISOString().slice(0, 7);
  const query = normalize(q);
  const list = all.filter(
    (t) => t.date.startsWith(month) && (!category || t.category === category) && (!query || normalize(t.description).includes(query)),
  );

  return (
    <>
      <MonthPicker ym={month} setYm={setYm} />
      <div className="filters">
        <input type="search" placeholder="Ara (ör. migros)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={category ?? ''} onChange={(e) => setCategory(e.target.value || null)}>
          <option value="">Tüm kategoriler</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="muted small">Kategori yanlışsa üstüne dokunup düzelt. Aynı yerden gelen tüm işlemler (ve gelecektekiler) de düzelir.</p>
      {list.length === 0 && <p className="muted">Kayıt yok.</p>}
      <ul className="tx-list">
        {list.map((t) => (
          <li key={t.id}>
            <div className="tx-main">
              <div className="tx-desc">{t.description}</div>
              <div className="muted small">
                {dayLabel(t.date)} · {t.account}
              </div>
            </div>
            <div className="tx-side">
              <div className={`num ${t.amount > 0 ? 'positive' : ''}`}>
                {t.amount > 0 ? '+' : ''}
                {t.original !== undefined ? money(t.original, t.currency) : money(t.amount)}
              </div>
              {t.original !== undefined && <div className="muted small num">≈ {money(t.amount)}</div>}
              <select className="chip" value={t.category} onChange={(e) => recategorize(t, e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
