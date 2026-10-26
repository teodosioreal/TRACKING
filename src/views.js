// HTML do painel, renderizado no servidor.
import { PERIODS } from './stats.js'
import { PLATFORMS } from './products.js'

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const money = (n, cur) => `${cur === 'USD' ? 'US$' : cur} ${(n || 0).toFixed(2)}`
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')

function when(iso, tz) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })
}

function ago(iso, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `há ${s}s`
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return `há ${Math.round(s / 86400)} dias`
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#16181d;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--ok:#15803d;--okbg:#ecfdf3;--warn:#a16207;--warnbg:#fefce8;--bad:#b91c1c;--badbg:#fef2f2}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--text:#e7e9ee;--muted:#9aa1ad;--line:#272b35;--accent:#60a5fa;--ok:#4ade80;--okbg:#0f2a1b;--warn:#facc15;--warnbg:#2a250f;--bad:#f87171;--badbg:#2c1414}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent)}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:17px;margin:0}.brand{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.ver{font-size:12px;color:var(--muted);text-decoration:none}.ver:hover{text-decoration:underline}nav a{color:var(--muted);text-decoration:none;margin-left:16px}nav a.on{color:var(--text);font-weight:600}
main{max-width:1200px;margin:0 auto;padding:20px 16px 60px}
h2.title{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 18px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:16px}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--text);text-decoration:none;background:var(--card)}
.chips a.on{background:var(--accent);border-color:var(--accent);color:#fff}
select,input[type=text],input[type=url]{font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);width:100%}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:22px;margin-top:2px}.kpi span{color:var(--muted);font-size:12px}.kpi small{font-size:13px;font-weight:500}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:18px;overflow:hidden}
section>h3{font-size:15px;margin:0;padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.num{display:inline-flex;width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff;font-size:13px;align-items:center;justify-content:center;flex:none}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:500}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line)}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.muted{color:var(--muted)}
.empty{padding:18px 16px;color:var(--muted)}
.box{padding:16px}.box p{margin:0 0 10px}.box ol{margin:0 0 12px;padding-left:20px}.box li{margin-bottom:8px}
.code{display:flex;gap:8px;align-items:flex-start;margin:6px 0 14px}
.code pre{flex:1;min-width:0;margin:0;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;white-space:pre-wrap;word-break:break-all;font-size:12.5px}
button,.btn{font:inherit;display:inline-block;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none;white-space:nowrap}
.btn.primary,button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.danger,button.danger{color:var(--bad)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
.check{list-style:none;margin:0;padding:0}.check li{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}.check li:last-child{border-bottom:0}
.check .ic{flex:none;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:700}
.check .s-ok .ic{background:var(--okbg);color:var(--ok)}.check .s-wait .ic{background:var(--bg);color:var(--muted)}.check .s-bad .ic{background:var(--badbg);color:var(--bad)}.check .s-warn .ic{background:var(--warnbg);color:var(--warn)}
.check li>div>b{display:block}.check span{color:var(--muted);font-size:13px;word-break:break-word}
.form{padding:16px;display:grid;gap:16px;max-width:640px}.form label b{display:block;margin-bottom:4px}.form .hint{color:var(--muted);font-size:12.5px;margin-top:4px}.form .err{color:var(--bad);font-size:12.5px;margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;text-decoration:none;color:var(--text);display:block}
.card:hover{border-color:var(--accent)}.card h4{margin:0 0 2px;font-size:15px}.card .stats{display:flex;gap:16px;margin-top:10px;font-size:13px}
.flash{padding:10px 14px;border-radius:8px;margin-bottom:16px;background:var(--okbg);color:var(--ok);border:1px solid var(--line)}
.conv{margin-bottom:16px}.conv .row{display:flex;gap:8px;margin-top:4px}.conv .row input{flex:1;min-width:0}.conv .hint{color:var(--muted);font-size:12.5px;margin-top:6px}
.flash.bad{background:var(--badbg);color:var(--bad)}
#verify-result{margin-top:4px}
@media (max-width:600px){.conv .row{flex-wrap:wrap}.conv .row input{flex-basis:100%}header{padding:12px 16px}nav a{margin-left:12px}.code{flex-direction:column}.code button{align-self:flex-end}}
`

const SCRIPT = `
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy-input]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copyInput).value.trim());const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('submit',e=>{const m=e.target.dataset.confirm;if(m&&!confirm(m))e.preventDefault()})
`

// Versão em execução, definida pelo servidor ao iniciar.
let app = { version: { hash: null, date: null, message: null, startedAt: null }, tz: 'America/Sao_Paulo' }
export function setAppInfo(info) {
  app = info
}

function versionLabel() {
  const v = app.version
  if (!v.hash) return 'versão desconhecida'
  const d = new Date(v.date).toLocaleString('pt-BR', { timeZone: app.tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `Atualizado ${d} · ${v.hash}`
}

function layout(title, active, body, extraJs = '') {
  const link = (href, key, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${label}</a>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header><div class="brand"><h1>Tracking</h1><a class="ver" href="/configuracoes#versao" title="${esc(app.version.message || '')}">${esc(versionLabel())}</a></div><nav>${link('/', 'painel', 'Painel')}${link('/produtos', 'produtos', 'Produtos')}${link('/configuracoes', 'config', 'Configurações')}</nav></header>
<main>${body}</main>
<script>${SCRIPT}${extraJs}</script>
</body></html>`
}

