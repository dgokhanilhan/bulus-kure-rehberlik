// Yalnız mobil pakette yüklenir (main.tsx, MOBIL iken dinamik içe aktarma): durum çubuğu, açılış ekranı, Android geri tuşu.
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

export async function initMobil() {
  if (!Capacitor.isNativePlatform()) return
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const bar = () => StatusBar.setStyle({ style: dark.matches ? Style.Dark : Style.Light }).catch(() => {})
  void bar()
  dark.addEventListener('change', bar)
  // Android geri tuşu: önce açık pencere (pencereler Esc ile kapanır) kapanır, sonra uygulama içinde geri gidilir,
  // en sonda uygulama arka plana alınır.
  void App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector('[role="dialog"]')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    else if (canGoBack) window.history.back()
    else void App.minimizeApp()
  })
  await SplashScreen.hide()
}
