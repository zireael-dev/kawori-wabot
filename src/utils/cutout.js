const fs = require('fs');
const path = require('path');
const { createTemp, runFfmpeg, probeSize } = require('./ffmpegTools');

/**
 * "Cut-out words" meme: every word is its own little tag with a random font, colour,
 * background (plain, gradient or a blurred crop of the photo) and a slight tilt,
 * stacked in rows beside the picture.
 */

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const font = (file, widths) => ({ file: path.join(FONT_DIR, file), widths: require(`../../assets/fonts/widths/${widths}.json`) });

const FONTS = {
    anton: font('Anton-Regular.ttf', 'Anton'),
    archivo: font('ArchivoBlack-Regular.ttf', 'ArchivoBlack'),
    bebas: font('BebasNeue-Regular.ttf', 'BebasNeue'),
    oswald: font('Oswald.ttf', 'Oswald'),
    roboto: font('Roboto.ttf', 'Roboto'),
    bangers: font('Bangers-Regular.ttf', 'Bangers')
};

// weight = how often it is picked. bg = backgrounds it may use.
const STYLES = [
    { weight: 3, font: 'anton',   text: 'upper', color: 'white', outline: true,  bg: ['photo', 'gradient'] },
    { weight: 2, font: 'archivo', text: 'upper', color: 'white', outline: true,  bg: ['photo', 'gradient'] },
    { weight: 3, font: 'bebas',   text: 'upper', color: 'white', outline: false, bg: ['dark', 'red'] },
    { weight: 3, font: 'roboto',  text: 'keep',  color: 'black', outline: false, bg: ['white'], border: true },
    { weight: 2, font: 'oswald',  text: 'upper', color: 'white', outline: false, bg: ['dark', 'red', 'photo'] },
    { weight: 2, font: 'roboto',  text: 'lower', color: 'white', outline: true,  bg: ['photo'] },
    { weight: 1, font: 'bangers', text: 'upper', color: 'white', outline: true,  bg: ['gradient', 'photo'] }
];

const SOLIDS = { dark: ['0x0d0d0d', '0x1c1c1c'], red: ['0x9b1c1c', '0xb3261e'], white: ['0xffffff', '0xf3f3f3'] };
const GRADIENTS = [
    ['0xff5f6d', '0xffc371'], ['0x36d1dc', '0x5b86e5'], ['0xf12711', '0xf5af19'], ['0x00c9ff', '0x92fe9d'],
    ['0xee0979', '0xff6a00'], ['0x7f00ff', '0xe100ff'], ['0x11998e', '0x38ef7d'], ['0x2c3e50', '0x4ca1af']
];

const MAX_WORDS = 40;
const MAX_WORD_LENGTH = 22;
const MAX_SIDE = 768;

// --- small helpers ------------------------------------------------------------

/** Seeded random numbers, so a given seed always produces the same layout. */
function createRng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Object.assign(next, {
        between: (lo, hi) => lo + next() * (hi - lo),
        pick: list => list[Math.floor(next() * list.length)]
    });
}

