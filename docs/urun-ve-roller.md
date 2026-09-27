# Ürün ve roller

Amaç: Deneme → veri → analiz → öğrenciyi tanıma → müdahale (görev, görüşme, etüt) → takip → gelişim. Her deneme öğrenciyi biraz daha iyi tanımak için bir veri noktasıdır.

## Roller

| Rol | Nasıl belirlenir | Görür | Yapabilir |
| --- | --- | --- | --- |
| Yönetici (admin) | Seed ile oluşturulur; kayıtla olunamaz | Her şey | Her şey + kayıt onayı/red, kullanıcı listesi. Giriş: e-posta + şifre + **TOTP zorunlu** |
| Rehber öğretmen | Öğretmen, branş = "Rehberlik" | Her şey (onay hariç) | Tam yetki: görev, görüşme, etüt, deneme yükleme, veli/öğretmen raporu. TOTP önerilir |
| Branş öğretmeni | Öğretmen, branş ≠ Rehberlik | Yalnız **Öğrenciler** sekmesi (liste + öğrenci dosyası), kendisine gönderilen öğretmen raporları | Not ekleyebilir (görünürlük: öğretmenler). Görev ata / veli raporu / öğretmen raporu / görüşme düğmelerini **görmez** |
| Veli | Kayıtta çocuğunun adı + şubesi; admin onayda öğrenciyle eşleştirir | Yalnız bağlı çocuğunun: özet, gelişim grafiği, deneme detayı, `veli=true` görevler, kendisine gönderilen raporlar, veli/ikisi görüşmeleri, etütler, "veli görsün" notları | Görüşmeye "Katılacağım / Başka zaman" yanıtı |
| Öğrenci | Kayıtta şube + okul no; admin onayda öğrenci kaydıyla eşleştirir | Yalnız kendi: özet, görevler, kendisine gönderilen raporlar, öğrenci/ikisi görüşmeleri, etütler | Görevde ilerleme (+5 soru, tamamladım), görüşme yanıtı |

Onaylanmamış veya reddedilmiş hesap: yalnız "Kaydın onay bekliyor / onaylanmadı" ekranı.

## Kayıt

Alanlar: ad soyad, e-posta, şifre, şifre tekrar (≥ 8 karakter, eşleşmeli), rol (öğrenci / veli / öğretmen).
- Öğretmen → branş (Türkçe, Matematik, Fen Bilimleri, T.C. İnkılap Tarihi, Din Kültürü, İngilizce, Rehberlik)
- Veli → öğrencinin adı soyadı, şubesi (8/A…), yakınlık
- Öğrenci → şube, okul no
Kayıt → `status='pending'`, adminlere bildirim. Admin onayda veli/öğrenci için öğrenci kaydını seçer (isim eşleşmesi önceden seçili gelir) veya yeni öğrenci kaydı oluşturur.

## Ekranlar (prototiple birebir)

**Yönetici / Rehber menüsü:** Bugün · Öğrenciler · Denemeler · Sınıflar · (admin) Onaylar. Üstte bildirim zili.

- **Bugün:** ilgilenilmesi gereken öğrenciler (kurallar aşağıda) + filtre (Tümü/Risk/Takip/Gelişim); son deneme özeti; Görüşmeler kartı (açılır, her satırda "Değiştir"); Görevler kartı (gecikmişler listesi).
- **Öğrenciler:** şube filtresi, arama (isim/no), tablo (son net, değişim, durum). Satır → öğrenci dosyası.
- **Öğrenci dosyası:** başlıkta (yalnız tam yetkili) Görüşme planla · Veli raporu · Görev ata. 4 özet kartı. Sekmeler:
  Gelişim (toplam net grafiği; **deneme adları tıklanır → deneme detayı**) · Denemeler (her deneme için Veli raporu + Öğretmen raporu) · Konular (tekrar eden hatalar, deneme bazında kutucuk) · Görevler · Görüşmeler · Notlar · Raporlar.
