const db = require('../utils/database');

const DAY_MS = 24 * 60 * 60 * 1000;

const upsertUser = db.prepare(`
    INSERT INTO users (phone, is_premium, expires_at) VALUES (@phone, 1, @expiresAt)
    ON CONFLICT(phone) DO UPDATE SET is_premium = 1, expires_at = @expiresAt
`);

module.exports = {
    name: 'addpremium',
    category: 'Owner Only',
    ownerOnly: true,
    description: 'Grant premium status to a user (Owner Only)',
    async execute(ctx) {
        // Format: !addpremium 628123456789 30  (phone + days)
        const phone = ctx.args[0]?.replace(/\D/g, '');
        const days = parseInt(ctx.args[1], 10);

        if (!phone || isNaN(days) || days <= 0) {
            return ctx.reply(
                `⚠️ *Invalid Format*\nUsage: \`${ctx.prefix}addpremium <phone_or_lid> <days>\`\nExample: \`${ctx.prefix}addpremium 6281234567890 30\``
            );
        }

        const expiresAt = Date.now() + days * DAY_MS;
        const expiresOn = new Date(expiresAt).toLocaleDateString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric'
        });

        try {
            upsertUser.run({ phone, expiresAt });
        } catch (error) {
            console.error('[DATABASE ERROR] Failed to add premium user:', error);
            return ctx.reply('⚠️ A database error occurred while saving the user.');
        }

        await ctx.reply(
            `🎉 *Premium Granted!*\n\n• *User ID:* \`${phone}\`\n• *Duration:* ${days} Days\n• *Expires On:* ${expiresOn}\n\nThey can now access all premium commands!`
        );
    }
};
