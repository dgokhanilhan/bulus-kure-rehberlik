// Genel deneme motorunu (public/engine/genel.mjs) Web Worker'da çalıştırır. Mevcut LGS motoru (engine.ts) ayrıdır.
import type { GenelPack } from './genelImport'

let worker: Worker | null = null
let seq = 0
const MAX = 30 * 1024 * 1024

export async function readGeneralFile(file: File, hints: { grade?: number } = {}, onProgress?: (page: number, total: number) => void): Promise<GenelPack> {
  if (file.size > MAX) throw new Error('Dosya en fazla 30 MB olabilir.')
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Yalnız PDF yüklenebilir.')
  worker ??= new Worker('/engine/genel-worker.mjs', { type: 'module' })
  const id = ++seq
  const w = worker
  const bytes = new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const onMsg = ({ data }: MessageEvent) => {
      if (data.id !== id) return
      if (data.progress) return onProgress?.(data.progress.page, data.progress.total)
      w.removeEventListener('message', onMsg)
      if (data.error) reject(new Error(data.error))
      else resolve(data.result as GenelPack)
    }
    const onErr = (e: ErrorEvent) => {
      w.removeEventListener('message', onMsg)
      worker = null
      reject(new Error(`PDF okuma motoru başlatılamadı${e.message ? `: ${e.message}` : ''}.`))
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr, { once: true })
    w.postMessage({ id, name: file.name, bytes, hints }, [bytes.buffer])
  })
}

/** 8. sınıf / LGS ve tanınmayan biçim mevcut LGS motoruna gider (LGS sonuçları birebir korunur). */
export const goesToLegacy = (p: GenelPack) => p.detection.family === 'UNKNOWN' || p.detection.grade?.value === 8 || p.detection.examType?.value === 'LGS'

/** LGS motorunun okuduğu karnede sınıf alanları çoğunlukla 8 dışı bir sınıfı gösteriyorsa (ör. 6/A) o sınıf düzeyi döner:
 *  LGS akışı yalnız 8. sınıf içindir; tanınmayan 5–7 karnesi sessizce LGS denemesi olarak kaydedilmemeli. */
export function nonLgsGrade(classes: (string | null | undefined)[]): number | null {
  const gs = classes.map((c) => (c ?? '').match(/^\s*(\d{1,2})\s*[/\-. ]?\s*[A-ZÇĞİÖŞÜ]?/i)?.[1]).filter((g): g is string => !!g).map(Number)
  if (!gs.length || gs.length < classes.length / 2) return null
  const top = [...new Set(gs)].map((g) => [g, gs.filter((x) => x === g).length] as const).sort((a, b) => b[1] - a[1])[0]!
  return top[0] !== 8 && top[1] > gs.length / 2 ? top[0] : null
}