const copy = (id, text, label = 'Copiar') =>
  `<div class="code"><pre id="${id}">${esc(text)}</pre><button type="button" data-copy="${id}">${label}</button></div>`

function table(cols, rows, empty) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`
  const head = cols.map((c) => `<th class="${c.n ? 'n' : ''}">${esc(c.label)}</th>`).join('')
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? 'n' : ''}">${c.html(r)}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

function breakdownTable(rows, firstLabel, cur) {
  return table(
    [
      { label: firstLabel, html: (r) => esc(r.label) },
      { label: 'Visitas', n: 1, html: (r) => r.visitas },
      { label: 'Cliques no botão', n: 1, html: (r) => r.cliques },
      { label: 'CTR página', n: 1, html: (r) => pct(r.cliques, r.visitas) },
      { label: 'Vendas', n: 1, html: (r) => r.vendas },
      { label: 'Conv.', n: 1, html: (r) => pct(r.vendas, r.visitas) },
      { label: 'Comissão', n: 1, html: (r) => money(r.comissao, cur) },
    ],
    rows,
    'Nada neste período.',
  )
}

const saleStatus = (r) =>
  ({
    approved: '<span class="tag ok">aprovada</span>',
    refunded: '<span class="tag bad">reembolsada</span>',
    refund: '<span class="tag bad">reembolso</span>',
    test: '<span class="tag warn">teste</span>',
  })[r.status] || esc(r.status)

// ---------------------------------------------------------------- Painel

export function dashboardPage(d, { period, tz, currency, products, productId }) {
  const t = d.totals
  const qs = (p, prod) => `/?periodo=${p}${prod ? `&produto=${prod}` : ''}`
  const periods = Object.entries(PERIODS)
    .map(([k, v]) => `<a href="${qs(k, productId)}" class="${k === period ? 'on' : ''}">${v}</a>`)
    .join('')
  const options = [`<option value="">Todos os produtos</option>`]
    .concat(
      products.map(
        (p) => `<option value="${esc(p.id)}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)}</option>`,
      ),
    )
    .join('')
  const kpi = (label, value) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`

  const sales = table(
    [
      { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
      { label: 'Status', html: saleStatus },
      { label: 'Produto', html: (r) => esc(r.produto || r.product || '—') },
      { label: 'Tipo', html: (r) => esc(r.type) },
      { label: 'Pedido', html: (r) => esc(r.order_id) },
      { label: 'Campanha', html: (r) => esc(r.campanha) },
      { label: 'Palavra-chave', html: (r) => esc(r.palavra) },
      {
        label: 'Vai pro Google',
        html: (r) =>
          r.status !== 'approved'
            ? '<span class="muted">não</span>'
            : r.gclid
              ? '<span class="ok">sim (gclid)</span>'
              : '<span class="bad">sem gclid</span>',
      },
      { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
    ],
    d.recentSales,
    'Nenhuma venda neste período.',
  )

  const clicks = table(
    [
      { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) + (r.is_test ? ' <span class="tag warn">teste</span>' : '') },
      { label: 'Produto', html: (r) => esc(r.produto || '—') },
      { label: 'ID da visita', html: (r) => `<code>${esc(r.id)}</code>` },
      { label: 'Campanha', html: (r) => esc(r.campanha) },
      { label: 'Palavra-chave', html: (r) => esc(r.palavra) },
      { label: 'Disp.', html: (r) => esc(r.device) },
      { label: 'Google', html: (r) => (r.gclid ? '<span class="ok">gclid</span>' : r.gbraid || r.wbraid ? 'gbraid/wbraid' : '—') },
      { label: 'Clicou no botão', html: (r) => (r.outbound_at ? `<span class="ok">sim (${r.outbound_count}x)</span>` : '—') },
    ],
    d.recentClicks,
    'Nenhuma visita neste período.',
  )

  const noProducts = products.length
    ? ''
    : `<div class="flash">Comece cadastrando seu primeiro produto em <a href="/produtos/novo">Produtos → Novo produto</a>.</div>`

  return layout(
    'Painel — Tracking',
    'painel',
    `${noProducts}
