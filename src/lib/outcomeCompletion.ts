export interface CompletionRow { grade: number; subject_code: string; outcome_type: string; title: string }
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '')
/** Kodlar yayıncıya göre farklı anlamlara gelebilir. Yalnız tekil metin başlangıcı önerilir. */
export function completionFor<T extends CompletionRow>(row: CompletionRow, official: T[]): T | null {
  const prefix = normalize(row.title)
  if (prefix.length < 12) return null
  const hits = official.filter(o => o.grade === row.grade && o.subject_code === row.subject_code && o.outcome_type === row.outcome_type && normalize(o.title).startsWith(prefix) && normalize(o.title).length > prefix.length)
  return hits.length === 1 ? hits[0]! : null
}
