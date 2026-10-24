const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config.json');

const DEFAULTS = {
    prefixes: ['/'],
    ownerNumbers: [6281227844398],
    stickerPack: 'Kawori-Bot',
    stickerAuthor: 'Zireael',
    botNumber: '6288289949938',
    timezone: 'Asia/Jakarta',
    autoRead: true,                 // mark every incoming message as read (/autoread)
    antiDelete: {
        textHours: 24,              // how long text of a message is kept
        mediaHours: 12,             // how long photos/videos/voice notes are kept
        maxMediaMB: 10              // larger files are not saved
    },
    ocr: {
        langs: 'ind+eng'            // tesseract languages (falls back to eng if not installed)
    },
    autoUpdate: {
        enabled: false,             // check git for new commits and update by itself (/update auto on|off)
        intervalMin: 10             // how often to check
    },
    downloader: {
        enabled: true,
        concurrency: 1,             // downloads running at the same time
        cooldownSec: 30,            // wait between two downloads by the same user
        maxDurationSec: 600,        // refuse videos longer than this
        maxFileMB: 100,             // refuse files bigger than this
        maxHeight: 720,             // video quality cap
        timeoutSec: 180,            // kill a download that takes longer than this
        ytdlpPath: 'yt-dlp',
        galleryDlPath: 'gallery-dl',
        cookiesFile: ''             // optional cookies.txt (Netscape format), mainly helps Instagram
    }
};
const NESTED = ['antiDelete', 'ocr', 'downloader', 'autoUpdate'];

let cache = null;
let cacheMtime = 0;

function withDefaults(file) {
    const merged = { ...DEFAULTS, ...file };
    for (const key of NESTED) merged[key] = { ...DEFAULTS[key], ...(file[key] || {}) };
    return merged;
}

const readFile = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

/**
 * Returns the current config (defaults filled in). The file is only re-parsed when it
 * changes on disk, so edits and commands like !prefix take effect without a restart.
 */
function get() {
    try {
        const mtime = fs.statSync(CONFIG_PATH).mtimeMs;
        if (!cache || mtime !== cacheMtime) {
            cache = withDefaults(readFile());
            cacheMtime = mtime;
        }
    } catch (e) {
        if (!cache) cache = withDefaults({});
        if (e.code !== 'ENOENT') console.error('[CONFIG ERROR] Using last known config:', e.message);
    }
    return cache;
}

/** Merge `changes` into config.json and save it (only your own settings are written, not the defaults). */
function update(changes) {
    let file = {};
    try { file = readFile(); } catch { /* no file yet */ }

    const next = { ...file, ...changes };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
    cache = withDefaults(next);
    cacheMtime = fs.statSync(CONFIG_PATH).mtimeMs;
    return cache;
}

/** Digits-only owner IDs (phone numbers or LIDs) from config. */
function ownerIds() {
    return get().ownerNumbers.map(n => String(n).replace(/\D/g, ''));
}

/** Number used for the first-time pairing code. BOT_NUMBER env var wins over config.json. */
function botNumber() {
    return (process.env.BOT_NUMBER || get().botNumber || '').replace(/\D/g, '');
}

module.exports = { get, update, ownerIds, botNumber };
