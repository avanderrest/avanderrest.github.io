/* Twelve days and the Village Hall, for every culprit, with nothing but the rules.

   In Node, through sim.js: for each of the seven, sort every morning's pile (turning each
   envelope over first), serve every customer (sell what they want, weigh, stamp, ask
   everything, say good day), tidy the lost-and-found box on day 2, go to the first place
   open each afternoon and come home with what it turns up (the churchyard straightened
   bit by bit), leave night 11's letter sealed, and go to bed. Every day has to finish,
   all ten places have to be visited, and the Hall has to come round on day 12. There the
   ledger is filled in from its own answers (which words a player can collect is
   playthrough.js's question, in the page, where words are learnt as they are shown), and
   the fall and then each of the culprit's four statements have to be broken with
   evidence actually gathered on the way, for the right ending: justice, or for
   Beatrice, herself. Seeded dice, so a run is repeatable. */
import { createPostOffice } from '../../letters-to-ashfield/sim.js';
import { OAK as O } from '../../letters-to-ashfield/content.js';

function play(c, seed) {
  const stuck = [];
  const later = [];
  let stamp = null;
  const po = createPostOffice({ on: (ev, d) => {
    if (ev === 'later') later.push(d);
    if (ev === 'stamp') stamp = d;
  } });
  po.seedDice(seed);
  const flush = () => { for (let n = 0; n < 50 && later.length; n++) later.shift().fn(); };
  po.newGame();
  po.S.culprit = c;
  po.startDay();
  flush();

  for (let day = 1; day <= 11 && !stuck.length; day++) {
    const S = po.S;
    if (S.day !== day || S.phase !== 'morning') { stuck.push(`day ${day} began as day ${S.day}, ${S.phase}`); break; }
    if (day === 2) { po.findingsAt('drawer'); po.homeFrom('drawer'); }
    for (let guard = 0; guard < 400; guard++) {
      flush();
      const it = po.current();
      if (it) {
        if (it.back) po.noticed(it);
        if (po.sortInto(it.to) !== 'ok') { stuck.push(`day ${day}: ${it.id} would not sort`); break; }
        continue;
      }
      if (S.vis.here && S.vis.errand && !S.vis.errand.done) {
        if (!S.vis.paid) { po.give(S.vis.want.find((w) => !S.vis.given.includes(w))); continue; }
        const p = po.posting();
        if (p && !p.weighed) { po.weighItem(p); continue; }
        if (p) {
          po.give(p.kind === 'parcel' ? 'parcel' : p.cls);
          if (stamp) { const q = po.stampCheck(stamp); if (q) po.stampLand(q, stamp); stamp = null; }
          continue;
        }
      }
      if (S.vis.here) {
        const v = po.todaysVisits()[S.vis.i];
        const left = v.topics.map((_, i) => i).filter((i) => !S.vis.asked.includes(i));
        if (left.length) { po.ask(left[0]); [].concat(v.topics[left[0]][1](c)).filter(Boolean).forEach(po.show); continue; }
        po.leave();
        continue;
      }
      if (po.morningDone()) break;
      if (!later.length) po.arrive();
    }
    if (!po.morningDone()) { stuck.push(`day ${day}: the morning never finished`); break; }
    po.toAfternoon();
    if (day < 11) {
      const p = po.placesOpen()[0];
      if (p) {
        S.phase = 'visit'; S.visiting = p;
        if (p === 'church') O.churchyard(c).forEach((b) => po.show(po.straighten(b.id).text));
        else po.findingsAt(p).forEach(po.show);
        po.homeFrom(p);
      } else po.toEvening();
    } else po.leaveSealed();
    if (S.phase !== 'evening') { stuck.push(`day ${day}: evening never came (${S.phase})`); break; }
    S.phase = 'night';
    po.nextDay();
    flush();
  }

  const S = po.S;
  let ending = null;
  if (!stuck.length) {
    if (S.phase !== 'hall') stuck.push(`never reached the Hall (day ${S.day}, ${S.phase})`);
    else {
      O.ledger(c).forEach((pg) => {
        const f = {};
        po.blanksOf(pg).forEach((b) => { if (b.group) b.group.forEach((g, i) => { f[g] = b.ok[i]; }); else f[b.id] = b.ok[0]; });
        S.fills[pg.id] = f;
        po.checkPage(pg);
      });
      po.speakUp(); flush();
      const fall = ['ev_scrapes', 'ev_rail', 'ev_notice'].find((e) => S.evidence[e]);
      if (!fall) stuck.push('nothing to show the fall was no accident');
      else po.present(fall);
      flush();
      po.accuse(c);
      for (let i = 0; i < 4 && S.phase === 'hall' && S.hall.step === 'cross'; i++) {
        const ev = po.hallStatements()[S.hall.i].breaks.find((e) => S.evidence[e] && po.evUsable(e));
        if (!ev) { stuck.push(`nothing gathered breaks statement ${S.hall.i + 1}`); break; }
        po.present(ev); flush();
      }
      if (S.hall && S.hall.step === 'win') po.closeCase();
      ending = S.ending;
    }
  }
  return { c, stuck, ending, pages: Object.keys(S.solved).length, places: S.visited.length, cups: S.cups, evidence: Object.keys(S.evidence).length };
}

export default function () {
  const runs = O.SUSPECTS.map((c, i) => play(c, 11 + i));
  const problems = [];
  for (const r of runs) {
    const want = r.c === 'beatrice' ? 'self' : 'justice';
    if (r.stuck.length) problems.push(`${r.c}: ${r.stuck.join('; ')}`);
    else if (r.ending !== want) problems.push(`${r.c}: ended ${r.ending}, not ${want}`);
    if (!r.stuck.length && r.places !== 10) problems.push(`${r.c}: ${r.places} of 10 places`);
  }
  return {
    pass: !problems.length,
    detail: (problems.length ? problems.join(' | ') + ' -- ' : '') +
      runs.map((r) => `${r.c} ${r.ending || 'unfinished'} (pages ${r.pages}/5, places ${r.places}, ${r.evidence} evidence, cups ${r.cups})`).join('; '),
  };
}
