const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const config = require('../core/config');
const features = require('./features');
const { isGroupJid } = require('./groups');

/**
 * Keeps recent messages of groups with anti-delete switched on, for a limited time,
 * so a deleted message can be forwarded back (WhatsApp itself never gives the content again).
 */
const MEDIA_DIR = path.join(__dirname, '../../data/deleted');
const MAX_TEXT = 4000;
const HOUR = 60 * 60 * 1000;

const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO message_log (chat, id, sender, ts, kind, text, media_path, mimetype, file_name)
    VALUES (@chat, @id, @sender, @ts, @kind, @text, @media_path, @mimetype, @file_name)
`);
const selectStmt = db.prepare('SELECT * FROM message_log WHERE chat = ? AND id = ?');
const deleteStmt = db.prepare('DELETE FROM message_log WHERE chat = ? AND id = ?');
const forgetChatStmt = db.prepare('SELECT media_path FROM message_log WHERE chat = ? AND media_path IS NOT NULL');
const deleteChatStmt = db.prepare('DELETE FROM message_log WHERE chat = ?');
const expiredMediaStmt = db.prepare('SELECT chat, id, media_path FROM message_log WHERE media_path IS NOT NULL AND ts < ?');
const expiredTextStmt = db.prepare('DELETE FROM message_log WHERE ts < ?');

const VIEW_ONCE = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const MEDIA_KINDS = {
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    documentMessage: 'document'
};

const removeFile = file => { if (file) fs.rm(file, { force: true }, () => {}); };
const sizeOf = node => Number(node.fileLength?.toString?.() ?? node.fileLength ?? 0);

/**
 * Works out what a message contains. Returns null for things we deliberately never keep
 * (view-once media) and for messages without text or media.
 */
function describe(message) {
    let m = message;
    for (let i = 0; i < 4 && m; i++) {
        if (VIEW_ONCE.some(key => m[key])) return null;
        const inner = m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message;
        if (!inner) break;
        m = inner;
    }
    if (!m) return null;

    const text = m.conversation || m.extendedTextMessage?.text;
    if (text) return { kind: 'text', text: text.slice(0, MAX_TEXT) };

    for (const [key, kind] of Object.entries(MEDIA_KINDS)) {
        const node = m[key];
        if (!node) continue;
        if (node.viewOnce) return null;
        return {
            kind: kind === 'audio' && node.ptt ? 'voice' : kind,
            node,
            text: (node.caption || '').slice(0, MAX_TEXT),
            mimetype: node.mimetype || '',
            fileName: node.fileName || ''
        };
    }
    return null;
}

async function saveMedia(sock, msg, info, maxBytes) {
    const { downloadMediaMessage } = require('@rexxhayanasi/elaina-baileys');
    const bytes = sizeOf(info.node);
    if (bytes && bytes > maxBytes) return null; // too big to keep

    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger: sock.logger,
        reuploadRequest: sock.updateMediaMessage
    });
    if (!buffer || buffer.length > maxBytes) return null;

    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const name = crypto.createHash('sha1').update(`${msg.key.remoteJid}|${msg.key.id}`).digest('hex');
    const file = path.join(MEDIA_DIR, `${name}.bin`);
    fs.writeFileSync(file, buffer);
    return file;
}

/** Called for every new message. Does nothing unless the group has anti-delete on. */
async function record(sock, msg) {
    const chat = msg.key.remoteJid;
    if (!isGroupJid(chat) || msg.key.fromMe || !msg.key.id || !msg.message) return;
    if (!features.isOn(chat, 'antidelete')) return;

    const info = describe(msg.message);
    if (!info) return;

    let mediaPath = null;
    if (info.node) {
        try {
            mediaPath = await saveMedia(sock, msg, info, config.get().antiDelete.maxMediaMB * 1024 * 1024);
        } catch (error) {
            console.warn('[ANTIDELETE] could not save media:', error.message);
        }
    }

    insertStmt.run({
        chat,
        id: msg.key.id,
        sender: msg.key.participant || '',
        ts: Date.now(),
        kind: info.kind,
        text: info.text || '',
        media_path: mediaPath,
        mimetype: info.mimetype || '',
        file_name: info.fileName || ''
    });
}

/** Fetches (and removes) the stored copy of a message, or undefined if we never saw it. */
function take(chat, id) {
    const row = selectStmt.get(chat, id);
    if (row) deleteStmt.run(chat, id);
    return row;
}

/** Forget everything stored for a chat (used when anti-delete is switched off). */
function forgetChat(chat) {
    for (const row of forgetChatStmt.all(chat)) removeFile(row.media_path);
    deleteChatStmt.run(chat);
}

/** Deletes stored messages older than the configured retention. */
function purge() {
    const { textHours, mediaHours } = config.get().antiDelete;
    const now = Date.now();

    for (const row of expiredMediaStmt.all(now - mediaHours * HOUR)) {
        removeFile(row.media_path);
        deleteStmt.run(row.chat, row.id);
    }
    expiredTextStmt.run(now - textHours * HOUR);
}

purge();
setInterval(() => { try { purge(); } catch (e) { console.warn('[ANTIDELETE] purge failed:', e.message); } }, HOUR).unref();

module.exports = { record, take, forgetChat, purge, describe };
