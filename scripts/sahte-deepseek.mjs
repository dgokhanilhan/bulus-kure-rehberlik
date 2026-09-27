// Yerel sahte DeepSeek (OpenAI uyumlu) sunucusu — YALNIZ geliştirme ve testler için.
// Edge Function'lar supabase/functions/.env içindeki DEEPSEEK_BASE_URL ile buraya bağlanır.
// Kontrol uçları: GET /__log (yakalanan istekler), POST /__mode {"mode":"ok"|"bad"|"down"}, POST /__reset
import { createServer } from 'node:http'

export const PORT = Number(process.env.SAHTE_DEEPSEEK_PORT ?? 54399)
let mode = 'ok'
let log = []

const fold = (s) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/i̇/g, 'i')
function lev(a, b) {
  const m = [...Array(b.length + 1).keys()]
  for (let i = 1; i <= a.length; i++) {
    let p = m[0]
    m[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = m[j]
      m[j] = Math.min(m[j] + 1, m[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1))
      p = t
    }
  }
  return m[b.length]
}

function answer(body) {
  const sys = body.messages?.[0]?.content ?? ''
  const data = JSON.parse(body.messages?.[1]?.content ?? '{}').veri ?? {}
  if (sys.includes('okul listesindeki')) {
    const matches = (data.okunan ?? []).map((raw) => {
      const best = (data.liste ?? []).map((n) => ({ n, d: lev(fold(raw), fold(n)) })).sort((a, b) => a.d - b.d)[0]
      return best && best.d <= 3 ? { raw, match: best.n, sure: true } : { raw, match: null, sure: false }
    })
    return { matches }
  }
  // Veli raporu: verideki sayılarla tutarlı, {AD} yer tutuculu metin
  const up = (data.gecmis?.length ?? 0) > 1 && data.toplamNet >= data.gecmis.at(-2).toplamNet
  const rep = data.guvenilirTekrarEdenHatalar?.[0]
  const bad = mode === 'bad' ? ' Bu öğrenci matematikte başarısız.' : ''
  return {
    genel: `{AD} ${data.sonDeneme} sonucunda toplam netini ${String(data.toplamNet).replace('.', ',')} olarak aldı. ${up ? 'Önceki denemeye göre olumlu bir yön görüyoruz.' : 'Önceki denemeye göre bir miktar geri çekilme var; tek denemeden kesin sonuç çıkarmıyoruz.'} Önümüzdeki haftalarda öncelikli birkaç alana odaklanarak istikrarlı ilerlemeyi hedefliyoruz.${bad}`,
    guclu: `${data.dersler?.slice().sort((a, b) => (b.net ?? 0) / b.soru - (a.net ?? 0) / a.soru)[0]?.ders ?? 'Derslerde'} tarafında öğrencimiz rahat görünüyor.`,
    gelisim: rep ? `${rep.ders} dersinde ${rep.konu.toLocaleLowerCase('tr')} konusu ${rep.kacDenemedeYanlis} denemede tekrar ediyor.` : 'Yanlışlar belirli bir konuda toplanmıyor.',
    oneriler: ['Yanlış sorular hafta içinde yeniden çözülmeli.', rep ? `${rep.konu} için kısa bir tarama testi uygulanabilir.` : 'Denemeden sonra yanlışlar bir deftere yazılabilir.', 'Her güne kısa ve düzenli bir soru çözüm zamanı ayrılabilir.'],
    mentorOneri: '{AD} ile çalışma planını birlikte gözden geçireceğiz.',
  }
}

export function start() {
  const srv = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      if (req.url === '/__log') return send(200, log)
      if (req.url === '/__reset') return (log = [], (mode = 'ok'), send(200, { ok: true }))
      if (req.url === '/__mode') return ((mode = JSON.parse(raw || '{}').mode ?? 'ok'), send(200, { mode }))
      if (req.url === '/chat/completions' && req.method === 'POST') {
        const body = JSON.parse(raw || '{}')
        log.push({ headers: { authorization: req.headers.authorization ? 'Bearer ***' : null }, body })
        if (mode === 'down') return send(500, { error: 'down' })
        return send(200, { choices: [{ message: { content: JSON.stringify(answer(body)) } }], usage: { prompt_tokens: 900, completion_tokens: 400 } })
      }
      send(404, { error: 'not found' })
    })
  })
  return new Promise((resolve, reject) => {
    srv.once('error', reject)
    srv.listen(PORT, '0.0.0.0', () => resolve(srv))
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await start()
  console.log(`sahte DeepSeek: http://localhost:${PORT} (yalnız yerel)`)
}
