# Assets used by Marble Run

Nothing is fetched at runtime; everything else on the board (pieces, cups, bells, marbles)
is built in three.js.

| File | From | Used for |
| --- | --- | --- |
| `walnut.jpg` 336×200 | Amber's Marble Tray plate (empty case), a clean run of the bottom rail | the side panels, cards and locked level tiles |
| `leather.jpg` 256×240 | Amber's plate (dressed scene), the desk mat | the page background |
| `beech.jpg` 512² | ambientCG **Wood092** (CC0), from `images/minigames/cc0/09-textures-ambientcg/wood-fine-polished/`, resized | the pegboard and its frame, turned sideways and tinted to walnut |

The walnut and leather were cut for Marble Tray by `notes/marble-tray-assets/cut.py` (which
still writes to the old `marble-tray/assets/`) and moved here when this replaced it. The
tray's felt, knob, rings and steel plate went with it; the nameplate, brass tag and
`walnut-fine.jpg` were deleted on 2026-10-16 once the brass parts became CSS.
