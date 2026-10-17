// Ayar okuma ve menü ayarları (saf; tarayıcı/Supabase bağımlılığı yok, birim testlenir). Hook: ayarlar.ts useAyar().
import { AYARLAR } from './ayarAdlari'
import type { NavItem, PageId } from './roles'
import type { Role } from './types'

const DEF = new Map(AYARLAR.map((a) => [a.key, a.varsayilan]))
export const ayarVarsayilan = (key: string) => DEF.get(key)

export type Ayar = ReturnType<typeof ayarOkuyucu>
export function ayarOkuyucu(s: Record<string, unknown> | undefined) {
  const get = (k: string): unknown => (s && k in s ? s[k] : DEF.get(k))
  return {
    get,
    bool: (k: string) => get(k) !== false,
    num: (k: string) => Number(get(k) ?? 0),
    text: (k: string) => String(get(k) ?? ''),
    /** Virgülle ayrılmış liste (boşlar atılır) */
    list: (k: string) =>
      String(get(k) ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    /** "09:00-09:40,…" → [{bas, bit}] */
    saatler: (k: string) =>
      String(get(k) ?? '')
        .split(',')
        .map((x) => x.trim().split('-'))
        .filter((x) => x.length === 2)
        .map(([bas, bit]) => ({ bas: bas!, bit: bit! })),
  }
}

/** Sayfa kimliği → ayar anahtarı parçası ("nobet-takip" → "nobet_takip") */
const pk = (id: PageId) => id.replace('-', '_')
/** Veli/öğrenci bölüm ayarına bağlı sayfalar */
const AILE_SAYFA: Partial<Record<PageId, string>> = { gorevler: 'aile.gorevler', raporlar: 'aile.raporlar', gorusmeler: 'aile.gorusmeler', etut: 'aile.etut' }

/**
 * Menü ayarları: ad, gizleme, sıra (menu.*) ve veli/öğrenci bölüm ayarları (aile.*). Yalnız menüyü ve gidilebilen sayfaları
 * daraltır; veri erişimi veritabanında (modül ve aile.* kısıtlayıcı politikaları). Yönetici menüsünden Yönetim kaldırılamaz.
 */
export function menuAyarla(items: NavItem[], role: Role, a: Ayar): NavItem[] {
  const gizli = new Set(a.list(`menu.gizli.${role}`))
  const aile = role === 'veli' || role === 'ogrenci'
  const kalan = items
    .filter((n) => !(gizli.has(n.id) || gizli.has(pk(n.id))) || (role === 'admin' && n.id === 'yonetim'))
    .filter((n) => !aile || !AILE_SAYFA[n.id] || a.bool(AILE_SAYFA[n.id]!))
    .map((n) => {
      const ad = a.text(`menu.ad.${pk(n.id)}`).trim()
      return ad ? { ...n, label: ad } : n
    })
  const sira = a.list(`menu.sira.${role}`).map((x) => x.replace('_', '-'))
  if (!sira.length) return kalan
  const idx = (n: NavItem) => {
    const i = sira.indexOf(n.id)
    return i < 0 ? sira.length : i
  }
  return kalan.map((n, i) => ({ n, i })).sort((x, y) => idx(x.n) - idx(y.n) || x.i - y.i).map((x) => x.n)
}
