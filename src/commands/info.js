const sysinfo = require('../utils/sysinfo');

module.exports = {
    name: 'info',
    aliases: ['botinfo', 'status'],
    category: 'Others',
    description: 'Info bot: versi, uptime, kecepatan respons',
    async execute(ctx) {
        const i = await sysinfo.basic(ctx);
        const lines = [
            `🤖 *${i.name}* v${i.version}${i.commit ? ` · ${i.commit}` : ''}`,
            '',
            `⏱️ Aktif: ${i.uptime}`,
            ...(i.latency !== null ? [`⚡ Respons: ${i.latency} ms`] : []),
            `🧩 Perintah: ${i.commands}`,
            `🔤 Prefix: ${i.prefixes}`,
            `🟢 Node ${i.node} · Baileys ${i.library}`,
            '',
            `Ketik ${ctx.prefix}menu untuk daftar perintah.`
        ];
        await ctx.replyT(lines.join('\n'));
    }
};
