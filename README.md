# Cüzdan

Basit bir kişisel finans takip uygulaması. Ay sonunda kredi kartı ekstrelerini ve banka hesap dökümlerini yüklersin; uygulama harcamaları kategorilere ayırır, aylık özet çıkarır ve nerede tasarruf edebileceğini söyler (abonelikler, banka masrafları, sık yapılan küçük harcamalar, artan kategoriler, kalan taksitler).

**Veriler yalnızca cihazda kalır.** Sunucu yok, hesap yok. Ekstreler tarayıcının içinde okunur ve cihazdaki yerel veritabanına (IndexedDB) kaydedilir. Uygulamanın internete tek bağlantısı, Ayarlar'da istenirse döviz kurunu almak içindir.

## Desteklenen dosyalar

| Banka | Dosya |
|---|---|
| İş Bankası (Maximiles kredi kartı) | PDF ekstre |
| İş Bankası (vadesiz hesap) | Excel hesap hareketleri |
| UniCredit / Aion Bank | PDF hesap dökümü (EUR) |

Diğer bankaların Excel/CSV dosyaları genelde de okunur (başlık satırında "tarih" ve "tutar" ya da "borç/alacak" sütunları olması yeterli). PDF düzeni bankaya göre değiştiği için yeni bir banka okuyucusu `src/import/lines.ts` dosyasına eklenir.

## Kullanım

iPhone'da Safari ile siteyi aç → Paylaş → **Ana Ekrana Ekle**. Uygulama çevrimdışı da çalışır.

## Geliştirme

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:telefon  # aynı Wi-Fi'deki telefondan denemek için (ağa açar)
npm run deploy       # derler ve GitHub Pages'e (gh-pages dalı) yükler
```

React + TypeScript + Vite, Dexie (IndexedDB), pdf.js, SheetJS.
