# 8. sınıf LGS: A/B kitapçığı ve eşleşmeyen hedefler

İlk gerçek Hız denemesinde (8. Sınıf TG Gelişim ve Değerlendirme-1) üç sorun görüldü; üçü de bu değişiklikle giderildi.

## 1. Kitapçık (A/B) — yanlışı olmayan derste "yanlış konu"

Hız karnesinde öğrencilerin yarısı A, yarısı B kitapçığıdır. Kitapçıklar aynı soru numarasında farklı cevap anahtarı ve kazanım taşır.
Eskiden yayın verisi tek anahtar (öğrenci çoğunluğu, eşitlikte ilk sayfa) tutuyordu; B kitapçığındaki doğru cevaplar A anahtarıyla
karşılaştırılıp "yanlış" görünüyordu. `withCatalogItems` de yayında kapatılan konu analizini (`outcomes_ok=false`) yeniden açıyordu.
Etkilenenler: deneme ayrıntısı, öğrenci Konular sekmesi, veli/öğretmen raporu, yapay zekâ ile yeniden yazma, tekrar eden hatalar, sınıf ısı haritası.

Şimdi:
- Anahtar ve soru-kazanım **kitapçık başına** çıkarılır; öğrenci kendi kitapçığıyla değerlendirilir.
- Soru satırlı karnelerde (Hız) her öğrencinin kazanım × D/Y/B özeti kendi sorularından `exam_results.kazanim` alanına yazılır
  (gruplu karnelerdeki mevcut biçim). Ders yalnız bütün soruları okunmuş, sonuçla tutarlı ve anahtarı kitapçığıyla uyumluysa analize girer.
- Öğrencinin kitapçığı `exam_results.source.booklets` içinde tutulur. `exam_questions` (kitapçık sütunu yok) A kitapçığıdır.
- `outcomes_ok` yükleme sırasında artık değiştirilmez.
- Sonuçlar (D/Y/B/net/puan) değişmez (CLAUDE.md §2).

## 2. Okunmayan Türkçe / Fen kazanımları

Hız PDF'inde bazı kazanım satırlarının başında görünmez U+FEFF karakteri var; okuyucu satırı `F.8.` ile başlamadığı için atlıyordu
(A kitapçığında Fen 15–20, B'de Fen 5–10 ve Türkçe'den birer soru). Okuyucu görünmez karakterleri (U+FEFF, U+200B–U+200D, U+2060)
artık yok sayar. Yeni okunan satırlarda Hız'ın çift işaret gösterimi `*` de geçerlidir: yanlış sayılır, cevap dizisinde `*` olarak durur.

Deneme Köprüsü PDF'i zaten tanınır (gömülü `deneme-koprusu.json`). Bu dosyayı üreten Deneme Köprüsü sitesi aynı okuyucuyu kullandığı
için o PDF'lerde de aynı sorular eksiktir; aynı iki satırlık düzeltme o sitede de yapılmalıdır. Orijinal yayıncı PDF'i artık eksiksiz okunur.

## 3. Eşleşmeyen hedefler ekranında 8. sınıf

Eşleşmeyen hedefler ekranı `exam_items` tablosunu okur; 8. sınıf denemeleri bu tabloya hiç yazılmıyordu. `0047_lgs_eslesmeyen_hedefler.sql`
yeni `add_lgs_unresolved_items(p_exam, p_items)` fonksiyonunu ekler. Yayından hemen sonra resmî listeyle güvenle eşleşmeyen ve PDF'te kodu/metni
olan sorular kitapçık başına yazılır (import_exam ile aynı eşleme kuralı; onaylı takma adlar kendiliğinden uygulanır). Eşle / Ekle sonrası
hedefler öğrencinin kitapçığına göre analize girer. Fonksiyon yoksa yayın yine geçerlidir (uyarı gösterilir).

12. sınıf TYT/AYT denemeleri `import_exam` ile zaten bu tabloya yazılıyor; ekranda sınav türü (TYT/AYT) olarak görünür.

## Yayına alma sırası

1. `0047` migration'ı production'a uygulanır (`supabase db push`).
2. PR `main`'e birleştirilir (Cloudflare Pages otomatik yayınlar).
3. Mevcut Hız denemesi silinip aynı PDF yeniden yüklenir. Eski kayıt eski yayın verisini taşır: yükleme koduyla B kitapçığındaki
   öğrencilerin konu analizi "okunamadı" görünür (yanlış konu gösterilmez), ama doğru analiz için yeniden yükleme gerekir.
