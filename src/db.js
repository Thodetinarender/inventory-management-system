const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

function initDatabase(customPath) {
  const dbPath = customPath || process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'stockflow.db');

  if (dbPath !== ':memory:') {
    const folder = path.dirname(dbPath);
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  try {
    db.exec('PRAGMA foreign_keys = ON;');
    if (dbPath !== ':memory:') {
      db.exec('PRAGMA journal_mode = WAL;');
    }
  } catch (err) {
    // WAL pragma might not apply to memory databases
  }

  // Schema definition
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      description TEXT,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      cost_price REAL,
      selling_price REAL,
      low_stock_threshold INTEGER,
      last_updated_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      UNIQUE(organization_id, sku)
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      change_amount INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      note TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(organization_id, sku);
  `);

  return db;
}

function getDatabase() {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}

module.exports = {
  initDatabase,
  getDatabase,
  // backward-compatible aliases
  getDb: initDatabase,
  getDefaultDb: getDatabase
};
