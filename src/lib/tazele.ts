import type { QueryClient } from '@tanstack/react-query'

/**
 * Bir değişiklikten sonra sorguları tazeler.
 * Henüz verisi olmayan sorgu yükleniyorsa invalidate yeni istek açmaz, değişiklikten önce başlamış isteğe katılır
 * (eski liste gelir). Bu yüzden önce süren istek iptal edilir, sonra tazelenir.
 */
export function tazele(qc: QueryClient, keys: string[]) {
  return Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: [k] }).then(() => qc.invalidateQueries({ queryKey: [k] }))))
}
