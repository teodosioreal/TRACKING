import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openDb, getSetting, setSetting } from './src/db.js'
import { recordClick, recordOutbound, recordPing, recordPostback, exportGoogleAdsCsv } from './src/tracking.js'
import { dashboard, timeSeries, PERIODS } from './src/stats.js'
import { checkHttps } from './src/health.js'
import {
  isValidPid,
  parseProductForm,
  createProduct,
  updateProduct,
  setArchived,
  setConversionName,
  conversionNameError,
  getProduct,
  listProducts,
  productStatus,
  affiliateHost,
  trackingParam,
  saveImage,
  getImage,
  removeImage,
  setupProgress,
  recentPostbacks,
  lastPostbackEvent,
  lastPostbackSignal,
  markConversionAsTest,
  MAX_IMAGE_BYTES,
} from './src/products.js'
import { checkPage } from './src/verify.js'
import {
  dashboardPage,
  productsPage,
  productFormPage,
  productPage,
  checklistHtml,
  settingsPage,
  setAppInfo,
  setHealth,
  getHealth,
  TABS,
  PRODUCT_TABS,
} from './src/views.js'
import { readVersion } from './src/version.js'

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
const version = readVersion(here)
setAppInfo({ version, tz: cfg.tz, publicUrl: cfg.publicUrl })

// Confere o HTTPS público de tempos em tempos: a cada minuto enquanto estiver
// com problema, a cada 10 minutos quando estiver tudo certo.
async function refreshHealth() {
  let h = null
  try {
    h = await checkHttps(cfg.publicUrl)
    setHealth(h)
    if (h && !h.ok) console.log(`[https] problema: ${h.reason}`)
  } catch (err) {
    console.error(err)
  }
  setTimeout(refreshHealth, h && !h.ok ? 60e3 : 10 * 60e3).unref()
}
const trackerJs = readFileSync(join(here, 'public', 't.js'), 'utf8')

// Nome usado nas vendas cujas visitas não têm produto. Editável em Configurações;
// o CONVERSION_NAME do .env é só o valor inicial.
const defaultConversion = () => getSetting(db, 'default_conversion_name') || cfg.conversionName

const FLASH = {
  criado: 'Produto cadastrado. Agora copie o script abaixo e cole na página de review.',
  salvo: 'Alterações salvas.',
  conversao: 'Nome da conversão salvo. Use exatamente este nome no Google Ads.',
  'conversao-invalida': 'Nome da conversão inválido: não pode ficar vazio nem passar de 100 caracteres.',
  arquivado: 'Produto arquivado.',
  reativado: 'Produto reativado.',
  teste: 'Venda de teste registrada e ligada a este produto. Ela não vai para o Google Ads.',
  'sem-visita': 'Ainda não há visita deste produto. Clique em "Testar instalação" (aba Script) primeiro e depois simule a venda.',
  'imagem-removida': 'Imagem removida.',
}

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

const html = (res, body, status = 200) => send(res, status, body, 'text/html; charset=utf-8')
const redirect = (res, to) => send(res, 303, '', 'text/plain', { Location: to })

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

// Formulários do painel só podem vir do próprio painel.
function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

