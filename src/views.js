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
:root{color-scheme:light;--bg:#f4f5f7;--card:#fff;--text:#111318;--text2:#3d424d;--muted:#6b7280;--line:#e6e8ec;--soft:#f8f9fb;--accent:#2563eb;--accent-soft:#eaf1fe;
--series-1:#2a78d6;--ok:#15803d;--okbg:#ecfdf3;--warn:#a16207;--warnbg:#fefce8;--bad:#b91c1c;--badbg:#fef2f2;--side:#0f172a;--side-text:#cbd5e1;--side-on:#fff}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0c0e12;--card:#15181e;--text:#eceef2;--text2:#c5c9d2;--muted:#9aa1ad;--line:#262a33;--soft:#1a1e25;--accent:#60a5fa;--accent-soft:#16233a;
--series-1:#3987e5;--ok:#4ade80;--okbg:#0f2a1b;--warn:#facc15;--warnbg:#2a250f;--bad:#f87171;--badbg:#2c1414;--side:#090b0f;--side-text:#9aa3b2;--side-on:#fff}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}code{font-size:12.5px}
.shell{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh;background:linear-gradient(to right,var(--side) 232px,var(--bg) 232px)}
.side{background:var(--side);color:var(--side-text);padding:20px 14px;display:flex;flex-direction:column;gap:22px;position:sticky;top:0;height:100vh}
.logo{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:650;font-size:16px;padding:0 8px}
.logo .mk{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);display:flex;align-items:center;justify-content:center;font-weight:800}
.side nav{display:flex;flex-direction:column;gap:2px}
.side nav a{display:flex;align-items:center;gap:10px;color:var(--side-text);text-decoration:none;padding:9px 10px;border-radius:8px;font-weight:500}
.side nav a:hover{background:rgba(255,255,255,.06);color:#fff}.side nav a.on{background:rgba(255,255,255,.1);color:var(--side-on)}
.side nav svg{width:18px;height:18px;flex:none}
.ver{margin-top:auto;font-size:12px;color:var(--side-text);opacity:.75;text-decoration:none;padding:0 8px;line-height:1.4}.ver:hover{opacity:1}
.content{padding:28px 32px 64px;max-width:1240px;width:100%}
h2.title{font-size:22px;letter-spacing:-.01em;margin:0 0 2px}.sub{color:var(--muted);margin:0 0 20px}
.page-head{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:space-between;margin-bottom:20px}.page-head .sub{margin:0}
.filters{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.seg{display:inline-flex;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:3px;flex-wrap:wrap}
.seg a{padding:6px 12px;border-radius:7px;color:var(--text2);text-decoration:none;font-weight:500;font-size:13px}.seg a.on{background:var(--accent);color:#fff}
select,input[type=text],input[type=url]{font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);width:100%}
.filters select{width:auto;min-width:200px}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}
.kpis.minor{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px}
.kpi span{color:var(--muted);font-size:12.5px;font-weight:500}.kpi b{display:block;font-size:26px;letter-spacing:-.02em;margin-top:4px;font-variant-numeric:tabular-nums}
.kpi small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.kpis.minor .kpi{padding:12px 14px}.kpis.minor .kpi b{font-size:18px}
.kpi.hero{border-color:transparent;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff}.kpi.hero span,.kpi.hero small{color:rgba(255,255,255,.8)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:18px;overflow:hidden}
section>h3{font-size:15px;margin:0;padding:14px 18px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
section>h3 .right{margin-left:auto;font-weight:500;color:var(--muted);font-size:13px}
.num{display:inline-flex;width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff;font-size:13px;align-items:center;justify-content:center;flex:none}
.tabs{display:flex;gap:4px;padding:0 12px;border-bottom:1px solid var(--line);overflow-x:auto}
.tabs a{padding:13px 10px;color:var(--muted);text-decoration:none;font-weight:500;border-bottom:2px solid transparent;white-space:nowrap}
.tabs a.on{color:var(--text);border-bottom-color:var(--accent)}.tabs .count{font-size:12px;background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:0 7px;margin-left:4px}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px 16px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:500;font-size:12px;background:var(--soft)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}tbody tr:hover td{background:var(--soft)}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:500;border:1px solid var(--line)}
.tag.ok{background:var(--okbg);border-color:transparent}.tag.bad{background:var(--badbg);border-color:transparent}.tag.warn{background:var(--warnbg);border-color:transparent}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.muted{color:var(--muted)}
.empty{padding:28px 18px;color:var(--muted);text-align:center}
.box{padding:18px}.box p{margin:0 0 10px}.box ol{margin:0 0 12px;padding-left:20px}.box li{margin-bottom:10px}
.code{display:flex;gap:8px;align-items:flex-start;margin:6px 0 14px}
.code pre{flex:1;min-width:0;margin:0;padding:10px 12px;background:var(--soft);border:1px solid var(--line);border-radius:9px;white-space:pre-wrap;word-break:break-all;font-size:12.5px}
button,.btn{font:inherit;font-weight:500;display:inline-block;padding:8px 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,.btn:hover{border-color:var(--muted)}
.btn.primary,button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.danger,button.danger{color:var(--bad)}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px}
.check{list-style:none;margin:0;padding:0}.check li{display:flex;gap:12px;padding:13px 18px;border-bottom:1px solid var(--line)}.check li:last-child{border-bottom:0}
.check .ic{flex:none;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:700}
.check .s-ok .ic{background:var(--okbg);color:var(--ok)}.check .s-wait .ic{background:var(--soft);color:var(--muted);border:1px solid var(--line)}.check .s-bad .ic{background:var(--badbg);color:var(--bad)}.check .s-warn .ic{background:var(--warnbg);color:var(--warn)}
.check li>div>b{display:block}.check span{color:var(--muted);font-size:13px;word-break:break-word}
.form{padding:18px;display:grid;gap:16px;max-width:640px}.form label b{display:block;margin-bottom:4px}.form .hint{color:var(--muted);font-size:12.5px;margin-top:4px}.form .err{color:var(--bad);font-size:12.5px;margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;text-decoration:none;color:var(--text);display:block}
.card:hover{border-color:var(--accent)}.card h4{margin:0 0 4px;font-size:15px}.card .stats{display:flex;gap:18px;margin-top:12px;font-size:13px;color:var(--muted)}.card .stats b{color:var(--text)}
.flash{padding:11px 14px;border-radius:10px;margin-bottom:16px;background:var(--okbg);color:var(--ok);border:1px solid var(--line)}
.flash.bad{background:var(--badbg);color:var(--bad)}
.alert{display:flex;gap:12px;padding:14px 16px;border-radius:12px;margin-bottom:18px;background:var(--badbg);border:1px solid var(--bad);color:var(--text)}
.alert b{color:var(--bad)}.alert p{margin:2px 0 0}.alert code{background:var(--card);padding:1px 6px;border-radius:5px}
.conv{margin-bottom:16px}.conv .row{display:flex;gap:8px;margin-top:4px}.conv .row input{flex:1;min-width:0}.conv .hint{color:var(--muted);font-size:12.5px;margin-top:6px}
#verify-result,#test-status{margin-top:6px;line-height:1.7}
.chart{position:relative;padding:18px 18px 10px}
.chart .plot{position:relative;height:200px;margin-left:56px}
.chart .grid div{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
.chart .grid span{position:absolute;right:calc(100% + 8px);transform:translateY(-50%);font-size:11.5px;color:var(--muted);white-space:nowrap}
.chart .bars{position:absolute;inset:0;display:flex;align-items:flex-end}
.chart .col{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;padding:0 1px;cursor:default}
.chart .col:hover{background:var(--soft)}
.chart .b{width:100%;max-width:30px;background:var(--series-1);border-radius:4px 4px 0 0;min-height:0}
.chart .xl{position:relative;height:22px;margin-left:56px}.chart .xl span{position:absolute;transform:translateX(-50%);font-size:11.5px;color:var(--muted);top:6px;white-space:nowrap}
.chart .tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.12);white-space:nowrap;z-index:2}
.chart .tip b{display:block;margin-bottom:2px}
details.tbl{border-top:1px solid var(--line)}details.tbl summary{padding:10px 18px;color:var(--muted);cursor:pointer;font-size:13px}
@media (max-width:1100px){.kpis.minor{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:900px){.shell{display:block;background:var(--bg)}.side{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:12px 16px}
.side nav{flex-direction:row;gap:2px;overflow-x:auto}.side nav a{padding:7px 9px}.side nav svg{display:none}.ver{margin:0;width:100%;order:3;padding:0}
.content{padding:18px 16px 48px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpis.minor{grid-template-columns:repeat(2,minmax(0,1fr))}.filters{width:100%}.filters form,.filters select{width:100%}}
@media (max-width:600px){.conv .row{flex-wrap:wrap}.conv .row input{flex-basis:100%}.code{flex-direction:column}.code button{align-self:flex-end}.kpi b{font-size:22px}.chart .plot,.chart .xl{margin-left:44px}}
`

const SCRIPT = `
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy-input]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copyInput).value.trim());const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('submit',e=>{const m=e.target.dataset.confirm;if(m&&!confirm(m))e.preventDefault()})
document.querySelectorAll('[data-chart]').forEach(ch=>{const tip=ch.querySelector('.tip');
ch.querySelectorAll('.col').forEach(c=>{c.addEventListener('mouseenter',()=>{tip.innerHTML=c.dataset.tip;tip.hidden=false;
const r=ch.getBoundingClientRect(),cr=c.getBoundingClientRect();let x=cr.left-r.left+cr.width/2-tip.offsetWidth/2;
x=Math.max(8,Math.min(x,r.width-tip.offsetWidth-8));tip.style.left=x+'px';tip.style.top='8px'});
c.addEventListener('mouseleave',()=>tip.hidden=true)})})
`

// Estado do servidor mostrado em todas as páginas: versão e saúde do HTTPS.
let app = { version: { hash: null, date: null, message: null, startedAt: null }, tz: 'America/Sao_Paulo', health: null, publicUrl: '' }
export function setAppInfo(info) {
  app = { ...app, ...info }
}
export function setHealth(health) {
  app.health = health
}
export const getHealth = () => app.health

function versionLabel() {
  const v = app.version
  if (!v.hash) return 'versão desconhecida'
  const d = new Date(v.date).toLocaleString('pt-BR', { timeZone: app.tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return `Atualizado ${d}<br>Versão ${v.hash}`
}

function healthAlert() {
  const h = app.health
  if (!h || h.ok) return ''
  const host = app.publicUrl.replace(/^https?:\/\//, '')
  return `<div class="alert"><div style="font-size:20px">⚠</div><div><b>O script não consegue carregar nas suas páginas.</b>
