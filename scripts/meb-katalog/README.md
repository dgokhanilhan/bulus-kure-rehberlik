# MEB kazanım / öğrenme çıktısı kataloğu

Geliştirme aracı. Uygulama çalışırken MEB sitesine **gitmez**; katalog repoda sürümlü veri (`supabase/katalog/meb/*.json`) ve bundan üretilen migration (`supabase/migrations/0026_meb_katalog.sql`) olarak durur.

```
npm run katalog:meb
```

1. `kaynaklar.mjs`'teki her resmî programı (mufredat.meb.gov.tr) `.cache/meb/<PID>.pdf` olarak indirir (repoya girmez).
2. SHA-256'yı beklenenle karşılaştırır. **Tutmazsa durur**: MEB programı değiştirmiş demektir. Eski kaydın üzerine yazılmaz; yeni dosya yeni bir kaynak / müfredat sürümü olarak eklenir.
3. Programın yapısına uygun çıkarıcıyla kazanımları / öğrenme çıktılarını okur (`tymm.mjs`, `eski.mjs`).
4. Doğrular. Bir doğrulama tutmazsa hiçbir şey yazılmaz:
   - **Resmî sayı tablosu:** Her sınıfta okunan sayı = programdaki tablo.
   - **Çapraz kontrol:** Programın başka sayfalarında geçen "KOD. Başlık" satırları okunan başlıkla örtüşür.
   - **Numara bütünlüğü:** Boşluk ve tekrar yok.
   - **8. sınıf eski programlar:** Mevcut katalog (326 kazanım) birebir yeniden üretilir.
5. Yazar:
   - `supabase/katalog/meb/<kaynak>.json`: sürümler, çıktılar, doğrulama sonucu;
   - `supabase/katalog/meb/manifest.json`: kaynak, URL, SHA-256, sayılar;
   - `docs/meb-katalog-raporu.md`: sınıf × ders × yıl kapsamı, "Eksik"ler, kaynak kusurları;
   - `supabase/migrations/0026_meb_katalog.sql`: deterministik kimlikler, yalnız ekleme, tekrar çalıştırılabilir.

## İlkeler

- Yalnız resmî kaynak. Kaynakta olmayan kod üretilmez. Okunamayan şey "Eksik" kalır.
- Kaynak kusurları açıkça kaydedilir; düzeltme ancak doğru biçim aynı resmî belgede geçiyorsa yapılır. Örnek: `TA.8.2.5.` → `İTA.8.2.5`; `12,2.1.` → `12.2.1`; `ENG.5.8.R 4.` → `ENG.5.8.R4`. Kodsuz basılmış bir tanım (ENG.7.5.W7) koda bağlanmaz.
- Eğitim yılı ↔ program eşlemesi `kaynaklar.mjs`'te açıkça yazılı. 8 ve 12'nin TYMM bölümleri pasif: MEB uygulama yılını duyurunca ilgili sürüm `active = true` ve `year_from` ile açılır.

## Yeni program geldiğinde

1. mufredat.meb.gov.tr'de programın PID'ini ve dosya yolunu bulun.
2. `kaynaklar.mjs`'e yeni bir kayıt ekleyin (yeni `id`, `sha256` boş bırakılırsa araç hata verip bulunan hash'i söyler). Geçerli yılları yazın; eski sürümün `to` yılını kapatın.
3. `npm run katalog:meb` → yeni bir migration numarasıyla (0026 değiştirilmez) üretilen ekleri yeni migration dosyasına taşıyın.
