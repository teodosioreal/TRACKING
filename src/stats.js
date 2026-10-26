// Consultas do painel.

function tzOffsetMs(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

// Meia-noite (no fuso do painel) de `daysBack` dias atrás, em ISO UTC.
function startOfDay(tz, daysBack, now) {
  const off = tzOffsetMs(tz, now)
  const local = new Date(now.getTime() + off)
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack)
  return new Date(midnight - off).toISOString()
}

export const PERIODS = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': '7 dias',
  '30d': '30 dias',
  tudo: 'Tudo',
}

export function periodRange(period, tz, now = new Date()) {
  const far = '9999-12-31T00:00:00.000Z'
  switch (period) {
    case 'hoje':
      return [startOfDay(tz, 0, now), far]
    case 'ontem':
      return [startOfDay(tz, 1, now), startOfDay(tz, 0, now)]
    case '7d':
      return [startOfDay(tz, 6, now), far]
    case '30d':
      return [startOfDay(tz, 29, now), far]
    default:
      return ['0000', far]
  }
}

const CAMPAIGN = `COALESCE(NULLIF(c.utm_campaign,''), NULLIF(c.campaign_id,''),
  CASE WHEN c.id IS NULL THEN '(venda sem clique)'
       WHEN c.gclid IS NOT NULL THEN '(google, sem campaignid)'
       ELSE '(direto / orgânico)' END)`
const KEYWORD = `COALESCE(NULLIF(c.keyword,''), NULLIF(c.utm_term,''),
  CASE WHEN c.id IS NULL THEN '(venda sem clique)' ELSE '(sem palavra-chave)' END)`

// Filtro opcional por produto. "?" vira o id do produto ou NULL (todos).
// Filtro de tráfego: 'pago' (Google Ads e outros pagos) ou 'nao_pago'
// (orgânico, referência, direto). Vendas sem clique não têm origem e só
// aparecem sem filtro.
export const TRAFFIC = { pago: 'Pago', nao_pago: 'Não pago' }
const PRODUCT_FILTER = `(? IS NULL OR c.product_id = ?)
  AND (? IS NULL OR (? = 'pago' AND c.source IN ('pago', 'pago_outro'))
                 OR (? = 'nao_pago' AND c.source IN ('organico', 'referencia', 'direto')))`
// Parâmetros do filtro acima, na ordem.
const scope = (productId, traffic) => {
  const id = productId || null
  const tr = TRAFFIC[traffic] ? traffic : null
  return [id, id, tr, tr, tr]
}

function breakdown(db, expr, from, to, limit, sc) {
  const visits = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(*) AS visitas, SUM(c.outbound_at IS NOT NULL) AS cliques
         FROM clicks c WHERE c.is_test = 0 AND c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER}
        GROUP BY label`,
    )
    .all(from, to, ...sc)
  const sales = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(*) AS vendas, SUM(v.amount) AS comissao
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.status = 'approved' AND v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER}
        GROUP BY label`,
    )
    .all(from, to, ...sc)

  const map = new Map()
  const get = (label) => {
    if (!map.has(label)) map.set(label, { label, visitas: 0, cliques: 0, vendas: 0, comissao: 0 })
    return map.get(label)
  }
  for (const r of visits) Object.assign(get(r.label), { visitas: r.visitas, cliques: r.cliques })
  for (const r of sales) Object.assign(get(r.label), { vendas: r.vendas, comissao: r.comissao })
  return [...map.values()].sort((a, b) => b.comissao - a.comissao || b.visitas - a.visitas).slice(0, limit)
}

export function dashboard(db, period, tz, now = new Date(), productId = null, traffic = null) {
  const [from, to] = periodRange(period, tz, now)
  const sc = scope(productId, traffic)
  const t = db
    .prepare(
      `SELECT COUNT(*) AS visitas, SUM(outbound_at IS NOT NULL) AS cliques, SUM(gclid IS NOT NULL) AS google
         FROM clicks c WHERE c.is_test = 0 AND c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER}`,
    )
    .get(from, to, ...sc)
  const s = db
    .prepare(
      `SELECT SUM(v.status = 'approved') AS vendas,
              SUM(CASE WHEN v.status = 'approved' THEN v.amount ELSE 0 END) AS comissao,
              SUM(v.status = 'refund') AS reembolsos
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER}`,
    )
    .get(from, to, ...sc)

  const recentSales = db
    .prepare(
      `SELECT v.*, c.gclid, p.name AS produto, ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid LEFT JOIN products p ON p.id = c.product_id
        WHERE v.status != 'test' AND v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER}
        ORDER BY v.created_at DESC LIMIT 100`,
    )
    .all(from, to, ...sc)
  const recentClicks = db
    .prepare(
      `SELECT c.*, p.name AS produto, ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra
         FROM clicks c LEFT JOIN products p ON p.id = c.product_id
        WHERE c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER}
        ORDER BY c.created_at DESC LIMIT 50`,
    )
    .all(from, to, ...sc)

  return {
    totals: {
      visitas: t.visitas || 0,
      cliques: t.cliques || 0,
      google: t.google || 0,
      vendas: s.vendas || 0,
      comissao: s.comissao || 0,
      reembolsos: s.reembolsos || 0,
    },
    campaigns: breakdown(db, CAMPAIGN, from, to, 50, sc),
    keywords: breakdown(db, KEYWORD, from, to, 30, sc),
    recentSales,
    recentClicks,
  }
}

function localKey(iso, tz, hourly) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  )
  return hourly ? `${p.year}-${p.month}-${p.day} ${p.hour}` : `${p.year}-${p.month}-${p.day}`
}

