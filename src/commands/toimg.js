const { findMedia, download } = require('../utils/media');
const { isAnimatedWebp, webpToPng } = require('../utils/sticker');

module.exports = {
    name: 'toimg',
    aliases: ['toimage'],
    category: 'Converter',
    description: 'Ubah stiker (balas stikernya) menjadi gambar',
    async execute(ctx) {
        const media = findMedia(ctx.msg, ['sticker']);
        if (!media) return ctx.replyT(`🖼️ Balas stiker dengan \`${ctx.prefix}toimg\`.`);

        try {
            const buffer = await download(media);
            if (await isAnimatedWebp(buffer)) {
                return ctx.replyT('⚠️ Stiker animasi belum didukung, hanya stiker biasa.');
            }
            await ctx.send({ image: await webpToPng(buffer) });
        } catch (error) {
            console.error('[TOIMG ERROR]', error);
            await ctx.replyT('⚠️ Gagal mengubah stiker menjadi gambar.');
        }
    }
};
