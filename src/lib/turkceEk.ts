// Bulunma eki (-de/-da/-te/-ta): deneme adına göre ("TG-5'te", "Deneme 2'de", "LGS'de"). Sabit "'de" yazım hatası yapıyordu.
const RAKAM: Record<string, string> = { '0': 'da', '1': 'de', '2': 'de', '3': 'te', '4': 'te', '5': 'te', '6': 'da', '7': 'de', '8': 'de', '9': 'da' }
const ONLAR: Record<string, string> = { '1': 'da', '2': 'de', '3': 'da', '4': 'ta', '5': 'de', '6': 'ta', '7': 'te', '8': 'de', '9': 'da' }
const KALIN = 'aıouAIOU'
const UNLU = 'aeıioöuüAEIİOÖUÜ'
const SERT = 'fstkçşhpFSTKÇŞHP'

export function bulunmaEki(ad: string): string {
  const s = ad.trim()
  const sayi = /(\d+)$/.exec(s)?.[1]
  if (sayi) {
    if (/0{3}$/.test(sayi)) return 'de' // bin
    if (/00$/.test(sayi)) return 'de' // yüz
    if (sayi.endsWith('0') && sayi.length >= 2) return ONLAR[sayi.at(-2)!] ?? 'da'
    return RAKAM[sayi.at(-1)!]!
  }
  const harfler = s.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '')
  if (!harfler) return 'de'
  // Kısaltma (LGS, TYT): harf adlarıyla okunur ("le-ge-se") → -de
  if (harfler.length >= 2 && harfler === harfler.toLocaleUpperCase('tr-TR') && !UNLU.includes(harfler.at(-1)!)) return harfler.endsWith('K') ? 'da' : 'de'
  const sonUnlu = [...harfler].reverse().find((c) => UNLU.includes(c))
  const unlu = sonUnlu && KALIN.includes(sonUnlu) ? 'a' : 'e'
  return (SERT.includes(harfler.at(-1)!) ? 't' : 'd') + unlu
}
