// Cópia consistente do banco em dados/backups, guardando os últimos 14 dias.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const dbPath = resolve(root, process.env.DB_PATH || 'dados/rastreador.db')
const dir = join(dirname(dbPath), 'backups')
mkdirSync(dir, { recursive: true })

const file = join(dir, `rastreador-${new Date().toISOString().slice(0, 10)}.db`)
rmSync(file, { force: true })
new DatabaseSync(dbPath).exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
console.log(`Backup salvo em ${file}`)

const old = readdirSync(dir).filter((f) => f.endsWith('.db')).sort().slice(0, -14)
for (const f of old) rmSync(join(dir, f))
