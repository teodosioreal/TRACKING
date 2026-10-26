// Script da página de review. Cada produto tem o seu (o painel gera):
//   <script src="https://tracking.odingdong.tech/t.js?p=ID_DO_PRODUTO" async></script>
// Reconhece como link de compra: links com aff_id (formato da BuyGoods, mesmo no
// site do produtor), links para buygoods, o domínio do link de afiliado cadastrado
// no produto e links com o atributo data-rastrear.
// Opcional no <script>: data-dominios="outro.com" e data-param="subid".
;(function () {
  var BASE = '__BASE__'
  var PID = '__PRODUCT__'
  var PRODUCT_DOMAINS = '__DOMAINS__'
  var PRODUCT_PARAM = '__PARAM__'
  var KEY = 'rt_visita' + (PID ? '_' + PID : '')
  var TTL = 90 * 864e5
  var script = document.currentScript || {}
  var data = script.dataset || {}
  var domains = ['buygoods']
    .concat(PRODUCT_DOMAINS ? PRODUCT_DOMAINS.split(',') : [])
    .concat(data.dominios ? data.dominios.split(',') : [])
    .map(function (d) {
      return d.trim().toLowerCase()
    })
  // Nome do parâmetro que leva o ID da visita (BuyGoods: subid; outras plataformas
  // podem usar tid, sck, cid...). Vem da configuração do produto.
  var param = data.param || PRODUCT_PARAM || 'subid'

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
    return /[?&]aff_id=/i.test(a.href)
  }

  var OUR_ID = /^v[a-z0-9]{8,}$/

  function tag(a) {
    if (!a.href || !isTracked(a)) return false
    try {
      var u = new URL(a.href)
      var old = u.searchParams.get(param)
      if (old !== cid) {
        // Um subid fixo que já estava no link (ex.: "adsgoogle") vai para o subid2.
        if (param === 'subid' && old && !OUR_ID.test(old) && !u.searchParams.get('subid2')) u.searchParams.set('subid2', old)
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
