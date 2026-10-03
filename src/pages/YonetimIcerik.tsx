// Yönetim Merkezi (0024): mesajlaşma, duyuru ve etkinlik listeleri, denemeler, güvenlik özeti.
// Silme yetkisi veritabanında (ann_delete / cal_delete: yönetici ya da yazan) zorlanır; bu ekran yalnız arayüzdür.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { EVENT_TR, useAnnouncements, useCalendar, useClasses, useModules, useSettings, type Announcement, type CalEvent } from '@/lib/data'
import { LEVEL_TR } from '@/lib/roles'
import { trD } from '@/lib/format'
import { Confirm } from '@/components/Confirm'
import { Icon } from '@/components/Icon'
import { useToast } from '@/components/Toast'

const errText = (e: { code?: string; message?: string }) => (/row-level security|42501/i.test(`${e.code} ${e.message}`) ? 'Bu işlem için yönetici yetkisi gerekir.' : (e.message ?? 'İşlem yapılamadı.'))

function Off({ label }: { label: string }) {
  return (
    <p className="m" style={{ fontSize: 13 }}>
      {label} modülü kapalı; aşağıdaki kayıtlar yalnız sana görünür.
    </p>
  )
}

// ---------------------------------------------------------------- Mesajlaşma
export function MesajAyarlari() {
  const s = useSettings()
  const mods = useModules()
  const toast = useToast()
  const qc = useQueryClient()
  const file = typeof s.data?.['mesaj.dosya'] === 'boolean' ? (s.data['mesaj.dosya'] as boolean) : true
  const mb = (s.data?.['dosya.max_mb'] as number | undefined) ?? 10
  async function flip() {
    const { error } = await supabase.rpc('set_settings', { p: { 'mesaj.dosya': !file } })
    if (error) return toast(errText(error), 'warn')
    qc.invalidateQueries({ queryKey: ['school_settings'] })
    toast(`Mesajlarda dosya eki: ${file ? 'kapalı' : 'açık'}`)
  }
  return (
    <>
      <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Mesajlaşma ayarları">
        <div className="kv">
          <span>
            <b>Mesajlaşma modülü</b>
            <span className="m" style={{ display: 'block', fontSize: 12 }}>
              Açma/kapama Modüller bölümünden yapılır.
            </span>
          </span>
          <span className={`chip ${mods.mesaj ? 'up' : 'n'}`}>{mods.mesaj ? 'Açık' : 'Kapalı'}</span>
        </div>
        <button type="button" className="check" role="switch" aria-checked={file} onClick={flip} style={{ alignItems: 'flex-start' }}>
          <span className={`box ${file ? 'on' : ''}`}>{file && <Icon name="check" size={13} stroke={3} />}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ display: 'block', fontSize: 14 }}>Mesajlara dosya eklenebilir</b>
            <span className="m" style={{ fontSize: 12, fontWeight: 400 }}>
              En fazla {mb} MB; boyut ve dosya türleri “Dosya ve duyuru ayarları”ndan.
            </span>
          </span>
        </button>
      </section>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 16, fontSize: 14 }} aria-label="Kim kiminle yazışır">
        <b>Kim kiminle yazışır?</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Veli: çocuğunun ders öğretmenleri, sınıf öğretmeni, rehberlik ve yönetim.</li>
          <li>Öğretmen: ders verdiği öğrencilerin velileri. Rehberlik ve yönetim: bütün velileri.</li>
          <li>Öğrenci mesajlaşmaz. Kural veritabanında uygulanır ve ders atamalarından gelir; ayrı bir liste tutulmaz.</li>
        </ul>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- Duyurular
