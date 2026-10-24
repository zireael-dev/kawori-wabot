const fs = require('fs');
const path = require('path');

/**
 * Listeners are always-on features that react to WhatsApp events instead of commands
 * (auto-read, anti-delete, collecting photos for /topdf, ...).
 * Drop a file in src/listeners/ exporting any of:
 *   name        label used in error logs
 *   onMessage(sock, msg)      every new incoming message (before commands run)
 *   onUpdate(sock, updates)   message updates, e.g. a message being deleted
 * It is loaded automatically on startup. A listener that throws never stops the others.
 */
const DIR = path.join(__dirname, '../listeners');
let loaded = null;

function load() {
    if (loaded) return loaded;
    loaded = [];
    for (const file of fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort()) {
        try {
            const mod = require(path.join(DIR, file));
            loaded.push({ ...mod, name: mod.name || file });
        } catch (error) {
            console.error(`[LISTENER LOAD ERROR] ${file}:`, error.message);
        }
    }
    return loaded;
}

async function run(hook, ...args) {
    for (const listener of load()) {
        if (typeof listener[hook] !== 'function') continue;
        try {
            await listener[hook](...args);
        } catch (error) {
            console.error(`[LISTENER ERROR] ${listener.name}.${hook}:`, error.message);
        }
    }
}

module.exports = {
    onMessage: (sock, msg) => run('onMessage', sock, msg),
    onUpdate: (sock, updates) => run('onUpdate', sock, updates)
};
