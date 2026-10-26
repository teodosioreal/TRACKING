// Cadastro de produtos e o estado de cada etapa da configuração.
import { randomBytes } from 'node:crypto'
import { getSetting } from './db.js'

export const PLATFORMS = { buygoods: 'BuyGoods', outra: 'Outra plataforma' }
// Parâmetro do link de afiliado que leva o ID da visita, por plataforma.
export const DEFAULT_PARAM = { buygoods: 'subid', outra: 'subid' }
const PARAM_RE = /^[A-Za-z0-9_]{1,30}$/

export function trackingParam(product) {
  return product?.tracking_param || DEFAULT_PARAM[product?.platform] || 'subid'
}
const PID_RE = /^p[a-z0-9]{8}$/

export function isValidPid(pid) {
  return typeof pid === 'string' && PID_RE.test(pid)
}

function newPid() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return 'p' + [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('')
}

// Nome da ação de conversão do Google Ads. Devolve a mensagem de erro ou null.
export function conversionNameError(name) {
  if (!name) return 'Informe o nome da conversão do Google Ads.'
  if (name.length > 100) return 'Nome muito longo.'
  return null
}

// Valida o formulário. Devolve { values } ou { errors }.
export function parseProductForm(form) {
  const name = String(form.get('name') || '').trim()
  const platform = String(form.get('platform') || 'buygoods')
  const conversionName = String(form.get('conversion_name') || '').trim()
  const reviewUrl = String(form.get('review_url') || '').trim()
  const affiliateUrl = String(form.get('affiliate_url') || '').trim()
  const param = String(form.get('tracking_param') || '').trim()
  const errors = {}

  if (!name) errors.name = 'Dê um nome para o produto.'
  else if (name.length > 100) errors.name = 'Nome muito longo.'
  if (!PLATFORMS[platform]) errors.platform = 'Plataforma inválida.'
  if (param && !PARAM_RE.test(param)) errors.tracking_param = 'Use só letras, números e _ (ex.: subid, tid, sck).'
  if (conversionNameError(conversionName)) errors.conversion_name = conversionNameError(conversionName)
  if (reviewUrl) {
    try {
      const u = new URL(reviewUrl)
      if (!/^https?:$/.test(u.protocol)) throw new Error()
    } catch {
      errors.review_url = 'Endereço inválido. Exemplo: https://meusite.com/produto-review'
    }
  }
  if (affiliateUrl) {
    try {
      const u = new URL(affiliateUrl)
      if (!/^https?:$/.test(u.protocol)) throw new Error()
    } catch {
      errors.affiliate_url = 'Link inválido. Cole o link de afiliado completo, começando com https://'
    }
  }
  const values = {
    name,
    platform,
    conversion_name: conversionName,
    review_url: reviewUrl || null,
    affiliate_url: affiliateUrl || null,
    // Vazio ou igual ao padrão da plataforma: guarda nulo e segue o padrão.
    tracking_param: param && param !== DEFAULT_PARAM[platform] ? param : null,
  }
  return Object.keys(errors).length ? { errors, values } : { values }
}

