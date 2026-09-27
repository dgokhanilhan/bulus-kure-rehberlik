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
