import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../src/db.js'
import { recordClick, recordOutbound, recordPostback, exportGoogleAdsCsv } from '../src/tracking.js'
import { dashboard, periodRange } from '../src/stats.js'

const opts = { conversionName: 'Compra BuyGoods', currency: 'USD', days: 30 }
const landing = 'https://review.exemplo.com/produto?gclid=ABC123&campaignid=111&keyword=produto%20review&device=m'

function setup() {
  const db = openDb(':memory:')
  recordClick(db, { cid: 'visita01', url: landing, ip: '1.2.3.4' }, new Date('2026-10-26T12:00:00Z'))
  return db
}

test('visita guarda gclid e parâmetros do Google', () => {
  const db = setup()
  const row = db.prepare('SELECT * FROM clicks WHERE id = ?').get('visita01')
  assert.equal(row.gclid, 'ABC123')
  assert.equal(row.campaign_id, '111')
  assert.equal(row.keyword, 'produto review')
  assert.equal(row.device, 'm')
})

test('recarregar a página não duplica nem sobrescreve a visita', () => {
  const db = setup()
  assert.equal(recordClick(db, { cid: 'visita01', url: 'https://review.exemplo.com/' }), false)
  assert.equal(db.prepare('SELECT gclid FROM clicks').get().gclid, 'ABC123')
})

test('cid inválido é ignorado', () => {
  const db = setup()
  assert.equal(recordClick(db, { cid: 'x', url: landing }), false)
  assert.equal(recordClick(db, { cid: "a'; DROP TABLE clicks;--", url: landing }), false)
})

test('clique no botão marca a visita', () => {
  const db = setup()
  recordOutbound(db, 'visita01')
  recordOutbound(db, 'visita01')
  const row = db.prepare('SELECT outbound_at, outbound_count FROM clicks').get()
  assert.ok(row.outbound_at)
  assert.equal(row.outbound_count, 2)
})

test('venda vai para a planilha do Google Ads com gclid e comissão', () => {
  const db = setup()
  recordPostback(
    db,
    new URLSearchParams('subid=visita01&order=BG1&amount=123.45&type=sale'),
    new Date('2026-10-26T13:05:09Z'),
  )
  const csv = exportGoogleAdsCsv(db, opts, new Date('2026-10-27T00:00:00Z'))
  assert.equal(
    csv,
    'Parameters:TimeZone=+0000\r\n' +
      'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n' +
      'ABC123,Compra BuyGoods,2026-10-26 13:05:09+0000,123.45,USD\r\n',
  )
})

test('postback repetido não duplica a venda', () => {
  const db = setup()
  const p = new URLSearchParams('subid=visita01&order=BG1&amount=10&type=sale')
  assert.equal(recordPostback(db, p).duplicate, false)
  assert.equal(recordPostback(db, p).duplicate, true)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversions').get().n, 1)
})

test('upsell do mesmo pedido entra como outra conversão', () => {
  const db = setup()
  recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=10&type=sale'), new Date('2026-10-26T13:00:00Z'))
  recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=20&type=upsell'), new Date('2026-10-26T13:02:00Z'))
  const csv = exportGoogleAdsCsv(db, opts, new Date('2026-10-27T00:00:00Z'))
  assert.equal(csv.trim().split('\r\n').length, 4)
})

test('reembolso tira a venda da planilha', () => {
  const db = setup()
  recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=10&type=sale'))
  const r = recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=10&type=refund'))
  assert.equal(r.refund, true)
  const csv = exportGoogleAdsCsv(db, opts)
  assert.equal(csv.trim().split('\r\n').length, 2)
  assert.equal(db.prepare("SELECT status FROM conversions WHERE type = 'sale'").get().status, 'refunded')
})

test('macro não substituída conta como vazia e venda sem clique não vai para o Google', () => {
  const db = setup()
  const r = recordPostback(db, new URLSearchParams('subid={SUBID}&order=BG9&amount=5'))
  assert.equal(r.subid, null)
  assert.equal(exportGoogleAdsCsv(db, opts).trim().split('\r\n').length, 2)
})

test('vendas antigas saem da planilha', () => {
  const db = setup()
  recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=10'), new Date('2026-08-01T00:00:00Z'))
  const csv = exportGoogleAdsCsv(db, opts, new Date('2026-10-27T00:00:00Z'))
  assert.equal(csv.trim().split('\r\n').length, 2)
})

test('painel soma visitas, cliques e vendas por campanha', () => {
  const db = setup()
  const now = new Date('2026-10-26T20:00:00Z')
  recordOutbound(db, 'visita01', now)
  recordPostback(db, new URLSearchParams('subid=visita01&order=BG1&amount=50'), now)
  const d = dashboard(db, 'hoje', 'America/Sao_Paulo', now)
  assert.deepEqual(d.totals, { visitas: 1, cliques: 1, google: 1, vendas: 1, comissao: 50, reembolsos: 0 })
  assert.deepEqual(d.campaigns[0], { label: '111', visitas: 1, cliques: 1, vendas: 1, comissao: 50 })
})

test('"hoje" começa à meia-noite no fuso do painel', () => {
  const [from] = periodRange('hoje', 'America/Sao_Paulo', new Date('2026-10-26T02:00:00Z'))
  // 02:00 UTC do dia 26 ainda é dia 25 em São Paulo (UTC-3).
  assert.equal(from, '2026-10-25T03:00:00.000Z')
})
