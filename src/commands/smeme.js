const { findMedia, download } = require('../utils/media');
const { createWebpSticker } = require('../utils/sticker');

const MAX_CAPTION = 120;

module.exports = {
    name: 'smeme',
    aliases: ['stickermeme', 'memesticker'],
    category: 'Converter',
    description: 'Stiker meme dengan teks atas dan bawah (teks atas | teks bawah)',
    async execute(ctx) {
        // "top | bottom". One part = top only. "| bottom" = bottom only.
        const [top = '', bottom = ''] = ctx.args.join(' ').split('|').map(s => s.trim());

        if (!top && !bottom) {
            return ctx.replyT(
                `😂 *Sticker Meme*\n\nKirim atau balas gambar/video dengan:\n\`${ctx.prefix}smeme teks atas | teks bawah\`\n\nContoh:\n• \`${ctx.prefix}smeme kalo ada yang gratis | gw yang pertama\`\n• \`${ctx.prefix}smeme cuma teks atas\`\n• \`${ctx.prefix}smeme | cuma teks bawah\`\n\n💡 Makin panjang teksnya, makin kecil hurufnya otomatis.`
            );
        }
        if (top.length > MAX_CAPTION || bottom.length > MAX_CAPTION) {
            return ctx.replyT(`⚠️ Teksnya kepanjangan, maksimal ${MAX_CAPTION} karakter per baris.`);
        }

        const media = findMedia(ctx.msg, ['image', 'video']);
        if (!media) return ctx.replyT('*Hah???* Kirim atau balas gambar/video dulu.');

        try {
            const sticker = await createWebpSticker(
                await download(media),
                media.kind === 'video',
                ctx.config.stickerPack,
                ctx.config.stickerAuthor,
                { top, bottom }
            );
            await ctx.send({ sticker });
        } catch (error) {
            console.error('[SMEME ERROR]', error);
            await ctx.replyT('⚠️ *Gagal Membuat Stiker Meme*\nPastikan medianya tidak rusak dan videonya maksimal 6 detik.');
        }
    }
};