<div class="bar"><div class="chips">${periods}</div>
<form method="get" action="/" style="min-width:220px"><input type="hidden" name="periodo" value="${esc(period)}">
<select name="produto" onchange="this.form.submit()">${options}</select></form></div>
<div class="kpis">
${kpi('Visitas', t.visitas)}
${kpi('Visitas do Google (gclid)', t.google)}
${kpi('Cliques no botão', `${t.cliques} <small class="muted">${pct(t.cliques, t.visitas)}</small>`)}
${kpi('Vendas', `${t.vendas} <small class="muted">${pct(t.vendas, t.visitas)}</small>`)}
${kpi('Comissão', money(t.comissao, currency))}
${kpi('Reembolsos', t.reembolsos)}
</div>
<section><h3>Por campanha</h3>${breakdownTable(d.campaigns, 'Campanha', currency)}</section>
<section><h3>Por palavra-chave</h3>${breakdownTable(d.keywords, 'Palavra-chave', currency)}</section>
<section><h3>Vendas</h3>${sales}</section>
<section><h3>Últimas visitas</h3>${clicks}</section>`,
  )
}

// ---------------------------------------------------------------- Produtos

export function productsPage(products, { currency, archivedCount, showArchived }) {
  const cards = products.length
    ? `<div class="cards">${products
        .map((p) => {
          const installed = p.last_ping_at
            ? '<span class="tag ok">script instalado</span>'
            : '<span class="tag warn">aguardando instalação</span>'
          return `<a class="card" href="/produtos/${esc(p.id)}">
<h4>${esc(p.name)}</h4><div class="muted">${esc(PLATFORMS[p.platform] || p.platform)} · ${installed}</div>
<div class="stats"><span><b>${p.visitas}</b> visitas</span><span><b>${p.vendas}</b> vendas</span><span><b>${money(p.comissao, currency)}</b></span></div></a>`
        })
        .join('')}</div>`
    : `<section><div class="empty">${showArchived ? 'Nenhum produto arquivado.' : 'Nenhum produto ainda. Clique em <b>Novo produto</b> para começar.'}</div></section>`

  const toggle = showArchived
    ? `<a href="/produtos">← Voltar para os produtos ativos</a>`
    : archivedCount
      ? `<a href="/produtos?arquivados=1">Ver arquivados (${archivedCount})</a>`
      : ''

  return layout(
    'Produtos — Tracking',
    'produtos',
    `<div class="bar"><div><h2 class="title">${showArchived ? 'Produtos arquivados' : 'Produtos'}</h2>
<p class="sub" style="margin:0">Cada produto tem seu script, sua conversão no Google Ads e sua planilha.</p></div>
${showArchived ? '' : '<a class="btn primary" href="/produtos/novo">+ Novo produto</a>'}</div>
${cards}<p>${toggle}</p>`,
  )
}

export function productFormPage({ product, values, errors = {}, defaultConversion }) {
  const v = values || product || {}
  const editing = Boolean(product)
  const err = (k) => (errors[k] ? `<div class="err">${esc(errors[k])}</div>` : '')
  const platformOptions = Object.entries(PLATFORMS)
    .map(([k, label]) => `<option value="${k}" ${v.platform === k ? 'selected' : ''}>${label}</option>`)
    .join('')
  const action = editing ? `/produtos/${esc(product.id)}` : '/produtos'

  return layout(
    `${editing ? 'Editar' : 'Novo'} produto — Tracking`,
    'produtos',
    `<h2 class="title">${editing ? 'Editar produto' : 'Novo produto'}</h2>
