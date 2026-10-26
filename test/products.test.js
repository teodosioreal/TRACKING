import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/db.js'
import { parseProductForm, createProduct, getProduct, listProducts, productStatus } from '../src/products.js'
import { recordClick, recordPing, recordPostback, exportGoogleAdsCsv } from '../src/tracking.js'
import { dashboard } from '../src/stats.js'
import { checkPage } from '../src/verify.js'

const form = (o) => new URLSearchParams(o)
const opts = { conversionName: 'Compra BuyGoods', currency: 'USD', days: 30 }

function withProducts() {
  const db = openDb(':memory:')
  const a = createProduct(db, parseProductForm(form({ name: 'Produto A', conversion_name: 'Compra - A' })).values)
  const b = createProduct(db, parseProductForm(form({ name: 'Produto B', conversion_name: 'Compra - B' })).values)
  return { db, a, b }
}

test('formulário valida nome, conversão e endereço', () => {
  const r = parseProductForm(form({ name: '', conversion_name: '', review_url: 'javascript:alert(1)' }))
  assert.ok(r.errors.name && r.errors.conversion_name && r.errors.review_url)
  const ok = parseProductForm(form({ name: ' X ', conversion_name: 'Compra - X', review_url: 'https://site.com/r' }))
  assert.deepEqual(ok.values, { name: 'X', platform: 'buygoods', conversion_name: 'Compra - X', review_url: 'https://site.com/r' })
  assert.ok(parseProductForm(form({ name: 'X', conversion_name: 'Y', platform: 'clickbank' })).errors.platform)
})

test('produto ganha id no formato do script', () => {
  const { db, a } = withProducts()
  assert.match(a, /^p[a-z0-9]{8}$/)
  assert.equal(getProduct(db, a).name, 'Produto A')
  assert.equal(getProduct(db, "x' OR 1=1"), null)
})

test('visita guarda o produto; produto inexistente vira nulo', () => {
  const { db, a } = withProducts()
  recordClick(db, { cid: 'visita01', pid: a, url: 'https://s.com/?gclid=G1' })
  recordClick(db, { cid: 'visita02', pid: 'pzzzzzzzz', url: 'https://s.com/' })
  assert.equal(db.prepare("SELECT product_id FROM clicks WHERE id='visita01'").get().product_id, a)
  assert.equal(db.prepare("SELECT product_id FROM clicks WHERE id='visita02'").get().product_id, null)
})

test('sinal do script marca instalação e links encontrados', () => {
  const { db, a } = withProducts()
  assert.equal(productStatus(db, getProduct(db, a)).ping, null)
  assert.equal(recordPing(db, { pid: a, url: 'https://s.com/r', links: 3, test: true }), true)
  const st = productStatus(db, getProduct(db, a))
  assert.equal(st.ping.links, 3)
  assert.ok(st.lastTestAt)
  assert.equal(recordPing(db, { pid: 'pzzzzzzzz', url: 'x', links: 1 }), false)
})

test('cada venda vai com o nome de conversão do seu produto', () => {
  const { db, a, b } = withProducts()
  recordClick(db, { cid: 'visitaA1', pid: a, url: 'https://s.com/?gclid=GA' })
  recordClick(db, { cid: 'visitaB1', pid: b, url: 'https://s.com/?gclid=GB' })
  recordClick(db, { cid: 'visitaX1', url: 'https://s.com/?gclid=GX' })
  const t = new Date('2026-10-26T10:00:00Z')
  recordPostback(db, form({ subid: 'visitaA1', order: '1', amount: '10' }), t)
  recordPostback(db, form({ subid: 'visitaB1', order: '2', amount: '20' }), t)
  recordPostback(db, form({ subid: 'visitaX1', order: '3', amount: '30' }), t)
  const now = new Date('2026-10-27T00:00:00Z')

  const all = exportGoogleAdsCsv(db, opts, now)
  assert.match(all, /GA,Compra - A,/)
  assert.match(all, /GB,Compra - B,/)
  assert.match(all, /GX,Compra BuyGoods,/)

  const onlyA = exportGoogleAdsCsv(db, { ...opts, productId: a }, now).trim().split('\r\n')
  assert.equal(onlyA.length, 3)
  assert.match(onlyA[2], /^GA,Compra - A,2026-10-26 10:00:00\+0000,10\.00,USD$/)
})

