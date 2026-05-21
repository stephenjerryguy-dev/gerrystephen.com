from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import shutil

ROOT = Path(__file__).resolve().parents[1]
W, H = 1200, 630

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_MONO = "/System/Library/Fonts/SFNSMono.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def lerp(a, b, t):
    return int(a + (b - a) * t)


def gradient(top, mid, bottom):
    img = Image.new("RGB", (W, H), top)
    pix = img.load()
    for y in range(H):
        t = y / (H - 1)
        if t < 0.58:
            k = t / 0.58
            c = tuple(lerp(top[i], mid[i], k) for i in range(3))
        else:
            k = (t - 0.58) / 0.42
            c = tuple(lerp(mid[i], bottom[i], k) for i in range(3))
        for x in range(W):
            pix[x, y] = c
    return img.convert("RGBA")


def rounded_rect(size, radius, fill, outline=None, width=1, blur=0):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    inset = max(width, 0)
    d.rounded_rectangle(
        (inset, inset, size[0] - inset, size[1] - inset),
        radius,
        fill=fill,
        outline=outline,
        width=width,
    )
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer


def paste_icon(canvas, icon_path, xy, size, glow_color):
    icon = Image.open(ROOT / icon_path).convert("RGBA")
    icon.thumbnail((size, size), Image.Resampling.LANCZOS)
    x, y = xy
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    mask = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    md = ImageDraw.Draw(mask)
    md.ellipse((0, 0, size, size), fill=glow_color)
    glow.alpha_composite(mask.filter(ImageFilter.GaussianBlur(34)), (x, y))
    canvas.alpha_composite(glow)
    canvas.alpha_composite(icon, (x + (size - icon.width) // 2, y + (size - icon.height) // 2))


def wrap_text(draw, text, fnt, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        probe = f"{current} {word}".strip()
        if draw.textlength(probe, font=fnt) <= max_width or not current:
            current = probe
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_button(draw, xy, text, fill, text_fill, outline=None):
    x, y = xy
    w, h = 314 if len(text) > 14 else 246, 58
    draw.rounded_rectangle((x, y, x + w, y + h), 29, fill=fill, outline=outline, width=1)
    draw.text((x + 28, y + 19), text, font=font(FONT_MONO, 18), fill=text_fill, spacing=4)


def make_main():
    img = gradient((216, 243, 248), (249, 240, 210), (187, 238, 233))
    d = ImageDraw.Draw(img, "RGBA")
    for y in range(0, H, 58):
        d.line((0, y, W, y), fill=(16, 35, 51, 12), width=1)
    for x in range(0, W, 72):
        d.line((x, 0, x, H), fill=(16, 35, 51, 10), width=1)
    for r, a in [(170, 70), (110, 90), (56, 110)]:
        d.ellipse((846 - r, 150 - r, 846 + r, 150 + r), fill=(255, 178, 102, a))
    d.pieslice((-140, 380, 470, 820), 180, 360, fill=(249, 230, 178, 255))
    d.polygon([(0, 400), (170, 356), (348, 404), (520, 360), (710, 396), (900, 342), (1200, 382), (1200, 630), (0, 630)], fill=(105, 198, 192, 82))
    shadow = rounded_rect((1060, 494), 42, (44, 125, 138, 32), blur=24)
    img.alpha_composite(shadow, (70, 86))
    card = rounded_rect((1060, 494), 42, (255, 255, 255, 118), outline=(16, 35, 51, 24), width=2)
    img.alpha_composite(card, (70, 68))
    paste_icon(img, "assets/gerrys-iglu-icon-512.png", (792, 110), 300, (136, 220, 230, 96))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((118, 148), "BUSINESS  WEB3  COMMUNITY", font=font(FONT_MONO, 25), fill=(42, 130, 150, 255))
    d.text((118, 246), "Gerry's Iglu", font=font(FONT_BOLD, 88), fill=(16, 35, 51, 255))
    body_font = font(FONT_REG, 29)
    y = 356
    for line in wrap_text(d, "A one-page home base for business, Web3, family, Pudgy, Sappy, Inkfinity Canvas, Blue Star, Zeppole Dolci, and Monerge.", body_font, 620):
        d.text((120, y), line, font=body_font, fill=(16, 35, 51, 196))
        y += 37
    draw_button(d, (120, 492), "GERRYSTEPHEN.COM", (14, 31, 44, 255), (247, 251, 255, 255))
    img.save(ROOT / "assets/og-gerrys-iglu.png", optimize=True)


def make_monerge():
    img = gradient((17, 11, 50), (38, 22, 79), (158, 232, 240))
    d = ImageDraw.Draw(img, "RGBA")
    for y in range(0, H, 64):
        d.line((0, y, W, y), fill=(255, 255, 255, 18), width=1)
    for x in range(0, W, 64):
        d.line((x, 0, x, H), fill=(255, 255, 255, 16), width=1)
    for i in range(5):
        x = 160 + i * 130
        y = 120 + int(math.sin(i) * 24)
        d.rounded_rectangle((x, y, x + 86, y + 86), 18, fill=(155, 129, 255, 60), outline=(255, 255, 255, 28))
    d.ellipse((775, -80, 1230, 360), fill=(143, 232, 241, 38))
    shadow = rounded_rect((1060, 494), 42, (5, 8, 24, 76), blur=26)
    img.alpha_composite(shadow, (70, 86))
    card = rounded_rect((1060, 494), 42, (255, 255, 255, 26), outline=(255, 255, 255, 42), width=2)
    img.alpha_composite(card, (70, 68))
    paste_icon(img, "assets/monerge-icon-512.png", (804, 126), 260, (143, 232, 241, 108))
    d = ImageDraw.Draw(img, "RGBA")
    d.text((118, 148), "BUILT ON MONAD", font=font(FONT_MONO, 26), fill=(159, 234, 244, 255))
    d.text((118, 258), "Monerge", font=font(FONT_BOLD, 98), fill=(247, 251, 255, 255))
    body_font = font(FONT_REG, 29)
    y = 378
    for line in wrap_text(d, "A wallet-backed focus game with Monanimal tiles, hidden scores, difficulty modes, and public runs.", body_font, 650):
        d.text((120, y), line, font=body_font, fill=(247, 251, 255, 210))
        y += 38
    draw_button(d, (120, 492), "PLAY MONERGE", (143, 119, 255, 72), (247, 251, 255, 255), outline=(143, 232, 241, 96))
    img.save(ROOT / "assets/og-monerge.png", optimize=True)


make_main()
make_monerge()
(ROOT / "public/assets").mkdir(parents=True, exist_ok=True)
shutil.copyfile(ROOT / "assets/og-gerrys-iglu.png", ROOT / "public/assets/og-gerrys-iglu.png")
shutil.copyfile(ROOT / "assets/og-monerge.png", ROOT / "public/assets/og-monerge.png")
print("Generated OpenGraph images.")
