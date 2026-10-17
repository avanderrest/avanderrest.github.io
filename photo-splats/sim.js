/* Photo Splats: the rules. Which scene is open, and the camera looking at it.

   A photo turned into splats is only right from near where it was taken: turn too far and
   you see behind things the photo never saw. So every scene carries an orbit limit, and
   the camera eases back inside it when a drag pushes past. Left alone, the view sways
   gently (the old "3D photo" look), so a visitor sees it is 3D before touching it.

   The camera is OpenCV-style like the scenes: x right, y down, z forward. A scene from a
   photo has the photo's camera at the origin looking down +z; it opens there, turning
   round a point at the subject's depth. An object scene (LGM) opens on its centre. */

// ---------- constants ----------
const DRAG_RAD_PER_PX = 0.006;
const DAMP = 6;                 // how fast a flick dies away (per second)
const SPRING = 9;               // how hard the view is pulled back inside the orbit limit
const SWAY_AFTER = 3;           // seconds untouched before the sway starts
const SWAY_FADE = 2;            // seconds for it to grow to full size
const SWAY_PERIOD = 7;          // seconds for one figure of eight
const ZOOM_MIN = 0.35, ZOOM_MAX = 2.6;
const DEG = Math.PI / 180;

export const SETTINGS = { sway: true, quality: 'light', range: 3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createSplats({ saved, on = () => {} } = {}) {
  const S = {
    settings: { ...SETTINGS, ...(saved && saved.settings) },
    last: (saved && saved.last) || null,
    scene: null,        // { id, title, made, focal, aspect, orbit, focus, centre, size, object }
    cam: blankCam(),
  };

  function blankCam() {
    return { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, dist: 1, base: 1, target: [0, 0, 1], panX: 0, panY: 0, idle: 0, t: 0, held: false };
  }

  /* open a scene: `info` from the gallery or the maker, `focus` / `centre` from the data */
  function open(info) {
    const object = !!info.object;
    const sc = {
      id: info.id, title: info.title || 'Untitled', made: info.made || 'file',
      focal: info.focal || 1.1, aspect: info.aspect || 0, object,
      orbit: (info.orbit != null ? info.orbit : object ? 180 : 22) * DEG,
      focus: info.focus || 1, centre: info.centre || [0, 0, 0], size: info.size || 1,
    };
    S.scene = sc;
    S.last = sc.id;
    reset();
    on('save');
    return sc;
  }

  function reset() {
    const c = S.cam = blankCam(), sc = S.scene;
    if (!sc) return;
    if (sc.object) { c.target = sc.centre.slice(); c.base = c.dist = sc.size * 1.1; }
    else { c.target = [0, 0, sc.focus]; c.base = c.dist = sc.focus; }
  }

  // ---------- input ----------
  function drag(dx, dy) {
    const c = S.cam;
    // the scene turns with the hand: drag right and the camera swings round to the left
    c.yaw += dx * DRAG_RAD_PER_PX; c.pitch += dy * DRAG_RAD_PER_PX;
    c.vyaw = dx * DRAG_RAD_PER_PX * 30; c.vpitch = dy * DRAG_RAD_PER_PX * 30;
    touch();
  }
  /* a press stops any spin; a release keeps the last drag's speed only if it was a flick */
  function hold(down, flick = true) {
    S.cam.held = down;
    if (down || !flick) S.cam.vyaw = S.cam.vpitch = 0;
    touch();
  }
  function zoom(factor) {
    const c = S.cam;
    c.dist = clamp(c.dist * factor, c.base * ZOOM_MIN, c.base * ZOOM_MAX);
    touch();
  }
  /* pan in screen pixels; `fpx` is the screen focal length, so a pan tracks the finger */
  function pan(dx, dy, fpx) {
    const c = S.cam, k = c.dist / (fpx || 1000);
    c.panX = clamp(c.panX - dx * k, -c.base, c.base);
    c.panY = clamp(c.panY - dy * k, -c.base, c.base);
    touch();
  }
  function touch() { S.cam.idle = 0; }
  function setSway(onOff) { S.settings.sway = !!onOff; on('save'); }
  function set(key, value) { S.settings[key] = value; on('save'); }

  // ---------- time ----------
  function step(dt) {
    const c = S.cam, sc = S.scene;
    if (!sc) return;
    c.t += dt; c.idle += dt;
    if (!c.held) {
      c.yaw += c.vyaw * dt; c.pitch += c.vpitch * dt;
      const k = Math.exp(-DAMP * dt);
      c.vyaw *= k; c.vpitch *= k;
      // past the limit, spring back (an object scene turns all the way round freely)
      const lim = sc.orbit, plim = Math.min(sc.orbit, 80 * DEG);
      const pull = 1 - Math.exp(-SPRING * dt);
      if (sc.orbit < Math.PI) {
        if (c.yaw > lim) c.yaw -= (c.yaw - lim) * pull;
        if (c.yaw < -lim) c.yaw -= (c.yaw + lim) * pull;
      }
      if (c.pitch > plim) c.pitch -= (c.pitch - plim) * pull;
      if (c.pitch < -plim) c.pitch -= (c.pitch + plim) * pull;
    }
    // hard stop well past the limit, so a wild drag cannot flip the view
    const hard = sc.orbit < Math.PI ? sc.orbit * 1.6 : Infinity;
    c.yaw = clamp(c.yaw, -hard, hard);
    c.pitch = clamp(c.pitch, -85 * DEG, 85 * DEG);
  }

  /* the sway is added on top of the pose, never into it, so it never fights a drag */
  function sway() {
    const c = S.cam, sc = S.scene;
    if (!S.settings.sway || !sc || c.held) return [0, 0];
    const grow = clamp((c.idle - SWAY_AFTER) / SWAY_FADE, 0, 1);
    if (grow <= 0) return [0, 0];
    const a = Math.min(sc.orbit * 0.45, 9 * DEG) * grow, w = (2 * Math.PI) / SWAY_PERIOD;
    return [a * Math.sin(w * c.t), a * 0.45 * Math.sin(2 * w * c.t)];
  }

  /* where the camera is and which way it faces: eye, and right / down / forward axes */
  function pose() {
    const c = S.cam, [sy, sp] = sway();
    const yaw = c.yaw + sy, pitch = c.pitch + sp;
    const cp = Math.cos(pitch);
    const fwd = [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const down = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2], fwd[0] * right[1] - fwd[1] * right[0]];
    const t = [0, 1, 2].map((k) => c.target[k] + right[k] * c.panX + down[k] * c.panY);
    const eye = [0, 1, 2].map((k) => t[k] - fwd[k] * c.dist);
    return { eye, fwd, right, down, yaw, pitch };
  }

  /* screen focal length (pixels) for a canvas: the photo fits the canvas, so the first view
     is the photo itself */
  function screenFocal(w, h) {
    const sc = S.scene;
    if (!sc) return h;
    const aspect = sc.aspect || w / h;
    const fitH = Math.min(h, w / aspect);
    return sc.focal * fitH;
  }

  function toSave() { return { settings: { ...S.settings }, last: S.last }; }

  return { S, open, reset, drag, hold, zoom, pan, touch, setSway, set, step, sway, pose, screenFocal, toSave };
}
