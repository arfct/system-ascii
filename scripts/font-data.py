"""Writes spec/glyphs.json from the jgs TTFs in fonts/src: each face's character set and the
position of the horizontal and vertical arms of its frame glyphs, in font pixels.

Run: python3 scripts/font-data.py  (needs fontTools: pip install fonttools)
"""
import json
from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FACES = {"jgs5": "jgs5.ttf", "jgs7": "jgs7.ttf", "jgs9": "jgs9.ttf", "jgs-vector": "jgs_Font.ttf"}
FRAME = "─│┌┐└┘├┤┬┴┼"
H_ARMS = {"─", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼"}
V_ARMS = {"│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼"}
EXTRA = "-|"  # the substitutes the faces' fixes use


def arm(points, axis, edge):
    """The span, on the other axis, of the outline points lying on one extreme of `axis`."""
    other = 1 - axis
    return sorted({p[other] for p in points if p[axis] == edge})


def main():
    spec = json.loads((ROOT / "spec/faces.json").read_text())
    out = {}
    for face, file in FACES.items():
        font = TTFont(ROOT / "fonts/src" / file)
        cmap, glyphs = font.getBestCmap(), font.getGlyphSet()
        # Font units per font pixel, and the cell's top in font units. The vector face draws its
        # pixels as 40-unit squares in a cell from -120 to 480, not from its ascent.
        vector = spec[face].get("vector", False)
        units = 40 if vector else font["head"].unitsPerEm / spec[face]["size"]
        ascent = 480 if vector else font["hhea"].ascent
        entry = {"chars": "".join(chr(c) for c in sorted(cmap) if c >= 0x20), "h": {}, "v": {}}
        for ch in FRAME + EXTRA:
            name = cmap.get(ord(ch))
            if not name:
                continue
            pen = RecordingPen()
            glyphs[name].draw(pen)
            pts = [p for _, ps in pen.value for p in ps if p is not None]
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if ch in H_ARMS or ch == "-":
                span = arm(pts, 0, min(xs)) if ch in "─┐┘┤┬┴┼-" else arm(pts, 0, max(xs))
                rows = sorted((ascent - y) / units for y in (span[0], span[-1]))
                entry["h"][ch] = [round(rows[0]), round(rows[1])]
            if ch in V_ARMS or ch == "|":
                span = arm(pts, 1, max(ys)) if ch in "│└┘├┤┴┼|" else arm(pts, 1, min(ys))
                entry["v"][ch] = [round(span[0] / units), round(span[-1] / units)]
        out[face] = entry
    (ROOT / "spec/glyphs.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print("wrote spec/glyphs.json:", ", ".join(f"{k} {len(v['chars'])}" for k, v in out.items()))


main()