<p>O endereço <code>${esc(app.publicUrl)}</code> não abre com segurança: ${esc(h.reason)}. Enquanto isso, o navegador dos visitantes bloqueia o script e <b>nenhuma visita é registrada</b>.</p>
<p class="muted">Como resolver, no terminal da VPS: <code>certbot --nginx -d ${esc(host)} --redirect</code> (e confira se o Nginx tem o site do rastreador). Verificado ${ago(h.at)}; esta mensagem some sozinha quando estiver tudo certo.</p></div></div>`
}

const ICONS = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/></svg>',
  produtos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
}

function layout(title, active, body, extraJs = '') {
  const link = (href, key, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${ICONS[key]}${label}</a>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<div class="shell"><aside class="side">
<a class="logo" href="/"><span class="mk">T</span>Tracking</a>
<nav>${link('/', 'painel', 'Visão geral')}${link('/produtos', 'produtos', 'Produtos')}${link('/configuracoes', 'config', 'Configurações')}</nav>
<a class="ver" href="/configuracoes#versao" title="${esc(app.version.message || '')}">${versionLabel()}</a>
</aside>
<main class="content">${healthAlert()}${body}</main></div>
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

function niceMax(m) {
  if (!(m > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(m))
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= m) return f * p
  return 10 * p
}

// Gráfico de barras de uma série (comissão), com tooltip por coluna e tabela.
function chartHtml(series, currency) {
  const pts = series.points
  const max = niceMax(Math.max(0, ...pts.map((p) => p.comissao)))
  const label = (p) => {
    const [y, m, rest] = p.key.split('-')
    const [d, h] = rest.split(' ')
    return series.hourly ? `${d}/${m} ${h}h` : `${d}/${m}`
  }
  const cols = pts
    .map((p) => {
      const tip = `<b>${esc(label(p))}</b>Comissão: ${money(p.comissao, currency)}<br>Vendas: ${p.vendas}<br>Visitas: ${p.visitas}`
      const h = p.comissao > 0 ? Math.max(1.5, (p.comissao / max) * 100) : 0
      return `<div class="col" data-tip="${esc(tip)}"><div class="b" style="height:${h.toFixed(2)}%"></div></div>`
    })
    .join('')
  const grid = [1, 0.5, 0]
    .map((f) => `<div style="top:${(1 - f) * 100}%"><span>${money(max * f, currency).replace('.00', '')}</span></div>`)
    .join('')
  const every = series.hourly ? 4 : Math.max(1, Math.ceil(pts.length / 8))
  const xl = pts
    .map((p, i) =>
      i % every === 0
        ? `<span style="left:${((i + 0.5) / pts.length) * 100}%">${esc(series.hourly ? p.key.slice(-2) + 'h' : label(p))}</span>`
        : '',
    )
    .join('')
  const rows = pts.filter((p) => p.visitas || p.vendas)
  const tbl = table(
    [
      { label: series.hourly ? 'Hora' : 'Dia', html: (p) => esc(label(p)) },
      { label: 'Visitas', n: 1, html: (p) => p.visitas },
      { label: 'Vendas', n: 1, html: (p) => p.vendas },
      { label: 'Comissão', n: 1, html: (p) => money(p.comissao, currency) },
    ],
    rows,
    'Sem dados neste período.',
  )
  return `<div class="chart" data-chart><div class="plot"><div class="grid">${grid}</div><div class="bars">${cols}</div></div>
