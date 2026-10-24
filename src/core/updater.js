const fs = require('fs');
const path = require('path');
const config = require('./config');
const { run } = require('../utils/exec');

/**
 * Updates the bot from its git remote and restarts it.
 * Safety net: after an update a marker file is written. If the new version cannot get online
 * (crashes on start), it is rolled back to the previous commit after 2 failed starts.
 */
const ROOT = path.join(__dirname, '../..');
const DATA = path.join(ROOT, 'data');
const MARKER = path.join(DATA, 'update.json');
const NOTICE = path.join(DATA, 'update-notice.json');
const HEALTHY_AFTER_MS = 60 * 1000;
const MAX_FAILED_STARTS = 2;

const git = (...args) => run('git', args, { cwd: ROOT, timeoutMs: 90000 }).then(r => r.stdout.trim());
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, data) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };

/** True when something (pm2, systemd, scripts/loop.sh, docker...) will start the bot again after it exits. */
function isSupervised() {
    const e = process.env;
    return Boolean(e.pm_id || e.PM2_HOME || e.INVOCATION_ID || e.JOURNAL_STREAM || e.KAWORI_SUPERVISED || e.container || e.DOCKER);
}

const ownerJid = () => `${config.ownerIds()[0]}@s.whatsapp.net`;

// --- git -----------------------------------------------------------------------

async function currentInfo() {
    const [hash, date, subject] = (await git('log', '-1', '--format=%h|%cs|%s')).split('|');
    return { hash, date, subject };
}

/** Fetches and reports what is waiting upstream. */
async function check() {
    try { await git('rev-parse', '--is-inside-work-tree'); } catch { throw new Error('Folder ini bukan repositori git.'); }
    let upstream;
    try { upstream = await git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'); }
    catch { throw new Error('Branch ini belum punya upstream. Jalankan: git branch --set-upstream-to=origin/<branch>'); }

    await git('fetch', '--quiet');
    const behind = Number(await git('rev-list', '--count', `HEAD..${upstream}`));
    const log = behind ? (await git('log', '--format=• %s (%h)', '-n', '8', `HEAD..${upstream}`)).split('\n') : [];
    return { upstream, behind, log, current: await currentInfo() };
}

/** Tracked files someone edited by hand (config.json is ignored: the bot itself edits it). */
async function dirtyFiles() {
    const { stdout } = await run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, timeoutMs: 30000 });
    return stdout.split('\n').filter(Boolean).map(l => l.slice(3)).filter(f => f !== 'config.json'); // not trimmed: the 1st column may be a space
}

/**
 * Pulls the new commits. Returns { from, to, changed, needsRestart, installed }.
 * Throws with a readable message when it cannot (local edits, conflicts, broken code).
 */
async function apply() {
    const dirty = await dirtyFiles();
    if (dirty.length) throw new Error(`Ada perubahan manual di server yang akan tertimpa:\n${dirty.slice(0, 6).join('\n')}\nCommit atau buang dulu (git checkout -- <file>).`);

    const from = await git('rev-parse', 'HEAD');
    try {
        await git('pull', '--ff-only', '--autostash', '--quiet');
    } catch (error) {
        throw new Error(`git pull gagal: ${error.message}`);
    }
    const to = await git('rev-parse', 'HEAD');
    if (from === to) return { from, to, changed: [], needsRestart: false, installed: false };

    const changed = (await git('diff', '--name-only', from, to)).split('\n').filter(Boolean);
    const rollback = async () => { await git('reset', '--hard', from); };

    // refuse code with syntax errors before it ever runs
    for (const file of changed.filter(f => f.endsWith('.js') && fs.existsSync(path.join(ROOT, f)))) {
        try {
            await run('node', ['--check', path.join(ROOT, file)], { timeoutMs: 20000 });
        } catch (error) {
            await rollback();
            throw new Error(`Update dibatalkan, ${file} punya error sintaks:\n${error.message}`);
        }
    }

    let installed = false;
    if (changed.some(f => f === 'package.json' || f === 'package-lock.json')) {
        try {
            await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, timeoutMs: 5 * 60 * 1000 });
            installed = true;
        } catch (error) {
            await rollback();
            throw new Error(`npm install gagal, update dibatalkan:\n${error.message}`);
        }
    }

    // commands reload by themselves; anything else (core, listeners, utils, packages) needs a restart
    const needsRestart = changed.some(f => !/^(src\/commands\/|assets\/|README|.*\.md$)/.test(f));
    return { from, to, changed, needsRestart, installed };
}

