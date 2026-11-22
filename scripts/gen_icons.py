"""生成扩展图标：深色圆角底 + 橙色 HB 字标。"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icon"
OUT.mkdir(parents=True, exist_ok=True)

BG = (18, 21, 28, 255)
EDGE = (43, 53, 67, 255)
ACCENT = (255, 138, 76, 255)
ACCENT_DARK = (226, 98, 43, 255)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def render(size: int) -> Image.Image:
    scale = 4
    canvas = size * scale
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = int(canvas * 0.22)
    draw.rounded_rectangle(
        [(0, 0), (canvas - 1, canvas - 1)], radius=radius, fill=BG, outline=EDGE, width=max(1, scale)
    )

    # 左上角高光条
    glow = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(
        [(0, 0), (canvas - 1, canvas - 1)],
        radius=radius,
        outline=(255, 138, 76, 40),
        width=max(2, int(canvas * 0.06)),
    )
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    text = "HB"
    font = load_font(int(canvas * 0.46))
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (canvas - tw) / 2 - bbox[0]
    ty = (canvas - th) / 2 - bbox[1] - canvas * 0.05

    # 简单立体感：先画深色偏移，再画亮色
    draw.text((tx + canvas * 0.012, ty + canvas * 0.012), text, font=font, fill=ACCENT_DARK)
    draw.text((tx, ty), text, font=font, fill=ACCENT)

    # 底部强调线
    line_w = int(tw * 0.9)
    line_x0 = (canvas - line_w) / 2
    line_y = ty + th + canvas * 0.10
    draw.rounded_rectangle(
        [(line_x0, line_y), (line_x0 + line_w, line_y + max(2, canvas * 0.028))],
        radius=canvas * 0.02,
        fill=ACCENT,
    )

    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    render(size).save(OUT / f"{size}.png")
    print("wrote", OUT / f"{size}.png")
