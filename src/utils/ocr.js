const fs = require('fs');
const config = require('../core/config');
const { createTemp, runFfmpeg } = require('./ffmpegTools');
const { run } = require('./exec');

let installed = null; // languages tesseract has, read once

async function installedLangs() {
    if (installed) return installed;
    try {
        const { stdout, stderr } = await run('tesseract', ['--list-langs'], { timeoutMs: 15000 });
        installed = `${stdout}\n${stderr}`.split('\n').map(l => l.trim()).filter(l => /^[a-z_]+$/i.test(l) && l !== 'osd');
    } catch (error) {
        if (error.code === 'ENOENT') throw new Error('tesseract is not installed');
        throw error;
    }
    return installed;
}

/** "ind+eng" -> only the languages that are installed (falls back to eng). */
async function pickLangs() {
    const have = await installedLangs();
    const wanted = String(config.get().ocr.langs || 'eng').split('+').filter(l => have.includes(l));
    return wanted.length ? wanted.join('+') : (have.includes('eng') ? 'eng' : have[0]);
}

/** Reads text from an image buffer. Returns the text (may be empty). */
async function readText(buffer) {
    const tmp = createTemp();
    try {
        const input = tmp.write(buffer, 'jpg');
        const prepared = tmp.path('png');
        // grayscale + upscale small pictures + stretch contrast: helps tesseract a lot on phone screenshots/photos
        await runFfmpeg(input, {
            options: ['-frames:v', '1', '-vf', "format=gray,scale='if(lt(iw,1400),1400,min(iw,3000))':-2:flags=lanczos,normalize"],
            output: prepared
        });
        const langs = await pickLangs();
        const { stdout } = await run('tesseract', [prepared, 'stdout', '-l', langs, '--psm', '3'], { timeoutMs: 60000, lowPriority: true });
        return stdout.replace(/\f/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    } finally {
        tmp.cleanup();
    }
}

module.exports = { readText };
