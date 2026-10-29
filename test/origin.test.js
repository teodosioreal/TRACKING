import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifySource, uaInfo, parseCidrList, ipInCidr, isInternalIp } from '../src/source.js'
import { openDb } from '../src/db.js'
import { recordClick, recordPostback } from '../src/tracking.js'
import { visitors, salesList, originBreakdown, dashboard } from '../src/stats.js'
import { createProduct, parseProductForm, deleteProduct, deleteConversion, getProduct } from '../src/products.js'

const land = 'https://review.com/p'
const cidrs = ['160.238.0.0/16', '9.9.9.9']

test('origem da visita', () => {
  assert.equal(classifySource({ gclid: 'x', landing_url: land }), 'pago')
  assert.equal(classifySource({ utm_medium: 'cpc', landing_url: land }), 'pago_outro')
  assert.equal(classifySource({ referrer: 'https://www.google.com/', landing_url: land }), 'organico')
  assert.equal(classifySource({ referrer: 'https://duckduckgo.com/?q=x', landing_url: land }), 'organico')
  assert.equal(classifySource({ referrer: 'https://facebook.com/', landing_url: land }), 'referencia')
  assert.equal(classifySource({ referrer: 'https://review.com/outra', landing_url: land }), 'direto')
  assert.equal(classifySource({ landing_url: land }), 'direto')
  assert.equal(classifySource({ is_test: 1, gclid: 'x' }), 'teste')
})

test('origem: robô e interno, antes de pago (prioridade)', () => {
  // Robô: user-agent de bot, ou IP de crawler/AdsBot do Google.
  assert.equal(classifySource({ user_agent: 'Mozilla/5.0 (compatible; Googlebot/2.1)', landing_url: land }), 'robo')
  assert.equal(classifySource({ ip: '66.249.66.1', landing_url: land }), 'robo')
  assert.equal(classifySource({ ip: '209.85.1.1', landing_url: land }), 'robo')
  // Bot com gclid continua robô, não pago.
  assert.equal(classifySource({ user_agent: 'bot', gclid: 'x', landing_url: land }), 'robo')

  // Interno: IP em "Meus IPs", ou referrer ads.google.com (prévia do anúncio).
  assert.equal(classifySource({ ip: '160.238.5.1', landing_url: land }, cidrs), 'interno')
  assert.equal(classifySource({ ip: '9.9.9.9', landing_url: land }, cidrs), 'interno')
  assert.equal(classifySource({ ip: '160.239.0.1', landing_url: land }, cidrs), 'direto') // fora da faixa
  assert.equal(classifySource({ referrer: 'https://ads.google.com/aw/overview', landing_url: land }), 'interno')
  // IP interno com gclid continua interno, não pago.
  assert.equal(classifySource({ ip: '160.238.5.1', gclid: 'x', landing_url: land }, cidrs), 'interno')
})

test('origem: pago por gbraid/wbraid/utm_source=google', () => {
  assert.equal(classifySource({ gbraid: 'x', landing_url: land }), 'pago')
  assert.equal(classifySource({ wbraid: 'x', landing_url: land }), 'pago')
  assert.equal(classifySource({ utm_medium: 'cpc', utm_source: 'google', landing_url: land }), 'pago')
  assert.equal(classifySource({ utm_medium: 'ppc', utm_source: 'Google', landing_url: land }), 'pago')
  // utm_source=google sem medium pago não é "Pago Google".
  assert.equal(classifySource({ utm_source: 'google', landing_url: land }), 'direto')
})

test('parseCidrList valida IPs e faixas CIDR', () => {
  assert.deepEqual(parseCidrList('160.238.0.0/16, 1.2.3.4\n9.9.9.9/32'), {
    cidrs: ['160.238.0.0/16', '1.2.3.4/32', '9.9.9.9/32'],
    error: null,
  })
  assert.equal(parseCidrList('').cidrs.length, 0)
  const bad = parseCidrList('não-é-ip')
  assert.equal(bad.cidrs, null)
  assert.ok(bad.error)
})

