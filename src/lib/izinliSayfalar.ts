import { createContext, useContext } from 'react'

/** Kişinin girebildiği sayfalar (RoleRoutes'taki menü). Bağlam yoksa (test, önizleme) her bağlantı gösterilir. */
export const IzinliSayfalarCtx = createContext<readonly string[] | null>(null)

/** Bağlantı hedefi bu rolün girebildiği bir sayfa mı? Girilemeyen sayfaya giden bağlantı ana sayfaya geri attığı için hiç gösterilmez. */
export function useSayfaIzinli() {
  const izinli = useContext(IzinliSayfalarCtx)
  return (to: string) => {
    if (!izinli) return true
    const kok = to.replace(/^\//, '').split(/[/?#]/)[0] ?? ''
    return izinli.includes(kok)
  }
}
