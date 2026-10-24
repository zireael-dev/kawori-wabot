const { jidNormalizedUser } = require('@rexxhayanasi/elaina-baileys');

const CACHE_MS = 60 * 1000;
const cache = new Map(); // group jid -> { at, participants }

const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us');

/** Group members, cached for a minute so busy groups don't trigger a lookup per message. */
async function participants(sock, groupJid) {
    const hit = cache.get(groupJid);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.participants;

    const meta = await sock.groupMetadata(groupJid);
    cache.set(groupJid, { at: Date.now(), participants: meta.participants || [] });
    return meta.participants || [];
}

/** Every ID a member may appear under: WhatsApp now uses phone numbers and anonymous "LID"s. */
const idsOf = p => [p.id, p.lid, p.phoneNumber, p.jid]
    .filter(Boolean)
    .map(j => jidNormalizedUser(j));

/** True if `senderJid` is an admin or super-admin of the group. */
async function isGroupAdmin(sock, groupJid, senderJid) {
    if (!isGroupJid(groupJid) || !senderJid) return false;

    const who = jidNormalizedUser(senderJid);
    const members = await participants(sock, groupJid);
    return members.some(p => p.admin && idsOf(p).includes(who));
}

module.exports = { isGroupJid, isGroupAdmin };
