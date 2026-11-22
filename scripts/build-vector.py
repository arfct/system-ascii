"""Builds the vector face from Adel Faure's jgs_Font plus the letters of a phonemic script.

Reads fonts/src/jgs_Font.ttf (the upstream file, never edited) and writes
fonts/src/jgs-vector.ttf and fonts/jgs-vector.woff2: the same font with the IPA letters of
eSpeak NG's General American output, their capitals, the script theta, and combining accents
that attach to the letter before them, so a letter and its accent take one cell.

The added glyphs are drawn here, on the face's own grid: a 7 x 15 cell of 40-unit pixels, strokes
one pixel wide through pixel centres with round ends, corners of one or two pixels' radius (the
radii of jgs's `a` and `o`). A letter that is another turned over (ə from e, ɹ from r) is that
glyph's outline rotated, so it matches to the unit.

Run: python3 scripts/build-vector.py   (needs: pip install fonttools brotli skia-pathops)
Then: python3 scripts/font-data.py     (`npm run fonts` runs both)
"""
import math
import unicodedata
from pathlib import Path

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from pathops import OpBuilder, PathOp
from pathops import Path as SkPath

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "fonts/src/jgs_Font.ttf"
OUT_TTF = ROOT / "fonts/src/jgs-vector.ttf"
OUT_WOFF2 = ROOT / "fonts/jgs-vector.woff2"

# The modified font's own name (OFL 1.1: a modified version does not carry the original's name).
FAMILY = "System ASCII Vector"

PX = 40  # font units per font pixel
ADVANCE = 7 * PX
HALF = PX / 2
TOP = 480  # the cell's top in font units; row 0 is the top pixel row


def pt(c, r):
    """The centre of the pixel in column `c`, row `r` (rows count down from the cell's top)."""
    return (HALF + PX * c, TOP - HALF - PX * r)


# ---- Strokes --------------------------------------------------------------------------------


def _arc(center, radius, a0, a1):
    """Quadratic segments for the arc from angle a0 to a1 (radians): [(control, end), ...]."""
    n = max(1, round(abs(a1 - a0) / (math.pi / 4)))
    step = (a1 - a0) / n
    out = []
    for i in range(n):
        m = a0 + step * (i + 0.5)
        e = a0 + step * (i + 1)
        k = radius / math.cos(step / 2)
        out.append(((center[0] + k * math.cos(m), center[1] + k * math.sin(m)), (center[0] + radius * math.cos(e), center[1] + radius * math.sin(e))))
    return out


def _disc(center, radius=HALF):
    p = SkPath()
    pen = p.getPen()
    pen.moveTo((center[0] + radius, center[1]))
    for control, end in _arc(center, radius, 0, 2 * math.pi):
        pen.qCurveTo(control, end)
    pen.closePath()
    return p


def _bar(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dy)
    nx, ny = -dy / d * HALF, dx / d * HALF
    p = SkPath()
    pen = p.getPen()
    pen.moveTo((a[0] + nx, a[1] + ny))
    pen.lineTo((b[0] + nx, b[1] + ny))
    pen.lineTo((b[0] - nx, b[1] - ny))
    pen.lineTo((a[0] - nx, a[1] - ny))
    pen.closePath()
    return p


def _bend(center, radius, a0, a1):
    """A stroke along an arc: the ring sector between radius - HALF and radius + HALF."""
    p = SkPath()
    pen = p.getPen()
    outer, inner = radius + HALF, radius - HALF
    pen.moveTo((center[0] + outer * math.cos(a0), center[1] + outer * math.sin(a0)))
    for control, end in _arc(center, outer, a0, a1):
        pen.qCurveTo(control, end)
    pen.lineTo((center[0] + inner * math.cos(a1), center[1] + inner * math.sin(a1)))
    for control, end in _arc(center, inner, a1, a0):
        pen.qCurveTo(control, end)
    pen.closePath()
    return p


