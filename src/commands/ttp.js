const { createTextSticker } = require('../utils/sticker');

const MAX_TEXT = 200;

/** Shared by /ttp (static) and /attp (animated). */
const textSticker = animated => async ctx => {
    const text = ctx.args.join(' ').trim() || ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
    const cmd = animated ? 'attp' : 'ttp';

    if (!text) return ctx.replyT(`✍️ Masukkan teksnya.\nContoh: \`${ctx.prefix}${cmd} halo dunia\``);
    if (text.length > MAX_TEXT) return ctx.replyT(`⚠️ Teksnya kepanjangan, maksimal ${MAX_TEXT} karakter.`);

    try {
        const sticker = await createTextSticker(text, {
            animated,
            packName: ctx.config.stickerPack,
            authorName: ctx.config.stickerAuthor
        });
        await ctx.send({ sticker });
    } catch (error) {
        console.error(`[${cmd.toUpperCase()} ERROR]`, error);
        await ctx.replyT('⚠️ Gagal membuat stiker teks.');
    }
};

module.exports = {
    name: 'ttp',
    category: 'Converter',
    description: 'Ubah teks jadi stiker (ukuran huruf menyesuaikan panjang teks)',
    execute: textSticker(false),
    textSticker
};
