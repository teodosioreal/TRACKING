// Regras de negócio: registrar visita, clique no botão, venda e gerar a
// planilha do Google Ads. Sem HTTP aqui, para dar para testar isolado.

import { isValidPid } from './products.js'
import { classifySource, pageKey } from './source.js'

const CID_RE = /^[A-Za-z0-9_-]{6,64}$/

// Campos da URL de chegada que guardamos. A chave é o nome da coluna.
const URL_FIELDS = {
  gclid: ['gclid'],
  gbraid: ['gbraid'],
  wbraid: ['wbraid'],
  campaign_id: ['campaignid', 'campaign_id', 'utm_id'],
  adgroup_id: ['adgroupid', 'adgroup_id'],
  keyword: ['keyword'],
  matchtype: ['matchtype'],
  device: ['device'],
  network: ['network'],
  utm_source: ['utm_source'],
  utm_medium: ['utm_medium'],
  utm_campaign: ['utm_campaign'],
  utm_content: ['utm_content'],
  utm_term: ['utm_term'],
}

const clip = (v, max = 500) => (v == null ? null : String(v).slice(0, max))

// "{SUBID}" que a BuyGoods não substituiu conta como vazio.
function clean(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || /^\{.*\}$/.test(s) || /^--.*--$/.test(s)) return null
  return s
}

function pick(params, names) {
  for (const n of names) {
    const v = clean(params.get(n))
    if (v) return v
  }
  return null
}

export function isValidCid(cid) {
  return typeof cid === 'string' && CID_RE.test(cid)
}

function existingProduct(db, pid) {
  return isValidPid(pid) && db.prepare('SELECT 1 FROM products WHERE id = ?').get(pid) ? pid : null
}

