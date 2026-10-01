"""Traditional-Chinese title mock-ups styled after the asset pack's Simplified art.

Writes research/zh-hant-draft/<name>_<font>.png and a comparison sheet
research/zh-hant-draft.png (original Simplified | 標楷體 | 微軟正黑體 Bold).
Run: python scripts/design-zh-hant.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/zh-hant-draft'
FONTS = {'kai': 'C:/Windows/Fonts/kaiu.ttf', 'hei': 'C:/Windows/Fonts/msjhbd.ttc'}

# name: (lines, style)
TITLES = {
    'title_free_won': (['贏得免費旋轉'], 'green'),
    'label_remaining': (['剩餘免費', '旋轉次數'], 'orange'),
    'title_big_win': (['大獎'], 'green3d'),
}


def text_mask(lines, font_path, size, bold):
    font = ImageFont.truetype(font_path, size)
    widths = [font.getbbox(line)[2] for line in lines]
    width, height = max(widths) + 40, int(size * 1.12) * len(lines) + 40
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for index, line in enumerate(lines):
        draw.text((20, 14 + index * int(size * 1.12)), line, font=font, fill=255)
    if bold:
        mask = mask.filter(ImageFilter.MaxFilter(bold))
    return mask


def gradient(size, stops):
    """Vertical gradient through [(t, (r, g, b)), ...]."""
    width, height = size
    image = Image.new('RGB', size)
    pixels = image.load()
    for y in range(height):
        t = y / max(1, height - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                color = tuple(round(a + (b - a) * k) for a, b in zip(c0, c1))
                break
        for x in range(width):
            pixels[x, y] = color
    return image


def grow(mask, radius):
    return mask.filter(ImageFilter.MaxFilter(radius * 2 + 1)) if radius else mask


def layer(mask, color):
    image = Image.new('RGBA', mask.size, color + (0,))
    image.putalpha(mask)
    return image


def shift(mask, dx, dy):
    return ImageChops.offset(mask, dx, dy)


def render(lines, style, font_path, size=150):
    bold = 7 if 'kaiu' in font_path else 3
    pad = 40
    core = text_mask(lines, font_path, size, bold)
    core = Image.new('L', (core.width + pad * 2, core.height + pad * 2), 0) if False else core.crop((-pad, -pad, core.width + pad, core.height + pad))
    canvas = Image.new('RGBA', core.size, (0, 0, 0, 0))
    if style in ('green', 'green3d'):
        outline = grow(core, 7)
        depth = 16 if style == 'green3d' else 11
        glow = grow(core, 16).filter(ImageFilter.GaussianBlur(14))
        canvas.alpha_composite(layer(glow.point(lambda v: v * .7), (255, 226, 120)))
        for step in range(depth, 0, -1):   # extrusion: gold under, dark-green rim
            canvas.alpha_composite(layer(shift(outline, 0, step), (232, 160, 30) if step > depth * .45 else (10, 80, 30)))
        canvas.alpha_composite(layer(outline, (255, 248, 222)))
        fill = gradient(core.size, [(0, (150, 232, 96)), (.4, (34, 160, 48)), (1, (4, 84, 26))]).convert('RGBA')
        fill.putalpha(core)
        canvas.alpha_composite(fill)
        shine = gradient(core.size, [(0, (255, 255, 255)), (.35, (255, 255, 255)), (.5, (0, 0, 0)), (1, (0, 0, 0))]).convert('L')
        canvas.alpha_composite(layer(ImageChops.multiply(core, shine.point(lambda v: v * 0.22)), (255, 255, 255)))
    else:  # orange brush label
        outline = grow(core, 4)
        canvas.alpha_composite(layer(shift(grow(core, 5), 4, 7).filter(ImageFilter.GaussianBlur(3)), (40, 8, 0)))
        canvas.alpha_composite(layer(outline, (92, 30, 6)))
        fill = gradient(core.size, [(0, (255, 246, 190)), (.4, (255, 190, 60)), (1, (214, 92, 10))]).convert('RGBA')
        fill.putalpha(core)
        canvas.alpha_composite(fill)
    box = canvas.getbbox()
    return canvas.crop(box) if box else canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, (lines, style) in TITLES.items():
        original = Image.open(ROOT / f'public/assets/skin/zh/{name}.png').convert('RGBA')
        row = [original]
        for key, path in FONTS.items():
            image = render(lines, style, path)
            image.save(OUT / f'{name}_{key}.png')
            row.append(image)
        rows.append(row)
    cell_h = 230
    scaled = [[im.resize((round(im.width * cell_h / im.height), cell_h)) for im in row] for row in rows]
    width = max(sum(im.width for im in row) + 60 * len(row) for row in scaled) + 60
    sheet = Image.new('RGBA', (width, (cell_h + 70) * len(rows) + 70), (88, 26, 14, 255))
    draw = ImageDraw.Draw(sheet)
    label_font = ImageFont.truetype(FONTS['hei'], 30)
    for index, title in enumerate(['原版簡體', '繁體 A：標楷體', '繁體 B：微軟正黑體']):
        draw.text((60 + index * (width // 3), 18), title, font=label_font, fill=(255, 226, 150))
    for r, row in enumerate(scaled):
        x = 60
        for c, im in enumerate(row):
            sheet.alpha_composite(im, (60 + c * (width // 3), 70 + r * (cell_h + 70)))
    sheet.convert('RGB').save(ROOT / 'research/zh-hant-draft.png')
    print('wrote', OUT, 'and research/zh-hant-draft.png')


if __name__ == '__main__':
    main()