async function handlePublic(req, res, url) {
  const { pathname: path } = url
  const method = req.method

  if (method === 'OPTIONS') {
    send(res, 204, '', 'text/plain', { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type' })
    return true
  }

  if (path === '/t.js' && method === 'GET') {
    const pid = url.searchParams.get('p')
    const product = isValidPid(pid) ? getProduct(db, pid) : null
    const js = trackerJs
      .replace('__BASE__', baseUrl(req))
      .replace('__PRODUCT__', product ? product.id : '')
      .replace('__DOMAINS__', affiliateHost(product))
      .replace('__PARAM__', product ? trackingParam(product) : '')
    send(res, 200, js, 'application/javascript; charset=utf-8', { ...CORS, 'Cache-Control': 'public, max-age=300' })
    return true
  }

  if (path === '/c' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      recordClick(db, {
        cid: body.cid,
        pid: body.pid,
        test: body.test === true,
        url: body.url,
        referrer: body.ref,
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
      })
    } catch {}
    send(res, 204, '', 'text/plain', CORS)
    return true
  }

  if (path === '/o' && method === 'POST') {
    try {
      recordOutbound(db, (await readBody(req, 200)).trim())
    } catch {}
    send(res, 204, '', 'text/plain', CORS)
    return true
  }

  if (path === '/p' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req))
      recordPing(db, { pid: body.pid, url: body.url, links: body.links, test: body.test === true })
    } catch {}
    send(res, 204, '', 'text/plain', CORS)
    return true
  }

  if (path === '/postback' && (method === 'GET' || method === 'POST')) {
    let params = url.searchParams
    if (method === 'POST') {
      const body = await readBody(req)
      const merged = new URLSearchParams(params)
      for (const [k, v] of new URLSearchParams(body)) if (!merged.has(k)) merged.set(k, v)
      params = merged
    }
    if (!safeEqual(params.get('key') || '', cfg.secretKey)) {
      send(res, 403, 'chave inválida')
      return true
    }
    params.delete('key')
    const r = recordPostback(db, params)
    const event = {
      at: new Date().toISOString(),
      kind: r.test ? 'teste' : r.refund ? 'reembolso' : 'venda',
      duplicate: r.duplicate,
      // O que a plataforma mandou, sem a chave.
      params: Object.fromEntries([...params].map(([k, v]) => [k, String(v).slice(0, 200)]).slice(0, 20)),
    }
    setSetting(db, 'postback_last', event)
    if (r.test) setSetting(db, 'postback_test', event)
    console.log(
      `[postback] ${r.duplicate ? 'duplicado' : r.refund ? 'reembolso' : r.test ? 'teste' : 'venda'} pedido=${r.orderId} subid=${r.subid} valor=${r.amount} tipo=${r.type}`,
    )
    send(res, 200, 'ok')
    return true
  }

  if (path === '/google-ads.csv' && (method === 'GET' || method === 'HEAD')) {
    const admin = isAdmin(req)
    if (!safeEqual(url.searchParams.get('key') || '', cfg.secretKey) && !admin) {
      send(res, 403, 'chave inválida')
      return true
    }
    const pid = url.searchParams.get('produto')
    if (pid && !getProduct(db, pid)) {
      send(res, 404, 'produto não encontrado')
      return true
    }
    const csv = exportGoogleAdsCsv(db, {
      conversionName: defaultConversion(),
      currency: cfg.currency,
      days: cfg.exportDays,
      productId: pid || null,
    })
    // Leitura feita pelo Google Ads (não por você no navegador logado).
    if (!admin) {
      setSetting(db, `csv_fetch:${pid || 'all'}`, { at: new Date().toISOString(), ua: req.headers['user-agent'] || '' })
    }
    send(res, 200, method === 'HEAD' ? '' : csv, 'text/csv; charset=utf-8', {
      'Content-Disposition': 'inline; filename="google-ads-conversoes.csv"',
    })
    return true
  }

  if (path === '/saude') {
    send(res, 200, 'ok')
    return true
  }
  return false
}

