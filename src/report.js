// Relatório que o script do Google Ads manda depois de cada execução.

const str = (v, max) => (v == null ? null : String(v).slice(0, max))

// Aceita só os campos esperados, com tamanhos limitados.
export function parseScriptReport(body, now = new Date()) {
  let data
  try {
    data = JSON.parse(body)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const enviadas = Number.isInteger(data.enviadas) && data.enviadas >= 0 ? Math.min(data.enviadas, 1e6) : 0
  const porConversao = {}
  if (data.porConversao && typeof data.porConversao === 'object') {
    for (const [k, v] of Object.entries(data.porConversao).slice(0, 50)) {
      if (Number.isInteger(v) && v >= 0) porConversao[str(k, 100)] = Math.min(v, 1e6)
    }
  }
  const conta =
    data.conta && typeof data.conta === 'object' ? { id: str(data.conta.id, 20), nome: str(data.conta.nome, 100) } : null
  return { at: now.toISOString(), enviadas, porConversao, erro: str(data.erro, 500) || null, conta }
}
