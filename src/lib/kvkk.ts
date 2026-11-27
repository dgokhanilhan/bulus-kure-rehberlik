/** Aydınlatma metni sürümü: metin değiştikçe artır (kayıtta saklanır). */
export const KVKK_VERSION = 'KVKK-1.3'
/** Önceki aydınlatma sürümleri de geçerli sayılır: aydınlatma bilgilendirmedir, sürüm değişince yeniden onay istenmez. */
export const KVKK_GECERLI_ESKI = ['KVKK-1.2', 'KVKK-1.1', 'KVKK-1.0']
/** Açık rıza metni sürümü (aydınlatmadan ayrı; 0057). Metin değiştikçe artır: herkes yeni sürümü bir kez onaylar. */
export const ACIK_RIZA_VERSION = 'ACIK-RIZA-1.0'
/** Kayıt ve ilk giriş ekranındaki açık rıza onay cümlesi (aynı metin iki yerde). */
export const RIZA_ONAY =
  'Açık Rıza Metni’ni okudum; metinde belirtilen kişisel verilerin (velisi ya da yasal temsilcisi olduğum öğrenciye ait veriler dahil) aktarılmasına ve belirtilen amaçlarla işlenmesine açık rıza veriyorum.'
