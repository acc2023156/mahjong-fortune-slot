"""Slice the reference Cocos atlases (no frame metadata available) into named
sprites under public/assets/skin/. Rects were measured from alpha connected
components. Rerun after changing a rect:  python scripts/extract-skin.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'public/assets/pgsoft-reference/images'
OUT = ROOT / 'public/assets/skin'
A = 'atlas-subresources/sprite-'
ATLAS = {
    'symbols': 'texture/symbols/symbols.png',
    'feature': 'texture/symbols/feature_symbols.png',
    'spin': A + '2f32ef15-62a7-48a1-a1c6-3f1c2c0ad4f8.d10ff.png',
    'plaque': A + '3d039d70-4483-4e81-8c2a-723f3e86a819.36c36.png',
    'multG': A + '787f8e24-049a-47eb-8b06-6c30aaaf4c8e.0baf3.png',
    'ui': A + '6737e5a0-4b0b-4887-8c8b-de2915097fa8.f1b49.png',
    'menu': 'lib/setting_menu/texture/hd/setting_menu.png',
    'info': 'texture/info_message/info_message.png',
    'digitsG': A + '45979e75-3d36-417c-900f-a148b6a0bb92.7f863.png',
    'digitsS': A + 'f7e7cd80-4edd-4c51-8dbd-3c514425f64b.2c43c.png',
    'totalwin': 'texture/total_win/total_win.png',
    'freespins': 'texture/free_spins/free_spins.png',
    'bonus': 'texture/bonus_loading/bonus_loading.png',
    'bigwin': 'texture/big_win/big_win.png',
    'frames': A + '0b4ae3cc-5d5a-4da1-92d8-8203ee193674.dc619.png',
    'coins': A + '8587692a-857e-4c8b-8a13-2bcd32268fda.4928a.png',
    'mound': A + '3a86452c-ea91-482c-9947-9be84128f230.76e69.png',
    'fly': A + '3c02cdc3-0697-43d9-ad79-2cce25e0efeb.44816.png',
    'felt': A + '02186b2c-cd37-4300-9a31-0688800f79dc.8ee8b.jpg',
    'tiles3d': A + '919329ec-d941-4cb0-a29e-b057e7622ce6.e5924.png',
    'glow': A + '28cb599e-6289-4433-a4ee-fc393dad8356.26ff7.png',
    'star': A + 'f9f91a4f-443a-403e-904f-e6e77ae5f96a.041b0.png',
}

# name: (atlas, [rects x,y,w,h to union], rotate degrees CCW)
SPRITES = {
    'tile_white': ('symbols', [(821, 0, 159, 188)], 0),
    'tile_gold': ('symbols', [(658, 1, 160, 190)], 0),
    'tile_blur': ('symbols', [(819, 193, 115, 148)], 0),
    'ingot': ('symbols', [(668, 282, 139, 83)], 0),
    'glyph_fa': ('symbols', [(28, 212, 112, 130)], 0),
    'glyph_zhong': ('symbols', [(206, 24, 91, 126)], 0),
    'glyph_bai': ('symbols', [(199, 213, 101, 129)], 0),
    'glyph_wan8': ('symbols', [(49, 20, 80, 134)], 0),
    'glyph_tong5': ('symbols', [(366, 220, 96, 118)], 0),
    'glyph_suo5': ('symbols', [(536, 216, 81, 127)], 0),
    'glyph_tong2': ('symbols', [(386, 30, 55, 122)], 0),
    'glyph_suo2': ('symbols', [(566, 24, 23, 129)], 0),
    'glyph_hu': ('feature', [(3, 6, 157, 175)], 0),
    'text_wild': ('feature', [(168, 18, 157, 74)], 0),
    'spin_idle': ('spin', [(3, 3, 194, 182)], 0),
    'spin_round': ('spin', [(4, 192, 193, 180)], 0),
    'spin_arrows': ('spin', [(0, 374, 120, 120)], 0),
    'plaque_green': ('plaque', [(2, 0, 729, 93)], 0),
    'plaque_purple': ('plaque', [(6, 104, 723, 135)], 0),
    'plaque_win': ('plaque', [(28, 250, 659, 80)], 0),
    'header_red': ('ui', [(0, 0, 758, 624)], 0),
    'panel_wood': ('ui', [(0, 628, 758, 585)], 0),
    'footer_red': ('ui', [(0, 1215, 758, 215)], 0),
    'bar_ways': ('ui', [(0, 1458, 758, 97)], 0),
    'bar_mult': ('ui', [(0, 1576, 758, 97)], 0),
    'felt': ('felt', [(0, 0, 755, 882)], 0),
    'mult_x10': ('multG', [(0, 0, 160, 94)], 0),
    'mult_x4': ('multG', [(165, 0, 120, 94)], 0),
    'mult_x3': ('multG', [(292, 0, 118, 94)], 0),
    'mult_x6': ('multG', [(416, 0, 118, 94)], 0),
    'mult_x5': ('multG', [(538, 0, 116, 94)], 0),
    'mult_x2': ('multG', [(655, 0, 120, 94)], 0),
    'mult_x1': ('multG', [(782, 0, 106, 94)], 0),
    'msg_scatter': ('info', [(0, 0, 1292, 64)], 0),
    'msg_ways': ('info', [(1294, 0, 625, 62)], 0),
    'msg_free_x10': ('info', [(0, 64, 1122, 66)], 0),
    'msg_gold': ('info', [(0, 132, 1015, 72)], 0),
    'msg_x5': ('info', [(1246, 110, 700, 58)], 0),
    'title_ways': ('info', [(1292, 62, 300, 50)], 0),
    'label_win': ('info', [(1015, 142, 150, 64)], 0),
    'label_total_win': ('info', [(1124, 70, 124, 78)], 0),
    'title_total_win': ('totalwin', [(0, 0, 596, 138)], 0),
    'btn_collect': ('totalwin', [(0, 140, 234, 81)], 0),
    'label_remaining': ('freespins', [(0, 0, 361, 124)], 0),
    'label_last_free': ('freespins', [(380, 0, 586, 124)], 0),
    'title_free_won': ('bonus', [(0, 571, 170, 698)], 90),
    'label_start': ('bonus', [(0, 0, 170, 42)], 0),
    'label_doubled': ('bonus', [(0, 95, 170, 477)], 90),
    'title_big_win': ('bigwin', [(0, 0, 165, 448)], 90),
    'title_mega_win': ('bigwin', [(166, 298, 599, 168)], 0),
    'title_super_mega_win': ('bigwin', [(161, 0, 652, 295)], 0),
    'tile_side': ('tiles3d', [(338, 193, 130, 188)], 0),
    'tile_back': ('tiles3d', [(1, 388, 183, 114)], 0),
    'win_frame': ('frames', [(4, 0, 124, 141)], 0),
    'coin': ('coins', [(6, 6, 104, 103)], 0),
    'coin_side': ('coins', [(237, 7, 92, 92)], 0),
    'coin_mound': ('mound', [(0, 0, 756, 1051)], 0),
    'flying_tiles': ('fly', [(0, 0, 756, 1638)], 0),
    'star': ('star', [(0, 0, 100, 100)], 0),
    'icon_turbo_off': ('menu', [(866, 0, 74, 70)], 0),
    'icon_turbo_on': ('menu', [(390, 518, 58, 72)], 0),
    'icon_plus': ('menu', [(820, 530, 58, 58)], 0),
    'icon_play': ('menu', [(896, 248, 44, 52)], 0),
}

DIGITS = '4385692071x.'
DIGIT_RECTS = [(4, 4, 41, 54), (53, 3, 40, 54), (101, 3, 41, 54), (148, 4, 41, 54), (196, 4, 39, 53), (243, 4, 39, 54),
               (289, 3, 43, 53), (339, 4, 44, 52), (390, 4, 43, 52), (440, 4, 26, 51), (473, 4, 39, 39), (519, 3, 15, 24)]


# Frame sequences for effects: (prefix, atlas file, rects in playback order, luminance-to-alpha).
FX_A = 'atlas-subresources/sprite-'
SEQUENCES = [
    # Tile turning from face-on to its teal side (used when winners clear).
    ('turn', FX_A + '919329ec-d941-4cb0-a29e-b057e7622ce6.e5924.png',
     [(339, 1, 158, 188), (173, 196, 161, 189), (3, 195, 167, 188), (3, 3, 169, 188), (175, 1, 159, 190), (338, 193, 130, 188)], False),
    # Gold starburst, bright flash to fade.
    ('burst', FX_A + '503f7462-bb14-4e80-9d50-57622be05c21.19bc2.png',
     [(700, 697, 134, 149), (513, 687, 170, 168), (509, 475, 190, 195), (513, 246, 208, 210), (508, 12, 215, 216),
      (264, 501, 223, 221), (259, 11, 229, 224), (8, 270, 234, 227), (16, 10, 226, 239)], False),
    # Spinning gold coin.
    ('coinspin', FX_A + '8587692a-857e-4c8b-8a13-2bcd32268fda.4928a.png',
     [(7, 7, 102, 102), (128, 122, 91, 95), (237, 7, 92, 91), (241, 115, 85, 88), (225, 319, 76, 79), (128, 237, 76, 76),
      (323, 320, 75, 76), (238, 221, 82, 80)], False),
    # WIN plaque payout flash: glowing bar bursting with coins.
    ('plaquefx', FX_A + 'b0c8986a-cf13-49f0-9be8-0cc93f03adb2.19b16.jpg',
     [(769, 1158, 289, 122), (25, 36, 503, 233), (6, 339, 538, 245), (553, 33, 526, 240), (21, 657, 510, 224),
      (585, 361, 470, 200), (97, 975, 352, 203)], True),
    # 胡 scatter aura: blurred orange 胡 glow and radial light rays.
    ('hufx', FX_A + '22480547-c484-4511-a172-585e6db7c80a.bf7c4.jpg',
     [(403, 158, 78, 84), (406, 7, 134, 136)], True),
    # Near-miss reel: thin gold frame, yellow light column, thin edge glow.
    ('nearmiss', FX_A + 'cb72e539-e2b7-41ce-9cac-e8e7c5e041e9.6bbc2.jpg',
     [(235, 280, 52, 324), (85, 345, 136, 286), (279, 604, 35, 254)], True),
    # Win highlight: gold outline frame and inner glow around a tile.
    ('hl', FX_A + '2ada7886-83e0-4d3c-b651-eae6ad6b5c7a.22e5d.jpg',
     [(165, 13, 78, 81), (260, 2, 72, 76), (34, 150, 172, 68)], True),
]


def luminance_to_alpha(img):
    """JPG effect sheets are drawn on black; turn brightness into straight alpha."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, _ = px[x, y]
            a = max(r, g, b)
            px[x, y] = (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a) if a else (0, 0, 0, 0)
    return img


