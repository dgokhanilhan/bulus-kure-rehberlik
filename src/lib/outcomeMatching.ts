export interface MatchOutcome { id: string; code: string | null; title: string; grade: number; subject_code: string; curriculum_version_id: string }
export interface RawOutcome { subject_code: string; raw_code: string | null; raw_text: string | null }

export const outcomeText = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')

/** Yayın/sınav ön ekini temizler; farklı dersin kodunu sayısal benzerlikle eşlemez. */
export function outcomeCode(raw: string, subject: string): string | null {
  const s = raw.toUpperCase().replace(/\s/g, '').replace(/\.+$/, '').replace(/^(TYT|AYT|YKS)\./, '')
  const aliases: Record<string, string[]> = { TDE: ['TDE', 'TUR', 'TÜRKÇE'], TUR: ['TUR', 'TÜRKÇE'], MAT: ['MAT', 'MATEMATİK'] }
  const prefixes = aliases[subject] ?? [subject]
  const prefix = s.match(/^([A-ZÇĞİÖŞÜ]+)\./)?.[1]
  if (prefix && !prefixes.includes(prefix)) return null
  return prefix ? s.slice(prefix.length + 1) : s
}

export interface OutcomeProposal {
  outcome: MatchOutcome | null
  certain: boolean
  reason: string
}

/** Yalnız uygun müfredat sürümlerinden gelen adaylarda çalışır. Yakın metinden kesin eşleme üretmez. */
export function proposeOutcome(row: RawOutcome, catalog: MatchOutcome[]): OutcomeProposal {
  const outcomes = catalog.filter((o) => o.subject_code === row.subject_code)
  const code = row.raw_code ? outcomeCode(row.raw_code, row.subject_code) : null
  const text = row.raw_text ? outcomeText(row.raw_text) : ''
  const byCode = code ? outcomes.filter((o) => o.code && outcomeCode(o.code, o.subject_code) === code) : []
  const byText = text ? outcomes.filter((o) => outcomeText(o.title) === text) : []
  if (byCode.length && byText.length) {
    const shared = byCode.filter((o) => byText.some((t) => t.id === o.id))
    if (shared.length === 1) return { outcome: shared[0]!, certain: true, reason: 'Tam kod ve metin' }
    return { outcome: null, certain: false, reason: 'Kod ve metin çelişkili veya birden fazla hedefe uyuyor' }
  }
  if (byCode.length === 1) return { outcome: byCode[0]!, certain: true, reason: 'Tam kod' }
  if (byText.length === 1) return { outcome: byText[0]!, certain: true, reason: 'Tam metin' }
  if (byCode.length > 1 || byText.length > 1) return { outcome: null, certain: false, reason: 'Birden fazla hedefe uyuyor; elle seçim gerekli' }
  // Ör. 9.3.1 → 9.3.1.1 bir öneridir; kullanıcı görüp seçmeden kaydedilmez.
  if (code && /^\d+(?:\.\d+){2,}$/.test(code)) {
    const family = outcomes.filter((o) => o.code && outcomeCode(o.code, o.subject_code)?.startsWith(`${code}.`))
    if (family.length === 1) return { outcome: family[0]!, certain: false, reason: 'Eksik kod: tek alt hedef bulundu; kontrol edip seç' }
    if (family.length > 1) return { outcome: null, certain: false, reason: 'Eksik kod birden fazla alt hedefe uyuyor' }
  }
  return { outcome: null, certain: false, reason: outcomes.length ? 'Güvenilir eşleşme bulunamadı' : 'Bu ders ve öğrenci grubuna uygun katalog yok' }
}
