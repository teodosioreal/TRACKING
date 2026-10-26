// Sessão do painel: cookie assinado (sem guardar nada no banco). Trocar a
// senha ou a SECRET_KEY invalida todas as sessões abertas.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const COOKIE = 'trk_sessao'
export const MAX_AGE = 30 * 86400 // segundos

export function sessionManager({ secretKey, user, password }) {
  const key = createHmac('sha256', 'tracking-sessao').update(`${secretKey}\n${user}\n${password}`).digest()
  const sign = (data) => createHmac('sha256', key).update(data).digest('base64url')

  return {
    create(now = Date.now()) {
      const data = `${Math.floor(now / 1000) + MAX_AGE}.${randomBytes(12).toString('base64url')}`
      return `${data}.${sign(data)}`
    },
    valid(token, now = Date.now()) {
      const parts = String(token || '').split('.')
      if (parts.length !== 3) return false
      const data = `${parts[0]}.${parts[1]}`
      const a = Buffer.from(parts[2])
      const b = Buffer.from(sign(data))
      if (a.length !== b.length || !timingSafeEqual(a, b)) return false
      return Number(parts[0]) * 1000 > now
    },
  }
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function sessionCookie(value, { secure, maxAge = MAX_AGE }) {
  return [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

// Para onde voltar depois do login: só caminhos do próprio painel.
export function safeNext(next) {
  const s = String(next || '')
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') && !s.startsWith('/login') ? s : '/'
}

// Limite simples de tentativas de login por IP (em memória).
export function loginLimiter({ max = 10, windowMs = 15 * 60e3 } = {}) {
  const hits = new Map()
  return {
    blocked(ip, now = Date.now()) {
      const h = hits.get(ip)
      if (!h || now - h.first > windowMs) return false
      return h.count >= max
    },
    fail(ip, now = Date.now()) {
      const h = hits.get(ip)
      if (!h || now - h.first > windowMs) hits.set(ip, { first: now, count: 1 })
      else h.count++
      if (hits.size > 5000) hits.clear()
    },
    reset(ip) {
      hits.delete(ip)
    },
  }
}
