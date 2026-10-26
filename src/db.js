import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { classifySource } from './source.js'

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;

    -- Produto cadastrado. Cada um tem seu script e sua conversão no Google Ads.
    CREATE TABLE IF NOT EXISTS products (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      platform        TEXT NOT NULL DEFAULT 'buygoods',
      conversion_name TEXT NOT NULL,
      review_url      TEXT,
      created_at      TEXT NOT NULL,
      archived        INTEGER NOT NULL DEFAULT 0,
      -- Último sinal do script instalado na página.
      last_ping_at    TEXT,
      last_ping_url   TEXT,
      last_ping_links INTEGER,
      last_test_at    TEXT
    );

    -- Uma linha por visitante que chegou na página de review.
    CREATE TABLE IF NOT EXISTS clicks (
      id             TEXT PRIMARY KEY,
      created_at     TEXT NOT NULL,
      gclid          TEXT,
      gbraid         TEXT,
      wbraid         TEXT,
      campaign_id    TEXT,
      adgroup_id     TEXT,
      keyword        TEXT,
      matchtype      TEXT,
      device         TEXT,
      network        TEXT,
      utm_source     TEXT,
      utm_medium     TEXT,
      utm_campaign   TEXT,
      utm_content    TEXT,
      utm_term       TEXT,
      landing_url    TEXT,
      referrer       TEXT,
      ip             TEXT,
      user_agent     TEXT,
      outbound_at    TEXT,
      outbound_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS clicks_created ON clicks(created_at);

    -- Uma linha por postback recebido da BuyGoods.
    CREATE TABLE IF NOT EXISTS conversions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT NOT NULL,
      subid       TEXT,
      order_id    TEXT,
      type        TEXT,
      amount      REAL NOT NULL DEFAULT 0,
      product     TEXT,
      status      TEXT NOT NULL, -- approved | refunded | refund | test
      raw         TEXT,
      UNIQUE(order_id, type)
    );
    CREATE INDEX IF NOT EXISTS conversions_created ON conversions(created_at);
    CREATE INDEX IF NOT EXISTS conversions_subid ON conversions(subid);

    -- Imagem do produto (guardada no banco para entrar no backup).
    CREATE TABLE IF NOT EXISTS product_images (
      product_id TEXT PRIMARY KEY,
      mime       TEXT NOT NULL,
      data       BLOB NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Pequenos registros do sistema (ex.: quando o Google Ads leu a planilha).
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  // Colunas adicionadas depois da primeira versão (bancos já em produção).
  const cols = new Set(db.prepare('PRAGMA table_info(clicks)').all().map((c) => c.name))
  if (!cols.has('product_id')) db.exec('ALTER TABLE clicks ADD COLUMN product_id TEXT')
  if (!cols.has('is_test')) db.exec('ALTER TABLE clicks ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0')
  if (!cols.has('source')) {
    // Origem da visita: calculada uma vez para as visitas antigas.
    db.exec('ALTER TABLE clicks ADD COLUMN source TEXT')
    const upd = db.prepare('UPDATE clicks SET source = ? WHERE id = ?')
    for (const r of db.prepare('SELECT * FROM clicks').all()) upd.run(classifySource(r), r.id)
  }
  db.exec('CREATE INDEX IF NOT EXISTS clicks_product ON clicks(product_id, created_at)')
  const pcols = new Set(db.prepare('PRAGMA table_info(products)').all().map((c) => c.name))
  if (!pcols.has('affiliate_url')) db.exec('ALTER TABLE products ADD COLUMN affiliate_url TEXT')
  if (!pcols.has('tracking_param')) db.exec('ALTER TABLE products ADD COLUMN tracking_param TEXT')

  return db
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? JSON.parse(row.value) : null
}

export function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  )
}
