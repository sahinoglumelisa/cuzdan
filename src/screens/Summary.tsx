import { useState } from 'react';
import { money, monthName, shiftMonth } from '../format';
import { insights, monthSummary, type Insight } from '../insights';
import type { ViewTransaction as Transaction } from '../types';
import MonthPicker from './MonthPicker';

interface Props {
  all: Transaction[];
  ym: string | null;
  setYm: (ym: string) => void;
  daysSinceImport: number | null;
  goUpload: () => void;
  onCategory: (c: string) => void;
}

export default function Summary({ all, ym, setYm, daysSinceImport, goUpload, onCategory }: Props) {
  if (!ym || !all.length) {
    return (
      <section className="empty">
        <h1>Hoş geldin 👋</h1>
        <p>Ay sonunda kredi kartı ekstreni ve banka hesap dökümünü yükle. Gerisini ben hallederim: nereye ne harcadığını ve nerede tasarruf edebileceğini gösteririm.</p>
        <p className="muted">Her şey sadece bu telefonda kalır, hiçbir yere gönderilmez.</p>
        <button className="primary" onClick={goUpload}>
          İlk ekstreni yükle
        </button>
      </section>
    );
  }

  const now = monthSummary(all, ym);
  const prev = monthSummary(all, shiftMonth(ym, -1));
  const tips = insights(all, ym);
  const change = prev.total > 0 ? Math.round((now.total / prev.total - 1) * 100) : null;
  const max = now.categories[0]?.amount ?? 1;

  return (
    <>
      {daysSinceImport !== null && daysSinceImport > 35 && (
        <button className="banner" onClick={goUpload}>
          Son yüklemenin üzerinden {daysSinceImport} gün geçti. Yeni ekstrelerini yükle →
        </button>
      )}

      <MonthPicker ym={ym} setYm={setYm} />

      <section className="hero">
        <div className="muted">{monthName(ym)} ayında harcadığın</div>
        <div className="hero-number">{money(now.total)}</div>
        {change !== null && (
          <div className={change > 0 ? 'delta up' : 'delta down'}>
            {change > 0 ? '▲' : '▼'} Geçen aya göre %{Math.abs(change)} {change > 0 ? 'fazla' : 'az'}
          </div>
        )}
        {now.income > 0 && <div className="muted small">Gelen para: {money(now.income)}</div>}
      </section>

      {tips.length > 0 && (
        <section>
          <h2>Öneriler</h2>
          {tips.map((t) => (
            <InsightCard key={t.id} insight={t} />
          ))}
        </section>
      )}

      <section>
        <h2>Nereye gitti?</h2>
        {now.categories.length === 0 && <p className="muted">Bu ay için kayıt yok.</p>}
        <ul className="bars">
          {now.categories.map((c) => (
            <li key={c.name}>
              <button onClick={() => onCategory(c.name)}>
                <div className="bar-head">
                  <span>{c.name}</span>
                  <span className="num">
                    {money(c.amount)} <span className="muted">%{Math.round((c.amount / now.total) * 100)}</span>
                  </span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(c.amount / max) * 100}%` }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function InsightCard({ insight: t }: { insight: Insight }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`card tone-${t.tone}`}>
      <div className="card-head">
        <span className="card-title">
          <span className="tone-icon" aria-hidden>
            {t.tone === 'uyari' ? '!' : t.tone === 'tasarruf' ? '₺' : 'i'}
          </span>
          {t.title}
        </span>
        <span className="num strong">{money(t.amount)}</span>
      </div>
      <p>{t.detail}</p>
      {t.tip && <p className="tip">{t.tip}</p>}
      {t.items && (
        <>
          <button className="link" onClick={() => setOpen(!open)}>
            {open ? 'Gizle' : `Hepsini gör (${t.items.length})`}
          </button>
          {open && (
            <ul className="items">
              {t.items.map((i, n) => (
                <li key={n}>
                  <span>{i.label}</span>
                  <span className="num">{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  );
}
