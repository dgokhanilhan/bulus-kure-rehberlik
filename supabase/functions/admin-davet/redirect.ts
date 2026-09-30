// Davet bağlantısının yönlendirme adresi: yalnız okulun alan adı. İstemciden gelen adres kesin listeyle karşılaştırılır;
// listede yoksa canlı adrese düşer (başka bir alan adına yönlendirme yapılamaz).
// Yerel geliştirme/test için DAVET_YEREL_ADRESLER (virgülle) yalnız localhost / 127.0.0.1 adreslerini ekleyebilir;
// başka bir adres yazılsa da yok sayılır. Canlıda bu değişken tanımlanmaz.
export const SITE_ORIGIN = 'https://buluskurementor.com'
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/

const norm = (s: string) => s.trim().replace(/\/+$/, '')

export function safeRedirect(requested: unknown, localList = ''): string {
  const r = typeof requested === 'string' ? norm(requested) : ''
  if (r === SITE_ORIGIN) return SITE_ORIGIN
  const local = localList.split(',').map(norm).filter((x) => LOOPBACK.test(x))
  return local.includes(r) ? r : SITE_ORIGIN
}
