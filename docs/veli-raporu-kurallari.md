# "Veli için çıktı" raporu — analiz ve yazım kuralları

Kaynak: okulun kendi şartnamesi. Bu kurallar hem yapay zekâ istemine (`ai-veli-raporu`) hem de yapay zekâ çalışmadığında devreye giren kural tabanlı taslağa uygulanır.

## Regresyon kilidi
Bu geliştirme D/Y/B, net, puan, öğrenci eşleştirme, deneme kayıtları ve kazanım eşleştirmesini **değiştirmez**. Yalnız rapor metni üretir.

## 1. Amaç
Rapor şu sorulara cevap verir: Öğrenci şu an nerede? Önceki denemelere göre nasıl ilerliyor? Hangi derslerde güçlü, hangilerinde desteğe ihtiyacı var? Hatalar belirli kazanımlarda tekrar ediyor mu? Sorun genel mi, birkaç kazanımda mı? Bir sonraki denemeye kadar ne yapmalı? Mentör neyi takip edecek? Veli ne anlamalı?
Akış: **sonuç → veri → analiz → neden → öneri → takip.** Yalnız puan yorumlayan bir metin değildir.

## 2. Kullanılacak veri
Deneme adı ve tarihi, puan, toplam net; ders bazında D/Y/B/net; önceki denemeler ve ders netleri; net/puan değişimleri; **yalnız güvenilir** kazanım eşleşmeleri; yanlış ve boş sorular; farklı denemelerde tekrar eden kazanım hataları; genel gelişim eğrisi. **Veri uydurulmaz.** Okunamayan/emin olunmayan kazanım kesin eksik gibi gösterilmez.

## 3. Öğrenci kendisiyle kıyaslanır
Başka öğrencilerle, sınıf seviyesiyle kıyas yok. Tek sınavdan kesin hüküm yok. Deneme sonucu öğrencinin kimliği değildir.
- Yanlış: "Türkçesi kötü." → Doğru: "Türkçe genel performansı korunuyor ancak paragraf sorularında tekrarlayan hatalar görülüyor."

## 4. Dil
Bir öğretmenin öğrencisini tanıyarak veliye yaptığı açıklama: doğal, akıcı, sıcak, profesyonel, anlaşılır, yargılamayan. Mekanik ifade yok.
- Yanlış: "performans metriklerinde negatif yönlü değişim tespit edilmiştir." → Doğru: "Matematikte bu denemede bir miktar gerileme görüyoruz. Özellikle yanlış sayısındaki artış neti aşağı çekmiş."

## 5. Tek tip cümle yok
Her rapora aynı girişle başlanmaz; giriş ve kapanış cümleleri öğrencinin durumuna göre çeşitlenir ("Bu denemede genel tabloya baktığımızda…", "Son denemelerle birlikte değerlendirdiğimizde…", "Genel performans korunurken…" vb.).

## 6. Akış
A. Genel durum (geçmişle ilişkisiyle) · B. Güçlü yönler (mutlaka) · C. Geliştirilecek alanlar (somut; kazanım bilgisi yoksa yalnız ders verisi + "yanlış sorular öğrenciyle birlikte incelensin").

## 7. Kazanım analizi
Öncelik: CODE_EXACT → güvenilir CODE_INFERRED → güvenilir TEXT_EXACT / TEXT_MATCH. SEMANTIC_MATCH ve belirsiz eşleşmeler veliye kesin bilgi olarak aktarılmaz. Veliye kazanım **kodu** ve teknik terim gösterilmez; konu adıyla anlatılır.

## 8. Tekrar eden yanlış > tek seferlik yanlış
Üç denemede aynı kazanım: "Bu konu artık tek bir sınava özgü bir hata gibi görünmüyor…" Tek soru: "tek sorudan hareketle doğrudan konu eksiği demek doğru olmaz; takip etmek daha sağlıklı olacaktır."

## 9. Boş sorular
Boş = otomatik konu eksiği değildir (süre, dikkat, anlama, strateji olabilir). "Bunun konu bilgisinden mi süre yönetiminden mi kaynaklandığını öğrenciyle birlikte değerlendirmek faydalı olacaktır."

## 10. Seviyeye göre
- Yüksek: "daha çok çalışmalı" yok; hata azaltma, dikkat, süre, soru kontrolü, küçük eksikler.
- Orta: yükselen dersleri koruma, belirgin eksiklere odak, ulaşılabilir artışlar.
- Düşük: moral bozucu dil yok; birkaç temel ve ulaşılabilir hedef.

