import Dexie, { type Table } from 'dexie';
import { categorize } from './categories';
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

/**
 * "Diğer"de kalmış işlemleri güncel kurallarla yeniden dener (kategori listesi geliştikçe eskiler de düzelsin).
 * Kullanıcı bir işyerini bilerek "Diğer" yaptıysa kuralı önce bakıldığı için yine "Diğer" kalır.
 */
export async function recategorizeOthers() {
  await db.transaction('rw', db.transactions, db.rules, async () => {
    const rules = await db.rules.toArray();
    await db.transactions.where('category').equals('Diğer').modify((t) => {
      let c = categorize(t.description, t.amount, rules);
      if (t.kind === 'kart' && c === 'Gelir') c = 'Kart Ödemesi';
      t.category = c;
    });
  });
}

recategorizeOthers().catch(console.error);
