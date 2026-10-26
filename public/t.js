// Script da página de review. Uso:
//   <script src="https://tracking.seudominio.com/t.js" async></script>
// Opcional no <script>: data-dominios="buygoods.com,outro.com" e data-param="subid".
;(function () {
  var BASE = '__BASE__'
  var KEY = 'rt_visita'
  var TTL = 90 * 864e5
  var script = document.currentScript || {}
  var data = script.dataset || {}
  var domains = (data.dominios || 'buygoods').split(',').map(function (d) {
    return d.trim().toLowerCase()
  })
  var param = data.param || 'subid'

  var q = new URLSearchParams(location.search)
  var adId = q.get('gclid') || q.get('gbraid') || q.get('wbraid') || ''

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (v && v.cid && Date.now() - v.t < TTL) return v
    } catch (e) {}
    return null
  }

  // Mesmo visitante e mesmo clique de anúncio: reaproveita o id.
  // Novo clique de anúncio: novo id, para a venda cair no anúncio certo.
  var visit = load()
  if (!visit || (adId && adId !== visit.ad)) {
    visit = {
      cid: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      ad: adId,
      t: Date.now(),
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(visit))
    } catch (e) {}
  }
  var cid = visit.cid

  // text/plain evita preflight de CORS.
  try {
    fetch(BASE + '/c', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ cid: cid, url: location.href, ref: document.referrer }),
    })
  } catch (e) {}

  function isTracked(a) {
    if (a.hasAttribute('data-rastrear')) return true
    var host = (a.hostname || '').toLowerCase()
    for (var i = 0; i < domains.length; i++) if (domains[i] && host.indexOf(domains[i]) !== -1) return true
    return false
  }

  function tag(a) {
    if (!a.href || !isTracked(a)) return false
    try {
      var u = new URL(a.href)
      if (u.searchParams.get(param) !== cid) {
        u.searchParams.set(param, cid)
        a.href = u.toString()
      }
      return true
    } catch (e) {
      return false
    }
  }

  function tagAll() {
    var links = document.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) tag(links[i])
  }

  // Clique no botão de compra: garante o subid e avisa o rastreador.
  document.addEventListener(
    'click',
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null
      if (a && tag(a) && navigator.sendBeacon) navigator.sendBeacon(BASE + '/o', cid)
    },
    true,
  )

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tagAll)
  else tagAll()
  // Páginas que montam os links depois (ex.: editores visuais).
  setTimeout(tagAll, 1500)
})()
