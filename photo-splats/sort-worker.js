/* Photo Splats: sorts the splats back to front off the main thread, so the view keeps
   turning while a million of them are put in order. Gets the centres once per scene,
   then a camera per request, and answers with the order (transferred, not copied). */
import { sortByDepth } from './splats.js';

let pos = null, count = 0, scene = 0;

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type === 'scene') { pos = m.pos; count = m.count; scene = m.scene; return; }
  if (m.type === 'sort' && pos && m.scene === scene) {
    const order = sortByDepth(pos, count, m.eye, m.fwd);
    self.postMessage({ type: 'order', scene, order }, [order.buffer]);
  }
};
