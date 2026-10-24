const sessions = require('../utils/pdfSessions');
const { download } = require('../utils/media');
const { toJpeg } = require('../utils/pdf');
const config = require('../core/config');
const { extractText } = require('../core/context');
const { jidNormalizedUser } = require('@rexxhayanasi/elaina-baileys');

/** While someone is collecting pictures for /topdf, every photo they send in that chat is added. */
module.exports = {
    name: 'pdfCollect',
    async onMessage(sock, msg) {
        const image = msg.message?.imageMessage;
        if (!image || msg.key.fromMe) return;

        const chat = msg.key.remoteJid;
        const sender = jidNormalizedUser(msg.key.participant || chat).split('@')[0];
        const session = sessions.get(chat, sender);
        if (!session) return;

        // a photo with a command as caption (e.g. "/topdf") is handled by that command
        const caption = extractText(msg.message).trim();
        if (config.get().prefixes.some(p => caption.startsWith(p))) return;

        const react = text => sock.sendMessage(chat, { react: { text, key: msg.key } }).catch(() => {});
        try {
            const result = sessions.add(session, await toJpeg(await download({ target: msg })));
            await react(result === 'ok' ? '✅' : '⚠️');
            if (result !== 'ok') {
                await sock.sendMessage(chat, { text: result === 'full'
                    ? `⚠️ Maksimal ${sessions.MAX_IMAGES} halaman. Ketik /topdf done untuk membuat PDF-nya.`
                    : '⚠️ Total ukuran foto terlalu besar (maks 15 MB). Ketik /topdf done untuk membuat PDF-nya.' }, { quoted: msg });
            }
        } catch (error) {
            console.error('[PDF COLLECT ERROR]', error.message);
            await react('❌');
        }
    }
};
