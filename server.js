import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openDb, getSetting, setSetting } from './src/db.js'
import { recordClick, recordOutbound, recordPing, recordPostback, exportGoogleAdsCsv, pageKey } from './src/tracking.js'
import { dashboard, timeSeries, visitors, salesList, originBreakdown, PERIODS } from './src/stats.js'
import { checkHttps } from './src/health.js'
import { parseScriptReport } from './src/report.js'
import { runDiagnostics } from './src/diagnostics.js'
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
  productPages,
  pagePings,
  lastPostbackEvent,
  lastPostbackSignal,
  deleteConversion,
  deleteProduct,
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
  visitorsPage,
  salesPage,
  ORIGIN_FILTERS,
  loginPage,
  diagnosticsPage,
} from './src/views.js'
import { SOURCES } from './src/source.js'
import { readVersion } from './src/version.js'
import { COOKIE, sessionManager, readCookie, sessionCookie, safeNext, loginLimiter } from './src/session.js'

const here = dirname(fileURLToPath(import.meta.url))
if (existsSync(join(here, '.env'))) process.loadEnvFile(join(here, '.env'))

const cfg = {
  port: Number(process.env.PORT || 3101),
  // Só a própria máquina: o Nginx fica na frente. Use 0.0.0.0 para abrir para fora.
  host: process.env.HOST || '127.0.0.1',
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
const adsScript = readFileSync(join(here, 'deploy', 'google-ads-script.js'), 'utf8')
const adsScriptFor = (base) =>
  adsScript
    .replace('__PLANILHA__', `${base}/google-ads.csv?key=${cfg.secretKey}&dias=3`)
    .replace('__RELATORIO__', `${base}/script-relatorio?key=${cfg.secretKey}`)

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
const redirect = (res, to, headers = {}) => send(res, 303, '', 'text/plain', { Location: to, ...headers })

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

const sessions = sessionManager({ secretKey: cfg.secretKey, user: cfg.adminUser, password: cfg.adminPassword })
const limiter = loginLimiter()

function isAdmin(req) {
  return sessions.valid(readCookie(req, COOKIE))
}

// Cookie "Secure" quando o painel é acessado por HTTPS (o Nginx avisa pelo
// X-Forwarded-Proto) ou o PUBLIC_URL é https.
const secureCookie = (req) => req.headers['x-forwarded-proto'] === 'https' || cfg.publicUrl.startsWith('https://')

async function handleLogin(req, res, url) {
  if (url.pathname === '/login' && req.method === 'GET') {
    if (isAdmin(req)) redirect(res, safeNext(url.searchParams.get('next')))
    else html(res, loginPage({ next: safeNext(url.searchParams.get('next')) }))
    return true
  }
  if (url.pathname === '/login' && req.method === 'POST') {
    const ip = clientIp(req)
    const form = new URLSearchParams(await readBody(req, 4096))
    const next = safeNext(form.get('next'))
    if (!sameOrigin(req)) {
      send(res, 403, 'origem inválida')
      return true
    }
    if (limiter.blocked(ip)) {
      html(res, loginPage({ next, error: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }), 429)
      return true
    }
    if (safeEqual(form.get('user') || '', cfg.adminUser) && safeEqual(form.get('password') || '', cfg.adminPassword)) {
      limiter.reset(ip)
      redirect(res, next, { 'Set-Cookie': sessionCookie(sessions.create(), { secure: secureCookie(req) }) })
      return true
    }
    limiter.fail(ip)
    console.log(`[login] falhou para ${ip}`)
    html(res, loginPage({ next, error: 'Usuário ou senha incorretos.' }), 401)
    return true
  }
  if (url.pathname === '/sair' && req.method === 'POST') {
    redirect(res, '/login', { 'Set-Cookie': sessionCookie('', { secure: secureCookie(req), maxAge: 0 }) })
    return true
  }
  return false
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
    // "dias" encurta a janela (o script do Google Ads usa 3 para não reenviar 30 dias toda hora).
    let dias = Number.parseInt(url.searchParams.get('dias'), 10)
    // "Reenviar últimos 30 dias" (Diagnóstico): a próxima leitura do script
    // traz a janela inteira uma vez.
    if (!admin && getSetting(db, 'reenviar')) {
      dias = cfg.exportDays
      setSetting(db, 'reenviar', false)
      console.log('[planilha] reenvio da janela inteira entregue ao script')
    }
    const csv = exportGoogleAdsCsv(db, {
      conversionName: defaultConversion(),
      currency: cfg.currency,
      days: dias >= 1 && dias <= 90 ? dias : cfg.exportDays,
      productId: pid || null,
    })
    // Leitura feita pelo Google Ads (não por você no navegador logado).
    if (!admin) {
      const at = new Date().toISOString()
      setSetting(db, `csv_fetch:${pid || 'all'}`, { at, ua: req.headers['user-agent'] || '' })
      // Histórico das leituras: o Diagnóstico usa para ver se cada venda foi lida.
      setSetting(db, 'csv_fetch_log', [...(getSetting(db, 'csv_fetch_log') || []), at].slice(-500))
    }
    send(res, 200, method === 'HEAD' ? '' : csv, 'text/csv; charset=utf-8', {
      'Content-Disposition': 'inline; filename="google-ads-conversoes.csv"',
    })
    return true
  }

  // O script do Google Ads conta quantas vendas enviou (ou o erro).
  if (path === '/script-relatorio' && method === 'POST') {
    if (!safeEqual(url.searchParams.get('key') || '', cfg.secretKey)) {
      send(res, 403, 'chave inválida')
      return true
    }
    const report = parseScriptReport(await readBody(req))
    if (!report) {
      send(res, 400, 'relatório inválido')
      return true
    }
    setSetting(db, 'script_report', report)
    console.log(`[script] ${report.erro ? `erro: ${report.erro}` : `${report.enviadas} venda(s) enviada(s)`}${report.conta ? ` conta=${report.conta.id}` : ''}`)
    send(res, 200, 'ok')
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
        origins: originBreakdown(db, period, cfg.tz, now, product?.id),
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
        flash: url.searchParams.get('ok') === 'excluido' ? 'Produto excluído.' : null,
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
        pings: tab === 'script' ? pagePings(db, product.id) : [],
        ...extra,
      })
    }

    if (!action && method === 'GET') {
      const tab = PRODUCT_TABS[url.searchParams.get('aba')] ? url.searchParams.get('aba') : 'status'
      return html(res, renderProduct(tab, { adsScript: adsScriptFor(baseUrl(req)) }))
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
      // Com ?pagina=, o sinal daquela página; sem, o último sinal de qualquer página.
      const key = pageKey(url.searchParams.get('pagina') || '')
      const ping = key ? db.prepare('SELECT last_at, links FROM page_pings WHERE product_id = ? AND page = ?').get(product.id, key) : null
      const body = key
        ? { pingAt: ping?.last_at || null, links: ping?.links ?? null, https: getHealth() }
        : { pingAt: product.last_ping_at, links: product.last_ping_links, https: getHealth() }
      return send(res, 200, JSON.stringify(body), 'application/json; charset=utf-8')
    }

    if (action === 'verificar' && method === 'GET') {
      // Só verifica páginas cadastradas no produto (não vira um "abrir qualquer URL").
      const pages = productPages(product)
      const wanted = url.searchParams.get('pagina')
      const page = pages.includes(wanted) ? wanted : pages[0]
      const r = await checkPage({ ...product, review_url: page }, fetch, cfg.publicUrl.replace(/^https?:\/\//, ''))
      return send(res, 200, JSON.stringify({ html: r }), 'application/json; charset=utf-8')
    }

    if (action === 'conversao' && method === 'POST') {
      const name = String(new URLSearchParams(await readBody(req)).get('conversion_name') || '').trim()
      if (conversionNameError(name)) return go('google', 'erro=conversao-invalida')
      setConversionName(db, product.id, name)
      return go('google', 'ok=conversao')
    }

    if (action === 'excluir' && method === 'POST') {
      deleteProduct(db, product.id)
      return redirect(res, '/produtos?ok=excluido')
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

  // Período/produto comuns às páginas de listas.
  const listFilters = () => ({
    period: PERIODS[url.searchParams.get('periodo')] ? url.searchParams.get('periodo') : '7d',
    product: getProduct(db, url.searchParams.get('produto')),
  })

  if (path === '/visitantes' && method === 'GET') {
    const { period, product } = listFilters()
    const source = SOURCES[url.searchParams.get('origem')] ? url.searchParams.get('origem') : null
    const rows = visitors(db, { period, tz: cfg.tz, productId: product?.id, source })
    return html(
      res,
      visitorsPage(rows, {
        period,
        tz: cfg.tz,
        currency: cfg.currency,
        products: listProducts(db),
        productId: product?.id || null,
        source,
        live: url.searchParams.get('ao_vivo') === '1',
      }),
    )
  }

  if (path === '/vendas' && method === 'GET') {
    const { period, product } = listFilters()
    const origin = ORIGIN_FILTERS[url.searchParams.get('origem')] ? url.searchParams.get('origem') : null
    const tests = url.searchParams.get('testes') === '1'
    const rows = salesList(db, { period, tz: cfg.tz, productId: product?.id, origin, includeTests: tests })
    return html(
      res,
      salesPage(rows, {
        period,
        tz: cfg.tz,
        currency: cfg.currency,
        products: listProducts(db),
        productId: product?.id || null,
        origin,
        tests,
      }),
    )
  }

  const mv = path.match(/^\/vendas\/(\d+)\/excluir$/)
  if (mv && method === 'POST') {
    deleteConversion(db, Number(mv[1]))
    const back = new URL(req.headers.referer || '/vendas', 'http://x')
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
        scriptReport: getSetting(db, 'script_report'),
        tz: cfg.tz,
        adsScript: adsScriptFor(baseUrl(req)),
      }),
    )
  }

  if (path === '/diagnostico' && method === 'GET') {
    const d = runDiagnostics(db, { health: getHealth(), exportDays: cfg.exportDays, defaultConversion: defaultConversion() })
    return html(res, diagnosticsPage(d, { resendPending: Boolean(getSetting(db, 'reenviar')), flash: url.searchParams.has('ok') }))
  }

  if (path === '/diagnostico/reenviar' && method === 'POST') {
    setSetting(db, 'reenviar', true)
    return redirect(res, '/diagnostico?ok=1')
  }

  // Endereço antigo.
  if (path === '/configurar') return redirect(res, '/configuracoes')

  return send(res, 404, 'não encontrado')
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  if (await handlePublic(req, res, url)) return
  if (await handleLogin(req, res, url)) return
  if (!isAdmin(req)) {
    // Navegação normal vai para a tela de login; chamadas internas (fetch) recebem 401.
    if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
      return redirect(res, `/login?next=${encodeURIComponent(url.pathname + url.search)}`)
    }
    return send(res, 401, 'login necessário')
  }
  return handleAdmin(req, res, url)
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) send(res, 500, 'erro interno')
  })
}).listen(cfg.port, cfg.host, () => {
  setTimeout(refreshHealth, 3000).unref()
  console.log(`Tracking rodando em http://${cfg.host}:${cfg.port} (versão ${version.hash || 'desconhecida'})`)
})
