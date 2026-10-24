const sysinfo = require('../utils/sysinfo');
const updater = require('../core/updater');
const db = require('../utils/database');

const countAntiDelete = db.prepare("SELECT COUNT(*) AS n FROM chat_features WHERE feature = 'antidelete' AND enabled = 1");

module.exports = {
    name: 'sysinfo',
    aliases: ['system', 'server'],
    category: 'Owner Only',
    description: 'Detail server: CPU, RAM, disk, versi tools, status fitur',
    ownerOnly: true,
    async execute(ctx) {
        const [b, s] = await Promise.all([sysinfo.basic(ctx), sysinfo.system()]);
        const c = ctx.config;
        const tool = (name, v) => `${v ? '✅' : '❌'} ${name}${v ? ` ${v}` : ' (belum terpasang)'}`;
        const onOff = v => (v ? 'AKTIF' : 'MATI');

        await ctx.reply([
            `🖥️ *Server*`,
            `OS: ${s.os}`,
            `CPU: ${s.cpu}`,
            `Load (1/5/15m): ${s.load}`,
            `RAM: ${s.ram}`,
            `Bot: ${s.botRam}`,
            ...(s.disk ? [`Disk: ${s.disk}`] : []),
            `Server nyala: ${s.machineUptime}`,
            `Database: ${s.dbSize}`,
            '',
            `🧰 *Tools*`,
            tool('ffmpeg', s.tools.ffmpeg),
            tool('tesseract', s.tools.tesseract),
            tool('yt-dlp', s.tools['yt-dlp']),
            tool('gallery-dl', s.tools['gallery-dl']),
            '',
            `⚙️ *Fitur*`,
            `Auto-read: ${onOff(c.autoRead)}`,
            `Anti-delete: aktif di ${countAntiDelete.get().n} grup`,
            `Downloader: ${onOff(c.downloader.enabled)}`,
            `Update otomatis: ${onOff(c.autoUpdate.enabled)}`,
            `Restart otomatis: ${updater.isSupervised() ? 'tersedia (ada pm2/systemd)' : 'TIDAK tersedia (jalankan lewat pm2)'}`,
            '',
            `🤖 v${b.version}${b.commit ? ` · ${b.commit}` : ''} · aktif ${b.uptime} · Node ${b.node}`
        ].join('\n'));
    }
};
