// "Verificar o código da página": baixa o HTML da página de review e procura
// o script do produto e os links da BuyGoods. Devolve um trecho de HTML.
import { esc } from './views.js'

export async function checkPage(product, fetchImpl = fetch) {
  if (!product.review_url) return '<span class="warn">Informe o endereço da página em Editar.</span>'
  let body
  try {
    const res = await fetchImpl(product.review_url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrackingCheck/1.0)' },
    })
    if (!res.ok) return `<span class="bad">A página respondeu com erro ${res.status}.</span>`
    body = (await res.text()).slice(0, 3_000_000)
  } catch (err) {
    return `<span class="bad">Não consegui abrir a página (${esc(err.name === 'TimeoutError' ? 'demorou demais' : err.message)}).</span>`
  }

  const hasScript = body.includes(`t.js?p=${product.id}`)
  const otherScript = !hasScript && /t\.js\?p=p[a-z0-9]{8}/.test(body)
  const links = (body.match(/href\s*=\s*["'][^"']*buygoods[^"']*["']/gi) || []).length

  const lines = []
  if (hasScript) lines.push('<span class="ok">✓ Script deste produto encontrado no código da página.</span>')
  else if (otherScript)
    lines.push('<span class="bad">✗ A página tem o script de OUTRO produto. Troque pelo script desta página.</span>')
  else
    lines.push(
      '<span class="bad">✗ Script não encontrado no código da página.</span> <span class="muted">Se a página é montada por JavaScript (alguns editores), use o botão Testar instalação: ele é o teste que vale.</span>',
    )
  lines.push(
    links
      ? `<span class="ok">✓ ${links} link(s) da BuyGoods no código.</span>`
      : '<span class="warn">Nenhum link da BuyGoods no código da página.</span> <span class="muted">Se o botão usa link encurtado, coloque <code>data-rastrear</code> nele.</span>',
  )
  return lines.join('<br>')
}
