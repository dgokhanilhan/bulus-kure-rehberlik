/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SCHOOL_SLUG?: string
  readonly VITE_SOURCE_URL?: string
  readonly VITE_SENTRY_DSN?: string
  /** Deneme ortamı: demo hesaplar ve örnek dosya görünür (gerçek veri olan ortamda ASLA). */
  readonly VITE_DEMO?: string
  /** Mobil (Capacitor) derlemesi: vite --mode mobil iken '1' (vite.config.ts define). */
  readonly VITE_MOBIL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
