const updater = require('../core/updater');
const config = require('../core/config');

module.exports = {
    name: 'update',
    aliases: ['upgrade'],
    category: 'Owner Only',
    description: 'Ambil versi terbaru dari GitHub (check | auto on/off). Restart otomatis bila perlu',
    ownerOnly: true,
    async execute(ctx) {
        const sub = (ctx.args[0] || '').toLowerCase();

        if (sub === 'auto') {
            const value = (ctx.args[1] || '').toLowerCase();
            if (value === 'on' || value === 'off') {
                const autoUpdate = { ...config.get().autoUpdate, enabled: value === 'on' };
                config.update({ autoUpdate });
                return ctx.reply(`✅ Update otomatis *${value === 'on' ? 'AKTIF' : 'MATI'}* (cek tiap ${autoUpdate.intervalMin} menit).` +
                    (value === 'on' && !updater.isSupervised() ? '\n⚠️ Bot tidak berjalan di bawah pm2/systemd, jadi restart otomatis tidak bisa.' : ''));
            }
            const { enabled, intervalMin } = config.get().autoUpdate;
            return ctx.reply(`🔄 Update otomatis: *${enabled ? 'AKTIF' : 'MATI'}* (tiap ${intervalMin} menit).\nUbah: ${ctx.prefix}update auto on|off`);
        }

        try {
            const status = await updater.check();
            const now = `${status.current.hash} · ${status.current.date} · ${status.current.subject}`;

            if (sub === 'check' || sub === 'status') {
                return ctx.reply(status.behind
                    ? `🆕 ${status.behind} pembaruan tersedia:\n${status.log.join('\n')}\n\nJalankan ${ctx.prefix}update untuk memasang.`
                    : `✅ Sudah versi terbaru.\n${now}`);
            }

            if (!status.behind) return ctx.reply(`✅ Sudah versi terbaru.\n${now}`);

            await ctx.reply(`⬇️ Memasang ${status.behind} pembaruan...\n${status.log.join('\n')}`);
            const result = await updater.apply();

            if (!result.needsRestart) {
                return ctx.reply(`✅ Selesai. Hanya perintah/aset yang berubah, jadi langsung aktif tanpa restart.${result.installed ? '\n📦 Paket npm dipasang.' : ''}`);
            }
            if (!updater.isSupervised()) {
                return ctx.reply('✅ Terpasang, tapi bot perlu restart dan tidak berjalan di bawah pm2/systemd, jadi restart manual ya (lihat README bagian "Menjalankan terus-menerus").');
            }
            updater.markUpdate({ from: result.from, to: result.to, notify: ctx.jid });
            await ctx.reply(`✅ Terpasang${result.installed ? ' (+ paket npm)' : ''}. ♻️ Restart sebentar...`);
            updater.restart();
        } catch (error) {
            console.error('[UPDATE ERROR]', error.message);
            await ctx.reply(`⚠️ Update gagal.\n${error.message}`);
        }
    }
};
