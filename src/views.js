// HTML do painel, renderizado no servidor.
import { PERIODS } from './stats.js'
import { PLATFORMS, DEFAULT_PARAM, trackingParam } from './products.js'

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
--series-1:#2a78d6;--ok:#15803d;--okbg:#ecfdf3;--warn:#a16207;--warnbg:#fefce8;--bad:#b91c1c;--badbg:#fef2f2}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0c0e12;--card:#15181e;--text:#eceef2;--text2:#c5c9d2;--muted:#9aa1ad;--line:#262a33;--soft:#1a1e25;--accent:#60a5fa;--accent-soft:#16233a;
--series-1:#3987e5;--ok:#4ade80;--okbg:#0f2a1b;--warn:#facc15;--warnbg:#2a250f;--bad:#f87171;--badbg:#2c1414}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}code{font-size:12.5px}
.top{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.top-in{max-width:1240px;margin:0 auto;padding:0 32px;display:flex;align-items:center;gap:28px}
.logo{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:700;font-size:16px;padding:14px 0}
.logo .mk{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800}
.mainnav{display:flex;gap:4px;align-self:stretch;overflow-x:auto}
.mainnav a{display:flex;align-items:center;gap:8px;color:var(--muted);text-decoration:none;padding:0 12px;font-weight:500;border-bottom:2px solid transparent;white-space:nowrap}
.mainnav a:hover{color:var(--text)}.mainnav a.on{color:var(--text);border-bottom-color:var(--accent)}
.mainnav svg{width:17px;height:17px;flex:none}
.ver{margin-left:auto;font-size:12px;color:var(--muted);text-decoration:none;text-align:right;line-height:1.35;white-space:nowrap}.ver:hover{color:var(--text)}
.content{padding:28px 32px 64px;max-width:1240px;margin:0 auto;width:100%}
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
.card-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.thumb{border-radius:10px;object-fit:cover;flex:none;background:var(--soft);border:1px solid var(--line)}
.thumb.ph,.pimg.ph{display:inline-flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:18px;border:1px solid var(--line)}
.prog{margin:4px 0}.prog-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:5px}.prog-top b{color:var(--text)}
.prog-bar{height:8px;border-radius:999px;background:var(--soft);border:1px solid var(--line);overflow:hidden}.prog-bar div{height:100%;border-radius:999px;background:var(--accent)}
.prog.ok .prog-bar div{background:var(--ok)}.prog.low .prog-bar div{background:var(--warn)}
.phead{display:flex;gap:18px;align-items:center;margin-bottom:18px;flex-wrap:wrap}
.phead-main{flex:1;min-width:220px}.phead-main .sub{margin:0}.crumbs{font-size:12.5px;color:var(--muted)}.crumbs a{color:var(--muted);text-decoration:none}
.phead-prog{width:260px}.phead-prog small{display:block;margin-top:4px;font-size:12px}
.imgbtn{position:relative;padding:0;border:0;background:none;border-radius:14px;overflow:hidden;cursor:pointer;flex:none}
.pimg{width:84px;height:84px;border-radius:14px;object-fit:cover;display:block;border:1px solid var(--line);background:var(--soft)}
.pimg.ph{font-size:30px}
.imgedit{position:absolute;inset:auto 0 0 0;background:rgba(0,0,0,.55);color:#fff;font-size:11.5px;padding:3px 0;text-align:center;opacity:0;transition:opacity .15s}
.imgbtn:hover .imgedit,.imgbtn:focus .imgedit{opacity:1}.imgbtn .pimg.ph+.imgedit{opacity:1;background:rgba(37,99,235,.85)}
.ptabs{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:18px;padding:0 8px}
.dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:var(--line);margin-left:4px;vertical-align:middle}
.dot.ok{width:auto;height:auto;background:none;color:var(--ok);font-size:12px}
.grid2{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:18px;align-items:start}
.mini-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mini-kpis span{display:block;font-size:12px;color:var(--muted)}.mini-kpis b{font-size:18px}
details.howto{border:1px solid var(--line);border-radius:10px;margin:8px 0;background:var(--soft)}details.howto summary{padding:10px 14px;cursor:pointer;font-weight:600}
details.howto>ol,details.howto>p,details.howto>table{margin:0 14px 12px}details.howto table td{white-space:normal;vertical-align:top;padding:6px 8px}
.imgrow{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.imgrow .actions{margin:0}.imgrow form{margin:0}
@media (max-width:900px){.grid2{grid-template-columns:1fr}.phead-prog{width:100%}}
@media (max-width:1100px){.kpis.minor{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:900px){.top-in{padding:0 16px;gap:12px;flex-wrap:wrap}.logo{padding:10px 0}.mainnav{order:3;width:100%;margin:0 -4px}.mainnav a{padding:10px 8px}.mainnav svg{display:none}
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
<header class="top"><div class="top-in">
<a class="logo" href="/"><span class="mk">T</span>Tracking</a>
<nav class="mainnav">${link('/', 'painel', 'Visão geral')}${link('/produtos', 'produtos', 'Produtos')}${link('/configuracoes', 'config', 'Configurações')}</nav>
<a class="ver" href="/configuracoes#versao" title="${esc(app.version.message || '')}">${versionLabel()}</a>
</div></header>
<main class="content">${healthAlert()}${body}</main>
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

function thumb(p, size = 44) {
  return p.image_at
    ? `<img class="thumb" src="/produtos/${esc(p.id)}/imagem?v=${encodeURIComponent(p.image_at)}" alt="" width="${size}" height="${size}">`
    : `<span class="thumb ph" style="width:${size}px;height:${size}px">${esc((p.name || '?').trim()[0]?.toUpperCase() || '?')}</span>`
}

function progressBar(pr) {
  const cls = pr.pct === 100 ? 'ok' : pr.pct >= 60 ? 'mid' : 'low'
  return `<div class="prog ${cls}"><div class="prog-top"><span>Configuração</span><b>${pr.pct}%</b></div>
<div class="prog-bar"><div style="width:${pr.pct}%"></div></div></div>`
}

export function productsPage(products, { currency, archivedCount, showArchived }) {
  const cards = products.length
    ? `<div class="cards">${products
        .map(
          (p) => `<a class="card" href="/produtos/${esc(p.id)}">
<div class="card-head">${thumb(p, 48)}<div><h4>${esc(p.name)}</h4><div class="muted">${esc(PLATFORMS[p.platform] || p.platform)}</div></div></div>
${progressBar(p.progress)}
<div class="stats"><span><b>${p.visitas}</b> visitas</span><span><b>${p.vendas}</b> vendas</span><span><b>${money(p.comissao, currency)}</b></span></div></a>`,
        )
        .join('')}</div>`
    : `<section><div class="empty">${showArchived ? 'Nenhum produto arquivado.' : 'Nenhum produto ainda. Clique em <b>+ Novo produto</b> para começar.'}</div></section>`

  const toggle = showArchived
    ? `<a href="/produtos">← Voltar para os produtos ativos</a>`
    : archivedCount
      ? `<a href="/produtos?arquivados=1">Ver arquivados (${archivedCount})</a>`
      : ''

  return layout(
    'Produtos — Tracking',
    'produtos',
    `<div class="page-head"><div><h2 class="title">${showArchived ? 'Produtos arquivados' : 'Produtos'}</h2>
<p class="sub">Cada produto tem seu script, sua conversão no Google Ads e sua planilha.</p></div>
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
<label><b>Endereço da página de review</b> <span class="muted">(usado no teste de instalação)</span>
<input type="url" name="review_url" value="${esc(v.review_url)}" placeholder="https://meusite.com/produto-review">${err('review_url')}</label>
<label><b>Link de afiliado da BuyGoods</b> <span class="muted">(o link do botão de compra)</span>
<input type="url" name="affiliate_url" value="${esc(v.affiliate_url)}" placeholder="https://siteDoProduto.com/dtc/?aff_id=123456">
<div class="hint">O link que a BuyGoods te dá costuma ir para o site do produtor (ex.: <code>getnervecalm.com/...?aff_id=...</code>). O script reconhece esse domínio e coloca o ID da visita no <code>subid</code>.</div>${err('affiliate_url')}</label>
<details class="howto"><summary>Avançado: parâmetro do ID da visita</summary>
<label style="display:block;margin:0 14px 12px"><input type="text" name="tracking_param" value="${esc(v.tracking_param || '')}" placeholder="${esc(DEFAULT_PARAM[v.platform] || 'subid')} (padrão)" maxlength="30">
<div class="hint">Nome do parâmetro do link de afiliado que leva o ID da visita. BuyGoods: <code>subid</code>. Em outras plataformas pode ser <code>tid</code>, <code>sck</code>, <code>cid</code>, <code>aff_sub</code>... Deixe vazio para usar o padrão.</div>${err('tracking_param')}</label></details>
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
        ? item('ok', '✓', 'Links de compra com rastreio', `${st.ping.links} link(s) de afiliado encontrados e marcados com o subid.`)
        : item(
            'bad',
            '!',
            'Nenhum link de compra encontrado na página',
            'O script está lá, mas não achou o link de afiliado. Sem isso as vendas não são ligadas ao anúncio. Cadastre o <b>link de afiliado</b> na aba Configurações ou coloque <code>data-rastrear</code> no link do botão.',
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

export const PRODUCT_TABS = {
  status: 'Status',
  script: '1. Script',
  buygoods: '2. BuyGoods',
  google: '3. Google Ads',
  config: 'Configurações',
}

const BUYGOODS = 'https://backoffice.buygoods.com'

export function productPage(product, st, { base, key, tz, currency, flash, tab, progress, totals, postbacks, image, errors, values }) {
  const pid = esc(product.id)
  const script = `<script src="${base}/t.js?p=${product.id}" async></script>`
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}&produto=${product.id}`
  const suffix = 'campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}'
  const testUrl = product.review_url
    ? product.review_url + (product.review_url.includes('?') ? '&' : '?') + 'rt_teste=1'
    : ''
  const flashHtml = flash ? `<div class="flash ${flash.bad ? 'bad' : ''}">${esc(flash.text)}</div>` : ''
  const tabDone = { script: progress.steps[0].done && progress.steps[1].done, buygoods: progress.steps[2].done, google: progress.steps[3].done }
  const platformName = PLATFORMS[product.platform] || 'Plataforma'
  const isBuyGoods = product.platform === 'buygoods'
  const param = trackingParam(product)
  const tabs = Object.entries({ ...PRODUCT_TABS, buygoods: `2. ${isBuyGoods ? 'BuyGoods' : 'Plataforma'}` })
    .map(
      ([k, v]) =>
        `<a href="/produtos/${pid}?aba=${k}" class="${k === tab ? 'on' : ''}">${v}${k in tabDone ? (tabDone[k] ? ' <span class="dot ok">✓</span>' : ' <span class="dot"></span>') : ''}</a>`,
    )
    .join('')
  const next = progress.steps.find((s) => !s.done)
  const nextTab = next && { script: 'script', links: 'script', postback: 'buygoods', planilha: 'google', google: 'google' }[next.key]

  const img = image
    ? `<img class="pimg" src="/produtos/${pid}/imagem?v=${encodeURIComponent(image.updated_at)}" alt="${esc(product.name)}">`
    : `<span class="pimg ph">${esc(product.name.trim()[0]?.toUpperCase() || '?')}</span>`

  let body = ''
  if (tab === 'status') {
    body = `<div class="grid2">
<section><h3>Status da configuração <span class="right">atualiza sozinho</span></h3><div id="checklist">${checklistHtml(product, st, { tz })}</div></section>
<div>
<section><h3>Próximo passo</h3><div class="box">${
      next
        ? `<p><b>${esc(next.label)}</b></p><p class="muted">Faltam ${progress.total - progress.done} de ${progress.total} etapas.</p><a class="btn primary" href="/produtos/${pid}?aba=${nextTab}">Ir para ${esc(PRODUCT_TABS[nextTab])}</a>`
        : '<p class="ok"><b>✓ Tudo configurado.</b></p><p class="muted">As vendas deste produto estão indo para o Google Ads.</p>'
    }</div></section>
<section><h3>Resultados (todo o período)</h3><div class="box mini-kpis">
<div><span>Visitas</span><b>${totals.visitas}</b></div><div><span>Vendas</span><b>${totals.vendas}</b></div><div><span>Comissão</span><b>${money(totals.comissao, currency)}</b></div>
</div><div class="box" style="padding-top:0"><a href="/?periodo=30d&produto=${pid}">Ver no painel →</a></div></section>
</div></div>`
  } else if (tab === 'script') {
    body = `<section><h3><span class="num">1</span> Copie o script</h3><div class="box">
${copy('script', script, 'Copiar script')}
<p class="muted">É uma linha só e você cola uma vez. Quando o rastreador é atualizado, a página passa a usar a versão nova sozinha.</p></div></section>

<section><h3><span class="num">2</span> Cole na página de review e publique</h3><div class="box">
<p>Pode ser no cabeçalho, no rodapé ou antes do <code>&lt;/body&gt;</code>, mas tem que ser num campo de <b>código/HTML</b>. Num bloco de texto comum o código não roda.</p>
<details class="howto"><summary>WordPress</summary><ol><li>Instale o plugin <a href="https://wordpress.org/plugins/insert-headers-and-footers/" target="_blank" rel="noopener">WPCode</a> (Plugins → Adicionar novo → “WPCode”).</li><li>Vá em <b>Code Snippets → Header &amp; Footer</b>, cole o script no campo <b>Footer</b> e salve.</li><li>Se usa cache (LiteSpeed, WP Rocket, Cloudflare), <b>limpe o cache</b>.</li></ol><p class="muted">No Elementor dá também para arrastar um widget <b>HTML</b> para a página e colar dentro dele.</p></details>
<details class="howto"><summary>Construtor de sites da Hostinger</summary><ol><li>No editor, abra <b>Configurações do site → Integrações</b> (ou “Código personalizado”).</li><li>Cole o script no campo de código e salve.</li><li>Clique em <b>Publicar</b>.</li></ol></details>
<details class="howto"><summary>Página em HTML (arquivo)</summary><ol><li>Abra o arquivo da página e cole o script logo antes de <code>&lt;/body&gt;</code>.</li><li>Suba o arquivo de novo.</li></ol></details>
<details class="howto"><summary>Lovable, Framer, outros</summary><p>Procure “custom code”, “código personalizado”, “head/body code” ou “embed HTML”. No Lovable, peça no chat: “adicione este script antes do &lt;/body&gt; em todas as páginas” e cole o script.</p></details>
</div></section>

<section><h3><span class="num">3</span> Teste</h3><div class="box">
${
  testUrl
    ? `<p>Clique em <b>Testar instalação</b>: sua página abre numa aba nova e, em poucos segundos, aparece aqui se funcionou.</p>
<div class="actions"><button type="button" class="primary" id="test-install" data-url="${esc(testUrl)}">Testar instalação</button>
<button type="button" id="verify">Verificar o código da página</button></div>`
    : `<p>Informe o endereço da página de review para poder testar.</p><a class="btn primary" href="/produtos/${pid}?aba=config">Informar endereço</a>`
}
<div id="test-status"></div><div id="verify-result"></div>
<p class="muted" style="margin-top:12px">O script reconhece sozinho o link de afiliado: o domínio do link cadastrado em Configurações${product.affiliate_url ? ` (<b>${esc(product.affiliate_url.replace(/^https?:\/\//, '').split('/')[0])}</b>)` : ''}, links com <code>aff_id=</code> (formato da BuyGoods) e links para buygoods. Ele coloca o ID da visita no parâmetro <code>${esc(param)}</code>${param === 'subid' ? '; se o link já tinha um subid fixo (ex.: <code>adsgoogle</code>), esse valor passa para o <code>subid2</code>' : ''}. Link encurtado: coloque <code>data-rastrear</code> nele.</p>
</div></section>`
  } else if (tab === 'buygoods' && !isBuyGoods) {
    const generic = `${base}/postback?key=${key}&subid=[ID DA VISITA]&order=[NÚMERO DO PEDIDO]&amount=[COMISSÃO]&type=[TIPO DO EVENTO]`
    body = `<div class="flash" style="background:var(--accent-soft);color:var(--text)">Para outra plataforma, o funcionamento é o mesmo: o script coloca o ID da visita no parâmetro <code>${esc(param)}</code> do link de afiliado, e a plataforma devolve esse ID no postback quando a venda acontece.</div>
<section><h3><span class="num">1</span> Confira o parâmetro do link</h3><div class="box">
<p>Descubra na documentação da plataforma qual parâmetro do link de afiliado é devolvido no postback (ex.: ClickBank usa <code>tid</code>; muitas redes usam <code>subid</code>, <code>sub1</code> ou <code>aff_sub</code>).</p>
<p>Hoje este produto usa <b><code>${esc(param)}</code></b>. Para trocar: aba <a href="/produtos/${pid}?aba=config">Configurações → Avançado</a>.</p></div></section>
<section><h3><span class="num">2</span> Monte o postback</h3><div class="box">
<p>Cadastre na plataforma a URL abaixo, trocando cada parte entre colchetes pela variável (macro) que a plataforma usa:</p>
${copy('postback', generic, 'Copiar modelo')}
<table><tbody>
<tr><td><code>[ID DA VISITA]</code></td><td>a variável que devolve o valor do parâmetro <code>${esc(param)}</code> (obrigatório)</td></tr>
<tr><td><code>[NÚMERO DO PEDIDO]</code></td><td>ID da transação/pedido (evita contar duas vezes)</td></tr>
<tr><td><code>[COMISSÃO]</code></td><td>valor da sua comissão (vai para o Google Ads)</td></tr>
<tr><td><code>[TIPO DO EVENTO]</code></td><td>venda, reembolso... (opcional; reembolsos saem da planilha)</td></tr></tbody></table>
<p class="muted" style="margin-top:10px">O rastreador também aceita os nomes <code>clickid</code>, <code>cid</code> ou <code>s1</code> no lugar de <code>subid</code>, e <code>commission</code>, <code>payout</code> ou <code>sum</code> no lugar de <code>amount</code>.</p></div></section>
<section><h3><span class="num">3</span> Confira o que está chegando</h3>
${table(
  [
    { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
    { label: 'Tipo', html: (r) => esc(r.type) },
    { label: 'Pedido', html: (r) => esc(r.order_id) },
    { label: 'Ligada a', html: (r) => (r.produto ? `<span class="tag ok">${esc(r.produto)}</span>` : r.visita ? '<span class="tag warn">visita sem produto</span>' : r.subid ? '<span class="tag warn">ID sem visita registrada</span>' : '<span class="tag bad">sem ID</span>') },
    { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
  ],
  postbacks,
  'Nenhum postback recebido ainda.',
)}</section>`
  } else if (tab === 'buygoods') {
    const pbRows = table(
      [
        { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
        { label: 'Tipo', html: (r) => esc(r.type) },
        { label: 'Pedido', html: (r) => esc(r.order_id) },
        { label: 'Produto BuyGoods', html: (r) => esc(r.codename || '—') },
        {
          label: 'Ligada a',
          html: (r) =>
            r.produto
              ? `<span class="tag ok">${esc(r.produto)}</span>`
              : r.visita
                ? '<span class="tag warn">visita sem produto (script antigo)</span>'
                : r.subid
                  ? '<span class="tag warn">subid sem visita registrada</span>'
                  : '<span class="tag bad">sem subid</span>',
        },
        { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
      ],
      postbacks,
      'Nenhum postback recebido ainda. Depois de cadastrar, a primeira venda aparece aqui.',
    )
    body = `<div class="flash" style="background:var(--accent-soft);color:var(--text)">A BuyGoods avisa o rastreador de cada venda pelo <b>postback</b>. Ele é configurado <b>uma vez só</b> e vale para todos os produtos. A venda cai no produto certo pela visita que gerou ela.</div>

<section><h3><span class="num">1</span> Entre no painel de afiliado da BuyGoods</h3><div class="box">
<p><a class="btn" href="${BUYGOODS}" target="_blank" rel="noopener">Abrir painel da BuyGoods ↗</a> <a class="btn" href="${BUYGOODS}/faq" target="_blank" rel="noopener">FAQ da BuyGoods ↗</a></p>
<p class="muted">Faça login com a sua conta de afiliado.</p></div></section>

<section><h3><span class="num">2</span> Cadastre o postback (uma vez, para todos os produtos)</h3><div class="box">
<ol><li>No painel, abra o menu da sua conta (canto superior direito) e entre em <b>Postback Pixels</b>. Em algumas contas o caminho é <b>Profile → Postback Pixels</b>.</li>
<li>Clique em <b>Add New</b>, cole a URL abaixo e salve.</li></ol>
${copy('postback', postback, 'Copiar postback')}
<p class="warn"><b>Não</b> cadastre o mesmo postback também dentro das configurações de uma oferta: a BuyGoods dispara duas vezes. O rastreador ignora pedido repetido, mas o certo é ter só o global.</p>
<details class="howto"><summary>O que cada parte da URL significa</summary><table><tbody>
<tr><td><code>{SUBID}</code></td><td>ID da visita que o script colocou no link. É assim que a venda é ligada ao anúncio.</td></tr>
<tr><td><code>{ORDERID}</code></td><td>Número do pedido (evita contar a mesma venda duas vezes).</td></tr>
<tr><td><code>{COMMISSION_AMOUNT}</code></td><td>Sua comissão. É o valor que vai para o Google Ads.</td></tr>
<tr><td><code>{CONV_TYPE}</code></td><td>Tipo do evento (venda, reembolso...). Reembolsos saem da planilha do Google.</td></tr>
<tr><td><code>{PRODUCT_CODENAME}</code></td><td>Código do produto na BuyGoods (só para conferência).</td></tr>
<tr><td><code>key=...</code></td><td>Sua chave secreta. Não compartilhe a URL.</td></tr></tbody></table></details>
</div></section>

<section><h3><span class="num">3</span> Pegue o link de afiliado e coloque no botão da página</h3><div class="box">
<ol><li>No painel da BuyGoods, encontre a oferta (Marketplace / Campaigns) e clique em <b>Promote</b>.</li>
<li>Copie o <b>link de afiliado</b> e coloque nos botões de compra da página de review.</li>
<li>Cole esse mesmo link no campo <b>Link de afiliado</b> da aba <a href="/produtos/${pid}?aba=config">Configurações</a>.</li>
<li><b>Não precisa</b> mexer no <code>subid</code>: o script coloca o ID da visita sozinho. O link da BuyGoods costuma ir direto para o site do produtor (ex.: <code>getnervecalm.com/dtc/?aff_id=...</code>); isso é normal e funciona.</li></ol>
<p class="muted">Evite encurtadores. Se precisar usar, coloque <code>data-rastrear</code> no link. Confira na aba <a href="/produtos/${pid}?aba=script">1. Script</a> se o teste encontra os links.</p>
</div></section>

<section><h3><span class="num">4</span> Confira o que está chegando</h3>
${pbRows}
<div class="box"><p class="muted">Quer testar sem esperar uma venda? Abra a página pelo <b>Testar instalação</b> (aba Script) e depois simule. A venda de teste não vai para o Google Ads nem entra nos totais.</p>
<form method="post" action="/produtos/${pid}/simular-venda" class="actions"><button type="submit">Simular venda de teste</button></form>
${st.lastSale && st.lastSale.status === 'test' ? `<p class="ok">✓ Venda de teste ligada a este produto ${ago(st.lastSale.created_at)}.</p>` : ''}</div></section>`
  } else if (tab === 'google') {
    body = `<section><h3><span class="num">1</span> Nome da conversão</h3><div class="box">
<form class="conv" method="post" action="/produtos/${pid}/conversao">
<div class="row"><input type="text" id="conv-input" name="conversion_name" value="${esc(product.conversion_name)}" required maxlength="100" aria-label="Nome da conversão">
<button type="submit">Salvar nome</button><button type="button" data-copy-input="conv-input">Copiar nome</button></div>
<div class="hint">As vendas deste produto vão para o Google Ads com este nome. Tem que ser <b>idêntico</b> ao nome da ação de conversão lá (maiúsculas, espaços e acentos contam).</div>
${st.lastRealSale ? `<div class="hint warn">Atenção: este produto já tem vendas. Se o Google Ads já importou vendas com o nome atual, trocar o nome faz ele importar de novo as vendas dos últimos dias na conversão nova (contagem em dobro). Troque só para corrigir um nome que ainda não existe no Google Ads.</div>` : ''}
</form></div></section>

<section><h3><span class="num">2</span> Crie a ação de conversão no Google Ads</h3><div class="box">
<p><a class="btn" href="https://ads.google.com/aw/conversions" target="_blank" rel="noopener">Abrir Conversões no Google Ads ↗</a></p>
<ol><li>Clique em <b>+ Nova ação de conversão → Importar → Conversões de cliques (arquivo/programação)</b>.</li>
<li>Nome: o nome do passo 1. Categoria: <b>Compra</b>. Valor: <b>“Usar valores diferentes para cada conversão”</b>. Contagem: <b>Todas</b>.</li></ol>
<p class="muted"><a href="https://support.google.com/google-ads/answer/7014069" target="_blank" rel="noopener">Ajuda do Google: importar conversões de cliques ↗</a></p></div></section>

<section><h3><span class="num">3</span> Programe a planilha</h3><div class="box">
<ol><li>Em <b>Conversões → Uploads → Programações → +</b>, escolha a fonte <b>HTTPS</b>.</li>
<li>Cole o link abaixo e escolha <b>a cada 6 horas</b>.</li></ol>
${copy('csv', csv, 'Copiar link')}
<p class="muted">A planilha deste produto tem ${st.salesForGoogle} venda(s) com gclid. ${st.csvFetch ? `<span class="ok">Lida pelo Google ${ago(st.csvFetch.at)}.</span>` : 'Ainda não foi lida pelo Google.'} <a href="/google-ads.csv?key=${esc(key)}&produto=${pid}" target="_blank">Ver a planilha</a></p></div></section>

<section><h3><span class="num">4</span> Configure a conta (uma vez por conta)</h3><div class="box">
<p><a class="btn" href="https://ads.google.com/aw/accountsettings" target="_blank" rel="noopener">Abrir Configurações da conta ↗</a></p>
<ol><li>Deixe a <b>codificação automática</b> ativada (é ela que coloca o gclid na URL). <a href="https://support.google.com/google-ads/answer/3095550" target="_blank" rel="noopener">Ajuda ↗</a></li>
<li>Em <b>Rastreamento → Sufixo do URL final</b>, cole:</li></ol>
${copy('suffix', suffix)}</div></section>`
  } else {
    const v = values || product
    const err = (k) => (errors?.[k] ? `<div class="err">${esc(errors[k])}</div>` : '')
    const platformOptions = Object.entries(PLATFORMS)
      .map(([k, label]) => `<option value="${k}" ${v.platform === k ? 'selected' : ''}>${label}</option>`)
      .join('')
    body = `<section><h3>Dados do produto</h3><form class="form" method="post" action="/produtos/${pid}">
<label><b>Nome do produto</b><input type="text" name="name" value="${esc(v.name)}" required maxlength="100">${err('name')}</label>
<label><b>Plataforma</b><select name="platform">${platformOptions}</select>${err('platform')}</label>
<label><b>Nome da conversão no Google Ads</b><input type="text" name="conversion_name" value="${esc(v.conversion_name)}" required maxlength="100">${err('conversion_name')}</label>
<label><b>Endereço da página de review</b><input type="url" name="review_url" value="${esc(v.review_url)}" placeholder="https://meusite.com/produto-review">${err('review_url')}</label>
<label><b>Link de afiliado da BuyGoods</b><input type="url" name="affiliate_url" value="${esc(v.affiliate_url)}" placeholder="https://siteDoProduto.com/dtc/?aff_id=123456">
<div class="hint">O link do botão de compra. O script reconhece o domínio dele e coloca o ID da visita no <code>${esc(trackingParam(product))}</code>.</div>${err('affiliate_url')}</label>
<details class="howto"><summary>Avançado: parâmetro do ID da visita</summary>
<label style="display:block;margin:0 14px 12px"><input type="text" name="tracking_param" value="${esc(v.tracking_param || '')}" placeholder="${esc(DEFAULT_PARAM[v.platform] || 'subid')} (padrão)" maxlength="30">
<div class="hint">Nome do parâmetro do link de afiliado que leva o ID da visita. BuyGoods: <code>subid</code>. Em outras plataformas pode ser <code>tid</code>, <code>sck</code>, <code>cid</code>, <code>aff_sub</code>... Deixe vazio para usar o padrão.</div>${err('tracking_param')}</label></details>
<div class="actions"><button class="primary" type="submit">Salvar alterações</button></div></form></section>

<section><h3>Imagem do produto</h3><div class="box">
<div class="imgrow">${img}<div><p class="muted">PNG, JPG ou WEBP. A imagem é reduzida automaticamente.</p>
<div class="actions"><button type="button" class="primary" data-pick-image>${image ? 'Trocar imagem' : 'Enviar imagem'}</button>
${image ? `<form method="post" action="/produtos/${pid}/imagem/remover" data-confirm="Remover a imagem?"><button type="submit" class="danger">Remover</button></form>` : ''}</div></div></div></div></section>

<section><h3>Arquivar</h3><div class="box">
<p class="muted">Arquivar esconde o produto da lista. Visitas e vendas continuam guardadas e o script continua funcionando.</p>
<form method="post" action="/produtos/${pid}/${product.archived ? 'reativar' : 'arquivar'}" ${product.archived ? '' : 'data-confirm="Arquivar este produto?"'}>
<button type="submit" class="${product.archived ? '' : 'danger'}">${product.archived ? 'Reativar produto' : 'Arquivar produto'}</button></form>
</div></section>`
  }

  return layout(
    `${product.name} — Tracking`,
    'produtos',
    `${flashHtml}<div class="phead">
<button type="button" class="imgbtn" data-pick-image title="${image ? 'Trocar imagem' : 'Adicionar imagem'}">${img}<span class="imgedit">${image ? 'Trocar' : '+ Imagem'}</span></button>
<div class="phead-main"><div class="crumbs"><a href="/produtos">Produtos</a> /</div><h2 class="title">${esc(product.name)}${product.archived ? ' <span class="tag warn">arquivado</span>' : ''}</h2>
<p class="sub">${esc(PLATFORMS[product.platform] || product.platform)} · conversão <b>${esc(product.conversion_name)}</b></p></div>
<div class="phead-prog">${progressBar(progress)}<small class="muted">${progress.done} de ${progress.total} etapas</small></div></div>
<input type="file" id="image-file" accept="image/png,image/jpeg,image/webp" hidden>
<nav class="tabs ptabs">${tabs}</nav>
${body}`,
    `
const pid=${JSON.stringify(product.id)};
const cl=document.getElementById('checklist');
if(cl)setInterval(async()=>{try{const r=await fetch('/produtos/'+pid+'/checklist');if(r.ok)cl.innerHTML=await r.text()}catch(e){}},4000);
const fileIn=document.getElementById('image-file');
document.querySelectorAll('[data-pick-image]').forEach(b=>b.addEventListener('click',()=>fileIn.click()));
fileIn.addEventListener('change',async()=>{const f=fileIn.files[0];if(!f)return;
if(!/^image\\/(png|jpeg|webp)$/.test(f.type)){alert('Use uma imagem PNG, JPG ou WEBP.');return}
try{const bmp=await createImageBitmap(f);const s=Math.min(1,600/Math.max(bmp.width,bmp.height));
const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);
c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);let data=c.toDataURL('image/webp',0.85);
if(!data.startsWith('data:image/webp'))data=c.toDataURL('image/jpeg',0.85);
const r=await fetch('/produtos/'+pid+'/imagem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data})});
const j=await r.json();if(!r.ok)throw new Error(j.error||'erro');location.reload()}catch(e){alert('Não consegui enviar a imagem: '+e.message)}});
const tb=document.getElementById('test-install');
if(tb)tb.addEventListener('click',()=>{window.open(tb.dataset.url,'_blank','noopener');
const out=document.getElementById('test-status'),t0=Date.now();let timer;
const tick=async()=>{const secs=Math.round((Date.now()-t0)/1000);
try{const r=await(await fetch('/produtos/'+pid+'/sinal')).json();
if(r.pingAt&&new Date(r.pingAt).getTime()>=t0-3000){clearInterval(timer);
out.innerHTML=r.links>0?'<span class="ok"><b>✓ Funcionou!</b> O script está rodando na página e marcou '+r.links+' link(s) de afiliado.</span>'
:'<span class="bad"><b>! O script está rodando, mas não achou o link de afiliado.</b> Cadastre o link de afiliado na aba Configurações ou coloque data-rastrear no link de compra.</span>';return}
if(secs>=30){clearInterval(timer);out.innerHTML='<span class="bad"><b>✗ Nenhum sinal da página em 30 segundos.</b></span><br><span class="muted">Causas mais comuns, nesta ordem:</span><ol class="muted" style="margin:4px 0 0">'
+(r.https&&!r.https.ok?'<li class="bad"><b>HTTPS do rastreador com problema</b>: '+r.https.reason+'. Isso bloqueia o script em qualquer página. Resolva primeiro (veja o aviso no topo).</li>':'')
+'<li>A página não foi <b>publicada</b> depois de colar o código, ou o site está mostrando uma versão em <b>cache</b> (limpe o cache do WordPress/LiteSpeed/Cloudflare).</li>'
+'<li>O código foi colado num bloco de <b>texto</b> e não num campo de <b>código/HTML</b>. Clique em “Verificar o código da página” para conferir.</li>'
+'<li>O endereço cadastrado não é a página onde você colou o código (aba Configurações).</li>'
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
