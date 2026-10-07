type ProgramCourse = { id: string; name: string; short_name: string; active: boolean }
export type Point = { x: number; y: number }
export type ProgramCell = { weekday: number; period: number; text: string; confidence: number }
export const codeKey = (s: string) => s.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/İ/g, 'I').replace(/[^A-Z0-9]/g, '')
// Yalnız kullanıcı tarafından açıklanmış kısaltmalar ve açık ders adları.
const aliases: Record<string, string> = { M: 'Matematik', MU: 'Matematik', MATEMATIK: 'Matematik', REH: 'Rehberlik', ENG: 'İngilizce', SD: 'Seçmeli Ders', TURKCE: 'Türkçe', FEN: 'Fen Bilimleri', SOSYAL: 'Sosyal Bilgiler', DIN: 'Din Kültürü ve Ahlak Bilgisi', BEDEN: 'Beden Eğitimi', MUZIK: 'Müzik', ALMANCA: 'Almanca', BIYOLOJI: 'Biyoloji', KIMYA: 'Kimya', TARIH: 'Tarih', COGRAFYA: 'Coğrafya', FELSEFE: 'Felsefe' }
export function matchProgramCourse(text: string, courses: ProgramCourse[]): string {
  const key = codeKey(text)
  if (!key) return ''
  const target = aliases[key]
  const targets = target === 'Rehberlik' ? ['Rehberlik','Rehberlik ve Yönlendirme'] : target === 'Seçmeli Ders' ? ['Seçmeli Ders','Seçmeli'] : target ? [target] : []
  const fits = courses.filter((c) => c.active && (codeKey(c.name) === key || (!target && codeKey(c.short_name) === key) || targets.some((t) => codeKey(c.name) === codeKey(t))))
  return fits.length === 1 ? fits[0]!.id : ''
}
export function validCorners(points: Point[]): boolean {
  if (points.length !== 4 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false
  const crosses = points.map((p, i) => {
    const q = points[(i + 1) % 4]!, r = points[(i + 2) % 4]!
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)
  })
  return crosses.every((c) => c > 0.002)
}
/** Dört seçili köşeyi düz tabloya taşır; fotoğraf cihazdan çıkmaz. */
export function rectifyProgram(image: HTMLImageElement, points: Point[]): HTMLCanvasElement {
  if (!validCorners(points)) throw new Error('Köşeleri sol üst, sağ üst, sağ alt, sol alt sırasıyla seç.')
  const source = document.createElement('canvas')
  source.width = image.naturalWidth; source.height = image.naturalHeight
  source.getContext('2d')!.drawImage(image, 0, 0)
  const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
  const [a, b, c, d] = points as [Point, Point, Point, Point]
  const distance = (p: Point, q: Point) => Math.hypot((p.x-q.x)*source.width, (p.y-q.y)*source.height)
  const width = (distance(a,b)+distance(d,c))/2, height = (distance(a,d)+distance(b,c))/2
  const scale = 2200 / Math.max(width,height)
  const canvas = document.createElement('canvas'); canvas.width = Math.round(width*scale); canvas.height = Math.round(height*scale)
  const ctx = canvas.getContext('2d')!, out = ctx.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / (canvas.width - 1), v = y / (canvas.height - 1)
    const sx = Math.min(source.width - 1, Math.round(((1-u)*(1-v)*a.x+u*(1-v)*b.x+u*v*c.x+(1-u)*v*d.x) * (source.width - 1)))
    const sy = Math.min(source.height - 1, Math.round(((1-u)*(1-v)*a.y+u*(1-v)*b.y+u*v*c.y+(1-u)*v*d.y) * (source.height - 1)))
    const from = (sy * source.width + sx) * 4, to = (y * canvas.width + x) * 4
    out.data.set(pixels.data.subarray(from, from + 4), to)
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}
export async function readProgramImage(canvas: HTMLCanvasElement, periods: number, days: number, progress: (n: number) => void, signal: AbortSignal): Promise<ProgramCell[]> {
  if (signal.aborted) throw new Error('İşlem iptal edildi.')
  const { createWorker, PSM } = await import('tesseract.js')
  if (signal.aborted) throw new Error('İşlem iptal edildi.')
  if (!Number.isInteger(periods) || periods < 1 || periods > 20 || !Number.isInteger(days) || days < 1 || days > 6 || canvas.width/periods < 24 || canvas.height/days < 24) throw new Error('Tablo alanı çok dar. Ders hücrelerinin tamamını seç.')
  const base = `${location.origin}/program-ocr`
  let cancel!: () => void
  const interrupted = new Promise<never>((_, reject) => { cancel = () => reject(new Error('İşlem iptal edildi.')) })
  const pending = createWorker('tur+eng', 1, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, workerBlobURL: false })
  let worker: Awaited<typeof pending> | undefined
  // Yükleme henüz bitmeden iptal edilirse geç gelen çalışan da kapatılır.
  void pending.then((w) => { if (signal.aborted) void w.terminate() }, () => {})
  const abort = () => { cancel() }
  signal.addEventListener('abort', abort, { once: true })
  const cancellable = <T>(p: Promise<T>) => Promise.race([p, interrupted])
  try {
    worker = await cancellable(pending)
    await cancellable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK }))
    const cells: ProgramCell[] = []
    for (let day = 0; day < days; day++) for (let p = 0; p < periods; p++) {
      if (signal.aborted) throw new Error('İşlem iptal edildi.')
      // Küçük öğretmen isimleri hücrenin alt bölümünde; yalnız ders adının bölgesini oku.
      const crop = document.createElement('canvas')
      crop.width = Math.floor(canvas.width/periods-16); crop.height = Math.floor(canvas.height/days*0.72-8)
      const ctx = crop.getContext('2d')!
      ctx.drawImage(canvas, Math.round(p*canvas.width/periods+8), Math.round(day*canvas.height/days+8), crop.width, crop.height, 0, 0, crop.width, crop.height)
      const pixels = ctx.getImageData(0,0,crop.width,crop.height).data
      let ink = 0
      for (let i=0;i<pixels.length;i+=4) if ((pixels[i]!+pixels[i+1]!+pixels[i+2]!)/3 < 110) ink++
      let result = { data: { text: '', confidence: 100 } }
      if (ink / (crop.width*crop.height) > 0.002) {
        result = await cancellable(worker.recognize(crop))
        if (!result.data.text.trim()) {
          await cancellable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD }))
          result = await cancellable(worker.recognize(crop))
          await cancellable(worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK }))
        }
      }
      const text = result.data.text.trim().split('\n').slice(0, 3).join(' ').replace(/[^\p{L}\p{N}\- /]/gu, '').trim()
      cells.push({ weekday: day + 1, period: p + 1, text, confidence: result.data.confidence })
      progress(Math.round(cells.length / (days*periods) * 100))
    }
    return cells
  } finally { signal.removeEventListener('abort', abort); await worker?.terminate() }
}
