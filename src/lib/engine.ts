// Legacy Deneme Köprüsü motorunu Web Worker'da çalıştırır (public/engine/app-worker.mjs).
import type { DkPack } from './deneme'

let worker: Worker | null = null
let seq = 0
const MAX = 30 * 1024 * 1024

export async function readExamFile(file: File, onProgress?: (page: number, total: number) => void): Promise<DkPack> {
  if (file.size > MAX) throw new Error('Dosya en fazla 30 MB olabilir.')
  const isJson = /\.json$/i.test(file.name) || file.type === 'application/json'
  if (!isJson && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Yalnız PDF (ya da Deneme Köprüsü JSON paketi) yüklenebilir.')
  worker ??= new Worker('/engine/app-worker.mjs', { type: 'module' })
  const id = ++seq
  const w = worker
  const msg = isJson ? { id, kind: 'json', text: await file.text() } : { id, kind: 'pdf', name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }
  return new Promise((resolve, reject) => {
    const onMsg = ({ data }: MessageEvent) => {
      if (data.id !== id) return
      if (data.progress) return onProgress?.(data.progress.page, data.progress.total)
      w.removeEventListener('message', onMsg)
      if (data.error) reject(new Error(data.error))
      else resolve(data.result as DkPack)
    }
    const onErr = (e: ErrorEvent) => {
      w.removeEventListener('message', onMsg)
      worker = null
      reject(new Error(`PDF okuma motoru başlatılamadı${e.message ? `: ${e.message}` : ''}.`))
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr, { once: true })
    w.postMessage(msg)
  })
}
