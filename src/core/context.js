const { jidNormalizedUser } = require('@rexxhayanasi/elaina-baileys');
const config = require('./config');
const registry = require('./registry');
const { isGroupJid, isGroupAdmin } = require('../utils/groups');
const { t } = require('../utils/i18n');

/** Pulls the text out of normal messages, captions, and button/list replies. */
function extractText(message) {
    const m = message;
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
    if (m.templateButtonReplyMessage?.selectedId) return m.templateButtonReplyMessage.selectedId;
    if (m.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return m.listResponseMessage.singleSelectReply.selectedRowId;
    }
    const flow = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (flow) {
        try { return JSON.parse(flow).id || ''; } catch { return ''; }
    }
    return '';
}

/**
 * Builds the object every command receives.
 * Commands only use `ctx` and never need to touch sock/msg/config directly.
 */
function createContext(sock, msg, { prefix, args }) {
    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || jid;
    const sender = jidNormalizedUser(senderJid).split('@')[0];

    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

    return {
        sock, msg, jid, args, prefix, sender, senderJid,
        isGroup: isGroupJid(jid),
        isAdmin: () => isGroupAdmin(sock, jid, senderJid), // group admin? (async)
        config: config.get(),
        isOwner: config.ownerIds().includes(sender),
        commands: registry.list(),
        reply,                                    // send text as-is
        replyT: async (text) => reply(await t(text, jid)), // translate to the chat's language first
        t: (text) => t(text, jid),
        send: (content) => sock.sendMessage(jid, content, { quoted: msg })
    };
}

module.exports = { createContext, extractText };
