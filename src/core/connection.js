const baileys = require('@rexxhayanasi/elaina-baileys');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = baileys;
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const config = require('./config');
const { handleMessage } = require('./messageHandler');
const listeners = require('./listeners');
const updater = require('./updater');

const RECONNECT_MIN_MS = 3000;
const RECONNECT_MAX_MS = 60000;

// DisconnectReason is { loggedOut: 401, ... }, so flip it to turn a code back into a name.
const reasonName = code => Object.keys(DisconnectReason).find(k => DisconnectReason[k] === code) || 'unknown';

let reconnectDelay = RECONNECT_MIN_MS;
let waVersion;           // latest WhatsApp Web version, fetched once
let versionChecked = false;
let current = null; // the newest socket; events from older ones are ignored

/** Asks WhatsApp for a pairing code. Never throws: a failed attempt is retried by the next connection. */
async function requestPairing(sock) {
    const number = config.botNumber();
    if (!number) {
        console.error('❌ Set "botNumber" in config.json (or BOT_NUMBER env) to get a pairing code.');
        return;
    }

    try {
        const code = await sock.requestPairingCode(number);
        console.log(`\n🔗 PAIRING CODE for ${number}: ${code}`);
        console.log('   WhatsApp > Linked devices > Link with phone number. Use the LATEST code shown.\n');
    } catch (error) {
        console.error(`⚠️ Could not get a pairing code (${error.message}). Will try again on the next connection.`);
    }
}

/** Reads the live WhatsApp Web build number straight from web.whatsapp.com. */
async function scrapeWaWebVersion() {
    const res = await fetch('https://web.whatsapp.com/sw.js', { headers: { 'user-agent': 'Mozilla/5.0' } });
    const revision = (await res.text()).match(/client_revision\\?":\s*(\d{6,})/)?.[1];
    if (!revision) throw new Error('client_revision not found');
    return [2, 3000, Number(revision)];
}

/**
 * WhatsApp rejects clients announcing an outdated Web version (error 405), and
 * fetchLatestBaileysVersion() is known to return a stale one (WhiskeySockets/Baileys#2679).
 * So prefer the live WhatsApp Web version, in this order:
 *   1. "waVersion" in config.json (manual pin, e.g. [2, 3000, 1042466098])
 *   2. the library's fetchLatestWaWebVersion()
 *   3. our own lookup on web.whatsapp.com
 *   4. fetchLatestBaileysVersion()
 *   5. the library's built-in version
 * The result is cached for the life of the process.
 */
async function latestVersion() {
    if (versionChecked) return waVersion;
    versionChecked = true;

    const pinned = config.get().waVersion;
    const sources = [
        ['config.json', async () => { if (!Array.isArray(pinned)) throw new Error('not set'); return pinned; }],
        ['fetchLatestWaWebVersion', async () => (await baileys.fetchLatestWaWebVersion()).version],
        ['web.whatsapp.com', scrapeWaWebVersion],
        ['fetchLatestBaileysVersion', async () => (await baileys.fetchLatestBaileysVersion()).version]
    ];

    for (const [name, load] of sources) {
        try {
            const version = await load();
            if (Array.isArray(version) && version.length === 3) {
                waVersion = version;
                console.log(`ℹ️ Using WhatsApp Web version ${version.join('.')} (from ${name})`);
                return waVersion;
            }
        } catch { /* try the next source */ }
    }
    console.warn('⚠️ Could not find the latest WhatsApp version; using the library built-in one.');
    return undefined;
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const version = await latestVersion();

    const sock = makeWASocket({
        ...(version && { version }), // only set when known; undefined would override the library default
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });
    current = sock;

    let pairingRequested = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (sock !== current) return;

        // WhatsApp sends a "qr" once the handshake is done, which is when pairing is possible.
        // We ignore the QR itself and ask for a pairing code instead (once per connection).
        if (qr && !sock.authState.creds.registered && !pairingRequested) {
            pairingRequested = true;
            await requestPairing(sock);
        }

        if (connection === 'open') {
            reconnectDelay = RECONNECT_MIN_MS;
            console.log('✅ Kawori-Bot is online and connected!');
            updater.onOnline(sock).catch(e => console.error('[UPDATER]', e.message));
            updater.startAuto(sock);
        }

        if (connection === 'close') {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const why = `${code ?? '?'} ${reasonName(code)}${lastDisconnect?.error?.message ? ` - ${lastDisconnect.error.message}` : ''}`;

            if (code === DisconnectReason.loggedOut) {
                console.log(`🚪 Logged out (${why}). Delete the auth_info_baileys folder and restart to pair again.`);
                return;
            }

            // After a successful pairing WhatsApp asks for one restart. That is normal, so do it right away.
            const wait = code === DisconnectReason.restartRequired ? 500 : reconnectDelay;
            console.log(`⚠️ Connection closed (${why}). Reconnecting in ${(wait / 1000).toFixed(1)}s...`);

            if (code !== DisconnectReason.restartRequired) {
                reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
            }
            await delay(wait);
            startBot().catch(err => console.error('[RECONNECT ERROR]', err.message));
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            await listeners.onMessage(sock, msg);
            await handleMessage(sock, msg);
        }
    });

    sock.ev.on('messages.update', updates => listeners.onUpdate(sock, updates));
}

module.exports = { startBot };
