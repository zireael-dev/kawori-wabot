const { findMedia, download } = require('../utils/media');
const { createCutoutMeme, parseWords } = require('../utils/cutout');
const { createWebpSticker } = require('../utils/sticker');

module.exports = {
    name: 'cutmeme',
    aliases: ['kata', 'wordmeme', 'ransom'],
    category: 'Converter',
    description: 'Meme kata-kata potongan: tiap kata punya gaya sendiri (teks | baris baru)',
    async execute(ctx) {
        // Flags: --right = text on the right side, --img = send as a picture instead of a sticker
        const flags = ctx.args.filter(a => a.startsWith('--'));
        const text = ctx.args.filter(a => !a.startsWith('--')).join(' ');
        const asImage = flags.includes('--img');
        const side = flags.includes('--right') ? 'right' : 'left';

        if (!parseWords(text).length) {
            return ctx.replyT(
                `✂️ *Meme Kata Potongan*\n\nKirim atau balas gambar dengan:\n\`${ctx.prefix}cutmeme kata kata kamu\`\n\nContoh:\n\`${ctx.prefix}cutmeme ketika satu sirkel punya pasangan masing masing | sedangkan saya belum bisa berkata\`\n\n• Tanda \`|\` = pindah baris\n• \`--right\` = teks di sisi kanan\n• \`--img\` = kirim sebagai gambar, bukan stiker`
            );
        }

        const media = findMedia(ctx.msg, ['image']);
        if (!media) return ctx.replyT('*Hah???* Kirim atau balas gambar dulu.');

        try {
            const meme = await createCutoutMeme(await download(media), text, { side });
            if (asImage) return await ctx.send({ image: meme });

            const sticker = await createWebpSticker(meme, false, ctx.config.stickerPack, ctx.config.stickerAuthor);
            await ctx.send({ sticker });
        } catch (error) {
            console.error('[CUTMEME ERROR]', error);
            await ctx.replyT('⚠️ *Gagal Membuat Meme*\nCoba lagi dengan gambar lain atau teks yang lebih pendek.');
        }
    }
};
