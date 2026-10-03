import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/Toast'
import { ReportProvider } from '@/components/Report'
import App from './App'
import { initSentry } from '@/lib/sentry'
// Yazı tipleri uygulamayla birlikte sunulur (Google'a istek gitmez; yalnız Latin + Türkçe karakter alt kümeleri).
import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fraunces/latin-ext-500.css'
import '@fontsource/fraunces/latin-600.css'
import '@fontsource/fraunces/latin-ext-600.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-ext-500.css'
import './styles/app.css'

initSentry()

declare global {
  interface Window {
    __bkBooted?: boolean
  }
}
// Yeni yayından sonra açık sekmede eski bir sayfa parçası (lazy chunk) bulunamazsa bir kez yenile.
// Bayrak açılıştan 10 sn sonra silinir: açılışta hemen düşen bir parça sonsuz yenileme döngüsüne sokmaz.
const RETRY = 'bk.parca-yeniden'
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem(RETRY)) return
    sessionStorage.setItem(RETRY, '1')
  } catch {
    return
  }
  e.preventDefault()
  location.reload()
})

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ReportProvider>
              <App />
            </ReportProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Uygulama açıldı: açılış bekçisi (public/boot-check.js) devreden çıkar; yenileme bayrakları sonra temizlenir.
window.__bkBooted = true
setTimeout(() => {
  try {
    sessionStorage.removeItem('bk.acilis-yeniden')
    sessionStorage.removeItem(RETRY)
  } catch {
    /* özel pencere: yok say */
  }
}, 10_000)