<p class="sub">${editing ? '' : 'Depois de salvar, você recebe o script para colocar na página de review.'}</p>
<section><form class="form" method="post" action="${action}">
<label><b>Nome do produto</b><input type="text" name="name" value="${esc(v.name)}" placeholder="Ex.: Sugar Defender" required maxlength="100" autofocus>${err('name')}</label>
<label><b>Plataforma</b><select name="platform">${platformOptions}</select>${err('platform')}</label>
<label><b>Nome da conversão no Google Ads</b>
<input type="text" name="conversion_name" id="conversion_name" value="${esc(v.conversion_name)}" placeholder="${esc(defaultConversion)}" required maxlength="100">
<div class="hint">É o nome que você vai dar para a ação de conversão no Google Ads. Tem que ser <b>idêntico</b> lá e aqui (maiúsculas, espaços e acentos contam).</div>${err('conversion_name')}</label>
<label><b>Endereço da página de review</b> <span class="muted">(opcional, usado no teste de instalação)</span>
<input type="url" name="review_url" value="${esc(v.review_url)}" placeholder="https://meusite.com/produto-review">${err('review_url')}</label>
<div class="actions"><button class="primary" type="submit">${editing ? 'Salvar alterações' : 'Cadastrar produto'}</button>
<a class="btn" href="${editing ? `/produtos/${esc(product.id)}` : '/produtos'}">Cancelar</a></div>
</form></section>`,
    editing
      ? ''
      : `const n=document.querySelector('[name=name]'),c=document.getElementById('conversion_name');let touched=!!c.value;
