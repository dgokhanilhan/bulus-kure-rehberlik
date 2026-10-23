# Yedekten dönüş

Günlük yerel yedek: `scripts/yerel-yedek.ps1`, Windows Görev Zamanlayıcı'da **BulusKure Gunluk Yedek** (her gün 17.00; bilgisayar
kapalıysa ilk açılışta). Yedekler `Belgeler\BulusKure-Yedek\yedek-YYYY-MM-DD_SSDD.zip`, 30 gün tutulur; sonuçlar `yedek.log`'da.

Her zip üç dosya içerir: `roller.sql`, `sema.sql`, `veri.sql` (public + auth + storage kayıtları). Fotoğraf, PDF ve ekler
`Belgeler\BulusKure-Yedek\dosyalar\<kova>\…` klasöründe güncel tutulur (her gün indirilir; sistemden silinen dosya burada kalır).

## Yeni bir Supabase projesine geri yükleme

1. Supabase'de yeni proje aç (Frankfurt). Bağlantı adresini al: **Connect → Session pooler**.
2. Zip'i boş bir klasöre aç, sonra sırayla (psql 17; Docker ile `public.ecr.aws/supabase/postgres` imajındaki psql de olur):

   ```
   psql "<bağlantı adresi>" -f roller.sql
   psql "<bağlantı adresi>" -f sema.sql
   psql "<bağlantı adresi>" -c "SET session_replication_role = replica" -f veri.sql
   ```

3. Dosyaları geri yükle: `dosyalar` klasöründe, her kova için (önce Supabase'de aynı adla kova aç: `ekler`, `galeri`, `okul`)
   `npx supabase storage cp -r <kova> ss:/// --experimental --linked` (bu proje klasöründen, yeni projeye `supabase link` ile bağlıyken).
4. Edge Function'ları ve secret'ları yeniden yükle (`supabase functions deploy`, `supabase secrets set …`), ön yüzün
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` değerlerini yeni projeye çevir.

Doğrulama (23.10.2026): yedek boş bir Postgres 17'ye yüklendi; öğrenci, deneme, sonuç ve profil sayıları production ile aynı.
Dosyalar: 82 dosya (ekler 17, galeri 58, okul 7), depodaki sayılarla aynı.
`auth` tabloları yalnız Supabase projesinde vardır (boş Postgres'te yüklenmez); yedekte hesap sayısı production ile aynı.
