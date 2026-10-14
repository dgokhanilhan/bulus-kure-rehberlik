import { it, expect } from 'vitest'
// @ts-expect-error JS motor
import { liseItems, namedScores, bindItems, check } from '../public/engine/genel.mjs'
const line = (x: number, y: number, t: string) => ({ x, y, t })
const head = (label: string, y: number) => [line(18, y, 'N'), line(29, y, 'D'), line(40, y, 'Ö'), line(59, y, 'Doğru:'), line(249, y, label + '(A)')]
const row = (q: number, y: number, code: string, answer = 'B', mark = '+') => [
  line(18, y, String(q)),
  line(29, y, 'B'),
  ...(answer ? [line(40, y, answer)] : []),
  ...(mark ? [line(52, y, mark)] : []),
  line(62, y, code + ' Açıklama metni.'),
]
it('üst üste basılmış bloklar ve başlıksız üçüncü sayfa birbirine karışmaz', () => {
  const ps = [
    {
      lines: [
        ...head('TÜRK DİLİ', 230),
        ...row(1, 240, 'TDE.11.1.1.1'),
        ...row(2, 246, 'TDE.11.1.1.2', 'c', '-'),
        ...head('TARİH', 240),
        ...row(1, 250, 'TAR.11.1.1'),
      ],
      cs: [],
    },
    { lines: [...row(2, 10, 'TAR.11.1.2', '', '')], cs: [] },
  ]
  const qs = liseItems(ps)
  expect(qs.map((q: { label: string; rawCode: string }) => [q.label, q.rawCode])).toEqual([
    ['TÜRK DİLİ', 'TDE.11.1.1.1'],
    ['TÜRK DİLİ', 'TDE.11.1.1.2'],
    ['TARİH', 'TAR.11.1.1'],
    ['TARİH', 'TAR.11.1.2'],
  ])
  const sections = [
    { label: 'TÜRK DİLİ', n: 2, d: 1, y: 1, b: 0, net: 0.75 },
    { label: 'TARİH', n: 2, d: 1, y: 0, b: 1, net: 1 },
  ]
  expect(check({ sections, items: bindItems(sections, qs), warnings: [] }, 4)).toEqual([])
})
it('Hız alan puanları birleşik veya ayrı hücrelerden okunur', () => {
  expect(
    namedScores({
      lines: [
        line(371, 208, 'Sayısal : 312.985'),
        line(371, 222, 'Eşit Ağır. :263.056'),
        line(371, 238, 'Sözel :'),
        line(422, 239, '327.917'),
        line(490, 223, '180.000'),
      ],
    }),
  ).toEqual({ SAY: 312.985, EA: 263.056, SOZ: 327.917 })
})
