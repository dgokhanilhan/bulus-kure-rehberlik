import { describe, expect, it } from 'vitest'
import { bugunIst, cihazTuru, girisMetni, gunKaydir, islemMetni, sonGorulmeMetni, kayitYolu, rolAnahtari, rolMetni, saatIst, sayfaAdi } from './etkinlikMetin'

describe('etkinlik günlüğü yardımcıları', () => {
  it('cihaz türü: dokunmatik değilse bilgisayar, kısa kenara göre telefon/tablet', () => {
    expect(cihazTuru(390, false)).toBe('bilgisayar')
    expect(cihazTuru(390, true)).toBe('telefon')
    expect(cihazTuru(820, true)).toBe('tablet')
  })

  it('kayıt yolu: sorgu ve # atılır, geçersiz karakterli yol kaydedilmez', () => {
    expect(kayitYolu('/yonetim?sekme=duyurular')).toBe('/yonetim')
    expect(kayitYolu('/odevler#x')).toBe('/odevler')
    expect(kayitYolu('/ogrenciler/')).toBe('/ogrenciler')
    expect(kayitYolu('/')).toBe('/')
    expect(kayitYolu('/<script>')).toBeNull()
    expect(kayitYolu('/çğ')).toBeNull()
    expect(kayitYolu(`/${'a'.repeat(90)}`)).toBeNull()
  })

  it('sayfa adı: bilinen sayfalar Türkçe, öğrenci dosyasında öğrenci adı', () => {
    expect(sayfaAdi('/odevler')).toBe('Ödevler')
    expect(sayfaAdi('/ogrenciler/00000000-0000-4000-8000-000000000001', 'Elif Yıldız')).toBe('Öğrenci dosyası · Elif Yıldız')
    expect(sayfaAdi('/ogrenciler/00000000-0000-4000-8000-000000000001')).toBe('Öğrenci dosyası')
    expect(sayfaAdi('/bilinmeyen')).toBe('/bilinmeyen')
  })

  it('iş metni: içerik yok, yalnız tür ve sayı', () => {
    expect(islemMetni('odev_verdi', 1)).toBe('Ödev verdi')
    expect(islemMetni('gorev_verdi', 3)).toBe('3 görev verdi')
    expect(islemMetni('yoklama', 24)).toBe('Yoklama aldı (24 öğrenci)')
    expect(islemMetni('mesaj', 2)).toBe('2 mesaj gönderdi')
    expect(islemMetni('etkinlik_gunlugu', 1)).toBe('Etkinlik günlüğünü açtı')
    expect(islemMetni('bilinmeyen', 1)).toBe('Yönetim işlemi yaptı')
  })

  it('rol metni ve süzme anahtarı', () => {
    expect(rolMetni('ogretmen', 'Rehberlik')).toBe('Rehber öğretmen')
    expect(rolMetni('ogretmen', 'Matematik')).toBe('Öğretmen · Matematik')
    expect(rolMetni('veli', null)).toBe('Veli')
    expect(rolAnahtari('ogretmen')).toBe('ogretmen')
    expect(rolAnahtari('admin')).toBe('admin')
  })

  it('gün kaydırma ve İstanbul saati', () => {
    expect(gunKaydir('2026-03-01', -1)).toBe('2026-02-28')
    expect(gunKaydir('2026-12-31', 1)).toBe('2027-01-01')
    // 21:30 UTC = 00:30 İstanbul (ertesi gün)
    expect(bugunIst(new Date('2026-11-26T21:30:00Z'))).toBe('2026-11-27')
    expect(saatIst('2026-11-26T21:30:00Z')).toBe('00:30')
  })
  it('giriş satırları ve oyun', () => {
    expect(girisMetni('giris', 'telefon')).toBe('Uygulamayı açtı (telefon)')
    expect(girisMetni('sifre_giris', null)).toBe('Şifreyle giriş yaptı')
    expect(girisMetni('oturum', null)).toBe('Uygulama açıktı (oturum yenilendi)')
    expect(girisMetni('sayfa', null)).toBeNull()
    expect(islemMetni('oyun', 2)).toBe('Öğretmenler Odası’nda 2 oyun oynadı')
  })

  it('son görülme: bugün, dün, tarih, hiç', () => {
    const now = new Date('2026-11-27T12:00:00Z')
    expect(sonGorulmeMetni('2026-11-27T06:51:00Z', now)).toBe('Son görülme bugün 09:51')
    expect(sonGorulmeMetni('2026-11-26T15:43:00Z', now)).toBe('Son görülme dün 18:43')
    expect(sonGorulmeMetni('2026-10-07T10:44:00Z', now)).toBe('Son görülme 7 Eki 13:44')
    expect(sonGorulmeMetni(null, now)).toBe('Hiç girmedi')
  })
})
