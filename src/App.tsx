import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { convert, db, getSettings } from './db';
import { setDisplayCurrency } from './format';
import type { ViewTransaction } from './types';
import Settings from './screens/Settings';
import Summary from './screens/Summary';
import Transactions from './screens/Transactions';
import Upload from './screens/Upload';

type Tab = 'ozet' | 'islemler' | 'yukle' | 'ayarlar';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ozet', label: 'Özet', icon: '◎' },
  { id: 'islemler', label: 'İşlemler', icon: '≡' },
  { id: 'yukle', label: 'Yükle', icon: '＋' },
  { id: 'ayarlar', label: 'Ayarlar', icon: '⚙' },
];

export default function App() {
  const raw = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
  const settings = useLiveQuery(getSettings, []);
  const lastImport = useLiveQuery(() => db.imports.orderBy('at').last(), []);
  const [tab, setTab] = useState<Tab>('ozet');
  const [ym, setYm] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  // Özet ve öneriler tek para biriminde çalışır: her işlemi ana para birimine çevir.
  // Kuru girilmemiş para birimindeki işlemler hesaba katılmaz ve uyarı gösterilir.
  const { all, missingRates } = useMemo(() => {
    if (!raw || !settings) return { all: undefined, missingRates: [] as string[] };
    setDisplayCurrency(settings.main);
    const missing = new Set<string>();
    const all: ViewTransaction[] = [];
    for (const t of raw) {
      const amount = convert(t.amount, t.currency, settings);
      if (amount === null) missing.add(t.currency);
      else all.push({ ...t, amount, original: t.currency === settings.main ? undefined : t.amount });
    }
    return { all, missingRates: [...missing] };
  }, [raw, settings]);

  // Varsayılan ay: verisi olan en son ay
  useEffect(() => {
    if (!ym && all?.length) setYm(all[0].date.slice(0, 7));
  }, [all, ym]);

  if (!all) return null;

  const daysSinceImport = lastImport ? Math.floor((Date.now() - new Date(lastImport.at).getTime()) / 86400000) : null;

  return (
    <div className="app">
      <main>
        {missingRates.length > 0 && tab !== 'ayarlar' && (
          <button className="banner" onClick={() => setTab('ayarlar')}>
            {missingRates.join(', ')} işlemlerin var ama kurunu girmedin, o yüzden özete katılmadılar. Kuru gir →
          </button>
        )}
        {tab === 'ozet' && (
          <Summary
            all={all}
            ym={ym}
            setYm={setYm}
            daysSinceImport={daysSinceImport}
            goUpload={() => setTab('yukle')}
            onCategory={(c) => {
              setCategory(c);
              setTab('islemler');
            }}
          />
        )}
        {tab === 'islemler' && <Transactions all={all} ym={ym} setYm={setYm} category={category} setCategory={setCategory} />}
        {tab === 'yukle' && (
          <Upload
            onDone={(month) => {
              setYm(month);
              setTab('ozet');
            }}
          />
        )}
        {tab === 'ayarlar' && <Settings settings={settings!} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