## 11. Öneriler somut ve veriye bağlı (3–5 adet)
"Daha çok çalışmalı / bol soru çözmeli / dikkatli olmalı" yok. Örnek: "Üslü ifadeler ve kareköklü ifadelerle ilgili yanlış sorular tekrar çözülmeli; ardından kısa bir tarama testi uygulanabilir."

## 12. Geçmiş denemeler
Son değişim, son 3 deneme, sürekli yükselen/düşen/dalgalı dersler, tekrar eden kazanımlar. Sayı gerekirse kullanılır (ör. "11,33 → 13,00 → 14,67") ve ardından insan diliyle yorumlanır; rakam bombardımanı yok.

## 13. Aynı dersi parça parça tekrarlama yok
Bir dersle ilgili düşüş, yanlış sayısı ve kazanım bilgisi tek doğal paragrafta birleşir.

## 14. Mentör yorumu
Ayrı alan, elle düzenlenir, PDF'e **aynen** gider. Sistem başlangıç önerisi verebilir; öğretmen değiştirir. Konular: çalışma düzeni, takip, hedefler, deneme stratejisi, haftalık çalışma, dikkat/süre.

## 15. Rehber öğretmen yorumu
Ayrı alan, elle düzenlenir, PDF'e aynen gider. Kaygı, motivasyon, çalışma alışkanlığı, planlama… **Öğretmen gözlemi yoksa psikolojik çıkarım yapılmaz.** Boşsa PDF'te bölüm görünmez.

## 16. Yasak ifadeler
Öğrenciyi etiketleyen: başarısız, yetersiz, tembel, çok kötü, seviyesi düşük, başarısı zayıf, bu konuyu bilmiyor, kesinlikle dikkat hatası, kesinlikle süre problemi.
Teknik: OCR, parser, confidence, CODE_EXACT, CODE_INFERRED, TEXT_MATCH, SEMANTIC_MATCH, UNRESOLVED, JSON, database error, template. (Sunucu tarafı filtre bunları yakalar; yakalarsa metin reddedilir ve yeniden üretilir ya da kural tabanlı taslağa dönülür.)

## 17. Doğal cümle örnekleri
"Bu denemede özellikle Fen Bilimleri tarafında güzel bir ilerleme görüyoruz." · "Burada büyük bir konu eksiğinden çok birkaç yanlışın neti etkilediği bir tablo var." · "Önümüzdeki süreçte amacımız bütün derslerde bir anda büyük artış sağlamak değil, öncelikli birkaç alanı toparlayarak istikrarlı biçimde ilerlemek olacak."

## 18. PDF yapısı
Öğrenci Bilgileri (ad soyad, deneme, tarih, puan, toplam net) → Ders Performansı (Türkçe, Matematik, Fen Bilimleri, T.C. İnkılap Tarihi ve Atatürkçülük, Din Kültürü ve Ahlak Bilgisi, İngilizce; D/Y/B/Net) → Genel Değerlendirme (1–2 paragraf) → Güçlü Yönler → Üzerinde Çalışılması Gereken Alanlar → Çalışma Önerileri → Mentör Yorumu → Rehber Öğretmen Yorumu.

## 19. Uzunluk
Genel değerlendirme ~100–180 kelime; 3–5 öneri; veri azsa kısa, çoksa tekrarsız.

## 20. Son kural
Amaç yargılamak değil; mevcut durumu anlamak, gelişimi görmek, tekrar eden sorunları belirlemek ve sonraki adımı veliye anlaşılır biçimde anlatmak. "Bu öğrenci neden bu sonucu aldı ve bir sonraki adımda ne yaparsak ilerleme sağlayabiliriz?"

## Kabul testi (zorunlu)
Şu öğrenci tiplerinin her biri için rapor üret ve birbirinden gerçekten farklı olduğunu doğrula (aynı şablonun isim/sayı değişmiş hâli olmamalı): çok yüksek netli · orta · düşük · neti yükselen · neti düşen · aynı kazanımı tekrar tekrar yanlış yapan · kazanım verisi eksik. Seed verisindeki örnek öğrenciler bu tiplerin hepsini içerir (prototipteki Deniz, Ece, Ali, Mert, Elif, Kerem, Can).

## İstek biçimi (öneri)
Model: `deepseek-flash`, `response_format: json_object`, sıcaklık 0.7. Kullanıcı mesajı = bu kuralların özeti + anonim veri JSON'u. Beklenen çıktı:
```json
{"genel":"…","guclu":"…","gelisim":"…","oneriler":["…","…","…"],"mentorOneri":"…"}
```
