import type { CapacitorConfig } from '@capacitor/cli'

// iOS / Android uygulaması: web uygulamasının mobil derlemesi (npm run mobil:build → dist-mobil) cihaza paketlenir.
// Uygulama kimliği mağazaya ilk yüklemeden sonra DEĞİŞTİRİLEMEZ (docs/mobil.md).
const config: CapacitorConfig = {
  appId: 'com.buluskurementor.app',
  appName: 'Buluş Küre',
  webDir: 'dist-mobil',
  // Uygulama dışı adresler (kaynak kodu bağlantısı, e-posta vb.) sistem tarayıcısında açılır; WebView yalnız paketi gösterir.
  ios: { contentInset: 'never', scheme: 'capacitor' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: {
    // Açılış ekranı kısa: index.html'deki açılış iskeleti devralır (JS yüklenemezse uygulama açılış ekranında kalmaz).
    SplashScreen: { launchAutoHide: true, launchShowDuration: 500, backgroundColor: '#f6f3ec', showSpinner: false },
    StatusBar: { overlaysWebView: true },
    SecureStorage: {},
  },
}

export default config
