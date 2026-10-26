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

  // É link de compra? (domínio do link de afiliado do produto, buygoods,
  // data-dominios ou parâmetro aff_id da BuyGoods)
  function isTrackedUrl(href) {
    try {
      var u = new URL(href, location.href)
      if (!/^https?:$/.test(u.protocol)) return false
      var host = u.hostname.toLowerCase()
      for (var i = 0; i < domains.length; i++) if (domains[i] && host.indexOf(domains[i]) !== -1) return true
      return /[?&]aff_id=/i.test(u.search)
    } catch (e) {
      return false
    }
  }

  var OUR_ID = /^v[a-z0-9]{8,}$/

  // Mesmo endereço, com o ID da visita no parâmetro do produto.
  function tagUrl(href) {
    try {
      var u = new URL(href, location.href)
      var old = u.searchParams.get(param)
      if (old === cid) return u.toString()
      // Um subid fixo que já estava no link (ex.: "adsgoogle") vai para o subid2.
      if (param === 'subid' && old && !OUR_ID.test(old) && !u.searchParams.get('subid2')) u.searchParams.set('subid2', old)
      u.searchParams.set(param, cid)
      return u.toString()
    } catch (e) {
      return null
    }
  }

  function tag(a) {
    if (!a.href || !(a.hasAttribute('data-rastrear') || isTrackedUrl(a.href))) return false
    var t = tagUrl(a.href)
    if (!t) return false
    if (t !== a.href) a.href = t
    return true
  }

  // Botões que não são <a href>: data-href/data-url/data-link ou um endereço
  // dentro do onclick (ex.: onclick="location.href='https://...'").
  var BUTTONS = 'button,[onclick],[data-href],[data-url],[data-link]'
  function urlOf(el) {
    var d = el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link')
    if (d) return d
    var m = /https?:\/\/[^'"\s)]+/.exec(el.getAttribute('onclick') || '')
    return m ? m[0] : null
  }
  function trackedButton(el) {
    var u = urlOf(el)
    return u && (el.hasAttribute('data-rastrear') || isTrackedUrl(u)) ? u : null
  }

  function tagAll() {
    var n = 0
    var links = document.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) if (tag(links[i])) n++
    var forms = document.querySelectorAll('form[action]')
    for (var j = 0; j < forms.length; j++) {
      var f = forms[j]
      if (f.hasAttribute('data-rastrear') || isTrackedUrl(f.action)) {
        var t = tagUrl(f.action)
        if (t) {
          f.action = t
          // GET descarta os parâmetros do action: leva o ID num campo escondido.
          if ((f.method || 'get').toLowerCase() === 'get') {
            var inp = f.querySelector('input[name="' + param + '"]') || f.appendChild(document.createElement('input'))
            inp.type = 'hidden'
            inp.name = param
            inp.value = cid
          }
          n++
        }
      }
    }
    var buttons = document.querySelectorAll(BUTTONS)
    for (var k = 0; k < buttons.length; k++) if (!buttons[k].closest('a[href]') && trackedButton(buttons[k])) n++
    return n
  }

  // Quando nada foi reconhecido: links externos da página, para o painel
  // sugerir qual é o link de afiliado.
  var IGNORE = /(^|\.)(facebook|fb|instagram|twitter|x|youtube|youtu|google|pinterest|tiktok|linkedin|wa|whatsapp|t)\.(com|me|be)$/
  function candidates() {
    var seen = {}
    var out = []
    var els = document.querySelectorAll('a[href],' + BUTTONS)
    for (var i = 0; i < els.length && out.length < 8; i++) {
      var href = els[i].tagName === 'A' ? els[i].href : urlOf(els[i])
      try {
        var u = new URL(href, location.href)
        if (!/^https?:$/.test(u.protocol) || u.hostname === location.hostname) continue
        if (IGNORE.test(u.hostname.replace(/^www\./, ''))) continue
        var key = u.origin + u.pathname
        if (!seen[key]) {
          seen[key] = 1
          out.push(u.toString().slice(0, 300))
        }
      } catch (e) {}
    }
    return out
  }

  // Clique no botão de compra: garante o ID e avisa o rastreador.
  document.addEventListener(
    'click',
    function (e) {
      if (!e.target || !e.target.closest) return
      var a = e.target.closest('a[href]')
      if (a) {
        if (tag(a) && navigator.sendBeacon) navigator.sendBeacon(BASE + '/o', cid)
        return
      }
      var el = e.target.closest(BUTTONS)
      var u = el && trackedButton(el)
      if (!u) return
      var t = tagUrl(u)
      if (!t) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (navigator.sendBeacon) navigator.sendBeacon(BASE + '/o', cid)
      if (el.getAttribute('target') === '_blank' || /window\.open/.test(el.getAttribute('onclick') || '')) window.open(t, '_blank')
      else location.href = t
    },
    true,
  )

  function ping(n) {
    if (!PID) return
    post('/p', { pid: PID, cid: cid, test: isTest, url: location.href, links: n, candidatos: n ? [] : candidates() })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tagAll)
  else tagAll()
  // Páginas que montam os links depois (ex.: editores visuais): conta de novo
  // e avisa o painel; se a contagem mudar mais tarde, avisa de novo.
  var last = -1
  setTimeout(function () {
    last = tagAll()
    ping(last)
  }, 1500)
  setTimeout(function () {
    var n = tagAll()
    if (n !== last) ping(n)
  }, 6000)
})()
