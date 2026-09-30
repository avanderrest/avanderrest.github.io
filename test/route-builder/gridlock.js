/* Happiness is the whole difficulty curve in Survival, and Calm mode's entire
   promise is that it never fires. Both are easy to get backwards silently: a sign
   flip in the drain formula reads as "the game never ends" in a quick playtest
   (looks relaxing!) just as easily as "the game always ends". This overloads one
   disconnected station hard enough to guarantee a real drain, then checks Survival
   actually ends the run and Calm actually does not — same overload, both modes. */
const RB = window.routeBuilder;

RB.newGame('survival');
const s1 = RB.spawnStation('house');
s1.x = 300; s1.y = 300;
for (let i = 0; i < 40; i++) RB.spawnPeg(s1.id, 'shop'); // station has no line — nobody can leave

let ticks = 0;
while (!RB.state.gameOver && ticks < 3000) { RB.tick(1, 1 / 15); ticks++; }
const survival = { over: RB.state.gameOver, happiness: RB.state.happiness, ticks };

RB.newGame('calm');
const s2 = RB.spawnStation('house');
s2.x = 300; s2.y = 300;
for (let i = 0; i < 40; i++) RB.spawnPeg(s2.id, 'shop');
RB.tick(3000, 1 / 15);
const calm = { over: RB.state.gameOver, happiness: RB.state.happiness };

const pass = survival.over && survival.happiness === 0 && !calm.over && calm.happiness === 100;
return JSON.stringify({
  pass,
  detail: `survival: gameOver=${survival.over} happiness=${survival.happiness} (${survival.ticks} ticks) — `
    + `calm: gameOver=${calm.over} happiness=${calm.happiness}`,
});