export function DuyuruListesi() {
  const anns = useAnnouncements()
  const classes = useClasses()
  const mods = useModules()
  const toast = useToast()
  const qc = useQueryClient()
  const [del, setDel] = useState<Announcement | null>(null)
  const scope = (a: Announcement) => (a.scope === 'okul' ? 'Bütün okul' : a.scope === 'kademe' ? (a.level ? LEVEL_TR[a.level] : 'Kademe') : (classes.data?.find((c) => c.id === a.class_id)?.name ?? 'Sınıf'))
  return (
    <>
      {!mods.duyuru && <Off label="Duyurular" />}
      <div className="kv a">
        <span className="m" style={{ fontSize: 13 }}>
          Son {anns.data?.length ?? 0} duyuru. Yeni duyuru <Link to="/duyurular">Duyurular</Link> sayfasından yayınlanır.
        </span>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label="Duyuru listesi">
        {anns.data?.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Duyuru</th>
                  <th>Kapsam</th>
                  <th>Yazan</th>
                  <th>Tarih</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {anns.data.map((a) => (
                  <tr key={a.id} data-testid="ann-row">
                    <td>
                      <b>{a.title}</b>
                    </td>
                    <td>{scope(a)}</td>
                    <td>{a.author_name ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{trD(a.created_at.slice(0, 10))}</td>
                    <td>
                      <button className="btn sm" onClick={() => setDel(a)} aria-label={`${a.title} duyurusunu sil`}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            {anns.isLoading ? 'Yükleniyor…' : 'Duyuru yok.'}
          </div>
        )}
      </section>
      {del && (
        <Confirm
          title="Duyuruyu sil"
          action="Sil"
          warn
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('announcements').delete().eq('id', del.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['announcements'] })
            toast('Duyuru silindi')
            setDel(null)
          }}
        >
          <b>{del.title}</b> duyurusu herkesin ekranından kalkar; ekleri de silinir. Gönderilmiş bildirimler geri alınamaz. İşlem geçmişine yazılır.
        </Confirm>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Takvim etkinlikleri
const iso = (d: Date) => d.toISOString().slice(0, 10)
export function EtkinlikListesi() {
  const now = new Date()
  const [range] = useState(() => [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth() + 6, 0))] as const)
  const evs = useCalendar(range[0], range[1])
  const mods = useModules()
  const toast = useToast()
  const qc = useQueryClient()
  const [del, setDel] = useState<CalEvent | null>(null)
  const list = [...(evs.data ?? [])].sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  return (
    <>
      {!mods.takvim && <Off label="Takvim" />}
      <div className="kv a">
        <span className="m" style={{ fontSize: 13 }}>
          {trD(range[0])} – {trD(range[1])} arası {list.length} etkinlik. Ekleme ve düzenleme <Link to="/takvim">Takvim</Link> sayfasından.
        </span>
      </div>
      <section className="card a" style={{ ['--d' as string]: 1, overflow: 'hidden' }} aria-label="Etkinlik listesi">
        {list.length ? (
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Etkinlik</th>
                  <th>Tür</th>
                  <th>Tarih</th>
                  <th aria-label="İşlemler" />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} data-testid="event-row">
                    <td>
                      <b>{e.title}</b>
                    </td>
                    <td>{EVENT_TR[e.type]}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {trD(e.starts_on)}
                      {e.ends_on !== e.starts_on ? ` – ${trD(e.ends_on)}` : ''}
                    </td>
                    <td>
                      <button className="btn sm" onClick={() => setDel(e)} aria-label={`${e.title} etkinliğini sil`}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ margin: 16 }}>
            {evs.isLoading ? 'Yükleniyor…' : 'Bu aralıkta etkinlik yok.'}
          </div>
        )}
      </section>
      {del && (
        <Confirm
          title="Etkinliği sil"
          action="Sil"
          warn
          onClose={() => setDel(null)}
          onConfirm={async () => {
            const { error } = await supabase.from('calendar_events').delete().eq('id', del.id)
            if (error) return errText(error)
            qc.invalidateQueries({ queryKey: ['calendar'] })
            toast('Etkinlik silindi')
            setDel(null)
          }}
        >
          <b>{del.title}</b> ({trD(del.starts_on)}) takvimden kalkar ve hatırlatması gitmez. İşlem geçmişine yazılır.
        </Confirm>
      )}
    </>
  )
}

// ---------------------------------------------------------------- Denemeler / LGS
export function DenemeBilgi() {
  const exams = useQuery({
    queryKey: ['yonetim', 'deneme-sayisi'],
    queryFn: async () => {
      const [all, pub] = await Promise.all([
        supabase.from('exams').select('id', { count: 'exact', head: true }),
        supabase.from('exams').select('id', { count: 'exact', head: true }).not('published_at', 'is', null),
      ])
      return { all: all.count ?? 0, pub: pub.count ?? 0 }
    },
  })
  return (
    <section className="card a" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }} aria-label="Denemeler">
      <div className="kv">
        <span>
          <b>{exams.data?.all ?? '…'}</b> deneme · <b>{exams.data?.pub ?? '…'}</b> yayınlanmış
        </span>
        <Link className="btn sm" to="/denemeler">
          Denemelere git
        </Link>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <li>Deneme yükleme, okuma, kontrol ve yayınlama Denemeler sayfasındadır; okuma kuralları bu ekrandan değiştirilmez.</li>
        <li>LGS kartı ve deneme sonuçları yalnız 8. sınıflarda, YKS 12. sınıflarda görünür; bu kural ana sayfa düzeninden de kapatılamaz.</li>
        <li>Deneme özelliklerinin tümü “LGS / Deneme” modülüyle açılıp kapanır.</li>
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- Güvenlik ve erişim
const WHO: [string, string][] = [
  ['Yönetici', 'Okulun tüm verisi. Yazma işlemleri için iki adımlı doğrulama (MFA) zorunlu.'],
  ['Rehberlik', 'Bütün öğrenciler, görüşmeler ve rehberlik notları; Yönetim Merkezi yok.'],
  ['Branş / sınıf öğretmeni', 'Yalnız atandığı sınıfların ve sınıf öğretmeni olduğu sınıfın öğrencileri.'],
  ['Veli', 'Yalnız bağlı çocukları; birden çok çocukta aktif öğrenciyi seçer.'],
  ['Öğrenci', 'Yalnız kendi kaydı.'],
]
export function GuvenlikOzeti() {
  return (
    <>
      <section className="card a" style={{ overflow: 'hidden' }} aria-label="Kim neyi görür">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Görebildiği</th>
              </tr>
            </thead>
            <tbody>
              {WHO.map(([r, d]) => (
                <tr key={r}>
                  <td>
                    <b>{r}</b>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card a" style={{ ['--d' as string]: 1, padding: 16, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>
          Bu kurallar arayüzde değil <b>veritabanında</b> (satır düzeyi güvenlik) uygulanır; bir düğmenin gizli olması tek başına koruma değildir.
        </span>
        <span>
          Rol ekleme / kaldırma: <b>Öğretmenler</b> ya da <b>Veliler</b> → Düzenle. Ders ataması: <b>Ders atamaları</b> ya da öğretmenin Düzenle penceresi.
        </span>
        <span>
          Kim neyi değiştirdi: <Link to="/ayarlar">Sistem ayarları → İşlem kayıtları</Link>.
        </span>
        <span className="m" style={{ fontSize: 13 }}>
          Bilerek burada olmayanlar: gizli anahtarlar ve API anahtarları, SQL düzenleyici, veritabanı yedeği ve toplu silme. Bunlar yalnız sunucu tarafında, teknik sorumlu tarafından yönetilir.
        </span>
      </section>
    </>
  )
}
