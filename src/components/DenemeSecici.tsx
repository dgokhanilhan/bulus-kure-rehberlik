// Analizin kapsadığı denemeler: bütün denemeler, yalnız son deneme ya da tek tek seçilenler (Sınıflar ve Sınıf analizi).
import { useState } from 'react'
import type { Exam } from '@/lib/analiz'
import { KAPSAM_TR, kapsamDenemeleri, type Kapsam } from '@/lib/denemeSecimi'
import { trD } from '@/lib/format'
import { Seg } from '@/components/Indicator'

export function useDenemeSecimi() {
  const [kapsam, setKapsam] = useState<Kapsam>('tum')
  const [secili, setSecili] = useState<string[]>([])
  return { kapsam, setKapsam, secili, setSecili, uygula: (exams: Exam[]) => kapsamDenemeleri(exams, kapsam, secili) }
}

export function DenemeSecici({ exams, s }: { exams: Exam[]; s: ReturnType<typeof useDenemeSecimi> }) {
  if (exams.length < 2) return null
  const aktif = new Set(s.uygula(exams).map((e) => e.id))
  const degis = (id: string) => {
    const now = s.kapsam === 'sec' ? [...aktif] : []
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
    s.setSecili(next)
  }
  return (
    <div className="a" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }} data-testid="deneme-secici">
      <div style={{ overflowX: 'auto', alignSelf: 'flex-start', maxWidth: '100%' }}>
        <Seg
          label="Analiz kapsamı"
          value={s.kapsam}
          onChange={(k) => {
            if (k === 'sec' && !s.secili.length) s.setSecili(exams.slice(-1).map((e) => e.id))
            s.setKapsam(k)
          }}
          options={(Object.keys(KAPSAM_TR) as Kapsam[]).map((k) => [k, k === 'tum' ? `${KAPSAM_TR.tum} (${exams.length})` : KAPSAM_TR[k]] as const)}
        />
      </div>
      {s.kapsam === 'sec' && (
        <div role="group" aria-label="Analize girecek denemeler" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {exams.map((e) => (
            <label key={e.id} className="chip n" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={aktif.has(e.id)} onChange={() => degis(e.id)} />
              <span>
                {e.name}
                <span className="m" style={{ fontSize: 12 }}> · {trD(e.exam_date)}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
