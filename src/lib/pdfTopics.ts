export { validPdfTopics, pdfTopicKey, type PdfTopic } from '../../supabase/functions/_shared/pdf-topics'

/** Deneme "konuları gizle" ile işaretliyse (0081) satırın PDF konu bilgisi okunmaz; puan/net/D/Y/B aynen kalır. */
export function gizliKonuSil<T extends { source?: unknown }>(r: T, exam: unknown): T {
  if (!(exam as { topics_hidden?: boolean } | null)?.topics_hidden || !r.source || typeof r.source !== 'object') return r
  return { ...r, source: { ...(r.source as Record<string, unknown>), topics: [] } }
}
