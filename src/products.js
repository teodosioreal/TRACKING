// Cadastro de produtos e o estado de cada etapa da configuração.
import { randomBytes } from 'node:crypto'
import { getSetting } from './db.js'

export const PLATFORMS = { buygoods: 'BuyGoods' }
const PID_RE = /^p[a-z0-9]{8}$/

export function isValidPid(pid) {
  return typeof pid === 'string' && PID_RE.test(pid)
}

function newPid() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return 'p' + [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]).join('')
}

// Valida o formulário. Devolve { values } ou { errors }.
export function parseProductForm(form) {
  const name = String(form.get('name') || '').trim()
  const platform = String(form.get('platform') || 'buygoods')
  const conversionName = String(form.get('conversion_name') || '').trim()
  const reviewUrl = String(form.get('review_url') || '').trim()
  const errors = {}

  if (!name) errors.name = 'Dê um nome para o produto.'
  else if (name.length > 100) errors.name = 'Nome muito longo.'
  if (!PLATFORMS[platform]) errors.platform = 'Plataforma inválida.'
  if (!conversionName) errors.conversion_name = 'Informe o nome da conversão do Google Ads.'
  else if (conversionName.length > 100) errors.conversion_name = 'Nome muito longo.'
  if (reviewUrl) {
    try {
      const u = new URL(reviewUrl)
      if (!/^https?:$/.test(u.protocol)) throw new Error()
    } catch {
      errors.review_url = 'Endereço inválido. Exemplo: https://meusite.com/produto-review'
    }
  }
  const values = { name, platform, conversion_name: conversionName, review_url: reviewUrl || null }
  return Object.keys(errors).length ? { errors, values } : { values }
}

export function createProduct(db, values, now = new Date()) {
  const id = newPid()
  db.prepare(
    `INSERT INTO products (id, name, platform, conversion_name, review_url, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, values.name, values.platform, values.conversion_name, values.review_url, now.toISOString())
  return id
}

export function updateProduct(db, id, values) {
  db.prepare(`UPDATE products SET name = ?, platform = ?, conversion_name = ?, review_url = ? WHERE id = ?`).run(
    values.name,
    values.platform,
    values.conversion_name,
    values.review_url,
    id,
  )
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
              (SELECT COUNT(*) FROM clicks c WHERE c.product_id = p.id AND c.is_test = 0) AS visitas,
              (SELECT COUNT(*) FROM conversions v JOIN clicks c ON c.id = v.subid
                WHERE c.product_id = p.id AND v.status = 'approved') AS vendas,
              (SELECT COALESCE(SUM(v.amount), 0) FROM conversions v JOIN clicks c ON c.id = v.subid
                WHERE c.product_id = p.id AND v.status = 'approved') AS comissao
         FROM products p WHERE p.archived = ? ORDER BY p.created_at DESC`,
    )
    .all(archived ? 1 : 0)
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
  const anyPostback = db
    .prepare(`SELECT created_at FROM conversions WHERE status != 'test' ORDER BY created_at DESC LIMIT 1`)
    .get()
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
  }
}
