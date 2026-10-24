const { getChatLang, setChatLang } = require('../utils/i18n');

const LANGS = { id: 'Bahasa Indonesia', en: 'English' };

module.exports = {
    name: 'lang',
    category: 'Others',
    description: 'Mengubah bahasa bot secara otomatis / Switch bot language (en/id)',
    async execute(ctx) {
        const current = getChatLang(ctx.jid);
        const input = ctx.args[0]?.toLowerCase();

        // No argument or "toggle" (the menu button) flips the language.
        let next;
        if (!input || input === 'toggle') next = current === 'id' ? 'en' : 'id';
        else if (LANGS[input]) next = input;
        else {
            return ctx.replyT(
                `🌐 *Pengaturan Bahasa*\n\nBahasa yang tersedia: \`id\` (Indonesia), \`en\` (English)\nContoh penggunaan: \`${ctx.prefix}lang en\``
            );
        }

        setChatLang(ctx.jid, next);
        await ctx.replyT(`✅ Bahasa berhasil diubah ke: *${LANGS[next]}*!`);
    }
};
