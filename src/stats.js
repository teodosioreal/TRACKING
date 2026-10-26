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

function breakdown(db, expr, from, to, limit) {
  const visits = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(*) AS visitas, SUM(c.outbound_at IS NOT NULL) AS cliques
         FROM clicks c WHERE c.created_at >= ? AND c.created_at < ? GROUP BY label`,
    )
    .all(from, to)
  const sales = db
    .prepare(
      `SELECT ${expr} AS label, COUNT(*) AS vendas, SUM(v.amount) AS comissao
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.status = 'approved' AND v.created_at >= ? AND v.created_at < ? GROUP BY label`,
    )
    .all(from, to)

  const map = new Map()
  const get = (label) => {
    if (!map.has(label)) map.set(label, { label, visitas: 0, cliques: 0, vendas: 0, comissao: 0 })
    return map.get(label)
  }
  for (const r of visits) Object.assign(get(r.label), { visitas: r.visitas, cliques: r.cliques })
  for (const r of sales) Object.assign(get(r.label), { vendas: r.vendas, comissao: r.comissao })
  return [...map.values()].sort((a, b) => b.comissao - a.comissao || b.visitas - a.visitas).slice(0, limit)
}

export function dashboard(db, period, tz, now = new Date()) {
  const [from, to] = periodRange(period, tz, now)
  const t = db
    .prepare(
      `SELECT COUNT(*) AS visitas, SUM(outbound_at IS NOT NULL) AS cliques, SUM(gclid IS NOT NULL) AS google
         FROM clicks WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to)
  const s = db
    .prepare(
      `SELECT SUM(status = 'approved') AS vendas,
              SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) AS comissao,
              SUM(status = 'refund') AS reembolsos
         FROM conversions WHERE created_at >= ? AND created_at < ?`,
    )
    .get(from, to)

  const recentSales = db
    .prepare(
      `SELECT v.*, c.gclid, ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid
        WHERE v.created_at >= ? AND v.created_at < ?
        ORDER BY v.created_at DESC LIMIT 100`,
    )
    .all(from, to)
  const recentClicks = db
    .prepare(
      `SELECT c.*, ${CAMPAIGN} AS campanha, ${KEYWORD} AS palavra
         FROM clicks c WHERE c.created_at >= ? AND c.created_at < ?
        ORDER BY c.created_at DESC LIMIT 50`,
    )
    .all(from, to)

  return {
    totals: {
      visitas: t.visitas || 0,
      cliques: t.cliques || 0,
      google: t.google || 0,
      vendas: s.vendas || 0,
      comissao: s.comissao || 0,
      reembolsos: s.reembolsos || 0,
    },
    campaigns: breakdown(db, CAMPAIGN, from, to, 50),
    keywords: breakdown(db, KEYWORD, from, to, 30),
    recentSales,
    recentClicks,
  }
}
