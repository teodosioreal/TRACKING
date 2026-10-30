import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/db.js'
import { createProduct, getProduct, parseProductForm } from '../src/products.js'
import { recordClick, recordPostback, exportGoogleAdsCsv, manualUploadCsv, saleDetail } from '../src/tracking.js'

const form = (o) => new URLSearchParams(o)
const lines = (csv) => csv.trim().split('\r\n').slice(2)

function twoProducts() {
  const db = openDb(':memory:')
  const a = createProduct(db, parseProductForm(form({ name: 'NerveCalm', conversion_name: 'NERVECALM' })).values)
  const b = createProduct(db, parseProductForm(form({ name: 'Arialief', conversion_name: 'ARIALIEF' })).values)
  recordClick(db, { cid: 'vaaaaaaaa1', pid: a, url: 'https://a.com/?gclid=GA' })
  recordClick(db, { cid: 'vbbbbbbbb1', pid: b, url: 'https://b.com/?gclid=GB' })
  recordPostback(db, form({ subid: 'vaaaaaaaa1', order: '1', amount: '40' }))
  recordPostback(db, form({ subid: 'vbbbbbbbb1', order: '2', amount: '60' }))
  return { db, a, b }
}

test('cada produto ganha uma chave de script própria e diferente', () => {
  const { db, a, b } = twoProducts()
  const ka = getProduct(db, a).script_key
  const kb = getProduct(db, b).script_key
  assert.match(ka, /^[0-9a-f]{36}$/)
  assert.match(kb, /^[0-9a-f]{36}$/)
  assert.notEqual(ka, kb)
})

test('a planilha de um produto só traz as vendas dele', () => {
  const { db, a, b } = twoProducts()
  const ca = lines(exportGoogleAdsCsv(db, { conversionName: 'x', currency: 'USD', days: 30, productId: a }))
  const cb = lines(exportGoogleAdsCsv(db, { conversionName: 'x', currency: 'USD', days: 30, productId: b }))
  assert.equal(ca.length, 1)
  assert.match(ca[0], /^GA,NERVECALM,/)
  assert.equal(cb.length, 1)
  assert.match(cb[0], /^GB,ARIALIEF,/)
})

test('planilha antiga deixa de fora o produto que já tem script próprio', () => {
  const { db, a } = twoProducts()
  const all = lines(exportGoogleAdsCsv(db, { conversionName: 'x', currency: 'USD', days: 30 }))
  assert.equal(all.length, 2)
  const semA = lines(exportGoogleAdsCsv(db, { conversionName: 'x', currency: 'USD', days: 30, excludeProductIds: [a] }))
  assert.equal(semA.length, 1)
  assert.match(semA[0], /^GB,ARIALIEF,/)
})

test('CSV manual: só o produto pedido, só com gclid, horário no modelo do upload', () => {
  const { db, a } = twoProducts()
  recordClick(db, { cid: 'vaaaaaaaa2', pid: a, url: 'https://a.com/?gbraid=GBR' }) // iPhone, sem gclid
  recordPostback(db, form({ subid: 'vaaaaaaaa2', order: '3', amount: '30' }))
  recordPostback(db, form({ subid: 'vaaaaaaaa1', order: 'TESTE-9', amount: '1', type: 'teste' })) // teste
  const r = manualUploadCsv(db, { conversionName: 'x', currency: 'USD', productId: a, from: '0000', to: '9999' })
  const l = r.csv.trim().split('\r\n')
  assert.equal(l[0], 'Parameters:TimeZone=+0000')
  assert.equal(l[1], 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency')
  assert.equal(l.length, 3)
  assert.match(l[2], /^GA,NERVECALM,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},40\.00,USD$/)
  assert.equal(r.vendas, 1)
  assert.equal(r.semGclid, 1)
})

test('detalhe da venda traz o clique que gerou ela', () => {
  const { db } = twoProducts()
  const id = db.prepare(`SELECT id FROM conversions WHERE order_id = '1'`).get().id
  const d = saleDetail(db, id)
  assert.equal(d.visita, 'vaaaaaaaa1')
  assert.equal(d.gclid, 'GA')
  assert.equal(d.produto, 'NerveCalm')
  assert.equal(d.conversion_name, 'NERVECALM')
  const one = manualUploadCsv(db, { conversionName: 'x', currency: 'USD', ids: [id] })
  assert.equal(one.vendas, 1)
  assert.equal(saleDetail(db, 99999), null)
})

test('banco antigo: produtos existentes ganham a chave e nada é apagado', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'trk-')), 'antigo.db')
  const { db: first, a } = (() => {
    const db = openDb(path)
    const a = createProduct(db, parseProductForm(form({ name: 'NerveCalm', conversion_name: 'NERVECALM' })).values)
    return { db, a }
  })()
  // Simula o banco de antes desta versão: produto sem chave.
  first.exec('UPDATE products SET script_key = NULL')
  first.close()
  const raw = new DatabaseSync(path)
  assert.equal(raw.prepare('SELECT script_key FROM products').get().script_key, null)
  raw.close()

  const db = openDb(path)
  const p = getProduct(db, a)
  assert.equal(p.name, 'NerveCalm')
  assert.equal(p.conversion_name, 'NERVECALM')
  assert.match(p.script_key, /^[0-9a-f]{36}$/)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, 1)
})
