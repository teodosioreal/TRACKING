import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionManager, readCookie, sessionCookie, safeNext, loginLimiter, COOKIE } from '../src/session.js'

const opts = { secretKey: 'k', user: 'admin', password: 'senha' }

test('sessão assinada: válida, adulterada, expirada, outra senha', () => {
  const s = sessionManager(opts)
  const t = s.create(Date.parse('2026-10-26T12:00:00Z'))
  assert.equal(s.valid(t, Date.parse('2026-10-27T12:00:00Z')), true)
  assert.equal(s.valid(t, Date.parse('2026-12-26T12:00:00Z')), false) // passou de 30 dias
  const [exp, nonce, sig] = t.split('.')
  assert.equal(s.valid(`${Number(exp) + 99999}.${nonce}.${sig}`, Date.parse('2026-10-27T12:00:00Z')), false)
  assert.equal(s.valid('lixo'), false)
  assert.equal(s.valid(''), false)
  assert.equal(sessionManager({ ...opts, password: 'outra' }).valid(t, Date.parse('2026-10-27T12:00:00Z')), false)
})

test('cookie HttpOnly, SameSite=Lax e Secure só com https', () => {
  const c = sessionCookie('abc', { secure: true })
  assert.match(c, new RegExp(`^${COOKIE}=abc; Path=/; Max-Age=\\d+; HttpOnly; SameSite=Lax; Secure$`))
  assert.doesNotMatch(sessionCookie('abc', { secure: false }), /Secure/)
  assert.match(sessionCookie('', { secure: true, maxAge: 0 }), /Max-Age=0/)
  assert.equal(readCookie({ headers: { cookie: `a=1; ${COOKIE}=x.y.z; b=2` } }, COOKIE), 'x.y.z')
  assert.equal(readCookie({ headers: {} }, COOKIE), null)
})

test('volta só para páginas do painel', () => {
  assert.equal(safeNext('/vendas?periodo=hoje'), '/vendas?periodo=hoje')
  assert.equal(safeNext('https://malicioso.com'), '/')
  assert.equal(safeNext('//malicioso.com'), '/')
  assert.equal(safeNext('/\\malicioso.com'), '/')
  assert.equal(safeNext('/login'), '/')
  assert.equal(safeNext(null), '/')
})

test('limite de tentativas de login por IP', () => {
  const l = loginLimiter({ max: 3, windowMs: 1000 })
  for (let i = 0; i < 3; i++) l.fail('1.1.1.1', 0)
  assert.equal(l.blocked('1.1.1.1', 10), true)
  assert.equal(l.blocked('2.2.2.2', 10), false)
  assert.equal(l.blocked('1.1.1.1', 2000), false)
  l.reset('1.1.1.1')
  assert.equal(l.blocked('1.1.1.1', 10), false)
})
