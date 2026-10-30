import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { isOwnRedirect, followRedirect, finalAffiliateUrl, clearRedirectCache } from '../src/redirect.js'

const SITE = 'https://trustedwellnessreviews.online'
const GO = `${SITE}/go/aquasculpt`
const FINAL = 'https://getaquasculpt.com/video/?aff_id=909134&atc=1'
const aqua = { id: 'psshalm6q', affiliate_url: GO, review_url: `${SITE}/aquasculp-review/` }

// fetch falso: o /go/ responde 302 para a oferta (sem repassar parâmetros, como o Pretty Links Lite).
const fakeFetch = (map) => async (url) => {
  const loc = map[url.split('?')[0]]
  return { status: loc ? 302 : 200, headers: { get: (h) => (h.toLowerCase() === 'location' ? loc || null : null) } }
}

test('redirecionador do próprio site é reconhecido; link direto não', () => {
  assert.equal(isOwnRedirect(aqua), true)
  assert.equal(isOwnRedirect({ id: 'p1', affiliate_url: 'https://getnervecalm.com/dtc/?aff_id=143471', review_url: `${SITE}/nervecalm-review/` }), false)
  assert.equal(isOwnRedirect({ id: 'p2', affiliate_url: 'https://outro.com/go/x' }), true) // caminho /go/
  assert.equal(isOwnRedirect({ id: 'p3' }), false)
})

test('descobre o destino final do /go/ e guarda em cache', async () => {
  clearRedirectCache()
  assert.equal(await followRedirect(GO, fakeFetch({ [GO]: FINAL })), FINAL)
  let calls = 0
  const counting = async (u, o) => {
    calls++
    return fakeFetch({ [GO]: FINAL })(u, o)
  }
  assert.equal(await finalAffiliateUrl(aqua, { fetchFn: counting }), FINAL)
  assert.equal(await finalAffiliateUrl(aqua, { fetchFn: counting }), FINAL)
  assert.equal(calls, 1)
})

test('sem redirecionamento ou com erro: devolve vazio (o botão fica como está)', async () => {
  clearRedirectCache()
  assert.equal(await finalAffiliateUrl(aqua, { fetchFn: fakeFetch({}) }), '')
  clearRedirectCache()
  assert.equal(await finalAffiliateUrl(aqua, { fetchFn: async () => { throw new Error('fora do ar') } }), '')
})

// ---- t.js rodando numa página simulada ----------------------------------------

const TJS = readFileSync(new URL('../public/t.js', import.meta.url), 'utf8')

function fakePage(hrefs) {
  const listeners = {}
  const links = hrefs.map((h) => {
    const attrs = { href: h }
    const a = {
      tagName: 'A',
      get href() {
        return new URL(attrs.href, `${SITE}/aquasculp-review/`).toString()
      },
      set href(v) {
        attrs.href = v
      },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k) => k in attrs,
      closest: (sel) => (sel === 'a[href]' ? a : null),
    }
    return a
  })
  const beacons = []
  const storage = {}
  const ctx = {
    URL,
    URLSearchParams,
    JSON,
    Math,
    Date,
    Object,
    Boolean,
    location: { href: `${SITE}/aquasculp-review/?gclid=TESTE123`, hostname: 'trustedwellnessreviews.online', search: '?gclid=TESTE123' },
    localStorage: { getItem: (k) => storage[k] ?? null, setItem: (k, v) => (storage[k] = v) },
    fetch: () => Promise.resolve(),
    navigator: { sendBeacon: (url, body) => beacons.push([url, body]) },
    setTimeout: () => 0,
    document: {
      readyState: 'complete',
      currentScript: { dataset: {} },
      referrer: '',
      querySelectorAll: (sel) => (sel === 'a[href]' ? links : sel.startsWith('a[href],') ? links : []),
      addEventListener: (type, fn) => (listeners[type] = (listeners[type] || []).concat(fn)),
    },
  }
  return { ctx, links, beacons, listeners }
}

function runScript(page, { pid, domains, path, final }) {
  const js = TJS.replace('__BASE__', 'https://tracking.test')
    .replace('__PRODUCT__', pid)
    .replace('__DOMAINS__', domains)
    .replace('__PARAM__', 'subid')
    .replace('__PATH__', path)
    .replace('__MATCH__', '{}')
    .replace('__FINAL__', () => final)
  runInNewContext(js, page.ctx)
}

const aquaScript = (final) => ({ pid: 'psshalm6q', domains: 'trustedwellnessreviews.online', path: '/go/aquasculpt', final })

test('t.js: botão /go/ vai direto para a oferta com aff_id e subid', () => {
  const page = fakePage([GO, GO, `${SITE}/outra-pagina/`])
  runScript(page, aquaScript(FINAL))
  for (const a of page.links.slice(0, 2)) {
    const u = new URL(a.href)
    assert.equal(u.origin + u.pathname, 'https://getaquasculpt.com/video/')
    assert.equal(u.searchParams.get('aff_id'), '909134')
    assert.equal(u.searchParams.get('atc'), '1')
    assert.match(u.searchParams.get('subid'), /^v[a-z0-9]{8,}$/)
  }
  assert.equal(page.links[2].href, `${SITE}/outra-pagina/`) // link comum do site não é tocado
})

test('t.js: sem destino descoberto, continua como antes (/go/ com subid)', () => {
  const page = fakePage([GO])
  runScript(page, aquaScript(''))
  const u = new URL(page.links[0].href)
  assert.equal(u.origin + u.pathname, GO)
  assert.match(u.searchParams.get('subid'), /^v[a-z0-9]{8,}$/)
})

test('t.js: clique no botão já trocado continua registrado', () => {
  const page = fakePage([GO])
  runScript(page, aquaScript(FINAL))
  const a = page.links[0]
  for (const fn of page.listeners.click) fn({ target: { closest: (s) => (s === 'a[href]' ? a : null) } })
  assert.equal(page.beacons.length, 1)
  assert.equal(page.beacons[0][0], 'https://tracking.test/o')
  assert.equal(page.beacons[0][1], new URL(a.href).searchParams.get('subid'))
})

test('t.js: script de outro produto na mesma página não mexe no botão', () => {
  const page = fakePage([GO])
  runScript(page, aquaScript(FINAL))
  const depoisAqua = page.links[0].href
  runScript(page, { pid: 'p1vq7tzxc', domains: 'getnervecalm.com', path: '/dtc', final: '' })
  assert.equal(page.links[0].href, depoisAqua)
})
