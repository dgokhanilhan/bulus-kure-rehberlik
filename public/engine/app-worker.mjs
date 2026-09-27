// Deneme Köprüsü motoru — Web Worker (PDF tarayıcıda okunur, sunucuya ham hâlde gitmez).
// Uygulama kaynağı AGPL-3.0-or-later; MuPDF (AGPL) ./mupdf altında.
const enginePromise = import('./parser.mjs')
let cat
self.onmessage = async ({ data }) => {
  try {
    const { parsePDF, importPack } = await enginePromise
    cat ??= (await (await fetch(new URL('./catalog.json', import.meta.url))).json()).outcomes
    const result =
      data.kind === 'json'
        ? importPack(JSON.parse(data.text), cat)
        : await parsePDF(data.bytes, data.name, cat, (page, total) => self.postMessage({ id: data.id, progress: { page, total } }))
    self.postMessage({ id: data.id, result })
  } catch (e) {
    self.postMessage({ id: data.id, error: e?.message || 'Dosya işlenemedi.' })
  }
}
