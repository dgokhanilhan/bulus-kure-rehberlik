// Kurulum sihirbazı (0079): adımlar ve durumları — saf, birim testli. Ekran: pages/YonetimKurulum.tsx

export interface KurulumSayilari {
  yil: number
  modul: number
  sinif: number
  ders: number
  saat: number
  ogretmen: number
  ogrenci: number
  sinifsiz: number
  atama: number
  program: number
  veli_bagli: number
  yonetici_mfa: number
}
export type AdimDurum = 'tamam' | 'eksik' | 'kismen' | 'gozden'
export interface Adim<T extends string = string> {
  no: number
  baslik: string
  aciklama: string
  durum: AdimDurum
  bilgi: string
  sekme: T
  dugme: string
}

/** Adımlar ve durumları (saf; birim testli). Sekme anahtarları Yönetim Merkezi'nin bölümleridir. */
export function kurulumAdimlari(k: KurulumSayilari): Adim[] {
  const d = (n: number): AdimDurum => (n > 0 ? 'tamam' : 'eksik')
  const veliOran = k.ogrenci ? k.veli_bagli / k.ogrenci : 0
  return [
    {
      no: 1,
      baslik: 'Güvenlik',
      aciklama: 'Yönetici hesabında iki adımlı doğrulama açık olmalı.',
      durum: d(k.yonetici_mfa),
      bilgi: `${k.yonetici_mfa} yönetici doğrulamalı`,
      sekme: 'guvenlik',
      dugme: 'Güvenliğe git',
    },
    {
      no: 2,
      baslik: 'Eğitim yılı',
      aciklama: 'Dönem tarihleri; devamsızlık ve raporlar buna göre hesaplanır.',
      durum: d(k.yil),
      bilgi: `${k.yil} eğitim yılı`,
      sekme: 'yillar',
      dugme: 'Eğitim yıllarına git',
    },
    {
      no: 3,
      baslik: 'Modüller',
      aciklama: 'Okulda kullanılacak bölümleri aç ya da kapat (etüt, yoklama, Öğretmenler Odası…).',
      durum: 'gozden',
      bilgi: k.modul ? `${k.modul} modül ayarı değiştirildi` : 'Varsayılanlar kullanılıyor',
      sekme: 'moduller',
      dugme: 'Modüllere git',
    },
    {
      no: 4,
      baslik: 'Sınıflar',
      aciklama: 'Şubeleri ekle (5/A, 8/B…).',
      durum: d(k.sinif),
      bilgi: `${k.sinif} sınıf`,
      sekme: 'siniflar',
      dugme: 'Sınıflara git',
    },
    {
      no: 5,
      baslik: 'Dersler ve ders saatleri',
      aciklama: 'Ders listesi ve zil saatleri.',
      durum: k.ders && k.saat ? 'tamam' : k.ders || k.saat ? 'kismen' : 'eksik',
      bilgi: `${k.ders} ders · ${k.saat} ders saati`,
      sekme: k.ders ? 'saatler' : 'dersler',
      dugme: k.ders ? 'Ders saatlerine git' : 'Derslere git',
    },
    {
      no: 6,
      baslik: 'Öğretmenler (Excel)',
      aciklama: 'Şablonu indir, doldur, yükle. Hatalı satırlar aktarmadan önce tek tek gösterilir.',
      durum: d(k.ogretmen),
      bilgi: `${k.ogretmen} öğretmen`,
      sekme: 'aktarim',
      dugme: 'Toplu aktarıma git',
    },
    {
      no: 7,
      baslik: 'Öğrenciler (Excel)',
      aciklama: 'Öğrenci listesini aynı yolla aktar; sınıfı bulunamayan satırlar önizlemede uyarı verir.',
      durum: k.ogrenci ? (k.sinifsiz ? 'kismen' : 'tamam') : 'eksik',
      bilgi: `${k.ogrenci} öğrenci${k.sinifsiz ? ` · ${k.sinifsiz} öğrencinin sınıfı yok` : ''}`,
      sekme: 'aktarim',
      dugme: 'Toplu aktarıma git',
    },
    {
      no: 8,
      baslik: 'Ders atamaları',
      aciklama: 'Hangi öğretmen hangi sınıfa hangi dersi veriyor; öğretmen yalnız atandığı sınıfları görür.',
      durum: d(k.atama),
      bilgi: `${k.atama} atama`,
      sekme: 'atamalar',
      dugme: 'Ders atamalarına git',
    },
    {
      no: 9,
      baslik: 'Ders programı',
      aciklama: 'Haftalık program (isteğe bağlı; fotoğraftan da okunabilir).',
      durum: k.program ? 'tamam' : 'gozden',
      bilgi: `${k.program} ders kaydı`,
      sekme: 'program',
      dugme: 'Ders programına git',
    },
    {
      no: 10,
      baslik: 'Veliler',
      aciklama: 'Velileri davet et ya da listeyle bağla; veli yalnız kendi çocuğunu görür.',
      durum: !k.ogrenci ? 'eksik' : veliOran >= 0.8 ? 'tamam' : k.veli_bagli ? 'kismen' : 'eksik',
      bilgi: `${k.veli_bagli}/${k.ogrenci} öğrencinin velisi bağlı`,
      sekme: 'veliler',
      dugme: 'Velilere git',
    },
  ]
}