test('ipInCidr / isInternalIp', () => {
  assert.equal(ipInCidr('160.238.1.1', '160.238.0.0/16'), true)
  assert.equal(ipInCidr('160.239.1.1', '160.238.0.0/16'), false)
  assert.equal(isInternalIp('160.238.1.1', cidrs), true)
  assert.equal(isInternalIp('1.1.1.1', cidrs), false)
})

test('aparelho e navegador', () => {
  const iphone = uaInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
  assert.deepEqual([iphone.device, iphone.os, iphone.browser], ['Celular', 'iOS', 'Safari'])
  const win = uaInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')
  assert.deepEqual([win.device, win.os, win.browser], ['Computador', 'Windows', 'Chrome'])
  assert.equal(uaInfo('Googlebot/2.1').bot, true)
})

test('visitantes, vendas reais (sem testes) e origem', () => {
  const db = openDb(':memory:')
  const now = new Date('2026-10-26T15:00:00Z')
  recordClick(db, { cid: 'visitaPG1', url: land + '?gclid=G1', ip: '1.1.1.1' }, now)
  recordClick(db, { cid: 'visitaOR1', url: land, referrer: 'https://www.google.com/', ip: '2.2.2.2' }, now)
  recordPostback(db, new URLSearchParams('subid=visitaPG1&order=1&amount=50'), now)
  recordPostback(db, new URLSearchParams('order=2&amount=30'), now) // sem clique
  recordPostback(db, new URLSearchParams('subid=test&order=TEST1&amount=0'), now) // teste
  const v = visitors(db, { period: 'hoje', tz: 'America/Sao_Paulo', now })
  assert.equal(v.length, 2)
  assert.equal(v.find((r) => r.id === 'visitaPG1').compras, 1)
  assert.equal(v.find((r) => r.id === 'visitaOR1').source, 'organico')
  assert.equal(visitors(db, { period: 'hoje', tz: 'America/Sao_Paulo', now, source: 'pago' }).length, 1)

  const sales = salesList(db, { period: 'hoje', tz: 'America/Sao_Paulo', now })
  assert.deepEqual(sales.map((r) => [r.order_id, r.origem]).sort(), [['1', 'pago'], ['2', 'sem_clique']])
  assert.equal(salesList(db, { period: 'hoje', tz: 'America/Sao_Paulo', now, includeTests: true }).length, 3)
  assert.equal(salesList(db, { period: 'hoje', tz: 'America/Sao_Paulo', now, origin: 'sem_clique' }).length, 1)

  const o = Object.fromEntries(originBreakdown(db, 'hoje', 'America/Sao_Paulo', now).map((r) => [r.origem, r]))
  assert.equal(o.pago.visitas, 1)
  assert.equal(o.pago.comissao, 50)
  assert.equal(o.organico.visitas, 1)
  assert.equal(o.sem_clique.vendas, 1)

  assert.equal(deleteConversion(db, sales.find((r) => r.order_id === '2').id), true)
  assert.equal(salesList(db, { period: 'hoje', tz: 'America/Sao_Paulo', now }).length, 1)
})

test('robô e interno ficam fora dos números, mas aparecem em Visitantes', () => {
  const db = openDb(':memory:')
  const now = new Date('2026-10-26T15:00:00Z')
  recordClick(db, { cid: 'visitaPG1', url: land + '?gclid=G1', ip: '1.1.1.1' }, now)
  recordClick(db, { cid: 'visitaRB1', url: land, userAgent: 'Googlebot/2.1', ip: '1.1.1.1' }, now)
  recordClick(db, { cid: 'visitaIN1', url: land, ip: '160.238.1.1' }, now)
  recordPostback(db, new URLSearchParams('subid=visitaPG1&order=1&amount=50'), now)

  const v = visitors(db, { period: 'hoje', tz: 'America/Sao_Paulo', now })
  assert.equal(v.length, 3) // auditáveis em Visitantes
  assert.equal(v.find((r) => r.id === 'visitaRB1').source, 'robo')
  assert.equal(v.find((r) => r.id === 'visitaIN1').source, 'interno')

  assert.equal(dashboard(db, 'hoje', 'America/Sao_Paulo', now).totals.visitas, 1) // só a paga
  const o = Object.fromEntries(originBreakdown(db, 'hoje', 'America/Sao_Paulo', now).map((r) => [r.origem, r]))
  assert.equal(o.robo, undefined)
  assert.equal(o.interno, undefined)
  assert.equal(o.pago.visitas, 1)
})