def stroke(*points):
    """The pieces of one stroke through `points`: (col, row) or (col, row, radius). A radius (in
    pixels) rounds that corner, which must be a right angle; other corners get a round join."""
    pts = [pt(p[0], p[1]) for p in points]
    radii = [(p[2] if len(p) > 2 else 0) * PX for p in points]
    pieces = []
    at = pts[0]
    pieces.append(_disc(at))
    for i in range(1, len(pts)):
        corner, r = pts[i], radii[i]
        if r and 0 < i < len(pts) - 1:
            prev, nxt = pts[i - 1], pts[i + 1]
            u = _unit(prev, corner)
            v = _unit(corner, nxt)
            assert abs(u[0] * v[0] + u[1] * v[1]) < 1e-9, f"rounded corner {points[i]} is not a right angle"
            a = (corner[0] - u[0] * r, corner[1] - u[1] * r)
            b = (corner[0] + v[0] * r, corner[1] + v[1] * r)
            center = (a[0] + v[0] * r, a[1] + v[1] * r)
            if math.dist(at, a) > 1e-6:
                pieces.append(_bar(at, a))
            a0 = math.atan2(a[1] - center[1], a[0] - center[0])
            a1 = math.atan2(b[1] - center[1], b[0] - center[0])
            if a1 - a0 > math.pi:
                a1 -= 2 * math.pi
            if a0 - a1 > math.pi:
                a1 += 2 * math.pi
            pieces += [_disc(a), _bend(center, r, a0, a1), _disc(b)]
            at = b
        else:
            if math.dist(at, corner) > 1e-6:
                pieces.append(_bar(at, corner))
            pieces.append(_disc(corner))
            at = corner
    return pieces


def _unit(a, b):
    d = math.dist(a, b)
    return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)


# ---- Glyph sources --------------------------------------------------------------------------