const escPath = p => `'${p.replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;

const measure = (fontKey, text, size) =>
    [...text].reduce((sum, ch) => sum + (FONTS[fontKey].widths[ch] ?? 0.55), 0) * size;

/** Splits text into rows of words. "|" forces a new row. Characters the fonts can't draw are dropped. */
function parseWords(text) {
    const rows = text.split('|').map(part =>
        part.split(/\s+/)
            .map(w => w.replace(/[^\x20-\x7E]/g, '').slice(0, MAX_WORD_LENGTH))
            .filter(Boolean)
    ).filter(r => r.length);

    const words = [];
    rows.forEach((row, r) => row.forEach((w, i) => {
        if (words.length < MAX_WORDS) words.push({ raw: w, breakBefore: r > 0 && i === 0 });
    }));
    return words;
}

function chooseStyle(rng, previous) {
    const pool = STYLES.filter(s => s !== previous);
    let roll = rng() * pool.reduce((sum, s) => sum + s.weight, 0);
    for (const style of pool) { if ((roll -= style.weight) < 0) return style; }
    return pool[0];
}

function describeWord(word, rng, previous) {
    const style = chooseStyle(rng, previous);
    const display = style.text === 'upper' ? word.raw.toUpperCase()
        : style.text === 'lower' ? word.raw.toLowerCase() : word.raw;
    const bg = rng.pick(style.bg);

    return {
        ...word, style, display, bg,
        scale: rng.between(0.88, 1.14),                    // size variation between words
        tilt: rng() < 0.45 ? rng.between(-1.6, 1.6) : 0,   // degrees
        jitterY: rng.between(-0.07, 0.07),
        gapScale: rng.between(0.7, 1.3),
        solid: SOLIDS[bg] ? rng.pick(SOLIDS[bg]) : null,
        gradient: bg === 'gradient' ? rng.pick(GRADIENTS) : null,
        photoMode: rng.pick(['blur', 'blur', 'pixel', 'plain']),
        cropSeed: rng()
    };
}

// --- layout -------------------------------------------------------------------

const tileSize = (w, base) => {
    const size = Math.max(8, Math.round(base * w.scale));
    const padX = Math.round(size * 0.28);
    return {
        size,
        width: Math.ceil(measure(w.style.font, w.display, size)) + padX * 2,
        height: Math.round(size * 1.3)
    };
};

function buildRows(words, base, zoneW) {
    const rows = [];
    let row = [], used = 0;
    for (const w of words) {
        const t = tileSize(w, base);
        const gap = row.length ? base * 0.3 * w.gapScale : 0;
        if (row.length && (w.breakBefore || used + gap + t.width > zoneW)) {
            rows.push(row);
            row = []; used = 0;
        }
        const g = row.length ? base * 0.3 * w.gapScale : 0;
        row.push({ ...w, ...t, gap: g });
        used += g + t.width;
    }
    if (row.length) rows.push(row);
    return rows;
}

/** Largest font size at which every row fits in the text zone (width and height). */
function planLayout(words, canvasW, canvasH, side) {
    const zoneW = canvasW * 0.56;
    const availH = canvasH * 0.9;

    let base = canvasH * 0.12, rows = buildRows(words, base, zoneW);
    const minBase = canvasH * 0.018;
    while (base > minBase && rows.length * base * 1.45 > availH) {
        base -= canvasH * 0.002;
        rows = buildRows(words, base, zoneW);
    }

    const rowH = base * 1.3;
    const pitch = Math.min(rowH * 1.75, availH / rows.length);
    const top = canvasH * 0.05 + (availH - pitch * rows.length) / 2;
    const left = side === 'right' ? canvasW - zoneW - canvasW * 0.012 : canvasW * 0.012;

    const placed = [];
    rows.forEach((row, r) => {
        let x = left;
        for (const w of row) {
            x += w.gap;
            placed.push({ ...w, x: Math.round(x), y: Math.round(top + r * pitch + (rowH - w.height) / 2 + w.jitterY * base) });
            x += w.width;
        }
    });
    return placed;
}

// --- tiles --------------------------------------------------------------------

function tileFilter(w, tmp) {
    const { style, display, width: W, height: H, size } = w;
    const textFile = tmp.write(display, 'txt');

    const draw = [
        `fontfile=${escPath(FONTS[style.font].file)}`,
        `textfile=${escPath(textFile)}`,
        'expansion=none',
        `fontsize=${size}`,
        `fontcolor=${style.color}`,
        ...(style.outline ? [`borderw=${Math.max(1, Math.round(size * 0.07))}`, 'bordercolor=black'] : []),
        'x=(w-text_w)/2',
        'y=(h-text_h)/2'
    ].join(':');

    const chain = ['format=rgba', `drawtext=${draw}`];
    if (style.border) chain.splice(1, 0, 'drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=1');
    if (w.tilt) {
        const rad = `${w.tilt.toFixed(2)}*PI/180`;
        chain.push(`rotate=a=${rad}:c=none:ow=rotw(${rad}):oh=roth(${rad})`);
    }
    return chain;
}

/** Renders one word to a PNG tile. Falls back to a plain dark tag if the fancy background fails. */
async function renderTile(w, canvasPath, canvasSize, tmp) {
    const output = tmp.path('png');
    const once = async bg => {
        const { width: W, height: H } = w;
        const filters = tileFilter(w, tmp);
        const options = ['-frames:v', '1'];

        if (bg === 'photo') {
            const x = Math.floor(w.cropSeed * Math.max(0, canvasSize.width - W));
            const y = Math.floor((1 - w.cropSeed) * Math.max(0, canvasSize.height - H));
            const prep = { blur: 'boxblur=3:1', pixel: `scale=iw/5:ih/5,scale=${W}:${H}:flags=neighbor`, plain: 'null' }[w.photoMode];
            return runFfmpeg(canvasPath, { options: [...options, '-vf', [`crop=${W}:${H}:${x}:${y}`, prep, 'eq=brightness=-0.12', ...filters].join(',')], output });
        }
        const source = bg === 'gradient'
            ? `gradients=s=${W}x${H}:c0=${w.gradient[0]}:c1=${w.gradient[1]}:x0=0:y0=0:x1=${W}:y1=${H}:d=1:r=1`
            : `color=c=${w.solid || '0x0d0d0d'}:s=${W}x${H}:d=1:r=1`;
        return runFfmpeg(source, { lavfi: true, options: [...options, '-vf', filters.join(',')], output });
    };

    try {
        await once(w.bg);
    } catch (e) {
        await once('dark'); // e.g. an old ffmpeg without the `gradients` filter
    }
    return output;
}

// --- public API ---------------------------------------------------------------

/**
 * Builds the meme and returns a PNG buffer (longest side <= 768px).
 * options.side: 'left' (default) or 'right'; options.seed makes the look reproducible.
 */
async function createCutoutMeme(imageBuffer, text, { side = 'left', seed = Date.now() } = {}) {
    const words = parseWords(text);
    if (!words.length) throw new Error('no drawable words');

    const tmp = createTemp();
    try {
        // 1. Scale the picture to the working size.
        const source = tmp.write(imageBuffer, 'jpg');
        const dims = await probeSize(source);
        const ratio = Math.min(1, MAX_SIDE / Math.max(dims.width, dims.height)) || 1;
        const canvasSize = { width: Math.max(2, Math.round(dims.width * ratio)), height: Math.max(2, Math.round(dims.height * ratio)) };
        const canvasPath = tmp.path('png');
        await runFfmpeg(source, { options: ['-frames:v', '1', '-vf', `scale=${canvasSize.width}:${canvasSize.height}`], output: canvasPath });

        // 2. Decide how every word looks and where it goes.
        const rng = createRng(seed);
        let previous = null;
        const specs = [];
        for (const word of words) {
            const d = describeWord(word, rng, previous);
            previous = d.style;
            specs.push(d);
        }
        const placed = planLayout(specs, canvasSize.width, canvasSize.height, side);

        // 3. Render each word as a small image, then stick them all on the picture.
        const tiles = [];
        for (const w of placed) tiles.push(await renderTile(w, canvasPath, canvasSize, tmp));

        const graph = placed.map((w, i) =>
            `[${i ? `o${i}` : 'base'}][${i + 1}:v]overlay=x=${w.x}:y=${w.y}:format=auto[o${i + 1}]`
        );
        graph.unshift('[0:v]format=rgba[base]');

        const output = tmp.path('png');
        await runFfmpeg(canvasPath, {
            extraInputs: tiles,
            options: ['-filter_complex', graph.join(';'), '-map', `[o${placed.length}]`, '-frames:v', '1'],
            output
        });
        return fs.readFileSync(output);
    } finally {
        tmp.cleanup();
    }
}

module.exports = { createCutoutMeme, parseWords };
