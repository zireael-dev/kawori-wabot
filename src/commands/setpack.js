const config = require('../core/config');

module.exports = {
    name: 'setwm',
    category: 'Owner Only',
    ownerOnly: true,
    description: 'Mengatur nama default pack dan author stiker (Owner Only)',
    async execute(ctx) {
        // Format: !setwm Nama Pack | Nama Pembuat
        const [packName, authorName] = ctx.args.join(' ').split('|').map(s => s.trim());

        if (!packName || !authorName) {
            return ctx.replyT(
                `⚠️ *Format Salah*\n\nContoh penggunaan:\n\`${ctx.prefix}setwm Kawori Pack | Zireael\`\n\n💡 Gunakan tanda vertikal (\`|\`) untuk memisahkan nama pack dan nama pembuat.`
            );
        }

        try {
            config.update({ stickerPack: packName, stickerAuthor: authorName });
        } catch (error) {
            console.error('[CONFIG SAVE ERROR]', error);
            return ctx.replyT('⚠️ Gagal menyimpan pengaturan ke `config.json`. Periksa izin akses file server.');
        }

        await ctx.replyT(
            `✅ *Default Stiker Diperbarui!*\n\n• *Pack Name:* \`${packName}\`\n• *Author:* \`${authorName}\`\n\nSemua stiker yang dibuat tanpa argumen khusus akan menggunakan metadata ini!`
        );
    }
};
