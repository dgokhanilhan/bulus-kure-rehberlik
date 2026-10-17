// Okul ayarlarını kodda okumak için tek yer. Değer yoksa varsayılan (ayarAdlari.ts = veritabanı setting_spec varsayılanı).
// Ayarlar anında etkilidir: useSettings() sorgusu yenilenince bütün ekranlar yeni değeri okur.
import { useMemo } from 'react'
import { useSettings } from './data'
import { ayarOkuyucu, type Ayar } from './ayarOku'
export { ayarOkuyucu, ayarVarsayilan, menuAyarla, type Ayar } from './ayarOku'

export function useAyar(): Ayar {
  const s = useSettings()
  return useMemo(() => ayarOkuyucu(s.data), [s.data])
}
