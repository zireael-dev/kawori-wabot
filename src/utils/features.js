const db = require('./database');

/** Per-chat on/off switches stored in SQLite (table chat_features). Off unless switched on. */
const selectStmt = db.prepare('SELECT enabled FROM chat_features WHERE jid = ? AND feature = ?');
const upsertStmt = db.prepare(`
    INSERT INTO chat_features (jid, feature, enabled, updated_by, updated_at)
    VALUES (@jid, @feature, @enabled, @by, @at)
    ON CONFLICT(jid, feature) DO UPDATE SET enabled = @enabled, updated_by = @by, updated_at = @at
`);

const cache = new Map(); // "jid|feature" -> boolean, so busy chats don't hit the database per message

function isOn(jid, feature) {
    const key = `${jid}|${feature}`;
    if (!cache.has(key)) cache.set(key, Boolean(selectStmt.get(jid, feature)?.enabled));
    return cache.get(key);
}

function set(jid, feature, enabled, by = '') {
    upsertStmt.run({ jid, feature, enabled: enabled ? 1 : 0, by, at: Date.now() });
    cache.set(`${jid}|${feature}`, Boolean(enabled));
}

module.exports = { isOn, set };
