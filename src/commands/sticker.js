const { findMedia, download } = require('../utils/media');
const { createWebpSticker } = require('../utils/sticker');

module.exports = {
    name: 'sticker',
    aliases: ['s', 'stiker', 'stik'],
    category: 'Converter',
    description: 'Membuat stiker dari gambar, GIF, atau video pendek (< 6 detik)',
    async execute(ctx) {
        const media = findMedia(ctx.msg, ['image', 'video']);
        if (!media) return ctx.replyT('*Hah???*');

        try {
            // "!s Pack | Author" overrides the defaults from config.json.
            const [pack, author] = ctx.args.join(' ').split('|').map(s => s.trim());
            const sticker = await createWebpSticker(
                await download(media),
                media.kind === 'video',
                pack || ctx.config.stickerPack,
                author || ctx.config.stickerAuthor
            );
            await ctx.send({ sticker });
        } catch (error) {
            console.error('[STICKER ERROR]', error);
            await ctx.replyT('⚠️ *Gagal Membuat Stiker*\nWaduh, gagal ngolah medianya! Pastikan videonya gak rusak atau kepanjangan (maksimal 6 detik).');
        }
    }
};
