# Assets used by Donut Works

Everything here is free to use and vendored into the folder, so the page pulls
nothing from a third party at runtime and still works offline.

## Fonts — `fonts/`

| File | Family | Licence | Source |
| --- | --- | --- | --- |
| `patrick-hand-latin.woff2`, `patrick-hand-latin-ext.woff2` | Patrick Hand, by Patrick Wagesreiter | SIL Open Font License 1.1 (`patrick-hand-OFL.txt`) | [Google Fonts](https://fonts.google.com/specimen/Patrick+Hand) |
| `nunito-latin.woff2`, `nunito-latin-ext.woff2` | Nunito, by the Nunito Project Authors | SIL Open Font License 1.1 (`nunito-OFL.txt`) | [Google Fonts](https://fonts.google.com/specimen/Nunito) |

Patrick Hand does the lettering — headings, tabs, the tags under the machines
and the tooltips on the floor. Nunito does the running text. Both are the
latin and latin-ext subsets only, straight from `fonts.gstatic.com`; the
`@font-face` rules and `unicode-range`s at the top of `style.css` are the ones
Google Fonts serves for them. Nunito is the variable file, so 400–800 all come
out of one 39 KB download.

The OFL requires the licence to travel with the font, which is what the two
`*-OFL.txt` files are for. Neither font is renamed, so there is nothing else to
do.

## Texture — `images/paper-grain.jpg`

Derived from **Paper001** on [ambientCG](https://ambientcg.com/view?id=Paper001),
which is released under **CC0 1.0** (public domain — no attribution required,
credited here anyway).

The original is a 5 MB 1K PBR material. What is in the repo is a 512×512, 37 KB
greyscale tile made from its colour map: downscaled, high-pass filtered against
a 20px blur, then normalised to sit just under white (mean 248, sd 3). That way
it can be laid over any colour with `mix-blend-mode: multiply` and only whisper
grain into it rather than darkening it. It is used twice — once fixed over the
whole page, once inside the panel cards.

To rebuild it from the original download:

```python
import numpy as np
from PIL import Image, ImageFilter
img = Image.open('Paper001_1K-JPG_Color.jpg').convert('L').resize((512, 512), Image.LANCZOS)
d = np.asarray(img, np.float32) - np.asarray(img.filter(ImageFilter.GaussianBlur(20)), np.float32)
d = np.clip(d / d.std(), -3, 3)
Image.fromarray(np.clip(249 + d * 3.2, 0, 255).astype('uint8'), 'L').convert('RGB') \
     .save('images/paper-grain.jpg', quality=90, optimize=True)
```

## Amber's art — `images/`

Cut from Amber's own generated sheets in `images/minigames/donut-works/reference/` by
`notes/donut-works-assets/slice.py`. Since 2026-10-08 the factory is seen from straight
above, so only the pictures that were already drawn from above are kept. The isometric
room plate, machines and floor dressing (`room.jpg`, `m/`, `deco/`) were removed then;
they are in git history before that date, and `slice.py` still rebuilds them.

| Path | From | Notes |
| --- | --- | --- |
| `d/*.png` | the three-donut sheet | Dough ball, raw ring, fried ring, seen from above; they go on the belts as they are, with glaze, fillings and charring drawn over them. |
| `t/*.png` | the two topping sheets | 14 of the 18 toppings. Choc chips, cereal, glitter and cheese are still drawn in code. |

## Everything else is drawn in code

The room (the quarry-tile floor in its timber wall base, the plaster round it, the hatch
to the shop), every machine, the belts, the glaze rings, the arrows and the
tags are canvas drawing in `view.js`, in the palette of her sheets: cream enamel, sage
rails, terracotta, copper and rose. The build panel's icons are drawn by the same
painters, and the build panel's timber frame is plain CSS.
