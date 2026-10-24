const { textSticker } = require('./ttp');

module.exports = {
    name: 'attp',
    category: 'Converter',
    description: 'Ubah teks jadi stiker animasi warna-warni',
    execute: textSticker(true)
};
