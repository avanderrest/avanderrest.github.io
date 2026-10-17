/* A visitor's hand on the camera, through the real verbs.

   Opens on the photo's own view (eye at the origin, looking down +z at the subject's
   depth). Drags well past the orbit limit, lets go, and the view eases back inside it
   within a second and a half; a flick coasts and dies away; a slow release does not coast.
   Zoom stays between its limits. The sway waits for the hand to leave, stays inside the
   limit, and never touches the pose itself. An object scene turns all the way round. */
import { createSplats } from '../../photo-splats/sim.js';

const DEG = Math.PI / 180;

export default function () {
  const problems = [], notes = [];
  const saves = [];
  const sim = createSplats({ on: (e) => saves.push(e) });
  sim.open({ id: 'g:test', title: 'Test', made: 'sharp', focal: 1.2, aspect: 1.5, orbit: 20, focus: 2.5 });
  sim.setSway(false);
  let p = sim.pose();
  if (Math.hypot(...p.eye) > 1e-9 || Math.abs(p.fwd[2] - 1) > 1e-9) problems.push(`first view is not the photo's: eye ${p.eye.map((v) => v.toFixed(3))}`);
  if (Math.abs(sim.screenFocal(1500, 1000) - 1200) > 1e-6) problems.push(`screen focal ${sim.screenFocal(1500, 1000)}, wanted 1200`);

  // drag hard right, hold, let go slowly: no coasting, springs back inside 20 degrees
  sim.hold(true);
  for (let i = 0; i < 40; i++) { sim.drag(12, 3); sim.step(1 / 60); }
  const pushed = sim.S.cam.yaw;
  sim.hold(false, false);
  for (let i = 0; i < 90; i++) sim.step(1 / 60);
  const settled = sim.S.cam.yaw;
  if (!(pushed > 20 * DEG)) problems.push(`a hard drag only reached ${(pushed / DEG).toFixed(1)} degrees`);
  if (!(settled <= 20.5 * DEG)) problems.push(`after 1.5 s the view sits at ${(settled / DEG).toFixed(1)} degrees, past the 20 limit`);
  notes.push(`pushed to ${(pushed / DEG).toFixed(0)}°, settled at ${(settled / DEG).toFixed(1)}°`);
  p = sim.pose();
  const toTarget = Math.hypot(...p.eye.map((v, k) => v - sim.S.cam.target[k]));
  if (Math.abs(toTarget - 2.5) > 1e-6) problems.push(`turning changed the distance to ${toTarget.toFixed(3)}`);
  // the camera still looks at the subject
  const look = p.eye.map((v, k) => v + p.fwd[k] * 2.5);
  if (Math.hypot(...look.map((v, k) => v - sim.S.cam.target[k])) > 1e-6) problems.push('the turned camera no longer looks at the subject');

  // a flick coasts, then stops
  sim.reset();
  sim.hold(true); sim.drag(6, 0); sim.hold(false, true);
  const y0 = sim.S.cam.yaw;
  for (let i = 0; i < 12; i++) sim.step(1 / 60);
  const coasted = sim.S.cam.yaw - y0;
  for (let i = 0; i < 240; i++) sim.step(1 / 60);
  if (!(coasted > 0.002)) problems.push(`a flick did not coast (${coasted.toFixed(4)})`);
  if (Math.abs(sim.S.cam.vyaw) > 1e-3) problems.push(`a flick still spinning after 4 s: ${sim.S.cam.vyaw}`);

  // zoom limits
  for (let i = 0; i < 50; i++) sim.zoom(0.8);
  const zin = sim.S.cam.dist / sim.S.cam.base;
  for (let i = 0; i < 50; i++) sim.zoom(1.25);
  const zout = sim.S.cam.dist / sim.S.cam.base;
  if (!(zin > 0.3 && zin < 0.4 && zout > 2.5 && zout < 2.7)) problems.push(`zoom ran ${zin.toFixed(2)}..${zout.toFixed(2)} of the start`);

  // the sway: waits for the hand, stays inside the limit, leaves the pose alone
  sim.reset(); sim.setSway(true);
  sim.step(1);
  const early = sim.sway();
  let most = 0;
  for (let i = 0; i < 60 * 15; i++) { sim.step(1 / 60); most = Math.max(most, Math.abs(sim.sway()[0])); }
  if (early[0] !== 0 || early[1] !== 0) problems.push('the sway started while the hand was still there');
  if (!(most > 2 * DEG && most <= 20 * DEG)) problems.push(`sway reached ${(most / DEG).toFixed(1)} degrees`);
  if (sim.S.cam.yaw !== 0) problems.push('the sway leaked into the pose');
  sim.drag(1, 0);
  if (sim.sway()[0] !== 0) problems.push('the sway kept going under the hand');
  notes.push(`sway up to ${(most / DEG).toFixed(1)}°`);

  // an object scene turns all the way round
  sim.open({ id: 'g:obj', title: 'Teapot', object: true, centre: [0, 0, 0], size: 2 });
  sim.hold(true);
  for (let i = 0; i < 200; i++) { sim.drag(10, 0); sim.step(1 / 60); }
  sim.hold(false, false);
  for (let i = 0; i < 60; i++) sim.step(1 / 60);
  if (!(sim.S.cam.yaw > Math.PI)) problems.push(`an object only turned ${(sim.S.cam.yaw / DEG).toFixed(0)} degrees`);
  if (!saves.includes('save')) problems.push('opening a scene never asked to save');

  return { pass: problems.length === 0, detail: (problems.length ? problems.join('; ') + ' | ' : '') + notes.join(', ') };
}
