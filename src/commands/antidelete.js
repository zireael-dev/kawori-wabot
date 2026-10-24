const features = require('../utils/features');
const store = require('../utils/messageStore');

module.exports = {
    name: 'antidelete',
    aliases: ['antihapus'],
    category: 'Tools/Utility',
    description: 'Tampilkan lagi pesan yang dihapus di grup (on: admin/owner, off: owner)',
    async execute(ctx) {
        if (!ctx.isGroup) return ctx.replyT('ℹ️ Anti-delete hanya bisa dipakai di grup.');

        const action = (ctx.args[0] || 'status').toLowerCase();
        const on = features.isOn(ctx.jid, 'antidelete');
        const { antiDelete } = ctx.config;

        if (action === 'status') {
            return ctx.replyT(on
                ? `🗑️ Anti-delete di grup ini *AKTIF*.\nMematikan: hanya owner (${ctx.prefix}antidelete off)`
                : `🗑️ Anti-delete di grup ini *MATI*.\nMenyalakan: admin grup atau owner (${ctx.prefix}antidelete on)`);
        }

        if (action === 'on') {
            if (!ctx.isOwner && !(await ctx.isAdmin())) return ctx.replyT('🚫 Hanya admin grup atau owner bot yang bisa menyalakan ini.');
            if (on) return ctx.replyT('ℹ️ Anti-delete sudah aktif.');
            features.set(ctx.jid, 'antidelete', true, ctx.sender);
            return ctx.replyT(
                `🗑️ *Anti-delete AKTIF.*\nBot menyimpan sementara pesan grup ini (teks ${antiDelete.textHours} jam, foto/video/VN ${antiDelete.mediaHours} jam, file maks ${antiDelete.maxMediaMB} MB) dan menampilkannya lagi di sini bila ada yang menghapusnya untuk semua orang. Media sekali-lihat tidak pernah disimpan.\nHanya owner bot yang bisa mematikannya.`
            );
        }

        if (action === 'off') {
            if (!ctx.isOwner) return ctx.replyT('🚫 Hanya owner bot yang bisa mematikan anti-delete.');
            if (!on) return ctx.replyT('ℹ️ Anti-delete sudah mati.');
            features.set(ctx.jid, 'antidelete', false, ctx.sender);
            store.forgetChat(ctx.jid);
            return ctx.replyT('✅ Anti-delete dimatikan. Pesan yang tersimpan dari grup ini sudah dihapus.');
        }

        return ctx.replyT(`Cara pakai: ${ctx.prefix}antidelete [on|off|status]`);
    }
};
