// Veli davet kodu (0103) için saf yardımcılar: kod biçimi, bağlantı, WhatsApp mesajı. Veliye "siz" diye hitap edilir.

/** "R7TK2QXA9M" → "R7TK2-QXA9M" (kartta ve mesajda okunur biçim) */
export const kodBicim = (kod: string) => (kod.length === 10 ? `${kod.slice(0, 5)}-${kod.slice(5)}` : kod)

/** Elle yazılan kodu düzeltir: harf/rakam dışı atılır, büyük harf, en çok 10 karakter. */
export const kodTemizle = (girdi: string) =>
  girdi
    .toLocaleUpperCase('en-US')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)

export const davetAdresi = (kok: string, kod: string) => `${kok.replace(/\/$/, '')}/v/${kodBicim(kod)}`

/** Mesajda yalnız ilk ad geçer (soyad, okul no gönderilmez). */
export const ilkAd = (ad: string) => ad.trim().split(/\s+/)[0] ?? ''

const TARIH = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' })
export const sonTarih = (iso: string) => TARIH.format(new Date(iso))

export function whatsappMetni(o: { okul: string; cocuk: string; adres: string; son: string }) {
  return (
    `Merhaba, ${o.okul} olarak yazıyoruz. Ödev, deneme ve duyuruları takip edebilmeniz için ${ilkAd(o.cocuk)} adına veli hesabınızı bu bağlantıdan açabilirsiniz:\n` +
    `${o.adres}\n` +
    `Bağlantının son geçerlilik tarihi: ${sonTarih(o.son)}.`
  )
}

/** WhatsApp'ı hazır mesajla açar; kişiyi gönderen seçer (numara sistemde tutulmaz). */
export const whatsappBaglanti = (metin: string) => `https://wa.me/?text=${encodeURIComponent(metin)}`
