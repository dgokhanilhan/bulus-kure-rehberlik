/** Resmî PDF'in sol sütun başlığı bazen hedef cümlesinin ortasına karışır. */
export function outcomeTitle(title: string, source: 'official' | 'pdf' = 'official'): string {
  if (source === 'pdf') return title
  return title.replace(/(?:ÖĞRENME ÇIKTILARI\s+)?VE\s+SÜREÇ BİLEŞENLERİ/g, '').replace(/\s+/g, ' ').trim()
}