async function handleAdmin(req, res, url) {
  const { pathname: path } = url
  const method = req.method

  if (method === 'POST' && !sameOrigin(req)) return send(res, 403, 'origem inválida')

  if (path === '/' && method === 'GET') {
    const period = PERIODS[url.searchParams.get('periodo')] ? url.searchParams.get('periodo') : 'hoje'
    const product = getProduct(db, url.searchParams.get('produto'))
    const tab = TABS[url.searchParams.get('aba')] ? url.searchParams.get('aba') : 'campanhas'
    const now = new Date()
    const data = dashboard(db, period, cfg.tz, now, product?.id)
    return html(
      res,
      dashboardPage(data, {
        period,
        tz: cfg.tz,
        currency: cfg.currency,
        products: listProducts(db),
        productId: product?.id || null,
        series: timeSeries(db, period, cfg.tz, now, product?.id),
        tab,
      }),
    )
  }

  if (path === '/produtos' && method === 'GET') {
    const showArchived = url.searchParams.has('arquivados')
    const products = listProducts(db, { archived: showArchived }).map((p) => ({
      ...p,
      progress: setupProgress(productStatus(db, p)),
    }))
    return html(
      res,
      productsPage(products, {
        currency: cfg.currency,
        archivedCount: listProducts(db, { archived: true }).length,
        showArchived,
      }),
    )
  }

  if (path === '/produtos/novo' && method === 'GET') {
    return html(res, productFormPage({ values: { platform: 'buygoods' }, defaultConversion: 'Compra - Nome do produto' }))
  }

  if (path === '/produtos' && method === 'POST') {
    const form = new URLSearchParams(await readBody(req))
    const { values, errors } = parseProductForm(form)
    if (errors) return html(res, productFormPage({ values, errors, defaultConversion: 'Compra - Nome do produto' }), 400)
    const id = createProduct(db, values)
    return redirect(res, `/produtos/${id}?aba=script&ok=criado`)
  }

  const m = path.match(/^\/produtos\/(p[a-z0-9]{8})(?:\/([a-z-]+(?:\/[a-z-]+)?))?$/)
  if (m) {
    const product = getProduct(db, m[1])
    if (!product) return send(res, 404, 'produto não encontrado')
    const action = m[2] || ''
    const go = (tab, q) => redirect(res, `/produtos/${product.id}?aba=${tab}&${q}`)

    const renderProduct = (tab, extra = {}) => {
      const st = productStatus(db, product)
      const flashKey = url.searchParams.get('ok') || url.searchParams.get('erro')
      const flash = FLASH[flashKey] ? { text: FLASH[flashKey], bad: url.searchParams.has('erro') } : null
      const totals = listProducts(db, { archived: Boolean(product.archived) }).find((p) => p.id === product.id) || {
        visitas: 0,
        vendas: 0,
        comissao: 0,
      }
      const img = getImage(db, product.id)
      return productPage(product, st, {
        base: baseUrl(req),
        key: cfg.secretKey,
        tz: cfg.tz,
        currency: cfg.currency,
        flash,
        tab,
        progress: setupProgress(st),
        totals,
        postbacks: tab === 'buygoods' ? recentPostbacks(db, 10) : [],
        image: img ? { updated_at: img.updated_at } : null,
        ...extra,
      })
    }

    if (!action && method === 'GET') {
      const tab = PRODUCT_TABS[url.searchParams.get('aba')] ? url.searchParams.get('aba') : 'status'
      return html(res, renderProduct(tab))
    }

    if (!action && method === 'POST') {
      const form = new URLSearchParams(await readBody(req))
      const { values, errors } = parseProductForm(form)
      if (errors) return html(res, renderProduct('config', { errors, values }), 400)
      updateProduct(db, product.id, values)
      return go('config', 'ok=salvo')
    }

    if (action === 'editar' && method === 'GET') return redirect(res, `/produtos/${product.id}?aba=config`)

    if (action === 'imagem' && method === 'GET') {
      const img = getImage(db, product.id)
      if (!img) return send(res, 404, 'sem imagem')
      res.writeHead(200, { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=31536000, immutable' })
      return res.end(img.data)
    }

    if (action === 'imagem' && method === 'POST') {
      let data
      try {
        data = JSON.parse(await readBody(req, Math.ceil(MAX_IMAGE_BYTES * 1.4) + 1000)).data
      } catch {
        return send(res, 413, JSON.stringify({ error: 'Imagem grande demais (máximo 1,5 MB).' }), 'application/json; charset=utf-8')
      }
      const error = saveImage(db, product.id, data)
      return send(res, error ? 400 : 200, JSON.stringify(error ? { error } : { ok: true }), 'application/json; charset=utf-8')
    }

    if (action === 'imagem/remover' && method === 'POST') {
      removeImage(db, product.id)
      return go('config', 'ok=imagem-removida')
    }

    if (action === 'checklist' && method === 'GET') {
      return html(res, checklistHtml(product, productStatus(db, product), { tz: cfg.tz }))
    }

    if (action === 'sinal' && method === 'GET') {
      const body = { pingAt: product.last_ping_at, links: product.last_ping_links, https: getHealth() }
      return send(res, 200, JSON.stringify(body), 'application/json; charset=utf-8')
    }

    if (action === 'verificar' && method === 'GET') {
      const r = await checkPage(product, fetch, cfg.publicUrl.replace(/^https?:\/\//, ''))
      return send(res, 200, JSON.stringify({ html: r }), 'application/json; charset=utf-8')
    }

    if (action === 'conversao' && method === 'POST') {
      const name = String(new URLSearchParams(await readBody(req)).get('conversion_name') || '').trim()
      if (conversionNameError(name)) return go('google', 'erro=conversao-invalida')
      setConversionName(db, product.id, name)
      return go('google', 'ok=conversao')
    }

    if ((action === 'arquivar' || action === 'reativar') && method === 'POST') {
      setArchived(db, product.id, action === 'arquivar')
      return go('config', `ok=${action === 'arquivar' ? 'arquivado' : 'reativado'}`)
    }

    if (action === 'simular-venda' && method === 'POST') {
      const visit = db
        .prepare('SELECT id FROM clicks WHERE product_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(product.id)
      if (!visit) return go('buygoods', 'erro=sem-visita')
      recordPostback(
        db,
        new URLSearchParams({ subid: visit.id, order: `TESTE-${Date.now()}`, amount: '1.00', type: 'teste' }),
      )
      return go('buygoods', 'ok=teste')
    }
    return send(res, 404, 'não encontrado')
  }

  if (path === '/postbacks/ultimo' && method === 'GET') {
    return send(res, 200, JSON.stringify(lastPostbackEvent(db)), 'application/json; charset=utf-8')
  }

  const mt = path.match(/^\/postbacks\/(\d+)\/teste$/)
  if (mt && method === 'POST') {
    markConversionAsTest(db, Number(mt[1]))
    const back = new URL(req.headers.referer || '/configuracoes', 'http://x')
    return redirect(res, back.pathname + back.search)
  }

  if (path === '/configuracoes' && method === 'POST') {
    const name = String(new URLSearchParams(await readBody(req)).get('conversion_name') || '').trim()
    if (conversionNameError(name)) return redirect(res, '/configuracoes?erro=1')
    setSetting(db, 'default_conversion_name', name)
    return redirect(res, '/configuracoes?ok=1')
  }

  if (path === '/configuracoes' && method === 'GET') {
    const lastPostback = lastPostbackSignal(db)
    return html(
      res,
      settingsPage({
        base: baseUrl(req),
        key: cfg.secretKey,
        conversionName: defaultConversion(),
        currency: cfg.currency,
        days: cfg.exportDays,
        lastPostback,
        flash: url.searchParams.has('ok')
          ? { text: 'Nome padrão salvo.' }
          : url.searchParams.has('erro')
            ? { text: 'Nome inválido: não pode ficar vazio nem passar de 100 caracteres.', bad: true }
            : null,
        csvFetch: getSetting(db, 'csv_fetch:all'),
        tz: cfg.tz,
      }),
    )
  }

  // Endereço antigo.
  if (path === '/configurar') return redirect(res, '/configuracoes')

  return send(res, 404, 'não encontrado')
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  if (await handlePublic(req, res, url)) return
  if (!isAdmin(req)) {
    return send(res, 401, 'login necessário', 'text/plain; charset=utf-8', {
      'WWW-Authenticate': 'Basic realm="Tracking", charset="UTF-8"',
    })
  }
  return handleAdmin(req, res, url)
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) send(res, 500, 'erro interno')
  })
}).listen(cfg.port, () => {
  setTimeout(refreshHealth, 3000).unref()
  console.log(`Tracking rodando em http://localhost:${cfg.port} (versão ${version.hash || 'desconhecida'})`)
})
