// HTML do painel, renderizado no servidor.
import { PERIODS, TRAFFIC } from './stats.js'
import { PLATFORMS, DEFAULT_PARAM, trackingParam, productPages } from './products.js'
import { SOURCES, uaInfo, referrerHost } from './source.js'

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
:root{color-scheme:light;--bg:#eef1f5;--card:#fff;--text:#0f172a;--text2:#334155;--muted:#64748b;--line:#e2e8f0;--soft:#f6f8fb;--accent:#2563eb;--accent-soft:#e8effd;
--top:#0b1220;--top-text:#94a3b8;--series-1:#2a78d6;--ok:#15803d;--okbg:#e9f8ef;--warn:#a16207;--warnbg:#fdf6e3;--bad:#b91c1c;--badbg:#fdecec;
--o-pago:#2a78d6;--o-organico:#1baf7a;--o-referencia:#6250d6;--o-direto:#94a3b8;--o-sem:#eb6834;--o-teste:#eda100;--shadow:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04)}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0a0d13;--card:#121721;--text:#e8ecf3;--text2:#c3cad6;--muted:#8a94a6;--line:#232a36;--soft:#171d28;--accent:#5b9cf5;--accent-soft:#15233a;
--top:#06080d;--top-text:#8a94a6;--series-1:#3987e5;--ok:#4ade80;--okbg:#0f2a1b;--warn:#facc15;--warnbg:#2a250f;--bad:#f87171;--badbg:#2c1414;
--o-pago:#3987e5;--o-organico:#199e70;--o-referencia:#9085e9;--o-direto:#6b7280;--o-sem:#d95926;--o-teste:#c98500;--shadow:none}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--text);font:13.5px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}code{font-size:12px}
.top{background:var(--top);position:sticky;top:0;z-index:5}
.top-in{max-width:1280px;margin:0 auto;padding:0 28px;display:flex;align-items:center;gap:26px}
.logo{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 0}
.logo .mk{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}
.mainnav{display:flex;gap:2px;align-self:stretch;overflow-x:auto}
.mainnav a{display:flex;align-items:center;gap:7px;color:var(--top-text);text-decoration:none;padding:0 12px;font-weight:500;border-bottom:2px solid transparent;white-space:nowrap}
.mainnav a:hover{color:#fff}.mainnav a.on{color:#fff;border-bottom-color:#3b82f6}
.mainnav svg{width:16px;height:16px;flex:none}
.logout{background:transparent;border-color:rgba(255,255,255,.18);color:var(--top-text);padding:5px 11px;font-size:12px}.logout:hover{color:#fff;border-color:rgba(255,255,255,.4)}
.ver{margin-left:auto;font-size:11.5px;color:var(--top-text);text-decoration:none;text-align:right;line-height:1.35;white-space:nowrap}.ver:hover{color:#fff}
.content{padding:22px 28px 56px;max-width:1280px;margin:0 auto;width:100%}
h2.title{font-size:20px;letter-spacing:-.01em;margin:0}.sub{color:var(--muted);margin:2px 0 0}
.page-head{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between;margin-bottom:16px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:inline-flex;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:3px;flex-wrap:wrap;box-shadow:var(--shadow)}
.seg a{padding:5px 11px;border-radius:6px;color:var(--text2);text-decoration:none;font-weight:500;font-size:12.5px}.seg a.on{background:var(--top);color:#fff}
select,input[type=text],input[type=url]{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);width:100%}
.filters select{width:auto;min-width:180px;box-shadow:var(--shadow)}
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}
.kpis.minor{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:16px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.kpi span{color:var(--muted);font-size:12px;font-weight:500}.kpi b{display:block;font-size:24px;letter-spacing:-.02em;margin-top:2px;font-variant-numeric:tabular-nums}
.kpi small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
.kpis.minor .kpi{padding:10px 14px}.kpis.minor .kpi b{font-size:17px}
.kpi.hero{border-color:transparent;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff}.kpi.hero span,.kpi.hero small{color:rgba(255,255,255,.78)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;overflow:hidden;box-shadow:var(--shadow)}
section>h3{font-size:14px;margin:0;padding:11px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;background:var(--soft)}
section>h3 .right{margin-left:auto;font-weight:500;color:var(--muted);font-size:12.5px}
.num{display:inline-flex;width:22px;height:22px;border-radius:999px;background:var(--top);color:#fff;font-size:12px;align-items:center;justify-content:center;flex:none}
.tabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid var(--line);overflow-x:auto}
.tabs a{padding:11px 10px;color:var(--muted);text-decoration:none;font-weight:500;border-bottom:2px solid transparent;white-space:nowrap}
.tabs a.on{color:var(--text);border-bottom-color:var(--accent)}.tabs .count{font-size:11.5px;background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:0 6px;margin-left:4px}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:8px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;background:var(--soft)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr:last-child td{border-bottom:0}tbody tr:hover td{background:var(--soft)}
td .sub2{display:block;color:var(--muted);font-size:11.5px}
.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600;border:1px solid var(--line)}
.tag.ok{background:var(--okbg);border-color:transparent;color:var(--ok)}.tag.bad{background:var(--badbg);border-color:transparent;color:var(--bad)}.tag.warn{background:var(--warnbg);border-color:transparent;color:var(--warn)}
.otag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--text2)}.otag i{width:8px;height:8px;border-radius:999px;display:inline-block;background:var(--o-direto)}
.otag.pago i,.otag.pago_outro i{background:var(--o-pago)}.otag.organico i{background:var(--o-organico)}.otag.referencia i{background:var(--o-referencia)}.otag.sem_clique i{background:var(--o-sem)}.otag.teste i{background:var(--o-teste)}
.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}.muted{color:var(--muted)}
.empty{padding:26px 16px;color:var(--muted);text-align:center}
.box{padding:14px 16px}.box p{margin:0 0 8px}.box ol{margin:0 0 10px;padding-left:20px}.box li{margin-bottom:7px}
.code{display:flex;gap:8px;align-items:flex-start;margin:6px 0 12px}
.code pre{flex:1;min-width:0;margin:0;padding:9px 11px;background:var(--soft);border:1px solid var(--line);border-radius:8px;white-space:pre-wrap;word-break:break-all;font-size:12px}
button,.btn{font:inherit;font-weight:500;display:inline-block;padding:7px 13px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none;white-space:nowrap}
button:hover,.btn:hover{border-color:var(--muted)}
.btn.primary,button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.danger,button.danger{color:var(--bad)}button.danger.solid{background:var(--bad);border-color:var(--bad);color:#fff}
button.mini,.btn.mini{padding:2px 9px;font-size:11.5px}td form{margin:0;display:inline}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}
.check{list-style:none;margin:0;padding:0}.check li{display:flex;gap:12px;padding:11px 16px;border-bottom:1px solid var(--line)}.check li:last-child{border-bottom:0}
.check .ic{flex:none;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
.check .s-ok .ic{background:var(--okbg);color:var(--ok)}.check .s-wait .ic{background:var(--soft);color:var(--muted);border:1px solid var(--line)}.check .s-bad .ic{background:var(--badbg);color:var(--bad)}.check .s-warn .ic{background:var(--warnbg);color:var(--warn)}
.check li>div>b{display:block}.check li>div>span{display:block;margin-top:2px}.check span{color:var(--muted);font-size:12.5px;word-break:break-word}
.form{padding:16px;display:grid;gap:14px;max-width:680px}.form label b{display:block;margin-bottom:4px}.form .hint{color:var(--muted);font-size:12px;margin-top:4px}.form .err{color:var(--bad);font-size:12px;margin-top:4px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:var(--text);display:block;box-shadow:var(--shadow)}
.card:hover{border-color:var(--accent)}.card h4{margin:0 0 2px;font-size:14.5px}.card .stats{display:flex;gap:16px;margin-top:10px;font-size:12.5px;color:var(--muted)}.card .stats b{color:var(--text)}
.flash{padding:10px 14px;border-radius:10px;margin-bottom:14px;background:var(--okbg);color:var(--ok);border:1px solid var(--line)}
.flash.bad{background:var(--badbg);color:var(--bad)}.flash.info{background:var(--accent-soft);color:var(--text)}
.alert{display:flex;gap:12px;padding:12px 16px;border-radius:12px;margin-bottom:16px;background:var(--badbg);border:1px solid var(--bad);color:var(--text)}
.alert b{color:var(--bad)}.alert p{margin:2px 0 0}.alert code{background:var(--card);padding:1px 6px;border-radius:5px}
.conv{margin-bottom:12px}.conv .row{display:flex;gap:8px;margin-top:4px}.conv .row input{flex:1;min-width:0}.conv .hint{color:var(--muted);font-size:12px;margin-top:6px}
#verify-result,#test-status{margin-top:6px;line-height:1.7}
.chart{position:relative;padding:16px 16px 8px}
.chart .plot{position:relative;height:190px;margin-left:56px}
.chart .grid div{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
.chart .grid span{position:absolute;right:calc(100% + 8px);transform:translateY(-50%);font-size:11px;color:var(--muted);white-space:nowrap}
.chart .bars{position:absolute;inset:0;display:flex;align-items:flex-end}
.chart .col{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;padding:0 1px;cursor:default}
.chart .col:hover{background:var(--soft)}
.chart .b{width:100%;max-width:30px;background:var(--series-1);border-radius:4px 4px 0 0;min-height:0}
.chart .xl{position:relative;height:22px;margin-left:56px}.chart .xl span{position:absolute;transform:translateX(-50%);font-size:11px;color:var(--muted);top:6px;white-space:nowrap}
.chart .tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.12);white-space:nowrap;z-index:2}
.chart .tip b{display:block;margin-bottom:2px}
details.tbl{border-top:1px solid var(--line)}details.tbl summary{padding:9px 16px;color:var(--muted);cursor:pointer;font-size:12.5px}
.split{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px;align-items:start}
.bars-h{padding:10px 16px 14px}.bars-h .row{display:grid;grid-template-columns:130px 1fr 70px 90px;gap:10px;align-items:center;padding:5px 0;font-size:12.5px}
.bars-h .track{height:8px;background:var(--soft);border-radius:999px;overflow:hidden;border:1px solid var(--line)}.bars-h .track div{height:100%;border-radius:999px;background:var(--o-direto)}
.bars-h .row.pago .track div,.bars-h .row.pago_outro .track div{background:var(--o-pago)}.bars-h .row.organico .track div{background:var(--o-organico)}.bars-h .row.referencia .track div{background:var(--o-referencia)}.bars-h .row.sem_clique .track div{background:var(--o-sem)}
.bars-h .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--text2)}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line)}
.livebadge{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ok);font-weight:600}.livebadge i{width:8px;height:8px;border-radius:999px;background:var(--ok);animation:pulse 1.4s ease-in-out infinite}
.steps{counter-reset:st;list-style:none;margin:0;padding:0}.steps>li{position:relative;padding:12px 16px 12px 52px;border-bottom:1px solid var(--line);margin:0}.steps>li:last-child{border-bottom:0}
.steps>li::before{counter-increment:st;content:counter(st);position:absolute;left:16px;top:12px;width:22px;height:22px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}
.steps>li>b:first-child{display:block;margin-bottom:2px}.steps .where{display:inline-block;background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:1px 7px;font-size:12px;margin:2px 0}
.danger-zone{border-color:var(--bad)}.danger-zone>h3{color:var(--bad);background:var(--badbg)}
.card-head{display:flex;gap:12px;align-items:center;margin-bottom:10px}
.thumb{border-radius:10px;object-fit:cover;flex:none;background:var(--soft);border:1px solid var(--line)}
.thumb.ph,.pimg.ph{display:inline-flex;align-items:center;justify-content:center;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:18px;border:1px solid var(--line)}
.prog{margin:4px 0}.prog-top{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:5px}.prog-top b{color:var(--text)}
.prog-bar{height:7px;border-radius:999px;background:var(--soft);border:1px solid var(--line);overflow:hidden}.prog-bar div{height:100%;border-radius:999px;background:var(--accent)}
.prog.ok .prog-bar div{background:var(--ok)}.prog.low .prog-bar div{background:var(--warn)}
.phead{display:flex;gap:16px;align-items:center;margin-bottom:14px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:var(--shadow)}
.phead-main{flex:1;min-width:220px}.crumbs{font-size:12px;color:var(--muted)}.crumbs a{color:var(--muted);text-decoration:none}
.phead-prog{width:250px}.phead-prog small{display:block;margin-top:4px;font-size:11.5px}
.imgbtn{position:relative;padding:0;border:0;background:none;border-radius:12px;overflow:hidden;cursor:pointer;flex:none}
.pimg{width:72px;height:72px;border-radius:12px;object-fit:cover;display:block;border:1px solid var(--line);background:var(--soft)}
.pimg.ph{font-size:26px}
.imgedit{position:absolute;inset:auto 0 0 0;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 0;text-align:center;opacity:0;transition:opacity .15s}
.imgbtn:hover .imgedit,.imgbtn:focus .imgedit{opacity:1}.imgbtn .pimg.ph+.imgedit{opacity:1;background:rgba(37,99,235,.85)}
.ptabs{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;padding:0 8px;box-shadow:var(--shadow)}
.dot{display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--line);margin-left:4px;vertical-align:middle}
.dot.ok{width:auto;height:auto;background:none;color:var(--ok);font-size:12px}
.grid2{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px;align-items:start}
.mini-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.mini-kpis span{display:block;font-size:11.5px;color:var(--muted)}.mini-kpis b{font-size:17px}
details.howto{border:1px solid var(--line);border-radius:9px;margin:6px 0;background:var(--soft)}details.howto summary{padding:9px 13px;cursor:pointer;font-weight:600}
details.howto>ol,details.howto>p,details.howto>table{margin:0 13px 11px}details.howto table td{white-space:normal;vertical-align:top;padding:5px 8px}
.imgrow{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.imgrow .actions{margin:0}.imgrow form{margin:0}
.live{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px dashed var(--line);border-radius:10px;background:var(--soft);margin:8px 0 12px}
.live b{display:block}.live span{color:var(--muted);font-size:12.5px;display:block}.live .params{margin-top:6px;word-break:break-all}.live .params code{background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 5px;margin:2px 4px 2px 0;display:inline-block}
.live.fresh{border:1px solid var(--ok);background:var(--okbg)}.live.fresh b{color:var(--ok)}
.live .ic{flex:none;width:24px;height:24px;border-radius:999px;background:var(--ok);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700}
.pulse{flex:none;width:11px;height:11px;margin:5px 7px;border-radius:999px;background:var(--accent);animation:pulse 1.4s ease-in-out infinite;display:block}
@keyframes pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.pulse,.livebadge i{animation:none}}
@media (max-width:1100px){.kpis.minor{grid-template-columns:repeat(3,minmax(0,1fr))}.split{grid-template-columns:1fr}}
@media (max-width:900px){.top-in{padding:0 16px;gap:12px;flex-wrap:wrap}.logo{padding:10px 0}.mainnav{order:3;width:100%;margin:0 -4px}.mainnav a{padding:10px 8px}.mainnav svg{display:none}
.content{padding:16px 14px 48px}.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpis.minor{grid-template-columns:repeat(2,minmax(0,1fr))}.filters{width:100%}.filters form,.filters select{width:100%}
.grid2{grid-template-columns:1fr}.phead-prog{width:100%}.bars-h .row{grid-template-columns:100px 1fr 50px 80px}}
@media (max-width:600px){.conv .row{flex-wrap:wrap}.conv .row input{flex-basis:100%}.code{flex-direction:column}.code button{align-self:flex-end}.kpi b{font-size:20px}.chart .plot,.chart .xl{margin-left:44px}}
`

const SCRIPT = `
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy-input]');if(!b)return;
navigator.clipboard.writeText(document.getElementById(b.dataset.copyInput).value.trim());const t=b.textContent;b.textContent='Copiado ✓';setTimeout(()=>b.textContent=t,1400)})
document.addEventListener('submit',e=>{const m=e.target.dataset.confirm;if(m&&!confirm(m))e.preventDefault()
const n=e.target.dataset.confirmName;if(n!==undefined){const t=prompt('Para excluir, digite o nome do produto: '+n);if(t===null||t.trim()!==n.trim()){e.preventDefault();if(t!==null)alert('Nome diferente. Nada foi excluído.')}}})
const pbl=document.getElementById('pb-live');
if(pbl){const t0=Date.now(),esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const ago=s=>s<60?'há '+s+'s':s<3600?'há '+Math.round(s/60)+' min':'há '+Math.round(s/3600)+' h';
const draw=async()=>{try{const ev=await(await fetch('/postbacks/ultimo')).json();
if(!ev){pbl.className='live';pbl.innerHTML='<span class="pulse"></span><div><b>Aguardando postback…</b><span>Clique em <b>Test</b> no postback da BuyGoods. O aviso aparece aqui em segundos.</span></div>';return}
const at=new Date(ev.at).getTime(),fresh=at>=t0-2000,secs=Math.max(0,Math.round((Date.now()-at)/1000));
const label={teste:'Teste da plataforma recebido',venda:'Venda recebida',reembolso:'Reembolso recebido'}[ev.kind]||'Postback recebido';
const pairs=Object.entries(ev.params||{}).map(([k,v])=>'<code>'+esc(k)+'='+esc(v)+'</code>').join(' ');
pbl.className='live '+(fresh?'fresh':'old');
pbl.innerHTML=(fresh?'<div class="ic">✓</div>':'<span class="pulse"></span>')+'<div><b>'+(fresh?label+'!':'Aguardando postback…')+'</b><span>'+(fresh?'Chegou '+ago(secs)+'. O postback está funcionando.':'Último recebido: '+label.toLowerCase()+' '+ago(secs)+'. Clique em <b>Test</b> na BuyGoods para conferir agora.')+(ev.duplicate?' (pedido repetido, ignorado nos números)':'')+'</span>'+(pairs?'<span class="params">'+pairs+'</span>':'')+'</div>'}catch(e){}};
draw();setInterval(draw,3000)}
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
  visitantes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5.5-5-6.5"/></svg>',
  vendas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  produtos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  diagnostico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
}

