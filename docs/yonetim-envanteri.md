# Yönetim Merkezi yetenek envanteri

Paket 3 / PR 2 (0024). Her satır: Yönetim Merkezi'nde ne yapılabildiği, yetkinin **veritabanında** nerede zorlandığı ve riskli işlemde onay olup olmadığı.
Tüm yazma işlemleri yönetici + iki adımlı doğrulama (aal2) ister (`is_admin()`); rehberlik ve öğretmen Yönetim Merkezi'ni göremez, adresle de açamaz.

| Alan | Yapılabilenler | Veritabanı zorlaması | Onay | İşlem kaydı |
|---|---|---|---|---|
| Genel ayarlar | okul adı, telefon, e-posta, adres, logo | `set_settings` (tip doğrulama) | — | `settings` |
| Modüller | 10 modül aç/kapat | `module_enabled()` + kısıtlayıcı politikalar; menü, sorgu ve adres de kapanır | **kapatırken** | `settings` + `module_toggle` (yeni) |
| Eğitim yılları | ekle, düzenle, aktif yap | `academic_years` RLS | **aktif yılı değiştirirken** | `insert/update` |
| Dosya / duyuru / bildirim / takvim / yoklama ayarları | açıklamalı anahtarlar | `set_settings` | — | `settings` |
| Ana sayfa düzeni | veli / öğrenci / öğretmen kartları: göster-gizle, sıra, **genişlik (dar/geniş, yeni)**; **Yönetim (Bugün)** yan kartları (yeni) | `set_settings` düzen doğrulaması (bilinen kart, tekrar yok, `w` ∈ dar/genis) | — | `settings` |
| Galeri ayarları | kategoriler | 0022 politikaları | silmede | 0022 |
| Güvenlik ve erişim (yeni) | kim neyi görür özeti, işlem kayıtlarına bağlantı | salt bilgi | — | — |
| Sınıflar | ekle, düzenle, **aktif/pasif (yeni)**, sil (boşsa) | `classes` RLS; pasif sınıf `signup_classes`'ta yok; `delete_class` dolu sınıfı reddeder | pasif/aktif; silmede ad yazarak | `insert/update/delete` |
| Dersler | ekle, düzenle, aktif/pasif, **sırala (yeni)**, sil | `courses` RLS; programda kullanılan ders silinmez | silmede ad yazarak | `insert/update/delete` |
| Ders saatleri | ekle, düzenle, sırala, aktif/pasif, sil | 0012 fonksiyonları | silmede | evet |
| Ders atamaları | ata, **kaldır (onaylı, yeni)**; öğretmen penceresinden de (yeni) | `teaching_assignments` RLS | **kaldırırken** | `insert/delete` |
| Ders programı, yoklama, yemek | mevcut ekranlar | 0009 politikaları | mevcut | mevcut |
| Ödev ayarları | **Öğretmenler ödev verebilir (yeni)** + mevcut anahtarlar | `can_assign_homework` ayarı okur; kapalıyken öğretmen ödev veremez/düzenleyemez | — | `settings` |
| Takvim etkinlikleri (yeni liste) | listele, sil | `cal_delete` (yönetici ya da ekleyen) | **silmede** | `delete` |
| Duyurular (yeni liste) | listele, sil | `ann_delete` | **silmede** | `insert/delete` (yeni tetikleyici) |
| Mesajlaşma (yeni bölüm) | dosya eki aç/kapat, kural açıklaması | `start_conversation` / `child_contacts` | — | `settings` |
| Denemeler / LGS (yeni bölüm) | sayılar, bağlantı, kurallar | LGS kartı yalnız 8. sınıf (arayüzde aşılamaz); okuma kuralları değişmez | — | — |
| Öğrenciler | ekle, düzenle/taşı, **arşivle / geri al (yeni)**, sil | `students` RLS; arşivli öğrenci listelerden, yoklamadan, yeni ödevden düşer | arşivde; silmede ad yazarak | `insert/update/delete` (yeni tetikleyici) |
| Öğretmenler | davet, düzenle, rol ekle/kaldır, **ders ataması (yeni)**, hesap kapat | `admin_update_profile`, `admin_add_role/remove_role`, 0008 | hesap kapatmada | evet |
| Veliler | davet, öğrenci bağla/kaldır | `parent_links` RLS | kaldırmada (PR 1) | PR 1 (`parent_link_add/remove`) |
| Kapalı hesaplar | yeniden aç | 0008 | — | `activate` |
| Toplu aktarım | öğrenci / öğretmen CSV-Excel | `import_students` (önizleme, hepsi ya da hiçbiri), `admin-davet` | önizleme | evet |
| Bursluluk | sınav, seans, kontenjan, başvurular | 0018/0021 | silmede | evet |
| Yönetimde ara (yeni) | bölüm adları + anahtar sözcükler | — | — | — |

## Bilerek olmayanlar

- Gizli anahtar / API anahtarı / service_role gösterimi ya da düzenleme: yok.
- SQL düzenleyici, ham sorgu, yedekten dönme, toplu silme: yok.
- Öğretmen–öğrenci görünürlüğü elle listeyle değil, ders ataması + sınıf öğretmenliği + ders programından gelir (PR 1, `can_teacher_access_student`).
- Rehberlik okul genelini görür (Gökhan'ın onayına bağlı karar).

## Mobil

Yönetim menüsü dar ekranda yatay kaydırılır, arama kutusu menünün başındadır; tablolar kendi kutusunda yatay kayar (`.tbl`), sayfa yatay taşmaz (e2e: 375 px).
