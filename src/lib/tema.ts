// Görünüm teması: kişinin kendi seçimi; yalnız renk, yazı tipi ve köşe görünümünü değiştirir (veri, yetki ve hesaplara dokunmaz).
// Varsayılan "Buluş Küre" temasında okulun açık/koyu ve vurgu ayarları aynen geçerlidir; diğer temalar kendi renk setini getirir.
export const VARSAYILAN_TEMA = 'buluskure'

export interface Tema { id: string; ad: string; grup: 'sade' | 'konsept'; vurgu: string; zemin: string }
export const TEMALAR: readonly Tema[] = [
  { id: 'buluskure', ad: 'Buluş Küre', grup: 'sade', vurgu: '#1f5f5b', zemin: '#f6f3ec' },
  { id: 'gece', ad: 'Gece Mavisi', grup: 'sade', vurgu: '#f2c46d', zemin: '#0b1226' },
  { id: 'defter', ad: 'Okul Defteri', grup: 'sade', vurgu: '#2251c7', zemin: '#fbfaf6' },
  { id: 'gunbatimi', ad: 'Gün Batımı', grup: 'sade', vurgu: '#c2410c', zemin: '#fff6ef' },
  { id: 'lavanta', ad: 'Lavanta', grup: 'sade', vurgu: '#6d4ae0', zemin: '#f7f4ff' },
  { id: 'grafit', ad: 'Grafit', grup: 'sade', vurgu: '#ffe500', zemin: '#111111' },
  { id: 'neon', ad: 'Neon', grup: 'sade', vurgu: '#22d3ee', zemin: '#0d0b16' },
  { id: 'akademi', ad: 'Akademi', grup: 'sade', vurgu: '#7a1f2b', zemin: '#f5efe4' },
]

export const temaGecerli = (id: string | null | undefined): string => (id && TEMALAR.some((t) => t.id === id) ? id : VARSAYILAN_TEMA)

// Yazı tipleri uygulamayla birlikte sunulur ve yalnız seçilen tema için yüklenir (açılış hızı değişmez).
const f = (...p: Promise<unknown>[]) => Promise.all(p)
const FONTLAR: Record<string, () => Promise<unknown>> = {
  gece: () => f(import('@fontsource/playfair-display/latin-600.css'), import('@fontsource/playfair-display/latin-ext-600.css'),
    import('@fontsource/inter/latin-400.css'), import('@fontsource/inter/latin-ext-400.css'), import('@fontsource/inter/latin-600.css'), import('@fontsource/inter/latin-ext-600.css')),
  defter: () => f(import('@fontsource/literata/latin-600.css'), import('@fontsource/literata/latin-ext-600.css'),
    import('@fontsource/source-sans-3/latin-400.css'), import('@fontsource/source-sans-3/latin-ext-400.css'), import('@fontsource/source-sans-3/latin-600.css'), import('@fontsource/source-sans-3/latin-ext-600.css')),
  gunbatimi: () => f(import('@fontsource/dm-serif-display/latin-400.css'), import('@fontsource/dm-serif-display/latin-ext-400.css'),
    import('@fontsource/dm-sans/latin-400.css'), import('@fontsource/dm-sans/latin-ext-400.css'), import('@fontsource/dm-sans/latin-600.css'), import('@fontsource/dm-sans/latin-ext-600.css')),
  lavanta: () => f(import('@fontsource/nunito/latin-400.css'), import('@fontsource/nunito/latin-ext-400.css'), import('@fontsource/nunito/latin-600.css'), import('@fontsource/nunito/latin-ext-600.css'),
    import('@fontsource/nunito/latin-800.css'), import('@fontsource/nunito/latin-ext-800.css')),
  grafit: () => f(import('@fontsource/space-grotesk/latin-400.css'), import('@fontsource/space-grotesk/latin-ext-400.css'), import('@fontsource/space-grotesk/latin-600.css'), import('@fontsource/space-grotesk/latin-ext-600.css'),
    import('@fontsource/space-grotesk/latin-700.css'), import('@fontsource/space-grotesk/latin-ext-700.css'), import('@fontsource/jetbrains-mono/latin-500.css'), import('@fontsource/jetbrains-mono/latin-ext-500.css')),
  neon: () => f(import('@fontsource/sora/latin-400.css'), import('@fontsource/sora/latin-ext-400.css'), import('@fontsource/sora/latin-600.css'), import('@fontsource/sora/latin-ext-600.css'),
    import('@fontsource/sora/latin-700.css'), import('@fontsource/sora/latin-ext-700.css'), import('@fontsource/jetbrains-mono/latin-500.css'), import('@fontsource/jetbrains-mono/latin-ext-500.css')),
  akademi: () => f(import('@fontsource/cormorant-garamond/latin-700.css'), import('@fontsource/cormorant-garamond/latin-ext-700.css'),
    import('@fontsource/lora/latin-400.css'), import('@fontsource/lora/latin-ext-400.css'), import('@fontsource/lora/latin-600.css'), import('@fontsource/lora/latin-ext-600.css')),
}

/** Temayı sayfaya uygular. Buluş Küre'de öznitelik kaldırılır; okulun açık/koyu ve vurgu ayarları devreye girer. */
export function temaUygula(id: string) {
  const t = temaGecerli(id), root = document.documentElement
  if (t === VARSAYILAN_TEMA) root.removeAttribute('data-skin')
  else {
    root.setAttribute('data-skin', t)
    void FONTLAR[t]?.().catch(() => {}) // yazı tipi gelmezse yedek yazı tipiyle devam edilir
  }
}

// Cihazda son kullanılan tema: oturum açılmadan önce (giriş ekranı) ve profil yüklenene kadar anında uygulanır.
const ANAHTAR = 'bk-tema'
export function cihazTemasi(): string {
  try { return temaGecerli(localStorage.getItem(ANAHTAR)) } catch { return VARSAYILAN_TEMA }
}
export function cihazTemasiYaz(id: string) {
  try { localStorage.setItem(ANAHTAR, temaGecerli(id)) } catch { /* özel pencere: yalnız bu oturum */ }
}