class Builder:
    def __init__(self, font):
        self.font = font
        self.cmap = font.getBestCmap()
        self.glyphs = font.getGlyphSet()
        self.new = {}  # glyph name -> (glyph, advance)
        self.codes = {}  # code point -> glyph name
        # jgs_Font's outer contours run counter-clockwise; added glyphs match it.
        self.sign = 1 if _area(self._record("l")[0]) > 0 else -1

    def name(self, ch):
        return self.cmap[ord(ch)]

    def _record(self, glyph_name, transform=None):
        rec = DecomposingRecordingPen(self.glyphs)
        pen = TransformPen(rec, transform) if transform else rec
        self.glyphs[glyph_name].draw(pen)
        return _contours(rec.value)

    def clone(self, glyph_name, ch, code=None, transform=(1, 0, 0, 1, 0, 0), keep=None, advance=ADVANCE):
        """An existing character's outline, transformed, as a new glyph: every contour, or those
        whose bounds pass `keep(xmin, ymin, xmax, ymax)`. The points are jgs's own, moved."""
        tt = TTGlyphPen(None)
        pen = TransformPen(tt, transform)
        for contour in self._record(self.name(ch)):
            xs = [x for _, args in contour for x, _ in (a for a in args if a is not None)]
            ys = [y for _, args in contour for _, y in (a for a in args if a is not None)]
            if keep is None or keep(min(xs), min(ys), max(xs), max(ys)):
                for op, args in contour:
                    getattr(pen, op)(*args)
        self.new[glyph_name] = (tt.glyph(), advance)
        if code is not None:
            self.codes[code] = glyph_name

    def composed(self, code, base, mark, keep=None):
        """A letter Unicode has as one character: the contours of `base` (those passing `keep`)
        and the combining mark `mark` (a glyph added here) over it."""
        tt = TTGlyphPen(None)
        for contour in self._record(self.name(base)):
            ys = [y for _, args in contour for _, y in (a for a in args if a is not None)]
            if keep is None or keep(min(ys), max(ys)):
                for op, args in contour:
                    getattr(tt, op)(*args)
        rec = DecomposingRecordingPen({})
        self.new[mark][0].draw(TransformPen(rec, (1, 0, 0, 1, ADVANCE, 0)), self.font["glyf"])
        rec.replay(tt)
        self.new[f"uni{code:04X}"] = (tt.glyph(), ADVANCE)
        self.codes[code] = f"uni{code:04X}"

    def same(self, code, ch):
        """`code` drawn as the existing character `ch`."""
        self.clone(f"uni{code:04X}", ch, code)

    def turned(self, code, ch, height):
        """`code` as `ch` rotated a half turn in its cell, about the middle of `height` units."""
        self.clone(f"uni{code:04X}", ch, code, (-1, 0, 0, -1, ADVANCE, height))

    def add(self, glyph_name, pieces, code=None, advance=ADVANCE, dx=0):
        """A glyph from stroke pieces, merged into one outline."""
        builder = OpBuilder(fix_winding=True, keep_starting_points=False)
        for piece in pieces:
            builder.add(piece, PathOp.UNION)
        merged = builder.resolve()
        rec = DecomposingRecordingPen({})
        merged.draw(TransformPen(rec, (1, 0, 0, 1, dx, 0)))
        contours = _contours(rec.value)
        outer = max(contours, key=lambda c: abs(_area(c)))
        tt = TTGlyphPen(None)
        pen = tt if (_area(outer) > 0) == (self.sign > 0) else ReverseContourPen(tt)
        for contour in contours:
            for op, args in contour:
                getattr(pen, op)(*[None if a is None else (round(a[0]), round(a[1])) for a in args])
        self.new[glyph_name] = (tt.glyph(), advance)
        if code is not None:
            self.codes[code] = glyph_name

    def letter(self, code, *parts, dx=0):
        pieces = []
        for part in parts:
            pieces += part if isinstance(part, list) else [part]
        self.add(f"uni{code:04X}", pieces, code, dx=dx)

    def install(self):
        font = self.font
        order = font.getGlyphOrder()
        for glyph_name, (glyph, advance) in self.new.items():
            font["glyf"][glyph_name] = glyph
            glyph.recalcBounds(font["glyf"])
            font["hmtx"][glyph_name] = (advance, getattr(glyph, "xMin", 0))
            if glyph_name not in order:
                order.append(glyph_name)
        font.setGlyphOrder(order)
        # The font is opened with recalcBBoxes off (see main), so the tables that summarise the
        # glyphs are brought up to date here for the added ones.
        added = [g for g, _ in self.new.values() if g.numberOfContours > 0]
        head, hhea, maxp = font["head"], font["hhea"], font["maxp"]
        head.xMin = min([head.xMin] + [g.xMin for g in added])
        head.yMin = min([head.yMin] + [g.yMin for g in added])
        head.xMax = max([head.xMax] + [g.xMax for g in added])
        head.yMax = max([head.yMax] + [g.yMax for g in added])
        hhea.minLeftSideBearing = min([hhea.minLeftSideBearing] + [g.xMin for g in added])
        hhea.minRightSideBearing = min([hhea.minRightSideBearing] + [a - g.xMax for g, a in self.new.values() if g.numberOfContours > 0])
        hhea.xMaxExtent = max([hhea.xMaxExtent] + [g.xMax for g in added])
        maxp.maxPoints = max([maxp.maxPoints] + [len(g.coordinates) for g in added])
        maxp.maxContours = max([maxp.maxContours] + [g.numberOfContours for g in added])
        for table in font["cmap"].tables:
            if table.format == 4:
                table.cmap.update(self.codes)


def _contours(ops):
    out = []
    for op, args in ops:
        # A TrueType contour with no on-curve point (jgs's `o`) has no moveTo.
        if op == "moveTo" or not out or out[-1][-1][0] in ("closePath", "endPath"):
            out.append([])
        out[-1].append((op, args))
    return out


def _area(contour):
    """Signed area of a contour's control polygon (positive: counter-clockwise)."""
    pts = [p for _, args in contour for p in args if p is not None]
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


# Rows: capitals and ascenders top out on row 3, the x-height on row 7, the baseline is the bottom
# of row 11, descenders reach row 13. Columns 1 to 5 hold a letter; 0 and 6 are its side bearings.
X, CAP = 200, 360  # x-height and cap height in font units


