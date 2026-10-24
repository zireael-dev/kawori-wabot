const fs = require('fs');
const path = require('path');
const db = require('../utils/database');

const BANNER = path.join(__dirname, '../../assets/banner.jpg');
const CATEGORY_ORDER = ['CONVERTER', 'DOWNLOADER', 'TOOLS/UTILITY', 'OWNER ONLY', 'OTHERS'];

const topCategory = db.prepare('SELECT category FROM category_usage ORDER BY count DESC LIMIT 1');

/** Groups commands by category, sorted by CATEGORY_ORDER then alphabetically. */
function groupByCategory(commands) {
    const groups = {};
    for (const cmd of commands) {
        if (!cmd.description) continue;
        (groups[(cmd.category || 'Others').toUpperCase()] ||= []).push(cmd);
    }

    const rank = c => (CATEGORY_ORDER.includes(c) ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length);
    const names = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return { groups, names };
}

function subMenuText(category, commands, prefix) {
    const lines = commands.map(cmd => {
        let line = `• *\`${prefix}${cmd.name}\`* - ${cmd.description}\n`;
        if (cmd.aliases?.length) {
            line += `  💡 *Bisa juga ketik:* ${cmd.aliases.map(a => `\`${prefix}${a}\``).join(', ')}\n`;
        }
        return line;
    });
    return `📂 *SUB-MENU: ${category}*\n\n${lines.join('\n')}\n💡 *Tips:* Ketik \`${prefix}menu\` untuk kembali ke daftar utama.`;
}

module.exports = {
    name: 'menu',
    category: 'Others',
    description: 'Menampilkan menu interaktif dengan pelacak populer & prefiks dinamis',
    async execute(ctx) {
        const { prefix, config } = ctx;
        const { groups, names } = groupByCategory(ctx.commands);

        // "!menu 2" or "!menu converter" opens a sub-menu.
        const input = ctx.args[0]?.toLowerCase();
        if (input) {
            const selected = names[parseInt(input, 10) - 1] || names.find(c => c.toLowerCase() === input);
            if (selected) return ctx.replyT(subMenuText(selected, groups[selected], prefix));
        }

        // Main menu
        const popular = topCategory.get()?.category || names[0];
        const row = (cat, description) => ({
            header: '',
            title: cat,
            description,
            id: `${prefix}menu ${names.indexOf(cat) + 1}`
        });

        const sections = [
            {
                title: await ctx.t('🔥 Kategori Terpopuler'),
                highlight_label: await ctx.t('⭐ Favorit'),
                rows: [{
                    ...row(popular, `Kategori paling sering digunakan oleh pengguna! (${groups[popular]?.length || 0} perintah)`),
                    title: `🔥 ${popular}`
                }]
            },
            {
                title: await ctx.t('📁 Semua Kategori'),
                rows: names.map(cat => ({
                    ...row(cat, `Lihat ${groups[cat].length} perintah di dalam kategori ini`),
                    title: `📁 ${cat}`
                }))
            }
        ];

        const text = `${await ctx.t('🤖 *KAWORI-BOT COMMAND CENTER*')}\n\n${await ctx.t(
            `Pilih menu melalui daftar di bawah.\n\n💡 *Prefiks Aktif:* [  \`${config.prefixes.join('  ')}\`  ]`
        )}`;

        const payload = {
            footer: await ctx.t('Kawori-Bot • Dynamic Architecture'),
            buttons: [
                { text: await ctx.t('📋 Menu'), sections },
                { text: await ctx.t('🌐 Change Language'), id: `${prefix}lang toggle` },
                { text: await ctx.t('💎 Buy Premium'), id: '#PREMIUM_COMING_SOON' }
            ],
            ...(fs.existsSync(BANNER) ? { image: { url: BANNER }, caption: text } : { text })
        };

        await ctx.send(payload);
    }
};
