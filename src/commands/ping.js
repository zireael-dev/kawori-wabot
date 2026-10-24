module.exports = {
    name: 'ping',
    category: 'Others',
    description: 'Cek status respons bot',
    async execute(ctx) {
        // Write in Indonesian; replyT auto-translates if the chat is set to English.
        await ctx.replyT('🤖 Pong! Kawori-Bot berjalan normal dan siap digunakan.');
    }
};
