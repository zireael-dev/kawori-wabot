const config = require('../core/config');

/** Marks incoming messages as read (blue ticks). Switch with /autoread (owner only). */
module.exports = {
    name: 'autoRead',
    async onMessage(sock, msg) {
        if (!config.get().autoRead) return;

        const jid = msg.key.remoteJid;
        if (msg.key.fromMe || !msg.key.id || !jid) return;
        if (jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;

        await sock.readMessages([msg.key]);
    }
};
