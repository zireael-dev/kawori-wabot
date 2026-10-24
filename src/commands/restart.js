const updater = require('../core/updater');

module.exports = {
    name: 'restart',
    category: 'Owner Only',
    description: 'Restart bot',
    ownerOnly: true,
    async execute(ctx) {
        if (!updater.isSupervised()) {
            return ctx.reply('⚠️ Bot tidak berjalan di bawah pm2/systemd/loop, jadi kalau dimatikan tidak akan menyala lagi. Restart manual, atau jalankan lewat `pm2 start ecosystem.config.js`.');
        }
        await ctx.reply('♻️ Restart sebentar...');
        updater.restart();
    }
};
