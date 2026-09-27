// Hata izleme (Sentry, ücretsiz plan) — yalnız VITE_SENTRY_DSN tanımlıysa ve üretim derlemesinde açılır.
// KVKK: kişisel veri gitmez (kullanıcı, e-posta, çerez, istek gövdesi temizlenir; metinlerdeki e-postalar maskelenir).
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn || import.meta.env.DEV) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeBreadcrumb: (b) => (b.category === 'ui.input' || b.category === 'console' ? null : b),
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
        if (event.request.url) event.request.url = event.request.url.replace(/\/ogrenciler\/[0-9a-f-]{36}/g, '/ogrenciler/:id')
      }
      if (event.message) event.message = event.message.replace(EMAIL, '[e-posta]')
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = ex.value.replace(EMAIL, '[e-posta]')
      return event
    },
  })
}
