/* Shared by the Node cases here. Not a case itself. */
import { prod } from '../../the-corner-shop/sim.js';

// A new shop's shelves are empty, so the cases order this to start with: the till game's
// old opening range.
export const STARTER = ['milk', 'bread', 'eggs', 'paper', 'biscuits', 'fizzy', 'choc', 'apples'];

// The shelf a box of pid should go on: one of its own with room, or else the first empty one.
export function shelfFor(shop, pid) {
  const st = shop.state;
  const own = shop.facingsOf(pid).find((i) => st.stock[i] < prod(pid).cap);
  if (own != null) return own;
  if (shop.facingOf(pid) >= 0) return -1;
  return st.slots.findIndex((p, i) => p === null || (p && !st.stock[i] && !shop.roomQty(p)));
}

// Before opening: carry everything out of the stockroom by hand, box by box, the way the
// player has to (there is no fill-everything button). Things without a shelf yet go on the
// first empty one.
export function stockUp(shop) {
  const S = () => shop.state;
  for (let t = 0; t < 600; t += 0.05) {
    const k = shop.keeper;
    if (!k.job && !k.path.length) {
      if (S().carry) {
        const i = shelfFor(shop, S().carry.pid);
        if (!(i >= 0 && shop.restock(i).ok)) shop.putDown();
      } else {
        const pid = Object.keys(S().room).find((p) => shop.roomQty(p) > 0 &&
          shelfFor(shop, p) >= 0);
        if (!pid) return t;
        shop.pickUp(pid);
      }
    }
    shop.tick(0.05);
  }
  return 600;
}
