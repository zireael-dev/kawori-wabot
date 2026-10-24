const config = require('../core/config');
const features = require('../utils/features');
const store = require('../utils/messageStore');
const { isGroupJid } = require('../utils/groups');

const REVOKE_STUB = 1;      // messageStubType of "message deleted for everyone"
const REVOKE_PROTOCOL = 0;  // protocolMessage.type of a delete request
const handled = new Set();  // a delete can be reported twice (event + message), forward it only once

const tag = jid => `@${String(jid).split('@')[0].split(':')[0]}`;

function header(row, deleter) {
    const { timezone } = config.get();
    const time = new Date(row.ts).toLocaleTimeString('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
    const lines = ['🗑️ *Pesan dihapus*', `👤 Pengirim: ${tag(row.sender)}`];
    if (deleter && deleter !== row.sender) lines.push(`🧹 Dihapus oleh: ${tag(deleter)}`);
    lines.push(`🕒 Dikirim: ${time}`);
    return lines.join('\n');
}

async function forward(sock, chat, id, deleterJid) {
    if (!isGroupJid(chat) || !features.isOn(chat, 'antidelete')) return;

    const key = `${chat}|${id}`;
    if (handled.has(key)) return;
    handled.add(key);
    if (handled.size > 500) handled.delete(handled.values().next().value);

    const row = store.take(chat, id);
    if (!row) return; // sent before the bot saw it, view-once, or older than the retention

    const mentions = [...new Set([row.sender, deleterJid].filter(Boolean))];
    const head = header(row, deleterJid);
    const withText = row.text ? `${head}\n\n${row.text}` : head;
    const media = row.media_path ? { url: row.media_path } : null;

    try {
        if (!media && row.kind === 'text') {
            await sock.sendMessage(chat, { text: withText, mentions });
        } else if (!media) {
            await sock.sendMessage(chat, { text: `${withText}\n\n_(${row.kind} tidak tersimpan: terlalu besar atau gagal diunduh)_`, mentions });
        } else if (row.kind === 'image') {
            await sock.sendMessage(chat, { image: media, caption: withText, mentions });
        } else if (row.kind === 'video') {
            await sock.sendMessage(chat, { video: media, caption: withText, mimetype: row.mimetype || 'video/mp4', mentions });
        } else if (row.kind === 'document') {
            await sock.sendMessage(chat, { document: media, mimetype: row.mimetype || 'application/octet-stream', fileName: row.file_name || 'file', caption: withText, mentions });
        } else {
            // voice notes and stickers cannot carry a caption: send the header first
            await sock.sendMessage(chat, { text: withText, mentions });
            if (row.kind === 'sticker') await sock.sendMessage(chat, { sticker: media });
            else await sock.sendMessage(chat, { audio: media, mimetype: row.mimetype || 'audio/ogg; codecs=opus', ptt: row.kind === 'voice' });
        }
    } finally {
        store.purge(); // also removes the media file of this message once it has been sent
        if (row.media_path) require('fs').rm(row.media_path, { force: true }, () => {});
    }
}

module.exports = {
    name: 'antiDelete',

    async onMessage(sock, msg) {
        await store.record(sock, msg);

        // some versions deliver the delete request as a normal message
        const request = msg.message?.protocolMessage;
        if (request?.type === REVOKE_PROTOCOL && request.key?.id) {
            await forward(sock, msg.key.remoteJid, request.key.id, msg.key.participant);
        }
    },

    async onUpdate(sock, updates) {
        for (const { key, update } of updates) {
            if (update?.messageStubType !== REVOKE_STUB) continue;
            await forward(sock, key.remoteJid, key.id, update.key?.participant);
        }
    }
};
