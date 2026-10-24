const { createTemp, runFfmpeg, probeSize } = require('./ffmpegTools');
const fs = require('fs');

const A4 = { w: 595, h: 842 }; // points
const MARGIN = 24;
const MAX_SIDE = 2000;

/** Any image -> upright RGB JPEG (max 2000px), the only format the PDF writer needs. */
async function toJpeg(buffer) {
    const tmp = createTemp();
    try {
        const input = tmp.write(buffer, 'img');
        const output = tmp.path('jpg');
        const scale = `scale='min(${MAX_SIDE},iw)':'min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
        await runFfmpeg(input, { options: ['-frames:v', '1', '-vf', `${scale},format=yuvj420p`, '-q:v', '4'], output });
        const jpeg = fs.readFileSync(output);
        const { width, height } = await probeSize(output);
        return { jpeg, width, height };
    } finally {
        tmp.cleanup();
    }
}

const num = n => Number(n.toFixed(2));

/**
 * Builds a PDF from [{ jpeg, width, height }, ...].
 * mode 'a4': A4 pages, picture centred with a small margin. mode 'fit': page = picture shape.
 */
function buildPdf(images, mode = 'a4') {
    const chunks = [];
    const offsets = [];
    let length = 0;
    const put = data => {
        const b = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
        chunks.push(b);
        length += b.length;
    };
    const object = (id, body) => {
        offsets[id] = length;
        put(`${id} 0 obj\n`);
        put(body);
        put('\nendobj\n');
    };

    // object numbers: 1 catalog, 2 pages, then per image: page, content, image
    const pageIds = images.map((_, i) => 3 + i * 3);
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`);

    images.forEach((img, i) => {
        const [pageId, contentId, imageId] = [3 + i * 3, 4 + i * 3, 5 + i * 3];
        let pageW, pageH, drawW, drawH;
        if (mode === 'fit') {
            const k = Math.min(1, 842 / Math.max(img.width, img.height));
            pageW = drawW = img.width * k;
            pageH = drawH = img.height * k;
        } else {
            pageW = A4.w; pageH = A4.h;
            if (img.width > img.height * 1.15) { pageW = A4.h; pageH = A4.w; } // landscape picture -> landscape page
            const k = Math.min((pageW - 2 * MARGIN) / img.width, (pageH - 2 * MARGIN) / img.height);
            drawW = img.width * k; drawH = img.height * k;
        }
        const x = (pageW - drawW) / 2, y = (pageH - drawH) / 2;
        const content = `q ${num(drawW)} 0 0 ${num(drawH)} ${num(x)} ${num(y)} cm /Im0 Do Q`;

        object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
        object(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

        offsets[imageId] = length;
        put(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
        put(img.jpeg);
        put('\nendstream\nendobj\n');
    });

    const count = 3 + images.length * 3;
    const xref = length;
    put(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id++) put(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return Buffer.concat(chunks);
}

module.exports = { toJpeg, buildPdf };
