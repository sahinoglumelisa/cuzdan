import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, saveSettings } from '../db';
import type { Settings as SettingsType } from '../types';

async function exportBackup() {
  const data = {
    version: 1,
    at: new Date().toISOString(),
    transactions: await db.transactions.toArray(),
    rules: await db.rules.toArray(),
    imports: await db.imports.toArray(),
    settings: await db.settings.toArray(),
  };
  const file = new File([JSON.stringify(data)], `cuzdan-yedek-${data.at.slice(0, 10)}.json`, { type: 'application/json' });
  // iPhone'da paylaşım menüsü açılır; "Dosyalar'a Kaydet" seçilebilir.
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importBackup(file: File | undefined) {
  if (!file) return;
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data.transactions)) return alert('Bu bir Cüzdan yedeği değil.');
  if (!confirm('Mevcut verilerin silinip yedektekiyle değiştirilsin mi?')) return;
  await db.transaction('rw', [db.transactions, db.rules, db.imports, db.settings], async () => {
    await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear()]);
    await db.transactions.bulkAdd(data.transactions.map((t: { currency?: string }) => ({ ...t, currency: t.currency ?? 'TRY' })));
    await db.rules.bulkAdd(data.rules ?? []);
    await db.imports.bulkAdd(data.imports ?? []);
    if (data.settings?.length) await db.settings.bulkPut(data.settings);
  });
  alert('Yedek geri yüklendi.');
}

async function wipe() {
  if (!confirm('Tüm işlemler, kurallar ve yükleme geçmişi silinsin mi? Bu geri alınamaz.')) return;
  await Promise.all([db.transactions.clear(), db.rules.clear(), db.imports.clear()]);
}

/** Avrupa Merkez Bankası'nın günlük kurunu çeker. Sadece kur sorulur; hiçbir kişisel veri gönderilmez. */
async function fetchRate(currency: string) {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=TRY`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).rates.TRY as number;
}

function CurrencySettings({ settings }: { settings: SettingsType }) {
  const currencies = useLiveQuery(async () => [...new Set((await db.transactions.toArray()).map((t) => t.currency))].filter((c) => c !== 'TRY'), []) ?? [];
  const [busy, setBusy] = useState(false);
  const list = [...new Set([...currencies, ...Object.keys(settings.rates)])];
  if (!list.length) return null;

  const setRate = (c: string, v: number) => saveSettings({ ...settings, rates: { ...settings.rates, [c]: v } });

  return (
    <>
      <h2>Para birimi</h2>
      <div className="card">
        <p>Özetler hangi para biriminde gösterilsin?</p>
        <div className="segmented">
          {['TRY', ...list].map((c) => (
            <button key={c} className={settings.main === c ? 'active' : ''} onClick={() => saveSettings({ ...settings, main: c })}>
              {c === 'TRY' ? 'TL' : c}
            </button>
          ))}
        </div>
        {list.map((c) => (
          <div key={c}>
            <label className="label" htmlFor={`rate-${c}`}>
              1 {c} = ? TL
            </label>
            <input
              id={`rate-${c}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              defaultValue={settings.rates[c] ?? ''}
              key={settings.rates[c]}
              onBlur={(e) => Number(e.target.value) > 0 && setRate(c, Number(e.target.value))}
            />
          </div>
        ))}
        <button
          className="link"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const rates = { ...settings.rates };
              for (const c of list) rates[c] = await fetchRate(c);
              await saveSettings({ ...settings, rates });
            } catch {
              alert('Kur alınamadı. İnternet bağlantını kontrol et ya da kuru elle gir.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Alınıyor…' : 'Güncel kuru internetten al'}
        </button>
        <p className="muted small">Tüm aylar bu tek kurla çevrilir; geçmiş aylar için yaklaşık bir karşılaştırma verir.</p>
      </div>
    </>
  );
}

export default function Settings({ settings }: { settings: SettingsType }) {
  const rules = useLiveQuery(() => db.rules.toArray(), []) ?? [];
  const imports = useLiveQuery(() => db.imports.orderBy('at').reverse().limit(10).toArray(), []) ?? [];

  return (
    <section>
      <h1>Ayarlar</h1>

      <CurrencySettings settings={settings} />

      <h2>Hatırlatıcı</h2>
      <div className="card">
        <p>Her ayın 5'inde akşam 20:00'de takviminde "ekstrelerini yükle" hatırlatması olsun.</p>
        <a className="button primary" href="hatirlatici.ics">
          Takvimime ekle
        </a>
        <p className="muted small">Açılan ekranda "Tümünü Ekle"ye dokun. Saati sonra Takvim'den değiştirebilirsin.</p>
      </div>

      <h2>Yedek</h2>
      <div className="card">
        <p>Veriler sadece bu telefonda. Uygulamayı silersen veriler de gider; arada bir yedek al.</p>
        <div className="row">
          <button onClick={exportBackup}>Yedek al</button>
          <label className="button">
            Yedekten yükle
            <input type="file" accept=".json,application/json" hidden onChange={(e) => importBackup(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {rules.length > 0 && (
        <>
          <h2>Öğrendiğim kurallar</h2>
          <ul className="items card">
            {rules.map((r) => (
              <li key={r.id}>
                <span>
                  "{r.match}" → {r.category}
                </span>
                <button className="link" onClick={() => db.rules.delete(r.id!)}>
                  Sil
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {imports.length > 0 && (
        <>
          <h2>Son yüklemeler</h2>
          <ul className="items card">
            {imports.map((i) => (
              <li key={i.id}>
                <span>
                  {i.account} · {new Date(i.at).toLocaleDateString('tr-TR')} · {i.count} işlem
                </span>
                <button
                  className="link"
                  onClick={async () => {
                    if (!confirm(`"${i.fileName}" ile gelen ${i.count} işlem silinsin mi?`)) return;
                    await db.transaction('rw', db.transactions, db.imports, async () => {
                      await db.transactions.where('importId').equals(i.id!).delete();
                      await db.imports.delete(i.id!);
                    });
                  }}
                >
                  Geri al
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Tehlikeli bölge</h2>
      <button className="danger" onClick={wipe}>
        Tüm verileri sil
      </button>
    </section>
  );
}
