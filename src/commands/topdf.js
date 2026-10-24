const sessions = require('../utils/pdfSessions');
const { findMedia, download } = require('../utils/media');
const { toJpeg, buildPdf } = require('../utils/pdf');

const sendPdf = (ctx, images, mode, name = 'kawori.pdf') =>
    ctx.send({ document: buildPdf(images, mode), mimetype: 'application/pdf', fileName: name });

module.exports = {
    name: 'topdf',
    aliases: ['pdf', 'imgtopdf'],
    category: 'Converter',
    description: 'Ubah foto menjadi PDF (satu foto, atau banyak halaman)',
    async execute(ctx) {
        const sub = (ctx.args[0] || '').toLowerCase();
        const modeArg = ctx.args.find(a => ['fit', 'a4'].includes(a.toLowerCase()));
        const mode = modeArg ? modeArg.toLowerCase() : 'a4';
        const session = sessions.get(ctx.jid, ctx.sender);
        const minutes = Math.round(sessions.TTL_MS / 60000);

        if (sub === 'cancel') {
            sessions.end(ctx.jid, ctx.sender);
            return ctx.replyT('🗑️ Dibatalkan, foto yang terkumpul dibuang.');
        }

        if (sub === 'done') {
            if (!session || !session.images.length) return ctx.replyT(`📄 Belum ada foto. Mulai dengan \`${ctx.prefix}topdf\`, lalu kirim fotonya.`);
            const images = session.images;
            sessions.end(ctx.jid, ctx.sender);
            try {
                await sendPdf(ctx, images, mode);
            } catch (error) {
                console.error('[TOPDF ERROR]', error);
                await ctx.replyT('⚠️ Gagal membuat PDF.');
            }
            return;
        }

        const media = findMedia(ctx.msg, ['image']);

        try {
            // one picture, right away
            if (media && !session) {
                const image = await toJpeg(await download(media));
                return await sendPdf(ctx, [image], mode);
            }

            // picture sent with the command while collecting: add it
            if (media && session) {
                const result = sessions.add(session, await toJpeg(await download(media)));
                if (result !== 'ok') return ctx.replyT('⚠️ Batas halaman/ukuran tercapai. Ketik /topdf done.');
                return ctx.replyT(`✅ Halaman ${session.images.length} ditambahkan. Lanjut kirim foto, atau \`${ctx.prefix}topdf done\`.`);
            }

            // no picture: start (or report) a multi-page session
            if (session) {
                return ctx.replyT(`📄 ${session.images.length} foto terkumpul. Kirim foto lagi, atau \`${ctx.prefix}topdf done\` untuk membuat PDF, \`${ctx.prefix}topdf cancel\` untuk batal.`);
            }
            sessions.start(ctx.jid, ctx.sender);
            return ctx.replyT(
                `📄 *Mode PDF dimulai.* Kirim foto-fotonya satu per satu (bot memberi ✅ tiap foto, maks ${sessions.MAX_IMAGES}).\n` +
                `Selesai: \`${ctx.prefix}topdf done\` (halaman A4) atau \`${ctx.prefix}topdf done fit\` (ukuran halaman mengikuti foto).\n` +
                `Batal: \`${ctx.prefix}topdf cancel\`. Otomatis berhenti setelah ${minutes} menit.\n\n` +
                `Tip: untuk satu foto saja, kirim foto dengan caption \`${ctx.prefix}topdf\`.`
            );
        } catch (error) {
            console.error('[TOPDF ERROR]', error);
            await ctx.replyT('⚠️ Gagal memproses foto.');
        }
    }
};
