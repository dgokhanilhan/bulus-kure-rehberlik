// Yönetim › Kurulum sihirbazı (0079): yeni bir okulun kurulum adımları sırayla, her birinin durumu veritabanındaki
// sayılardan. Adımın kendisi mevcut bölümde yapılır (Toplu aktarım Excel'i satır satır hata göstererek önizler).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/Icon'
import { kurulumAdimlari, type AdimDurum, type KurulumSayilari } from '@/lib/kurulum'

const DURUM_TR: Record<AdimDurum, string> = { tamam: '✓ Tamam', eksik: 'Yapılmadı', kismen: 'Kısmen', gozden: 'Gözden geçir' }
const DURUM_SINIF: Record<AdimDurum, string> = { tamam: 'up', eksik: 'gold', kismen: 'gold', gozden: 'n' }

export function KurulumSihirbazi<T extends string>({ onGit }: { onGit: (sekme: T) => void }) {
  const q = useQuery({
    queryKey: ['kurulum_durumu'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kurulum_durumu')
      if (error) throw new Error(error.message)
      return data as KurulumSayilari
    },
  })
  if (q.isLoading)
    return (
      <p className="m">
        <span className="spinner" aria-hidden="true" /> Yükleniyor…
      </p>
    )
  if (q.isError || !q.data) return <div className="err">Kurulum durumu alınamadı: {(q.error as Error)?.message}</div>
  const adimlar = kurulumAdimlari(q.data)
  const zorunlu = adimlar.filter((a) => a.durum !== 'gozden')
  const biten = zorunlu.filter((a) => a.durum === 'tamam').length
  const siradaki = adimlar.find((a) => a.durum === 'eksik' || a.durum === 'kismen')
  return (
    <div className="stack" data-testid="kurulum-sihirbazi">
      <p className="m" style={{ margin: 0 }}>
        Yeni bir okulu sırayla kur. Durumlar okulun kayıtlarından hesaplanır; bir adımı bitirip buraya döndüğünde güncellenir.
      </p>
      <div className="card ks-ust">
        <div className="kv">
          <b>
            {biten}/{zorunlu.length} adım tamam
          </b>
          {siradaki ? <span className="m">Sıradaki: {siradaki.baslik}</span> : <span className="chip up">Kurulum tamam</span>}
        </div>
        <div className="ks-cubuk" role="progressbar" aria-label="Kurulum ilerlemesi" aria-valuemin={0} aria-valuemax={zorunlu.length} aria-valuenow={biten}>
          <span style={{ width: `${(biten / Math.max(1, zorunlu.length)) * 100}%` }} />
        </div>
      </div>
      <ol className="ks-liste">
        {adimlar.map((a) => (
          <li key={a.no} className={`card ks-adim ${a.durum}${siradaki?.no === a.no ? ' siradaki' : ''}`} data-testid="kurulum-adim">
            <span className="ks-no" aria-hidden="true">
              {a.durum === 'tamam' ? <Icon name="check" size={16} stroke={2.4} /> : a.no}
            </span>
            <span className="gh-ad">
              <b>{a.baslik}</b>
              <span className="m">{a.aciklama}</span>
              <span className="m">{a.bilgi}</span>
            </span>
            <span className={`chip ${DURUM_SINIF[a.durum]}`}>{DURUM_TR[a.durum]}</span>
            <button type="button" className={`btn sm ${siradaki?.no === a.no ? 'pri' : ''}`} onClick={() => onGit(a.sekme as T)}>
              {a.dugme}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
