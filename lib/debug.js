/* The debug handle every game puts on window, for tests and the console.

     expose('__donut', { get state() { ... }, sim, verbs... });

   Sets window[name] (the name the game's tests already use) and also window.__game, so
   the test runner can find any game's handle without knowing its name. If the handle has
   a text() method, the runner prints it when a case fails: a short JSON summary of the
   game state is often enough to see what went wrong without a screenshot. */

export function expose(name, handle) {
  if (typeof window === 'undefined') return handle;
  window[name] = handle;
  window.__game = handle;
  return handle;
}
