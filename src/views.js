// HTML do painel, renderizado no servidor.
import { PERIODS } from './stats.js'

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const money = (n, cur) => `${cur === 'USD' ? 'US$' : cur} ${(n || 0).toFixed(2)}`
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—')

function when(iso, tz) {
  return new Date(iso).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#16181d;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--ok:#15803d;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--text:#e7e9ee;--muted:#9aa1ad;--line:#272b35;--accent:#60a5fa;--ok:#4ade80;--bad:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header h1{font-size:17px;margin:0}nav a{color:var(--muted);text-decoration:none;margin-left:14px}nav a.on{color:var(--text);font-weight:600}
main{max-width:1200px;margin:0 auto;padding:20px 16px 60px}
.periods{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}.periods a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--text);text-decoration:none;background:var(--card)}
.periods a.on{background:var(--accent);border-color:var(--accent);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}.kpi b{display:block;font-size:22px;margin-top:2px}.kpi span{color:var(--muted);font-size:12px}.kpi small{font-size:13px;font-weight:500}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:18px;overflow:hidden}
section h2{font-size:14px;margin:0;padding:12px 14px;border-bottom:1px solid var(--line)}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:500}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line)}.ok{color:var(--ok)}.bad{color:var(--bad)}.muted{color:var(--muted)}
.empty{padding:16px 14px;color:var(--muted)}
.box{padding:14px}.box p{margin:0 0 8px}.code{display:flex;gap:8px;align-items:flex-start;margin:6px 0 16px}
.code pre{flex:1;margin:0;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-size:12.5px}
button{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
ol li{margin-bottom:6px}
`

function layout(title, active, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header><h1>Rastreador</h1><nav>
<a href="/" class="${active === 'painel' ? 'on' : ''}">Painel</a>
<a href="/configurar" class="${active === 'configurar' ? 'on' : ''}">Configurar</a></nav></header>
<main>${body}</main>
<script>document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);b.textContent='Copiado';setTimeout(()=>b.textContent='Copiar',1200)})</script>
</body></html>`
}

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

export function dashboardPage(d, { period, tz, currency }) {
  const t = d.totals
  const periods = Object.entries(PERIODS)
    .map(([k, v]) => `<a href="/?periodo=${k}" class="${k === period ? 'on' : ''}">${v}</a>`)
    .join('')
  const kpi = (label, value) => `<div class="kpi"><span>${label}</span><b>${value}</b></div>`

  const status = (r) =>
    r.status === 'approved'
      ? '<span class="tag ok">aprovada</span>'
      : r.status === 'refunded'
        ? '<span class="tag bad">reembolsada</span>'
        : '<span class="tag bad">reembolso</span>'

  const sales = table(
    [
      { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
      { label: 'Status', html: status },
      { label: 'Tipo', html: (r) => esc(r.type) },
      { label: 'Pedido', html: (r) => esc(r.order_id) },
      { label: 'Produto', html: (r) => esc(r.product) },
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
      { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
      { label: 'ID da visita', html: (r) => `<code>${esc(r.id)}</code>` },
      { label: 'Campanha', html: (r) => esc(r.campanha) },
      { label: 'Palavra-chave', html: (r) => esc(r.palavra) },
      { label: 'Disp.', html: (r) => esc(r.device) },
      { label: 'Google', html: (r) => (r.gclid ? '<span class="ok">gclid</span>' : r.gbraid || r.wbraid ? 'gbraid/wbraid' : '—') },
      { label: 'Clicou no botão', html: (r) => (r.outbound_at ? `<span class="ok">sim (${r.outbound_count}x)</span>` : '—') },
      { label: 'IP', html: (r) => esc(r.ip) },
    ],
    d.recentClicks,
    'Nenhuma visita neste período.',
  )

  return layout(
    'Painel — Rastreador',
    'painel',
    `<div class="periods">${periods}</div>
<div class="kpis">
${kpi('Visitas', t.visitas)}
${kpi('Visitas do Google (gclid)', t.google)}
${kpi('Cliques no botão', `${t.cliques} <small class="muted">${pct(t.cliques, t.visitas)}</small>`)}
${kpi('Vendas', `${t.vendas} <small class="muted">${pct(t.vendas, t.visitas)}</small>`)}
${kpi('Comissão', money(t.comissao, currency))}
${kpi('Reembolsos', t.reembolsos)}
</div>
<section><h2>Por campanha</h2>${breakdownTable(d.campaigns, 'Campanha', currency)}</section>
<section><h2>Por palavra-chave</h2>${breakdownTable(d.keywords, 'Palavra-chave', currency)}</section>
<section><h2>Vendas</h2>${sales}</section>
<section><h2>Últimas visitas</h2>${clicks}</section>`,
  )
}

export function setupPage({ base, key, conversionName, currency, days }) {
  const copy = (id, text) =>
    `<div class="code"><pre id="${id}">${esc(text)}</pre><button data-copy="${id}">Copiar</button></div>`
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}`
  const test = `${base}/postback?key=${key}&subid=COLE_UM_ID_DE_VISITA&order=TESTE-${Date.now()}&amount=1.00&type=sale&product=teste`

  return layout(
    'Configurar — Rastreador',
    'configurar',
    `<section><h2>1. Página de review</h2><div class="box">
<p>Cole antes do <code>&lt;/body&gt;</code> da página de review:</p>
${copy('snippet', `<script src="${base}/t.js" async></script>`)}
<p class="muted">Todo link para <b>buygoods</b> ganha <code>&amp;subid=ID_DA_VISITA</code> sozinho. Para um link de outro domínio (ex.: link encurtado), coloque o atributo <code>data-rastrear</code> no &lt;a&gt;.</p>
</div></section>

<section><h2>2. Google Ads — sufixo do URL final</h2><div class="box">
<p>Em <b>Configurações da conta → Rastreamento → Sufixo do URL final</b> (o gclid já vem com a codificação automática ativada):</p>
${copy('suffix', 'campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}')}
<p class="muted">Quer ver o nome da campanha em vez do ID? No sufixo de cada campanha, acrescente <code>&amp;utm_campaign=NomeDaCampanha</code>.</p>
</div></section>

<section><h2>3. BuyGoods — postback</h2><div class="box">
<p>Na BuyGoods, em <b>Postback Pixels</b>, cadastre esta URL (vale para todas as ofertas):</p>
${copy('postback', postback)}
<p class="muted">Para testar: abra a página de review, copie o ID da visita em <b>Painel → Últimas visitas</b>, troque no link abaixo e abra no navegador.</p>
${copy('test', test)}
</div></section>

<section><h2>4. Google Ads — planilha de conversões</h2><div class="box">
<ol>
<li>Em <b>Metas → Conversões → Nova ação de conversão → Importar → Conversões de cliques (arquivo/upload manual)</b>, crie a ação com o nome exato <b>${esc(conversionName)}</b>, valor em <b>${esc(currency)}</b>.</li>
<li>Em <b>Metas → Conversões → Uploads → Programações</b>, crie uma programação com fonte <b>HTTPS</b> e esta URL, rodando a cada 6 horas (ou diária):</li>
</ol>
${copy('csv', csv)}
<p class="muted">A planilha tem as vendas aprovadas dos últimos ${days} dias com gclid. Vendas repetidas são ignoradas pelo Google, então pode rodar quantas vezes quiser. Prefere Google Planilhas? Crie uma planilha com <code>=IMPORTDATA("${esc(csv)}")</code> na célula A1 e use ela como fonte.</p>
<p><a href="/google-ads.csv?key=${esc(key)}">Ver a planilha agora</a></p>
</div></section>`,
  )
}
