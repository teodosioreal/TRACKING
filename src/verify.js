// "Verificar o código da página": baixa o HTML da página de review como um
// visitante e diz o que encontrou. Devolve um trecho de HTML para o painel.
import { esc } from './views.js'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export async function checkPage(product, fetchImpl = fetch, trackerHost = '') {
  let affHost = ''
  try {
    affHost = product.affiliate_url ? new URL(product.affiliate_url).hostname.replace(/^www\./, '') : ''
  } catch {}
  if (!product.review_url) return '<span class="warn">Informe o endereço da página na aba Configurações.</span>'
  let res
  let body
  try {
    res = await fetchImpl(product.review_url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    })
    body = (await res.text()).slice(0, 3_000_000)
  } catch (err) {
    return `<span class="bad">✗ Não consegui abrir a página (${esc(err.name === 'TimeoutError' ? 'demorou demais' : err.cause?.code || err.message)}).</span>`
  }

  const finalUrl = res.url || product.review_url
  const title = (body.match(/<title[^>]*>([^<]{0,150})/i) || [])[1]?.trim() || '(sem título)'
  const kb = Math.round(body.length / 1024)
  const hasScript = body.includes(`t.js?p=${product.id}`)
  const escaped = /&lt;script[^&]*t\.js\?p=/i.test(body)
  const otherScript = !hasScript && /t\.js\?p=p[a-z0-9]{8}/.test(body)
  const oldScript = !hasScript && trackerHost && body.includes(`${trackerHost}/t.js"`)
  const hrefs = body.match(/href\s*=\s*["'][^"']*["']/gi) || []
  const links = hrefs.filter((h) => /buygoods|[?&](?:amp;)?aff_id=/i.test(h) || (affHost && h.toLowerCase().includes(affHost))).length
  const challenge = /cf-browser-verification|challenge-platform|just a moment\.\.\.|captcha/i.test(body)
  const gtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/.test(body)
  const h = (n) => (res.headers?.get ? res.headers.get(n) : null)
  const cacheHit = [
    ['x-litespeed-cache', 'LiteSpeed Cache'],
    ['cf-cache-status', 'Cloudflare'],
    ['x-cache', 'cache do servidor'],
    ['x-proxy-cache', 'cache do servidor'],
    ['x-wp-super-cache', 'WP Super Cache'],
    ['x-rocket-cache', 'WP Rocket'],
  ]
    .filter(([n]) => /hit/i.test(h(n) || ''))
    .map(([, label]) => label)
  const rocket = /This website is like a Rocket|wp-rocket/i.test(body) ? 'WP Rocket' : null
  const workedInBrowser = Boolean(product.last_ping_at)

  const lines = [
    `<span class="muted">O servidor abriu <b>${esc(finalUrl)}</b> · resposta ${res.status} · ${kb} KB · título: “${esc(title)}”</span>`,
  ]
  if (cacheHit.length) lines.push(`<span class="muted">Página servida pelo cache: ${esc([...new Set(cacheHit)].join(', '))}.</span>`)
  if (!res.ok) lines.push(`<span class="bad">✗ A página respondeu com erro ${res.status}.</span>`)
  if (challenge)
    lines.push(
      '<span class="warn">! A página mostrou uma verificação anti-robô (Cloudflare/captcha) para o servidor. Este teste não enxerga a página de verdade; use o Testar instalação.</span>',
    )

  if (escaped)
    lines.push(
      '<span class="bad">✗ O script está na página como TEXTO, não como código. O editor transformou o código em texto. Cole num bloco/campo de “HTML” ou “código personalizado”, não num bloco de texto.</span>',
    )
  else if (hasScript) lines.push('<span class="ok">✓ Script deste produto encontrado no código da página.</span>')
  else if (otherScript)
    lines.push('<span class="bad">✗ A página tem o script de OUTRO produto. Troque pelo script desta página.</span>')
  else if (oldScript)
    lines.push('<span class="bad">✗ A página tem o script antigo (sem ?p=). Troque pelo script desta página.</span>')
  else if (workedInBrowser)
    lines.push(
      `<span class="warn">! O script funcionou no seu navegador (Testar instalação), mas não está na versão que um visitante anônimo recebe.</span> <span class="muted">${
        cacheHit.length || rocket
          ? `Esta página veio do cache (<b>${esc([...new Set([...cacheHit, rocket].filter(Boolean))].join(', '))}</b>): visitantes estão recebendo uma cópia antiga, <b>sem o script</b>. Limpe o cache do site (e da Cloudflare, se usar) e verifique de novo.`
          : gtm
            ? 'A página usa Google Tag Manager: se você colocou o script por lá, ele não aparece no código e isso é normal. Confirme com o Testar instalação numa janela anônima.'
            : 'O mais comum é cache: logado no WordPress você vê a página nova, e o visitante recebe uma cópia antiga sem o script. Limpe o cache do site (e da Cloudflare, se usar), verifique de novo e faça o Testar instalação numa janela anônima.'
      }</span>`,
    )
  else
    lines.push(
      `<span class="bad">✗ O script não está no código que o servidor recebeu.</span> <span class="muted">Causas comuns: a página não foi publicada/atualizada depois de colar; cache do site (limpe o cache do WordPress/LiteSpeed/Cloudflare); o endereço cadastrado não é a página onde você colou; ou a página usa cloaker/proteção e mostra outra versão para robôs. Se a página é montada por JavaScript, vale o resultado do Testar instalação.</span>`,
    )

  lines.push(
    links
      ? `<span class="ok">✓ ${links} link(s) de afiliado no código.</span>`
      : '<span class="warn">! Nenhum link de afiliado no código.</span> <span class="muted">Cadastre o link de afiliado em Configurações. Se o botão usa link encurtado, coloque <code>data-rastrear</code> nele. Se a página é montada por JavaScript, vale o Testar instalação.</span>',
  )
  return lines.join('<br>')
}