// --- restart + safety net ---------------------------------------------------------

/** Remember an update so the next start can report it (and roll back if it cannot come online). */
function markUpdate({ from, to, notify }) {
    writeJson(MARKER, { from, to, notify, attempts: 0, at: Date.now() });
}

/** Exits so the supervisor starts the bot again. Returns false if nothing would restart it. */
function restart(delayMs = 1500) {
    if (!isSupervised()) return false;
    setTimeout(() => process.exit(0), delayMs).unref?.();
    return true;
}

/** Called before the bot starts. Counts failed starts after an update and rolls back if needed. */
async function onStart() {
    const marker = readJson(MARKER);
    if (!marker) return;

    marker.attempts += 1;
    if (marker.attempts <= MAX_FAILED_STARTS) return writeJson(MARKER, marker);

    console.error(`[UPDATER] The update ${marker.to.slice(0, 7)} did not start ${marker.attempts - 1} times. Rolling back to ${marker.from.slice(0, 7)}.`);
    try {
        await git('reset', '--hard', marker.from);
        await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: ROOT, timeoutMs: 5 * 60 * 1000 }).catch(() => {});
        writeJson(NOTICE, { text: `⚠️ Update ${marker.to.slice(0, 7)} gagal jalan, bot dikembalikan ke versi ${marker.from.slice(0, 7)}.`, notify: marker.notify });
    } catch (error) {
        console.error('[UPDATER] Rollback failed:', error.message);
    }
    fs.rmSync(MARKER, { force: true });
    process.exit(1); // the supervisor starts it again on the restored code
}

/** Called when WhatsApp is connected: reports the update/rollback and declares the version healthy. */
async function onOnline(sock) {
    const notice = readJson(NOTICE);
    if (notice) {
        fs.rmSync(NOTICE, { force: true });
        await sock.sendMessage(notice.notify || ownerJid(), { text: notice.text }).catch(() => {});
    }

    const marker = readJson(MARKER);
    if (!marker || marker.reported) return;
    marker.reported = true;
    writeJson(MARKER, marker);

    const info = await currentInfo().catch(() => null);
    await sock.sendMessage(marker.notify || ownerJid(), {
        text: `✅ *Bot diperbarui dan menyala kembali*\n${marker.from.slice(0, 7)} → ${marker.to.slice(0, 7)}${info ? `\n${info.subject}` : ''}`
    }).catch(() => {});

    // only delete the marker once the new version has stayed up for a while
    setTimeout(() => fs.rmSync(MARKER, { force: true }), HEALTHY_AFTER_MS).unref?.();
}

// --- automatic updates -------------------------------------------------------------

let timer = null;
let busy = false;

async function autoTick(sock) {
    const cfg = config.get().autoUpdate;
    if (!cfg.enabled || busy) return;
    busy = true;
    try {
        const status = await check();
        if (!status.behind) return;

        const result = await apply();
        const summary = `🔄 *Update otomatis*\n${status.log.join('\n')}`;
        if (!result.needsRestart) {
            return void await sock.sendMessage(ownerJid(), { text: `${summary}\n\n✅ Sudah aktif tanpa restart.` });
        }
        if (!isSupervised()) {
            return void await sock.sendMessage(ownerJid(), { text: `${summary}\n\n⚠️ Terpasang, tapi bot tidak berjalan di bawah pm2/systemd jadi tidak bisa restart sendiri. Restart manual.` });
        }
        markUpdate({ from: result.from, to: result.to, notify: ownerJid() });
        await sock.sendMessage(ownerJid(), { text: `${summary}\n\n♻️ Restart...` }).catch(() => {});
        restart();
    } catch (error) {
        console.error('[AUTOUPDATE]', error.message);
    } finally {
        busy = false;
    }
}

/** Starts the periodic check (safe to call on every reconnect). */
function startAuto(sock) {
    clearInterval(timer);
    const minutes = Math.max(2, config.get().autoUpdate.intervalMin);
    timer = setInterval(() => autoTick(sock), minutes * 60 * 1000);
    timer.unref?.();
}

module.exports = { check, apply, markUpdate, restart, isSupervised, onStart, onOnline, startAuto, currentInfo };
