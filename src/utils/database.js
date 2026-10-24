// Node's built-in SQLite (Node >= 22.13): no native module to compile.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Saves kawori.db in the root directory
const dbPath = path.join(__dirname, '../../kawori.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better performance on your mini PC
db.exec('PRAGMA journal_mode = WAL;');

// Initialize all required tables
db.exec(`
/* Table for Premium Users (Dual-ID support) */
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    lid TEXT UNIQUE,
    is_premium BOOLEAN DEFAULT 0,
    expires_at INTEGER DEFAULT 0
);

/* Table to remember language preferences per chat/group */
CREATE TABLE IF NOT EXISTS chat_settings (
    jid TEXT PRIMARY KEY,
    lang TEXT DEFAULT 'id'
);

/* Table to cache translations so we never call the API twice for the same sentence */
CREATE TABLE IF NOT EXISTS translations_cache (
    original_text TEXT,
    target_lang TEXT,
    translated_text TEXT,
    PRIMARY KEY (original_text, target_lang)
);

/* Per-chat on/off switches (e.g. antidelete) */
CREATE TABLE IF NOT EXISTS chat_features (
    jid TEXT NOT NULL,
    feature TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at INTEGER,
    PRIMARY KEY (jid, feature)
);

/* Recent group messages, kept briefly so deleted ones can be forwarded back */
CREATE TABLE IF NOT EXISTS message_log (
    chat TEXT NOT NULL,
    id TEXT NOT NULL,
    sender TEXT,
    ts INTEGER NOT NULL,
    kind TEXT,
    text TEXT,
    media_path TEXT,
    mimetype TEXT,
    file_name TEXT,
    PRIMARY KEY (chat, id)
);
CREATE INDEX IF NOT EXISTS idx_message_log_ts ON message_log (ts);

/* NEW: Lightweight tracker for menu popularity */
CREATE TABLE IF NOT EXISTS category_usage (
    category TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0
);
`);

module.exports = db;
