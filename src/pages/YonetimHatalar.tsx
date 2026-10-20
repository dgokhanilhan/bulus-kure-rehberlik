// Yönetim → Hata kayıtları: kullanıcıların karşılaştığı hatalar (sayfa çökmesi, veri yüklenememesi, zaman aşımı).
// Kayıt hataKaydi.ts → hata_kaydet (0058); yalnız yönetici görür (RLS). Kişisel veri yok; 90 günden eskiler silinir.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ROLE_TR } from '@/lib/roles'

interface Kayit {
  id: number
  tur: 'cokme' | 'veri' | 'js' | 'promise'
  rol: string | null
  sayfa: string | null
  mesaj: string
  tarayici: string | null
  surum: string | null
  user_id: string | null
  created_at: string
}
const TUR_TR: Record<Kayit['tur'], string> = { cokme: 'Sayfa çöktü', veri: 'Veri yüklenemedi', js: 'Kod hatası', promise: 'Kod hatası' }
const tarayici = (ua: string | null) =>
  !ua ? '—' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Diğer'

export default function YonetimHatalar() {
  const q = useQuery({
    queryKey: ['hata-kayitlari'],
    queryFn: async () => {
      const { data, error } = await supabase.from('hata_kayitlari').select('id, tur, rol, sayfa, mesaj, tarayici, surum, user_id, created_at').order('created_at', { ascending: false }).limit(300)
      if (error) throw new Error(error.message)
      return (data ?? []) as Kayit[]
    },
  })
  const hafta = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const ozet = new Map<string, { k: Kayit; n: number; kisi: Set<string>; son: string }>()
  for (const k of (q.data ?? []).filter((x) => x.created_at >= hafta)) {
    const a = `${k.tur}|${k.mesaj}`
    const o = ozet.get(a) ?? { k, n: 0, kisi: new Set<string>(), son: k.created_at }
    o.n++
    if (k.user_id) o.kisi.add(k.user_id)
    ozet.set(a, o)
  }
  const zaman = (t: string) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p className="m" style={{ fontSize: 14, margin: 0 }}>
        Kullanıcıların uygulamada karşılaştığı hatalar burada toplanır (kişisel veri içermez; 90 gün saklanır). Aynı hata birden çok kişide görünüyorsa geliştiriciye
        iletin.
      </p>
      <section className="card" style={{ padding: 16 }} aria-label="Son 7 gün">
        <b>Son 7 gün</b>
        {ozet.size ? (
          <div className="tbl" tabIndex={0} role="region" aria-label="Hata özeti" style={{ marginTop: 8 }}>
            <table data-testid="hata-ozet">
              <thead>
                <tr>
                  <th>Tür</th>
                  <th>Hata</th>
                  <th>Sayfa</th>
                  <th className="num">Kez</th>
                  <th className="num">Kişi</th>
                  <th>Son</th>
                </tr>
              </thead>
              <tbody>
                {[...ozet.values()]
                  .sort((a, b) => b.kisi.size - a.kisi.size || b.n - a.n)
                  .map((o) => (
                    <tr key={o.k.id}>
                      <td>
                        <span className={`chip ${o.k.tur === 'cokme' ? 'down' : 'n'}`}>{TUR_TR[o.k.tur]}</span>
                      </td>
                      <td style={{ maxWidth: 420, wordBreak: 'break-word' }}>{o.k.mesaj}</td>
                      <td>{o.k.sayfa ?? '—'}</td>
                      <td className="num">{o.n}</td>
                      <td className="num">{o.kisi.size}</td>
                      <td>{zaman(o.son)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m" style={{ margin: '6px 0 0' }}>
            {q.isLoading ? 'Yükleniyor…' : q.isError ? 'Kayıtlar okunamadı.' : 'Son 7 günde hata yok.'}
          </p>
        )}
      </section>
      <section className="card" style={{ padding: 16 }} aria-label="Son kayıtlar">
        <b>Son kayıtlar</b>
        <div className="tbl" tabIndex={0} role="region" aria-label="Son hata kayıtları" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Tür</th>
                <th>Rol</th>
                <th>Sayfa</th>
                <th>Hata</th>
                <th>Tarayıcı</th>
                <th>Sürüm</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).slice(0, 100).map((k) => (
                <tr key={k.id}>
                  <td>{zaman(k.created_at)}</td>
                  <td>{TUR_TR[k.tur]}</td>
                  <td>{(k.rol && ROLE_TR[k.rol as keyof typeof ROLE_TR]) || k.rol || '—'}</td>
                  <td>{k.sayfa ?? '—'}</td>
                  <td style={{ maxWidth: 380, wordBreak: 'break-word' }}>{k.mesaj}</td>
                  <td>{tarayici(k.tarayici)}</td>
                  <td>{k.surum ?? '—'}</td>
                </tr>
              ))}
              {!q.data?.length && (
                <tr>
                  <td colSpan={7} className="m">
                    Kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
