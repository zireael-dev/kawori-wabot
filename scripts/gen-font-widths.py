"""Regenerates assets/fonts/widths/<Font>.json (advance width per ASCII char, in em).
Needed by src/utils/textlayout.js and src/utils/cutout.js to size text without a font parser.
Usage: python3 scripts/gen-font-widths.py   (requires: pip install fonttools)
"""
import json, os
from fontTools.ttLib import TTFont

FONTS = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts')
OUT = os.path.join(FONTS, 'widths')
os.makedirs(OUT, exist_ok=True)

for name in sorted(os.listdir(FONTS)):
    if not name.endswith('.ttf'):
        continue
    f = TTFont(os.path.join(FONTS, name))
    cmap, hmtx, upm = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
    widths = {chr(c): round(hmtx[cmap[c]][0] / upm, 4) for c in range(32, 127) if c in cmap}
    stem = name.rsplit('-', 1)[0].replace('.ttf', '')
    json.dump(widths, open(os.path.join(OUT, stem + '.json'), 'w'), separators=(',', ':'))
    print(stem, len(widths), 'glyphs')
