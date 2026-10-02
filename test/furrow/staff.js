/* Changing who works somewhere, from the workplace itself. Clicking a built workplace shows
   one picker per post: it can swap the holder for someone else, let them go, or fill an
   empty post. What breaks silently is a swap that leaves the old worker still on the books
   (two people in one post, or a ghost id in b.workers) or loses the new one's old job. */
const F = window.furrow;
F.seed(7);
F.newGame(99);
F.quickStart();
const S = F.S;
const notes = [], checks = [];
const check = (name, ok, extra) => { checks.push(ok); notes.push(name + (ok ? ' ok' : ' FAILED') + (extra ? ' (' + extra + ')' : '')); };
const work = F.B.find((b) => b && b.built && F.BT[b.type].jobs);
S.mode = 'build'; S.follow = null; S.selT = -1; S.selB = work;
const people = F.V.filter((v) => !v.gone);
for (const id of work.workers.slice()) F.assignJob(F.V.find((v) => v.id === id), null);
F.assignJob(people[0], work);
const panel = () => document.getElementById('info');
const posts = () => [...panel().querySelectorAll('.info-post')];
const pick = (i, val) => { const s = posts()[i]; s.value = String(val); s.dispatchEvent(new Event('change')); };
F.renderInfo();
check('one picker per post', posts().length === F.BT[work.type].jobs, posts().length + ' for ' + F.BT[work.type].jobs + ' jobs');
const a = people[0], other = people.find((v) => v !== a);
const otherOld = other.job;
pick(0, other.id);
check('swapping puts the new one in', work.workers.includes(other.id) && other.job === work.id, 'workers ' + work.workers.join(','));
check('and takes the old one out', !work.workers.includes(a.id) && a.job === -1, a.name + ' job ' + a.job);
check('the newcomer left their old post', otherOld < 0 || !F.B[otherOld] || !F.B[otherOld].workers.includes(other.id) || otherOld === work.id);
pick(0, '');
check('letting go empties the post', !work.workers.includes(other.id) && other.job === -1, 'workers ' + work.workers.join(','));
pick(0, a.id);
check('an empty post can be filled again', work.workers.includes(a.id) && a.job === work.id && posts()[0].value === String(a.id), 'shows ' + posts()[0].value);
return JSON.stringify({ pass: checks.every(Boolean), detail: notes.filter((s) => s.includes('FAILED')).join(' | ') + ' || ' + notes.join(' | ') });
