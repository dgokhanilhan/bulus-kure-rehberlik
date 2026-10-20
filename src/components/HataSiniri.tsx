// Sayfa düzeyinde hata sınırı: bir sayfa beklenmedik hatayla çökerse uygulamanın tamamı beyaz ekrana düşmez; menü çalışır,
// sayfa "Bu sayfada bir hata oluştu" ve "Sayfayı yenile" gösterir, hata sunucuya kaydedilir (hataKaydi).
import { Component, type ReactNode } from 'react'
import { hataBildir } from '@/lib/hataKaydi'

export class HataSiniri extends Component<{ children: ReactNode }, { hata: Error | null }> {
  state = { hata: null as Error | null }
  static getDerivedStateFromError(hata: Error) {
    return { hata }
  }
  componentDidCatch(hata: Error) {
    hataBildir('cokme', hata)
  }
  render() {
    if (!this.state.hata) return this.props.children
    return (
      <div className="card issue" role="alert" data-testid="sayfa-hatasi" style={{ padding: 20, margin: 4 }}>
        <b>Bu sayfada bir hata oluştu.</b>
        <p className="m" style={{ fontSize: 14, margin: '6px 0 10px' }}>
          Hata okul yönetimine otomatik bildirildi. Sayfayı yenilemeyi dene; sorun sürerse başka bir sayfadan devam edebilirsin.
        </p>
        <div className="btns">
          <button type="button" className="btn pri" onClick={() => location.reload()}>
            Sayfayı yenile
          </button>
          <button type="button" className="btn" onClick={() => this.setState({ hata: null })}>
            Tekrar dene
          </button>
        </div>
      </div>
    )
  }
}