def letters(b):
    s = stroke
    hook = s((4, 8), (6, 8, 1), (6, 10))  # the rhotic hook, on a letter drawn one column left
    oval = s((3, 7), (1, 7, 2), (1, 11, 2), (5, 11, 2), (5, 7, 2), (3, 7))  # o
    cap_oval = s((3, 3), (1, 3, 2), (1, 11, 2), (5, 11, 2), (5, 3, 2), (3, 3))  # O

    # Lowercase.
    b.letter(0x014B, s((1, 11), (1, 7, 2), (5, 7, 2), (5, 13, 1), (3, 13)))  # ŋ
    b.turned(0x0250, "a", X)  # ɐ
    b.letter(0x0251, oval, s((5, 7), (5, 11)))  # ɑ
    b.turned(0x0254, "c", X)  # ɔ
    b.turned(0x0259, "e", X)  # ə
    b.letter(0x025A, s((1, 7), (4, 7, 1), (4, 11, 1), (0, 11, 1), (0, 9), (4, 9)), hook)  # ɚ
    b.letter(0x025B, s((5, 7), (1, 7, 1), (1, 9, 1), (3, 9)), s((3, 9), (1, 9, 1), (1, 11, 1), (5, 11)))  # ɛ
    b.letter(0x025C, s((1, 7), (5, 7, 1), (5, 9, 1), (3, 9)), s((3, 9), (5, 9, 1), (5, 11, 1), (1, 11)))  # ɜ
    b.letter(0x025D, s((0, 7), (4, 7, 1), (4, 9, 1), (2, 9)), s((2, 9), (4, 9, 1), (4, 11, 1), (0, 11)), hook)  # ɝ
    b.same(0x0261, "g")  # ɡ
    b.letter(0x026A, s((2, 7), (4, 7)), s((3, 7), (3, 11)), s((2, 11), (4, 11)))  # ɪ
    b.letter(0x026C, s((3, 3), (3, 11)), s((3, 6), (1, 6, 1), (1, 8, 1), (3, 8)), s((3, 7), (5, 7)))  # ɬ
    b.turned(0x0279, "r", X)  # ɹ
    b.letter(0x027E, s((3, 11), (3, 7, 1), (5, 7, 1), (5, 8)))  # ɾ
    b.letter(0x0283, s((5, 4), (5, 3, 1), (3, 3, 1), (3, 13, 1), (1, 13, 1), (1, 12)))  # ʃ
    b.letter(0x028A, s((0, 7), (1, 7), (1, 11, 2), (5, 11, 2), (5, 7), (6, 7)))  # ʊ
    b.turned(0x028C, "v", X)  # ʌ
    b.letter(0x0292, s((1, 7), (5, 7), (3, 9)), s((3, 9), (5, 9, 2), (5, 13, 2), (1, 13, 1), (1, 12)))  # ʒ
    b.letter(0x0294, s((1, 5), (1, 3, 2), (5, 3, 2), (5, 6), (3, 8), (3, 11)), s((2, 11), (4, 11)))  # ʔ
    b.letter(0x1D7B, s((2, 7), (4, 7)), s((3, 7), (3, 11)), s((2, 11), (4, 11)), s((1, 9), (5, 9)))  # ᵻ
    # Theta: θ as a narrow oval; the script ϑ a row shorter, its bar on the x-height and out to
    # the left with a tick, so it sits in running lowercase.
    b.letter(0x03B8, s((3, 3), (2, 3, 1), (2, 11, 1), (4, 11, 1), (4, 3, 1), (3, 3)), s((2, 7), (4, 7)))  # θ
    b.letter(0x03D1, s((3, 4), (2, 4, 1), (2, 11, 1), (5, 11, 1), (5, 4, 1), (3, 4)), s((0, 6), (0, 7, 1), (5, 7)))  # ϑ

    # Capitals (JavaScript's toUpperCase of the letters above, where Unicode has one).
    b.letter(0x014A, s((1, 11), (1, 3, 2), (5, 3, 2), (5, 11, 1), (3, 11)))  # Ŋ
    b.turned(0x0186, "C", CAP)  # Ɔ
    b.letter(0x018F, s((2, 3), (5, 3, 2), (5, 11, 2), (1, 11, 2), (1, 7), (5, 7)))  # Ə
    b.letter(0x0190, s((5, 3), (1, 3, 2), (1, 7, 2), (4, 7)), s((4, 7), (1, 7, 2), (1, 11, 2), (5, 11)))  # Ɛ
    b.same(0x01A9, "Σ")  # Ʃ
    b.letter(0x01B1, s((0, 3), (1, 3), (1, 11, 2), (5, 11, 2), (5, 3), (6, 3)))  # Ʊ
    b.letter(0x01B7, s((1, 3), (5, 3), (2, 6), (3, 6)), s((2, 6), (5, 6, 2), (5, 11, 2), (1, 11, 1), (1, 10)))  # Ʒ
    b.turned(0x0245, "V", CAP)  # Ʌ
    b.same(0x03F4, "Θ")  # ϴ
    b.letter(0x2C6D, cap_oval, s((5, 3), (5, 11)))  # Ɑ
    b.turned(0x2C6F, "A", CAP)  # Ɐ
    b.letter(0xA7AB, s((1, 3), (5, 3, 2), (5, 7, 2), (2, 7)), s((2, 7), (5, 7, 2), (5, 11, 2), (1, 11)))  # Ɜ
    b.same(0xA7AC, "G")  # Ɡ
    b.letter(0xA7AD, s((2, 3), (2, 11), (5, 11)), s((2, 5), (0, 5, 1), (0, 7, 1), (2, 7)), s((2, 6), (4, 6)))  # Ɬ
    b.same(0xA7AE, "I")  # Ɪ

    # IPA's own stress ticks and length mark, for text that keeps them.
    b.letter(0x02C8, s((3, 3), (3, 5)))  # ˈ
    b.letter(0x02CC, s((3, 11), (3, 13)))  # ˌ
    b.same(0x02D0, ":")  # ː


