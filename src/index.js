const { startBot } = require('./core/connection');
const updater = require('./core/updater');

updater.onStart()
    .then(startBot)
    .catch(err => {
        console.error('[FATAL]', err);
        process.exit(1);
    });
