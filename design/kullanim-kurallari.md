LGS Atlas, 8. sınıf LGS sürecini öğretmen, öğrenci ve veli için tek bir veriden anlatan sakin, güven veren bir arayüz dilidir. Web (öğretmen paneli, Next.js) ve mobil (React Native, native bileşenler) aynı token'ları kullanır.

## İçerik ilkeleri

- Dil Türkçe. Öğretmene ve öğrenciye **sen** ("Bugün 5 öğrenciye bakmalısın", "Bu hafta 2 hedefin var"), veliye **siz** ("Talebiniz iletildi") diye hitap et.
- Her ekran bir sonraki adımla biter: "Görev ata", "Veliye yaz", "Görüşme iste". Bilgi veren ama yön göstermeyen ekran yapma.
- Etiketleyici sözcük kullanma. "Başarısız", "zayıf öğrenci" yok; "Matematik neti son üç denemede 14 → 12 → 9" gibi veriye dayalı cümle kur.
- Öğrenciyi yalnızca **kendi geçmişiyle** kıyasla. Veli ve öğrenci ekranlarında sınıf sıralaması gösterme.
- Okunamayan veriyi söyle, uydurma: "6 sorunun kazanımı okunamadı; analize girmez."
- Sayılar Türkçe biçimde: ondalık virgül (69,67), binlik nokta (4.618). Net ve puanları `numeric` / `numeric-l` stilinde yaz.
- Emoji kullanma.

## Renk

- Zemin `paper`, kartlar `surface`, ayraçlar `line`. Gölge yerine 1px `line` kenar kullan.
- `primary` tek eylem rengidir: birincil buton, aktif sekme, gelişim çizgisi. Bir ekranda en fazla bir dolu `primary` buton olsun.
- Yükseliş `primary` ve **↑**, düşüş `signal` ve **↓** ile gösterilir. Renk hiçbir zaman tek başına anlam taşımaz; ok, sözcük ya da sayı ekle. Yeşil–kırmızı çifti kullanılmaz; çift turkuaz–turuncudur ve açıklıkları da farklıdır.
- `highlight` markanın okr rengidir; öğrencinin dikkatini çekmesi gereken tek kart (ör. öz değerlendirme çağrısı), menü rozeti ve avatarlar için. Üstündeki metin `ink-fixed`.
- Web yan menüsü ve koyu özet kartları `nav` zemini, `on-nav` / `on-nav-muted` metin kullanır.
- Isı haritası dört adımlıdır: `heat-1` (%0–39) → `heat-4` (%80+). Hücrede yüzde her zaman yazılır.
- Odak halkası: 2px `primary`, 2px dış boşlukla; her zeminde en az 3:1.

## Tipografi

- Başlıklar `display` ailesi (Fraunces): web ekran başlığı `display-l`, mobil `display-m`. Başka yerde serif kullanma.
- Gövde `sans` (IBM Plex Sans): bölüm başlığı `title`, metin `body`, açıklama `body-s` + `ink-muted`, kart üst etiketi `label` BÜYÜK HARF.
- Sayılar `mono` (IBM Plex Mono): `numeric-l` özet kartları, `numeric` tablolar. Sütunlar hizalı kalsın diye net ve puan her zaman mono.
- Üç aile de Google Fonts'tan gelir ve Türkçe karakterlerin tamamını destekler. React Native'de `expo-font` ile paketle.

## Boşluk, köşe, dokunma

- Mobil kenar boşluğu `space-5`, kartlar arası `space-4`; web içerik kenarı `space-7`, bölümler arası `space-6`.
- Web kartı `radius-lg`, mobil kart `radius-xl`, buton ve giriş `radius-md`, çip `radius-pill`.
- Her tıklanabilir öğe en az `touch-min` (44px) yüksekliğindedir; mobil ana eylem `button-l`.

## Veri gösterimi

- Gelişim: çizgi grafik, `primary`, 3px çizgi, son nokta vurgulu; öğrencinin kendi ortalaması kesikli `ink-muted` çizgi.
- Ders netleri: son 5 deneme küçük sütunlar; son sütun yükselişte `primary`, düşüşte `signal`.
- Kazanım geçmişi: deneme başına bir kare. Yanlış `signal`, doğru `primary`, soru yok `line`, **okunamadı çizgili** (boş bırakılmaz, doğru/yanlış gibi gösterilmez).
- Kazanım eşleşme güveni rozetle yazılır: "Kod eşleşti", "Metin eşleşti" (`primary-soft`), "Olası eşleşme" (`surface-sunken`). Olası eşleşmeden görev ya da öneri üretilmez.

## İkonlar

- 24px ızgarada, 1.8px (aktif: 2px) çizgili, yuvarlak uçlu, dolgusuz ikonlar; renk `currentColor`. React Native'de `react-native-svg` ile aynı yollar kullanılır.
- Logo işareti: meridyen çizgili bir küre, `highlight` renkte 2px çizgi. Resmî logo dosyası henüz yok; okulun logosu gelene kadar ad düz yazıyla (Fraunces 600) yazılır.