export function createProduct(db, values, now = new Date()) {
  const id = newPid()
  db.prepare(
    `INSERT INTO products (id, name, platform, conversion_name, review_url, affiliate_url, tracking_param, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    values.name,
    values.platform,
    values.conversion_name,
    values.review_url,
    values.affiliate_url,
    values.tracking_param,
    now.toISOString(),
  )
  return id
}

export function updateProduct(db, id, values) {
  db.prepare(
    `UPDATE products SET name = ?, platform = ?, conversion_name = ?, review_url = ?, affiliate_url = ?, tracking_param = ?
      WHERE id = ?`,
  ).run(values.name, values.platform, values.conversion_name, values.review_url, values.affiliate_url, values.tracking_param, id)
}

export function setConversionName(db, id, name) {
  db.prepare('UPDATE products SET conversion_name = ? WHERE id = ?').run(name, id)
}

export function setArchived(db, id, archived) {
  db.prepare('UPDATE products SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
}

export function getProduct(db, id) {
  if (!isValidPid(id)) return null
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) || null
}

export function listProducts(db, { archived = false } = {}) {
  return db
    .prepare(
      `SELECT p.*,
              (SELECT updated_at FROM product_images i WHERE i.product_id = p.id) AS image_at,
              (SELECT COUNT(*) FROM clicks c WHERE c.product_id = p.id AND c.is_test = 0) AS visitas,
              (SELECT COUNT(*) FROM conversions v JOIN clicks c ON c.id = v.subid
                WHERE c.product_id = p.id AND v.status = 'approved') AS vendas,
              (SELECT COALESCE(SUM(v.amount), 0) FROM conversions v JOIN clicks c ON c.id = v.subid
                WHERE c.product_id = p.id AND v.status = 'approved') AS comissao
         FROM products p WHERE p.archived = ? ORDER BY p.created_at DESC`,
    )
    .all(archived ? 1 : 0)
}

const IMAGE_TYPES = { 'image/png': true, 'image/jpeg': true, 'image/webp': true }
export const MAX_IMAGE_BYTES = 1_500_000

// Recebe "data:image/...;base64,..." (o painel já reduz a imagem antes de enviar).
export function saveImage(db, id, dataUrl, now = new Date()) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m || !IMAGE_TYPES[m[1]]) return 'Formato inválido. Use PNG, JPG ou WEBP.'
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length) return 'Imagem vazia.'
  if (buf.length > MAX_IMAGE_BYTES) return 'Imagem grande demais (máximo 1,5 MB).'
  db.prepare(
    `INSERT INTO product_images (product_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`,
  ).run(id, m[1], buf, now.toISOString())
  return null
}

// Domínio do link de afiliado (sem www.), para o script reconhecer o botão de compra.
export function affiliateHost(product) {
  try {
    return product?.affiliate_url ? new URL(product.affiliate_url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

export function getImage(db, id) {
  return db.prepare('SELECT mime, data, updated_at FROM product_images WHERE product_id = ?').get(id) || null
}

export function removeImage(db, id) {
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id)
}

// Porcentagem da configuração: cada etapa que depende de você vale igual.
export function setupProgress(st) {
  const steps = [
    { key: 'script', label: 'Script instalado', done: Boolean(st.ping) },
    { key: 'links', label: 'Links de compra marcados', done: Boolean(st.ping && st.ping.links > 0) },
    { key: 'postback', label: 'Postback da BuyGoods', done: Boolean(st.lastRealSale || st.anyPostback) },
    { key: 'planilha', label: 'Google Ads lendo a planilha', done: Boolean(st.csvFetch) },
    { key: 'google', label: 'Visita vinda do anúncio', done: Boolean(st.lastGoogleVisit) },
  ]
  const done = steps.filter((s) => s.done).length
  return { pct: Math.round((done / steps.length) * 100), done, total: steps.length, steps }
}

// Estado de cada etapa, usado no checklist da página do produto.
export function productStatus(db, product) {
  const lastVisit = db
    .prepare(`SELECT created_at, gclid, landing_url FROM clicks WHERE product_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(product.id)
  const lastGoogleVisit = db
    .prepare(
      `SELECT created_at FROM clicks WHERE product_id = ? AND gclid IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    )
    .get(product.id)
  const lastSale = db
    .prepare(
      `SELECT v.created_at, v.status, v.amount FROM conversions v JOIN clicks c ON c.id = v.subid
        WHERE c.product_id = ? ORDER BY v.created_at DESC LIMIT 1`,
    )
    .get(product.id)
  const lastRealSale = db
    .prepare(
      `SELECT v.created_at FROM conversions v JOIN clicks c ON c.id = v.subid
        WHERE c.product_id = ? AND v.status IN ('approved','refunded') ORDER BY v.created_at DESC LIMIT 1`,
    )
    .get(product.id)
  const anyPostback = lastPostbackSignal(db)
  const pendingForGoogle = db
    .prepare(
      `SELECT COUNT(*) AS n FROM conversions v JOIN clicks c ON c.id = v.subid
        WHERE c.product_id = ? AND v.status = 'approved' AND c.gclid IS NOT NULL`,
    )
    .get(product.id).n

  return {
    ping: product.last_ping_at
      ? { at: product.last_ping_at, url: product.last_ping_url, links: product.last_ping_links }
      : null,
    lastTestAt: product.last_test_at,
    lastVisit: lastVisit || null,
    lastGoogleVisit: lastGoogleVisit || null,
    lastSale: lastSale || null,
    lastRealSale: lastRealSale || null,
    anyPostback: anyPostback || null,
    salesForGoogle: pendingForGoogle,
    csvFetch: getSetting(db, `csv_fetch:${product.id}`) || getSetting(db, 'csv_fetch:all'),
    scriptReport: getSetting(db, 'script_report'),
  }
}

// Últimos postbacks recebidos (de qualquer produto), para conferir o que a
// BuyGoods está mandando.
export function recentPostbacks(db, limit = 10) {
  return db
    .prepare(
      `SELECT v.id, v.created_at, v.type, v.order_id, v.amount, v.status, v.subid, v.product AS codename,
              p.name AS produto, c.id AS visita
         FROM conversions v LEFT JOIN clicks c ON c.id = v.subid LEFT JOIN products p ON p.id = c.product_id
        ORDER BY v.created_at DESC, v.id DESC LIMIT ?`,
    )
    .all(limit)
}

// Último sinal de que o postback está chegando: uma venda real ou um teste
// disparado pela própria plataforma. Devolve { created_at } ou null.
export function lastPostbackSignal(db) {
  const real = db
    .prepare(`SELECT created_at FROM conversions WHERE status != 'test' ORDER BY created_at DESC LIMIT 1`)
    .get()
  const test = getSetting(db, 'postback_test')
  const times = [real?.created_at, test?.at].filter(Boolean).sort()
  return times.length ? { created_at: times.at(-1) } : null
}

// Último postback recebido pela URL (venda, reembolso ou teste da plataforma),
// para o aviso ao vivo do painel.
export function lastPostbackEvent(db) {
  return getSetting(db, 'postback_last')
}

// Corrige uma venda que na verdade era teste: sai dos totais e da planilha.
export function markConversionAsTest(db, id) {
  return db.prepare(`UPDATE conversions SET status = 'test' WHERE id = ? AND status = 'approved'`).run(id).changes > 0
}

// Exclui o produto, a imagem, as visitas dele e as vendas ligadas a essas
// visitas. Não tem volta.
export function deleteProduct(db, id) {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM conversions WHERE subid IN (SELECT id FROM clicks WHERE product_id = ?)').run(id)
    db.prepare('DELETE FROM clicks WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM product_images WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM settings WHERE key = ?').run(`csv_fetch:${id}`)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Exclui uma venda/postback (ex.: teste que entrou como venda).
export function deleteConversion(db, id) {
  return db.prepare('DELETE FROM conversions WHERE id = ?').run(id).changes > 0
}
