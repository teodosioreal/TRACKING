import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { checkHttps } from '../src/health.js'
import { openDb } from '../src/db.js'
import { recordClick, recordPostback } from '../src/tracking.js'
import { timeSeries } from '../src/stats.js'
import { checkPage } from '../src/verify.js'

// Imita https.get: responde com status/corpo ou emite um erro com código.
function fakeRequest({ status, body, errorCode }) {
  return (url, opts, cb) => {
    const req = new EventEmitter()
    req.destroy = () => {}
    setImmediate(() => {
      if (errorCode) return req.emit('error', Object.assign(new Error(errorCode), { code: errorCode }))
      const res = new EventEmitter()
      res.statusCode = status
      res.setEncoding = () => {}
      cb(res)
      res.emit('data', body)
      res.emit('end')
    })
    return req
  }
}

test('HTTPS ok quando o rastreador responde', async () => {
  const h = await checkHttps('https://t.exemplo.com', { request: fakeRequest({ status: 200, body: 'ok' }) })
  assert.equal(h.ok, true)
})

test('HTTPS com certificado de outro domínio explica o problema', async () => {
  const h = await checkHttps('https://t.exemplo.com', { request: fakeRequest({ errorCode: 'ERR_TLS_CERT_ALTNAME_INVALID' }) })
  assert.equal(h.ok, false)
  assert.match(h.reason, /outro domínio/)
})

test('HTTPS abre mas cai em outro site (Nginx sem o rastreador)', async () => {
  const h = await checkHttps('https://t.exemplo.com', { request: fakeRequest({ status: 200, body: '<html>CRM</html>' }) })
  assert.equal(h.ok, false)
  assert.match(h.reason, /não chega no rastreador/)
})

test('porta fechada e PUBLIC_URL sem https', async () => {
  assert.match((await checkHttps('https://t.exemplo.com', { request: fakeRequest({ errorCode: 'ECONNREFUSED' }) })).reason, /443/)
  assert.match((await checkHttps('http://t.exemplo.com')).reason, /https/)
  assert.equal(await checkHttps(''), null)
})

test('gráfico: 24 horas em "hoje" e dias no fuso do painel', () => {
  const db = openDb(':memory:')
  const now = new Date('2026-10-26T18:00:00Z')
  recordClick(db, { cid: 'visita01', url: 'https://x/?gclid=a' }, new Date('2026-10-26T14:10:00Z'))
  recordPostback(db, new URLSearchParams('subid=visita01&order=1&amount=40'), new Date('2026-10-26T15:30:00Z'))
  // 01:00 UTC do dia 26 ainda é dia 25 em São Paulo.
  recordPostback(db, new URLSearchParams('subid=visita01&order=2&amount=10'), new Date('2026-10-26T01:00:00Z'))
  const hoje = timeSeries(db, 'hoje', 'America/Sao_Paulo', now)
  assert.equal(hoje.hourly, true)
  assert.equal(hoje.points.length, 24)
  assert.deepEqual(hoje.points.find((p) => p.key.endsWith(' 12')), { key: '2026-10-26 12', start: '2026-10-26T15:00:00.000Z', visitas: 0, vendas: 1, comissao: 40 })
  const semana = timeSeries(db, '7d', 'America/Sao_Paulo', now)
  assert.equal(semana.points.length, 7)
  assert.equal(semana.points.at(-1).comissao, 40)
  assert.equal(semana.points.at(-2).comissao, 10)
})

test('verificação detecta script colado como texto e mostra o que recebeu', async () => {
  const product = { id: 'pabc12345', review_url: 'https://s.com/r' }
  const page = (body) => async () => ({ ok: true, status: 200, url: 'https://s.com/r', text: async () => body })
  const r = await checkPage(product, page('<title>Review X</title><p>&lt;script src="https://t/t.js?p=pabc12345"&gt;&lt;/script&gt;</p>'))
  assert.match(r, /como TEXTO/)
  assert.match(r, /Review X/)
  assert.match(await checkPage(product, page('<title>Just a moment...</title>')), /anti-robô/)
  assert.match(await checkPage(product, page('<script src="https://t.com/t.js" async></script>'), 't.com'), /script antigo/)
})
