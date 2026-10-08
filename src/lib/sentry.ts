// Hata izleme (Sentry, ücretsiz plan) — yalnız VITE_SENTRY_DSN tanımlıysa ve üretim derlemesinde açılır.
// Serbest metin, kullanıcı bağlamı, istek ve gezinme kayıtları gönderilmez.
import { minimalErrorEvent } from './sentryPrivacy'

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn || import.meta.env.DEV) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: minimalErrorEvent,
  })
}
