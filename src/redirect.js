// Link de afiliado que é um redirecionador no próprio site (Pretty Links,
// ThirstyAffiliates... ex.: /go/produto): muitos descartam o ?subid= no
// redirecionamento e a venda volta sem o ID da visita. Aqui o rastreador
// descobre para onde o link aponta, e o script manda o clique direto para lá,
// com o subid. Se não der para descobrir, o botão fica como está.
import { productPages } from './products.js'

const REDIRECT_PATH = /^\/(go|out|recommends?|visit|links?|refer|r|buy|get|order|offer|try|deal)(\/|$)/i
const OK_FOR = 3600e3 // destino descoberto vale 1 hora
const FAIL_FOR = 5 * 60e3 // falhou: tenta de novo em 5 minutos
const TIMEOUT = 4000
const MAX_HOPS = 3

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

// O link de afiliado do produto é um redirecionador no próprio site?
export function isOwnRedirect(product) {
  const aff = product?.affiliate_url
  if (!aff) return false
  let u
  try {
    u = new URL(aff)
  } catch {
    return false
  }
  if (!/^https?:$/.test(u.protocol)) return false
  const h = host(aff)
  const pageHosts = productPages(product).map(host)
  return pageHosts.includes(h) || REDIRECT_PATH.test(u.pathname)
}

// Segue o redirecionamento (sem baixar a oferta) até sair do próprio site.
// Devolve o endereço final ou null.
export async function followRedirect(start, fetchFn = fetch) {
  const own = host(start)
  let url = start
  for (let i = 0; i < MAX_HOPS; i++) {
    const res = await fetchFn(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': 'TrackingRedirectCheck/1.0' },
    })
    const loc = res.headers.get('location')
    if (!(res.status >= 300 && res.status < 400) || !loc) return null
    const next = new URL(loc, url).toString()
    if (!/^https?:\/\//.test(next)) return null
    if (host(next) !== own) return next
    url = next
  }
  return null
}

const cache = new Map() // productId -> { url, at, ok }

// Destino final do link de afiliado do produto (ou '' se não se aplica / falhou).
// Responde na hora com o que tiver em cache e atualiza em segundo plano;
// só espera na primeira vez.
export async function finalAffiliateUrl(product, { fetchFn = fetch, now = Date.now() } = {}) {
  if (!isOwnRedirect(product)) return ''
  const key = `${product.id}|${product.affiliate_url}`
  const hit = cache.get(key)
  const fresh = hit && now - hit.at < (hit.ok ? OK_FOR : FAIL_FOR)
  if (hit && fresh) return hit.url
  const refresh = followRedirect(product.affiliate_url, fetchFn)
    .then((url) => {
      cache.set(key, { url: url || '', at: Date.now(), ok: Boolean(url) })
      if (url) console.log(`[redirect] ${product.affiliate_url} → ${url}`)
      else console.log(`[redirect] não consegui descobrir o destino de ${product.affiliate_url}`)
      return url || ''
    })
    .catch(() => {
      cache.set(key, { url: hit?.url || '', at: Date.now(), ok: false })
      return hit?.url || ''
    })
  return hit ? hit.url : refresh
}

export function clearRedirectCache() {
  cache.clear()
}