def marks(b):
    """Combining marks: no advance, drawn one cell to the left of the origin, so they land on the
    letter before them with or without the GPOS anchors below. Over a capital the accent is the
    one jgs draws on À and Á, chosen by the `ccmp` feature; like those, it rises one pixel above
    the cell (to 520 units), which is why the font's ascent is 524."""
    s = stroke
    back = (1, 0, 0, 1, -ADVANCE, 0)

    def high(_x0, y0, _x1, _y1):
        return y0 >= CAP

    b.clone("uni0300", "`", 0x0300, back, advance=0)
    b.clone("uni0301", "´", 0x0301, back, advance=0)
    b.clone("uni0300.cap", "À", None, back, high, advance=0)
    b.clone("uni0301.cap", "Á", None, back, high, advance=0)
    b.add("uni0304", s((2, 5), (4, 5)), 0x0304, advance=0, dx=-ADVANCE)
    b.add("uni0304.cap", s((2, 1), (4, 1)), advance=0, dx=-ADVANCE)
    b.add("uni0329", s((3, 13), (3, 14)), 0x0329, advance=0, dx=-ADVANCE)  # syllabic, below

    # Accented letters Unicode has as one character and jgs lacks, so text in either form draws.
    def body(_y0, y1):  # i without its dot
        return y1 <= X

    b.composed(0x01FC, "Æ", "uni0301.cap")  # Ǽ
    b.composed(0x01FD, "æ", "uni0301")  # ǽ
    for code, base in [(0x0100, "A"), (0x0112, "E"), (0x012A, "I"), (0x014C, "O"), (0x016A, "U"), (0x01E2, "Æ")]:
        b.composed(code, base, "uni0304.cap")  # Ā Ē Ī Ō Ū Ǣ
    for code, base in [(0x0101, "a"), (0x0113, "e"), (0x014D, "o"), (0x016B, "u"), (0x01E3, "æ")]:
        b.composed(code, base, "uni0304")  # ā ē ō ū ǣ
    b.composed(0x012B, "i", "uni0304", body)  # ī


