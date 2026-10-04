# Yayın sonrası "sonsuz açılış ekranı": neden oluyordu, ne değişti

## Belirti

Yayından sonra site açılış ekranında (dönen küre) kalıyor. Tarayıcı `index.html`'in istediği `/assets/index-XXXX.js` dosyasını istiyor, ama yanıt `200 · text/html` (yani yine index.html) geliyor. `X-Content-Type-Options: nosniff` yüzünden tarayıcı bunu çalıştırmıyor, React hiç başlamıyor. Önbellek temizlenince düzeliyordu.

## Kök neden (canlıda doğrulandı)

1. **Cloudflare Pages SPA davranışı:** Projede üst düzey `404.html` olmadığı için Pages bulunamayan her yola index.html'i **200** ile döndürüyor (`public/_redirects` içindeki `/* /index.html 200` da aynı şeyi yapıyor). Var olmayan bir `/assets/...js` isteği de buna dahil.
2. **Asset önbellek kuralı:** `_headers` içinde `/assets/*` için `Cache-Control: public, max-age=31536000, immutable` vardı. Bu kural URL'ye göre uygulanıyor, içeriğe bakmıyor. Bu yüzden eksik asset için dönen index.html de **bir yıllık, değişmez** olarak işaretleniyordu.
3. Canlıda var olmayan bir dosya istendiğinde: `HTTP 200`, `content-type: text/html`, `cache-control: public, max-age=31536000, immutable`, `cf-cache-status: MISS`. Yani yanıt Cloudflare kenar önbelleğine de giriyor.

Yayın sırasında yeni index.html bir kullanıcıya ulaşıp ilgili JS dosyası o kenar sunucusunda henüz hazır değilse, o tek istek HTML'i JS adresine bir yıllığına "kilitliyor". O kenar sunucusundan siteye giren herkes açılış ekranında kalıyordu; düzeltmek için önbellek temizliği gerekiyordu.

## Ne değişti

| | Önce | Sonra |
|---|---|---|
| `/`, `/index.html` | Pages varsayılanı (`max-age=0, must-revalidate`) | `no-cache, no-store, must-revalidate` |
| `/assets/*` | `public, max-age=31536000, immutable` | `public, max-age=0, must-revalidate` (ETag ile 304; değişmeyen dosya yeniden inmez) |
| `/engine/*` | `public, max-age=86400` (adı sabit dosyalar yayından sonra bir gün eski kalabiliyordu) | `public, max-age=0, must-revalidate` |
| `/boot-check.js` | yok | `no-cache, must-revalidate` |
| Güvenlik başlıkları (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP) | | **Aynen korundu** (`/*` kuralı değişmedi) |

- **Açılış bekçisi (`public/boot-check.js`):** Ana paket yüklenemezse dosyaları önbelleği atlayarak yeniden indirir, konsola hangi dosyanın JS yerine ne döndüğünü yazar ve sayfayı **bir kez** yeniler. Yine olmazsa "Yeniden dene" düğmeli bir mesaj gösterir; sonsuz döngüye girmez. Yeni yayından sonra açık sekmede eski bir sayfa parçası bulunamazsa (`vite:preloadError`) da bir kez yenilenir.
- **Derleme bütünlük kontrolü (`deploy/dist-kontrol.ts`):** Her `vite build` sonunda (`npm run build`, `deploy:prod`, `deploy:staging`, Cloudflare Pages derlemesi) çalışır. Şunları doğrular:
  - `index.html`'in istediği her betik, modulepreload ve stil dosyası `dist`'te var;
  - parçaların içe aktardığı her parça var;
  - `dist/_headers` var ve güvenlik başlıklarını içeriyor;
  - HTML `no-store`;
  - asset'lerde uzun önbellek yok.

  Sorun varsa derleme düşer ve yayın çıkmaz. CI'ya da `npm run build` eklendi.
- Service worker yok; eklenmedi. `_redirects` (SPA yönlendirmesi) değişmedi.

## Uzun asset önbelleğine geri dönmek istenirse

Önce eksik asset'in index.html değil **404** dönmesi sağlanmalı. Bunun iki yolu var: `/assets/*` için küçük bir Pages Function (HTML dönen yanıtı 404'e çevirir) ya da Cloudflare'de bir kural. Ardından `deploy/dist-kontrol.ts`'teki "uzun önbellek" denetimi gevşetilir. Bu yapılmadan `immutable` geri konmamalı.

## Cloudflare tarafı (bir kerelik, elle)

- Pages derleme ayarı: komut `npm run build`, çıktı klasörü `dist` (README ile aynı). Vite çıktısı `dist`.
- Bu düzeltme yayına çıktıktan sonra, eski kurallarla kenarda kalmış olabilecek yanıtlar için **bir kez "Purge Everything"** yapılmalı. Sonrasında gerekmez.
