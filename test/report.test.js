import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseScriptReport } from '../src/report.js'

test('relatório do script: campos esperados e tamanhos limitados', () => {
  const r = parseScriptReport(
    JSON.stringify({ enviadas: 3, porConversao: { 'Compra - A': 2, 'Compra - B': 1, ruim: -1 }, erro: null, conta: { id: '123-456-7890', nome: 'Conta X' }, extra: 'x' }),
    new Date('2026-10-26T15:00:00Z'),
  )
  assert.deepEqual(r, {
    at: '2026-10-26T15:00:00.000Z',
    enviadas: 3,
    porConversao: { 'Compra - A': 2, 'Compra - B': 1 },
    erro: null,
    conta: { id: '123-456-7890', nome: 'Conta X' },
  })
  assert.equal(parseScriptReport(JSON.stringify({ erro: 'x'.repeat(900) })).erro.length, 500)
  assert.equal(parseScriptReport(JSON.stringify({ enviadas: 'muitas' })).enviadas, 0)
  assert.equal(parseScriptReport('não é json'), null)
  assert.equal(parseScriptReport('null'), null)
})
