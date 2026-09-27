# Claude Code'a verilecek ilk mesaj

Bu klasörü boş bir Git deposu olarak aç, sonra aşağıdaki metni Claude Code'a yapıştır.

---

Bu depo "Buluş Küre Koleji · Rehberlik & Mentörlük" web uygulaması. Tasarım ve ürün kararları verildi; senden bunları üretim kalitesinde koda dökmeni istiyorum.

Önce şunları oku ve bana 10 maddeyi geçmeyen bir anlayış özeti ver:
1. `CLAUDE.md` (değişmez kurallar)
2. `docs/urun-ve-roller.md`, `docs/mimari-ve-guvenlik.md`, `docs/yol-haritasi.md`
3. `prototype/prototip.html` — tarayıcıda (Playwright ile) aç, demo hesaplarla admin, rehber, matematik öğretmeni, veli ve öğrenci olarak gez. Uygulama bu prototipin ekranlarını, akışlarını ve yetkilerini birebir karşılayacak.
4. `supabase/migrations/0001_init.sql` ve `legacy/deneme-koprusu/`

Sonra **yalnızca Aşama 1'i** yap (`docs/yol-haritasi.md`):
- Vite + React + TypeScript projesi, Tailwind, token'lardan CSS değişkenleri
- Supabase yerel kurulum, migration, RLS, seed (prototipteki örnek veriler)
- Giriş / kayıt ol / onay bekliyor ekranları, admin için TOTP (Supabase MFA)
- Admin "Onaylar" sayfası
- Rol bazlı menü ve yönlendirme (branş öğretmeni yalnız Öğrenciler; veli/öğrenci yalnız kendi sayfaları)
- RLS için otomatik testler: her rol, başka rolün verisini okuyamadığını kanıtlayan testler

Kurallar:
- Her adımda ne yaptığını kısa yaz; bir kararı değiştirmen gerekirse önce bana sor.
- Gizli anahtar, şifre veya gerçek öğrenci verisi repoya girmesin. `.env.example` kullan.
- Aşama 1'in "bitti şartı" sağlanınca dur, bana test sonuçlarını ve ekran görüntülerini göster; onay vermeden Aşama 2'ye geçme.
