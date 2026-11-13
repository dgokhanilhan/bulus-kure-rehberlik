// Günlük kontrol (0067) okuma görünümleri: veli/öğrenci Okul sayfasındaki kart ve öğretmen/rehberlik için öğrenci sekmesi.
// O günün eksiği kırmızı kutuda; ertesi gün normal listeye geçer. Sınıf sıralaması ya da kıyas yok (CLAUDE.md kural 3).
import { useMemo } from 'react'
import { usePeople } from '@/lib/data'
import { todayISO, trDW } from '@/lib/format'
import { ayBasi, ayOzeti, donemBasi, type Kayit } from '@/lib/gunlukKontrol'
import { useGunlukKontrol, useGunlukMaddeler } from '@/lib/gunlukKontrolData'
import { Icon } from '@/components/Icon'
import { Dropdown } from '@/components/Indicator'


/** Veli ve öğrenci: Okul sayfasında Devamsızlık'ın altındaki kart */
export function GunlukKontrolKart({ sid, veli, delay = 4 }: { sid: string; veli: boolean; delay?: number }) {
  const bugun = todayISO()
  const q = useGunlukKontrol([sid], ayBasi(bugun), bugun)
  const gm = useGunlukMaddeler()
  const cumle = (k: Kayit) => (k.detay ? `${gm.ad(k.madde)}: ${k.detay}` : gm.cumle(k.madde))
  const o = ayOzeti(q.data ?? [], bugun)
  const sub = o.bugun.length ? `Bugün ${o.bugun.length} eksik · bu ay ${o.toplam}` : o.toplam ? `Bu ay ${o.toplam} eksik` : 'Bu ay eksik görülmedi'
  return (
    <Dropdown
      key={o.bugun.length ? 'bugun' : 'normal'}
      title="Günlük kontrol"
      sub={sub}
      icon={<Icon name="check" size={22} />}
      delay={delay}
      defaultOpen={o.bugun.length > 0}
      right={o.bugun.length ? <span className="chip gk-k">Bugün {o.bugun.length}</span> : undefined}
    >
      <div data-testid="gk-kart" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {o.bugun.length > 0 && (
          <div className="gk-bugun" data-testid="gk-bugun">
            <b style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
              <Icon name="x" size={16} stroke={2.4} /> Bugün · {trDW(bugun)}
            </b>
            {o.bugun.map((k) => (
              <div key={k.id} style={{ fontSize: 14, marginTop: 4 }}>
                {cumle(k)}
                {k.veli_uyarildi && (
                  <div className="gk-kirmizi" style={{ fontSize: 13 }}>
                    Bu ay {k.sira}. kez{veli ? ' · size uyarı bildirimi gönderildi' : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {o.toplam > 0 && (
          <div className="btns" style={{ gap: 6 }}>
            {gm.liste.filter(({ kod: m }) => o.sayac[m]).map(({ kod: m, ad: t }) => (
              <span key={m} className={`chip ${gm.aralik > 0 && (o.sayac[m] ?? 0) >= gm.aralik ? 'gk-k' : 'n'}`}>
                {t} · bu ay {o.sayac[m]}
              </span>
            ))}
          </div>
        )}
        {o.liste
          .filter((k) => k.tarih !== bugun)
          .slice(0, 12)
          .map((k) => (
            <div key={k.id} className="kv" data-testid="gk-gecmis">
              <span className="m">{trDW(k.tarih)}</span>
              <span style={{ textAlign: 'right' }}>{cumle(k)}</span>
            </div>
          ))}
        {!o.toplam && (
          <span className="m" style={{ fontSize: 13 }}>
            Bu ay işaretlenmiş eksik yok.
          </span>
        )}
        <span className="m" style={{ fontSize: 12 }}>
          Öğretmenler yalnız eksik olanı işaretler.{gm.aralik > 0 ? ` Aynı eksik ay içinde ${gm.aralik}. kez olursa veliye bildirim gider.` : ''}
        </span>
      </div>
    </Dropdown>
  )
}

/** Öğretmen ve rehberlik: öğrenci sayfasındaki "Günlük kontrol" sekmesi (bu eğitim yılı, aylara göre) */
export function GunlukKontrolSekme({ sid }: { sid: string }) {
  const bugun = todayISO()
  const q = useGunlukKontrol([sid], donemBasi(bugun), bugun)
  const people = usePeople()
  const gm = useGunlukMaddeler()
  const kisi = (id: string | null) => {
    const p = people.data?.find((x) => x.id === id)
    return p ? `${p.full_name}${p.branch ? ` · ${p.branch}` : ''}` : '—'
  }
  const aylar = useMemo(() => [...new Set((q.data ?? []).map((k) => k.tarih.slice(0, 7)))].sort().reverse(), [q.data])
  if (q.isLoading) return <div className="m a">Yükleniyor…</div>
  if (!aylar.length)
    return (
      <div className="empty a" data-testid="gk-sekme">
        Bu eğitim yılında işaretlenmiş eksik yok. Eksikler Öğrenciler → sınıf → Günlük kontrol'den işaretlenir.
      </div>
    )
  return (
    <div className="stack" data-testid="gk-sekme">
      {aylar.map((a, i) => {
        const o = ayOzeti(q.data ?? [], bugun, `${a}-01`)
        const ayAdi = new Date(`${a}-15T12:00:00Z`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        return (
          <section key={a} className="card a" style={{ ['--d' as string]: i }}>
            <div className="btns" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{ayAdi}</h3>
              <span className="m">{o.toplam} kayıt</span>
            </div>
            <div className="btns" style={{ gap: 6, marginTop: 8 }}>
              {gm.liste.filter((x) => x.aktif || o.sayac[x.kod]).map(({ kod: m, ad: t }) => {
                const n = o.sayac[m] ?? 0
                const uyari = gm.aralik > 0 && n >= gm.aralik
                return (
                  <span key={m} className={`chip ${uyari ? 'gk-k' : n ? 'n' : 'up'}`}>
                    {t} · {n ? `${n} kez${uyari ? ' · veliye uyarı' : ''}` : 'eksik yok'}
                  </span>
                )
              })}
            </div>
            {o.liste.map((k) => (
              <div key={k.id} className="kv" style={{ flexWrap: 'wrap', gap: 8 }}>
                <span className="m" style={{ minWidth: 150 }}>
                  {trDW(k.tarih)}
                </span>
                <span style={{ flex: 1 }}>
                  {gm.ad(k.madde)}
                  {k.detay && <span className="m"> · {k.detay}</span>}
                  {k.veli_uyarildi && <span className="chip gk-k" style={{ marginLeft: 6 }}>Veliye uyarı · {k.sira}.</span>}
                </span>
                <span className="m">{kisi(k.teacher_id)}</span>
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
