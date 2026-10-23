// Öğrenci dosyası → Etüt: öğrencinin Cumartesi etütleri (tarih, ders saati, öğretmen, konu, yoklama). Rehber öğretmen / yönetici
// buradan bu öğrenciye etüt planlar (GrupEtut; konu önerisi öğrencinin denemelerde yanlış yaptığı kazanımlardan).
// Okuma RLS'te: rehber/yönetici taslak programı da görür, öğretmen yalnız yayındakini.
import { useState } from 'react'
import { useEtutOgrenci } from '@/lib/etutData'
import { todayISO, trDW } from '@/lib/format'
import { kademeOfGrade, type KonuKaynak } from '@/lib/etutGrup'
import { Icon } from './Icon'
import { GrupEtut } from './GrupEtut'

export function EtutTab(p: { sid: string; ad: string; className: string; grade: number | null | undefined; planlar: boolean; konular: KonuKaynak[] }) {
  const q = useEtutOgrenci(p.sid)
  const [plan, setPlan] = useState(false)
  const today = todayISO()
  const kademe = kademeOfGrade(p.grade)
  const list = q.data ?? []
  const gelecek = list.filter((x) => (x.etut_gunler?.tarih ?? '') >= today)
  const gecmis = list.filter((x) => (x.etut_gunler?.tarih ?? '') < today).reverse()
  const gelmedi = gecmis.filter((x) => x.yoklama === 'gelmedi').length

  const Satir = ({ x }: { x: (typeof list)[number] }) => {
    const g = x.etut_gunler
    const s = g?.saatler[x.ders - 1]
    return (
      <div className="kv" data-testid="ogr-etut">
        <span style={{ minWidth: 0 }}>
          <b>
            {g ? trDW(g.tarih) : ''} · {x.ders}. ders{s ? ` (${s.bas}–${s.bit})` : ''}
          </b>
          <span className="m" style={{ display: 'block', fontSize: 13 }}>
            {[x.etut_hucreler?.konu, x.etut_hucreler?.teacher_name].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="btns" style={{ gap: 4 }}>
          {g?.durum === 'taslak' && <span className="chip n">Taslak</span>}
          {x.yoklama === 'geldi' && <span className="chip up">Geldi</span>}
          {x.yoklama === 'gelmedi' && <span className="chip down">Gelmedi</span>}
        </span>
      </div>
    )
  }

  return (
    <section className="card a" style={{ padding: 20, display: 'grid', gap: 12 }} aria-label="Etütler">
      <div className="kv" style={{ alignItems: 'center' }}>
        <h2 className="sec" style={{ margin: 0 }}>
          Etütler
        </h2>
        {p.planlar && kademe && (
          <button className="btn gold" onClick={() => setPlan(true)}>
            <Icon name="cal" size={16} /> Etüt planla
          </button>
        )}
      </div>
      {q.isLoading ? (
        <p className="m">
          <span className="spinner" aria-hidden="true" /> Yükleniyor…
        </p>
      ) : q.isError ? (
        <p className="m">Etütler yüklenemedi. Sayfayı yenileyip tekrar dene.</p>
      ) : !list.length ? (
        <p className="m">Henüz etüt yok.</p>
      ) : (
        <>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Yaklaşan ({gelecek.length})</span>
            {gelecek.length ? gelecek.map((x) => <Satir key={x.id} x={x} />) : <span className="m">Yaklaşan etüt yok.</span>}
          </div>
          {gecmis.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">
                Geçmiş ({gecmis.length}){gelmedi ? ` · ${gelmedi} etütte gelmedi` : ''}
              </span>
              {gecmis.slice(0, 20).map((x) => (
                <Satir key={x.id} x={x} />
              ))}
            </div>
          )}
        </>
      )}
      {plan && kademe && (
        <GrupEtut
          baslik={`${p.ad} · ${p.className}`}
          kademe={kademe}
          konular={p.konular}
          secili={p.konular.slice(0, 1).map((k) => k.code)}
          denemeler={[]}
          ogrenciAdi={(id) => (id === p.sid ? p.ad : '')}
          sabitOgrenciler={[p.sid]}
          onClose={() => setPlan(false)}
        />
      )}
    </section>
  )
}
