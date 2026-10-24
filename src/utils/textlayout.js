const fs = require('fs');
const path = require('path');

const FONT_FILE = path.join(__dirname, '../../assets/fonts/Anton-Regular.ttf');
const WIDTHS = require('../../assets/fonts/widths/Anton.json'); // advance widths in em, per character

// Anton metrics (in em). drawtext's `y` is the top of the text's glyph box, which for
// all-caps text is the top of the capital letters.
const CAP_HEIGHT = 0.859;
const LINE_PITCH = 1.04;  // distance between baselines, in em (tight, like classic memes)
const FALLBACK_WIDTH = 0.5;

const measure = (text, size) => [...text].reduce((sum, ch) => sum + (WIDTHS[ch] ?? FALLBACK_WIDTH), 0) * size;

/** Greedy word wrap. A single word wider than `maxW` is split by characters. */
function wrap(text, size, maxW) {
    const lines = [];
    let line = '';

    const push = () => { if (line) lines.push(line); line = ''; };

    for (const word of text.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (measure(candidate, size) <= maxW) { line = candidate; continue; }

        push();
        if (measure(word, size) <= maxW) { line = word; continue; }

        for (const ch of word) {               // very long word: break it
            if (measure(line + ch, size) > maxW) push();
            line += ch;
        }
    }
    push();
    return lines;
}

/**
 * Picks the largest font size (<= maxSize) at which `text` wraps to fit inside boxW x boxH.
 * Short text stays big, long text shrinks, and it never goes below minSize.
 * The stroke is accounted for, so outlined text doesn't touch the edges.
 */
function layoutText(text, { boxW, boxH, maxSize, minSize = 12 }) {
    text = text.toUpperCase().replace(/\s+/g, ' ').trim();

    let layout;
    for (let size = Math.floor(maxSize); size >= minSize; size -= 2) {
        const stroke = Math.max(1, Math.round(size * 0.07));
        const lines = wrap(text, size, boxW - stroke * 2);
        layout = { lines, size, stroke };
        if (lines.length * size * LINE_PITCH <= boxH) break;
    }
    layout.height = (layout.lines.length - 1) * layout.size * LINE_PITCH + layout.size * CAP_HEIGHT;
    return layout;
}

// --- ffmpeg drawtext helpers ------------------------------------------------

/** Escape a file path for use inside a single-quoted drawtext option. */
const escPath = p => `'${p.replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;

/**
 * Builds one drawtext filter per line of `layout`, centered horizontally.
 * Each line is written to a temp text file, which avoids every ffmpeg escaping problem
 * (quotes, colons, percent signs). `capTop` is the y position of the top of the capitals.
 */
function drawLayout(layout, { capTop, color = 'white', borderColor = 'black', tmp, enable }) {
    const { lines, size, stroke } = layout;

    return lines.map((line, i) => {
        const file = tmp.write(line, 'txt');
        const y = `(${capTop})+${(i * size * LINE_PITCH).toFixed(2)}`;
        const opts = [
            `fontfile=${escPath(FONT_FILE)}`,
            `textfile=${escPath(file)}`,
            'expansion=none',
            `fontsize=${size}`,
            `fontcolor=${color}`,
            `borderw=${stroke}`,
            `bordercolor=${borderColor}`,
            'x=(w-text_w)/2',
            `y=${y}`
        ];
        if (enable) opts.push(`enable='${enable}'`);
        return `drawtext=${opts.join(':')}`;
    });
}

module.exports = { layoutText, drawLayout, FONT_FILE };
