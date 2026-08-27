"""Compose the three final-round environments into media/final-latent.png (A | B | C)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(r"C:\Users\tanis\.cursor\projects\c-IMP-FILES-Event-The-Predictive-Engine\assets")
OUT = Path(__file__).parent.parent / "media" / "final-latent.png"

# Real image sits in slot B to match ANSWER_KEY.final = "b".
panels = [
    ("A", ASSETS / "env-a-decoy.png"),
    ("B", ASSETS / "env-b-real.png"),
    ("C", ASSETS / "env-c-decoy.png"),
]

TARGET_H = 768
GUTTER = 24
PAD = GUTTER
BG = (10, 10, 14)
LABEL_BG = (0, 0, 0)
LABEL_FG = (255, 255, 255)


def load_font(size):
    for name in ("arialbd.ttf", "arial.ttf", "segoeuib.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


imgs = []
for _, p in panels:
    im = Image.open(p).convert("RGB")
    w = int(im.width * TARGET_H / im.height)
    imgs.append(im.resize((w, TARGET_H), Image.LANCZOS))

total_w = sum(im.width for im in imgs) + GUTTER * (len(imgs) - 1) + PAD * 2
total_h = TARGET_H + PAD * 2
canvas = Image.new("RGB", (total_w, total_h), BG)
draw = ImageDraw.Draw(canvas)
font = load_font(46)

x = PAD
for (label, _), im in zip(panels, imgs):
    canvas.paste(im, (x, PAD))
    # Label badge in the top-left corner of each panel.
    bw, bh = 64, 64
    bx, by = x + 14, PAD + 14
    draw.rectangle([bx, by, bx + bw, by + bh], fill=LABEL_BG)
    tb = draw.textbbox((0, 0), label, font=font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    draw.text((bx + (bw - tw) / 2 - tb[0], by + (bh - th) / 2 - tb[1]), label, fill=LABEL_FG, font=font)
    x += im.width + GUTTER

OUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT)
print(f"Saved {OUT} ({canvas.width}x{canvas.height})")
