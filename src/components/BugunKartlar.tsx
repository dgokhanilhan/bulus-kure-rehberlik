// Bugün 2.0 (öğretmen / yönetici): günün akışı, yapılacaklar ve "Bu hafta okulda". Veli ve öğrenci ekranları bunu kullanmaz.
// Her öğe ilgili ekrana gider; veri yoksa kart sessizce gizlenir (uydurma yok).
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { EVENT_TR, useCalendar, useConversations, useMeetings, useModules, useStudents } from '@/lib/data'
import { useEtutBenim } from '@/lib/etutData'
import { useBugunNobet } from '@/lib/odaData'
import { usePendingCount } from './Shell'
import { WITH_SHORT } from './Meetings'
import { addDays, isoDow, localDate, localHM, todayISO, trDM, weekStart } from '@/lib/format'

const NOBET_YER: Record<string, string> = { kantin: 'Kantin', arka_bahce: 'Arka bahçe', lise_1: '1. kat lise', orta_56: '2. kat 5/6', orta_78: '2. kat 7/8' }

interface AkisOge {
  key: string
  saat: string | null
  sira: string
  ad: string
  alt: string
  git: string
}

/** Bugünün akışı: nöbet, etüt, görüşme, takvim etkinliği (saate göre). */
function useGununAkisi(): AkisOge[] {
  const { profile } = useAuth()
  const mods = useModules()
  const bugun = todayISO()
  const nobet = useBugunNobet(isoDow(bugun))
  const etut = useEtutBenim(mods.etut ? profile?.id : null)
  const gorusme = useMeetings()
  const takvim = useCalendar(bugun, bugun)
  const ogr = useStudents()
  return useMemo(() => {
    const ad = (sid: string) => ogr.data?.find((s) => s.id === sid)
    const l: AkisOge[] = []
    for (const n of nobet.data ?? [])
      l.push({
        key: `n-${n.period}`,
        saat: null,
        sira: n.period === 'before_noon' ? '07:59' : '12:00',
        ad: 'Nöbet',
        alt: `${n.period === 'before_noon' ? 'Öğleden önce' : 'Öğleden sonra'} · ${NOBET_YER[n.location] ?? n.location}`,
        git: '/ogretmenler-odasi',
      })
    for (const h of etut.data ?? []) {
      if (h.etut_gunler?.tarih !== bugun) continue
      const s = h.etut_gunler.saatler[h.ders - 1]
      l.push({
        key: `e-${h.id}`,
        saat: s?.bas ?? null,
        sira: s?.bas ?? '99',
        ad: 'Etüt',
        alt: [h.konu, `${h.etut_ogrenciler.length} öğrenci`, h.salon].filter(Boolean).join(' · '),
        git: '/etut',
      })
    }
    for (const g of gorusme.data ?? []) {
      if (localDate(g.starts_at) !== bugun) continue
      const s = ad(g.student_id)
      l.push({
        key: `g-${g.id}`,
        saat: localHM(g.starts_at),
        sira: localHM(g.starts_at),
        ad: g.with_whom === 'ogrenci' ? 'Görüşme' : `${WITH_SHORT[g.with_whom]} görüşmesi`,
        alt: s ? `${s.full_name} · ${s.class_name}` : 'Öğrenci',
        git: `/ogrenciler/${g.student_id}?sekme=gorusmeler`,
      })
    }
    if (mods.takvim)
      for (const e of takvim.data ?? []) {
        if (e.taslak || e.type === 'tatil') continue
        l.push({
          key: `t-${e.id}`,
          saat: e.starts_at?.slice(0, 5) ?? null,
          sira: e.starts_at?.slice(0, 5) ?? '00:00',
          ad: e.title,
          alt: [EVENT_TR[e.type], e.location].filter(Boolean).join(' · '),
          git: '/takvim',
        })
      }
    return l.sort((a, b) => a.sira.localeCompare(b.sira))
  }, [nobet.data, etut.data, gorusme.data, takvim.data, ogr.data, mods.takvim, bugun])
}

