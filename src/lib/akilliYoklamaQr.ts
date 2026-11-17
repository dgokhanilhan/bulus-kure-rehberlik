/**
 * BK Akıllı Yoklama QR eşleştirme sözleşmesi.
 * Bu dosya yalnız tip ve güvenli durum geçişlerini tanımlar; QR doğrulaması sunucuda yapılmalıdır.
 * QR kodun içinde kullanıcı bilgisi, access token veya TOTP secret bulunmaz.
 */
export type BoardQrState =
  | 'waiting'
  | 'scanned'
  | 'approved'
  | 'expired'
  | 'denied'

export interface BoardQrChallenge {
  challenge_id: string
  /** QR'a konulacak yalnızca kısa ömürlü, tek kullanımlık eşleştirme URL'si. */
  pairing_url: string
  expires_at: string
  state: BoardQrState
}

export interface BoardQrApproval {
  challenge_id: string
  device_id: string
  class_id: string
  approved_by: string
  approved_at: string
}

/**
 * İstemci yalnızca sunucudan gelen durumu gösterebilir.
 * 'approved' tek başına erişim izni değildir; cihaz için ayrıca kısa ömürlü
 * sunucu oturumu ve yetki kontrolü gereklidir.
 */
export function qrCanContinue(challenge: BoardQrChallenge, now: Date): boolean {
  return challenge.state === 'approved' &&
    Number.isFinite(Date.parse(challenge.expires_at)) &&
    now.getTime() < Date.parse(challenge.expires_at)
}
