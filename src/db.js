import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;

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
      status      TEXT NOT NULL, -- approved | refunded | refund
      raw         TEXT,
      UNIQUE(order_id, type)
    );
    CREATE INDEX IF NOT EXISTS conversions_created ON conversions(created_at);
    CREATE INDEX IF NOT EXISTS conversions_subid ON conversions(subid);
  `)
  return db
}