test('excluir produto apaga visitas e vendas dele, e só dele', () => {
  const db = openDb(':memory:')
  const a = createProduct(db, parseProductForm(new URLSearchParams({ name: 'A', conversion_name: 'A' })).values)
  const b = createProduct(db, parseProductForm(new URLSearchParams({ name: 'B', conversion_name: 'B' })).values)
  recordClick(db, { cid: 'visitaA01', pid: a, url: land })
  recordClick(db, { cid: 'visitaB01', pid: b, url: land })
  recordPostback(db, new URLSearchParams('subid=visitaA01&order=1&amount=5'))
  recordPostback(db, new URLSearchParams('subid=visitaB01&order=2&amount=5'))
  deleteProduct(db, a)
  assert.equal(getProduct(db, a), null)
  assert.ok(getProduct(db, b))
  assert.equal(db.prepare('SELECT COUNT(*) n FROM clicks').get().n, 1)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM conversions').get().n, 1)
})

test('visitas antigas ganham origem na migração', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trk-'))
  const path = join(dir, 'old.db')
  const old = new DatabaseSync(path)
  old.exec(`CREATE TABLE clicks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, gclid TEXT, gbraid TEXT, wbraid TEXT,
    campaign_id TEXT, adgroup_id TEXT, keyword TEXT, matchtype TEXT, device TEXT, network TEXT, utm_source TEXT,
    utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, landing_url TEXT, referrer TEXT, ip TEXT,
    user_agent TEXT, outbound_at TEXT, outbound_count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO clicks (id, created_at, gclid, landing_url) VALUES ('antiga01', '2026-10-26T10:00:00.000Z', 'G', 'https://r.com');
    INSERT INTO clicks (id, created_at, referrer, landing_url) VALUES ('antiga02', '2026-10-26T10:00:00.000Z', 'https://bing.com/', 'https://r.com');`)
  old.close()
  const db = openDb(path)
  const src = Object.fromEntries(db.prepare('SELECT id, source FROM clicks').all().map((r) => [r.id, r.source]))
  assert.deepEqual(src, { antiga01: 'pago', antiga02: 'organico' })
  db.close()
  rmSync(dir, { recursive: true })
})

test('filtro Pago / Não pago separa visitas, vendas, gráfico e origem', async () => {
  const { dashboard, timeSeries } = await import('../src/stats.js')
  const db = openDb(':memory:')
  const now = new Date('2026-10-26T15:00:00Z')
  recordClick(db, { cid: 'visitaPG1', url: land + '?gclid=G1&campaignid=1' }, now)
  recordClick(db, { cid: 'visitaOR1', url: land, referrer: 'https://www.google.com/' }, now)
  recordClick(db, { cid: 'visitaDI1', url: land }, now)
  recordPostback(db, new URLSearchParams('subid=visitaPG1&order=1&amount=50'), now)
  recordPostback(db, new URLSearchParams('subid=visitaOR1&order=2&amount=30'), now)
  recordPostback(db, new URLSearchParams('order=3&amount=20'), now) // sem clique
  const tz = 'America/Sao_Paulo'
  const t = (tr) => dashboard(db, 'hoje', tz, now, null, tr).totals
  assert.deepEqual([t(null).visitas, t(null).vendas, t(null).comissao], [3, 3, 100])
  assert.deepEqual([t('pago').visitas, t('pago').vendas, t('pago').comissao], [1, 1, 50])
  assert.deepEqual([t('nao_pago').visitas, t('nao_pago').vendas, t('nao_pago').comissao], [2, 1, 30])
  assert.equal(t('qualquer').visitas, 3) // valor inválido = sem filtro
  const sum = (tr) => timeSeries(db, 'hoje', tz, now, null, tr).points.reduce((a, p) => a + p.comissao, 0)
  assert.deepEqual([sum(null), sum('pago'), sum('nao_pago')], [100, 50, 30])
  assert.deepEqual(originBreakdown(db, 'hoje', tz, now, null, 'pago').map((r) => r.origem), ['pago'])
  assert.deepEqual(visitors(db, { period: 'hoje', tz, now, traffic: 'nao_pago' }).map((r) => r.id).sort(), ['visitaDI1', 'visitaOR1'])
  assert.deepEqual(salesList(db, { period: 'hoje', tz, now, traffic: 'pago' }).map((r) => r.order_id), ['1'])
  assert.equal(salesList(db, { period: 'hoje', tz, now }).length, 3)
  const camp = dashboard(db, 'hoje', tz, now, null, 'pago').campaigns
  assert.deepEqual(camp.map((c) => c.label), ['1'])
})

