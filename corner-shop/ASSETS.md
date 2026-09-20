# Assets used by The Corner Shop

All of it is Amber's own art, generated as three big sheets and cut up here.
Nothing is pulled from a third party at runtime, and no CC0 pack is involved —
the asset library's notes said no free pack existed in this style and
projection (a painted cosy interior in front elevation), and that turned out
not to matter, because the room was already drawn.

The sheets live in `images/minigames/corner-shop/reference/` (gitignored), and
the scripts that cut them are in `notes/corner-shop-assets/`. Re-run any of
them from the repo root.

## Where each thing came from

| Sheet | What it gave | Cut by |
| --- | --- | --- |
| `corner shop - background.jpg` | `room.jpg`, `counter.png`, `hud/*.png` | `plate.py`, `hud.py` |
| `corner shop goods_inspyrenet.png` | `goods/*.png` — eight products | `slice.py` |
| `corner shop people_inspyrenet.png` | `people/*.png` — five characters, four poses each, plus the bag and the speech bubbles | `slice.py` |
| — | `people/mia-*.png`, `people/leo-*.png` recolours | `recolour.py` |

## `room.jpg` — the room

The painted plate with the top bar cropped off, so what is left is the room
from the bunting down: 1020×647. **The scene's logical pixels are this
image's own pixels**, which is why every position in `style.css` is a
coordinate that can be read straight off the plate with a ruler overlay rather
than a number arrived at by nudging.

Two things had to come off it, because the game draws them itself:

- **The shelf unit.** The painted one is a fixed four-by-two and the shop can
  fit up to twelve, so the wall behind it is rebuilt. The wall's stripes repeat
  every 43px (measured, not guessed), so the repair copies a clean stretch of
  the same wall indexed modulo nine whole stripe periods — that keeps the
  stripes in phase and the vertical shading exact, and leaves no seam.
- **The clock hands**, cleared with a disc of the face cream small enough to
  leave the minute ticks. The hands are CSS and go round with the day.

The bunting hangs *over* the top of the shelf unit, and its pennant colours do
not repeat, so that strip can't be copied the same way. The repair therefore
starts below the bunting and the CSS shelf unit is sized to cover what is left
behind the pennants.

## `counter.png` — the counter, in front

Customers stand on the shop floor the far side of the counter, so the counter
has to be drawn over them. This is the same room crop from y=320 down, with
alpha: everything below the counter lip is opaque, and in the band above it
only the till is kept. "Dark pixels" alone was not enough there — the window
frame is dark too — so it keeps only the dark region that runs down into the
counter.

Anything that belongs *on* the counter (the till screen, the belt, the bag,
the money) comes after this layer in the markup.

## `hud/` — the top bar

The bar is the painted one, in pieces, because the chips have to stretch to
whatever the game writes in them:

| File | Used as |
| --- | --- |
| `bar.png` | the wood, repeated across. Cut one grain period wide, so it tiles without a seam |
| `bar-left.png`, `bar-right.png` | the carved ends |
| `sign.png` | the shop name board |
| `brass.png` | Cash and Regulars |
| `paper.png` | Day, Weather, Clock, Served |
| `scroll.png` | How to play |

Each of the four plates is a CSS `border-image`, so the corners stay crisp and
only the flat middle stretches. Two things had to happen first: the bar's wood
is flood-filled away from the edges to give each plate its own alpha, and the
lettering painted on ("CASH", "DAY") is rubbed out by interpolating across the
whole band — masking only the pixels that *look* like ink leaves a ghost
wherever a letter faded into the plate.

`repeat` is the wrong `border-image` mode here: it slices the tile wherever
the edge falls and tears the frame. The flat middles use `stretch`; the ragged
paper edges use `round`.

## `goods/` — eight products

Milk, bread, eggs, apples, chocolate, fizzy pop, newspaper, biscuits — which
happen to be exactly the eight the shop opens with. The other 26 products keep
their emoji; `icoHtml()` in `game.js` picks whichever exists, so a product with
no art still draws everywhere one is asked for.

## `people/` — the cast

Five characters came off the sheet with four poses each. The poses are not the
same four for everybody — some got a side view where others got a second front
— so each file is named for what it actually is, read off a contact sheet
rather than assumed.

The shop has ten sorts of customer, so the other five are Mia and Leo in other
clothes. Their garments are each a single clean hue well away from skin, hair
and denim, so `recolour.py` selects the garment by hue, swaps the hue and
keeps every pixel's own value — the shading and the ink outline survive
untouched. Amber's own mockup does exactly this: the assistant behind the
counter is Mia in purple.

| Customer | Character |
| --- | --- |
| pensioner | Edna |
| office | Arthur |
| student | Leo |
| walker | Silas |
| driver | Mia |
| builder | Mia in hi-vis orange |
| nurse | Mia in teal |
| parent | Mia in rust |
| kid | Leo in red, stood a little smaller |
| tourist | Leo in gold |

The assistant behind the counter is Mia in purple. `faceSvg()` still builds a
face for anyone the art does not cover and stays as the fallback, so adding a
persona without art will not leave a hole.

Both sheets came out of a background remover, so every crop has the halo
killed — alpha under 24 forced to zero — before it is trimmed to its own ink.
Without that the near-transparent rim reads as grey fringe on a light panel.

## Rebuilding

```sh
python notes/corner-shop-assets/plate.py       # room.jpg, counter.png
python notes/corner-shop-assets/hud.py         # hud/*.png
python notes/corner-shop-assets/slice.py       # goods/*, people/*  (add `contact` for a contact sheet)
python notes/corner-shop-assets/recolour.py    # the re-dyed variants; run after slice.py
```

`label.py` is the finder that turned the sheets into boxes in the first place:
it flood-fills the alpha channel and prints a box per island.