// Visitas, vendas e comissão por hora (hoje/ontem) ou por dia (demais períodos).
export function timeSeries(db, period, tz, now = new Date(), productId = null, traffic = null) {
  const sc = scope(productId, traffic)
  const hourly = period === 'hoje' || period === 'ontem'
  let [from, to] = periodRange(period, tz, now)
  if (period === 'tudo') {
    const first = db
      .prepare(`SELECT MIN(created_at) AS t FROM (SELECT created_at FROM clicks UNION ALL SELECT created_at FROM conversions)`)
      .get().t
    from = startOfDay(tz, 0, first ? new Date(first) : now)
  }
  const step = hourly ? 3600e3 : 86400e3
  const end = hourly ? new Date(from).getTime() + 24 * 3600e3 : Math.min(new Date(to).getTime(), now.getTime())

  const buckets = new Map()
  for (let t = new Date(from).getTime(); t < end; t += step) {
    const iso = new Date(t).toISOString()
    const key = localKey(iso, tz, hourly)
    if (!buckets.has(key)) buckets.set(key, { key, start: iso, visitas: 0, vendas: 0, comissao: 0 })
  }
  // Período longo: mostra só os últimos 90 dias no gráfico.
  const keys = [...buckets.keys()].slice(-90)

  const clicks = db
    .prepare(`SELECT c.created_at FROM clicks c WHERE c.is_test = 0 AND c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER}`)
    .all(from, to, ...sc)
  const sales = db
    .prepare(
      `SELECT v.created_at, v.amount FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.status = 'approved' AND v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER}`,
    )
    .all(from, to, ...sc)
  for (const r of clicks) {
    const b = buckets.get(localKey(r.created_at, tz, hourly))
    if (b) b.visitas++
  }
  for (const r of sales) {
    const b = buckets.get(localKey(r.created_at, tz, hourly))
    if (b) {
      b.vendas++
      b.comissao += r.amount
    }
  }
  return { hourly, points: keys.map((k) => buckets.get(k)) }
}

// ---- Visitantes, vendas e origem ------------------------------------------

const ORIGIN = `CASE WHEN c.id IS NULL THEN 'sem_clique' ELSE COALESCE(c.source, 'direto') END`

// Visitas do período, mais recentes primeiro, com "clicou" e "comprou".
export function visitors(db, { period, tz, productId = null, source = null, traffic = null, limit = 200, now = new Date() }) {
  const [from, to] = periodRange(period, tz, now)
  const sc = scope(productId, traffic)
  const src = source || null
  return db
    .prepare(
      `SELECT c.*, p.name AS produto, ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra,
              (SELECT COUNT(*) FROM conversions v WHERE v.subid = c.id AND v.status = 'approved') AS compras,
              (SELECT COALESCE(SUM(v.amount), 0) FROM conversions v WHERE v.subid = c.id AND v.status = 'approved') AS valor
         FROM clicks c LEFT JOIN products p ON p.id = c.product_id
        WHERE c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER}
          AND (? IS NULL OR COALESCE(c.source, 'direto') = ?)
        ORDER BY c.created_at DESC LIMIT ?`,
    )
    .all(from, to, ...sc, src, src, limit)
}

// Vendas do período. Por padrão só vendas reais (aprovadas e reembolsos);
// testes só aparecem se pedir.
export function salesList(db, { period, tz, productId = null, origin = null, traffic = null, includeTests = false, limit = 300, now = new Date() }) {
  const [from, to] = periodRange(period, tz, now)
  const sc = scope(productId, traffic)
  const org = origin || null
  return db
    .prepare(
      `SELECT v.*, c.gclid, c.ip, c.device, c.user_agent, p.name AS produto, ${ORIGIN} AS origem,
              ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid LEFT JOIN products p ON p.id = c.product_id
        WHERE v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER}
          AND (? = 1 OR v.status != 'test')
          AND (? IS NULL OR ${ORIGIN} = ?)
        ORDER BY v.created_at DESC, v.id DESC LIMIT ?`,
    )
    .all(from, to, ...sc, includeTests ? 1 : 0, org, org, limit)
}

// Visitas e vendas por origem (pago, orgânico, direto, referência, sem clique).
export function originBreakdown(db, period, tz, now = new Date(), productId = null, traffic = null) {
  const [from, to] = periodRange(period, tz, now)
  const sc = scope(productId, traffic)
  const map = new Map()
  const get = (k) => {
    if (!map.has(k)) map.set(k, { origem: k, visitas: 0, vendas: 0, comissao: 0 })
    return map.get(k)
  }
  for (const r of db
    .prepare(
      `SELECT COALESCE(c.source, 'direto') AS k, COUNT(*) AS n FROM clicks c
        WHERE c.is_test = 0 AND c.created_at >= ? AND c.created_at < ? AND ${PRODUCT_FILTER} GROUP BY k`,
    )
    .all(from, to, ...sc))
    get(r.k).visitas = r.n
  for (const r of db
    .prepare(
      `SELECT ${ORIGIN} AS k, COUNT(*) AS n, SUM(v.amount) AS s
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.status = 'approved' AND v.created_at >= ? AND v.created_at < ? AND ${PRODUCT_FILTER} GROUP BY k`,
    )
    .all(from, to, ...sc))
    Object.assign(get(r.k), { vendas: r.n, comissao: r.s || 0 })
  const order = ['pago', 'pago_outro', 'organico', 'referencia', 'direto', 'sem_clique']
  return [...map.values()].filter((r) => r.origem !== 'teste').sort((a, b) => order.indexOf(a.origem) - order.indexOf(b.origem))
}
