// A Surface with its keyboard attached reports a fine main pointer, so the on-screen
// controls must come on from the first finger on the glass, not from `pointer: coarse`.
const el = document.querySelector('#touch');
const read = () => (el ? getComputedStyle(el).display : 'missing');
const before = read();
document.documentElement.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
const after = read();
const flagged = document.documentElement.classList.contains('has-touch');
return JSON.stringify({ pass: flagged && before !== after, detail: '#touch display: ' + before + ' -> ' + after + ', has-touch=' + flagged });