def features(font, b):
    cmap = font.getBestCmap()
    by_name = {}
    for code, glyph_name in cmap.items():
        by_name.setdefault(glyph_name, code)
    upper = sorted(n for n, c in by_name.items() if chr(c).isupper())
    lower = sorted(n for n, c in by_name.items() if chr(c).islower() or 0x0250 <= c <= 0x02AF or c == 0x1D7B)
    above = ["uni0300", "uni0301", "uni0304"]
    caps = [f"{m}.cap" for m in above]
    all_marks = above + caps + ["uni0329"]
    # A letter and accent the font already draws as one glyph (á, À, í with its dot removed).
    composed = []
    for code, glyph_name in sorted(cmap.items()):
        d = unicodedata.decomposition(chr(code)).split()
        if len(d) == 2 and not d[0].startswith("<") and int(d[1], 16) in (0x0300, 0x0301, 0x0304) and int(d[0], 16) in cmap:
            composed.append(f"    sub {cmap[int(d[0], 16)]} uni{int(d[1], 16):04X} by {glyph_name};")
    x = ADVANCE // 2
    fea = f"""
languagesystem DFLT dflt;
languagesystem latn dflt;
languagesystem grek dflt;
@UPPER = [{" ".join(upper)}];
@LOWER = [{" ".join(lower)}];
@ABOVE = [{" ".join(above)}];
@ABOVE_CAP = [{" ".join(caps)}];
@MARKS = [{" ".join(all_marks)}];
table GDEF {{
  GlyphClassDef [@UPPER @LOWER], , @MARKS, ;
}} GDEF;
feature ccmp {{
  lookup compose {{
{chr(10).join(composed)}
  }} compose;
  lookup capital {{
    sub @UPPER @ABOVE' by @ABOVE_CAP;
  }} capital;
}} ccmp;
markClass @ABOVE <anchor {x - ADVANCE} {X}> @TOP;
markClass @ABOVE_CAP <anchor {x - ADVANCE} {CAP}> @TOP;
markClass uni0329 <anchor {x - ADVANCE} 0> @BOTTOM;
feature mark {{
  pos base @LOWER <anchor {x} {X}> mark @TOP <anchor {x} 0> mark @BOTTOM;
  pos base @UPPER <anchor {x} {CAP}> mark @TOP <anchor {x} 0> mark @BOTTOM;
}} mark;
"""
    addOpenTypeFeaturesFromString(font, fea)


def names(font):
    """The modified font's names; the copyright stays and the description says what changed."""
    name = font["name"]
    full = FAMILY
    for record in list(name.names):
        if record.nameID in (1, 4, 16):
            name.setName(full, record.nameID, record.platformID, record.platEncID, record.langID)
        elif record.nameID == 6:
            name.setName(full.replace(" ", ""), 6, record.platformID, record.platEncID, record.langID)
        elif record.nameID == 3:
            name.setName(f"{full} : arfct/system-ascii", 3, record.platformID, record.platEncID, record.langID)
    note = "Based on jgs_Font by Adel Faure (SIL Open Font License 1.1). Modified by arfct/system-ascii (scripts/build-vector.py): IPA letters and combining accents added."
    for platform, encoding, language in {(r.platformID, r.platEncID, r.langID) for r in name.names}:
        name.setName(note, 10, platform, encoding, language)


def main():
    # recalcBBoxes off: jgs_Font stores bounds and side bearings that differ by a unit from what
    # fontTools computes for 137 glyphs (`│` among them), and a rasteriser places a glyph by them.
    # Recomputing moved the frame strokes a 560th of an em, enough to fail the stroke continuity
    # checks in scripts/components.mjs. recalcTimestamp off: the same bytes on every run.
    font = TTFont(SRC, recalcBBoxes=False, recalcTimestamp=False)
    b = Builder(font)
    letters(b)
    marks(b)
    b.install()
    features(font, b)
    names(font)
    font["OS/2"].recalcUnicodeRanges(font)
    font["OS/2"].usLastCharIndex = max(font.getBestCmap())
    font.save(OUT_TTF)
    font = TTFont(OUT_TTF, recalcBBoxes=False, recalcTimestamp=False)
    font.flavor = "woff2"
    font.save(OUT_WOFF2)
    added = sorted(b.codes)
    print(f"wrote {OUT_TTF.relative_to(ROOT)} and {OUT_WOFF2.relative_to(ROOT)}: {len(added)} characters added")
    print(" ".join(f"U+{c:04X}" for c in added))


main()
