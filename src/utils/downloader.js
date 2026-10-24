const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../core/config');
const { run } = require('./exec');

/**
 * Link downloader: TikTok (no watermark), Instagram posts/reels, Facebook videos/reels.
 * Uses the yt-dlp program (and optionally gallery-dl for Instagram photo posts) that must be
 * installed on the machine running the bot. Nothing is re-encoded: files are sent as downloaded.
 */

const TEMP_ROOT = path.join(__dirname, '../../temp/dl');
const MAX_ITEMS = 10;                 // pictures/videos taken from one post
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.mkv']);

// --- errors the command can show nicely ---------------------------------------

class DownloadError extends Error {
    constructor(code, message) { super(message || code); this.code = code; }
}

// --- link recognition ---------------------------------------------------------

const HOSTS = {
    tiktok: ['tiktok.com'],
    instagram: ['instagram.com'],
    facebook: ['facebook.com', 'fb.watch', 'fb.com']
};
const hostIs = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** Returns { platform, url } for a supported link, otherwise null. Stories are not supported. */
function classify(text) {
    const match = String(text).match(/https?:\/\/[^\s<>"']+/i);
    if (!match) return null;

    let url;
    try { url = new URL(match[0].replace(/[).,!?]+$/, '')); } catch { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const p = url.pathname;

    for (const [platform, domains] of Object.entries(HOSTS)) {
        if (!domains.some(d => hostIs(host, d))) continue;

        if (platform === 'tiktok') return { platform, url: url.href };
        if (platform === 'instagram') {
            // posts, reels and IGTV only: profiles, stories and highlights are not downloadable here
            return /^\/(?:[^/]+\/)?(?:p|reel|reels|tv|share)\//i.test(p) ? { platform, url: url.href } : null;
        }
        if (host === 'fb.watch') return { platform, url: url.href };
        return /^\/(?:watch|reel|reels|share|video\.php|[^/]+\/videos|[^/]+\/posts|story\.php|permalink\.php)/i.test(p) || url.searchParams.has('v')
            ? { platform, url: url.href }
            : null;
    }
    return null;
}

const allowed = href => {
    try {
        const host = new URL(href).hostname.toLowerCase();
        return Object.values(HOSTS).flat().some(d => hostIs(host, d));
    } catch { return false; }
};

/** Short/share links are redirects. Follow them by hand and never leave the supported sites. */
async function resolveLink(href) {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    const isShort =
        /^(vm|vt)\.tiktok\.com$/.test(host) || (hostIs(host, 'tiktok.com') && u.pathname.startsWith('/t/')) ||
        host === 'fb.watch' ||
        (/(instagram|facebook)\.com$/.test(host) && u.pathname.includes('/share/'));
    if (!isShort) return href;

    let current = href;
    for (let hop = 0; hop < 6; hop++) {
        let res;
        try {
            res = await fetch(current, {
                redirect: 'manual',
                headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' },
                signal: AbortSignal.timeout(10000)
            });
        } catch { return current; }

        const next = res.headers.get('location');
        if (!next || res.status < 300 || res.status >= 400) return current;

        const target = new URL(next, current).href;
        if (!allowed(target) || /\/(login|checkpoint|accounts\/login)/.test(new URL(target).pathname)) return current;
        current = target;
    }
    return current;
}

// --- yt-dlp -------------------------------------------------------------------

function mapError(text, platform) {
    const t = String(text || '').toLowerCase();
    if (t.includes('timed out') || t.includes('etimedout')) return new DownloadError('timeout');
    if (t.includes('unsupported url')) return new DownloadError('unsupported');
    if (t.includes('there is no video in this post')) return new DownloadError('no_video');
    if (/login|log in|cookies|private|restricted|age-restricted|sign in|authenticat|checkpoint/.test(t)) return new DownloadError('login');
    if (/429|rate.?limit|too many requests/.test(t)) return new DownloadError('rate_limit');
    if (/not available|unavailable|removed|deleted|404|does not exist|no video formats|cannot parse data/.test(t)) return new DownloadError('gone');
    if (platform === 'tiktok' && /photo|slideshow/.test(t)) return new DownloadError('slideshow');
    return new DownloadError('failed', String(text || '').trim().split('\n').pop());
}

function ytdlpBase(cfg, cookies) {
    const args = ['--no-warnings', '--no-progress', '--socket-timeout', '20', '--retries', '2', '--ignore-config'];
    if (cookies) args.push('--cookies', cookies);
    return args;
}

/** One tiny metadata request first: lets us refuse long/huge videos and pick the clean TikTok file. */
async function fetchInfo(url, cfg, cookies) {
    const { stdout } = await run(cfg.ytdlpPath, [
        ...ytdlpBase(cfg, cookies), '-J', '--playlist-items', `1:${MAX_ITEMS}`, '--', url
    ], { timeoutMs: cfg.timeoutSec * 1000, lowPriority: true, maxOutput: 20_000_000 });
    try { return JSON.parse(stdout); } catch { throw new DownloadError('failed', 'unreadable metadata'); }
}

/**
 * TikTok marks the logo-stamped files ("download_addr", format_note contains "watermarked").
 * Pick the best file that is NOT marked. Returns { id, watermarked }.
 */
function pickTikTokFormat(entry, maxHeight) {
    const formats = (entry.formats || []).filter(f => f.vcodec !== 'none' && f.format_id);
    const clean = formats.filter(f => !/watermark/i.test(`${f.format_note || ''}`) && !/^download/.test(String(f.format_id)));
    const pool = clean.length ? clean : formats;
    if (!pool.length) return { id: null, watermarked: false };

    const rank = f => [
        (f.height || 0) <= maxHeight ? 1 : 0,
        /h264|avc/i.test(f.vcodec || '') ? 1 : 0,
        Math.min(f.height || 0, maxHeight),
        f.tbr || 0
    ];
    const best = [...pool].sort((a, b) => {
        const [x, y] = [rank(a), rank(b)];
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
        return 0;
    })[0];
    return { id: best.format_id, watermarked: !clean.length };
}

function listMedia(dir) {
    return fs.readdirSync(dir)
        .filter(name => !name.startsWith('.') && !name.endsWith('.part') && !name.endsWith('.txt'))
        .sort()
        .map(name => ({ file: path.join(dir, name), ext: path.extname(name).toLowerCase(), size: fs.statSync(path.join(dir, name)).size }))
        .filter(item => IMAGE_EXT.has(item.ext) || VIDEO_EXT.has(item.ext));
}

async function viaGalleryDl(url, dir, cfg, cookies) {
    const args = ['-D', dir, '--range', `1-${MAX_ITEMS}`, '--no-mtime'];
    if (cookies) args.push('--cookies', cookies);
    try {
        await run(cfg.galleryDlPath, [...args, '--', url], { timeoutMs: cfg.timeoutSec * 1000, lowPriority: true });
    } catch (error) {
        if (error.code === 'ENOENT') throw new DownloadError('need_gallerydl');
        throw mapError(error.stderr || error.message, 'instagram');
    }
}

/**
 * Downloads a link into a fresh temp folder.
 * Returns { dir, items: [{ file, type: 'video'|'image', size }], watermarked, cleanup }.
 * The caller MUST call cleanup() when finished sending.
 */
async function download(platform, url) {
    const cfg = config.get().downloader;
    fs.mkdirSync(TEMP_ROOT, { recursive: true });
    const dir = fs.mkdtempSync(path.join(TEMP_ROOT, 'job-'));
    const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});

    try {
        // work on a private copy of the cookies file: the tools may rewrite it
        let cookies = null;
        if (cfg.cookiesFile && fs.existsSync(cfg.cookiesFile)) {
            cookies = path.join(dir, '.cookies.txt');
            fs.copyFileSync(cfg.cookiesFile, cookies);
        }

        let watermarked = false;
        let items = [];

        try {
            const info = await fetchInfo(url, cfg, cookies);
            const entries = (info.entries ? info.entries.filter(Boolean) : [info]).slice(0, MAX_ITEMS);
            if (!entries.length) throw new DownloadError('gone');

            for (const entry of entries) {
                if (entry.is_live || entry.live_status === 'is_live') throw new DownloadError('live');
                if (entry.duration && entry.duration > cfg.maxDurationSec) throw new DownloadError('too_long', String(entry.duration));
                const guess = entry.filesize || entry.filesize_approx;
                if (guess && guess > cfg.maxFileMB * 1024 * 1024) throw new DownloadError('too_big');
            }

            const h = cfg.maxHeight;
            let format = `bv*[height<=${h}]+ba/b[height<=${h}]/b`;
            if (platform === 'tiktok' && entries.length === 1) {
                const pick = pickTikTokFormat(entries[0], h);
                if (pick.id) { format = String(pick.id); watermarked = pick.watermarked; }
            }

            await run(cfg.ytdlpPath, [
                ...ytdlpBase(cfg, cookies),
                '-f', format, '-S', 'vcodec:h264,acodec:aac',
                '--merge-output-format', 'mp4',
                '--yes-playlist', '--playlist-items', `1:${MAX_ITEMS}`,
                '--max-filesize', `${cfg.maxFileMB}M`,
                '-o', path.join(dir, '%(autonumber)03d_%(id)s.%(ext)s'),
                '--', url
            ], { timeoutMs: cfg.timeoutSec * 1000, lowPriority: true });

            items = listMedia(dir);
        } catch (error) {
            if (error instanceof DownloadError && error.code !== 'no_video') throw error;
            if (error.code === 'ENOENT') throw new DownloadError('need_ytdlp');
            const mapped = error instanceof DownloadError ? error : mapError(error.stderr || error.message, platform);

            // Instagram photo posts have no video: yt-dlp refuses them, gallery-dl can fetch the pictures
            if (platform === 'instagram' && (mapped.code === 'no_video' || mapped.code === 'login' || mapped.code === 'failed')) {
                try {
                    await viaGalleryDl(url, dir, cfg, cookies);
                } catch (galleryError) {
                    // keep yt-dlp's explanation unless it only said "no video" (then gallery-dl's reason is the useful one)
                    throw mapped.code === 'no_video' ? galleryError : mapped;
                }
                items = listMedia(dir);
                if (!items.length) throw mapped.code === 'no_video' ? new DownloadError('login') : mapped;
            } else {
                throw mapped;
            }
        }

        if (!items.length) throw new DownloadError('gone');
        const limit = cfg.maxFileMB * 1024 * 1024;
        if (items.some(i => i.size > limit)) throw new DownloadError('too_big');

        return {
            dir, cleanup, watermarked,
            items: items.slice(0, MAX_ITEMS).map(i => ({ file: i.file, size: i.size, type: IMAGE_EXT.has(i.ext) ? 'image' : 'video' }))
        };
    } catch (error) {
        cleanup();
        if (error.code === 'ENOENT') throw new DownloadError('need_ytdlp');
        throw error instanceof DownloadError ? error : mapError(error.stderr || error.message, platform);
    }
}

