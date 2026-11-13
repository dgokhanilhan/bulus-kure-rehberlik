// Öğretmenler Odası: öğretmenlerin ortak alanı. Ad kademeye göre ("Ortaokul Öğretmenler Odası", "Ortaokul/Lise …").
// Sekmeler: Oda (özet ve "Bugün okulda"), Öğrenci Takip, Sohbet. Veli ve öğrenci bu sayfayı göremez (menü + RLS).
import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCalendar, useMeals, useModules } from '@/lib/data'
import { addDays, isoDow, todayISO, trDM, trDW } from '@/lib/format'
import { odaAdi } from '@/lib/oda'
import { useBugunNobet, useOdaCanli, useOdaKanallari, useOdaOkunmamis } from '@/lib/odaData'
import { useIndicator } from '@/components/Indicator'
import { Icon } from '@/components/Icon'
import { VeriDurumu } from '@/components/VeriDurumu'

const OdaOgrenciTakip = lazy(() => import('./OdaOgrenciTakip'))
const OdaSohbet = lazy(() => import('./OdaSohbet'))

const TABS = [
  ['oda', 'Oda'],
  ['takip', 'Öğrenci Takip'],
  ['sohbet', 'Sohbet'],
] as const
type Tab = (typeof TABS)[number][0]

const Bekle = () => (
  <p className="m" style={{ padding: 20 }}>
    <span className="spinner" aria-hidden="true" /> Yükleniyor…
  </p>
)

export default function OgretmenlerOdasi() {
  const [sp, setSp] = useSearchParams()
  const tab = (TABS.find(([k]) => k === sp.get('sekme'))?.[0] ?? 'oda') as Tab
  const setTab = (t: Tab) => setSp(t === 'oda' ? {} : { sekme: t }, { replace: true })
  const kanallar = useOdaKanallari()
  const okunmamis = useOdaOkunmamis()
  useOdaCanli(true)
  const tabs = useIndicator<HTMLDivElement>(tab)
  const toplam = Object.values(okunmamis.data ?? {}).reduce((a, b) => a + b, 0)
  const ad = odaAdi(kanallar.data ?? [])

  return (
    <>
      <div className="head a">
        <h1 className="hd">{kanallar.isLoading ? 'Öğretmenler Odası' : ad}</h1>
      </div>
      <div className="tabs a" style={{ ['--d' as string]: 1 }} role="tablist" aria-label="Öğretmenler Odası" ref={tabs.ref}>
        {tabs.ind}
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {l}
            {id === 'sohbet' && toplam > 0 && tab !== 'sohbet' && (
              <span className="oda-rozet" aria-label={`${toplam} okunmamış`}>
                {toplam}
              </span>
            )}
          </button>
        ))}
      </div>
      {kanallar.isError ? (
        <VeriDurumu sorgular={[kanallar]} padding={16} />
      ) : (
        <Suspense fallback={<Bekle />}>
          {tab === 'oda' && <OdaGiris okunmamis={toplam} onTab={setTab} />}
          {tab === 'takip' && <OdaOgrenciTakip />}
          {tab === 'sohbet' && (kanallar.isLoading ? <Bekle /> : <OdaSohbet kanallar={kanallar.data ?? []} />)}
        </Suspense>
      )}
    </>
  )
}

const PERIOD_TR = { before_noon: 'Öğleden önce', after_noon: 'Öğleden sonra' } as const
const LOC_TR: Record<string, string> = { kantin: 'Kantin', arka_bahce: 'Arka bahçe', lise_1: '1. kat lise', orta_56: '2. kat 5/6', orta_78: '2. kat 7/8' }

function OdaGiris({ okunmamis, onTab }: { okunmamis: number; onTab: (t: Tab) => void }) {
  const mods = useModules()
  const bugun = todayISO()
  const nobet = useBugunNobet(isoDow(bugun))
  const yemek = useMeals(bugun, bugun)
  const takvim = useCalendar(bugun, addDays(bugun, 7))
  const ogle = mods.yemek ? (yemek.data ?? []).find((m) => m.day === bugun) : undefined
  const olaylar = mods.takvim ? (takvim.data ?? []).slice(0, 6) : []

  return (
    <div className="oda-giris">
      <div className="oda-kutucuklar">
        <button type="button" className="card oda-kutu a" style={{ ['--d' as string]: 2 }} onClick={() => onTab('takip')}>
          <span className="oda-ikon">
            <Icon name="users" size={22} />
          </span>
          <b>Öğrenci Takip</b>
          <span className="m">Seçtiğin sınıflarda net, ödev, devamsızlık, günlük kontrol ve notlar tek tabloda.</span>
          <span className="oda-git">
            Aç <Icon name="right" size={16} />
          </span>
        </button>
        <button type="button" className="card oda-kutu a" style={{ ['--d' as string]: 3 }} onClick={() => onTab('sohbet')}>
          <span className="oda-ikon">
            <Icon name="chat" size={22} />
          </span>
          <b>Sohbet</b>
          <span className="m">Öğretmenler arasında canlı sohbet: genel, kademe ve zümre kanalları. Mesajlar 30 gün saklanır.</span>
          <span className="oda-git">
            {okunmamis > 0 ? <span className="chip gold">{okunmamis} yeni mesaj</span> : 'Aç'} <Icon name="right" size={16} />
          </span>
        </button>
      </div>

      <section className="card a oda-bugun" style={{ ['--d' as string]: 4 }}>
        <div className="kv">
          <h2 className="sec">Bugün okulda</h2>
          <span className="m" style={{ fontSize: 13 }}>
            {trDW(bugun)}
          </span>
        </div>
        <ul className="oda-bugun-liste">
          <li>
            <span className="oda-bugun-ikon">
              <Icon name="flag" size={18} />
            </span>
            <span>
              <b>Nöbetin</b>
              <span className="m" style={{ display: 'block' }}>
                {nobet.isLoading
                  ? 'Yükleniyor…'
                  : nobet.data?.length
                    ? nobet.data.map((d) => `${PERIOD_TR[d.period]} · ${LOC_TR[d.location] ?? d.location}`).join(', ')
                    : 'Bugün nöbetin yok.'}
              </span>
            </span>
          </li>
          {mods.yemek && (
            <li>
              <span className="oda-bugun-ikon">
                <Icon name="sun" size={18} />
              </span>
              <span>
                <b>Öğle yemeği</b>
                <span className="m" style={{ display: 'block' }}>
                  {yemek.isLoading ? 'Yükleniyor…' : ogle ? ogle.items.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean).join(' · ') : 'Bugün için yemek listesi girilmemiş.'}
                </span>
              </span>
            </li>
          )}
          {mods.takvim && (
            <li>
              <span className="oda-bugun-ikon">
                <Icon name="cal" size={18} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <b>Önümüzdeki 7 gün</b>
                {takvim.isLoading ? (
                  <span className="m" style={{ display: 'block' }}>
                    Yükleniyor…
                  </span>
                ) : olaylar.length ? (
                  <span className="oda-olaylar">
                    {olaylar.map((e) => (
                      <span key={e.id} className="oda-olay">
                        <span className="mono m">
                          {e.starts_on === bugun ? 'Bugün' : trDM(e.starts_on)}
                          {e.starts_at ? ` ${e.starts_at.slice(0, 5)}` : ''}
                        </span>
                        <span className="oda-kirp">{e.title}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="m" style={{ display: 'block' }}>
                    Takvimde yaklaşan etkinlik yok.
                  </span>
                )}
              </span>
            </li>
          )}
        </ul>
      </section>
    </div>
  )
}
