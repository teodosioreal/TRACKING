// Origem da visita e aparelho/navegador, a partir do que o script envia.
//
// Ordem de prioridade da classificação (a primeira que bater vence):
//   1. robo       — user-agent de bot, ou IP de crawler/AdsBot do Google.
//   2. interno     — IP cadastrado em "Meus IPs" (Configurações), ou
//                     referrer ads.google.com (prévia do próprio anúncio).
//   3. pago        — gclid/gbraid/wbraid, ou utm_medium=cpc/ppc com
//                     utm_source=google.
//   4. pago_outro  — outro utm_medium pago (ex.: fbclid, cpm, display).
//   5. organico    — referrer de buscador, sem nenhum parâmetro pago.
//   6. referencia  — veio de outro site.
//   7. direto      — sem referrer e sem parâmetros.
// "robo" e "interno" ficam fora de todos os números (dashboards, funil,
// taxa de passagem etc.) — só aparecem na lista de Visitantes, para auditoria.

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|brave|search\.aol|ask)\./i
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_search|cpm|display|ads?)$/i
const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|bingpreview/i
// Prefixos de IP do Google (crawlers/AdsBot) — só os dois primeiros blocos,
// como pedido (não é a lista completa e oficial de ranges do Google).
const GOOGLE_BOT_IP_PREFIXES = ['209.85.', '66.249.']
const ADS_PREVIEW_HOST = 'ads.google.com'

// IPs/faixas que não contam como visita de verdade (sua própria rede, time,
// testes manuais...). Cadastrados em Configurações → Meus IPs.
export const DEFAULT_INTERNAL_CIDRS = ['160.238.0.0/16']

export const SOURCES = {
  robo: 'Robô',
  interno: 'Interno',
  pago: 'Pago (Google Ads)',
  pago_outro: 'Pago (outro)',
  organico: 'Orgânico',
  referencia: 'Referência',
  direto: 'Direto',
  teste: 'Teste',
}
// Origens que não entram nos números (dashboards, funil...): só aparecem,
// com essa etiqueta, na lista de Visitantes.
export const EXCLUDED_SOURCES = ['robo', 'interno']

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

function isGoogleBotIp(ip) {
  const s = String(ip || '')
  return GOOGLE_BOT_IP_PREFIXES.some((p) => s.startsWith(p))
}

function isBotUa(ua) {
  return BOT_UA.test(String(ua || ''))
}

function ipToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim())
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// "1.2.3.4/16" (ou "1.2.3.4", que vale como /32). Só IPv4 — uso próprio.
export function ipInCidr(ip, cidr) {
  const [range, bitsStr] = String(cidr || '').trim().split('/')
  const bits = bitsStr === undefined ? 32 : Number(bitsStr)
  const ipInt = ipToInt(ip)
  const rangeInt = ipToInt(range)
  if (ipInt == null || rangeInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (ipInt & mask) === (rangeInt & mask)
}

export function isInternalIp(ip, cidrList) {
  if (!ip || !Array.isArray(cidrList)) return false
  return cidrList.some((c) => ipInCidr(ip, c))
}

// Normaliza/valida a lista de CIDRs que o usuário cadastra em Configurações.
// Devolve { cidrs, error }.
export function parseCidrList(text) {
  const lines = String(text || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const cidrs = []
  for (const line of lines) {
    const [range, bitsStr] = line.split('/')
    const bits = bitsStr === undefined ? 32 : Number(bitsStr)
    if (ipToInt(range) == null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      return { cidrs: null, error: `Endereço inválido: "${line}". Use um IP (ex.: 1.2.3.4) ou faixa CIDR (ex.: 1.2.3.0/24).` }
    }
    cidrs.push(bitsStr === undefined ? `${range}/32` : `${range}/${bits}`)
  }
  return { cidrs: [...new Set(cidrs)], error: null }
}

function isGooglePaidUtm(row) {
  return /^(cpc|ppc)$/i.test(row.utm_medium || '') && /^google$/i.test(row.utm_source || '')
}

export function classifySource(row, internalCidrs = DEFAULT_INTERNAL_CIDRS) {
  if (row.is_test) return 'teste'
  if (isBotUa(row.user_agent) || isGoogleBotIp(row.ip)) return 'robo'
  if (isInternalIp(row.ip, internalCidrs) || host(row.referrer) === ADS_PREVIEW_HOST) return 'interno'
  if (row.gclid || row.gbraid || row.wbraid || isGooglePaidUtm(row)) return 'pago'
  if (PAID_MEDIUM.test(row.utm_medium || '')) return 'pago_outro'
  const ref = host(row.referrer)
  if (!ref || ref === host(row.landing_url)) return 'direto'
  if (SEARCH.test(ref + '.')) return 'organico'
  return 'referencia'
}

export function referrerHost(row) {
  return host(row.referrer)
}

// Leitura simples do user-agent: aparelho, sistema e navegador.
export function uaInfo(ua = '') {
  const s = String(ua)
  const device = /iPad|Tablet/i.test(s) ? 'Tablet' : /Mobi|Android|iPhone/i.test(s) ? 'Celular' : s ? 'Computador' : '—'
  const os = /iPhone|iPad|iOS/i.test(s)
    ? 'iOS'
    : /Android/i.test(s)
      ? 'Android'
      : /Windows/i.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(s)
          ? 'macOS'
          : /Linux/i.test(s)
            ? 'Linux'
            : ''
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /SamsungBrowser/.test(s)
        ? 'Samsung'
        : /FBAN|FBAV|Instagram/.test(s)
          ? 'App Facebook/Instagram'
          : /CriOS|Chrome\//.test(s)
            ? 'Chrome'
            : /FxiOS|Firefox\//.test(s)
              ? 'Firefox'
              : /Safari\//.test(s)
                ? 'Safari'
                : ''
  const bot = isBotUa(s)
  return { device, os, browser, bot }
}

// "https://site.com/pagina" (sem parâmetros e sem barra final), para juntar a
// mesma página vinda com gclid, utm etc.
export function pageKey(url) {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase().slice(0, 500)
  } catch {
    return null
  }
}
