# Assets used by Letters to Ashfield

All of it is Amber's own art, generated as four sheets and cut up here. Nothing
is pulled from a third party at runtime. The `cartography-pack` staged for this
game in the CC0 library was not used: it is inked map *symbols*, and she had
painted the actual village.

The sheets live in `images/minigames/letters-to-ashfield/reference/` (gitignored) and the
scripts that cut them are in `notes/letters-to-ashfield-assets/` (also gitignored). Re-run
any of them from the repo root.

## Where each thing came from

| Sheet | What it gave | Cut by |
| --- | --- | --- |
| `Letters to ashfield - background.jpg` | `desk/*` — the wood, the band, the parchment, the book's paper and spine, the pigeonhole rack, the two button plates | `crop-desk.py` |
| `Letters to ashfield.jpg` (the furnished mockup) | `desk/cal.png`, `desk/sun.png` | `crop-desk.py` |
| `letters to ashfield map assests_birefnet.png` | `map/*`, `tree/*`, `who/*` | `slice-ashfield.py` |
| `letter to ashfield letters_inspyrenet.png` | `env/*` | `slice-ashfield.py` |
| — | `who/head/*` — portraits cut out of the figures | `heads.py` |

## The desk is material, not a coordinate system

The other reskins on this site built the scene *on* the plate's own pixels. This
one deliberately does not. Ashfield is a reading game — long prose in the address
book, letters, panels — so the three columns stay responsive and the plate is cut
into **materials** that stretch and tile behind them: the wood tiles, the
parchment stretches to the map box, the book's page stretches to the column, the
rack repeats down however far the morning's post runs.

Fixing the layout to 1376×768 would have made the phone view impossible and the
prose either tiny or clipped, which is a bad trade for a game that is mostly text.

Two consequences worth knowing:

- **`wood.jpg` is a 2×2 mirror** of a clean patch of the desk, which tiles
  seamlessly in both directions. Book-matched grain reads as furniture, but the
  repeat is obvious at a small pitch, so it is laid at 760px under a fixed
  vignette rather than at its own size.
- **`page.jpg` is deliberately *not* mirrored.** Mirroring it put a fold down
  the centre of every address book entry. The paper is near-uniform, so it is
  stretched to the column instead and nothing shows.

## The village

`MAP` in `game.js` still holds the coordinates — nothing about the layout moved
into the art. What changed is that `mapArt()` returns one of her painted houses
instead of a drawn roof, and the trees are `<img>`s laid over the map rather than
`<use>`s inside it.

The SVG that remains under them is only the **land**: the green, the fields, the
water, and the lanes. The lanes stay drawn because they are curves that connect
particular houses to each other; her road sheet is straight and cornered pieces,
which cannot follow them. The green stops well short of the paper's edge so her
torn border and her compass rose both still show.

Because the sprites sit above the SVG, the map's own lettering had to be lifted
out into a second layer (`MAP_LABELS`, `z-index: 3`) above the trees and below
the houses — otherwise a tree lands on a road name and the village loses a street.

**The post van is still drawn.** Her sheet has no van, but the van is in the
writing in eight places — it brings the morning pile and it takes away what
cannot be delivered — so that one stop keeps its drawing rather than being
quietly turned into the horse and cart she did paint. The cart is on the map
where her mockup put it, at the far end.

## The envelopes say who sent them

Her sheet has four papers in stamped and unstamped versions. Which one a
correspondent gets is not decoration: the four who post — Penry, Tom, Wren,
Edith — have a stamp, and **Marion and Sam do not**, because they are both on
Front Street and bring theirs round by hand.

`plain.png` is anything addressed to the postmaster. `unsigned.png` — no stamp,
no name, one blue seal — is `p11b`, the letter on day eleven.

What lies on the counter is the **back** of the envelope, which is why the
address is on a slip beside it rather than written across the wax.

## The people

Seven figures were cast to the six villagers and the postmaster by reading a
contact sheet once, by eye. `who/head/*.png` are head-and-shoulders crops taken
from those figures: the head is *found* rather than guessed, by centring a square
on the horizontal centre of mass of the top rows.

The portraits are what the map and the address book use. Full figures at map
scale are either a smudge or taller than the house they stand beside, and her
mockup puts small portraits over the names, not people in the street.

The full figures are kept here because `notes/` is gitignored, so they are the
only copy of the cut sprites in the repo and the source `heads.py` re-reads.
