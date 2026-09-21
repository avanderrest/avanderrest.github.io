# Assets used by My Little Kitchen

The pictures are all Amber's own art. She generated them as a mockup, an empty
room plate and three sprite sheets, and they're cut up here. No CC0 pack is
involved, and nothing is fetched from a third party at runtime. The two fonts
are vendored copies of the ones Donut Works already ships (SIL OFL, licences in
`assets/fonts/`).

The sources live in `images/minigames/my-little-kitchen/reference/`
(gitignored). The scripts that cut them are in `notes/my-little-kitchen-assets/`
(also gitignored). Re-run them from the repo root:

```sh
python notes/my-little-kitchen-assets/build_room.py   # room.jpg, wall.jpg
python notes/my-little-kitchen-assets/cut.py          # art/*.png
python notes/my-little-kitchen-assets/check.py out.png  # contact sheet on dark, to spot halos
python notes/my-little-kitchen-assets/ruler.py assets/room.jpg out.png [x0 y0 x1 y1] [scale]
```

## Where each thing came from

| Source | What it gave | Made by |
| --- | --- | --- |
| `My little kitchen - background.jpg` (the empty plate) | `room.jpg` | `build_room.py` |
| `My little kitchen.jpg` (the mockup) | the furnishings in `room.jpg`: jars, copper pots, hanging pans, spices, the utensil crock, the cat | `build_room.py` |
| `room.jpg`, cropped and softened | `wall.jpg`, behind every close-up | `build_room.py` |
| `My little kitchen produce_inspyrenet.png` | `art/` flour, sugar, eggs, butter, milk, chocolate, strawberry, vanilla, lemon | `cut.py` |
| `my little cafe - utensils_inspyrenet.png` | `art/` bowl, pin, loaf (the spoon, whisk, tins, mitts and potholder are there too; `cut.py` lists their numbers) | `cut.py` |
| `my little kitchen baked goods.png` | `art/card-*`: the recipe cards for cake, cupcake, cookie, pizza, gingerbread, brownies | `cut.py` |

## `room.jpg`: the kitchen

**The kitchen scene's viewBox is this picture's own 1376×768 pixels.** Every
position in `renderKitchen()` (fridge shelves, wall boards, the worktop, the
spout, the cupboard) is read off a ruler overlay, not nudged into place.

The plate is the mockup with everything movable taken out and the fridge
standing open. Squashed to the plate's width, the mockup lines up with it to
within a pixel or two on the wall, shelves and counter. So the furnishings are
lifted straight across: inside each object's box, only the pixels that
*differ* between the two pictures are taken, feathered by 1.6px. Each thing
arrives with its own shadow, and the shelf boards stay the plate's.

The banner's baked-in "MY COZY KITCHEN" and the Coins / Level line under it
are rubbed out. The ribbon is flood-filled from seeds in the gaps between
words, its letter holes are filled, and each row is repainted in that row's
own median colour. The line underneath is cut per column, starting just below
the ribbon's ink outline. The game writes its own words there: the recipe name
along the ribbon, and a cooking level under it.

The fridge stands open and the shelves have no doors, so nothing hides
anything any more:

- cold things go on the fridge shelves (ten spots);
- dry things go on the two right-hand wall boards, which the recipe book
  covered in the mockup and are empty on the plate;
- the bowl lives in the open cupboard under the counter.

`test/my-little-kitchen/stocked.js` checks that every recipe still fits.

## `wall.jpg`: behind the bench

This is the same room seen from nearer: the spice shelf, the window with its
plants, the top of the tap, and the cat asleep on the worktop. It's upscaled
2×, blurred 2.2px and washed 14% toward the wall colour, so it reads as depth
of field and the bowl in front is always the sharpest thing on screen. The
close-ups anchor it by its bottom edge, so its painted worktop lands on the SVG
bench line in every scene.

## The sprites

Each sprite takes only its own alpha island, not its bounding box, because on
the baked-goods sheet a neighbour's corner pokes into several boxes. Alpha
under 24 goes to zero to remove the background remover's halo.

In `game.js` the `ART` table swaps a sprite in for an `ICON` drawing. Each one
goes in as an `<image>` inside the same 48×48 svg every icon is, so the carry,
the flyer, the shelf buttons and `placeIcon` take it unchanged. Anything with
no art keeps its drawing. To add one, drop a PNG in `art/` and add a line to
`ART`.

**Still drawn, not painted:** yeast, salt, oil, water, honey, ginger, treacle,
cocoa, garlic, oats, banana, berries, tomato, cheese; the garlic bread, tart,
scone and flapjack cards; every topping except the strawberry; the food
itself as it bakes and gets iced.
