// Revisão automática: procura o que impede visitas e vendas de chegarem ao
// Google Ads e explica como resolver. Usada pela página /diagnostico e pelo
// comando `npm run diagnostico`.
import { getSetting } from './db.js'
import { listProducts, productStatus, setupProgress, productPages, pagePings } from './products.js'

const OUR_ID = /^v[a-z0-9]{8,}$/
const DAY = 86400e3

const ago = (iso, now) => {
  const h = Math.round((now - new Date(iso).getTime()) / 3600e3)
  return h < 1 ? 'há menos de 1 h' : h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`
}

// level: bad (impede venda de ir pro Google), warn (atenção), ok, info
const f = (level, title, detail = '', fix = '') => ({ level, title, detail, fix })

export function runDiagnostics(db, { now = new Date(), health = null, exportDays = 30, defaultConversion = 'Compra BuyGoods' } = {}) {
  const t = now.getTime()
  const since30 = new Date(t - 30 * DAY).toISOString()
  const general = []

  // --- HTTPS -----------------------------------------------------------------
  if (health && !health.ok) {
    general.push(
      f('bad', 'O endereço do rastreador não abre com HTTPS válido', health.reason,
        'Sem isso o navegador dos visitantes bloqueia o script. Na VPS: certbot --nginx -d SEU_SUBDOMINIO --redirect.'),
    )
  } else if (health?.ok) general.push(f('ok', 'HTTPS do rastreador funcionando'))

  // --- Postback --------------------------------------------------------------
  const lastPb = db.prepare(`SELECT created_at FROM conversions WHERE status != 'test' ORDER BY created_at DESC LIMIT 1`).get()
  const lastTest = getSetting(db, 'postback_test')
  if (!lastPb && !lastTest) {
    general.push(f('bad', 'Nenhum postback recebido da plataforma', '', 'Cadastre o postback (aba 2 do produto) e clique em Test na BuyGoods.'))
  } else {
    general.push(f('ok', 'Postback chegando', `Último ${ago(lastPb?.created_at || lastTest.at, t)}.`))
    const recent = db.prepare(`SELECT raw FROM conversions WHERE status != 'test' AND raw IS NOT NULL ORDER BY created_at DESC LIMIT 20`).all()
    const noSubidParam = recent.filter((r) => !/(^|&)(subid|clickid|click_id|cid|s1)=/.test(r.raw)).length
    if (recent.length && noSubidParam === recent.length) {
      general.push(
        f('bad', 'O postback chega SEM o campo subid', `Nenhum dos últimos ${recent.length} postbacks trouxe subid.`,
          'A URL cadastrada na BuyGoods está incompleta. Copie de novo a URL da aba 2 (ela tem &subid={SUBID}) e substitua a antiga.'),
      )
    }
  }

  // --- Script do Google Ads --------------------------------------------------
  const fetchAll = getSetting(db, 'csv_fetch:all')
  const report = getSetting(db, 'script_report')
  if (!fetchAll) {
    general.push(f('bad', 'O script do Google Ads nunca leu a planilha', '', 'Cole o script (Configurações) na conta de anúncios, Autorizar, Executar e Frequência "Por hora".'))
  } else {
    const hours = (t - new Date(fetchAll.at).getTime()) / 3600e3
    if (hours > 3) {
      general.push(
        f('warn', 'O script do Google Ads não lê a planilha há mais de 3 horas', `Última leitura ${ago(fetchAll.at, t)}.`,
          'No Google Ads → Scripts, confira se o script está ativo, com Frequência "Por hora" e autorizado.'),
      )
    } else general.push(f('ok', 'Script do Google Ads rodando', `Última leitura ${ago(fetchAll.at, t)}.`))
    if (report?.erro) general.push(f('bad', 'O último envio do script deu erro', `${ago(report.at, t)}: ${report.erro}`, 'Veja a mensagem; erro de autenticação = clicar em Autorizar de novo no script.'))
    else if (!report) general.push(f('warn', 'Script antigo, sem relatório de envio', '', 'Copie o script de novo (Configurações) e cole por cima no Google Ads.'))
  }

  // --- Vendas que não foram para o Google -------------------------------------
  const sales = db
    .prepare(
      `SELECT v.id, v.created_at, v.subid, v.order_id, v.amount, c.id AS visita, c.gclid, c.gbraid, c.wbraid,
              c.source, c.product_id, p.name AS produto, p.conversion_name
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid LEFT JOIN products p ON p.id = c.product_id
        WHERE v.status = 'approved' AND v.created_at >= ?
        ORDER BY v.created_at DESC`,
    )
    .all(since30)
  const groups = {
    semSubid: [],
    subidFixo: new Map(),
    semVisita: [],
    iphone: [],
    semGclid: [],
    nomePadrao: [],
    enviaveis: [],
  }
  for (const s of sales) {
    if (!s.subid) groups.semSubid.push(s)
    else if (!s.visita && !OUR_ID.test(s.subid)) groups.subidFixo.set(s.subid, (groups.subidFixo.get(s.subid) || 0) + 1)
    else if (!s.visita) groups.semVisita.push(s)
    else if (!s.gclid && (s.gbraid || s.wbraid)) groups.iphone.push(s)
    else if (!s.gclid) groups.semGclid.push(s)
    else {
      groups.enviaveis.push(s)
      if (!s.product_id) groups.nomePadrao.push(s)
    }
  }
  const salesFindings = []
  const n = (arr) => (Array.isArray(arr) ? arr.length : [...arr.values()].reduce((a, b) => a + b, 0))
  salesFindings.push(f('info', `${sales.length} venda(s) real(is) nos últimos 30 dias`, `${groups.enviaveis.length} com gclid (vão para o Google Ads).`))
  if (groups.subidFixo.size)
    salesFindings.push(
      f('bad', `${n(groups.subidFixo)} venda(s) com subid fixo no link (o script não marcou o botão)`,
        `Valores recebidos: ${[...groups.subidFixo.entries()].map(([k, v]) => `"${k}" (${v})`).join(', ')}.`,
        'O comprador clicou num link de compra que o script não alterou: o script não rodou nessa página (página sem o script, cache, outro domínio) ou não reconheceu o link. Use "Testar instalação" em cada página e confira "Páginas onde o script já deu sinal".'),
    )
  if (groups.semSubid.length)
    salesFindings.push(
      f('warn', `${groups.semSubid.length} venda(s) sem subid (sem clique)`,
        'O comprador não passou por uma página com o script, ou o link de compra não levou o subid.',
        'Se você tem páginas sem o script, cole o script nelas. Vendas diretas do produtor/outros canais também caem aqui (normal).'),
    )
  if (groups.semVisita.length)
    salesFindings.push(
      f('warn', `${groups.semVisita.length} venda(s) com ID de visita que o rastreador não registrou`,
        'O link foi marcado pelo script, mas o registro da visita não chegou (bloqueador de anúncios ou rede do visitante).',
        'Pouca quantidade é normal. Se for muita, confira o HTTPS e se algum plugin/CDN bloqueia o endereço do rastreador.'),
    )
  if (groups.iphone.length)
    salesFindings.push(
      f('info', `${groups.iphone.length} venda(s) de clique pago sem gclid (iPhone: gbraid/wbraid)`,
        'O Google mandou gbraid/wbraid em vez de gclid; a planilha só aceita gclid.', 'Não tem o que configurar; essas vendas aparecem só no painel.'),
    )
  if (groups.semGclid.length)
    salesFindings.push(
      f('info', `${groups.semGclid.length} venda(s) de visitas sem anúncio (orgânico, direto, referência)`,
        'Não vieram de clique no Google Ads, então não há o que enviar.', ''),
    )
  if (groups.nomePadrao.length)
    salesFindings.push(
      f('warn', `${groups.nomePadrao.length} venda(s) com gclid de páginas com o script antigo (sem produto)`,
        `Vão para o Google com o nome padrão "${defaultConversion}". Se essa ação não existir no Google Ads, ele recusa.`,
        'Troque o script dessas páginas pelo script do produto, ou crie a ação com esse nome.'),
    )
  const old = groups.enviaveis.filter((s) => new Date(s.created_at).getTime() < t - exportDays * DAY)
  if (old.length) salesFindings.push(f('info', `${old.length} venda(s) com gclid fora da janela de ${exportDays} dias`, '', ''))
  // Vendas com gclid que o script (lê só os últimos 3 dias) pode não ter enviado.
  const log = getSetting(db, 'csv_fetch_log') || []
  const sentWindow = (s) => {
    const a = new Date(s.created_at).getTime()
    return log.some((x) => {
      const ft = new Date(x).getTime()
      return ft >= a && ft <= a + 3 * DAY
    })
  }
  const logStart = log.length ? new Date(log[0]).getTime() : Infinity
  const unsure = groups.enviaveis.filter((s) => !sentWindow(s) && new Date(s.created_at).getTime() < t - 2 * 3600e3)
  if (unsure.length) {
    const before = unsure.filter((s) => new Date(s.created_at).getTime() < logStart).length
    salesFindings.push(
      f('warn', `${unsure.length} venda(s) com gclid que o script pode não ter enviado`,
        before
          ? `${before} delas são de antes de o rastreador começar a registrar as leituras do script, então não dá para confirmar.`
          : 'O script não leu a planilha nos 3 dias seguintes a essas vendas.',
        'Clique em "Reenviar últimos 30 dias": na próxima execução o script manda tudo de novo (o Google ignora o que já recebeu).'),
    )
  }

  // --- Produtos ---------------------------------------------------------------
  const products = listProducts(db).map((p) => {
    const st = productStatus(db, p)
    const pr = setupProgress(st)
    const items = []
    const pages = productPages(p)
    const pings = pagePings(db, p.id)
    if (!pages.length) items.push(f('warn', 'Sem página cadastrada', '', 'Cadastre a página (e as outras páginas/domínios) em Configurações para poder testar.'))
    if (!pings.length && !p.last_ping_at)
      items.push(f('bad', 'O script nunca deu sinal em nenhuma página', '', 'Cole o script deste produto (aba Script) em cada página, publique, limpe o cache e clique em Testar instalação.'))
    for (const pg of pings) {
      if (!(pg.links > 0))
        items.push(f('bad', `Script sem link de afiliado em ${pg.page.replace(/^https?:\/\//, '')}`, 'O script roda nessa página, mas não achou o botão de compra.', 'Cadastre o link de afiliado em Configurações ou coloque data-rastrear no link do botão.'))
      else if (t - new Date(pg.last_at).getTime() > 7 * DAY)
        items.push(f('warn', `Sem sinal há mais de 7 dias em ${pg.page.replace(/^https?:\/\//, '')}`, `Último ${ago(pg.last_at, t)}.`, 'A página pode estar sem tráfego, ou o script saiu dela.'))
    }
    const pingedHosts = new Set(pings.map((x) => x.page))
    for (const u of pages) {
      const key = (() => {
        try {
          const x = new URL(u)
          return `${x.origin}${x.pathname.replace(/\/+$/, '')}`.toLowerCase()
        } catch {
          return u
        }
      })()
      if (pings.length && !pingedHosts.has(key))
        items.push(f('warn', `Página cadastrada sem sinal do script: ${u.replace(/^https?:\/\//, '')}`, '', 'Teste essa página em "Testar instalação". Se o script não está nela, cole e publique.'))
    }
    const v = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(gclid IS NOT NULL) AS pagas, SUM(gclid IS NOT NULL AND campaign_id IS NULL AND utm_campaign IS NULL) AS semCamp
           FROM clicks WHERE product_id = ? AND is_test = 0 AND created_at >= ?`,
      )
      .get(p.id, new Date(t - 14 * DAY).toISOString())
    if (v.total > 0 && !v.pagas)
      items.push(f('warn', 'Nenhuma visita com gclid nos últimos 14 dias', `${v.total} visita(s), nenhuma de clique no Google Ads.`, 'Confira se a campanha está ativa, se o URL final é a página com o script e se a codificação automática está ligada.'))
    if (v.semCamp > 0)
      items.push(f('warn', `${v.semCamp} visita(s) paga(s) sem campanha identificada`, 'O sufixo do URL final não chegou nessas visitas.', 'Cole o sufixo nas Configurações da conta ou de cada campanha (aba Google Ads → Dicas).'))
    const missing = pr.steps.filter((s) => !s.done).map((s) => s.label)
    return { product: p, progress: pr, missing, items }
  })

  const all = [...general, ...salesFindings, ...products.flatMap((x) => x.items)]
  return {
    at: now.toISOString(),
    general,
    sales: salesFindings,
    products,
    counts: { bad: all.filter((x) => x.level === 'bad').length, warn: all.filter((x) => x.level === 'warn').length },
  }
}

// Versão em texto, para o terminal (`npm run diagnostico`).
export function diagnosticsText(d) {
  const icon = { bad: '✗', warn: '!', ok: '✓', info: '·' }
  const line = (x) =>
    `  ${icon[x.level]} ${x.title}${x.detail ? `\n      ${x.detail}` : ''}${x.fix ? `\n      → ${x.fix}` : ''}`
  const out = [`DIAGNÓSTICO DO RASTREADOR (${d.at})`, `${d.counts.bad} problema(s), ${d.counts.warn} alerta(s)`, '', 'GERAL', ...d.general.map(line), '', 'VENDAS (30 dias)', ...d.sales.map(line)]
  for (const p of d.products) {
    out.push('', `PRODUTO: ${p.product.name} — configuração ${p.progress.pct}%${p.missing.length ? ` (falta: ${p.missing.join(', ')})` : ''}`)
    out.push(...(p.items.length ? p.items.map(line) : ['  ✓ nada encontrado']))
  }
  return out.join('\n')
}
