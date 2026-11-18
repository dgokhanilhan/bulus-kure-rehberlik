// Tarayıcı sekmesindeki simge: okulun logosu yüklenmişse yuvarlak kesilmiş hali (Yönetim › Genel ayarlar › Logo).
// Logo yoksa ya da çizilemezse varsayılan /favicon.svg kalır.
import { useEffect } from 'react'
import { useSchoolInfo } from '@/lib/files'

export function yuvarlakSimge(img: HTMLImageElement, boyut = 64): string | null {
  const c = document.createElement('canvas')
  c.width = c.height = boyut
  const x = c.getContext('2d')
  if (!x || !img.naturalWidth) return null
  x.beginPath()
  x.arc(boyut / 2, boyut / 2, boyut / 2, 0, Math.PI * 2)
  x.closePath()
  x.fillStyle = '#ffffff'
  x.fill()
  x.clip()
  // Logonun tamamı daire içinde görünsün (kırpmadan sığdır, küçük kenar boşluğuyla)
  const pay = boyut * 0.08
  const olcek = Math.min((boyut - pay * 2) / img.naturalWidth, (boyut - pay * 2) / img.naturalHeight)
  const w = img.naturalWidth * olcek
  const h = img.naturalHeight * olcek
  x.drawImage(img, (boyut - w) / 2, (boyut - h) / 2, w, h)
  try {
    return c.toDataURL('image/png')
  } catch {
    return null
  }
}

export function SekmeSimgesi() {
  const logo = useSchoolInfo().data?.logo
  useEffect(() => {
    if (!logo) return
    let iptal = false
    const img = new Image()
    img.onload = () => {
      const url = yuvarlakSimge(img)
      if (iptal || !url) return
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.type = 'image/png'
      link.href = url
    }
    img.src = logo
    return () => {
      iptal = true
    }
  }, [logo])
  return null
}
