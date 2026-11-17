import { useState } from 'react'

export type BoardAuthMethod = 'qr' | 'totp'

export interface BoardAuthChoiceProps {
  onChoose: (method: BoardAuthMethod) => void
  disabled?: boolean
}

/** Öğretmen kendi doğrulama yöntemini her yoklamada yeniden seçebilir. */
export function AkilliYoklamaGirisSecimi({ onChoose, disabled = false }: BoardAuthChoiceProps) {
  const [method, setMethod] = useState<BoardAuthMethod>('qr')
  return (
    <section aria-labelledby="board-auth-heading" style={{ maxWidth: 760, margin: 'auto', padding: 24 }}>
      <h1 id="board-auth-heading">Öğretmen doğrulaması</h1>
      <p>Yoklamayı onaylamak için istediğiniz yöntemi seçin.</p>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: '20px 0' }}>
        <legend style={{ fontWeight: 700, marginBottom: 12 }}>Giriş yöntemi</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          <label style={{ display: 'block', border: method === 'qr' ? '2px solid #176e61' : '2px solid #a4abb2', borderRadius: 16, padding: 20, cursor: 'pointer' }}>
            <input type="radio" name="board-auth" value="qr" checked={method === 'qr'} onChange={() => setMethod('qr')} style={{ width: 22, height: 22 }} />
            <strong style={{ display: 'block', fontSize: 21, margin: '10px 0' }}>QR kod ile</strong>
            <span>Telefonunuzla QR kodu okutun, hesabınızda kimliğinizi doğrulayın ve onaylayın.</span>
          </label>
          <label style={{ display: 'block', border: method === 'totp' ? '2px solid #176e61' : '2px solid #a4abb2', borderRadius: 16, padding: 20, cursor: 'pointer' }}>
            <input type="radio" name="board-auth" value="totp" checked={method === 'totp'} onChange={() => setMethod('totp')} style={{ width: 22, height: 22 }} />
            <strong style={{ display: 'block', fontSize: 21, margin: '10px 0' }}>Google Authenticator</strong>
            <span>Öğretmen hesabınızla giriş yapın ve 6 haneli doğrulama kodunu girin.</span>
          </label>
        </div>
      </fieldset>
      <button type="button" disabled={disabled} onClick={() => onChoose(method)}
        style={{ minHeight: 56, padding: '12px 26px', borderRadius: 12, fontSize: 18, fontWeight: 700 }}>
        Seçtiğim yöntemle devam et
      </button>
      <p style={{ marginTop: 16, fontSize: 13 }}>Bu ekran yalnızca yöntem seçer. Yetkilendirme sunucuda tamamlanmadan yoklama kaydedilmez.</p>
    </section>
  )
}
