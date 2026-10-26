// Confere, a partir da VPS, se o endereço público abre com HTTPS válido.
// Se não abrir, o navegador dos visitantes bloqueia o t.js e nada é registrado.
import https from 'node:https'

const REASONS = {
  ERR_TLS_CERT_ALTNAME_INVALID: 'o certificado HTTPS instalado é de outro domínio (provavelmente o do CRM), não do subdomínio do rastreador',
  CERT_HAS_EXPIRED: 'o certificado HTTPS está vencido',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'o certificado HTTPS é autoassinado',
  SELF_SIGNED_CERT_IN_CHAIN: 'o certificado HTTPS é autoassinado',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'o certificado HTTPS está incompleto',
  ECONNREFUSED: 'a porta 443 (HTTPS) está fechada',
  ENOTFOUND: 'o DNS do subdomínio não foi encontrado',
  EAI_AGAIN: 'o DNS do subdomínio não respondeu',
  ECONNRESET: 'a conexão HTTPS foi recusada',
}

export function checkHttps(publicUrl, { timeout = 8000, request = https.get } = {}) {
  const at = new Date().toISOString()
  if (!publicUrl) return Promise.resolve(null)
  if (!publicUrl.startsWith('https://')) {
    return Promise.resolve({ ok: false, at, reason: 'o PUBLIC_URL do .env não começa com https://' })
  }
  return new Promise((resolve) => {
    let done = false
    const finish = (r) => {
      if (!done) {
        done = true
        resolve({ at, ...r })
      }
    }
    const req = request(new URL('/saude', publicUrl), { timeout }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c.length < 100 ? c : ''))
      res.on('end', () => {
        if (res.statusCode === 200 && body.trim() === 'ok') finish({ ok: true })
        else
          finish({
            ok: false,
            reason: `o endereço abre, mas não chega no rastreador (resposta ${res.statusCode}). O Nginx não está encaminhando o subdomínio para a porta do rastreador`,
          })
      })
    })
    req.on('timeout', () => {
      req.destroy()
      finish({ ok: false, reason: 'o endereço demorou demais para responder' })
    })
    req.on('error', (err) => finish({ ok: false, reason: REASONS[err.code] || `erro ${err.code || err.message}` }))
  })
}
