// Diagnóstico no terminal: `npm run diagnostico` na pasta do rastreador.
// Mostra o mesmo que a página /diagnostico, em texto para copiar.
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb, getSetting } from '../src/db.js'
import { checkHttps } from '../src/health.js'
import { runDiagnostics, diagnosticsText } from '../src/diagnostics.js'
import { readVersion } from '../src/version.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const db = openDb(resolve(root, process.env.DB_PATH || 'dados/rastreador.db'))
const health = await checkHttps((process.env.PUBLIC_URL || '').replace(/\/+$/, ''))
const d = runDiagnostics(db, {
  health,
  exportDays: Number(process.env.EXPORT_DAYS || 30),
  defaultConversion: getSetting(db, 'default_conversion_name') || process.env.CONVERSION_NAME || 'Compra BuyGoods',
})
const v = readVersion(root)
console.log(`Versão ${v.hash || 'desconhecida'} · PORT=${process.env.PORT || 3101} · HOST=${process.env.HOST || '127.0.0.1'}`)
console.log(diagnosticsText(d))
