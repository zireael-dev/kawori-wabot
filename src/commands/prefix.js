const config = require('../core/config');

module.exports = {
    name: 'prefix',
    category: 'Owner Only',
    description: 'View or change the bot command prefixes',
    async execute(ctx) {
        const fmt = list => list.map(p => `\`${p}\``).join(', ');

        // Anyone may view the prefixes; only owners may change them.
        if (ctx.args.length === 0) {
            return ctx.reply(
                `⚙️ *Current Prefixes:* ${fmt(ctx.config.prefixes)}\n\n*Usage Examples:*\n• Single: \`${ctx.prefix}prefix /\`\n• Multiple: \`${ctx.prefix}prefix ! / .\``
            );
        }

        if (!ctx.isOwner) {
            return ctx.reply(`🚫 *Access Denied:* Your ID (${ctx.sender}) is not recognized as an authorized owner.`);
        }

        const prefixes = [...new Set(ctx.args)];
        config.update({ prefixes });
        await ctx.reply(`✅ *Prefixes Updated!*\nYou can now trigger commands using: ${fmt(prefixes)}`);
    }
};