export function recordClick(db, { cid, pid, test, url, referrer, ip, userAgent }, now = new Date()) {
  if (!isValidCid(cid)) return false
  let params = new URLSearchParams()
  try {
    params = new URL(url).searchParams
  } catch {}
  const row = { id: cid, created_at: now.toISOString() }
  for (const [col, names] of Object.entries(URL_FIELDS)) row[col] = clip(pick(params, names))
  row.landing_url = clip(url, 2000)
  row.referrer = clip(referrer, 1000)
  row.ip = clip(ip, 100)
  row.user_agent = clip(userAgent, 500)
  row.product_id = existingProduct(db, pid)
  row.is_test = test ? 1 : 0
  row.source = classifySource(row)
  row.page = pageKey(url)

  const cols = Object.keys(row)
  // Recarregar a página manda o mesmo cid de novo: mantém o primeiro registro.
  const res = db
    .prepare(`INSERT OR IGNORE INTO clicks (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map((c) => row[c]))
  return res.changes > 0
}

export function recordOutbound(db, cid, now = new Date()) {
  if (!isValidCid(cid)) return false
  const res = db
    .prepare(
      `UPDATE clicks SET outbound_at = COALESCE(outbound_at, ?), last_outbound_at = ?, outbound_count = outbound_count + 1
        WHERE id = ?`,
    )
    .run(now.toISOString(), now.toISOString(), cid)
  return res.changes > 0
}

// Sinal do script: ele está na página e achou N links de compra.
export function recordPing(db, { pid, url, links, test, candidates }, now = new Date()) {
  if (!existingProduct(db, pid)) return false
  const n = Number.isInteger(links) && links >= 0 ? Math.min(links, 1000) : null
  db.prepare(
    `UPDATE products SET last_ping_at = ?, last_ping_url = ?, last_ping_links = ?,
            last_test_at = CASE WHEN ? THEN ? ELSE last_test_at END
      WHERE id = ?`,
  ).run(now.toISOString(), clip(url, 2000), n, test ? 1 : 0, now.toISOString(), pid)
  const page = pageKey(url)
  if (page) {
    // Links externos que o script viu quando não reconheceu nenhum link de compra.
    const cands = Array.isArray(candidates)
      ? candidates.filter((c) => typeof c === 'string' && /^https?:\/\//.test(c)).slice(0, 8).map((c) => c.slice(0, 300))
      : []
    db.prepare(
      `INSERT INTO page_pings (product_id, page, url, last_at, links, test_at, candidates) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id, page) DO UPDATE SET url = excluded.url, last_at = excluded.last_at,
         links = excluded.links, test_at = COALESCE(excluded.test_at, page_pings.test_at), candidates = excluded.candidates`,
    ).run(pid, page, clip(url, 2000), now.toISOString(), n, test ? now.toISOString() : null, cands.length ? JSON.stringify(cands) : null)
  }
  return true
}

export { pageKey }

const TEST_RE = /^(teste|test)$/i
// Teste disparado pela plataforma (ex.: botão "Test" do postback da BuyGoods):
// "test" em algum campo, nem ID da visita nem número de pedido, ou comissão 0
// sem ID da visita (venda real sempre tem comissão).
const PLATFORM_TEST_RE = /test/i
const REFUND_RE = /refund|chargeback|cancel|reembolso|estorno/i

// Postback da BuyGoods. Aceita vários nomes de parâmetro para não depender
// de um formato só.
export function recordPostback(db, params, now = new Date()) {
  const subid = pick(params, ['subid', 'clickid', 'click_id', 'cid', 's1'])
  const orderId = pick(params, ['order', 'orderid', 'order_id', 'transaction', 'eventid'])
  const type = pick(params, ['type', 'conv_type', 'event']) || 'sale'
  const amountRaw = pick(params, ['amount', 'commission', 'payout', 'valor', 'sum'])
  const amount = Number.parseFloat(String(amountRaw ?? '0').replace(',', '.')) || 0
  const product = pick(params, ['product', 'produto', 'product_codename'])
  const isRefund = REFUND_RE.test(type)
  const isTest =
    TEST_RE.test(type) ||
    [subid, orderId, type, product].some((v) => v && PLATFORM_TEST_RE.test(v)) ||
    (!subid && !orderId) ||
    (!subid && amount === 0)

  // Postback sem número de pedido não tem como cair no UNIQUE(order_id, type):
  // o mesmo postback chegando de novo em até 2 segundos é tratado como repetido.
  if (!orderId) {
    const since = new Date(now.getTime() - 2000).toISOString()
    const dup = db
      .prepare(`SELECT 1 FROM conversions WHERE order_id IS NULL AND raw = ? AND created_at >= ? LIMIT 1`)
      .get(clip(params.toString(), 2000), since)
    if (dup) return { duplicate: true, refund: isRefund, test: isTest, subid, orderId, amount, type }
  }

  const res = db
    .prepare(
      `INSERT OR IGNORE INTO conversions (created_at, subid, order_id, type, amount, product, status, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now.toISOString(),
      clip(subid, 100),
      clip(orderId, 100),
      clip(type, 50),
      isRefund ? -Math.abs(amount) : amount,
      clip(product, 200),
      isRefund ? 'refund' : isTest ? 'test' : 'approved',
      clip(params.toString(), 2000),
    )

  if (isRefund && orderId) {
    db.prepare(`UPDATE conversions SET status = 'refunded' WHERE order_id = ? AND status = 'approved'`).run(orderId)
  }
  return { duplicate: res.changes === 0, refund: isRefund, test: isTest, subid, orderId, amount, type }
}

// "2026-10-26 15:04:05+0000" — formato aceito pelo Google Ads.
export function googleTime(iso) {
  return iso.slice(0, 19).replace('T', ' ') + '+0000'
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Planilha de conversões offline no modelo "Google Click ID" do Google Ads.
// Só entram vendas aprovadas que vieram de um clique com gclid. Cada venda usa
// o nome de conversão do seu produto (ou o padrão, se a visita não tem produto).
// Com productId, só as vendas daquele produto.
export function exportGoogleAdsCsv(db, { conversionName, currency, days, productId }, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400000).toISOString()
  const rows = db
    .prepare(
      `SELECT c.gclid, v.created_at, v.amount, COALESCE(p.conversion_name, ?) AS name
         FROM conversions v
         JOIN clicks c ON c.id = v.subid
         LEFT JOIN products p ON p.id = c.product_id
        WHERE v.status = 'approved' AND c.gclid IS NOT NULL AND v.created_at >= ?
          AND (? IS NULL OR c.product_id = ?)
        ORDER BY v.created_at`,
    )
    .all(conversionName, since, productId ?? null, productId ?? null)

  const lines = [
    'Parameters:TimeZone=+0000',
    'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency',
  ]
  for (const r of rows) {
    lines.push([r.gclid, r.name, googleTime(r.created_at), r.amount.toFixed(2), currency].map(csvCell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}
