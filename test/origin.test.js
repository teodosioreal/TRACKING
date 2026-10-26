import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { classifySource, uaInfo } from '../src/source.js'
import { openDb } from '../src/db.js'
import { recordClick, recordPostback } from '../src/tracking.js'
import { visitors, salesList, originBreakdown } from '../src/stats.js'
import { createProduct, parseProductForm, deleteProduct, deleteConversion, getProduct } from '../src/products.js'

const land = 'https://review.com/p'

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