test('taxa de passagem por página (visitas, cliques p/ oferta, vendas)', async () => {
  const { dashboard } = await import('../src/stats.js')
  const { recordOutbound } = await import('../src/tracking.js')
  const db = openDb(':memory:')
  const now = new Date('2026-10-26T15:00:00Z')
  const a = 'https://site.com/review-a'
  const b = 'https://outro.com/lista'
  // review-a: 4 visitas (gclid diferentes, mesma página), 2 clicam, 1 compra
  for (let i = 1; i <= 4; i++) recordClick(db, { cid: `visitaA0${i}`, url: `${a}/?gclid=G${i}&utm=x` }, now)
  recordOutbound(db, 'visitaA01', now)
  recordOutbound(db, 'visitaA02', now)
  recordPostback(db, new URLSearchParams('subid=visitaA01&order=1&amount=40'), now)
  // lista: 2 visitas orgânicas, 1 clica
  recordClick(db, { cid: 'visitaB01', url: b, referrer: 'https://google.com/' }, now)
  recordClick(db, { cid: 'visitaB02', url: b, referrer: 'https://google.com/' }, now)
  recordOutbound(db, 'visitaB02', now)
  const pages = Object.fromEntries(dashboard(db, 'hoje', 'America/Sao_Paulo', now).pages.map((p) => [p.label, p]))
  assert.deepEqual(pages['https://site.com/review-a'], { label: 'https://site.com/review-a', visitas: 4, cliques: 2, vendas: 1, comissao: 40 })
  assert.deepEqual(pages['https://outro.com/lista'], { label: 'https://outro.com/lista', visitas: 2, cliques: 1, vendas: 0, comissao: 0 })
  // filtro Pago deixa só a página paga
  assert.deepEqual(dashboard(db, 'hoje', 'America/Sao_Paulo', now, null, 'pago').pages.map((p) => p.label), ['https://site.com/review-a'])
})

test('visitas antigas ganham a página na migração', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trk-'))
  const path = join(dir, 'old.db')
  const old = new DatabaseSync(path)
  old.exec(`CREATE TABLE clicks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, gclid TEXT, gbraid TEXT, wbraid TEXT,
    campaign_id TEXT, adgroup_id TEXT, keyword TEXT, matchtype TEXT, device TEXT, network TEXT, utm_source TEXT,
    utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, landing_url TEXT, referrer TEXT, ip TEXT,
    user_agent TEXT, outbound_at TEXT, outbound_count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO clicks (id, created_at, landing_url) VALUES ('antiga01', '2026-10-26T10:00:00.000Z', 'https://R.com/Review/?gclid=1');`)
  old.close()
  const db = openDb(path)
  assert.equal(db.prepare("SELECT page FROM clicks WHERE id='antiga01'").get().page, 'https://r.com/review')
  db.close()
  rmSync(dir, { recursive: true })
})
