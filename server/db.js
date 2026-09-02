import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Allow an explicit DB path (used by tests, and useful for deploys that want
// the SQLite file somewhere other than ./data). Falls back to ./data/smocha.db.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'smocha.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    bio TEXT DEFAULT '',
    last_seen TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hangouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    location TEXT NOT NULL,
    date TEXT NOT NULL,
    budget REAL DEFAULT 0,
    cover_photo TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hangout_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hangout_id INTEGER NOT NULL,
    photo_url TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (hangout_id) REFERENCES hangouts(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hangout_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('down', 'maybe', 'no')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(hangout_id, user_id),
    FOREIGN KEY (hangout_id) REFERENCES hangouts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Events feed scraper: normalized events pulled from external sources
  CREATE TABLE IF NOT EXISTS scraped_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL CHECK (source IN ('eventbrite', 'instagram', 'tiktok', 'x')),
    remote_url TEXT UNIQUE,
    external_account TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    location TEXT DEFAULT '',
    city TEXT DEFAULT 'Nairobi',
    category TEXT NOT NULL DEFAULT 'community',
    starts_at TEXT,
    ends_at TEXT,
    price REAL,
    organizer TEXT,
    image_path TEXT,
    link TEXT,
    hidden INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Event sources registry (admin-editable).
  -- platform: eventbrite | instagram | tiktok | x
  -- status:   active | paused | unreachable | challenged
  -- mirror_urls: JSON array of alternative viewer endpoints per platform
  CREATE TABLE IF NOT EXISTS event_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK (platform IN ('eventbrite', 'instagram', 'tiktok', 'x')),
    handle TEXT NOT NULL,
    category_bias TEXT DEFAULT 'community',
    label TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    consecutive_failures INTEGER DEFAULT 0,
    mirror_urls TEXT DEFAULT '[]',
    last_scraped_at TEXT,
    last_status TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Simple key/value store (e.g. events_last_refresh timestamp)
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migrations for older DBs
const cols = db.prepare("PRAGMA table_info(users)").all();
if (!cols.some((c) => c.name === 'last_seen')) {
  db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT');
}
if (!cols.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
}
// Token version — bump to revoke every existing JWT for a user (force re-login).
if (!cols.some((c) => c.name === 'token_version')) {
  db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0');
}

// Migrations for older DBs — events feed
const srcCols = db.prepare('PRAGMA table_info(event_sources)').all();
if (srcCols.length > 0) {
  if (!srcCols.some((c) => c.name === 'last_scraped_at')) {
    db.exec('ALTER TABLE event_sources ADD COLUMN last_scraped_at TEXT');
  }
  if (!srcCols.some((c) => c.name === 'last_status')) {
    db.exec("ALTER TABLE event_sources ADD COLUMN last_status TEXT DEFAULT ''");
  }
}

export default db;