function layout(title, active, body, extraJs = '') {
  const link = (href, key, label) => `<a href="${href}" class="${active === key ? 'on' : ''}">${ICONS[key]}${label}</a>`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header class="top"><div class="top-in">
<a class="logo" href="/"><span class="mk">T</span>Tracking</a>
<nav class="mainnav">${link('/', 'painel', 'Visão geral')}${link('/visitantes', 'visitantes', 'Visitantes')}${link('/vendas', 'vendas', 'Vendas')}${link('/produtos', 'produtos', 'Produtos')}${link('/diagnostico', 'diagnostico', 'Diagnóstico')}${link('/configuracoes', 'config', 'Configurações')}</nav>
<a class="ver" href="/configuracoes#versao" title="${esc(app.version.message || '')}">${versionLabel()}</a>
<form method="post" action="/sair" style="margin:0"><button type="submit" class="logout">Sair</button></form>
</div></header>
<main class="content">${healthAlert()}${body}</main>
<script>${SCRIPT}${extraJs}</script>
</body></html>`
}

// Botão de copiar em destaque, com o código escondido (para textos longos).
const copyHidden = (id, text, label) =>
  `<div class="actions"><button type="button" class="primary" data-copy="${id}">${label}</button></div>
<details class="howto"><summary>Ver o código</summary><pre id="${id}" style="margin:0 13px 11px;white-space:pre-wrap;word-break:break-all;font-size:12px">${esc(text)}</pre></details>`

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

// Seletor Todos / Pago / Não pago. `href(valor)` monta o link mantendo os outros filtros.
function trafficSeg(traffic, href) {
  const opts = [['todos', 'Todos'], ['pago', 'Pago'], ['nao_pago', 'Não pago']]
  return `<div class="seg" title="Fica lembrado até você mudar">${opts
    .map(([k, v]) => `<a href="${href(k)}" class="${(traffic || 'todos') === k ? 'on' : ''}">${v}</a>`)
    .join('')}</div>`
}

const trafficNote = (traffic) =>
  traffic === 'pago'
    ? 'só tráfego pago'
    : traffic === 'nao_pago'
      ? 'só tráfego não pago (orgânico, direto, referência)'
      : 'todo o tráfego'

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

export const TABS = { campanhas: 'Campanhas', palavras: 'Palavras-chave' }

export function dashboardPage(d, { period, tz, currency, products, productId, series, tab, origins, traffic }) {
  const t = d.totals
  const qs = (o = {}) => {
    const q = new URLSearchParams({ periodo: o.periodo ?? period })
    const prod = 'produto' in o ? o.produto : productId
    if (prod) q.set('produto', prod)
    const aba = o.aba ?? tab
    if (aba && aba !== 'campanhas') q.set('aba', aba)
    if (o.trafego) q.set('trafego', o.trafego)
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
  else tabBody = breakdownTable(d.campaigns, 'Campanha', currency)

  const counts = {}
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
<p class="sub">${esc(PERIODS[period])} · ${current ? esc(current.name) : 'todos os produtos'} · ${trafficNote(traffic)}</p></div>
<div class="filters">${trafficSeg(traffic, (k) => qs({ trafego: k }))}<div class="seg">${periods}</div>
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

<div class="split">
<section><h3>Comissão por ${series.hourly ? 'hora' : 'dia'}<span class="right">${money(t.comissao, currency)} no período</span></h3>
${chartHtml(series, currency)}</section>
<section><h3>De onde vêm as visitas<span class="right"><a href="/visitantes?periodo=${esc(period)}${productId ? `&produto=${esc(productId)}` : ''}">Ver visitantes →</a></span></h3>
${originBars(origins, currency)}</section>
</div>

<section><nav class="tabs">${tabs}<a href="/vendas?periodo=${esc(period)}${productId ? `&produto=${esc(productId)}` : ''}" style="margin-left:auto">Ver vendas →</a></nav>${tabBody}</section>`,
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

export function productsPage(products, { currency, archivedCount, showArchived, flash }) {
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
    `${flash ? `<div class="flash">${esc(flash)}</div>` : ''}<div class="page-head"><div><h2 class="title">${showArchived ? 'Produtos arquivados' : 'Produtos'}</h2>
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
<label><b>Outras páginas</b> <span class="muted">(opcional: outros domínios/páginas onde vai o mesmo script, uma por linha)</span>
<textarea name="extra_urls" rows="3" style="font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);width:100%" placeholder="https://outrodominio.com/lista-top5">${esc(v.extra_urls || '')}</textarea>${err('extra_urls')}</label>
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
    items.push(item('ok', '✓', 'Venda recebida', `Última venda deste produto ${ago(st.lastRealSale.created_at)}.`))
  } else if (st.anyPostback) {
    items.push(
      item('ok', '✓', 'Postback da conta funcionando', `Último ${ago(st.anyPostback.created_at)}. Ainda não houve venda deste produto.`),
    )
  } else {
    items.push(item('wait', '4', 'Postback da conta', 'Nenhum postback recebido ainda. Configure uma vez em <a href="/configuracoes#postback-conta">Configurações → Postback da conta</a>.'))
  }

  items.push(
    st.scriptReport?.erro
      ? item('bad', '!', 'Google Ads: último envio com erro', `${ago(st.scriptReport.at)}: ${esc(st.scriptReport.erro)}`)
      : st.csvFetch
      ? item('ok', '✓', 'Google Ads lendo a planilha', `Última leitura ${ago(st.csvFetch.at)} (${esc(when(st.csvFetch.at, tz))}).`)
      : item('wait', '5', 'Google Ads lendo a planilha', 'Ainda não houve leitura. Cole o script do Google Ads (aba 3. Google Ads).'),
  )

  return `<ul class="check">${items.join('')}</ul>`
}

const LIVE = '<div class="live" id="pb-live"><span class="pulse"></span><div><b>Carregando…</b></div></div>'

// Excluir um postback (ex.: teste que chegou com cara de venda).
const markTest = (r) =>
  `<form method="post" action="/vendas/${r.id}/excluir" data-confirm="Excluir este registro? Ele sai dos números e da planilha do Google Ads. Não tem volta."><button type="submit" class="mini danger">Excluir</button></form>`

const where = (t) => `<span class="where">${t}</span>`

// Passo a passo da ação de conversão no Google Ads atual (menus em português).
function conversionSteps(name) {
  return `<ol>
<li>No Google Ads: ${where('Metas → Conversões → Criar ação de conversão')}.</li>
<li>Marque <b>só “Conversões off-line”</b>. A opção <b>“Conversões de chamadas telefônicas” vem marcada: desmarque</b>.</li>
<li>Clique em ${where('Editar fontes de dados')} → <b>“Pular esta etapa e configurar uma fonte de dados mais tarde”</b>.</li>
<li>Marque a declaração <b>“Dados do cliente”</b> → <b>Concluído</b> → <b>Salvar e continuar</b>.</li>
<li>Escolha a categoria <b>Compra</b> e clique em <b>Editar configurações</b>:
<ul><li><b>Nome:</b> ${name ? `<b>${esc(name)}</b>, ` : ''}exatamente igual ao do rastreador;</li>
<li><b>Valor:</b> “Usar valores diferentes para cada conversão” e <b>troque a moeda para Dólar americano (USD)</b>, que vem como Real (BRL);</li>
<li>o resto pode ficar no padrão. Salve.</li></ul></li>
</ol>
<p class="muted"><b>Conta dentro de uma MCC?</b> Na MCC, em ${where('Metas → Conversões → Configurações → Acompanhamento de conversões entre contas')}, a coluna <b>“Conta de conversão”</b> da subconta tem que estar <b>“Cliente”</b>. Senão a conversão e o script ficam presos na MCC, e não na conta de anúncios.</p>`
}

// Resultado do último envio do script do Google Ads.
function scriptReportHtml(rep, { conversionName = null, csvFetch = null, tz } = {}) {
  if (!rep) {
    return csvFetch
      ? '<div class="live old"><span class="pulse"></span><div><b>Sem relatório de envio.</b><span>O script leu a planilha, mas é a versão antiga, que não conta o resultado. Copie o script de novo e cole por cima no Google Ads.</span></div></div>'
      : ''
  }
  const conta = rep.conta ? ` · conta ${esc(rep.conta.nome || '')}${rep.conta.id ? ` (${esc(rep.conta.id)})` : ''}` : ''
  if (rep.erro) {
    return `<div class="live" style="border:1px solid var(--bad);background:var(--badbg)"><div class="ic" style="background:var(--bad)">!</div><div><b class="bad">Último envio com erro</b>
<span>${ago(rep.at)} (${esc(when(rep.at, tz))})${conta}</span><span class="params"><code>${esc(rep.erro)}</code></span></div></div>`
  }
  const deste = conversionName != null ? ` · deste produto: <b>${rep.porConversao?.[conversionName] || 0}</b>` : ''
  return `<div class="live fresh"><div class="ic">✓</div><div><b>Último envio: ${rep.enviadas} venda(s), sem erro</b>
<span>${ago(rep.at)} (${esc(when(rep.at, tz))})${deste}${conta}</span>
<span>O Google processa o envio depois: se ele recusar alguma linha (ex.: nome de conversão diferente), o motivo aparece em ${where('Ferramentas → Ações em massa → Uploads')}.</span></div></div>`
}

// Passo a passo do script no Google Ads.
function scriptSteps() {
  return `<ol>
<li>Na <b>conta de anúncios</b> (não na MCC): ${where('Ferramentas → Ações em massa → Scripts → +')}.</li>
<li>Apague o que vier escrito e cole o script (botão abaixo).</li>
<li>Clique em <b>Autorizar</b> e aprove com a sua conta Google. <b>Esse clique tem que ser seu</b> (o Google não aceita automação nessa tela). Se a janela não abrir, é o <b>bloqueador de pop-up</b>: libere pop-ups para <code>ads.google.com</code> e clique de novo. Se você executar sem autorizar, aparece <i>“Falha devido a erros de autenticação”</i>.</li>
<li>Clique em <b>Executar</b> (não em “Visualizar”) e depois em <b>Salvar</b>.</li>
<li>Na lista de scripts, na coluna <b>Frequência</b>, escolha <b>Por hora</b>.</li>
</ol>`
}

export const PRODUCT_TABS = {
  status: 'Status',
  script: '1. Script',
  buygoods: '2. Venda',
  google: '3. Google Ads',
  config: 'Configurações',
}

const BUYGOODS = 'https://backoffice.buygoods.com'

export function productPage(product, st, { base, key, tz, currency, flash, tab, progress, totals, postbacks, image, errors, values, adsScript = '', pings = [] }) {
  const pid = esc(product.id)
  const script = `<script src="${base}/t.js?p=${product.id}" async></script>`
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}&produto=${product.id}`
  const suffix = 'campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}'
  const pages = productPages(product)
  const flashHtml = flash ? `<div class="flash ${flash.bad ? 'bad' : ''}">${esc(flash.text)}</div>` : ''
  const tabDone = { script: progress.steps[0].done && progress.steps[1].done, buygoods: progress.steps[2].done, google: progress.steps[3].done }
  const platformName = PLATFORMS[product.platform] || 'Plataforma'
  const isBuyGoods = product.platform === 'buygoods'
  const param = trackingParam(product)
  const tabs = Object.entries(PRODUCT_TABS)
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
  pages.length
    ? `<p>Clique em <b>Testar instalação</b>: a página abre numa aba nova e, em poucos segundos, aparece aqui se funcionou.${pages.length > 1 ? ' Teste cada página/domínio onde você colou o script.' : ''}</p>
${pages.length > 1 ? `<label style="display:block;max-width:640px;margin-bottom:8px"><b>Página para testar</b><select id="test-page">${pages.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}</select></label>` : `<input type="hidden" id="test-page" value="${esc(pages[0])}">`}
<div class="actions"><button type="button" class="primary" id="test-install">Testar instalação</button>
<button type="button" id="verify">Verificar o código da página</button></div>`
    : `<p>Informe o endereço da página de review para poder testar.</p><a class="btn primary" href="/produtos/${pid}?aba=config">Informar endereço</a>`
}
<div id="test-status"></div><div id="verify-result"></div>
${
  pings.length
    ? `<h4 style="margin:16px 0 6px">Páginas onde o script já deu sinal</h4>${table(
        [
          { label: 'Página', html: (r) => `<a href="${esc(r.page)}" target="_blank" rel="noopener">${esc(r.page.replace(/^https?:\/\//, ''))}</a>` },
          { label: 'Último sinal', html: (r) => `${ago(r.last_at)}<span class="sub2">${esc(when(r.last_at, tz))}</span>` },
          {
            label: 'Links de afiliado',
            html: (r) => {
              if (r.links > 0) return `<span class="tag ok">${r.links}</span>`
              const cands = (() => {
                try {
                  return JSON.parse(r.candidates || '[]')
                } catch {
                  return []
                }
              })()
              return `<span class="tag bad">0 — nenhum link reconhecido como de afiliado</span>${
                cands.length
                  ? `<div class="sub2" style="white-space:normal;margin-top:4px">Links externos que o script viu nessa página. Qual é o do botão de compra?</div>${cands
                      .map(
                        (c) => `<form method="post" action="/produtos/${pid}/afiliado" style="display:flex;gap:6px;align-items:center;margin-top:4px">
<input type="hidden" name="url" value="${esc(c)}"><code style="white-space:normal;word-break:break-all">${esc(c.length > 90 ? c.slice(0, 90) + '…' : c)}</code>
<button type="submit" class="mini">Usar como link de afiliado</button></form>`,
                      )
                      .join('')}`
                  : '<div class="sub2" style="white-space:normal">O script não viu nenhum link externo. Se o botão abre a oferta por JavaScript, coloque <code>data-rastrear</code> nele com o link em <code>data-href</code>.</div>'
              }`
            },
          },
        ],
        pings,
        '',
      )}`
    : ''
}
<p class="muted" style="margin-top:12px">O script reconhece sozinho o link de afiliado: o domínio do link cadastrado em Configurações${product.affiliate_url ? ` (<b>${esc(product.affiliate_url.replace(/^https?:\/\//, '').split('/')[0])}</b>)` : ''}, links com <code>aff_id=</code> (formato da BuyGoods) e links para buygoods. Ele coloca o ID da visita no parâmetro <code>${esc(param)}</code>${param === 'subid' ? '; se o link já tinha um subid fixo (ex.: <code>adsgoogle</code>), esse valor passa para o <code>subid2</code>' : ''}. Link encurtado: coloque <code>data-rastrear</code> nele.</p>
</div></section>`
  } else if (tab === 'buygoods') {
    const pb = st.anyPostback
    body = `<section><h3>Postback da conta <span class="right">um só para todos os produtos</span></h3><div class="box">
${
  pb
    ? `<p class="ok"><b>✓ Funcionando.</b> Último postback ${ago(pb.created_at)}.</p><p class="muted">O postback é configurado uma vez na conta da ${esc(platformName)} e vale para todos os produtos: a venda cai neste produto pela visita que gerou ela. Não precisa cadastrar nada por produto.</p>`
    : `<p class="bad"><b>Ainda não chegou nenhum postback.</b></p><p class="muted">O postback é configurado uma vez, na conta, e vale para todos os produtos.</p>`
}
<a class="btn ${pb ? '' : 'primary'}" href="/configuracoes#postback-conta">${pb ? 'Ver o postback da conta' : 'Configurar o postback da conta'}</a>
</div></section>

<section><h3>Link de afiliado deste produto</h3><div class="box">
${
  isBuyGoods
    ? `<ol><li>No painel da BuyGoods, encontre a oferta (Marketplace / Campaigns) e clique em <b>Promote</b>. <a href="${BUYGOODS}" target="_blank" rel="noopener">Abrir BuyGoods ↗</a></li>
<li>Copie o <b>link de afiliado</b> e coloque nos botões de compra das páginas deste produto.</li>
<li>Cole o mesmo link em <a href="/produtos/${pid}?aba=config">Configurações → Link de afiliado</a>, para o script reconhecer o botão.</li></ol>`
    : `<p>Use o link de afiliado da plataforma nos botões de compra e cadastre o mesmo link em <a href="/produtos/${pid}?aba=config">Configurações</a>. O ID da visita vai no parâmetro <code>${esc(param)}</code>: a plataforma tem que devolver esse valor no postback (no lugar de <code>[ID DA VISITA]</code>).</p>`
}
<p>${product.affiliate_url ? `Cadastrado: <code>${esc(product.affiliate_url)}</code>` : '<span class="warn">Nenhum link de afiliado cadastrado.</span>'}</p>
<p class="muted">Não precisa mexer no <code>${esc(param)}</code>: o script coloca o ID da visita sozinho. Se o link já tem um subid fixo (ex.: <code>adsgoogle</code>), ele vai para o <code>subid2</code>. Confira na aba <a href="/produtos/${pid}?aba=script">1. Script</a> se os botões foram reconhecidos.</p>
</div></section>

<section><h3>Vendas que chegaram deste produto</h3>
${table(
  [
    { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
    { label: 'Tipo', html: (r) => esc(r.type) },
    { label: 'Pedido', html: (r) => esc(r.order_id) },
    { label: 'Status', html: saleStatus },
    { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
    { label: '', html: markTest },
  ],
  postbacks,
  'Nenhuma venda deste produto ainda.',
)}
<div class="box"><p class="muted">Testar sem esperar uma venda: abra a página pelo <b>Testar instalação</b> (aba Script) e depois simule. A venda de teste não vai para o Google Ads nem entra nos totais.</p>
<form method="post" action="/produtos/${pid}/simular-venda" class="actions"><button type="submit">Simular venda de teste</button></form>
${st.lastSale && st.lastSale.status === 'test' ? `<p class="ok">✓ Venda de teste ligada a este produto ${ago(st.lastSale.created_at)}.</p>` : ''}</div></section>`
  } else if (tab === 'google') {
    body = `<div class="flash info">No Google Ads você faz só 2 coisas: <b>criar a conversão</b> deste produto e <b>colar o script</b> (uma vez por conta). A plataforma coloca cada venda na planilha e o script envia para o Google de hora em hora.</div>

<section><h3>1. Crie a conversão deste produto</h3><div class="box">
<form class="conv" method="post" action="/produtos/${pid}/conversao">
<label for="conv-input"><b>Nome da conversão</b></label>
<div class="row"><input type="text" id="conv-input" name="conversion_name" value="${esc(product.conversion_name)}" required maxlength="100">
<button type="submit">Salvar nome</button><button type="button" class="primary" data-copy-input="conv-input">Copiar nome</button></div>
${st.lastRealSale ? `<div class="hint warn">Este produto já tem vendas: trocar o nome depois que o Google já importou faz contar em dobro. Troque só para corrigir.</div>` : ''}
</form>
${conversionSteps(product.conversion_name)}
<a class="btn" href="https://ads.google.com/aw/conversions" target="_blank" rel="noopener">Abrir Conversões no Google Ads ↗</a>
</div></section>

<section><h3>2. Cole o script no Google Ads <span class="right">uma vez por conta, vale para todos os produtos</span></h3><div class="box">
${scriptSteps()}
${copyHidden('ads-script', adsScript, 'Copiar script')}
<p>${st.csvFetch ? `<span class="ok">✓ O Google Ads leu a planilha ${ago(st.csvFetch.at)}.</span>` : '<span class="warn">O script ainda não leu a planilha.</span> <span class="muted">Depois de colar, clique em Executar e recarregue esta página.</span>'}
<span class="muted">· ${st.salesForGoogle} venda(s) deste produto com gclid.</span></p>
${scriptReportHtml(st.scriptReport, { conversionName: product.conversion_name, csvFetch: st.csvFetch, tz })}
</div></section>

<details class="howto"><summary>Dicas opcionais (não precisa para funcionar)</summary>
<ol>
<li><b>Ver campanha e palavra-chave no rastreador:</b> ${where('Admin → Configurações da conta → Rastreamento → Sufixo do URL final')} e cole:
${copy('suffix', suffix)}</li>
<li><b>Campanha otimizar só por este produto:</b> ${where('Campanha → Configurações → Metas → Usar metas específicas da campanha')} e marque só <b>${esc(product.conversion_name)}</b>.</li>
<li><b>URL final do anúncio:</b> a própria página de review${product.review_url ? ` (<code>${esc(product.review_url)}</code>)` : ''}, sem encurtador ou redirecionamento.</li>
<li><b>gclid:</b> a codificação automática vem ligada por padrão. Se nenhuma visita aparecer como “Pago (Google Ads)”, confira em ${where('Admin → Configurações da conta → Codificação automática')}.</li>
</ol></details>`
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
<label><b>Outras páginas</b> <span class="muted">(outros domínios/páginas onde vai o mesmo script, uma por linha; servem para testar)</span>
<textarea name="extra_urls" rows="3" style="font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);width:100%" placeholder="https://outrodominio.com/lista-top5">${esc(v.extra_urls || '')}</textarea>${err('extra_urls')}</label>
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
<p class="muted">Esconde o produto da lista. Visitas e vendas continuam guardadas e o script continua funcionando.</p>
<form method="post" action="/produtos/${pid}/${product.archived ? 'reativar' : 'arquivar'}" ${product.archived ? '' : 'data-confirm="Arquivar este produto?"'}>
<button type="submit">${product.archived ? 'Reativar produto' : 'Arquivar produto'}</button></form>
</div></section>

<section class="danger-zone"><h3>Excluir produto</h3><div class="box">
<p>Apaga o produto, a imagem, <b>todas as visitas dele e as vendas ligadas a essas visitas</b>. O script dele para de registrar. <b>Não tem volta.</b></p>
<form method="post" action="/produtos/${pid}/excluir" data-confirm-name="${esc(product.name)}">
<button type="submit" class="danger solid">Excluir produto</button></form>
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
if(tb)tb.addEventListener('click',()=>{const page=document.getElementById('test-page').value;
window.open(page+(page.includes('?')?'&':'?')+'rt_teste=1','_blank','noopener');
const out=document.getElementById('test-status'),t0=Date.now();let timer;
const tick=async()=>{const secs=Math.round((Date.now()-t0)/1000);
try{const r=await(await fetch('/produtos/'+pid+'/sinal?pagina='+encodeURIComponent(page))).json();
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
try{const tp=document.getElementById('test-page');const r=await(await fetch('/produtos/'+pid+'/verificar'+(tp?'?pagina='+encodeURIComponent(tp.value):''))).json();out.innerHTML=r.html}catch(e){out.textContent='Não consegui verificar agora.'}});
`,
  )
}

// ---------------------------------------------------------------- Configurações

export function settingsPage({ base, key, conversionName, currency, days, lastPostback, csvFetch, scriptReport, tz, flash, adsScript = '', postbacks = [] }) {
  const postback = `${base}/postback?key=${key}&subid={SUBID}&order={ORDERID}&amount={COMMISSION_AMOUNT}&type={CONV_TYPE}&product={PRODUCT_CODENAME}`
  const csv = `${base}/google-ads.csv?key=${key}`
  return layout(
    'Configurações — Tracking',
    'config',
    `${flash ? `<div class="flash ${flash.bad ? 'bad' : ''}">${esc(flash.text)}</div>` : ''}<h2 class="title">Configurações gerais</h2>
<p class="sub">O que vale para todos os produtos. A configuração de cada produto fica na página dele.</p>

<section id="postback-conta"><h3>Postback da conta <span class="right">um só para todos os produtos</span></h3><div class="box">
<p>A plataforma avisa o rastreador de cada venda pelo postback. Ele é configurado <b>uma vez, na conta</b>, e vale para todos os produtos que você promove nela: a venda cai no produto certo pela visita que gerou ela.</p>
<p>${lastPostback ? `<span class="ok">✓ Funcionando: último postback ${ago(lastPostback.created_at)} (${esc(when(lastPostback.created_at, tz))}).</span>` : '<span class="warn">Nenhum postback recebido ainda.</span>'}</p>
<h4 style="margin:14px 0 6px">BuyGoods</h4>
<ol><li>Entre no painel de afiliado: <a href="https://backoffice.buygoods.com" target="_blank" rel="noopener">BuyGoods ↗</a> (<a href="https://backoffice.buygoods.com/faq" target="_blank" rel="noopener">FAQ</a>).</li>
<li>Menu da conta (canto superior direito) → <b>Postback Pixels</b> (em algumas contas: <b>Profile → Postback Pixels</b>) → <b>Add New</b>.</li>
<li>Cole a URL abaixo e salve.</li>
<li>Clique em <b>Test</b> nesse postback. O aviso aparece aqui embaixo.</li></ol>
${copy('postback', postback, 'Copiar postback')}
${LIVE}
<p class="warn">Cadastre só o postback da conta. Não repita dentro das configurações de cada oferta: a BuyGoods dispararia duas vezes.</p>
<details class="howto"><summary>O que cada parte da URL significa</summary><table><tbody>
<tr><td><code>{SUBID}</code></td><td>ID da visita que o script colocou no link. É assim que a venda é ligada ao anúncio e ao produto.</td></tr>
<tr><td><code>{ORDERID}</code></td><td>Número do pedido (evita contar a mesma venda duas vezes).</td></tr>
<tr><td><code>{COMMISSION_AMOUNT}</code></td><td>Sua comissão. É o valor que vai para o Google Ads.</td></tr>
<tr><td><code>{CONV_TYPE}</code></td><td>Tipo do evento (venda, reembolso...). Reembolsos saem da planilha do Google.</td></tr>
<tr><td><code>{PRODUCT_CODENAME}</code></td><td>Código do produto na BuyGoods (só para conferência).</td></tr>
<tr><td><code>key=...</code></td><td>Sua chave secreta. Não compartilhe a URL.</td></tr></tbody></table></details>
<details class="howto"><summary>Outra plataforma (ClickBank, Digistore24...)</summary>
<p>Cadastre, uma vez na conta da plataforma, a URL abaixo, trocando cada parte entre colchetes pela variável (macro) da plataforma:</p>
${copy('postback-generic', `${base}/postback?key=${key}&subid=[ID DA VISITA]&order=[NÚMERO DO PEDIDO]&amount=[COMISSÃO]&type=[TIPO DO EVENTO]`, 'Copiar modelo')}
<p class="muted">[ID DA VISITA] é a variável que devolve o parâmetro em que o script põe o ID (configurado em cada produto em Configurações → Avançado; ex.: ClickBank usa <code>tid</code>). Também são aceitos <code>clickid</code>, <code>cid</code> ou <code>s1</code> no lugar de <code>subid</code>, e <code>commission</code>, <code>payout</code> ou <code>sum</code> no lugar de <code>amount</code>.</p></details>
</div>
${table(
  [
    { label: 'Quando', html: (r) => esc(when(r.created_at, tz)) },
    { label: 'Tipo', html: (r) => esc(r.type) },
    { label: 'Pedido', html: (r) => esc(r.order_id) },
    { label: 'Produto (plataforma)', html: (r) => esc(r.codename || '—') },
    { label: 'Ligada a', html: (r) => (r.produto ? `<span class="tag ok">${esc(r.produto)}</span>` : r.visita ? '<span class="tag warn">visita sem produto</span>' : r.subid ? '<span class="tag warn">ID sem visita registrada</span>' : '<span class="tag bad">sem ID</span>') },
    { label: 'Status', html: saleStatus },
    { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
    { label: '', html: markTest },
  ],
  postbacks,
  'Nenhum postback recebido ainda.',
)}
</section>

<section><h3>Google Ads — script (um por conta)</h3><div class="box">
<p>Um script por conta de anúncios envia as vendas de todos os produtos, cada uma com o nome de conversão do seu produto.</p>
${scriptSteps()}
${copyHidden('ads-script', adsScript, 'Copiar script')}
<p>${csvFetch ? `<span class="ok">✓ Lida pela última vez ${ago(csvFetch.at)}.</span>` : '<span class="muted">Ainda não foi lida pelo Google Ads.</span>'} <span class="muted">Vendas aprovadas com gclid, em ${esc(currency)}. O Google ignora vendas que já importou.</span></p>
${scriptReportHtml(scriptReport, { csvFetch, tz })}
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

// ---------------------------------------------------------------- Origem

const ORIGIN_LABELS = { ...SOURCES, sem_clique: 'Sem clique' }
export const ORIGIN_FILTERS = ORIGIN_LABELS
const originTag = (k) => `<span class="otag ${esc(k)}"><i></i>${esc(ORIGIN_LABELS[k] || k || '—')}</span>`

function originBars(rows, currency) {
  if (!rows.length) return '<div class="empty">Nada neste período.</div>'
  const max = Math.max(1, ...rows.map((r) => r.visitas))
  return `<div class="bars-h"><div class="row muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.03em"><span>Origem</span><span>Visitas</span><span class="n">Vendas</span><span class="n">Comissão</span></div>${rows
    .map(
      (r) => `<div class="row ${esc(r.origem)}"><span>${originTag(r.origem)}</span>
<span style="display:flex;gap:8px;align-items:center"><span class="track" style="flex:1"><div style="width:${((r.visitas / max) * 100).toFixed(1)}%"></div></span><span class="n" style="min-width:34px">${r.visitas}</span></span>
<span class="n">${r.vendas}</span><span class="n">${money(r.comissao, currency)}</span></div>`,
    )
    .join('')}</div>`
}

function filterBar({ base, period, products, productId, extra = '', hidden = {}, traffic = null }) {
  const q = (o) => {
    const p = new URLSearchParams({ periodo: period, ...hidden, ...o })
    if (productId && !('produto' in o)) p.set('produto', productId)
    for (const [k, v] of [...p]) if (!v) p.delete(k)
    return `${base}?${p}`
  }
  const periods = Object.entries(PERIODS)
    .map(([k, v]) => `<a href="${q({ periodo: k })}" class="${k === period ? 'on' : ''}">${v}</a>`)
    .join('')
  const options = [`<option value="">Todos os produtos</option>`]
    .concat(products.map((p) => `<option value="${esc(p.id)}" ${p.id === productId ? 'selected' : ''}>${esc(p.name)}</option>`))
    .join('')
  const hiddenInputs = Object.entries({ periodo: period, ...hidden })
    .filter(([, v]) => v)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('')
  return `<div class="filters">${trafficSeg(traffic, (k) => q({ trafego: k }))}<div class="seg">${periods}</div>
<form method="get" action="${base}" style="display:flex;gap:8px;flex-wrap:wrap">${hiddenInputs}
<select name="produto" onchange="this.form.submit()" aria-label="Produto">${options}</select>${extra}</form></div>`
}

// ---------------------------------------------------------------- Visitantes

export function visitorsPage(rows, { period, tz, currency, products, productId, source, traffic, live }) {
  const srcOptions = [`<option value="">Todas as origens</option>`]
    .concat(Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${k === source ? 'selected' : ''}>${v}</option>`))
    .join('')
  const body = table(
    [
      { label: 'Quando', html: (r) => `${esc(when(r.created_at, tz))}<span class="sub2">${ago(r.created_at)}</span>` },
      { label: 'Origem', html: (r) => originTag(r.source || 'direto') + (r.source === 'referencia' || r.source === 'organico' ? `<span class="sub2">${esc(referrerHost(r))}</span>` : '') },
      { label: 'IP', html: (r) => `<code>${esc(r.ip || '—')}</code>` },
      { label: 'Produto', html: (r) => esc(r.produto || '—') },
      { label: 'Campanha / palavra-chave', html: (r) => (r.source === 'pago' ? `${esc(r.campanha)}<span class="sub2">${esc(r.palavra)}</span>` : '<span class="muted">—</span>') },
      {
        label: 'Aparelho',
        html: (r) => {
          const u = uaInfo(r.user_agent)
          return `${esc(u.device)}${u.bot ? ' <span class="tag warn">robô</span>' : ''}<span class="sub2">${esc([u.os, u.browser].filter(Boolean).join(' · '))}</span>`
        },
      },
      { label: 'Clicou p/ comprar', html: (r) => (r.outbound_at ? `<span class="tag ok">sim${r.outbound_count > 1 ? ` · ${r.outbound_count}x` : ''}</span>` : '<span class="muted">não</span>') },
      { label: 'Comprou', html: (r) => (r.compras ? `<span class="tag ok">✓ ${money(r.valor, currency)}</span>` : '<span class="muted">—</span>') },
    ],
    rows,
    'Nenhuma visita neste período.',
  )
  return layout(
    'Visitantes — Tracking',
    'visitantes',
    `<div class="page-head"><div><h2 class="title">Visitantes</h2><p class="sub">Quem chegou nas suas páginas de review, de onde veio e o que fez.</p></div>
${filterBar({
  base: '/visitantes',
  period,
  products,
  productId,
  hidden: { origem: source || '', ao_vivo: live ? '1' : '' },
  traffic,
  extra: `<select name="origem" onchange="this.form.submit()" aria-label="Origem">${srcOptions}</select>`,
})}</div>
<section><div class="toolbar"><b>${rows.length}${rows.length >= 200 ? '+' : ''} visita(s)</b>
<span class="muted">· mais recentes primeiro · ${trafficNote(traffic)}</span>
<label style="margin-left:auto;display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="live" ${live ? 'checked' : ''}> Ao vivo ${live ? '<span class="livebadge"><i></i>atualizando</span>' : ''}</label></div>
${body}</section>`,
    `const lv=document.getElementById('live');lv.addEventListener('change',()=>{const u=new URL(location.href);
if(lv.checked)u.searchParams.set('ao_vivo','1');else u.searchParams.delete('ao_vivo');location.href=u});
if(lv.checked)setTimeout(()=>location.reload(),10000);`,
  )
}

// ---------------------------------------------------------------- Vendas

export function salesPage(rows, { period, tz, currency, products, productId, origin, traffic, tests }) {
  const real = rows.filter((r) => r.status === 'approved')
  const total = real.reduce((s, r) => s + r.amount, 0)
  const semClique = real.filter((r) => r.origem === 'sem_clique').length
  const pagas = real.filter((r) => r.origem === 'pago').length
  const refunds = rows.filter((r) => r.status === 'refund').length
  const orgOptions = [`<option value="">Todas as origens</option>`]
    .concat(Object.entries(ORIGIN_LABELS).filter(([k]) => k !== 'teste').map(([k, v]) => `<option value="${k}" ${k === origin ? 'selected' : ''}>${v}</option>`))
    .join('')
  const kpi = (label, value, note = '', cls = '') =>
    `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`
  const body = table(
    [
      { label: 'Quando', html: (r) => `${esc(when(r.created_at, tz))}<span class="sub2">${ago(r.created_at)}</span>` },
      { label: 'Status', html: saleStatus },
      { label: 'Produto', html: (r) => esc(r.produto || r.product || '—') },
      { label: 'Origem', html: (r) => originTag(r.origem) },
      { label: 'IP', html: (r) => (r.ip ? `<code>${esc(r.ip)}</code>` : '<span class="muted">—</span>') },
      { label: 'Campanha / palavra-chave', html: (r) => (r.origem === 'pago' ? `${esc(r.campanha)}<span class="sub2">${esc(r.palavra)}</span>` : '<span class="muted">—</span>') },
      { label: 'Pedido', html: (r) => `${esc(r.order_id || '—')}<span class="sub2">${esc(r.type)}</span>` },
      {
        label: 'Google Ads',
        html: (r) =>
          r.status !== 'approved'
            ? '<span class="muted">não envia</span>'
            : r.gclid
              ? '<span class="tag ok" title="Tem gclid: entra na planilha que o Google Ads lê">na planilha</span>'
              : '<span class="muted" title="Sem gclid: não dá para enviar ao Google Ads">sem gclid</span>',
      },
      { label: 'Comissão', n: 1, html: (r) => money(r.amount, currency) },
      {
        label: '',
        html: (r) =>
          `<form method="post" action="/vendas/${r.id}/excluir" data-confirm="Excluir esta venda? Ela sai dos números e da planilha do Google Ads. Não tem volta."><button type="submit" class="mini danger">Excluir</button></form>`,
      },
    ],
    rows,
    tests ? 'Nenhuma venda ou teste neste período.' : 'Nenhuma venda neste período.',
  )
  return layout(
    'Vendas — Tracking',
    'vendas',
    `<div class="page-head"><div><h2 class="title">Vendas</h2><p class="sub">Só vendas reais. Testes ficam de fora${tests ? ' (mostrando testes agora)' : ''}. Mostrando ${trafficNote(traffic)}${traffic ? '; vendas sem clique só aparecem em Todos' : ''}.</p></div>
${filterBar({
  base: '/vendas',
  period,
  products,
  productId,
  hidden: { origem: origin || '', testes: tests ? '1' : '' },
  traffic,
  extra: `<select name="origem" onchange="this.form.submit()" aria-label="Origem">${orgOptions}</select>`,
})}</div>
<div class="kpis">
${kpi('Comissão', money(total, currency), `${real.length} venda(s)`, 'hero')}
${kpi('Do Google Ads', pagas, `${pct(pagas, real.length)} das vendas`)}
${kpi('Sem clique', semClique, 'venda sem visita registrada')}
${kpi('Reembolsos', refunds)}
</div>
<section><div class="toolbar"><b>${rows.length} registro(s)</b>
<a style="margin-left:auto" href="/vendas?${new URLSearchParams({ periodo: period, ...(productId ? { produto: productId } : {}), ...(origin ? { origem: origin } : {}), ...(tests ? {} : { testes: '1' }) })}">${tests ? 'Esconder testes' : 'Mostrar testes'}</a></div>
${body}</section>
<p class="muted">“Sem clique”: a venda chegou da BuyGoods sem um ID de visita do rastreador (o comprador não passou pela página com o script, ou o link não levou o subid). Essas vendas não vão para o Google Ads.</p>`,
  )
}

// ---------------------------------------------------------------- Login

export function loginPage({ next = '/', error = '' } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar — Tracking</title><style>${CSS}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--top)}
.login form{width:100%;max-width:360px;background:var(--card);border-radius:14px;padding:26px 24px;display:grid;gap:14px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.login .logo{color:var(--text);padding:0 0 4px}.login label b{display:block;margin-bottom:4px;font-size:12.5px}
.login input[type=password]{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);width:100%}
.login button{width:100%;padding:10px}</style></head><body>
<div class="login"><form method="post" action="/login">
<div class="logo"><span class="mk">T</span>Tracking</div>
${error ? `<div class="flash bad" style="margin:0">${esc(error)}</div>` : ''}
<input type="hidden" name="next" value="${esc(next)}">
<label><b>Usuário</b><input type="text" name="user" autocomplete="username" required autofocus></label>
<label><b>Senha</b><input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit" class="primary">Entrar</button>
</form></div></body></html>`
}

// ---------------------------------------------------------------- Diagnóstico

export function diagnosticsPage(d, { resendPending, flash }) {
  const icon = { bad: '!', warn: '!', ok: '✓', info: 'i' }
  const state = { bad: 'bad', warn: 'warn', ok: 'ok', info: 'wait' }
  const list = (items) =>
    items.length
      ? `<ul class="check">${items
          .map(
            (x) => `<li class="s-${state[x.level]}"><div class="ic">${icon[x.level]}</div><div><b>${esc(x.title)}</b>${x.detail ? `<span>${esc(x.detail)}</span>` : ''}${x.fix ? `<span><b style="display:inline">Como resolver:</b> ${esc(x.fix)}</span>` : ''}</div></li>`,
          )
          .join('')}</ul>`
      : '<div class="empty">Nada encontrado.</div>'
  const products = d.products
    .map(
      (p) => `<section><h3>${esc(p.product.name)} <span class="right">configuração ${p.progress.pct}%</span></h3>
${p.missing.length ? `<div class="box" style="padding-bottom:0"><p class="muted">Etapas que faltam para 100%: <b>${p.missing.map(esc).join(', ')}</b>. <a href="/produtos/${esc(p.product.id)}">Abrir produto →</a></p></div>` : ''}
${list(p.items.length ? p.items : [{ level: 'ok', title: 'Nada de errado encontrado neste produto' }])}</section>`,
    )
    .join('')
  return layout(
    'Diagnóstico — Tracking',
    'diagnostico',
    `${flash ? '<div class="flash">Pronto: na próxima execução do script (até 1 hora), as vendas dos últimos 30 dias com gclid vão de novo para o Google Ads. O que ele já recebeu é ignorado.</div>' : ''}
<div class="page-head"><div><h2 class="title">Diagnóstico</h2><p class="sub">Revisão automática do que impede visitas e vendas de chegarem ao Google Ads.</p></div>
<div class="filters"><span class="tag ${d.counts.bad ? 'bad' : 'ok'}">${d.counts.bad} problema(s)</span><span class="tag ${d.counts.warn ? 'warn' : 'ok'}">${d.counts.warn} alerta(s)</span></div></div>
<section><h3>Geral</h3>${list(d.general)}</section>
<section><h3>Vendas dos últimos 30 dias</h3>${list(d.sales)}
<div class="box"><form method="post" action="/diagnostico/reenviar" class="actions" data-confirm="Na próxima execução, o script manda de novo as vendas com gclid dos últimos 30 dias. Continuar?">
<button type="submit" ${resendPending ? 'disabled' : ''}>${resendPending ? 'Reenvio agendado: aguardando o script' : 'Reenviar últimos 30 dias'}</button></form>
<p class="muted">Use quando o script ficou parado, foi instalado depois das vendas, ou a conversão foi criada depois. O Google ignora vendas que já recebeu.</p></div></section>
${products}
<p class="muted">Na VPS, o mesmo relatório em texto: <code>cd /opt/tracking && npm run diagnostico</code></p>`,
  )
}
