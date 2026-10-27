import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { dayLabel, money } from '../format';
import type { Preview } from '../import';
import type { AccountKind } from '../types';

export default function Upload({ onDone }: { onDone: (ym: string) => void }) {
  const accounts = useLiveQuery(async () => [...new Set((await db.imports.toArray()).map((i) => `${i.kind}|${i.account}`))], []) ?? [];
  const [kind, setKind] = useState<AccountKind>('kart');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      // PDF/Excel okuyucuları büyük; sadece gerektiğinde yüklensin.
      const { readFile } = await import('../import');
      const p = await readFile(file, account.trim() || (kind === 'kart' ? 'Kredi kartı' : 'Banka hesabı'), kind);
      if (p.fresh.length === 0 && p.duplicates === 0) {
        setError('Bu dosyada işlem bulamadım. Bankanın internet şubesinden "Excel olarak indir" seçeneğini dene. PDF\'lerin düzeni bankaya göre değişiyor.');
      } else {
        setPreview(p);
      }
    } catch (e) {
      console.error(e);
      setError('Dosya okunamadı. Şifreli PDF ise şifresiz halini indirmeyi dene.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    const { savePreview } = await import('../import');
    await savePreview(preview);
    const latest = preview.fresh.map((t) => t.date).sort().at(-1);
    setPreview(null);
    onDone((latest ?? new Date().toISOString()).slice(0, 7));
  }

  if (preview) {
    const spent = -preview.fresh.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    const dates = preview.fresh.map((t) => t.date).sort();
    return (
      <section>
        <h1>Kontrol et</h1>
        <div className="card">
          <p className="strong">{preview.fresh.length} yeni işlem bulundu</p>
          {dates.length > 0 && (
            <p className="muted">
              {dayLabel(dates[0])} – {dayLabel(dates.at(-1)!)} · toplam çıkış {money(spent, preview.fresh[0]?.currency)}
            </p>
          )}
          {preview.duplicates > 0 && <p className="muted">{preview.duplicates} işlem zaten kayıtlıydı, atlandı.</p>}
        </div>
        {preview.notes.map((n) => (
          <p key={n} className="error">
            {n}
          </p>
        ))}
        <ul className="tx-list">
          {preview.fresh.slice(0, 8).map((t) => (
            <li key={t.key}>
              <div className="tx-main">
                <div className="tx-desc">{t.description}</div>
                <div className="muted small">
                  {dayLabel(t.date)} · {t.category}
                </div>
              </div>
              <div className="num">{money(t.amount, t.currency)}</div>
            </li>
          ))}
        </ul>
        {preview.fresh.length > 8 && <p className="muted small">…ve {preview.fresh.length - 8} işlem daha</p>}
        <p className="muted small">Tutarlar ve tarihler doğru görünüyor mu? Görünmüyorsa iptal et; bu banka için okuyucuyu düzeltmemiz gerekir.</p>
        <div className="row">
          <button onClick={() => setPreview(null)}>İptal</button>
          <button className="primary" onClick={save} disabled={preview.fresh.length === 0}>
            Kaydet
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Ekstre yükle</h1>
      <p className="muted">Bankanın uygulamasından ya da internet şubesinden ekstreyi veya hesap hareketlerini indir, sonra buradan seç. Excel dosyaları en iyi sonucu verir.</p>

      <label className="label">Bu ne?</label>
      <div className="segmented">
        <button className={kind === 'kart' ? 'active' : ''} onClick={() => setKind('kart')}>
          Kredi kartı
        </button>
        <button className={kind === 'banka' ? 'active' : ''} onClick={() => setKind('banka')}>
          Banka hesabı
        </button>
      </div>

      <label className="label" htmlFor="account">
        Hangi kart / hesap?
      </label>
      <input id="account" list="accounts" placeholder={kind === 'kart' ? 'ör. Garanti Bonus' : 'ör. İş Bankası vadesiz'} value={account} onChange={(e) => setAccount(e.target.value)} />
      <datalist id="accounts">
        {accounts
          .filter((a) => a.startsWith(kind))
          .map((a) => (
            <option key={a} value={a.split('|')[1]} />
          ))}
      </datalist>

      <label className={`file-drop ${busy ? 'busy' : ''}`}>
        {busy ? 'Okunuyor…' : 'Dosya seç (PDF, Excel, CSV)'}
        <input type="file" accept=".pdf,.xlsx,.xls,.csv,application/pdf" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {error && <p className="error">{error}</p>}
    </section>
  );
}
