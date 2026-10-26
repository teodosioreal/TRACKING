import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openDb } from './src/db.js'
import { recordClick, recordOutbound, recordPostback, exportGoogleAdsCsv } from './src/tracking.js'
import { dashboard, PERIODS } from './src/stats.js'
import { dashboardPage, setupPage } from './src/views.js'

const here = dirname(fileURLToPath(import.meta.url))
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'))

const cfg = {
  port: Number(process.env.PORT || 3100),
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  secretKey: process.env.SECRET_KEY || '',
  conversionName: process.env.CONVERSION_NAME || 'Compra BuyGoods',
  currency: process.env.CURRENCY || 'USD',
  exportDays: Number(process.env.EXPORT_DAYS || 30),
  tz: process.env.DISPLAY_TZ || 'America/Sao_Paulo',
  dbPath: process.env.DB_PATH || join(here, 'dados', 'rastreador.db'),
}

if (!cfg.adminPassword || !cfg.secretKey) {
  console.error('Defina ADMIN_PASSWORD e SECRET_KEY no arquivo .env (veja .env.example).')
  process.exit(1)
}

const db = openDb(cfg.dbPath)
const trackerJs = readFileSync(join(here, 'public', 't.js'), 'utf8')

function safeEqual(a, b) {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

function baseUrl(req) {
  if (cfg.publicUrl) return cfg.publicUrl
  const proto = req.headers['x-forwarded-proto'] || 'http'
  return `${proto}://${req.headers.host}`
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim()
}

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

const CORS = { 'Access-Control-Allow-Origin': '*' }

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('corpo grande demais'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function isAdmin(req) {
  const h = req.headers.authorization || ''
  if (!h.startsWith('Basic ')) return false
  const [user, ...rest] = Buffer.from(h.slice(6), 'base64').toString().split(':')
  return safeEqual(user, cfg.adminUser) && safeEqual(rest.join(':'), cfg.adminPassword)
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  const method = req.method

  if (method === 'OPTIONS') {
    return send(res, 204, '', 'text/plain', { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type' })
  }

  // --- Público: script, visita, clique no botão ---
  if (path === '/t.js' && method === 'GET') {
    const js = trackerJs.replace('__BASE__', baseUrl(req))
    return send(res, 200, js, 'application/javascript; charset=utf-8', {
      ...CORS,
      'Cache-Control': 'public, max-age=300',
    })
  }

  if (path === '/c' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      recordClick(db, {
        cid: body.cid,
        url: body.url,
        referrer: body.ref,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      })
    } catch {}
    return send(res, 204, '', 'text/plain', CORS)
  }

  if (path === '/o' && method === 'POST') {
    try {
      recordOutbound(db, (await readBody(req, 200)).trim())
    } catch {}
    return send(res, 204, '', 'text/plain', CORS)
  }

  // --- Protegido por chave: postback da BuyGoods e planilha do Google Ads ---
  if (path === '/postback' && (method === 'GET' || method === 'POST')) {
    let params = url.searchParams
    if (method === 'POST') {
      const body = await readBody(req)
      const merged = new URLSearchParams(params)
      for (const [k, v] of new URLSearchParams(body)) if (!merged.has(k)) merged.set(k, v)
      params = merged
    }
    if (!safeEqual(params.get('key') || '', cfg.secretKey)) return send(res, 403, 'chave inválida')
    params.delete('key')
    const r = recordPostback(db, params)
    console.log(
      `[postback] ${r.duplicate ? 'duplicado' : r.refund ? 'reembolso' : 'venda'} pedido=${r.orderId} subid=${r.subid} valor=${r.amount} tipo=${r.type}`,
    )
    return send(res, 200, 'ok')
  }

  if (path === '/google-ads.csv' && (method === 'GET' || method === 'HEAD')) {
    if (!safeEqual(url.searchParams.get('key') || '', cfg.secretKey) && !isAdmin(req)) {
      return send(res, 403, 'chave inválida')
    }
    const csv = exportGoogleAdsCsv(db, {
      conversionName: cfg.conversionName,
      currency: cfg.currency,
      days: cfg.exportDays,
    })
    return send(res, 200, method === 'HEAD' ? '' : csv, 'text/csv; charset=utf-8', {
      'Content-Disposition': 'inline; filename="google-ads-conversoes.csv"',
    })
  }

  if (path === '/saude') return send(res, 200, 'ok')

  // --- Painel ---
  if (!isAdmin(req)) {
    return send(res, 401, 'login necessário', 'text/plain; charset=utf-8', {
      'WWW-Authenticate': 'Basic realm="Rastreador", charset="UTF-8"',
    })
  }

  if (path === '/' && method === 'GET') {
    const period = PERIODS[url.searchParams.get('periodo')] ? url.searchParams.get('periodo') : 'hoje'
    const data = dashboard(db, period, cfg.tz)
    return send(res, 200, dashboardPage(data, { period, tz: cfg.tz, currency: cfg.currency }), 'text/html; charset=utf-8')
  }

  if (path === '/configurar' && method === 'GET') {
    const html = setupPage({
      base: baseUrl(req),
      key: cfg.secretKey,
      conversionName: cfg.conversionName,
      currency: cfg.currency,
      days: cfg.exportDays,
    })
    return send(res, 200, html, 'text/html; charset=utf-8')
  }

  return send(res, 404, 'não encontrado')
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) send(res, 500, 'erro interno')
  })
}).listen(cfg.port, () => {
  console.log(`Rastreador rodando em http://localhost:${cfg.port}`)
})
