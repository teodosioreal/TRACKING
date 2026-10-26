// Origem da visita e aparelho/navegador, a partir do que o script envia.

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia|brave|search\.aol|ask)\./i
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_search|cpm|display|ads?)$/i

export const SOURCES = {
  pago: 'Pago (Google Ads)',
  pago_outro: 'Pago (outro)',
  organico: 'Orgânico',
  referencia: 'Referência',
  direto: 'Direto',
  teste: 'Teste',
}

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function classifySource(row) {
  if (row.is_test) return 'teste'
  if (row.gclid || row.gbraid || row.wbraid) return 'pago'
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
  const bot = /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(s)
  return { device, os, browser, bot }
}
