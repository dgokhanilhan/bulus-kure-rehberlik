// Genel deneme motoru — Web Worker (PDF tarayıcıda okunur, sunucuya ham hâlde gitmez). Mevcut LGS motoru (app-worker.mjs) ayrı.
// Uygulama kaynağı AGPL-3.0-or-later; MuPDF (AGPL) ./mupdf altında.
const enginePromise = import('./genel.mjs')
self.onmessage = async ({ data }) => {
  try {
    const { parseGeneral } = await enginePromise
    const result = await parseGeneral(data.bytes, data.name, data.hints || {}, (page, total) => self.postMessage({ id: data.id, progress: { page, total } }))
    self.postMessage({ id: data.id, result })
  } catch (e) {
    self.postMessage({ id: data.id, error: e?.message || 'Dosya işlenemedi.' })
  }
}