def crop(atlas, rects, rotate):
    img = Image.open(SRC / ATLAS.get(atlas, atlas)).convert('RGBA')
    x0 = min(r[0] for r in rects)
    y0 = min(r[1] for r in rects)
    x1 = max(r[0] + r[2] for r in rects)
    y1 = max(r[1] + r[3] for r in rects)
    part = img.crop((x0, y0, min(x1, img.width), min(y1, img.height)))
    return part.rotate(rotate, expand=True) if rotate else part


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (atlas, rects, rotate) in SPRITES.items():
        crop(atlas, rects, rotate).save(OUT / f'{name}.png')
    for tint, atlas in (('gold', 'digitsG'), ('silver', 'digitsS')):
        for ch, (x, _y, w, _h) in zip(DIGITS, DIGIT_RECTS):
            key = {'x': 'x', '.': 'dot'}.get(ch, ch)
            glyph = crop(atlas, [(max(0, x - 2), 0, w + 4, 62)], 0)
            if key == 'dot':
                # The slot stacks a comma above the period; keep only the period.
                glyph.paste((0, 0, 0, 0), (0, 0, glyph.width, 29))
            glyph.save(OUT / f'digit_{tint}_{key}.png')
    frames = 0
    for prefix, source, rects, lum in SEQUENCES:
        for index, rect in enumerate(rects):
            part = crop(source, [rect], 0)
            (luminance_to_alpha(part) if lum else part).save(OUT / f'{prefix}_{index}.png')
            frames += 1
    print(f'wrote {len(SPRITES) + 2 * len(DIGITS) + frames} sprites to {OUT}')


if __name__ == '__main__':
    main()
