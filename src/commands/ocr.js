const translate = require('google-translate-api-x');
const { findMedia, download } = require('../utils/media');
const { readText } = require('../utils/ocr');

const MAX_REPLY = 3500; // WhatsApp handles long texts, but this keeps replies readable

module.exports = {
    name: 'ocr',
    aliases: ['totext', 'scan'],
    category: 'Converter',
    description: 'Ambil teks dari foto (balas fotonya). Tambah kode bahasa untuk menerjemahkan, mis. /ocr en',
    async execute(ctx) {
        const media = findMedia(ctx.msg, ['image']);
        if (!media) {
            return ctx.replyT(`🔎 Kirim foto dengan caption \`${ctx.prefix}ocr\`, atau balas foto dengan \`${ctx.prefix}ocr\`.\nUntuk sekalian menerjemahkan: \`${ctx.prefix}ocr en\` (kode bahasa apa saja, mis. id, en, ja).`);
        }

        const target = (ctx.args[0] || '').toLowerCase();
        if (target && !/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(target)) {
            return ctx.replyT('⚠️ Kode bahasa tidak valid. Contoh: en, id, ja, ar, zh-cn.');
        }

        try {
            const text = await readText(await download(media));
            if (!text) return ctx.replyT('🤷 Tidak ada teks yang terbaca. Coba foto yang lebih jelas, lurus, dan terang.');

            let out = `📝 *Hasil OCR*\n\n${text}`;
            if (target) {
                try {
                    const res = await translate(text, { to: target });
                    out += `\n\n🌐 *Terjemahan (${target})*\n\n${res.text}`;
                } catch (error) {
                    console.error('[OCR TRANSLATE ERROR]', error.message);
                    out += '\n\n⚠️ Terjemahan gagal, hanya teks asli yang ditampilkan.';
                }
            }

            if (out.length <= MAX_REPLY) return ctx.reply(out);

            // very long text: send it in pieces
            for (let i = 0; i < out.length; i += MAX_REPLY) await ctx.reply(out.slice(i, i + MAX_REPLY));
        } catch (error) {
            console.error('[OCR ERROR]', error);
            await ctx.replyT(error.message.includes('tesseract is not installed')
                ? '⚠️ OCR belum aktif: tesseract belum terpasang di server bot.'
                : '⚠️ Gagal membaca teks dari gambar.');
        }
    }
};
