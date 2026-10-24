const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./exec');
const config = require('../core/config');

const ROOT = path.join(__dirname, '../..');
const pkg = require('../../package.json');
const startedAt = Date.now() - process.uptime() * 1000;

const MB = 1024 * 1024;
const fmtBytes = n => n >= 1024 * MB ? `${(n / 1024 / MB).toFixed(1)} GB` : `${Math.round(n / MB)} MB`;

function fmtDuration(seconds) {
    seconds = Math.floor(seconds);
    const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
    return [d && `${d}h`, (d || h) && `${h}j`, `${m}m`, !d && `${s}d`].filter(Boolean).join(' ');
}

const toolCache = new Map(); // tool -> { at, value }
/** Version line of an external tool, or null when it is not installed. Cached for 5 minutes. */
async function toolVersion(name, command, args, pick) {
    const hit = toolCache.get(name);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.value;
    let value = null;
    try {
        const { stdout, stderr } = await run(command, args, { timeoutMs: 8000 });
        value = pick(`${stdout}\n${stderr}`);
    } catch { /* not installed */ }
    toolCache.set(name, { at: Date.now(), value });
    return value;
}

async function gitCommit() {
    try {
        const { stdout } = await run('git', ['log', '-1', '--format=%h (%cs)'], { cwd: ROOT, timeoutMs: 5000 });
        return stdout.trim();
    } catch { return null; }
}

const libraryVersion = () => {
    try { return require('@rexxhayanasi/elaina-baileys/package.json').version; } catch { return pkg.dependencies['@rexxhayanasi/elaina-baileys']; }
};

/** Basic facts that are fine to show everyone. */
async function basic(ctx) {
    const sentAt = Number(ctx.msg.messageTimestamp?.toString?.() ?? ctx.msg.messageTimestamp) * 1000;
    const latency = sentAt ? Math.max(0, Date.now() - sentAt) : null;
    return {
        name: 'Kawori-Bot',
        version: pkg.version,
        commit: await gitCommit(),
        uptime: fmtDuration((Date.now() - startedAt) / 1000),
        latency,
        commands: ctx.commands.length,
        prefixes: ctx.config.prefixes.join('  '),
        node: process.versions.node,
        library: libraryVersion()
    };
}

/** Details of the machine and the tools the bot uses (owner only). */
async function system() {
    const mem = process.memoryUsage();
    const load = os.loadavg();
    const cpus = os.cpus();

    let disk = null;
    try {
        const s = fs.statfsSync(ROOT);
        disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch { /* old Node or unsupported fs */ }

    let dbSize = 0;
    for (const f of ['kawori.db', 'kawori.db-wal']) { try { dbSize += fs.statSync(path.join(ROOT, f)).size; } catch { /* no file */ } }

    const [ffmpeg, ytdlp, gallery, tesseract] = await Promise.all([
        toolVersion('ffmpeg', 'ffmpeg', ['-version'], o => o.match(/ffmpeg version (\S+)/)?.[1]),
        toolVersion('yt-dlp', config.get().downloader.ytdlpPath, ['--version'], o => o.trim().split('\n')[0]),
        toolVersion('gallery-dl', config.get().downloader.galleryDlPath, ['--version'], o => o.trim().split('\n')[0]),
        toolVersion('tesseract', 'tesseract', ['--version'], o => o.match(/tesseract (\S+)/)?.[1])
    ]);

    return {
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: `${cpus[0]?.model?.trim() || 'CPU'} ×${cpus.length}`,
        load: load.map(n => n.toFixed(2)).join(' / '),
        ram: `${fmtBytes(os.totalmem() - os.freemem())} / ${fmtBytes(os.totalmem())}`,
        botRam: `${fmtBytes(mem.rss)} (heap ${fmtBytes(mem.heapUsed)})`,
        disk: disk ? `${fmtBytes(disk.free)} bebas dari ${fmtBytes(disk.total)}` : null,
        machineUptime: fmtDuration(os.uptime()),
        dbSize: fmtBytes(dbSize),
        tools: { ffmpeg, 'yt-dlp': ytdlp, 'gallery-dl': gallery, tesseract }
    };
}

module.exports = { basic, system, fmtDuration };