// --- one at a time, politely ----------------------------------------------------

const waiting = [];
let active = 0;
const lastStart = new Map(); // user -> time of their last download
const MAX_QUEUE = 5;

/** Seconds a user still has to wait (0 = may start). */
function cooldownLeft(user) {
    const { cooldownSec } = config.get().downloader;
    const left = (lastStart.get(user) || 0) + cooldownSec * 1000 - Date.now();
    return Math.max(0, Math.ceil(left / 1000));
}

/** Runs task() when a slot is free. Rejects with DownloadError('queue_full') if too many are waiting. */
function enqueue(user, task, { skipCooldown = false } = {}) {
    const limit = Math.max(1, config.get().downloader.concurrency);
    return new Promise((resolve, reject) => {
        if (waiting.length >= MAX_QUEUE) return reject(new DownloadError('queue_full'));
        if (!skipCooldown) lastStart.set(user, Date.now());

        const start = () => {
            active++;
            Promise.resolve().then(task).then(resolve, reject).finally(() => {
                active--;
                const next = waiting.shift();
                if (next) next();
            });
        };
        active < limit ? start() : waiting.push(start);
    });
}

const queueLength = () => waiting.length + active;

// --- maintenance ------------------------------------------------------------------

/** Old leftovers (e.g. after a crash) are removed when the bot starts. */
function cleanOld() {
    try {
        for (const name of fs.readdirSync(TEMP_ROOT)) {
            const p = path.join(TEMP_ROOT, name);
            if (Date.now() - fs.statSync(p).mtimeMs > 30 * 60 * 1000) fs.rmSync(p, { recursive: true, force: true });
        }
    } catch { /* nothing to clean */ }
}
cleanOld();

async function version(tool) {
    const cfg = config.get().downloader;
    const bin = tool === 'gallery-dl' ? cfg.galleryDlPath : cfg.ytdlpPath;
    try {
        return (await run(bin, ['--version'], { timeoutMs: 15000 })).stdout.trim().split('\n')[0];
    } catch { return null; }
}

/** yt-dlp -U (works for the standalone binary; pip installs must be upgraded with pip). */
async function updateYtdlp() {
    const cfg = config.get().downloader;
    const { stdout, stderr } = await run(cfg.ytdlpPath, ['-U'], { timeoutMs: 120000 });
    return `${stdout}\n${stderr}`.trim().split('\n').slice(-3).join('\n');
}

module.exports = { classify, resolveLink, download, enqueue, cooldownLeft, queueLength, version, updateYtdlp, DownloadError };