export function GununAkisi() {
  const l = useGununAkisi()
  const nav = useNavigate()
  if (!l.length) return null
  const simdi = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  const siradaki = l.find((x) => x.saat && x.saat >= simdi)?.key
  return (
    <section className="a" style={{ ['--d' as string]: 1 }} aria-labelledby="bg-akis-b">
      <h2 className="label" id="bg-akis-b" style={{ margin: '0 0 6px' }}>
        Günün akışı
      </h2>
      <ul className="bg-akis" data-testid="gunun-akisi">
        {l.map((x) => (
          <li key={x.key}>
            <button type="button" className={`bg-oge${x.key === siradaki ? ' simdi' : ''}`} onClick={() => nav(x.git)}>
              <span className="bg-saat">
                {x.saat ?? (x.ad === 'Nöbet' ? 'Nöbet' : 'Gün boyu')}
                {x.key === siradaki ? ' · sıradaki' : ''}
              </span>
              <b>{x.ad}</b>
              <span className="m" style={{ fontSize: 12 }}>
                {x.alt}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface Is {
  key: string
  ad: string
  alt: string
  dugme: string
  git: string
}

/** Yapılacaklar: onay bekleyen kayıt, sonucu yüklenmemiş deneme, kontrol edilmemiş ödev, okunmamış veli mesajı. */
export function Yapilacaklar() {
  const { profile } = useAuth()
  const mods = useModules()
  const nav = useNavigate()
  const admin = profile?.role === 'admin'
  const bugun = todayISO()
  const bekleyen = usePendingCount(admin)
  const mesaj = useConversations(mods.mesaj)
  const deneme = useQuery({
    queryKey: ['bugun', 'sonuc-bekleyen', bugun],
    enabled: mods.lgs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('yaklasan_denemeler')
        .select('id, name, exam_date')
        .is('exam_id', null)
        .eq('grade', 8)
        .lte('exam_date', bugun)
        .gte('exam_date', addDays(bugun, -14))
        .order('exam_date')
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; name: string; exam_date: string }[]
    },
  })
  const odev = useQuery({
    queryKey: ['bugun', 'odev-kontrol', profile?.id, bugun],
    enabled: mods.odev && !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('homework')
        .select('id, title, due_on, homework_students!inner(status)')
        .eq('teacher_id', profile!.id)
        .lt('due_on', bugun)
        .gte('due_on', addDays(bugun, -14))
        .eq('homework_students.status', 'bekliyor')
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as { id: string; title: string; due_on: string }[]
    },
  })

  const isler: Is[] = []
  if (admin && bekleyen > 0)
    isler.push({ key: 'onay', ad: `${bekleyen} kayıt onay bekliyor`, alt: 'Veli, öğrenci ve öğretmen kayıtları', dugme: 'Onayla', git: '/onaylar' })
  for (const d of deneme.data ?? [])
    isler.push({ key: `d-${d.id}`, ad: `${d.name} sonuçları yüklenmedi`, alt: `Deneme ${trDM(d.exam_date)} · 8. sınıflar`, dugme: 'Yükle', git: '/denemeler' })
  const od = odev.data ?? []
  if (od.length)
    isler.push({
      key: 'odev',
      ad: `${od.length} ödev kontrol edilmedi`,
      alt:
        od
          .slice(0, 2)
          .map((o) => o.title)
          .join(' · ') + (od.length > 2 ? ` · +${od.length - 2}` : ''),
      dugme: 'Kontrol et',
      git: '/odevler',
    })
  const ok = (mesaj.data ?? []).filter((c) => c.unread > 0 && c.teacher_id === profile?.id)
  if (ok.length)
    isler.push({
      key: 'mesaj',
      ad: `${ok.length} okunmamış veli mesajı`,
      alt: ok
        .slice(0, 2)
        .map((c) => `${c.student_name} velisi`)
        .join(' · '),
      dugme: 'Yanıtla',
      git: '/iletisim',
    })
  if (!isler.length) return null

  return (
    <section className="card a" style={{ ['--d' as string]: 2, padding: '14px 16px' }} aria-labelledby="bg-yap-b" data-testid="yapilacaklar">
      <div className="kv">
        <h2 id="bg-yap-b" style={{ fontSize: 16, margin: 0 }}>
          Yapılacaklar
        </h2>
        <span className="chip n">{isler.length}</span>
      </div>
      <ul className="bg-isler">
        {isler.map((x) => (
          <li key={x.key} data-testid="yapilacak">
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 14 }}>{x.ad}</b>
              <span className="m" style={{ fontSize: 12 }}>
                {x.alt}
              </span>
            </span>
            <button type="button" className="btn sm" onClick={() => nav(x.git)}>
              {x.dugme}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Bu hafta okulda: takvimden Pazartesi–Cuma, gün başına en çok 2 etkinlik. */
export function BuHafta() {
  const mods = useModules()
  const nav = useNavigate()
  const bugun = todayISO()
  const pzt = weekStart(isoDow(bugun) >= 6 ? addDays(bugun, 7) : bugun)
  const cum = addDays(pzt, 4)
  const takvim = useCalendar(pzt, cum)
  if (!mods.takvim) return null
  const gunler = [0, 1, 2, 3, 4].map((i) => addDays(pzt, i))
  const ev = (takvim.data ?? []).filter((e) => !e.taslak)
  return (
    <section className="card a" style={{ ['--d' as string]: 2, padding: 16, display: 'grid', gap: 8 }} aria-labelledby="bg-hafta-b" data-testid="bu-hafta">
      <div className="kv">
        <h2 id="bg-hafta-b" style={{ fontSize: 16, margin: 0 }}>
          {pzt > bugun ? 'Gelecek hafta okulda' : 'Bu hafta okulda'}
        </h2>
        <button type="button" className="btn sm ghost" onClick={() => nav('/takvim')}>
          Takvim
        </button>
      </div>
      <ol className="bg-hafta">
        {gunler.map((g, i) => {
          const o = ev.filter((e) => e.starts_on <= g && e.ends_on >= g)
          return (
            <li key={g} className={g === bugun ? 'bugun' : ''} aria-current={g === bugun ? 'date' : undefined}>
              <span className="m">{['Pzt', 'Sal', 'Çar', 'Per', 'Cum'][i]}</span>
              <b>{Number(g.slice(8))}</b>
              {o.slice(0, 2).map((e) => (
                <span key={e.id} className="bg-ev">
                  {e.title}
                </span>
              ))}
              {o.length > 2 && <span className="m bg-ev">+{o.length - 2}</span>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
