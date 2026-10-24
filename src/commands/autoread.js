const config = require('../core/config');

module.exports = {
    name: 'autoread',
    category: 'Owner Only',
    description: 'Tandai semua pesan masuk sebagai dibaca (centang biru) on/off',
    ownerOnly: true,
    async execute(ctx) {
        const action = (ctx.args[0] || '').toLowerCase();
        if (action === 'on' || action === 'off') {
            config.update({ autoRead: action === 'on' });
            return ctx.replyT(`✅ Auto-read sekarang *${action === 'on' ? 'AKTIF' : 'MATI'}*.`);
        }
        return ctx.replyT(`📖 Auto-read *${config.get().autoRead ? 'AKTIF' : 'MATI'}*.\nCara pakai: ${ctx.prefix}autoread on|off`);
    }
};
