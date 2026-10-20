// İstek süre sınırı: yanıtsız kalan bağlantı (uyku sonrası kopmuş bağlantı, ağ/proxy) isteği sonsuza kadar bekletmesin;
// süre dolunca istek hataya düşer ve ekran "Veriler yüklenemedi · Tekrar dene" gösterir (VeriDurumu).
// Dosya yükleme ve yapay zekâ işlevleri daha uzun sürebilir.
export const ZAMAN_ASIMI = 'Sunucu yanıt vermedi (zaman aşımı). Bağlantını kontrol edip tekrar dene.'

export function sureSiniri(u: string): number {
  if (u.includes('/storage/v1/')) return 300_000
  if (u.includes('/functions/v1/')) return 120_000
  return 30_000
}

export function sureliFetch(f: typeof fetch, sure = sureSiniri): typeof fetch {
  return (input, init) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const ctl = new AbortController()
    const dis = init?.signal
    if (dis) {
      if (dis.aborted) ctl.abort(dis.reason)
      else dis.addEventListener('abort', () => ctl.abort(dis.reason), { once: true })
    }
    let doldu = false
    const t = setTimeout(() => ((doldu = true), ctl.abort()), sure(u))
    return f(input, { ...init, signal: ctl.signal })
      .catch((e: unknown) => {
        throw doldu ? new Error(ZAMAN_ASIMI) : e
      })
      .finally(() => clearTimeout(t))
  }
}
