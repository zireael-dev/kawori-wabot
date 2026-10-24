/** Pictures a user is collecting for /topdf, kept in memory per chat+sender (JPEG, already shrunk). */
const TTL_MS = 10 * 60 * 1000;
const MAX_IMAGES = 30;
const MAX_BYTES = 15 * 1024 * 1024;

const sessions = new Map();
const keyOf = (chat, sender) => `${chat}|${sender}`;

function sweep() {
    const now = Date.now();
    for (const [key, s] of sessions) if (now - s.touched > TTL_MS) sessions.delete(key);
}
setInterval(sweep, 60 * 1000).unref();

const get = (chat, sender) => {
    sweep();
    return sessions.get(keyOf(chat, sender));
};
const start = (chat, sender) => {
    const s = { images: [], bytes: 0, touched: Date.now() };
    sessions.set(keyOf(chat, sender), s);
    return s;
};
const end = (chat, sender) => sessions.delete(keyOf(chat, sender));

/** Returns 'ok', 'full' (too many pages) or 'big' (too many bytes). */
function add(session, image) {
    if (session.images.length >= MAX_IMAGES) return 'full';
    if (session.bytes + image.jpeg.length > MAX_BYTES) return 'big';
    session.images.push(image);
    session.bytes += image.jpeg.length;
    session.touched = Date.now();
    return 'ok';
}

module.exports = { get, start, end, add, MAX_IMAGES, TTL_MS };
