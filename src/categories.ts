import type { Rule } from './types';

/** Harcama toplamına dahil edilmeyen kategoriler (aynı parayı iki kez saymamak için). */
export const NOT_SPENDING = new Set(['Transfer', 'Kart Ödemesi', 'Gelir']);

/** Küçük ama sık tekrarlanan, "alışkanlık" türü harcamalar. */
export const HABIT = new Set(['Yemek Siparişi', 'Hızlı Teslimat', 'Kafe & Tatlı']);

/** Türkçe karakterleri sadeleştirir, küçük harfe çevirir, fazla boşlukları atar. */
export function normalize(s: string) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Açıklamadan işyeri anahtarı: rakam ve işaretler atılmış ilk 2 kelime. Kullanıcı kuralları bunu kullanır. */
export function merchantKey(description: string) {
  return normalize(description)
    .replace(/[^a-z ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(' ');
}

// Sıra önemli: ilk eşleşen kazanır (ör. "getir yemek" "getir"den, "eft ucret" "eft"ten önce gelmeli).
// Kısa kelimeler kelime ortasında eşleşmesin diye boşlukla yazıldı (ör. ' bim ').
const DEFAULTS: [string, string[]][] = [
  ['Kart Ödemesi', ['kredi karti odeme', 'kart borcu odeme', 'kart borc odeme', 'kk odeme', 'otomatik odeme talimati', 'odemeniz icin tesekkur']],
  ['Banka Masrafı', ['kart aidat', 'yillik ucret', 'kart ucreti', 'hesap isletim', 'gecikme', 'nakit avans faiz', 'faiz', 'bsmv', 'kkdf', 'eft ucret', 'havale ucret', 'fast ucret', 'masraf', 'komisyon']],
  ['Kira', [' rent ', 'miete', ' kira ']],
  ['Yemek Siparişi', ['yemeksepeti', 'yemek sepeti', 'trendyol yemek', 'getir yemek', 'getiryemek', 'migros yemek']],
  ['Hızlı Teslimat', ['getir', 'istegelsin', 'banabi', 'migros hemen']],
  ['Market', ['migros', 'carrefour', 'a101', ' bim ', 'sok market', 'file market', 'macrocenter', 'metro gross', 'onur market', 'hakmar', 'gida', ' rewe ', 'edeka', ' aldi ', ' lidl ', ' penny ', ' netto ', 'kaufland']],
  ['Kafe & Tatlı', ['starbucks', 'kahve dunyasi', 'espressolab', 'caribou', 'mado', 'simit sarayi', 'coffee', 'kahve', 'cafe', 'kafe', 'gloria jean', 'gelato', 'dondurma', 'cikolata', 'pastane', 'patisserie', 'tatli']],
  ['Restoran', ['restoran', 'restaurant', 'lokanta', 'kebap', 'burger', 'pizza', 'mcdonald', 'dominos', 'little caesars', ' kfc ', 'popeyes', 'doner', 'sushi', 'taco', 'meyhane', 'kofte', 'studierendenwerk', 'mensa']],
  ['Kişisel Bakım', ['gratis', 'watsons', 'rossmann', 'sephora', 'flormar', 'kuafor', 'berber', 'dm drogerie', 'mueller drog']],
  ['Abonelik', ['netflix', 'spotify', 'youtube', 'apple.com', 'icloud', 'disney', 'exxen', 'blutv', 'amazon prime', 'prime video', ' gain ', 'tabii', ' tod ', 'chatgpt', 'openai', 'claude.ai', 'anthropic', 'google one', 'google storage', 'linkedin', 'duolingo', 'storytel', 'audible']],
  ['Faturalar', ['turkcell', 'vodafone', 'turk telekom', 'turknet', 'superonline', 'enerjisa', 'ck enerji', 'igdas', ' iski ', ' aski ', 'izsu', 'dogalgaz', 'elektrik', 'su idaresi', 'fatura', 'eplus', ' o2 ', 'telekom', 'stadtwerke', 'rundfunk']],
  ['Ulaşım', ['istanbulkart', 'uber', 'bitaksi', ' taksi ',' marti ', 'opet', 'shell', 'petrol ofisi', ' bp ', 'totalenergies', 'aytemiz', 'akaryakit', 'otopark', ' hgs ', ' ogs ', 'pegasus', 'turk hava', ' thy ', ' ajet ', 'sunexpress', 'obilet', 'db vertrieb', 'deutsche bahn', ' mvg ', ' mvv ', 'flixbus', ' bolt ']],
  ['Online Alışveriş', ['trendyol', 'hepsiburada', 'amazon', ' n11 ', ' temu ', 'aliexpress', 'shein', 'ciceksepeti', 'pazarama']],
  ['Giyim', [' zara ', ' lcw ', 'lc waikiki', ' h&m ', 'koton', 'defacto', ' mavi ', 'bershka', 'pull&bear', 'stradivarius', 'hm.com', 'massimo dutti', 'boyner', 'vakko', ' nike ', 'adidas']],
  ['Sağlık', ['eczane', 'hastane', 'klinik', 'acibadem', 'medical park', 'memorial', 'florence', 'dis hekimi']],
  ['Spor', ['macfit', ' gym ', 'fitness', 'pilates', ' yoga ', 'decathlon', 'tirmani', 'boulder', 'climb', 'orienteering', 'oryantiring', ' zhs ']],
  ['Eğlence', ['sinema', 'cinemaximum', 'cineverse', 'biletix', 'passo', 'biletinial', 'steam', 'playstation', ' xbox ', 'epic games']],
  ['Nakit', [' atm ', 'nakit cekim', 'para cekme']],
  ['Gelir', ['maas', 'salary', 'expatrio']],
  ['Transfer', ['virman', 'hesaplar arasi', ' eft ', 'havale', ' fast ', 'para transferi', ' iban ', 'internal transfer', 'incoming transfer']],
];

export const CATEGORIES = [...DEFAULTS.map(([c]) => c), 'Diğer'];

export function categorize(description: string, amount: number, userRules: Rule[]): string {
  // Başa/sona boşluk: ' bim ' gibi kalıplar satır başı/sonunda da eşleşsin.
  const text = ` ${normalize(description).replace(/[*/\\,;:]/g, ' ')} `;
  // Bazı bankalar açıklamayı boşluksuz yazar ("KREDİKARTIYILLIKÜCRETİ"); çok kelimeli kalıplar bu haliyle de aransın.
  const flat = text.replace(/\s/g, '');
  const hit = (w: string) => text.includes(w) || (w === w.trim() && w.includes(' ') && flat.includes(w.replace(/\s/g, '')));
  const key = merchantKey(description);
  // Önce kullanıcının kendi düzeltmeleri
  const own = userRules.find((r) => r.match === key);
  if (own) return own.category;
  for (const [category, words] of DEFAULTS) {
    if (category === 'Gelir' && amount < 0) continue;
    if (words.some(hit)) return category;
  }
  return amount > 0 ? 'Gelir' : 'Diğer';
}
