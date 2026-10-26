import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb, setSetting } from '../src/db.js'
import { createProduct, parseProductForm } from '../src/products.js'
import { recordClick, recordPing, recordPostback } from '../src/tracking.js'
import { runDiagnostics, diagnosticsText } from '../src/diagnostics.js'

const now = new Date('2026-10-26T18:00:00Z')
const ago = (h) => new Date(now.getTime() - h * 3600e3)
const titles = (items) => items.map((x) => `${x.level}: ${x.title}`)

function scenario() {
  const db = openDb(':memory:')
  const form = (o) => new URLSearchParams(o)
  const a = createProduct(db, parseProductForm(form({ name: 'NerVive', conversion_name: 'Compra - NerVive', review_url: 'https://a.com/review', extra_urls: 'https://b.com/lista' })).values)
  const b = createProduct(db, parseProductForm(form({ name: 'Outro', conversion_name: 'Compra - Outro' })).values)
  recordPing(db, { pid: a, url: 'https://a.com/review?gclid=1', links: 2 }, ago(1))
  recordPing(db, { pid: a, url: 'https://c.com/x', links: 0 }, ago(1))
  recordClick(db, { cid: 'vpago00001', pid: a, url: 'https://a.com/review?gclid=G1&campaignid=99' }, ago(30))
  recordClick(db, { cid: 'vpago00002', pid: a, url: 'https://a.com/review?gclid=G2' }, ago(20))
  recordClick(db, { cid: 'vorg000001', pid: a, url: 'https://a.com/review', referrer: 'https://google.com/' }, ago(20))
  recordPostback(db, form({ subid: 'vpago00001', order: '1', amount: '50' }), ago(29)) // com gclid, script nunca leu
  recordPostback(db, form({ subid: 'adsgoogle', order: '2', amount: '50' }), ago(10)) // subid fixo
  recordPostback(db, form({ subid: 'adsgoogle', order: '3', amount: '50' }), ago(9))
  recordPostback(db, form({ order: '4', amount: '50' }), ago(8)) // sem subid
  recordPostback(db, form({ subid: 'vorg000001', order: '5', amount: '50' }), ago(7)) // orgânica
  recordPostback(db, form({ subid: 'vfantasma99', order: '6', amount: '50' }), ago(6)) // visita não registrada
  return { db, a, b }
}

test('diagnóstico aponta os problemas de cada parte', () => {
  const { db } = scenario()
  const d = runDiagnostics(db, { now, health: { ok: false, reason: 'certificado de outro domínio' } })
  const g = titles(d.general).join('\n')
  assert.match(g, /bad: O endereço do rastreador não abre com HTTPS/)
  assert.match(g, /ok: Postback chegando/)
  assert.match(g, /bad: O script do Google Ads nunca leu a planilha/)

  const s = titles(d.sales).join('\n')
  assert.match(s, /info: 6 venda\(s\)/)
  assert.match(s, /bad: 2 venda\(s\) com subid fixo/)
  assert.match(d.sales.find((x) => /subid fixo/.test(x.title)).detail, /"adsgoogle" \(2\)/)
  assert.match(s, /warn: 1 venda\(s\) sem subid/)
  assert.match(s, /warn: 1 venda\(s\) com ID de visita que o rastreador não registrou/)
  assert.match(s, /info: 1 venda\(s\) de visitas sem anúncio/)
  assert.match(s, /warn: 1 venda\(s\) com gclid que o script pode não ter enviado/)

  const nerv = d.products.find((p) => p.product.name === 'NerVive')
  const pt = titles(nerv.items).join('\n')
  assert.match(pt, /bad: Script sem link de afiliado em c\.com\/x/)
  assert.match(pt, /warn: Página cadastrada sem sinal do script: b\.com\/lista/)
  assert.match(pt, /warn: 1 visita\(s\) paga\(s\) sem campanha identificada/)
  const outro = d.products.find((p) => p.product.name === 'Outro')
  assert.match(titles(outro.items).join('\n'), /bad: O script nunca deu sinal/)
  assert.ok(outro.missing.includes('Script instalado'))
  assert.ok(d.counts.bad >= 4)
  assert.match(diagnosticsText(d), /PRODUTO: NerVive — configuração/)
})

test('venda lida pelo script em até 3 dias não aparece como "pode não ter sido enviada"', () => {
  const { db } = scenario()
  setSetting(db, 'csv_fetch:all', { at: ago(0.5).toISOString() })
  setSetting(db, 'csv_fetch_log', [ago(28).toISOString(), ago(0.5).toISOString()])
  setSetting(db, 'script_report', { at: ago(0.5).toISOString(), enviadas: 1, porConversao: {}, erro: null })
  const d = runDiagnostics(db, { now, health: { ok: true } })
  const all = titles([...d.general, ...d.sales]).join('\n')
  assert.match(all, /ok: Script do Google Ads rodando/)
  assert.match(all, /ok: HTTPS do rastreador funcionando/)
  assert.doesNotMatch(all, /pode não ter enviado/)
})

test('postback sem o campo subid é apontado', () => {
  const db = openDb(':memory:')
  recordPostback(db, new URLSearchParams('order=10&amount=40'), ago(2))
  recordPostback(db, new URLSearchParams('order=11&amount=40'), ago(1))
  const d = runDiagnostics(db, { now })
  assert.match(titles(d.general).join('\n'), /bad: O postback chega SEM o campo subid/)
})