c.addEventListener('input',()=>touched=true);n.addEventListener('input',()=>{if(!touched)c.value=n.value.trim()?'Compra - '+n.value.trim():''})`,
  )
}

// Itens do checklist. Recarregado a cada poucos segundos na página do produto.
export function checklistHtml(product, st, { tz }) {
  const item = (state, icon, title, detail) =>
    `<li class="s-${state}"><div class="ic">${icon}</div><div><b>${title}</b><span>${detail}</span></div></li>`
  const items = []

  if (st.ping) {
    items.push(
      item('ok', '✓', 'Script instalado na página', `Último sinal ${ago(st.ping.at)} em ${esc(st.ping.url)}`),
    )
    items.push(
      st.ping.links > 0
        ? item('ok', '✓', 'Links de compra com rastreio', `${st.ping.links} link(s) da BuyGoods encontrados e marcados com o subid.`)
        : item(
            'bad',
            '!',
            'Nenhum link de compra encontrado na página',
            'O script está lá, mas não achou link da BuyGoods. Sem isso as vendas não são ligadas ao anúncio. Confira se o botão aponta para buygoods.com ou coloque <code>data-rastrear</code> no link.',
          ),
    )
  } else {
    items.push(
      item('wait', '1', 'Script instalado na página', 'Aguardando o primeiro sinal. Cole o script no site e clique em <b>Testar instalação</b>.'),
    )
    items.push(item('wait', '2', 'Links de compra com rastreio', 'Aparece junto com o sinal do script.'))
  }

  items.push(
    st.lastGoogleVisit
      ? item('ok', '✓', 'Visita vinda do Google Ads', `Última visita com gclid ${ago(st.lastGoogleVisit.created_at)}.`)
      : item('wait', '3', 'Visita vinda do Google Ads', 'Aparece quando alguém clicar no anúncio (o gclid chega na URL).'),
  )

  if (st.lastRealSale) {
    items.push(item('ok', '✓', 'Venda recebida da BuyGoods', `Última venda deste produto ${ago(st.lastRealSale.created_at)}.`))
  } else if (st.anyPostback) {
    items.push(
      item('warn', '4', 'Venda recebida da BuyGoods', `O postback está funcionando (último ${ago(st.anyPostback.created_at)}), mas ainda não houve venda deste produto.`),
    )
  } else {
    items.push(item('wait', '4', 'Venda recebida da BuyGoods', 'Nenhum postback recebido ainda. Confira o passo 2.'))
  }

  items.push(
    st.csvFetch
      ? item('ok', '✓', 'Google Ads lendo a planilha', `Última leitura ${ago(st.csvFetch.at)} (${esc(when(st.csvFetch.at, tz))}).`)
      : item('wait', '5', 'Google Ads lendo a planilha', 'Ainda não houve leitura. Configure a programação no passo 3.'),
  )

  return `<ul class="check">${items.join('')}</ul>`
}

export function productPage(product, st, { base, key, tz, currency, flash }) {
  const script = `<script src="${base}/t.js?p=${product.id}" async></script>`
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}&produto=${product.id}`
  const suffix = 'campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}'
  const testUrl = product.review_url
    ? product.review_url + (product.review_url.includes('?') ? '&' : '?') + 'rt_teste=1'
    : ''
  const flashHtml = flash ? `<div class="flash ${flash.bad ? 'bad' : ''}">${esc(flash.text)}</div>` : ''

  return layout(
    `${product.name} — Tracking`,
    'produtos',
    `${flashHtml}<div class="bar"><div><h2 class="title">${esc(product.name)}</h2>
<p class="sub" style="margin:0">${esc(PLATFORMS[product.platform] || product.platform)} · conversão <b>${esc(product.conversion_name)}</b>${product.archived ? ' · <span class="tag warn">arquivado</span>' : ''}</p></div>
<div class="actions" style="margin:0"><a class="btn" href="/?periodo=30d&produto=${esc(product.id)}">Ver resultados</a><a class="btn" href="/produtos/${esc(product.id)}/editar">Editar</a></div></div>

<section><h3>Status da configuração <span class="muted" style="font-weight:400;font-size:12px">atualiza sozinho</span></h3>
<div id="checklist">${checklistHtml(product, st, { tz })}</div></section>

<section><h3><span class="num">1</span> Instalar o script na página de review</h3><div class="box">
<p>Cole este código na página de review deste produto, antes do <code>&lt;/body&gt;</code>:</p>
${copy('script', script, 'Copiar script')}
<p>Depois clique em <b>Testar instalação</b>. A página abre numa aba nova e, em poucos segundos, os itens 1 e 2 do status ficam verdes.</p>
<div class="actions">
${
  testUrl
    ? `<a class="btn primary" href="${esc(testUrl)}" target="_blank" rel="noopener">Testar instalação</a>
<button type="button" id="verify">Verificar o código da página</button>`
    : `<a class="btn" href="/produtos/${esc(product.id)}/editar">Informe o endereço da página para testar</a>`
}
</div>
<div id="verify-result" class="muted"></div>
<p class="muted">Todo link para <b>buygoods</b> recebe o <code>subid</code> sozinho. Se o botão de compra usa outro domínio (ex.: link encurtado), coloque o atributo <code>data-rastrear</code> nesse link.</p>
</div></section>

<section><h3><span class="num">2</span> BuyGoods — postback</h3><div class="box">
<p>Na BuyGoods, em <b>Postback Pixels</b>, cadastre esta URL. <b>É a mesma para todos os produtos</b>: se já cadastrou uma vez, não precisa de novo.</p>
${copy('postback', postback)}
<p class="muted">Quer conferir que a venda cai neste produto? Abra a página pelo <b>Testar instalação</b> e depois clique abaixo. A venda de teste não vai para o Google Ads nem entra nos totais.</p>
<form method="post" action="/produtos/${esc(product.id)}/simular-venda" class="actions">
<button type="submit">Simular venda de teste</button></form>
${st.lastSale && st.lastSale.status === 'test' ? `<p class="ok">✓ Venda de teste ligada a este produto ${ago(st.lastSale.created_at)}.</p>` : ''}
</div></section>

<section id="google-ads"><h3><span class="num">3</span> Google Ads</h3><div class="box">
<form class="conv" method="post" action="/produtos/${esc(product.id)}/conversao">
<label for="conv-input"><b>Nome da conversão</b></label>
<div class="row"><input type="text" id="conv-input" name="conversion_name" value="${esc(product.conversion_name)}" required maxlength="100">
<button type="submit">Salvar nome</button><button type="button" data-copy-input="conv-input">Copiar nome</button></div>
<div class="hint">As vendas deste produto vão para o Google Ads com este nome. Tem que ser <b>idêntico</b> ao nome da ação de conversão lá (maiúsculas, espaços e acentos contam).</div>
${st.lastRealSale ? `<div class="hint warn">Atenção: este produto já tem vendas. Se o Google Ads já importou vendas com o nome atual, trocar o nome faz ele importar de novo as vendas dos últimos dias na conversão nova (contagem em dobro). Troque só para corrigir um nome que ainda não existe no Google Ads.</div>` : ''}
</form>
<ol>
<li>Em <b>Metas → Conversões → Resumo → + Nova ação de conversão → Importar → Arquivo/programação → Conversões de cliques</b>, crie a ação com o nome acima.
Categoria <b>Compra</b>, valor <b>"Usar valores diferentes para cada conversão"</b>, contagem <b>Todas</b> (para contar upsells).</li>
<li>Em <b>Metas → Conversões → Uploads → Programações → +</b>, escolha a fonte <b>HTTPS</b>, cole o link abaixo e escolha a frequência <b>a cada 6 horas</b>:
${copy('csv', csv, 'Copiar link')}</li>
<li>Em <b>Admin → Configurações da conta</b>, deixe a <b>codificação automática</b> ativada e, em <b>Rastreamento → Sufixo do URL final</b>, cole (uma vez por conta):
${copy('suffix', suffix)}</li>
</ol>
<p class="muted">A planilha deste produto tem ${st.salesForGoogle} venda(s) com gclid nos últimos dias. <a href="/google-ads.csv?key=${esc(key)}&produto=${esc(product.id)}" target="_blank">Ver a planilha</a></p>
</div></section>

<section><h3>Arquivar</h3><div class="box">
<p class="muted">Arquivar esconde o produto da lista. Visitas e vendas continuam guardadas e o script continua funcionando.</p>
<form method="post" action="/produtos/${esc(product.id)}/${product.archived ? 'reativar' : 'arquivar'}" ${product.archived ? '' : 'data-confirm="Arquivar este produto?"'}>
<button type="submit" class="${product.archived ? '' : 'danger'}">${product.archived ? 'Reativar produto' : 'Arquivar produto'}</button></form>
</div></section>`,
    `
const pid=${JSON.stringify(product.id)};
setInterval(async()=>{try{const r=await fetch('/produtos/'+pid+'/checklist');if(r.ok)document.getElementById('checklist').innerHTML=await r.text()}catch(e){}},4000);
const vb=document.getElementById('verify');
if(vb)vb.addEventListener('click',async()=>{const out=document.getElementById('verify-result');out.textContent='Verificando…';
try{const r=await(await fetch('/produtos/'+pid+'/verificar')).json();out.innerHTML=r.html}catch(e){out.textContent='Não consegui verificar agora.'}});
`,
  )
}

