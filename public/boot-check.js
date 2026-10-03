// Açılış bekçisi (CSP satır içi betiğe izin vermediği için ayrı dosya; derlenmez, adı sabittir).
// Ana JS paketi yüklenemezse (ör. yayın sırasında asset yerine index.html döndüyse) dosyaları önbelleği atlayarak
// yeniden indirir ve sayfayı BİR KEZ yeniler. Yine olmazsa açılış ekranında anlaşılır bir mesaj gösterir.
// Uygulama açılınca main.tsx window.__bkBooted = true yapar; bekçi o andan sonra hiçbir şey yapmaz.
;(function () {
  var KEY = 'bk.acilis-yeniden'
  var busy = false
  function store(fn) {
    try {
      return fn(window.sessionStorage)
    } catch (e) {
      return null
    }
  }
  function urls() {
    var els = document.querySelectorAll('script[type="module"][src], link[rel="modulepreload"][href]')
    var out = []
    for (var i = 0; i < els.length; i++) out.push(els[i].src || els[i].href)
    return out
  }
  function check(u) {
    return fetch(u, { cache: 'reload', credentials: 'same-origin' })
      .then(function (r) {
        return { url: u, status: r.status, type: r.headers.get('content-type') || '' }
      })
      .catch(function () {
        return { url: u, status: 0, type: '' }
      })
  }
  function message() {
    var box = document.querySelector('#root [role="status"]')
    if (!box || window.__bkBooted) return
    box.innerHTML = ''
    var wrap = document.createElement('div')
    wrap.style.cssText = 'max-width:420px;padding:24px;text-align:center;font-size:15px;line-height:1.5'
    var p = document.createElement('p')
    p.textContent = 'Site güncelleniyor ya da yüklenemedi. Birkaç dakika sonra yeniden deneyin.'
    var b = document.createElement('button')
    b.type = 'button'
    b.textContent = 'Yeniden dene'
    b.style.cssText = 'margin-top:8px;padding:10px 18px;border-radius:10px;border:0;background:#1f5f5b;color:#fff;font:inherit;cursor:pointer'
    b.onclick = function () {
      store(function (s) {
        s.removeItem(KEY)
      })
      location.reload()
    }
    wrap.appendChild(p)
    wrap.appendChild(b)
    box.appendChild(wrap)
    box.setAttribute('aria-label', 'Yüklenemedi')
  }
  function recover(reason) {
    if (busy || window.__bkBooted) return
    busy = true
    Promise.all(urls().map(check)).then(function (rs) {
      if (window.__bkBooted) return
      var bad = rs.filter(function (r) {
        return r.status !== 200 || r.type.indexOf('javascript') < 0
      })
      // Teşhis: hangi dosya JS yerine ne döndü (tarayıcı konsolunda görünür)
      console.error('[açılış] ' + reason + (bad.length ? ' · bozuk yanıt: ' + JSON.stringify(bad) : ' · dosyalar şimdi sağlam'))
      if (!bad.length && reason === 'zaman aşımı') {
        busy = false // yalnız yavaş bağlantı: beklemeye devam
        return
      }
      var tried = store(function (s) {
        return s.getItem(KEY)
      })
      if (tried) return message()
      store(function (s) {
        s.setItem(KEY, String(Date.now()))
      })
      location.reload()
    })
  }
  // Modül betiği yüklenemezse (404, ya da nosniff yüzünden HTML çalıştırılamazsa) betik öğesinde "error" olur.
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) recover('yüklenemedi: ' + (t.src || t.href))
    },
    true,
  )
  setTimeout(function () {
    recover('zaman aşımı')
  }, 12000)
})()