test('venda de teste não vai pro Google nem entra nos totais', () => {
  const { db, a } = withProducts()
  const now = new Date('2026-10-26T15:00:00Z')
  recordClick(db, { cid: 'visitaT1', pid: a, test: true, url: 'https://s.com/?gclid=GT' }, now)
  const r = recordPostback(db, form({ subid: 'visitaT1', order: 'TESTE-1', amount: '1', type: 'teste' }), now)
  assert.equal(r.test, true)
  assert.equal(exportGoogleAdsCsv(db, opts, now).trim().split('\r\n').length, 2)
  const d = dashboard(db, 'hoje', 'America/Sao_Paulo', now)
  assert.equal(d.totals.vendas, 0)
  assert.equal(d.totals.visitas, 0)
  assert.equal(productStatus(db, getProduct(db, a)).lastSale.status, 'test')
  assert.equal(productStatus(db, getProduct(db, a)).lastRealSale, null)
})

test('painel filtra por produto', () => {
  const { db, a, b } = withProducts()
  const now = new Date('2026-10-26T15:00:00Z')
  recordClick(db, { cid: 'visitaA1', pid: a, url: 'https://s.com/?gclid=GA' }, now)
  recordClick(db, { cid: 'visitaB1', pid: b, url: 'https://s.com/?gclid=GB' }, now)
  recordPostback(db, form({ subid: 'visitaB1', order: '2', amount: '20' }), now)
  const onlyB = dashboard(db, 'hoje', 'America/Sao_Paulo', now, b)
  assert.equal(onlyB.totals.visitas, 1)
  assert.equal(onlyB.totals.vendas, 1)
  const onlyA = dashboard(db, 'hoje', 'America/Sao_Paulo', now, a)
  assert.equal(onlyA.totals.vendas, 0)
  assert.equal(dashboard(db, 'hoje', 'America/Sao_Paulo', now).totals.visitas, 2)
  assert.deepEqual(
    listProducts(db).map((p) => [p.name, p.visitas, p.vendas]).sort(),
    [['Produto A', 1, 0], ['Produto B', 1, 1]],
  )
})

test('banco da primeira versão ganha as colunas novas sem perder dados', () => {
  const dir = mkdtempSync(join(tmpdir(), 'trk-'))
  const path = join(dir, 'old.db')
  const old = new DatabaseSync(path)
  old.exec(`CREATE TABLE clicks (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, gclid TEXT, gbraid TEXT, wbraid TEXT,
    campaign_id TEXT, adgroup_id TEXT, keyword TEXT, matchtype TEXT, device TEXT, network TEXT, utm_source TEXT,
    utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT, landing_url TEXT, referrer TEXT, ip TEXT,
    user_agent TEXT, outbound_at TEXT, outbound_count INTEGER NOT NULL DEFAULT 0);
    INSERT INTO clicks (id, created_at, gclid) VALUES ('antiga01', '2026-10-26T10:00:00.000Z', 'OLD');`)
  old.close()
  const db = openDb(path)
  const row = db.prepare("SELECT * FROM clicks WHERE id='antiga01'").get()
  assert.equal(row.gclid, 'OLD')
  assert.equal(row.product_id, null)
  assert.equal(row.is_test, 0)
  db.close()
  openDb(path).close() // abrir de novo não quebra
  rmSync(dir, { recursive: true })
})

test('verificação da página acha o script e os links', async () => {
  const product = { id: 'pabc12345', review_url: 'https://s.com/r' }
  const page = (body, status = 200) => async () => ({ ok: status < 400, status, text: async () => body })
  const ok = await checkPage(product, page('<a href="https://buygoods.com/x">c</a><script src="https://t/t.js?p=pabc12345"></script>'))
  assert.match(ok, /Script deste produto encontrado/)
  assert.match(ok, /1 link\(s\)/)
  assert.match(await checkPage(product, page('<script src="https://t/t.js?p=pzzz99999"></script>')), /OUTRO produto/)
  assert.match(await checkPage(product, page('', 404)), /erro 404/)
  assert.match(await checkPage({ id: 'pabc12345' }), /Informe o endereço/)
})
