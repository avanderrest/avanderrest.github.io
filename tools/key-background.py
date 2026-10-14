"""Make the flat page round a JPEG art sheet transparent, so sheetcut.py can cut it.

    python tools/key-background.py <sheet.jpg> <out.png> [tolerance]

A design plate saved as JPEG has no alpha, and often has pale things on it (white ducks,
grey rocks, a light stone path) that a plain colour key would eat as well. So the page is
found by flooding IN FROM THE BORDER: only page-coloured pixels joined to the edge of the
picture go clear, and anything a sprite encloses survives whatever colour it is. The page
colour is read from the top-left corner; `tolerance` (default 26) is how far a pixel may be
from it, per channel. JPEG ringing leaves a pale halo round every sprite, so what is kept is
eroded by one pixel. First written for Furrow's floor sheet. Needs Pillow and NumPy.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

if len(sys.argv) < 3:
    sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
tol = int(sys.argv[3]) if len(sys.argv) > 3 else 26

a = np.array(Image.open(src).convert("RGB")).astype(np.int16)
H, W, _ = a.shape
page = a[3, 3].copy()
near = np.abs(a - page).max(axis=2) <= tol

# flood in from the border so only connected page is removed
seen = np.zeros((H, W), bool)
q = deque()
for x in range(W):
    for y in (0, H - 1):
        if near[y, x] and not seen[y, x]:
            seen[y, x] = True; q.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if near[y, x] and not seen[y, x]:
            seen[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
        if 0 <= ny < H and 0 <= nx < W and near[ny, nx] and not seen[ny, nx]:
            seen[ny, nx] = True; q.append((ny, nx))

keep = ~seen
er = keep.copy()
er[1:, :] &= keep[:-1, :]; er[:-1, :] &= keep[1:, :]
er[:, 1:] &= keep[:, :-1]; er[:, :-1] &= keep[:, 1:]
alpha = np.where(er, 255, 0).astype(np.uint8)
Image.fromarray(np.dstack([a.astype(np.uint8), alpha]), "RGBA").save(out)
print(f"{out}: {int(er.sum())} of {H * W} pixels kept (page colour {tuple(int(v) for v in page)})")