<div class="xl">${xl}</div><div class="tip" hidden></div></div>
<details class="tbl"><summary>Ver em tabela</summary>${tbl}</details>`
}

export const TABS = { campanhas: 'Campanhas', palavras: 'Palavras-chave', vendas: 'Vendas', visitas: 'Visitas' }

export function dashboardPage(d, { period, tz, currency, products, productId, series, tab }) {
  const t = d.totals
  const qs = (o = {}) => {
    const q = new URLSearchParams({ periodo: o.periodo ?? period })
    const prod = 'produto' in o ? o.produto : productId
    if (prod) q.set('produto', prod)
    const aba = o.aba ?? tab
    if (aba && aba !== 'campanhas') q.set('aba', aba)
    return '/?' + q.toString()
  }
  const periods = Object.entries(PERIODS)
    .map(([k, v]) => `<a href="${qs({ periodo: k })}" class="${k === period ? 'on' : ''}">${v}</a>`)
    .join('')
  const options = [`<option value="">Todos os produtos</option>`]
    .concat(products.map((p) => `<option value="${esc(p.id)}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)}</option>`))
    .join('')
  const current = products.find((p) => p.id === productId)
  const kpi = (label, value, note = '', cls = '') =>
    `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`
  const epc = t.visitas ? t.comissao / t.visitas : 0
  const ticket = t.vendas ? t.comissao / t.vendas : 0

  let tabBody
  if (tab === 'palavras') tabBody = breakdownTable(d.keywords, 'Palavra-chave', currency)
  else if (tab === 'vendas')
    tabBody = table(
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
                ? '<span class="tag ok">sim</span>'
                : '<span class="tag bad">sem gclid</span>',
        },
        { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
      ],
      d.recentSales,
      'Nenhuma venda neste período.',
    )
  else if (tab === 'visitas')
    tabBody = table(
      [
        { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) + (r.is_test ? ' <span class="tag warn">teste</span>' : '') },
        { label: 'Produto', html: (r) => esc(r.produto || '—') },
        { label: 'Campanha', html: (r) => esc(r.campanha) },
        { label: 'Palavra-chave', html: (r) => esc(r.palavra) },
        { label: 'Disp.', html: (r) => esc({ m: 'celular', c: 'computador', t: 'tablet' }[r.device] || r.device || '—') },
        { label: 'Google', html: (r) => (r.gclid ? '<span class="tag ok">gclid</span>' : r.gbraid || r.wbraid ? 'gbraid/wbraid' : '—') },
        { label: 'Clicou no botão', html: (r) => (r.outbound_at ? `<span class="ok">sim (${r.outbound_count}x)</span>` : '—') },
        { label: 'ID da visita', html: (r) => `<code class="muted">${esc(r.id)}</code>` },
      ],
      d.recentClicks,
      'Nenhuma visita neste período.',
    )
  else tabBody = breakdownTable(d.campaigns, 'Campanha', currency)

  const counts = { vendas: d.recentSales.length, visitas: d.recentClicks.length }
  const tabs = Object.entries(TABS)
    .map(
      ([k, v]) =>
        `<a href="${qs({ aba: k })}" class="${k === tab ? 'on' : ''}">${v}${counts[k] ? `<span class="count">${counts[k]}${counts[k] >= (k === 'vendas' ? 100 : 50) ? '+' : ''}</span>` : ''}</a>`,
    )
    .join('')

  const noProducts = products.length
    ? ''
    : `<div class="flash">Comece cadastrando seu primeiro produto em <a href="/produtos/novo">Produtos → Novo produto</a>.</div>`

  return layout(
    'Visão geral — Tracking',
    'painel',
    `${noProducts}
<div class="page-head"><div><h2 class="title">Visão geral</h2>
<p class="sub">${esc(PERIODS[period])} · ${current ? esc(current.name) : 'todos os produtos'}</p></div>
<div class="filters"><div class="seg">${periods}</div>
<form method="get" action="/"><input type="hidden" name="periodo" value="${esc(period)}">${tab !== 'campanhas' ? `<input type="hidden" name="aba" value="${esc(tab)}">` : ''}
<select name="produto" onchange="this.form.submit()" aria-label="Produto">${options}</select></form></div></div>

<div class="kpis">
${kpi('Comissão', money(t.comissao, currency), `${t.vendas} venda(s)`, 'hero')}
${kpi('Vendas', t.vendas, `conversão ${pct(t.vendas, t.visitas)}`)}
${kpi('Visitas', t.visitas, `${t.google} do Google Ads (gclid)`)}
${kpi('Cliques no botão', t.cliques, `${pct(t.cliques, t.visitas)} das visitas`)}
</div>
<div class="kpis minor">
${kpi('Ganho por visita (EPC)', money(epc, currency))}
${kpi('Comissão média', money(ticket, currency))}
${kpi('Conversão', pct(t.vendas, t.visitas))}
${kpi('Visitas com gclid', pct(t.google, t.visitas))}
${kpi('Reembolsos', t.reembolsos)}
</div>

<section><h3>Comissão por ${series.hourly ? 'hora' : 'dia'}<span class="right">${money(t.comissao, currency)} no período</span></h3>
${chartHtml(series, currency)}</section>

<section><nav class="tabs">${tabs}</nav>${tabBody}</section>`,
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
<p>Cole este código na página de review deste produto. Pode ser no cabeçalho, no rodapé ou antes do <code>&lt;/body&gt;</code>, mas tem que ser num campo de <b>código/HTML</b> (no WordPress: plugin WPCode ou widget HTML do Elementor; na Hostinger: Configurações do site → Código personalizado). Depois <b>publique</b> a página.</p>
${copy('script', script, 'Copiar script')}
<div class="actions">
${
  testUrl
    ? `<button type="button" class="primary" id="test-install" data-url="${esc(testUrl)}">Testar instalação</button>
<button type="button" id="verify">Verificar o código da página</button>`
    : `<a class="btn primary" href="/produtos/${esc(product.id)}/editar">Informe o endereço da página para testar</a>`
}
</div>
<div id="test-status"></div>
<div id="verify-result"></div>
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
const tb=document.getElementById('test-install');
if(tb)tb.addEventListener('click',()=>{window.open(tb.dataset.url,'_blank','noopener');
const out=document.getElementById('test-status'),t0=Date.now();let timer;
const tick=async()=>{const secs=Math.round((Date.now()-t0)/1000);
try{const r=await(await fetch('/produtos/'+pid+'/sinal')).json();
if(r.pingAt&&new Date(r.pingAt).getTime()>=t0-3000){clearInterval(timer);
out.innerHTML=r.links>0?'<span class="ok"><b>✓ Funcionou!</b> O script está rodando na página e marcou '+r.links+' link(s) da BuyGoods.</span>'
:'<span class="bad"><b>! O script está rodando, mas não achou nenhum link da BuyGoods.</b> Confira se o botão aponta para buygoods.com ou coloque data-rastrear no link de compra.</span>';return}
if(secs>=30){clearInterval(timer);out.innerHTML='<span class="bad"><b>✗ Nenhum sinal da página em 30 segundos.</b></span><br><span class="muted">Causas mais comuns, nesta ordem:</span><ol class="muted" style="margin:4px 0 0">'
+(r.https&&!r.https.ok?'<li class="bad"><b>HTTPS do rastreador com problema</b>: '+r.https.reason+'. Isso bloqueia o script em qualquer página. Resolva primeiro (veja o aviso no topo).</li>':'')
+'<li>A página não foi <b>publicada</b> depois de colar o código, ou o site está mostrando uma versão em <b>cache</b> (limpe o cache do WordPress/LiteSpeed/Cloudflare).</li>'
+'<li>O código foi colado num bloco de <b>texto</b> e não num campo de <b>código/HTML</b>. Clique em “Verificar o código da página” para conferir.</li>'
+'<li>O endereço cadastrado não é a página onde você colou o código (Editar → endereço da página).</li>'
+'<li>Um <b>bloqueador de anúncios</b> no seu navegador bloqueou o script. Teste numa aba anônima sem extensões.</li>'
+'<li>Se usa <b>cloaker</b>, você pode estar vendo a página segura, sem o script.</li></ol>';return}}catch(e){}
out.innerHTML='<span class="muted">Aguardando sinal da página… '+secs+'s (deixe a aba nova abrir e carregar)</span>'};
tick();timer=setInterval(tick,2000)});
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
