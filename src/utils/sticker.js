const fs = require('fs');
const webp = require('node-webpmux');
const { layoutText, drawLayout } = require('./textlayout');
const { createTemp, runFfmpeg, probeSize } = require('./ffmpegTools');

const SIZE = 512;

/** Writes the WhatsApp sticker pack metadata (name, publisher) into a WebP buffer. */
async function addExif(webpBuffer, packName, authorName) {
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
        'sticker-pack-id': `kawori-${Date.now()}`,
        'sticker-pack-name': packName,
        'sticker-pack-publisher': authorName,
        'emojis': ['🤖', '✨']
    };

    const exifHeader = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifHeader, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    img.exif = exif;
    return img.save(null);
}

// Encoder settings
const ANIMATED_OPTIONS = ['-vcodec', 'libwebp', '-loop', '0', '-preset', 'default', '-an', '-q:v', '30', '-compression_level', '6'];

// --- media -> sticker (with optional meme captions) ---------------------------

/**
 * Scales to fit 512x512 and draws top/bottom meme captions ON the picture.
 * Font size shrinks automatically as the caption gets longer.
 */
async function memeFilters(inputPath, { top, bottom }, tmp) {
    const { width, height } = await probeSize(inputPath);
    const ratio = SIZE / Math.max(width, height);
    const W = Math.max(2, Math.round(width * ratio));
    const H = Math.max(2, Math.round(height * ratio));

    const margin = Math.round(H * 0.035);
    const box = { boxW: W * 0.96, boxH: H * 0.32, maxSize: Math.min(H * 0.17, 90) };
    const filters = [`scale=${W}:${H}:flags=lanczos`, 'format=rgba'];

    if (top) filters.push(...drawLayout(layoutText(top, box), { capTop: margin, tmp }));
    if (bottom) {
        const layout = layoutText(bottom, box);
        filters.push(...drawLayout(layout, { capTop: Math.round(H - margin - layout.height), tmp }));
    }
    return filters;
}

/**
 * Converts an image or video/GIF buffer into a WhatsApp WebP sticker.
 * Pass { top, bottom } to turn it into a meme.
 * Padding is transparent so WhatsApp doesn't squish landscape/portrait media.
 */
async function createWebpSticker(mediaBuffer, isAnimated, packName = 'Kawori-Bot', authorName = 'Zireael', captions = {}) {
    const tmp = createTemp();
    try {
        const input = tmp.write(mediaBuffer, isAnimated ? 'mp4' : 'jpg');
        const output = tmp.path('webp');

        const chain = (captions.top || captions.bottom)
            ? await memeFilters(input, captions, tmp)
            : [`scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease`, 'format=rgba'];
        chain.push(`pad=${SIZE}:${SIZE}:(${SIZE}-iw)/2:(${SIZE}-ih)/2:color=0x00000000`);

        const options = isAnimated
            ? [...ANIMATED_OPTIONS, '-vf', `${chain.join(',')},fps=15`, '-ss', '00:00:00', '-t', '00:00:06']
            : ['-vcodec', 'libwebp', '-vf', chain.join(','), '-q:v', '75'];

        await runFfmpeg(input, { options, output });
        return await addExif(fs.readFileSync(output), packName, authorName);
    } finally {
        tmp.cleanup();
    }
}

// --- text -> sticker ----------------------------------------------------------

const BLINK_COLORS = ['#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#0A84FF', '#BF5AF2'];
const BLINK_SECONDS = 0.2;

/**
 * Text on a transparent 512x512 sticker. Font size adapts to the text length.
 * animated = true cycles the text through rainbow colours.
 */
async function createTextSticker(text, { animated = false, packName = 'Kawori-Bot', authorName = 'Zireael' } = {}) {
    const tmp = createTemp();
    try {
        const layout = layoutText(text, { boxW: SIZE * 0.94, boxH: SIZE * 0.94, maxSize: 170 });
        const capTop = Math.round((SIZE - layout.height) / 2);
        const duration = BLINK_COLORS.length * BLINK_SECONDS;

        const filters = ['format=rgba'];
        if (animated) {
            BLINK_COLORS.forEach((color, i) => {
                const from = (i * BLINK_SECONDS).toFixed(1);
                const to = ((i + 1) * BLINK_SECONDS).toFixed(1);
                filters.push(...drawLayout(layout, { capTop, color, tmp, enable: `between(mod(t,${duration.toFixed(1)}),${from},${to})` }));
            });
        } else {
            filters.push(...drawLayout(layout, { capTop, tmp }));
        }

        const output = tmp.path('webp');
        const source = `color=c=black@0.0:s=${SIZE}x${SIZE}:r=15:d=${animated ? duration : 1}`;
        const options = animated
            ? [...ANIMATED_OPTIONS, '-vf', filters.join(',')]
            : ['-vcodec', 'libwebp', '-lossless', '1', '-frames:v', '1', '-vf', filters.join(',')];

        await runFfmpeg(source, { lavfi: true, options, output });
        return await addExif(fs.readFileSync(output), packName, authorName);
    } finally {
        tmp.cleanup();
    }
}

// --- sticker -> image ---------------------------------------------------------

async function isAnimatedWebp(buffer) {
    const img = new webp.Image();
    await img.load(buffer);
    return Boolean(img.hasAnim);
}

/** Static WebP sticker -> PNG buffer (keeps transparency). */
async function webpToPng(buffer) {
    const tmp = createTemp();
    try {
        const input = tmp.write(buffer, 'webp');
        const output = tmp.path('png');
        await runFfmpeg(input, { options: ['-frames:v', '1'], output });
        return fs.readFileSync(output);
    } finally {
        tmp.cleanup();
    }
}

module.exports = { createWebpSticker, createTextSticker, isAnimatedWebp, webpToPng };
