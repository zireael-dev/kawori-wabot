const { downloadMediaMessage } = require('@rexxhayanasi/elaina-baileys');

const KINDS = {
    image: 'imageMessage',
    video: 'videoMessage',
    sticker: 'stickerMessage'
};

/**
 * Finds media on the message itself or on the message it replies to.
 * `kinds` is a list like ['image', 'video']. Returns { kind, target } or null.
 */
function findMedia(msg, kinds) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted ? { message: quoted } : msg;

    for (const kind of kinds) {
        if (target.message?.[KINDS[kind]]) return { kind, target };
    }
    return null;
}

const download = ({ target }) => downloadMediaMessage(target, 'buffer');

module.exports = { findMedia, download };
