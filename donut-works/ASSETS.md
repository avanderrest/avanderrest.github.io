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

Since 2026-10-02 the factory is isometric and drawn from Amber's own generated
sheets in `images/minigames/donut-works/reference/`, cut by
`notes/donut-works-assets/slice.py` (re-run it to rebuild everything here).

| Path | From | Notes |
| --- | --- | --- |
| `room.jpg` | `Donut factory - background (2).jpg` | The room plate, with its floor **re-laid**: her quarry tiles were hand-drawn a little off 2:1, so the script lifts out the grout and lays 75x37.5 tiles exactly on the game grid (back corner at 654, 313 — `OX`/`OY` in `view.js` must agree, and `test/donut-works/look.js` checks they do). |
| `m/*.png` | `donut factory applicances.png`, the glazer/topper/filler/counter/bin sheet, the mixer/press/turntable sheet | Mixer, press, fryer and glazing line each have an idle and a working picture (`*-on.png`). The turntable is the splitter, the wooden chute the joiner. |
| `d/*.png` | the three-donut sheet | Dough ball, raw ring, fried ring, seen from above; the game squashes them flat onto the belt and draws glaze, fillings and charring over them. |
| `t/*.png` | the two topping sheets | 14 of the 18 toppings. Choc chips, cereal, glitter and cheese are still drawn in code. |
| `deco/*.png` | the appliance sheet | Boxes of finished donuts and a tray on a little belt, dressing the floor round the work area. |
| `ui/frame.png` | `Donut factory - UI.jpg` | The walnut frame round the build panel, as a 9-slice `border-image`; the plaque's lettering is rubbed out so the page can write the open tab's name in it. |

## Everything else is drawn in code

The belts (wooden slats in a sage frame, stacked up out of their own
footprint), the glaze rings, the arrows and the tags are canvas drawing in
`view.js`.
