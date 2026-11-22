import Dexie, { type Table } from 'dexie';
import { categorize, merchantKey } from './categories';
import { predict, train, type Model } from './learn';
import type { ImportRecord, Rule, Settings, Transaction } from './types';

class CuzdanDB extends Dexie {
  transactions!: Table<Transaction, number>;
  rules!: Table<Rule, number>;
  imports!: Table<ImportRecord, number>;
  settings!: Table<Settings & { key: string }, string>;

  constructor() {
    super('cuzdan');
    this.version(1).stores({
      transactions: '++id, &key, date, category, account, importId',
      rules: '++id, &match',
      imports: '++id, at',
    });
    this.version(2)
      .stores({ settings: '&key' })
      .upgrade((tx) => tx.table('transactions').toCollection().modify((t) => (t.currency ??= 'TRY')));
  }
}

export const db = new CuzdanDB();

export const DEFAULT_SETTINGS: Settings = { main: 'TRY', rates: {} };

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}

export const saveSettings = (s: Settings) => db.settings.put({ ...s, key: 'app' });

/** Tutarı ana para birimine çevirir; kur yoksa null. */
export function convert(amount: number, from: string, s: Settings): number | null {
  if (from === s.main) return amount;
  const toTry = from === 'TRY' ? 1 : s.rates[from];
  const mainToTry = s.main === 'TRY' ? 1 : s.rates[s.main];
  if (!toTry || !mainToTry) return null;
  return (amount * toTry) / mainToTry;
}

// iOS'un depolamayı kendiliğinden silmemesi için kalıcı depolama iste.
navigator.storage?.persist?.().catch(() => {});

/** Modelin öğreneceği örnekler: tahmin edilmiş olanlar hariç (yanlış tahmin kendini pekiştirmesin). */
export async function learnModel(): Promise<Model> {
  return train(await db.transactions.filter((t) => !t.guessed).toArray());
}

/** Kelime listesi yoksa öğrenilen modelden tahmin dener. */
export function classify(t: Pick<Transaction, 'description' | 'amount' | 'kind'>, rules: Rule[], model: Model, text = t.description) {
  let category = categorize(text, t.amount, rules);
  let guessed = false;
  if (category === 'Diğer' && !rules.some((r) => r.match === merchantKey(t.description))) {
    const p = predict(model, t.description, t.amount);
    if (p) [category, guessed] = [p, true];
  }
  // Kartta artı tutar = karta yapılan ödeme ya da iade; gelir değil.
  if (t.kind === 'kart' && category === 'Gelir') category = 'Kart Ödemesi';
  return { category, guessed };
}

/**
 * "Diğer"de kalmış ve tahmin edilmiş işlemleri güncel kurallar ve modelle yeniden dener.
 * Kullanıcı bir işyerini bilerek "Diğer" yaptıysa kuralı olduğu için yine "Diğer" kalır.
 */
export async function recategorizeOthers() {
  await db.transaction('rw', db.transactions, db.rules, async () => {
    const [rules, model] = await Promise.all([db.rules.toArray(), learnModel()]);
    await db.transactions
      .filter((t) => t.category === 'Diğer' || !!t.guessed)
      .modify((t) => {
        const r = classify(t, rules, model);
        t.category = r.category;
        if (r.guessed) t.guessed = true;
        else delete t.guessed;
      });
  });
}

recategorizeOthers().catch(console.error);
