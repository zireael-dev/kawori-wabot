const fs = require('fs');
const dl = require('../utils/downloader');

const VIDEO_INLINE_MB = 16; // bigger videos are sent as a file so WhatsApp does not refuse them

const reason = {
    unsupported: '⚠️ Link ini tidak didukung. Yang bisa: TikTok, Instagram (post/reel), Facebook (video/reel).',
    login: '🔒 Konten ini privat atau butuh login, jadi tidak bisa diunduh.',
    gone: '🤷 Konten tidak ditemukan (mungkin sudah dihapus atau akunnya privat).',
    rate_limit: '⏳ Sedang dibatasi oleh platformnya. Coba lagi beberapa menit lagi.',
    timeout: '⌛ Terlalu lama diproses, dibatalkan. Coba lagi nanti.',
    live: '📡 Siaran langsung tidak bisa diunduh.',
    slideshow: '🖼️ Postingan slideshow foto TikTok belum didukung, hanya video.',
    queue_full: '🚦 Antrian unduhan sedang penuh, coba lagi sebentar lagi.',
    need_ytdlp: '⚠️ Fitur unduh belum aktif: yt-dlp belum terpasang di server bot.',
    need_gallerydl: '⚠️ Postingan foto Instagram butuh gallery-dl, yang belum terpasang di server bot.'
};

function explain(error, config) {
    const cfg = config.downloader;
    if (error.code === 'too_long') return `⏱️ Videonya terlalu panjang (maks ${Math.round(cfg.maxDurationSec / 60)} menit).`;
    if (error.code === 'too_big') return `📦 Filenya terlalu besar (maks ${cfg.maxFileMB} MB).`;
    if (error.code === 'no_video') return '🖼️ Postingan ini berisi foto dan butuh gallery-dl untuk diunduh.';
    return reason[error.code] || '⚠️ Gagal mengunduh. Coba lagi nanti.';
}

/** Link from the command text, or from the message that was replied to. */
function findLink(ctx) {
    const quoted = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || quoted?.imageMessage?.caption || quoted?.videoMessage?.caption || '';
    return dl.classify(ctx.args.join(' ')) || dl.classify(quotedText);
}

async function sendResult(ctx, result, caption) {
    const items = result.items;

    if (items.every(i => i.type === 'image')) {
        for (const [index, item] of items.entries()) {
            await ctx.send({ image: { url: item.file }, ...(index === 0 && { caption }) });
        }
        return;
    }

    for (const [index, item] of items.entries()) {
        const note = index === 0 ? caption : undefined;
        if (item.type === 'image') await ctx.send({ image: { url: item.file }, caption: note });
        else if (item.size <= VIDEO_INLINE_MB * 1024 * 1024) await ctx.send({ video: { url: item.file }, mimetype: 'video/mp4', caption: note });
        else await ctx.send({ document: { url: item.file }, mimetype: 'video/mp4', fileName: `video_${index + 1}.mp4`, caption: note });
    }
}

module.exports = {
    name: 'dl',
    aliases: ['download', 'tiktok', 'tt', 'ig', 'instagram', 'fb', 'facebook'],
    category: 'Downloader',
    description: 'Unduh video/foto dari link TikTok (tanpa watermark), Instagram, Facebook',
    async execute(ctx) {
        const cfg = ctx.config.downloader;
        if (!cfg.enabled) return ctx.replyT('⚠️ Fitur unduh sedang dimatikan.');

        const link = findLink(ctx);
        if (!link) {
            return ctx.replyT(
                `⬇️ *Downloader*\nKirim: \`${ctx.prefix}dl <link>\` (atau balas pesan berisi link dengan \`${ctx.prefix}dl\`).\n\n` +
                '• TikTok: video tanpa watermark\n• Instagram: post (foto/video) dan reel\n• Facebook: video dan reel'
            );
        }

        if (!ctx.isOwner) {
            const wait = dl.cooldownLeft(ctx.sender);
            if (wait > 0) return ctx.replyT(`⏳ Tunggu ${wait} detik lagi sebelum mengunduh berikutnya.`);
        }

        const react = text => ctx.sock.sendMessage(ctx.jid, { react: { text, key: ctx.msg.key } }).catch(() => {});
        const busy = dl.queueLength() >= Math.max(1, cfg.concurrency);
        if (busy) await ctx.replyT('🚦 Ada unduhan lain yang sedang berjalan, kamu masuk antrian.');
        await react('⏳');

        let result;
        try {
            result = await dl.enqueue(ctx.sender, async () => {
                const url = await dl.resolveLink(link.url);
                return dl.download(link.platform, url);
            }, { skipCooldown: ctx.isOwner });

            const caption = result.watermarked
                ? '⚠️ Versi tanpa watermark tidak tersedia untuk video ini, jadi ini versi aslinya (ada watermark).'
                : undefined;
            await sendResult(ctx, result, caption);
            await react('✅');
        } catch (error) {
            await react('❌');
            if (!(error instanceof dl.DownloadError) || error.code === 'failed') console.error('[DL ERROR]', error.message);
            await ctx.reply(await ctx.t(explain(error, ctx.config)));
        } finally {
            result?.cleanup();
        }
    }
};
