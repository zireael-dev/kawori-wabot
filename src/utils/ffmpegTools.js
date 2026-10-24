const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const TEMP_DIR = path.join(__dirname, '../../temp');

/** Creates uniquely named temp files and deletes them all in cleanup(). */
function createTemp() {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const files = [];

    const filePath = ext => {
        const p = path.join(TEMP_DIR, `${id}_${files.length}.${ext}`);
        files.push(p);
        return p;
    };

    return {
        path: filePath,
        write(content, ext) {
            const p = filePath(ext);
            fs.writeFileSync(p, content);
            return p;
        },
        cleanup() {
            for (const f of files) fs.rm(f, { force: true }, () => {});
        }
    };
}

/**
 * Runs the ffmpeg program directly and resolves when `output` is written.
 * `lavfi: true` makes `input` a generated source (e.g. a blank canvas);
 * `extraInputs` adds more input files.
 * (No wrapper library: they check formats against `ffmpeg -formats`, which hides
 * `lavfi` on newer ffmpeg builds.)
 */
function runFfmpeg(input, { lavfi = false, extraInputs = [], options = [], output }) {
    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    if (lavfi) args.push('-f', 'lavfi');
    args.push('-i', input);
    for (const extra of extraInputs) args.push('-i', extra);
    args.push(...options, output);

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });

        proc.on('error', error => reject(
            error.code === 'ENOENT' ? new Error('ffmpeg is not installed (or not in PATH)') : error
        ));
        proc.on('close', code => {
            if (code === 0) return resolve();
            const error = new Error(stderr.trim() || `ffmpeg exited with code ${code}`);
            console.error('[FFMPEG ERROR]', error.message);
            reject(error);
        });
    });
}

/** Width and height of the first video stream in `file`. */
const probeSize = file => new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', file], (error, stdout) => {
        if (error) return reject(error.code === 'ENOENT' ? new Error('ffprobe is not installed (or not in PATH)') : error);
        const stream = JSON.parse(stdout).streams?.find(s => s.width && s.height);
        stream ? resolve({ width: stream.width, height: stream.height }) : reject(new Error('no video stream'));
    });
});

module.exports = { createTemp, runFfmpeg, probeSize };
