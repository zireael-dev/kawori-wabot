const dl = require('../utils/downloader');

module.exports = {
    name: 'updatedl',
    category: 'Owner Only',
    description: 'Perbarui yt-dlp (dipakai /dl) dan tampilkan versi',
    ownerOnly: true,
    async execute(ctx) {
        const before = await dl.version('yt-dlp');
        if (!before) return ctx.replyT('⚠️ yt-dlp belum terpasang di server bot.');

        await ctx.replyT(`🔄 Memperbarui yt-dlp (sekarang ${before})...`);
        try {
            const output = await dl.updateYtdlp();
            const after = await dl.version('yt-dlp');
            await ctx.reply(`✅ yt-dlp: ${before} → ${after}\n\n${output}`);
        } catch (error) {
            await ctx.reply(`⚠️ Update otomatis gagal (${error.message}).\nJika dipasang lewat pip: \`pip install -U yt-dlp\`.`);
        }
        const gallery = await dl.version('gallery-dl');
        await ctx.reply(`ℹ️ gallery-dl: ${gallery || 'belum terpasang (hanya perlu untuk foto Instagram)'}`);
    }
};
