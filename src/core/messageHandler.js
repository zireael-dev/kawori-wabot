const config = require('./config');
const registry = require('./registry');
const db = require('../utils/database');
const { createContext, extractText } = require('./context');

const trackUsage = db.prepare(`
    INSERT INTO category_usage (category, count) VALUES (?, 1)
    ON CONFLICT(category) DO UPDATE SET count = count + 1
`);

/** Splits "!sticker a | b" into { prefix: '!', name: 'sticker', args: ['a', '|', 'b'] }. */
function parseCommand(text) {
    const prefix = config.get().prefixes.find(p => text.startsWith(p));
    if (!prefix) return null;

    const args = text.slice(prefix.length).trim().split(/ +/);
    const name = (args.shift() || '').toLowerCase();
    return name ? { prefix, name, args } : null;
}

async function handleMessage(sock, msg) {
    if (!msg.message || msg.key.fromMe) return;

    const parsed = parseCommand(extractText(msg.message));
    if (!parsed) return;

    const command = registry.find(parsed.name);
    if (!command) return;

    const ctx = createContext(sock, msg, parsed);

    try {
        // Shared guards: a command only has to declare `ownerOnly: true`.
        if (command.ownerOnly && !ctx.isOwner) {
            return await ctx.replyT('🚫 *Access Denied:* Perintah ini hanya untuk owner bot.');
        }

        try {
            trackUsage.run((command.category || 'Others').toUpperCase());
        } catch (e) {
            console.warn('[USAGE TRACKING WARNING]', e.message);
        }

        await command.execute(ctx);
    } catch (error) {
        console.error(`[EXECUTION ERROR] in command [${command.name}]:`, error);
        await ctx.replyT('⚠️ Terjadi kesalahan saat menjalankan perintah tersebut.').catch(() => {});
    }
}

module.exports = { handleMessage };
