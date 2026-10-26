// Script da página de review. Cada produto tem o seu (o painel gera):
//   <script src="https://tracking.odingdong.tech/t.js?p=ID_DO_PRODUTO" async></script>
// Opcional no <script>: data-dominios="buygoods.com,outro.com" e data-param="subid".
;(function () {
  var BASE = '__BASE__'
  var PID = '__PRODUCT__'
  var KEY = 'rt_visita' + (PID ? '_' + PID : '')
  var TTL = 90 * 864e5
  var script = document.currentScript || {}
  var data = script.dataset || {}
  var domains = (data.dominios || 'buygoods').split(',').map(function (d) {
    return d.trim().toLowerCase()
  })
  var param = data.param || 'subid'

  var q = new URLSearchParams(location.search)
  var adId = q.get('gclid') || q.get('gbraid') || q.get('wbraid') || ''
  var isTest = q.has('rt_teste')

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
  function post(path, body) {
    try {
      fetch(BASE + path, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      })
    } catch (e) {}
  }

  post('/c', { cid: cid, pid: PID, test: isTest, url: location.href, ref: document.referrer })

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
    var n = 0
    for (var i = 0; i < links.length; i++) if (tag(links[i])) n++
    return n
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
  // Páginas que montam os links depois (ex.: editores visuais). Depois disso,
  // avisa o painel que o script está instalado e quantos links de compra achou.
  setTimeout(function () {
    var n = tagAll()
    if (PID) post('/p', { pid: PID, cid: cid, test: isTest, url: location.href, links: n })
  }, 1500)
})()