// ---------------------------------------------------------------- Configurações

export function settingsPage({ base, key, conversionName, currency, days, lastPostback, csvFetch, tz, flash }) {
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}`
  return layout(
    'Configurações — Tracking',
    'config',
    `${flash ? `<div class="flash ${flash.bad ? 'bad' : ''}">${esc(flash.text)}</div>` : ''}<h2 class="title">Configurações gerais</h2>
<p class="sub">O que vale para todos os produtos. A configuração de cada produto fica na página dele.</p>

<section><h3>BuyGoods — postback (um só para todos os produtos)</h3><div class="box">
${copy('postback', postback)}
<p>${lastPostback ? `<span class="ok">✓ Último postback recebido ${ago(lastPostback.created_at)} (${esc(when(lastPostback.created_at, tz))}).</span>` : '<span class="muted">Nenhum postback recebido ainda.</span>'}</p>
</div></section>

<section><h3>Google Ads — planilha com todos os produtos</h3><div class="box">
<p>Se todos os produtos rodam na <b>mesma conta</b> do Google Ads, você pode usar uma programação só com este link (cada venda vai com o nome de conversão do seu produto). Se cada produto roda numa conta diferente, use o link da página de cada produto.</p>
${copy('csv', csv)}
<p>${csvFetch ? `<span class="ok">✓ Lida pela última vez ${ago(csvFetch.at)}.</span>` : '<span class="muted">Ainda não foi lida pelo Google Ads.</span>'}</p>
<p class="muted">Vendas aprovadas dos últimos ${days} dias, com gclid, em ${esc(currency)}. O Google ignora vendas que já importou.</p>
</div></section>

<section id="versao"><h3>Versão no ar</h3><div class="box">
${
  app.version.hash
    ? `<p><b>${esc(app.version.message)}</b></p>
<p class="muted">Commit <code>${esc(app.version.hash)}</code> · feito em ${esc(when(app.version.date, tz))} · servidor reiniciado em ${esc(when(app.version.startedAt, tz))}</p>`
    : `<p class="muted">Não consegui ler a versão (pasta sem git). Servidor iniciado em ${esc(when(app.version.startedAt, tz))}.</p>`
}
<p class="muted">A VPS confere o GitHub a cada minuto. Depois de uma atualização, esta linha e a do topo mudam sozinhas.</p>
</div></section>

<section><h3>Nome padrão da conversão</h3><div class="box">
<p class="muted">Cada produto usa o nome de conversão definido na página dele. Este nome só vale para vendas de visitas <b>sem produto</b> (páginas com o script antigo, sem <code>?p=</code>).</p>
<form class="conv" method="post" action="/configuracoes">
<div class="row"><input type="text" name="conversion_name" value="${esc(conversionName)}" required maxlength="100"><button type="submit">Salvar</button></div>
</form>
</div></section>`,
  )
}