- **Denemeler:** 4 adım: Yükle → Oku → Kontrol → Yayınla. Yapay zekâ isim yazım hatalarını otomatik düzeltir ("Zegnep Kaya → Zeynep Kaya"); kontrol ekranına yalnızca gerçekten karar isteyen satırlar gelir (listede olmayan isim, D+Y+B tutarsızlığı). Yayınla → sonuçlar profillere yazılır, isteğe bağlı veli/öğrenci bildirimi, veli raporu taslakları hazırlanır.
- **Sınıflar:** şube (8/A, 8/B, 8/C…) × 6 ders; konu × deneme ısı haritası (doğru oranı); "En çok zorlanılan 3 konu" — tıklanınca o konuda yanlış yapan öğrenci listesi; Etüt planla.
- **Onaylar (admin):** bekleyen kayıtlar (onayla/reddet, eşleştirme seçimi), onaylı kullanıcı listesi.

**Veli / Öğrenci menüsü:** Özet · Görevler · Raporlar · Görüşmeler.

## İş kuralları

- **Net** = D − Y/3. **Puan** okunan PDF'teki resmî puan kullanılır; yoksa gösterilmez (prototipteki formül yalnız örnek içindir).
- **Tekrar eden hata:** aynı kazanım, güvenilir eşleşmeyle (`exact`/`inferred`/`text`), ≥ 2 denemede yanlış. ≥ 3 ise "kalıcı" sayılır ve Bugün listesine girer.
- **Bugün kuralları:** son iki deneme arası toplam net ≤ −3 (en çok düşen dersin son 3 neti gösterilir) · son denemede ≥ 3 kez tekrar eden hata · son iki denemeye girmemiş · gecikmiş görev · toplam net ≥ +5 (olumlu). Kurallar okul ayarlarından değiştirilebilir olmalı.
- **Görev:** ders, konu (listeden ya da serbest metin; tekrar eden hata etiketli), soru sayısı, son gün (takvim + Yarın/Cuma/Pazartesi/1 hafta kısayolları), "Her hafta tekrarla", "Veli de görsün", not. Bir öğrenciye birden fazla görev. Görev atanınca öğrenciye (ve seçiliyse veliye) bildirim.
  - **Gecikme:** son gün geçti ve tamamlanmadı → adminlere **otomatik bildirim** (günlük zamanlanmış iş, bir kez).
  - **Haftalık tekrar:** görev bitince ya da süresi dolunca 7 gün sonrası için yeni kopya açılır, öğrenciye bildirim.
  - Öğrenci tamamlayınca görevi veren öğretmene (ve veli görüyorsa veliye) bildirim.
- **Görüşme:** kiminle (veli/öğrenci/ikisi), gün (geçmiş olamaz), saat, konu/ayrıntı. Oluşturma, değiştirme, iptal → ilgili veli ve öğrenci hesaplarına bildirim. Veli/öğrenci yanıtı → oluşturana bildirim.
- **Etüt:** yalnız **Cumartesi**, 09.00–13.00 arası **1 saatlik** dilimler (09–10, 10–11, 11–12, 12–13). Aynı şube + gün + saat çakışamaz. Konular: en zor konulardan seçilir, "+ Konu ekle" ile serbest konu. Planlanınca şubedeki öğrencilere ve velilerine bildirim.
- **Notlar:** görünürlük `ogretmen` (tüm öğretmenler), `rehber` (yalnız rehberlik + yönetim), `veli` (veli de görür, bildirim gider). Branş öğretmeni yalnız `ogretmen` seçebilir.
- **Veli raporu:** `docs/veli-raporu-kurallari.md`. Mentör ve rehber yorumu elle düzenlenir, PDF'e aynen gider. Gönder → veli ve/veya öğrenci; alıcının Raporlar sayfasında ve bildiriminde görünür. PDF indirilebilir.
- **Öğretmen raporu:** tüm denemelerdeki ders netleri, son deneme D/Y/B, tekrar eden hatalar (kazanım koduyla), görevler, öğretmen notları (rehber-gizli hariç), "Toplantı gündemi" alanı. Seçilen öğretmenlere (veya tümüne) gönderilir; PDF olarak toplantıda kullanılır. Veliye gitmez.
- **Bildirimler:** zil + okunmamış sayısı; tıklanınca ilgili sayfa/rapor açılır. (Aşama 3'te e-posta da.)
