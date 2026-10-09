/** Özelliğin işletim izni, hukuki belgelerin tamamlandığı anlamına gelmez. */
export function aiTransferAllowed(approval: string | undefined, supabaseUrl: string | undefined, aiBase: string | undefined): boolean {
  if (approval === 'true') return true
  try {
    const db = new URL(supabaseUrl ?? ''), ai = new URL(aiBase ?? '')
    return db.protocol === 'http:' && ['kong', '127.0.0.1', 'localhost'].includes(db.hostname)
      && ai.protocol === 'http:' && ['host.docker.internal', '127.0.0.1', 'localhost'].includes(ai.hostname) && ai.port === '54399'
  } catch { return false }
}

/** Rapor izni isim eşleştirme gibi başka bir AI akışını açmaz. */
export function aiFeatureAllowed(fn: string, reportEnabled: string | undefined, approval: string | undefined, db: string | undefined, ai: string | undefined) {
  return (fn === 'ai-veli-raporu' && reportEnabled === 'true') || aiTransferAllowed(approval, db, ai)
}
