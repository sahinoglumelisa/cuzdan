export type AccountKind = 'banka' | 'kart';

export interface Transaction {
  id?: number;
  /** tarih + açıklama + tutar + hesaptan türetilir; aynı işlemi iki kez kaydetmemek için */
  key: string;
  date: string; // YYYY-MM-DD
  description: string;
  /** negatif = gider, pozitif = gelir / iade / karta ödeme */
  amount: number;
  /** "TRY", "EUR"… — tutarın para birimi */
  currency: string;
  account: string;
  kind: AccountKind;
  category: string;
  importId: number;
}

/** Ekranda kullanılan hali: amount ana para birimine çevrilmiştir. */
export interface ViewTransaction extends Transaction {
  /** Ana para biriminden farklıysa, işlemin kendi para birimindeki tutarı */
  original?: number;
}

export interface Rule {
  id?: number;
  /** normalize edilmiş işyeri anahtarı (bkz. merchantKey()) */
  match: string;
  category: string;
}

export interface ImportRecord {
  id?: number;
  at: string; // ISO
  fileName: string;
  account: string;
  kind: AccountKind;
  count: number;
}

/** İçe aktarıcıların döndürdüğü ham satır */
export interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  /** Ekstrede açıkça alacak olarak işaretlenmiş ("+" ile yazılmış) */
  credit?: boolean;
  /** Bankanın işlem tipi (ör. "Para Çekme", "Direct debit"); kaydedilmez, sadece kategori bulmaya yardım eder */
  hint?: string;
  currency?: string;
}

export interface Settings {
  /** Özetlerin gösterildiği para birimi */
  main: string;
  /** 1 EUR = rates.EUR TL gibi; hepsi TL karşılığı */
  rates: Record<string, number>;
}
