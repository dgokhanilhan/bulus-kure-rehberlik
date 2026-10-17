# Cumartesi etütleri (modül: `etut`, migration 0051)

## Kim ne yapar
| Rol | Yapabildikleri |
| --- | --- |
| Rehber öğretmen, yönetici | Cumartesi + kademe (ortaokul/lise) seçip öğretmen × 5 ders planı hazırlar; hücre ya **etüt** (konu, salon, öğrenciler) ya **meşgul**dür (izinli, sınav gözetmeni, voleybol… serbest açıklama). Ders saatlerini düzenler, talepleri yerleştirir ya da gerekçeyle reddeder, kaydeder, yayınlar, siler, PDF alır, yoklama girer. |
| Öğretmen (branş) | Etüt talebi oluşturur (öğrenci, konu, isteğe bağlı açıklama / Cumartesi / ders), taleplerinin durumunu görür, bekleyen talebini iptal eder; kendi yayınlanmış etütlerinde etüt günü ya da sonrasında yoklama alır; yayınlanan programları salt okur. |
| Veli, öğrenci | Yalnız kendi (çocuğunun) **yayınlanmış** etütlerini görür: tarih, ders saati, öğretmen, konu, salon, yoklama. Başka öğrencinin adını görmez. Ana sayfadaki "Cumartesi etütleri" kutusu hem eski şube etütlerini hem yeni etütleri gösterir. |

## Kurallar (veritabanında da uygulanır)
- Etüt günü Cumartesi; 5 ders, saatler kademeye göre ayrı (ortaokul 09:00–13:00, lise 09:20–13:20; her ders 40 dk). Yeni program aynı kademenin son programının saatleriyle açılır.
- Aynı öğrenci aynı ders saatinde iki etüde yazılamaz; bir öğretmen bir derste tek hücre alır; etüdün konusu zorunlu; meşgul hücreye öğrenci eklenemez.
- Taslak program yalnız rehber/yöneticiye görünür. "Yayınla" ile etüdü olan öğrenci ve velilere bildirim gider. Yayındaki program değişirse **yalnız etüdü değişen** öğrenci/veliler bildirim alır (çıkarılana "iptal"). Program silinirse "iptal" bildirimi gider.
- Yeniden kaydetmek aynı öğretmen-ders-öğrencinin yoklamasını korur. Programdan çıkarılan talep yeniden "bekliyor"a döner.
- Yazma yalnız `etut_kaydet`, `etut_yayinla`, `etut_sil`, `etut_yoklama`, `etut_talep_ekle`, `etut_talep_iptal`, `etut_talep_reddet` fonksiyonlarıyla; tablolarda doğrudan yazma politikası yok.
- Modül (Yönetim → Modüller → Cumartesi etütleri) kapatılınca yönetici dışında kimse okuyamaz/yazamaz; bildirimler Yönetim → Bildirimler → Etüt ile kapatılabilir.
- Şube bazlı eski "Etüt planla" (Sınıflar, `study_sessions`) değişmedi.

## Dosyalar
`supabase/migrations/0051_etut.sql` · geri alma `supabase/geri-alma/0051_etut_geri_al.sql` · `src/lib/etut.ts` (+ test) · `src/lib/etutData.ts` · `src/lib/etutPdf.tsx` · `src/pages/EtutPage.tsx`, `Etut.css` · `tests/etut.test.ts` · `e2e/etut.spec.ts`
